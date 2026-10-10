// tests/cx-brief.test.cjs — v-cx-brief (شكوى المالك: «في المقاولات كثر الاختيارات… الي يدخل
// يضيع فيه»): نموذج المقاولات ٧٧ خيارًا في ٤ أقسام قبل أيّ زرّ، وأعلى النافذة كان معرض صور لا
// يولّد شيئًا. الطبقة الأولى: سطر واحد يُقرأ على الخادم فيعبّئ الحقول ويضغط «ولّد»، والمعرض نزل
// آخر النافذة. يثبّت: حزم القارئ (لا قيمة تمرّ بلا مطابقة)، وتطابق المفاتيح مع construction-create،
// والمعالج الحقيقيّ بمزوّد مزيّف، وترتيب النافذة الجديد، والـ14 لغة.
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'synthetic-test-secret-' + 'x'.repeat(40);
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const brief = require('../api/_lib/construction-brief.js');

function fakeRes() {
  return { headers: {}, code: 0, body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.code = c; return this; },
    json(o) { this.body = o; return this; }, end() { return this; } };
}
function ownerToken() {
  const crypto = require('crypto');
  const payload = Buffer.from(JSON.stringify({ u: 'omran', exp: Date.now() + 60000 })).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(payload).digest('base64url');
}

test('١. المفاتيح مطابقة لخرائط construction-create — لا انحراف بين الملفّين', () => {
  const src = read('api/_lib/construction-create.js');
  const keysOf = (mapName) => {
    const i = src.indexOf('const ' + mapName + ' = {');
    assert.ok(i > 0, mapName + ' غير موجودة');
    const j = src.indexOf('\n};', i);
    return [...src.slice(i, j).matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]);
  };
  assert.deepEqual(brief.TYPES, keysOf('BUILDING_LABELS_AR'));
  assert.deepEqual(brief.STYLES, keysOf('STYLE_LABELS_AR'));
  assert.deepEqual(brief.ANNEXES, keysOf('ANNEX_LABELS_AR'));
  assert.deepEqual(brief.EMIRATES, keysOf('EMIRATE_LABELS_AR'));
  assert.deepEqual(brief.BUDGETS, keysOf('BUDGET_LABELS_AR'));
  // والموجّه يعرف المسار
  assert.match(read('api/tools.js'), /case 'construction-brief': return require\('\.\/_lib\/construction-brief\.js'\);/);
});

test('٢. القارئ حازم: المجهول يُسقَط، والأرقام محدودة، والمكرّر يُزال، وبلا فائدة = null', () => {
  const good = brief.parseBriefReply(JSON.stringify({
    buildingType: 'villa', floors: 2, area: 400, plotArea: 600,
    style: 'modern', budget: 'b3', emirate: 'dubai',
    annexes: ['pool', 'majlis', 'majlis', 'قصر'], notes: ' واجهة حجر ',
  }));
  assert.deepEqual(good, { buildingType: 'villa', floors: 2, area: 400, plotArea: 600, style: 'modern', budget: 'b3', emirate: 'dubai', annexes: ['pool', 'majlis'], notes: 'واجهة حجر' });

  // كلّ قيمة خارج القوائم تسقط — والنتيجة الفارغة تمامًا null لا كائن أصفار
  assert.equal(brief.parseBriefReply(JSON.stringify({ buildingType: 'castle', style: 'cyberpunk', budget: 'b9', emirate: 'riyadh', annexes: ['x'] })), null);
  assert.equal(brief.parseBriefReply('{}'), null);
  assert.equal(brief.parseBriefReply('مرحبا'), null);
  assert.equal(brief.parseBriefReply(null), null);
  // الأرقام: صفر وسالب وضخم وغير رقم كلّها تسقط
  for (const bad of [0, -3, 999999999, 'كثير', null]) {
    const r = brief.parseBriefReply(JSON.stringify({ style: 'modern', floors: bad, area: bad }));
    assert.equal(r.floors, null, 'أدوار ' + bad);
    assert.equal(r.area, null, 'مساحة ' + bad);
  }
  assert.equal(brief.parseBriefReply(JSON.stringify({ floors: 21 })), null, 'فوق حدّ الأدوار = لا شيء مفيد');
  // حقل واحد مفهوم يكفي
  assert.deepEqual(brief.parseBriefReply(JSON.stringify({ buildingType: 'mosque' })).buildingType, 'mosque');
  // الملاحظة تُقصّ
  assert.equal(brief.parseBriefReply(JSON.stringify({ style: 'gulf', notes: 'ب'.repeat(300) })).notes.length, 120);
});

test('٣. الأمر يذكر كلّ المفاتيح المسموحة ويمنع الاختراع', () => {
  const p = brief.buildBriefPrompt('فيلا دورين');
  for (const k of brief.TYPES.concat(brief.STYLES, brief.ANNEXES, brief.EMIRATES)) assert.ok(p.includes(k), 'مفتاح ناقص: ' + k);
  assert.match(p, /NEVER invent a value/);
  assert.match(p, /JSON only/);
  assert.ok(p.includes('فيلا دورين'));
  // الجملة تُقصّ على الحدّ ولا تكسر الأمر بسطر جديد
  const long = brief.buildBriefPrompt('س'.repeat(400) + '\n"خطر"');
  assert.ok(long.split('Sentence: "')[1].length <= brief.MAX_TEXT + 4);
});

