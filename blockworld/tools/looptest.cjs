#!/usr/bin/env node
// Runs a world with its real, free-running frame loop (playtest.cjs steps the game by hand) and reports
// how the loop copes: frames drawn, GPU pacing, the resolution it settles on, and the black-picture guard.
//
//   node tools/looptest.cjs --page "styles/<key>/index.html?play" [--seconds 20] [--w 480 --h 270]
//                           [--break-post 1]   make the post-processing chain draw black, as on a GPU that
//                                              cannot run it: the game must notice and draw the scene directly
//                           [--strict 1]       undefined shader maths gives NaN (see strict-gl.js)
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2' };
const args = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) { const n = process.argv[i + 1]; args[process.argv[i].slice(2)] = n === undefined || n.startsWith('--') ? true : n; }
(async () => {
  const server = http.createServer((req, res) => { const f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)); fs.stat(f, (e, st) => { if (e || !st.isFile()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(f).pipe(res); }); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: Number(args.w || 480), height: Number(args.h || 270) }, deviceScaleFactor: 1, locale: 'ar' });
  if (args.strict) await ctx.addInitScript({ path: path.join(__dirname, 'strict-gl.js') });
  if (args['break-post']) {
    await ctx.route('**/postprocessing/EffectComposer.js', async (route) => {
      const file = path.join(ROOT, new URL(route.request().url()).pathname);
      const src = fs.readFileSync(file, 'utf8') + '\nEffectComposer.prototype.render = function () { const r = this.renderer; r.setRenderTarget(null); r.setClearColor(0x000000, 1); r.clear(); };\n';
      await route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: src });
    });
  }
  const page = await ctx.newPage();
  const report = { page: String(args.page), brokenPost: !!args['break-post'], errors: [] };
  page.on('pageerror', (e) => report.errors.push(String(e).slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') report.errors.push(m.text().slice(0, 300)); });
  await page.goto('http://127.0.0.1:' + server.address().port + '/' + String(args.page), { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.__READY === true && !!window.__play, null, { timeout: 240000 });
  report.gpu = await page.evaluate(() => window.__play.gpu);
  report.gpuShownOnPanel = await page.evaluate(() => { const el = document.querySelector('#playPanel .gpu'); return el ? el.textContent : null; });
  await page.click('#playPanel button');
  const t0 = Date.now(), limit = Number(args.seconds || 20) * 1000;
  let st = null;
  while (Date.now() - t0 < limit) {
    await page.waitForTimeout(1000);
    st = await page.evaluate(() => { const p = window.__play, s = p.state; return { drawn: s.drawn, safeMode: s.safeMode, pictureOk: s.pictureOk, pr: p.res.pr, time: s.time }; });
    if (args['break-post'] ? st.pictureOk : st.drawn >= 45) break;
  }
  report.seconds = (Date.now() - t0) / 1000;
  report.state = st;
  report.notice = await page.evaluate(() => { const el = [...document.body.children].find((e) => e.style && e.style.zIndex === '40'); return el && !el.hidden ? el.textContent : null; });
  const out = path.resolve(ROOT, String(args.out || 'out/_loop.png'));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const t1 = Date.now();
  await page.screenshot({ path: out, timeout: 60000 });
  report.screenshotMs = Date.now() - t1;                    // small = the GPU was not buried in queued frames
  report.screenshot = path.relative(ROOT, out);
  console.log(JSON.stringify(report, null, 2));
  await browser.close(); server.close();
})().catch((e) => { console.error(String(e && e.stack || e).slice(0, 600)); process.exit(1); });
