// tests/hw-tour-phone.test.cjs — v-hw-tour-phone (المالك ٦ نوفمبر: «فقط في الهواوي تخليها عادي، اذا في الهواتف الاندرويد لا تخليها»).
// حزمة com.omran.aibuilder.twa تنطلق من /?store=huawei على أيّ جهاز، فجولة «الأدوات شاشة البداية» (v-hw-tools-home) كانت تفتح
// الأدوات في كلّ هاتف أندرويد. هنا كتلة الجولة نفسها من selfdiag.js بمستند ونافذة مزيّفين: هاتف هواوي (جسر «cpu»، أو هويّة HUAWEI)
// يفتحها كما كان، وأندرويد آخر (جسر «gpu»، أو كروم بلا HUAWEI) يفتح على المحادثة، والمتصفّح ولقطات المتجر كما كانت.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const sd = read('js/selfdiag.js');
const a = sd.indexOf("if(!sessionStorage.getItem('aiapp_store_tour_s')){");
const b = sd.indexOf('else setTimeout(__openTour, 1800);', a);
const SRC = sd.slice(a, sd.indexOf('}', b) + 1);

function launch(win) {
  const ss = {}, timers = [], shown = [];
  const ids = { sectionsToolsOverlay: { classList: { add: (c) => shown.push(c) } }, prompt: { value: '' } };
  const doc = { readyState: 'complete', activeElement: null, getElementById: (id) => ids[id] || null, addEventListener() {} };
  win.__localChatsLoaded = true;
  new Function('sessionStorage', 'document', 'setTimeout', 'getCurrent', 'window', SRC)(
    { getItem: (k) => (k in ss ? ss[k] : null), setItem: (k, v) => { ss[k] = String(v); } },
    doc, (fn) => timers.push(fn), () => ({ messages: [] }), win);
  let n = 0; while (timers.length && n++ < 50) timers.shift()();
  return { opened: shown.includes('show'), flag: ss.aiapp_store_tour_s };
}
const bridge = (mode) => ({ mode: () => mode, video() {} });
const nav = (ua) => ({ userAgent: ua });
const SAMSUNG_CHROME = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const HUAWEI_WV = 'Mozilla/5.0 (Linux; Android 12; ALN-AL00 Build/HUAWEIALN-AL00; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/99.0.4844.88 Mobile Safari/537.36';

test('١. هاتف هواوي يفتح على الأدوات كما كان: جسر الحزمة «cpu»/«gpu-video»، أو هويّة HUAWEI بلا جسر', () => {
  assert.equal(launch({ OmranRender: bridge('cpu'), navigator: nav(HUAWEI_WV) }).opened, true);
  assert.equal(launch({ OmranRender: bridge('gpu-video'), navigator: nav(HUAWEI_WV) }).opened, true, 'فيديو يعمل لحظة الفتح');
  assert.equal(launch({ navigator: nav(HUAWEI_WV) }).opened, true);
  assert.equal(launch({ navigator: nav('Mozilla/5.0 (Linux; Android 12; HarmonyOS; NOH-AN00; HMSCore 6.13) AppleWebKit/537.36 Chrome/114 HuaweiBrowser/15.0 Mobile Safari/537.36') }).opened, true);
});

test('٢. أندرويد غير هواوي يفتح على المحادثة: جسر الحزمة «gpu» (صانعه ليس HUAWEI)، أو TWA في كروم — ولا يعود في الفتح نفسه', () => {
  const r = launch({ OmranRender: bridge('gpu'), navigator: nav('Mozilla/5.0 (Linux; Android 14; SM-S921B Build/UP1A; wv) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36') });
  assert.equal(r.opened, false, 'سامسونج داخل الحزمة');
  assert.equal(r.flag, '1', 'لا محاولات أخرى في هذا الفتح');
  assert.equal(launch({ navigator: nav(SAMSUNG_CHROME) }).opened, false, 'TWA في كروم بهويّة مختصرة');
  assert.equal(launch({ OmranRender: bridge('gpu'), navigator: nav(HUAWEI_WV) }).opened, false, 'الجسر أصدق من الهويّة');
});

test('٣. المتصفّح والحاسوب ولقطات المتجر (?store=huawei في Chromium مكتبيّ) كما كانت، وعطب الجسر لا يُسقط الجولة', () => {
  assert.equal(launch({ navigator: nav('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130 Safari/537.36') }).opened, true);
  assert.equal(launch({}).opened, true, 'بلا navigator');
  assert.equal(launch({ OmranRender: { mode() { throw new Error('bridge gone'); } } }).opened, true, 'السلوك القديم عند العطب');
});

test('٤. داخل فرع حزمة هواوي وحده، والوسم مرفوع', () => {
  assert.ok(a > sd.indexOf("=== 'huawei'){") && b > a);
  assert.ok(SRC.includes("if(!__hwPhone()){ sessionStorage.setItem('aiapp_store_tour_s', '1'); return; }"));
  const html = read('index.html');
  const tag = (/\/js\/selfdiag\.js\?v=([\w-]+)/.exec(html) || [])[1] || '';
  const n = Number((/(\d+)$/.exec(tag) || [])[1] || 0);
  assert.ok(n >= 12, 'selfdiag يُحمَّل منفصلًا — الوسم رُفع (v-hw-tour-phone: ١١←١٢): ' + tag);
});
