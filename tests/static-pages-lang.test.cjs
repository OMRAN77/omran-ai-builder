// tests/static-pages-lang.test.cjs — v-legal-lang (تدقيق ١٨ أكتوبر، g01/g13): صفحتا الخصوصيّة والشروط مثبّتتان على
// lang="ar" dir="rtl" فتفتحان بالعربيّ لمستخدم الواجهة الإنجليزيّة (الإنجليزيّ تحت العربيّ في privacy، ومخفيّ حتّى
// زرّ English في terms)، وبلا أيّ رابط يرجعك للتطبيق. الآن: سكربت مضمّن يقرأ ?lang= أو aiapp_lang (نفس الأصل) — غير
// العربيّة تفتح الإنجليزيّة (للصفحتين نسختان فقط: ar وen) — ورابط «العودة للتطبيق» إلى / يغلق النافذة إن فُتحت من التطبيق.
// يشغّل السكربت الحقيقيّ من كلّ صفحة في vm على DOM مصغّر.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const lastScript = (html) => html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));

function makeCtx({ lang, search = '', storageThrows = false, opener = null }) {
  const node = () => ({ style: {}, textContent: '' });
  const nodes = { '.ar': node(), '.en': node(), '.lang-btn': node() };
  const cls = new Set();
  const documentElement = {
    lang: 'ar', dir: 'rtl',
    classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c), toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)) },
  };
  const store = new Map(lang == null ? [] : [['aiapp_lang', lang]]);
  const storage = { getItem: (k) => { if (storageThrows) throw new Error('SecurityError'); return store.has(k) ? store.get(k) : null; } };
  const calls = { close: 0 };
  const ctx = {
    document: { documentElement, title: 'ORIGINAL', querySelector: (s) => nodes[s] || null },
    location: { search },
    URLSearchParams,
    opener,
    closed: false,
    close() { calls.close++; ctx.closed = true; },
  };
  Object.defineProperty(ctx, 'localStorage', { get() { if (storageThrows) throw new Error('SecurityError'); return storage; } });
  ctx.window = ctx;
  vm.createContext(ctx);
  return { ctx, nodes, documentElement, cls, calls };
}

test('١. terms.html: aiapp_lang=en يفتح الإنجليزيّة (‎.en ظاهرة، html lang=en dir=ltr)، و?lang=en كذلك', () => {
  for (const opts of [{ lang: 'en' }, { lang: 'tr' }, { lang: null, search: '?lang=en' }]) {
    const r = makeCtx(opts);
    vm.runInContext(lastScript(read('terms.html')), r.ctx);
    assert.equal(r.nodes['.en'].style.display, 'block', JSON.stringify(opts));
    assert.equal(r.nodes['.ar'].style.display, 'none');
    assert.equal(r.documentElement.lang, 'en');
    assert.equal(r.documentElement.dir, 'ltr');
    assert.equal(r.nodes['.lang-btn'].textContent, 'العربية', 'الزرّ يعيد العربيّة');
  }
});

test('٢. terms.html: ar أو بلا قيمة أو تخزين يرمي = لا تغيير', () => {
  for (const opts of [{ lang: 'ar' }, { lang: null }, { lang: 'en', storageThrows: true }]) {
    const r = makeCtx(opts);
    assert.doesNotThrow(() => vm.runInContext(lastScript(read('terms.html')), r.ctx), JSON.stringify(opts));
    assert.equal(r.nodes['.en'].style.display, undefined, JSON.stringify(opts));
    assert.equal(r.documentElement.lang, 'ar');
    assert.equal(r.documentElement.dir, 'rtl');
  }
});

