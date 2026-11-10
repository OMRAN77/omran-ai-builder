'use strict';
/* v-audit-sw — فحص التطبيق الشامل، عنقود «عامل الخدمة»: sw.js الحقيقيّ يُشغَّل في node:vm ببيئة عامل مزيّفة
   (self/caches/fetch)، والطلبات كائنات بسيطة تحمل url وmode وmethod كما يراها مُعالج fetch.
   cli-boot-1: مقاطع البثّ من أصول أخرى والوسائط وffmpeg-core.wasm كانت تُكتب في كاش القشرة بلا سقف ولا تنظيف.
   cli-boot-2: شرط «بلا استعلام» منع تخبئة الحزمة وCSS ذات ‎?v=‎، فبلا اتّصال يردّ العامل index.html مكان السكربت.
   cli-boot-7: مسار القشرة جلب كلّ ما ليس صورة بـno-store فتجاوز كاش المتصفّح (ffmpeg-core.wasm ٣٢ م.ب كلّ جلسة). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const ORIGIN = 'https://om.test';
const SHELL = 'shell-' + SRC.match(/BUILD_ID\s*=\s*'([^']+)'/)[1];

const abs = (u) => new URL(typeof u === 'string' ? u : u.url, ORIGIN + '/sw.js').href;
const V = (t) => '?v=' + t; // الوسم يُبنى لا يُكتب حرفيًّا (سقّاطة vPinTests)
const noSearch = (u) => { const x = new URL(u); x.search = ''; return x.href; };

class FakeCache {
  constructor() { this.entries = []; }
  _find(r, opts) {
    const u = abs(r), ign = !!(opts && opts.ignoreSearch);
    return this.entries.filter((e) => (ign ? noSearch(e.req.url) === noSearch(u) : e.req.url === u));
  }
  async match(r, opts) { const hit = this._find(r, opts)[0]; return hit ? hit.res.clone() : undefined; }
  async keys(r, opts) { return (r === undefined ? this.entries : this._find(r, opts)).map((e) => e.req); }
  async put(r, res) {
    const req = typeof r === 'string' ? mkReq(r) : Object.assign({}, r, { url: abs(r) });
    this.entries = this.entries.filter((e) => e.req.url !== req.url);
    this.entries.push({ req, res });
  }
  async delete(r, opts) { const n = this.entries.length; const gone = new Set(this._find(r, opts)); this.entries = this.entries.filter((e) => !gone.has(e)); return this.entries.length !== n; }
  async add(u) { const req = mkReq(u); const res = await env.fetch(req); if (!res.ok) throw new Error('add ' + res.status); await this.put(req, res); }
  urls() { return this.entries.map((e) => e.req.url); }
}

function mkReq(u, mode, method) { return { url: abs(u), mode: mode || 'cors', method: method || 'GET', destination: '' }; }

/* بيئة جديدة لكلّ اختبار: sw.js يُقيَّم من جديد فلا تتسرّب حالة بين الاختبارات. */
let env;
function boot(opts) {
  const o = opts || {};
  const stores = new Map();
  const handlers = {};
  const fetchLog = [];
  env = {
    online: true,
    body: (u) => 'body:' + u,
    fetchLog, stores,
    fetch: async (req, init) => {
      fetchLog.push({ url: abs(req), init: init || null });
      if (!env.online) throw new TypeError('Failed to fetch');
      const u = abs(req);
      const type = /\.css(\?|$)/.test(u) ? 'text/css' : /\.js(\?|$)/.test(u) ? 'text/javascript' : /\.wasm(\?|$)/.test(u) ? 'application/wasm' : 'text/html';
      return new Response(env.body(u), { status: 200, headers: { 'Content-Type': type } });
    },
  };
  const caches = {
    async open(n) { if (!stores.has(n)) stores.set(n, new FakeCache()); return stores.get(n); },
    async keys() { return [...stores.keys()]; },
    async delete(n) { return stores.delete(n); },
  };
  const self = {
    location: new URL(ORIGIN + '/sw.js'),
    registration: { active: o.update ? {} : null, showNotification: async () => {} },
    clients: { claim: async () => {}, matchAll: async () => [], openWindow: async () => {} },
    skipWaiting: async () => {},
    addEventListener: (t, fn) => { handlers[t] = fn; },
  };
  const ctx = vm.createContext({ self, caches, fetch: (r, i) => env.fetch(r, i), Response, URL, console: { warn() {}, error() {}, log() {} } });
  vm.runInContext(SRC, ctx, { filename: 'sw.js' });
  env.handlers = handlers;
  env.caches = caches;
  return env;
}

