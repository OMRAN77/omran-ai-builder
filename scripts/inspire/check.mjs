#!/usr/bin/env node
// scripts/inspire/check.mjs — يفتح تجربة مبنيّة في Chromium بخرائط الاختبار (fixture.mjs) بدل الشبكة، ويتحقّق:
// لا أخطاء صفحة، الخريطة حُمّلت (__ck_ready)، المشهد مرسوم فعلًا (تباين بكسلات)، ثمّ لقطات حاسوب وجوّال وصورة بطاقة 600×360.
// الاستعمال: node scripts/inspire/check.mjs inspire/city/<id>.html [--out dir] [--eval "JS"] [--wait ms] [--thumb assets/inspire/city/<id>.jpg]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { makeFixture } from './fixture.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(ROOT, 'package.json'));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const file = path.resolve(ROOT, args[0]);
const out = path.resolve(opt('out', path.join(os.tmpdir(), 'inspire-check', path.basename(file, '.html'))));
const EVAL = opt('eval', ''); const WAIT = +opt('wait', 2500); const THUMB = opt('thumb', '');
fs.mkdirSync(out, { recursive: true });
function threeJs() {
  const cands = [process.env.THREE_JS, path.join(ROOT, 'node_modules/three/build/three.min.js'), path.join(os.tmpdir(), 'inspire-three/package/build/three.min.js')].filter(Boolean);
  for (const c of cands) if (fs.existsSync(c)) return c;
  const dir = path.join(os.tmpdir(), 'inspire-three'); fs.mkdirSync(dir, { recursive: true });
  execSync('npm pack three@0.160.0 --silent', { cwd: dir }); execSync('tar xzf three-0.160.0.tgz', { cwd: dir });
  return path.join(dir, 'package/build/three.min.js');
}
let pw; try { pw = require('playwright'); } catch (e) { pw = require('playwright-core'); }
const THREE_SRC = fs.readFileSync(threeJs(), 'utf8');
const { PNG } = require('pngjs');
const browser = await pw.chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const report = { file: path.relative(ROOT, file), runs: [] };
for (const [name, vp, mobile] of [['desktop', { width: 1200, height: 720 }, false], ['mobile', { width: 400, height: 860 }, true]]) {
  const ctx = await browser.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1, locale: 'ar' });
  const page = await ctx.newPage();
  const errors = [], logs = [];
  page.on('pageerror', (e) => errors.push(String(e && e.stack || e)));
  page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
  await page.route('**/*', async (route) => {
    const u = route.request().url();
    if (/three(@|\/)[\d.]+\/build\/three\.min\.js|three\.min\.js/.test(u)) return route.fulfill({ status: 200, contentType: 'application/javascript', body: THREE_SRC });
    if (/overpass/.test(u)) {
      const body = decodeURIComponent(String(route.request().postData() || '').replace(/^data=/, ''));
      const m = body.match(/around:(\d+),(-?[\d.]+),(-?[\d.]+)/);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeFixture(m ? +m[2] : 25.08, m ? +m[3] : 55.14, m ? +m[1] : 600)) });
    }
    if (/nominatim/.test(u)) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ lat: '24.699', lon: '46.685', display_name: 'اختبار' }]) });
    if (/photon\.komoot/.test(u)) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ features: [{ geometry: { coordinates: [46.685, 24.699] }, properties: { name: 'اختبار' } }] }) });
    if (/^https?:\/\/(fonts\.|cdn\.|unpkg)/.test(u)) return route.fulfill({ status: 200, body: '' });
    if (u.startsWith('file:')) return route.continue();
    return route.fulfill({ status: 404, body: '' });
  });
  await page.goto('file://' + file);
  try { await page.waitForFunction(() => window.__ck_ready >= 1 || window.__ck_error, null, { timeout: 20000 }); } catch (e) { errors.push('timeout waiting for __ck_ready'); }
  await page.waitForTimeout(WAIT);
  let evalResult = null;
  if (EVAL) { try { evalResult = await page.evaluate(EVAL); } catch (e) { errors.push('eval: ' + e.message); } await page.waitForTimeout(800); }
  const shot = path.join(out, name + '.png');
  const buf = await page.screenshot({ path: shot });
  const png = PNG.sync.read(buf); const seen = new Set(); let sum = 0, sum2 = 0, n = 0;
  for (let y = 0; y < png.height; y += 7) for (let x = 0; x < png.width; x += 7) { const i = (y * png.width + x) * 4; const v = png.data[i] * 0.3 + png.data[i + 1] * 0.59 + png.data[i + 2] * 0.11; sum += v; sum2 += v * v; n++; seen.add((png.data[i] >> 4) + ',' + (png.data[i + 1] >> 4) + ',' + (png.data[i + 2] >> 4)); }
  const variance = sum2 / n - (sum / n) ** 2;
  const state = await page.evaluate(() => ({ ready: window.__ck_ready || 0, error: window.__ck_error || '', buildings: window.CityKit && window.CityKit.lastCount, extra: window.__inspire_state || null }));
  report.runs.push({ name, errors, consoleErrors: logs.filter((l) => !/deprecated|WEBGL_debug|GPU stall|three\.min\.js/i.test(l)), state, evalResult, variance: Math.round(variance), colours: seen.size, shot });
  if (name === 'desktop' && THUMB) {
    const t = await browser.newPage({ viewport: { width: 1200, height: 720 } });
    await page.screenshot({ path: path.join(out, 'thumb-src.png') });
    await t.setContent('<body style="margin:0"><img id=i src="data:image/png;base64,' + buf.toString('base64') + '" style="width:600px;height:360px;object-fit:cover;display:block"></body>');
    await t.setViewportSize({ width: 600, height: 360 });
    await t.waitForTimeout(150);
    fs.mkdirSync(path.dirname(path.resolve(ROOT, THUMB)), { recursive: true });
    await t.screenshot({ path: path.resolve(ROOT, THUMB), type: 'jpeg', quality: 78 });
    await t.close();
  }
  await ctx.close();
}
await browser.close();
const ok = report.runs.every((r) => !r.errors.length && r.state.ready >= 1 && !r.state.error && r.variance > 120 && r.colours > 40);
report.ok = ok;
console.log(JSON.stringify(report, null, 1));
process.exit(ok ? 0 : 1);
