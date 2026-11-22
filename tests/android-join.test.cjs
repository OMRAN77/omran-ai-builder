// tests/android-join.test.cjs — v-android-join (المالك ٢٢ نوفمبر: «اريد رابط واحد فقط عشان يدخل»): /android صفحة واحدة لمختبري أندرويد
// بدل ثلاثة روابط — المجموعة ثمّ الموافقة ثمّ المتجر بالترتيب، عربيّ وإنجليزيّ، والروابط نفسها في بطاقة الدعوة داخل التطبيق.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const html = read('android.html');
const GROUP = 'https://groups.google.com/g/om-ai-testers';
const OPTIN = 'https://play.google.com/apps/testing/com.omran.aibuilder';
const STORE = 'https://play.google.com/store/apps/details?id=com.omran.aibuilder';

test('١. /android يذهب إلى الصفحة', () => {
  const v = JSON.parse(read('vercel.json'));
  const all = [].concat(v.rewrites || [], v.routes || []);
  assert.ok(all.some((r) => r.source === '/android' && r.destination === '/android.html'));
});

test('٢. الخطوات الثلاث بالترتيب: المجموعة ← الموافقة ← المتجر، وكلّ زرّ في تبويب جديد بأمان', () => {
  const hrefs = [...html.matchAll(/<a class="btn" id="b(\d)" href="([^"]+)" target="_blank" rel="noopener"/g)];
  assert.deepEqual(hrefs.map((m) => m[1]), ['1', '2', '3']);
  assert.deepEqual(hrefs.map((m) => m[2]), [GROUP, OPTIN, STORE]);
  // الروابط نفسها في بطاقة الدعوة داخل التطبيق
  const app = read('js/app-10-features.js');
  assert.ok(app.includes(GROUP) && app.includes(OPTIN), 'PLAY_TEST في التطبيق');
});

test('٣. كلّ نصّ له ترجمة إنجليزيّة، والإنجليزيّة تُختار بـ?lang=en أو بلغة الجهاز، والعربيّة افتراضيّة', () => {
  const keys = [...html.matchAll(/data-t="(\w+)"/g)].map((m) => m[1]);
  const script = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
  const run = (search, langs) => {
    const els = keys.map((k) => ({ k, textContent: 'AR', innerHTML: 'AR', getAttribute: () => k }));
    const btns = {};
    const doc = {
      documentElement: { lang: 'ar', dir: 'rtl' }, title: 'ar',
      querySelectorAll: () => els,
      getElementById: (id) => (btns[id] = btns[id] || { className: '', textContent: '', setAttribute() {}, addEventListener() {} }),
    };
    vm.runInNewContext(script, { document: doc, location: { search }, navigator: { languages: langs, language: langs[0] }, localStorage: { getItem: () => null, setItem() {} }, setTimeout });
    return { doc, els };
  };
  const ar = run('', ['ar-AE']);
  assert.equal(ar.doc.documentElement.dir, 'rtl');
  assert.ok(ar.els.every((e) => e.textContent === 'AR'), 'العربيّة كما هي');
  for (const r of [run('?lang=en', ['ar']), run('', ['en-US'])]) {
    assert.equal(r.doc.documentElement.dir, 'ltr');
    assert.ok(r.els.every((e) => e.textContent !== 'AR' || e.innerHTML !== 'AR'), 'كلّ مفتاح مترجم: ' + r.els.filter((e) => e.textContent === 'AR' && e.innerHTML === 'AR').map((e) => e.k));
  }
});

test('٤. تنبيه الحساب الواحد و١٤ يومًا وأندرويد فقط موجود بالعربيّة، وبلا أسماء مزوّدين', () => {
  assert.match(html, /نفس حساب Gmail/);
  assert.match(html, /١٤ يومًا/);
  assert.match(html, /لأندرويد فقط/);
  assert.doesNotMatch(html, /Gemini|OpenAI|Claude|Anthropic|GPT|Groq/);
});
