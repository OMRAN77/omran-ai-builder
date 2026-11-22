#!/usr/bin/env node
// Screenshot harness: serves the project folder on a private local port, opens a page in
// headless Chromium (software WebGL), waits for window.__READY, applies named shots via
// window.__shot(name) and saves one PNG per shot.
//
//   node tools/shot.cjs --page styles/<key>/index.html --shots hero,night,cast --outdir out/<key>
//                       [--w 1600 --h 900 --scale 2]            desktop viewport (defaults shown)
//                       [--device "iPhone 14 Pro landscape"]    emulate a phone instead of --w/--h/--scale
//                       [--suffix -mobile]                      appended to each file name
//                       [--settle 400] [--timeout 120000]
//                       [--strict 1]                            undefined shader maths gives NaN, as on real GPUs
//
// Without --shots a single PNG named "page" is taken without calling window.__shot.
// Prints a JSON summary (files, console errors, page errors, failed requests, renderer info).
// Exit code 1 when the page threw, logged console errors, or a request failed.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ttf': 'font/ttf', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8',
};

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

function serve() {
  const server = http.createServer((req, res) => {
    let rel;
    try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400); res.end(); return; }
    const file = path.normalize(path.join(ROOT, rel));
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end(); return; }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found: ' + rel); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  if (!args.page) { console.error('usage: node tools/shot.cjs --page <path under project> [--shots a,b] [--outdir dir]'); process.exit(2); }
  const outdir = path.resolve(ROOT, String(args.outdir || 'out'));
  fs.mkdirSync(outdir, { recursive: true });
  const shots = args.shots ? String(args.shots).split(',').map((s) => s.trim()).filter(Boolean) : [null];
  const suffix = args.suffix ? String(args.suffix) : '';
  const settle = Number(args.settle || 400);
  const timeout = Number(args.timeout || 120000);

  let contextOpts;
  if (args.device) {
    const d = devices[String(args.device)];
    if (!d) { console.error('unknown device "' + args.device + '"'); process.exit(2); }
    contextOpts = { ...d };
  } else {
    contextOpts = { viewport: { width: Number(args.w || 1600), height: Number(args.h || 900) }, deviceScaleFactor: Number(args.scale || 2) };
  }
  contextOpts.locale = 'ar';

  const server = await serve();
  const port = server.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const summary = { page: String(args.page), viewport: null, files: [], consoleErrors: [], pageErrors: [], failedRequests: [], info: null };
  let failed = false;
  try {
    const ctx = await browser.newContext(contextOpts);
    // --strict 1: make undefined shader maths return NaN, as real GPU drivers do (see tools/strict-gl.js)
    if (args.strict) {
      const cfg = {};
      if (args['strict-fns']) cfg.fns = String(args['strict-fns']).split(',');
      if (args['strict-only']) cfg.only = String(args['strict-only']);
      await ctx.addInitScript({ content: 'window.__STRICT_CFG = ' + JSON.stringify(cfg) + ';' });
      await ctx.addInitScript({ path: path.join(__dirname, 'strict-gl.js') });
    }
    const page = await ctx.newPage();
    summary.viewport = { ...page.viewportSize(), scale: contextOpts.deviceScaleFactor || 1 };
    page.on('console', (m) => { if (m.type() === 'error') summary.consoleErrors.push(m.text().slice(0, 400)); });
    page.on('pageerror', (e) => summary.pageErrors.push(String((e && e.stack) || e).slice(0, 600)));
    page.on('response', (r) => { if (r.status() >= 400) summary.failedRequests.push(r.status() + ' ' + r.url().replace('http://127.0.0.1:' + port, '')); });
    await page.goto('http://127.0.0.1:' + port + '/' + String(args.page).replace(/^\/+/, ''), { waitUntil: 'load', timeout });
    await page.waitForFunction(() => window.__READY === true, null, { timeout });
    await page.evaluate(() => (document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true));
    for (const name of shots) {
      if (name) await page.evaluate((n) => window.__shot(n), name);
      await page.waitForTimeout(settle);
      const file = path.join(outdir, (name || 'page') + suffix + '.png');
      await page.screenshot({ path: file });
      summary.files.push(path.relative(ROOT, file));
    }
    summary.info = await page.evaluate(() => (typeof window.__info === 'function' ? window.__info() : null));
  } catch (e) {
    failed = true;
    summary.error = String((e && e.message) || e).slice(0, 600);
  } finally {
    await browser.close();
    server.close();
  }
  if (summary.pageErrors.length || summary.consoleErrors.length || summary.failedRequests.length) failed = true;
  console.log(JSON.stringify(summary, null, 2));
  process.exit(failed ? 1 : 0);
})();
