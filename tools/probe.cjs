#!/usr/bin/env node
// Probe: opens one world in headless Chromium, starts the game with the frame loop stepped by hand, and runs a
// script against it. For reproducing a report before fixing it, and for showing the same thing after.
//
//   node tools/probe.cjs --world waha --script path/to/steps.cjs [--device "iPhone 14 Pro landscape"] [--outdir out/_probe]
//                        [--page "index.html?x=1"] [--nostart 1]    (nostart: stay on the launcher / start panel)
//
// steps.cjs:  module.exports = async ({ page, shot, ev, log, cdp, touch }) => { ... }
//   ev(fn, arg)  page.evaluate;  shot(name)  a screenshot;  log(key, value)  goes into the printed JSON

const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium, devices } = require('playwright');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
function parseArgs(argv) { const out = {}; for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (!a.startsWith('--')) continue; const n = argv[i + 1]; if (n === undefined || n.startsWith('--')) out[a.slice(2)] = true; else { out[a.slice(2)] = n; i++; } } return out; }
function serve(root) {
  const server = http.createServer((req, res) => {
    let rel; try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400); res.end(); return; }
    if (rel === '/') rel = '/index.html';
    const file = path.normalize(path.join(root, rel));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  const PROJECT = path.resolve(__dirname, '..');
  const outdir = path.resolve(PROJECT, String(args.outdir || 'out/_probe'));
  fs.mkdirSync(outdir, { recursive: true });
  const touch = !!args.device;
  const ctxOpts = touch ? { ...devices[String(args.device)] } : { viewport: { width: Number(args.w || 960), height: Number(args.h || 540) }, deviceScaleFactor: 1 };
  ctxOpts.locale = 'ar';
  const server = await serve(PROJECT), port = server.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const out = { world: args.world || null, mode: touch ? 'touch' : 'desktop', log: {}, errors: [], files: [] };
  let code = 0;
  try {
    const ctx = await browser.newContext(ctxOpts);
    if (args.strict) await ctx.addInitScript({ path: path.join(__dirname, 'strict-gl.js') });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') out.errors.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => out.errors.push(String((e && e.stack) || e).slice(0, 500)));
    const shot = async (name) => { const f = path.join(outdir, name + '.png'); await page.screenshot({ path: f, timeout: 120000 }); out.files.push(f); };
    const ev = (fn, arg) => page.evaluate(fn, arg);
    const log = (k, v) => { out.log[k] = v; };
    await page.goto('http://127.0.0.1:' + port + '/' + String(args.page || 'index.html') + (args.world && !args.nostart ? '#' + args.world : ''), { waitUntil: 'load', timeout: 180000 });
    if (!args.nostart) {
      await page.waitForFunction(() => window.__READY === true && !!window.__play, null, { timeout: 240000 });
      await ev(() => { const p = window.__play; p.start = () => { p.state.running = true; }; });
      await page.click('#playPanel button');
      await page.waitForTimeout(200);
      await ev(() => { window.__play.tick(30); });
    }
    const cdp = touch ? await ctx.newCDPSession(page) : null;
    const steps = require(path.resolve(String(args.script)));
    await steps({ page, shot, ev, log, cdp, touch, ctx });
  } catch (e) { out.errors.push('probe: ' + String((e && e.stack) || e).slice(0, 800)); code = 1; }
  await browser.close(); server.close();
  console.log(JSON.stringify(out, null, 1));
  process.exit(code);
})();
