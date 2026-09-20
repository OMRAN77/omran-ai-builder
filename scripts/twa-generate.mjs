#!/usr/bin/env node
// scripts/twa-generate.mjs — يولّد مشروع أندرويد (Trusted Web Activity) لحزمة متجر هواوي في store/huawei/twa
// من البيان manifest-huawei.json بالمولّد الرسميّ @bubblewrap/core (القالب نفسه الذي يستعمله Bubblewrap CLI)،
// بلا شبكة: الأيقونات تُقرأ من المستودع عبر خادم محلّيّ. البناء والتوقيع في GitHub Actions
// (.github/workflows/android-release.yml) حيث Android SDK جاهز.
//
//   npm i --no-save @bubblewrap/core
//   node scripts/twa-generate.mjs [--version 1.3.10] [--code 20260918] [--out store/huawei/twa] [--core path]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const VERSION = String(opt('version', '1.3.10'));
const CODE = Number(opt('code', 20260918));
const OUT = path.resolve(ROOT, String(opt('out', 'store/huawei/twa')));
const HOST = 'omran-ai-builder.vercel.app';
const PACKAGE_ID = 'com.omran.aibuilder.twa'; // اسم الحزمة المسجّل في AppGallery Connect (لا com.omran.aibuilder — ذاك اسم حزمة APKPure)

const req = createRequire(pathToFileURL(path.join(ROOT, 'package.json')).href);
let corePath = opt('core', '');
if (!corePath) { try { corePath = path.dirname(req.resolve('@bubblewrap/core/package.json')); } catch (e) { /* يُطلب أدناه */ } }
if (!corePath) { console.error('ثبّت المولّد أوّلًا: npm i --no-save @bubblewrap/core (أو مرّر --core مساره)'); process.exit(2); }
const core = req(corePath);
const { TwaGenerator, TwaManifest, ConsoleLog, asOrientation } = core;
core.fetchUtils.setFetchEngine('node-fetch'); // fetch-h2 يبقي اتّصالاته مفتوحة فلا تنتهي العمليّة، والخادم محلّيّ

const web = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest-huawei.json'), 'utf8'));
const TYPES = { '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };
const srv = http.createServer((rq, rs) => {
  const p = decodeURIComponent(new URL(rq.url, 'http://x').pathname);
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); rs.end(); return; }
  rs.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(rs);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + srv.address().port;
const iconSrc = (purpose, size) => {
  const ic = web.icons.find((i) => i.sizes === size && (i.purpose || 'any') === purpose) || web.icons.find((i) => i.sizes === size);
  return base + '/' + ic.src.split('?')[0];
};

try {
  const manifest = new TwaManifest({
    packageId: PACKAGE_ID,
    host: HOST,
    name: web.name,
    launcherName: 'عمران AI',
    display: web.display,
    themeColor: web.theme_color,
    themeColorDark: web.theme_color,
    navigationColor: web.theme_color,
    navigationColorDark: web.theme_color,
    navigationDividerColor: web.theme_color,
    navigationDividerColorDark: web.theme_color,
    backgroundColor: web.background_color,
    enableNotifications: true,
    startUrl: web.start_url,
    iconUrl: iconSrc('any', '512x512'),
    maskableIconUrl: iconSrc('maskable', '512x512'),
    splashScreenFadeOutDuration: 300,
    signingKey: { path: 'release.keystore', alias: 'omran' },
    appVersionCode: CODE,
    appVersion: VERSION,
    shortcuts: [],
    generatorApp: 'omran-ai-builder/scripts/twa-generate.mjs',
    fallbackType: 'webview',
    enableSiteSettingsShortcut: true,
    isChromeOSOnly: false,
    orientation: asOrientation(web.orientation) || 'default',
    fingerprints: [],
  });
  const err = manifest.validate();
  if (err) throw new Error('بيان TWA غير صالح: ' + err);
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  await new TwaGenerator().createTwaProject(OUT, manifest, new ConsoleLog('twa'));
  await manifest.saveToFile(path.join(OUT, 'twa-manifest.json'));
  // التوليد يشير إلى الأيقونات بخادم محلّيّ مؤقّت — في البيان المحفوظ نكتب عناوينها الحقيقيّة
  const tm = JSON.parse(fs.readFileSync(path.join(OUT, 'twa-manifest.json'), 'utf8'));
  for (const k of ['iconUrl', 'maskableIconUrl']) if (tm[k]) tm[k] = tm[k].replace(base, 'https://' + HOST);
  tm.webManifestUrl = 'https://' + HOST + '/manifest-huawei.json';
  fs.writeFileSync(path.join(OUT, 'twa-manifest.json'), JSON.stringify(tm, null, 2) + '\n');
  // jcenter مغلق — Maven Central بدله
  for (const f of ['build.gradle']) {
    const p = path.join(OUT, f); fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/jcenter\(\)/g, 'mavenCentral()'));
  }
  fs.chmodSync(path.join(OUT, 'gradlew'), 0o755);
  console.log('✓ مشروع TWA في ' + path.relative(ROOT, OUT) + ' — ' + PACKAGE_ID + ' ' + VERSION + ' (' + CODE + ') يبدأ من https://' + HOST + web.start_url);
} finally {
  srv.close();
}
process.exit(0);