async function lifecycle(type) {
  let p = null;
  env.handlers[type]({ waitUntil: (x) => { p = x; } });
  await p;
}

/* يرجع { handled, res }: handled=false يعني أنّ العامل ترك الطلب للمتصفّح (لا respondWith). */
async function get(u, mode) {
  const req = mkReq(u, mode);
  let p = null;
  const life = [];
  env.handlers.fetch({ request: req, respondWith: (x) => { p = x; }, waitUntil: (x) => { life.push(x); } });
  const res = p ? await p : null;
  await Promise.all(life);
  return { handled: !!p, res };
}

const shellUrls = async () => (await env.caches.open(SHELL)).urls();

test('cli-boot-1: مقاطع البثّ من أصل آخر وffmpeg-core.wasm وفيديو الأصل لا تُكتب في كاش القشرة ولا يمسكها العامل', async () => {
  boot();
  for (let i = 1; i <= 5; i++) await get('https://live.alarabiya.net/alarabiya/seg-' + i + '.ts');
  await get('https://live.alarabiya.net/alarabiya/index.m3u8');
  const wasm = await get('/ffmpeg/core/ffmpeg-core.wasm');
  const mp4 = await get('/assets/fashionai_ar.mp4');
  const urls = await shellUrls();
  assert.deepEqual(urls.filter((u) => !u.startsWith(ORIGIN)), [], 'لا مفتاح من أصل آخر في القشرة');
  assert.ok(!urls.some((u) => /\.(ts|m3u8|wasm|mp4)$/.test(u)), 'لا وسائط ولا wasm في القشرة: ' + urls.join(' '));
  assert.equal(wasm.handled, false, 'ffmpeg-core.wasm يُترك للمتصفّح وكاشه (immutable)');
  assert.equal(mp4.handled, false, 'الفيديو يُترك للمتصفّح');
  const seg = await get('https://live.alarabiya.net/alarabiya/seg-9.ts');
  assert.equal(seg.handled, false, 'طلب أصل آخر لا يمرّ بمسار القشرة');
});

test('cli-boot-1: التولّي يكنس من القشرة الحاليّة (BUILD_ID لا يتغيّر مع النشر) ما خبّأه المسار القديم، ويُبقي القشرة', async () => {
  boot({ update: true });
  const shell = await env.caches.open(SHELL);
  const ok = (s) => new Response(s, { status: 200 });
  await shell.put(mkReq('./'), ok('root'));
  await shell.put(mkReq('./index.html'), ok('index'));
  await shell.put(mkReq('/js/app.bundle.js'), ok('bundle-precache'));
  for (let i = 1; i <= 3; i++) await shell.put(mkReq('https://live.alarabiya.net/alarabiya/seg-' + i + '.ts'), ok('seg'));
  await shell.put(mkReq('/ffmpeg/core/ffmpeg-core.wasm'), ok('wasm'));
  await shell.put(mkReq('/ffmpeg/core/ffmpeg-core.js'), ok('corejs'));
  await shell.put(mkReq('/media/samples/tutorial-ar.mp4'), ok('mp4'));
  await shell.put(mkReq('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.min.mjs'), ok('pdf'));
  await shell.put(mkReq('/?gtoken=abc', 'navigate'), ok('tok'));
  await shell.put(mkReq('/js/app.bundle.js' + V('aaaaaaaa')), ok('old'));
  await shell.put(mkReq('/js/app.bundle.js' + V('bbbbbbbb')), ok('new'));
  await shell.put(mkReq('/css/tokens.css' + V('739')), ok('css'));
  await lifecycle('activate');
  assert.deepEqual((await shellUrls()).sort(), [
    ORIGIN + '/', ORIGIN + '/css/tokens.css' + V('739'), ORIGIN + '/index.html', ORIGIN + '/js/app.bundle.js' + V('bbbbbbbb'),
  ].sort());
});

test('cli-boot-2: بلا اتّصال تُخدم الحزمة وCSS وpartials ذات ‎?v=‎ من الكاش بنوعها — لا index.html مكانها', async () => {
  boot();
  await lifecycle('install');
  const assets = ['/js/app.bundle.js' + V('b620f13d'), '/js/partials-core.js' + V('675'), '/css/tokens.css' + V('739'), '/i18n/en.js' + V('12')];
  for (const u of assets) await get(u);
  await get('/', 'navigate');
  env.online = false;
  for (const u of assets) {
    const r = await get(u);
    assert.ok(r.handled && r.res && r.res.ok, u + ' يُخدم بلا اتّصال');
    assert.equal(await r.res.text(), 'body:' + abs(u), u + ' بمحتواه لا بنسخة index.html');
    assert.doesNotMatch(r.res.headers.get('content-type') || '', /html/, u + ' ليس text/html');
  }
  const nav = await get('/', 'navigate');
  assert.equal(await nav.res.text(), 'body:' + ORIGIN + '/', 'التنقّل يُخدم من القشرة');
});