test('٤. المعالج: بلا حساب لا قراءة، وبحساب يرجع الحقول، وعطب المزوّد لا يكسر', async () => {
  process.env.GEMINI_API_KEY = 'test-key';
  process.env.OWNER_USERNAMES = 'omran';
  const realFetch = global.fetch;
  const reply = (obj) => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }) });

  // بلا رمز: لا نداء مزوّد أصلًا
  let called = 0;
  global.fetch = async () => { called++; return reply({}); };
  let res = fakeRes();
  await brief({ method: 'POST', body: { text: 'فيلا دورين' } }, res);
  assert.deepEqual([res.code, res.body.fields, res.body.reason], [200, null, 'auth']);
  assert.equal(called, 0, 'لا نداء للمزوّد بلا حساب');

  // بحساب: الحقول ترجع
  global.fetch = async () => reply({ buildingType: 'villa', floors: 2, area: 400, style: 'modern', emirate: 'dubai', annexes: ['pool'] });
  res = fakeRes();
  await brief({ method: 'POST', body: { text: 'فيلا دورين ٤٠٠ متر مودرن بمسبح في دبي', token: ownerToken() } }, res);
  assert.equal(res.code, 200);
  assert.deepEqual(res.body.fields.buildingType, 'villa');
  assert.deepEqual(res.body.fields.annexes, ['pool']);

  // نصّ فارغ = 400 بلا نداء
  res = fakeRes();
  await brief({ method: 'POST', body: { text: '   ', token: ownerToken() } }, res);
  assert.equal(res.code, 400);

  // عطب المزوّد = fields:null لا انهيار
  global.fetch = async () => { throw new Error('down'); };
  res = fakeRes();
  await brief({ method: 'POST', body: { text: 'فيلا', token: ownerToken() } }, res);
  assert.deepEqual([res.code, res.body.fields, res.body.reason], [200, null, 'unclear']);
  global.fetch = realFetch;
});

test('٥. الواجهة: السطر أعلى النافذة، والمعرض نزل آخرها', () => {
  const b = read('js/app-15-cx-brief.js');
  const g = read('js/app-15-cx-ideas.js');
  // السطر يأخذ مكان الصدارة الذي أخلاه المعرض
  assert.match(b, /desc\.insertAdjacentElement\('afterend', box\);/);
  assert.match(b, /modal\.querySelector\('\[data-i18n="constructionDesc"\]'\)/);
  // المعرض بعد النتيجة وزواياها، وبمرساة احتياطيّة لا تسقط
  assert.match(g, /var tail = \$\('constructionViewsSection'\) \|\| \$\('constructionPlanText'\) \|\| desc;/);
  assert.match(g, /tail\.insertAdjacentElement\('afterend', box\);/);
  assert.ok(!/desc\.insertAdjacentElement\('afterend', box\)/.test(g), 'لم تبقَ المرساة القديمة');
  // يملأ الحقول القائمة ولا يلمس منطق التوليد: يضغط الزرّ نفسه
  for (const id of ['constructionType', 'constructionStyle', 'constructionBudget', 'constructionEmirate', 'constructionFloors', 'constructionArea', 'constructionPlot']) {
    assert.ok(b.includes("'" + id + "'"), 'حقل غير معبَّأ: ' + id);
  }
  assert.match(b, /\$\('constructionRunBtn'\)/);
  assert.match(b, /btn && !btn\.disabled\) btn\.click\(\)/);
  assert.match(b, /class="mini-mic-btn" data-target="cxBriefText"/, 'المايك المشترك لا مايك جديد');
  // الحزمة مبنيّة
  assert.ok(read('js/app.bundle.js').includes("box.id = 'cxBrief'"), 'الجزء داخل الحزمة');
});

test('٦. النصوص بالـ14 لغة وبلا اسم مزوّد', () => {
  const src = read('js/app-15-cx-brief.js');
  const i = src.indexOf('var TX = {');
  const j = src.indexOf('\n  };', i);
  const ctx = {};
  vm.runInNewContext(src.slice(i, j + 4) + '\nthis.TX = TX;', ctx);
  const LANGS = ['ar', 'en', 'fr', 'es', 'tr', 'ru', 'hi', 'ur', 'bn', 'ne', 'fil', 'id', 'zh', 'ml'];
  const keys = Object.keys(ctx.TX);
  assert.ok(keys.length >= 7, 'مفاتيح النصوص: ' + keys.length);
  for (const k of keys) {
    assert.deepEqual(Object.keys(ctx.TX[k]).sort(), LANGS.slice().sort(), 'لغات ناقصة في: ' + k);
    for (const l of LANGS) {
      assert.ok(String(ctx.TX[k][l]).trim(), 'فارغ: ' + k + '/' + l);
      assert.ok(!/veo|runway|minimax|gemini|claude|gpt/i.test(ctx.TX[k][l]), 'اسم مزوّد في ' + k + '/' + l);
    }
  }
  assert.ok(ctx.TX.got.ar.includes('{s}'), 'ملخّص «فهمت» فيه المتغيّر');
});
