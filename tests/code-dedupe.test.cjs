'use strict';
/* v-code-dedupe (المالك ٣٠ سبتمبر: «كمل على نسخ آلة الزمن»): كلّ إصدار كود كان يُكتب في IndexedDB مرّتين أو ثلاثًا — في رسالة
   البناء (m.code) وفي لقطة آلة الزمن (بالنصّ نفسه، pushCodeSnapshot)، والحاليّ في p.code أيضًا. مسبار حساب ثقيل (٤٠ محادثة،
   ١٤ تطبيقًا بثمانية إصدارات): السجلّ ٤٥٫٥ ← ٢٤٫٧ م.ب، والذاكرة بعد الإقلاع ١٠٧ ← ٦٦ م.ب، وكلّ نسخة تعود كما كانت.
   هنا الحفظ الحقيقيّ (__vaultSave) والقراءة (__codeExpand) في vm. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const src = fs.readFileSync('js/app-04-i18n-state.js', 'utf8');
const boot = fs.readFileSync('js/app-09-attach.js', 'utf8');
const slice = (from, to) => { const i = src.indexOf(from), j = src.indexOf(to, i); assert.ok(i >= 0 && j > i, from); return src.slice(i, j); };

function box(projects) {
  const writes = [];
  const sb = {
    state: { projects, currentId: 'none' }, JSON, Object, Array, String, Promise, Math, Map, Set,
    Date: { now: () => 0 }, setTimeout, __swallow: () => {},
    __vaultAssign: () => [], idbImgPutAll: () => Promise.resolve(),
    idbSet: (k, v) => { writes.push(v); return Promise.resolve(); },
    getCurrent: () => null, __vaultRelease: () => {}, __imgWindowStart: () => 0,
  };
  vm.createContext(sb);
  vm.runInContext('const VAULT_MIN = 150000;\n' + slice('function __vaultReplacer(k, v){', '/* v-vault-restore (المالك ٢٣ سبتمبر') + slice('let __vaultGen = 0;', '/* الاستعادة: صور مشروع') +
    '\nthis.save = __vaultSave; this.expand = __codeExpand; this.plan = __codeDedupePlan; this.lastLen = () => __vaultLastLen;', sb);
  return { sb, writes };
}
const big = (tag, n = 3000) => '<!DOCTYPE html><h1>' + tag + '</h1>' + 'x'.repeat(n);
const clone = (x) => JSON.parse(JSON.stringify(x));

function project() {
  const A = big('A'), B = big('B'), C = big('C'), U = big('U'), D = big('D');
  return {
    id: 'p_1', title: 'تطبيق', code: A, codeType: 'html',
    codeHistory: [{ ts: 1, code: B }, { ts: 2, code: A }, { ts: 3, code: C }, { ts: 4, code: U }],
    messages: [
      { role: 'assistant', content: 'b', code: B, providerLabel: 'x' }, { role: 'assistant', content: 'a', code: A, providerLabel: 'x' },
      { role: 'assistant', content: 'c', code: C }, { role: 'assistant', content: 'قصير', code: 'x' }, { role: 'assistant', content: 'd', code: D },
      { role: 'user', content: 'بلا كود' },
    ],
    extra: { code: B }, // حقل code خارج الرسائل واللقطات لا يُمسّ
  };
}

test('١. الحفظ: ما يساوي الحاليّ «cur»، والمكرّر مرّة في __omCodes، والمفرد والقصير وp.code نصوص كما هي', async () => {
  const p = project();
  const b = box([p]);
  await b.sb.save(true);
  const r = b.writes[0][0];
  const T = '\u0000omcode:';
  assert.equal(r.code, p.code, 'الحاليّ نصّ كما هو (القارئ القديم يعرض التطبيق)');
  assert.deepEqual(r.codeHistory.map((h) => h.code.startsWith(T) ? h.code : 'نصّ'), [T + '0', T + 'cur', T + '1', 'نصّ']);
  assert.deepEqual(r.messages.map((m) => (typeof m.code === 'string' && m.code.startsWith(T)) ? m.code : (m.code === undefined ? '-' : 'نصّ')), [T + '0', T + 'cur', T + '1', 'نصّ', 'نصّ', '-']);
  assert.deepEqual([...r.__omCodes], [p.codeHistory[0].code, p.codeHistory[2].code]); // الجدول مصفوفة من سياق vm
  assert.equal(r.extra.code, p.extra.code, 'خارج الرسائل واللقطات لا يُمسّ');
  assert.equal(r.messages[3].code, 'x');
  // الحالة في الذاكرة لا تُمسّ
  assert.ok(!('__omCodes' in p) && p.messages[0].code === p.codeHistory[0].code && !p.messages[1].code.startsWith(T));
  const plain = JSON.stringify(p).length, stored = JSON.stringify(r).length;
  assert.ok(stored < plain * 0.7, 'أصغر: ' + stored + ' من ' + plain);
  assert.ok(Math.abs(b.sb.lastLen() - stored) < 50, 'حارس الحجم بحجم ما كُتب');
});

test('٢. القراءة تعيد السجلّ كما كان حرفيًّا، والصيغة القديمة تمرّ بلا مساس', async () => {
  const p = project();
  const want = clone(p);
  const b = box([p]);
  await b.sb.save(false);
  const back = b.sb.expand(clone(b.writes[0]));
  assert.deepEqual(clone(back), [want]);
  const old = [clone(want), null, { id: 'p_2', messages: [] }];
  assert.deepEqual(clone(b.sb.expand(clone(old))), old, 'الصيغة القديمة كما هي');
  assert.equal(b.sb.expand(undefined), undefined, 'قراءة فارغة تبقى فارغة');
  // المشتركة بعد القراءة نصّ واحد في الذاكرة
  assert.equal(back[0].messages[1].code, back[0].code);
});

test('٣. رمز بلا جدول أو «cur» بلا كود حاليّ = نصّ فارغ لا رمز خامّ', () => {
  const b = box([]);
  const r = b.sb.expand([{ id: 'p', messages: [{ code: '\u0000omcode:7' }, { code: '\u0000omcode:cur' }], codeHistory: [{ code: '\u0000omcode:0' }] }]);
  assert.deepEqual(clone(r), [{ id: 'p', messages: [{ code: '' }, { code: '' }], codeHistory: [{ code: '' }] }]);
});

test('٤. إصداران بالطول نفسه وبصمة واحدة لا يُدمجان: المطابقة الفعليّة بالنصّ كلّه', async () => {
  const base = 'a'.repeat(5000);
  const v1 = base.slice(0, 2501) + 'X' + base.slice(2502), v2 = base.slice(0, 2501) + 'Y' + base.slice(2502);
  const p = { id: 'p', code: 'حاليّ', messages: [{ code: v1 }, { code: v2 }, { code: v1 }], codeHistory: [{ code: v2 }] };
  const b = box([p]);
  const fp = vm.runInContext('__codeFp', b.sb);
  assert.equal(fp(v1), fp(v2), 'البصمة واحدة (الفرق بين العيّنات)');
  await b.sb.save(true);
  const r = b.writes[0][0];
  assert.equal(r.__omCodes.length, 2, 'نصّان مختلفان في الجدول');
  const back = b.sb.expand(clone(b.writes[0]))[0];
  assert.deepEqual([back.messages[0].code === v1, back.messages[1].code === v2, back.messages[2].code === v1, back.codeHistory[0].code === v2], [true, true, true, true]);
});

test('٥. الإقلاع يوسّع القراءتين من IndexedDB (الترحيل والعاديّة) قبل أيّ دمج', () => {
  assert.ok(boot.includes("const idbOld = __codeExpand(await idbGetGuarded('aiapp_projects'));"));
  assert.ok(boot.includes("const idbProjects = __codeExpand(await idbGetGuarded('aiapp_projects'));"));
  assert.equal((boot.match(/idbGetGuarded\('aiapp_projects'\)/g) || []).length, 2, 'لا قارئ ثالث بلا توسيع');
  assert.match(src, /if\(k === 'code' && typeof v === 'string' && plan\.tokenOf\.has\(this\)\) return plan\.tokenOf\.get\(this\);/);
});