test('cli-boot-2: زيارة أولى ثمّ انقطاع — الحزمة المخزّنة مسبقًا بلا وسم تجيب طلبها ذا البصمة', async () => {
  boot();
  await lifecycle('install'); // الصفحة الأولى لم يكن يتحكّم بها العامل، فطلب ‎?v=‎ لم يمرّ به قطّ
  env.online = false;
  const r = await get('/js/app.bundle.js' + V('b620f13d'));
  assert.ok(r.res && r.res.ok);
  assert.equal(await r.res.text(), 'body:' + ORIGIN + '/js/app.bundle.js', 'نسخة التخزين المسبق لا index.html');
});

test('cli-boot-2: ملفّ فرعيّ بلا نسخة مخزّنة → خطأ شبكة لا index.html، والتنقّل وحده يسقط على القشرة', async () => {
  boot();
  await lifecycle('install');
  env.online = false;
  const js = await get('/js/never-seen.js' + V('1'));
  assert.equal(js.res.type, 'error', 'Response.error() لا صفحة HTML تُرفض كسكربت');
  const nav = await get('/owner', 'navigate');
  assert.equal(await nav.res.text(), 'body:' + ORIGIN + '/index.html', 'التنقّل يسقط على index.html كما كان');
});

test('cli-boot-2: v-sec-sw-token باقٍ — تنقّل باستعلام وملفّ باستعلام غير ‎?v=‎ لا يُخبّآن، ونسخة ‎?v=‎ جديدة تحلّ محلّ القديمة', async () => {
  boot();
  await get('/?gtoken=abc', 'navigate');
  await get('/?resetToken=xyz', 'navigate');
  await get('/js/x.js?token=abc');
  await get('/js/app.bundle.js' + V('aaaaaaaa'));
  await get('/js/app.bundle.js' + V('bbbbbbbb'));
  const urls = await shellUrls();
  assert.ok(!urls.some((u) => /token/i.test(u)), 'لا رمز في مفتاح كاش: ' + urls.join(' '));
  assert.deepEqual(urls.filter((u) => /app\.bundle/.test(u)), [ORIGIN + '/js/app.bundle.js' + V('bbbbbbbb')], 'نسخة واحدة لكلّ مسار — لا تتكدّس حزم الإصدارات');
});

test('cli-boot-7: no-store للتنقّل وindex.html وحدهما؛ الأصول ذات البصمة تحترم Cache-Control، وffmpeg يُترك للمتصفّح', async () => {
  boot();
  await get('/', 'navigate');
  await get('/index.html');
  await get('/js/app.bundle.js' + V('b620f13d'));
  await get('/css/tokens.css' + V('739'));
  const core = await get('/ffmpeg/core/ffmpeg-core.js');
  const worker = await get('/ffmpeg/lib/worker.js');
  const wasm = await get('/ffmpeg/core/ffmpeg-core.wasm');
  const mode = (u) => { const f = env.fetchLog.find((x) => x.url === ORIGIN + u); return f ? ((f.init && f.init.cache) || 'default') : 'none'; };
  assert.equal(mode('/'), 'no-store');
  assert.equal(mode('/index.html'), 'no-store');
  assert.equal(mode('/js/app.bundle.js' + V('b620f13d')), 'default', 'الحزمة بالبصمة من كاش المتصفّح لا تُنزَّل ٤٫٥ م.ب كلّ مرّة');
  assert.equal(mode('/css/tokens.css' + V('739')), 'default');
  for (const [r, n] of [[core, 'ffmpeg-core.js'], [worker, 'worker.js'], [wasm, 'ffmpeg-core.wasm']]) {
    assert.equal(r.handled, false, n + ' لا يمرّ بالعامل (immutable سنة في كاش المتصفّح)');
  }
  assert.ok(!(await shellUrls()).some((u) => /\/ffmpeg\//.test(u)), 'ولا يُكتب في القشرة');
});

test('v-audit-sw: sw.js يُحلَّل ويُبقي ثوابته (‏/p|i|f لا تُلمس، API بلا اتّصال 503 JSON)', async () => {
  boot();
  const pdf = await get('/p/abc123');
  assert.equal(pdf.handled, false);
  env.online = false;
  const api = await get('/api/ai?action=x');
  assert.equal(api.res.status, 503);
  assert.equal(JSON.parse(await api.res.text()).error, 'offline');
});
