// tests/frame-design.test.cjs — v-frame-design (أمر المالك ٤ أكتوبر بصورتين، العاجيّ والأسود: «سوّ لي نفس نفس التصميم»،
// و«الأبيض نفس هذا والأسود خلّه نفس الدرجة الموجودة في التطبيق»، و«شوف كيف التصميم من على الأطراف»، و«مكان الكود نفس لون
// الصفحة»، و«احذف السهم الذهبيّ والماوس الدائريّ بالسهم» في الأدوات، و«تطلع جنب رسالة المستخدم الصورة اللي في حسابه»).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const CSS = rd('css/إطارات.css');
const LANGS = ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh'];

test('١. للكمبيوتر وحده: كلّ قاعدة داخل min-width:861px وفيها :not(.mobile-ui) — الجوّال لا يتغيّر', () => {
  const css = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const at = css.indexOf('@media (min-width:861px){');
  assert.ok(at > 0, 'كتلة الكمبيوتر');
  const before = css.slice(0, at), inside = css.slice(at);
  assert.equal(before.trim(), '#sbSearchWrap, #sidebarBrandSub, #omFrameCenter{display:none;}', 'خارج الكتلة: الإخفاء وحده');
  const sels = [...inside.slice(inside.indexOf('{') + 1).matchAll(/([^{}]+)\{[^{}]*\}/g)].map((m) => m[1].trim()).filter(Boolean);
  assert.ok(sels.length > 40);
  // الفصل على الفواصل العليا وحدها — فواصل :is(…) جزء من المحدِّد نفسه
  const top = (list) => { const out = []; let d = 0, cur = ''; for (const ch of list) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { out.push(cur.trim()); cur = ''; } else cur += ch; } out.push(cur.trim()); return out; };
  for (const list of sels) for (const sel of top(list)) {
    assert.ok(/:not\(\.mobile-ui\)/.test(sel), 'قاعدة قد تمسّ الجوّال: ' + sel);
  }
});