test('٣. privacy.html: غير العربيّة تخفي الجزء العربيّ (صنف en-only بقاعدته) وhtml lang=en dir=ltr وعنوان إنجليزيّ، وزرّ «العربية» يعيده', () => {
  const html = read('privacy.html');
  const r = makeCtx({ lang: 'en' });
  vm.runInContext(lastScript(html), r.ctx);
  assert.ok(r.cls.has('en-only'), 'الصنف على html');
  assert.equal(r.documentElement.lang, 'en');
  assert.equal(r.documentElement.dir, 'ltr');
  assert.match(r.ctx.document.title, /^Privacy Policy/);
  // القاعدة التي تخفي الترويسة والبطاقات العربيّة (المباشرة تحت ‎.page) — والإنجليزيّة داخل ‎.english تبقى
  assert.match(html, /html\.en-only \.page > header,\s*html\.en-only \.page > \.policy-card\s*\{\s*display:\s*none;?\s*\}/);
  assert.match(html, /<button[^>]*class="ar-btn"[^>]*onclick="omShowArabic\(\)"[^>]*>العربية<\/button>/);
  vm.runInContext('omShowArabic()', r.ctx);
  assert.ok(!r.cls.has('en-only'));
  assert.equal(r.documentElement.lang, 'ar');
  assert.equal(r.documentElement.dir, 'rtl');
  assert.equal(r.ctx.document.title, 'ORIGINAL', 'العنوان العربيّ يرجع');
  for (const opts of [{ lang: 'ar' }, { lang: null }, { lang: 'en', storageThrows: true }]) {
    const q = makeCtx(opts);
    assert.doesNotThrow(() => vm.runInContext(lastScript(html), q.ctx));
    assert.ok(!q.cls.has('en-only'), JSON.stringify(opts));
    assert.equal(q.documentElement.lang, 'ar');
  }
});

test('٤. الصفحتان: رابط «العودة للتطبيق» إلى / بالعربيّ والإنجليزيّ، ومعالجه يغلق النافذة إن فُتحت من التطبيق وإلّا ينتقل', () => {
  for (const f of ['privacy.html', 'terms.html']) {
    const html = read(f);
    const links = [...html.matchAll(/<a class="back-link" href="\/" onclick="return omBackToApp\(\)">([\s\S]*?)<\/a>/g)].map((m) => m[1]);
    assert.ok(links.length >= 1, f + ': رابط إلى /');
    const all = links.join(' ');
    assert.ok(all.includes('العودة للتطبيق') && all.includes('Back to app'), f + ': بالعربيّ والإنجليزيّ');
    const withOpener = makeCtx({ lang: 'ar', opener: { closed: false } });
    vm.runInContext(lastScript(html), withOpener.ctx);
    assert.equal(vm.runInContext('omBackToApp()', withOpener.ctx), false, f + ': لا انتقال بعد الإغلاق');
    assert.equal(withOpener.calls.close, 1, f + ': close');
    const alone = makeCtx({ lang: 'ar', opener: null });
    vm.runInContext(lastScript(html), alone.ctx);
    assert.equal(vm.runInContext('omBackToApp()', alone.ctx), true, f + ': بلا نافذة أمّ ينتقل الرابط إلى /');
    assert.equal(alone.calls.close, 0);
    const closedOpener = makeCtx({ lang: 'ar', opener: { closed: true } });
    vm.runInContext(lastScript(html), closedOpener.ctx);
    assert.equal(vm.runInContext('omBackToApp()', closedOpener.ctx), true, f + ': النافذة الأمّ مغلقة');
  }
});

test('٥. terms.html: الرابط بصنف جديد على الطرف المقابل لزرّ اللغة، بلا لمس :root ولا ‎.lang-btn (about-clean ١)', () => {
  const t = read('terms.html');
  assert.ok(t.includes(':root{--bg:#000;--card:#0b0b0c;--text:#f2efe7;--muted:#a9a497;--accent:#e9d39a;--border:rgba(240,222,170,.16)}'));
  assert.match(t, /\.lang-btn\{position:fixed;top:16px;inset-inline-end:16px;/);
  assert.match(t, /\.back-link\{[^}]*\}/);
  // داخل كتلة كلّ لغة: العربيّ في ‎.ar والإنجليزيّ في ‎.en
  const ar = t.slice(t.indexOf('<div class="ar">'), t.indexOf('<!-- ===== ENGLISH ===== -->'));
  const en = t.slice(t.indexOf('<div class="en">'), t.indexOf('<div class="foot">'));
  assert.match(ar, /class="back-link"[^>]*>→ العودة للتطبيق<\/a>/);
  assert.match(en, /class="back-link"[^>]*>← Back to app<\/a>/);
});
