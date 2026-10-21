// tests/floorplan-fixes.test.cjs — v-plan-limit + v-plan-contrast (تدقيق ١٨–١٩ أكتوبر، محرّر المخطّطات):
// ١) زرّ «محرّر المخطّطات» كان يعرض «تعذر تجهيز المخطط الآن. حاول مرة أخرى بعد قليل» لكلّ ردّ غير ٢٠٠،
//    فحدّ اليوم (402) والجلسة المنتهية (401) يقولان «حاول بعد قليل». الآن: 402 ← portraitLimitReached،
//    401 ← designAiNeedLogin (نصّان قائمان بالـ١٤ لغة)، والباقي planFail كما كان.
// ٢) أسماء الغرف بيضاء (#f3efe4) على لوحة الألوان الباستيليّة (تباين ~١:١). الآن داكنة بتباين WCAG ≥ 4.5
//    على كلّ لون في اللوحتين، والاسم ينزل تحت ✕ (padding-top ≥ 16px)، و✕ نفسه باقٍ (v-plan-delete).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const SRC = read('js/app-15-floorplan.js');

/** معالج الزرّ الحقيقيّ (كتلة التكامل كاملة) في vm بـfetch يردّ الحالة المطلوبة */
async function clickEditor(status, opts) {
  const o = opts || {};
  const a = SRC.indexOf('/* ───────── التكامل: زر المقاولات');
  assert.ok(a > 0, 'كتلة التكامل');
  let onClick = null;
  const btn = { textContent: '📐 محرّر', disabled: false, addEventListener: (ev, fn) => { if (ev === 'click') onClick = fn; } };
  const statusEl = { style: {}, textContent: '' };
  const els = { constructionEditorBtn: btn, constructionStatus: statusEl };
  const FP = { PROMPT: 'p', uiLng: () => o.lng || 'ar', l10nFor: (l) => (l === 'ar' ? null : { planFail: 'PLAN_FAIL_' + l }), extractSpec: () => null, renderPlan: () => '' };
  const fetched = [];
  const ctx = {
    window: { omranFloorplan: FP, addEventListener() {}, location: { origin: 'o' }, getGuestId: () => 'g', t: o.noT ? undefined : (k) => '[' + k + ']', matchMedia: () => ({ matches: false }) },
    document: { getElementById: (id) => els[id] || null, getElementsByTagName: () => [], querySelectorAll: () => [] },
    authGet: () => 'tok', __swallow() {}, console,
    fetch: async (url, init) => { fetched.push(url); if (o.throws) throw new Error('net'); return { ok: status >= 200 && status < 300, status, json: async () => ({ error: 'x' }) }; },
  };
  vm.runInNewContext(SRC.slice(a), ctx);
  assert.equal(typeof onClick, 'function', 'الزرّ مربوط');
  onClick();
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
  assert.deepEqual(fetched, ['/api/gemini']);
  assert.equal(btn.disabled, false, 'الزرّ يرجع');
  return statusEl.textContent;
}

test('١. 402 (حدّ اليوم) ← «وصلت للحد اليومي»، 401 ← «سجّل الدخول»، والباقي «حاول بعد قليل» كما كان', async () => {
  assert.equal(await clickEditor(402), '⚠️ [portraitLimitReached]');
  assert.equal(await clickEditor(401), '[designAiNeedLogin]');
  const fail = await clickEditor(500);
  assert.ok(/تعذر تجهيز المخطط/.test(fail), 'عطل عامّ = planFail: ' + fail);
  assert.ok(/تعذر تجهيز المخطط/.test(await clickEditor(0, { throws: true })), 'انقطاع الشبكة = planFail');
  assert.equal(await clickEditor(500, { lng: 'fr' }), 'PLAN_FAIL_fr', 'planFail بلغة التطبيق كما كان');
  // بلا مترجم عامّ (لا يحدث في التطبيق) يبقى نصّ planFail لا مفتاحًا خامًا
  assert.ok(/تعذر تجهيز المخطط/.test(await clickEditor(402, { noT: true })));
});