test('٢. المقاسات والألوان المقيسة من صورتيه: ١٣px و١٤px و٢٠px، الإطار المزدوج، العاجيّ؛ والأسود بلا تغيير ألوان', () => {
  assert.match(CSS, /html:not\(\.mobile-ui\) body\{ padding:13px; \}/);
  assert.match(CSS, /\.resizer\{ width:14px;/);
  assert.match(CSS, /border:2px solid var\(--frame-line\) !important; border-radius:20px !important;/);
  assert.match(CSS, /content:""; position:absolute; inset:5px; border:1px solid var\(--frame-line2\); border-radius:15px;/, 'الخطّ الجوّانيّ ٥px بعد البرّانيّ');
  const light = CSS.slice(CSS.indexOf('html[data-mode="light"]:not(.mobile-ui):not(.bgimg){'));
  for (const c of ['#d0c6ac', '#e6dbca', '#e8dec8', '#f6eeda', '#9a7c38']) assert.ok(light.includes(c), 'العاجيّ: ' + c);
  for (const [el, c] of [['#sidebar', '#fdf8ec'], ['#omFrameCenter', '#fcf6eb'], ['#workarea', '#f9f2e4']]) {
    assert.match(CSS, new RegExp('html\\[data-mode="light"\\]:not\\(\\.mobile-ui\\):not\\(\\.bgimg\\) ' + el + '\\{[^}]*' + c), el + ' ' + c);
  }
  // الأسود: لا --bg/--panel/--text جديدة، واللوحات بألوان التطبيق نفسها (#000 و#101013)
  const darkRoot = CSS.slice(CSS.indexOf('  html:not(.mobile-ui){'), CSS.indexOf('  html[data-mode="light"]'));
  assert.doesNotMatch(darkRoot, /--bg|--panel|--text:/, 'الأسود كما هو في التطبيق');
  assert.match(CSS, /html:not\(\[data-mode="light"\]\):not\(\.mobile-ui\):not\(\.bgimg\) #omFrameCenter\{ background:#000; \}/);
  assert.match(CSS, /html:not\(\[data-mode="light"\]\):not\(\.mobile-ui\):not\(\.bgimg\) #workarea\{[^}]*#101013/);
});

test('٣. الربط: CSS قبل الثيم الخشبيّ، إطار اللوحة الوسطى أوّل <main>، اللوحة الفارغة بلا «بيت»، وخانة البحث', () => {
  const html = rd('index.html');
  const a = html.indexOf('css/خلفيات.css?v=3'), b = html.indexOf('css/إطارات.css?v='), c = html.indexOf('css/ثيم-خشبي.css?v=3');
  assert.ok(a > 0 && b > a && c > b, 'الترتيب: خلفيات ← إطارات ← الخشبيّ');
  assert.match(html, /<main>\n  <div id="omFrameCenter" aria-hidden="true"><\/div>/);
  const empty = html.slice(html.indexOf('<div class="empty" id="emptyState">'), html.indexOf('<iframe id="previewFrame"'));
  // أمر المالك بعد الثيمات: «شيل هنا تبدأ الأفكار… كاملة مع الصورة والأيقونة» — القوس والهلال والعنوان والسطر تحته خارج الصفحة
  assert.doesNotMatch(empty, /frameHome|frameArch|frameDivider|frameSub/);
  const live = html.replace(/<!--[\s\S]*?-->/g, '') + CSS.replace(/\/\*[\s\S]*?\*\//g, ''); // التعليقات تحكي القرار
  assert.doesNotMatch(live, /frameHome|frameArch|frameTitle|frameDivider|frameSub|هنا تبدأ|مساعدك الذكي دائماً معك/);
  assert.match(html, /<div id="sidebarBrandSub" data-i18n="brandSubtitle">منصة الذكاء<\/div>/);
  assert.match(html, /<div id="sbSearchWrap">[\s\S]*?<input type="search" id="sbSearch"[^>]*data-i18n-placeholder="projSearchLabel"/);
});

test('٤. الأدوات: لا سهم ذهبيّ ولا أسهم دائريّة على الكمبيوتر؛ ومكان الكود بلون الصفحة (العاجيّ والأسود والخشبيّ)', () => {
  // سهم طيّ القائمة رجع (أمر المالك بعد النشر: «رجّعه وين المحادثة الجديدة») — على سطرها، وداخل سياق تكديس القائمة
  // (isolation) فلا يعلو شاشة الأدوات كما كان بـz-index:9999
  assert.doesNotMatch(CSS, /#sidebarCloseBtn\{ display:none/);
  assert.match(CSS, /html:not\(\.mobile-ui\) #sidebarCloseBtn\{ top:var\(--sb-arrow-top, 120px\) !important;[^}]*z-index:3;/);
  assert.match(CSS, /position:relative; isolation:isolate;/);
  assert.match(rd('js/app-31-إطارات.js'), /setProperty\('--sb-arrow-top', Math\.max\(0, Math\.round\(جديد\.offsetTop \+ \(جديد\.offsetHeight - h\) \/ 2\)\) \+ 'px'\)/);
  // الإعدادات والنوافذ عاجيّة في الفاتح (كانت رماديّة #EBEBEB)
  assert.match(CSS, /html\[data-mode="light"\]:not\(\.mobile-ui\):not\(\.bgimg\) :is\(dialog, [^)]*\)\{ background:#fbf5e9 !important;/);
  assert.match(CSS, /\.settingsNavGroup\{ background:#f3ead6 !important; \}/);
  assert.match(CSS, /html:not\(\.mobile-ui\) #sectionsToolsPopup \.ptShelfArrow\{ display:none !important; \}/);
  assert.match(CSS, /html\[data-mode="light"\]:not\(\.mobile-ui\):not\(\.bgimg\) #code\{ background:#f9f2e4 !important;/);
  assert.match(CSS, /html:not\(\[data-mode="light"\]\):not\(\.mobile-ui\):not\(\.bgimg\) #code\{ background:#101013 !important; \}/);
  assert.match(rd('css/ثيم-خشبي.css'), /html\.skin-wood #code\{background:transparent !important; color:#f6ead6 !important;/);
});

function env(store) {
  const props = {}; const cls = new Set(); const listeners = {}; let dispatched = 0;
  const real = { value: '', dispatchEvent: () => { dispatched++; } };
  const sb = { value: '', addEventListener: (ev, fn) => { listeners[ev] = fn; } };
  const ctx = {
    document: {
      documentElement: { classList: { toggle: (c, on) => { if (on) cls.add(c); else cls.delete(c); } }, style: { setProperty: (k, v) => { props[k] = v; }, removeProperty: (k) => { delete props[k]; } } },
      getElementById: (id) => (id === 'sbSearch' ? sb : id === 'projSearchInput' ? real : null),
    },
    localStorage: { getItem: (k) => (k in store ? store[k] : null) },
    window: { addEventListener() {} }, Event: function (t) { this.type = t; }, JSON, Array, String, __swallow: () => {},
  };
  ctx.window.window = ctx.window;
  vm.runInNewContext(rd('js/app-31-إطارات.js').replace(/window\./g, 'window.'), ctx);
  return { ctx, props, cls, sb, real, listeners, dispatched: () => dispatched };
}

test('٥. صورة المستخدم بجانب رسائله: صورته من «حسابي»، وبلا صورة أوّل حرف من اسمه، وللمسجَّل وحده؛ والبحث الظاهر يمرّ إلى بحث المشاريع', () => {
  const a = env({ aiapp_username: 'omran', aiapp_avatar: 'data:image/jpeg;base64,AAA' });
  assert.ok(a.cls.has('has-user-av'));
  assert.equal(a.props['--user-av'], 'url("data:image/jpeg;base64,AAA")');
  assert.equal(a.props['--user-initial'], '""');
  const b = env({ aiapp_username: 'نورة' });
  assert.equal(b.props['--user-av'], undefined);
  assert.equal(b.props['--user-initial'], '"ن"', 'أوّل حرف');
  const c = env({});
  assert.ok(!c.cls.has('has-user-av'), 'الضيف بلا صورة');
  // البحث
  a.sb.value = 'مها'; a.listeners.input();
  assert.equal(a.real.value, 'مها'); assert.equal(a.dispatched(), 1, 'حدث input على بحث المشاريع القائم');
  // تُحدَّث كلّما بدّل صورته
  assert.match(rd('js/app-01-boot-auth.js'), /function updateAvatarUI\(\)\{\n    const avatar = localStorage\.getItem\('aiapp_avatar'\) \|\| '';\n    if\(typeof window\.omFrameAvatar === 'function'\) window\.omFrameAvatar\(\);/);
  assert.match(CSS, /html\.has-user-av:not\(\.mobile-ui\) #messages \.msg\.user::before\{\s*content:var\(--user-initial, ""\);[\s\S]*background:var\(--user-av, linear-gradient/);
});

test('٦. «منصّة الذكاء» بالـ١٤ لغة، ونصوص «البيت» المحذوف في أيّ منها، ووسم اللغات مرفوع', () => {
  const data = rd('js/app-03-i18n-data.js');
  for (const k of ['brandSubtitle']) {
    assert.equal((data.match(new RegExp('^    ' + k + ': ', 'gm')) || []).length, 2, 'ar+en: ' + k);
    for (const lg of LANGS) assert.ok(rd('i18n/' + lg + '.js').includes('"' + k + '":'), lg + ': ' + k);
  }
  assert.doesNotMatch(data, /frameHome/);
  for (const lg of LANGS) assert.doesNotMatch(rd('i18n/' + lg + '.js'), /frameHome/, lg);
  assert.ok(rd('js/app-04-i18n-state.js').includes(".js?v=732'"));
});
