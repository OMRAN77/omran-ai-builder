'use strict';
/* v-es-floor (فحص ١١ أكتوبر، أمر المالك «صلح كل شي»): أندرويد القديم «يطيح من أول ما يفتح» — الحزمة كلّها ملفّ واحد،
   وفيها خمسة ‎?.‎ (كروم ٨٠+) وثلاثة تعابير حرفيّة بـ\p{Extended_Pictographic} (يونيكود ١١): المحرّك الأقدم يرفض تحليل
   الملفّ كلّه فلا يعمل شيء — صفحة ميّتة بشريط أحمر. كان مُصلَحًا (v-old-webview) ورجع لأنّ `node --check` يقبل الحديث.
   هنا: كلّ سكربت يُحمَّل عند الإقلاع يُحلَّل بـacorn على ES2020، وتُرفض فيه البنى التي تقتل التحليل على كروم ٦٤–٧٩:
   ‎?.‎ و‎??‎ وBigInt وimport.meta، وخصائص يونيكود الحديثة في تعبير حرفيّ (تُبنى وقت التشغيل بـnew RegExp داخل try).
   ES2021+ (‎||=‎، فواصل الأرقام، حقول الأصناف) لا يُحلَّل على ES2020 أصلًا فيُرفض. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const acorn = require('acorn');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const MODERN_PROP = /\\[pP]\{(?:Extended_Pictographic|Emoji(?:_\w+)?|RGI_\w+|Basic_Emoji)\}/;

function offenders(code) {
  const ast = acorn.parse(code, { ecmaVersion: 2020, sourceType: 'script', allowHashBang: true, locations: true });
  const bad = [];
  (function walk(n) {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'ChainExpression') bad.push('?. @' + n.loc.start.line);
    if (n.type === 'LogicalExpression' && n.operator === '??') bad.push('?? @' + n.loc.start.line);
    if (n.type === 'Literal' && typeof n.bigint === 'string') bad.push('BigInt @' + n.loc.start.line);
    if (n.type === 'MetaProperty' && n.meta && n.meta.name === 'import') bad.push('import.meta @' + n.loc.start.line);
    if (n.type === 'Literal' && n.regex && MODERN_PROP.test(n.regex.pattern)) bad.push('\\p{…} حديثة في تعبير حرفيّ @' + n.loc.start.line);
    for (const k of Object.keys(n)) {
      const v = n[k];
      if (k === 'loc') continue;
      if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v);
    }
  })(ast);
  return bad;
}

// كلّ ما يُحمَّل عند الإقلاع: سكربتات index.html المضمّنة والمحلّيّة، وملفّات اللغات، وعامل الخدمة.
function bootScripts() {
  const html = read('index.html');
  const out = [];
  let i = 0;
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1];
    if (/type\s*=\s*["'](?!text\/javascript)[^"']+["']/i.test(attrs)) continue; // JSON-LD وما شابه
    const src = (attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (src) {
      if (/^(?:https?:)?\/\//i.test(src)) continue;
      const f = src.replace(/^\//, '').split(/[?#]/)[0];
      if (fs.existsSync(path.join(root, f))) out.push([f, read(f)]);
    } else if (m[2].trim()) out.push(['index.html#inline' + (++i), m[2]]);
  }
  for (const f of fs.readdirSync(path.join(root, 'i18n')).filter((x) => x.endsWith('.js'))) out.push(['i18n/' + f, read('i18n/' + f)]);
  if (fs.existsSync(path.join(root, 'sw.js'))) out.push(['sw.js', read('sw.js')]);
  return out;
}

test('١. الحزمة نفسها تُحلَّل على ES2020 وبلا بنية تقتلها على كروم ٦٤–٧٩', () => {
  assert.deepEqual(offenders(read('js/app.bundle.js')), []);
});

test('٢. كلّ سكربت إقلاع (index.html المضمّن والمحلّيّ، اللغات، عامل الخدمة) كذلك', () => {
  const files = bootScripts();
  assert.ok(files.some(([f]) => f === 'js/app.bundle.js') && files.some(([f]) => f.startsWith('i18n/')), 'الحزمة واللغات ضمن الفحص');
  const all = [];
  for (const [f, code] of files) {
    let bad;
    try { bad = offenders(code); } catch (e) { bad = ['لا يُحلَّل على ES2020: ' + e.message]; }
    for (const b of bad) all.push(f + ': ' + b);
  }
  assert.deepEqual(all, []);
});

test('٣. الكاشف يمسك ما يُسقط الحزمة (حارس على الحارس)', () => {
  assert.deepEqual(offenders("var a = b?.c;"), ['?. @1']);
  assert.deepEqual(offenders("var a = b ?? c;"), ['?? @1']);
  assert.equal(offenders("var r = /[\\p{Extended_Pictographic}]/u;").length, 1);
  assert.deepEqual(offenders("var r = /[\\p{L}\\p{N}]/u; import('x');"), [], 'خصائص يونيكود ٩ والاستيراد الديناميكيّ (كروم ٦٣–٦٤) مقبولة');
  assert.deepEqual(offenders("var r = new RegExp('\\\\p{Extended_Pictographic}', 'u');"), [], 'وقت التشغيل داخل try مقبول');
  assert.throws(() => offenders('a ||= b;'), 'ES2021 لا يُحلَّل');
  assert.throws(() => offenders('var n = 1_000;'));
});

test('٤. المواضع المصلَحة: لا ?. في الإقلاع والدخول ونفاد النقاط، والتعابير الحديثة تُبنى في try', () => {
  const a1 = read('js/app-01-boot-auth.js');
  assert.equal((a1.match(/const tabsRow = \(\$\('#authTabLogin'\) \|\| \{\}\)\.parentElement;/g) || []).length, 2);
  assert.equal((a1.match(/const orDivider = googleBtn \? googleBtn\.previousElementSibling : undefined;/g) || []).length, 2);
  assert.ok(read('js/app-08-maha.js').includes("var __ppb = document.querySelector('.pointsPackBtn'); if(__ppb) __ppb.scrollIntoView("));
  for (const f of ['js/app-10-features.js', 'js/app-11-video-trends.js', 'js/app-15-cx-simple.js']) assert.ok(/try\{ \w+ = new RegExp\('[^']*\\\\p\{Extended_Pictographic\}/.test(read(f)), f);
});