test('٢. النصّان المستعملان موجودان بالـ١٤ لغة (لا نصّ جديد)', () => {
  const core = read('js/app-03-i18n-data.js');
  for (const k of ['portraitLimitReached', 'designAiNeedLogin']) {
    assert.equal((core.match(new RegExp('\\b' + k + '\\s*:', 'g')) || []).length, 2, k + ' عربيّ وإنجليزيّ');
    for (const lg of ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh']) {
      assert.match(read('i18n/' + lg + '.js'), new RegExp('["\']?\\b' + k + '["\']?\\s*:'), k + '/' + lg);
    }
  }
});

function hexes(block) { return (block.match(/#[0-9A-Fa-f]{6}\b/g) || []).map((h) => h.toUpperCase()); }
function lum(h) {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

test('٣. اسم الغرفة ومساحتها وأبعادها مقروءة على كلّ لون غرفة (WCAG ≥ 4.5)، والاسم تحت ✕', () => {
  const p1 = SRC.slice(SRC.indexOf('  var PALETTE = {'), SRC.indexOf('  };', SRC.indexOf('  var PALETTE = {')));
  const e = SRC.indexOf("var PALETTE = {\\n", SRC.indexOf('var EDITOR_CLIENT'));
  assert.ok(e > 0, 'لوحة المحرّر');
  const p2 = SRC.slice(e, SRC.indexOf('};', e));
  const pal = [...new Set(hexes(p1).concat(hexes(p2), ['#F0EFEA']))];
  assert.ok(pal.length >= 12, 'ألوان اللوحة: ' + pal.length);
  const css = SRC.slice(SRC.indexOf('  var CSS = ['), SRC.indexOf("  ].join('');", SRC.indexOf('  var CSS = [')));
  const colorOf = (sel) => {
    const m = css.match(new RegExp("['.}]" + sel.replace('.', '\\.') + '\\{([^}]*)\\}'));
    assert.ok(m, 'قاعدة ' + sel);
    const c = m[1].match(/(?:^|;)color:(#[0-9A-Fa-f]{6})/);
    assert.ok(c, sel + ' بلا لون صريح: ' + m[1]);
    return c[1].toUpperCase();
  };
  for (const sel of ['.rn', '.ra', '.rd']) {
    const fg = colorOf(sel);
    for (const bg of pal) assert.ok(contrast(fg, bg) >= 4.5, sel + ' ' + fg + ' على ' + bg + ' = ' + contrast(fg, bg).toFixed(2));
  }
  const room = css.match(/'\.room\{([^']*)'/);
  assert.ok(room, '.room');
  const pt = room[1].match(/padding-top:(\d+)px/);
  assert.ok(pt && Number(pt[1]) >= 16, 'الاسم ينزل تحت ✕ (18px أعلى الغرفة): ' + room[1]);
  // غرفة صغيرة (حمام ٢×٢٫٥) محتواها أطول منها: «safe» يبقي الفائض في الأسفل لا فوق الاسم تحت ✕ (والمتصفّح القديم يبقى على center)
  assert.match(css, /justify-content:center;justify-content:safe center;overflow:hidden;/);
  // ✕ والحذف المباشر باقيان (v-plan-delete)
  assert.match(css, /\.rx\{position:absolute;top:1px;inset-inline-end:3px;width:18px;height:18px;/);
  assert.ok(SRC.includes('<div class="rx" data-del="1"'), '✕ في كلّ غرفة');
});

test('٤. الحزمة مبنيّة من الجزء', () => {
  const b = read('js/app.bundle.js');
  assert.ok(b.includes("if (res.status === 402) throw new Error('limit');"), 'المخطّط داخل الحزمة');
  assert.ok(b.includes(".rn{font-size:12px;font-weight:700;text-align:center;padding:0 3px;line-height:1.25;color:#1b1b1b}"), 'CSS المحرّر داخل الحزمة');
});
