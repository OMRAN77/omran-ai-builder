'use strict';
/* مساعد اختبارات صفحة المالك (v-owner-i18n) — ليس اختبارًا فلا يُسجَّل:
   - القواميس الحقيقيّة: app-03 (ar/en) وملفّات i18n/*.js الاثنا عشر في سياق واحد، وt بلغة بعينها كما يدمجها التطبيق
     (لغة الملفّ فوق الإنجليزيّة).
   - visibleOutsideIso: النصّ المرئيّ بعد حذف الحمولات المعزولة (\u2066…\u2069 \u2068…\u2069 و<bdi>…</bdi>) — الأسماء والأخطاء الخامّة بيانات لا تسميات.
   - clientSlice: يقتطع كود العميل بين علامتين ثابتتين ويشغّله في vm بسياق يُمرَّر. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const LANGS12 = ['fr', 'hi', 'ur', 'bn', 'ne', 'id', 'fil', 'tr', 'zh', 'ru', 'es', 'ml'];

let cached = null;
function dicts() {
  if (cached) return cached;
  const ctx = { console: { log() {}, warn() {}, error() {} } };
  ctx.window = ctx;
  vm.createContext(ctx);
  const a3 = read('js/app-03-i18n-data.js').replace(/^const (codeEl|previewFrame|emptyState|historyEl) = .*$/mg, '');
  vm.runInContext(a3 + '\n;this.I18N = I18N;', ctx);
  for (const l of LANGS12) vm.runInContext(read('i18n/' + l + '.js'), ctx);
  cached = ctx.I18N;
  return cached;
}
function dictFor(lang) {
  const I = dicts();
  if (lang === 'ar' || lang === 'en') return I[lang];
  return Object.assign({}, I.en, I[lang] || {});
}
function tFor(lang) {
  const d = dictFor(lang);
  return (k) => (d[k] !== undefined ? d[k] : k);
}
const AR_RE = /[\u0600-\u06FF]/;
function visibleOutsideIso(s) {
  return String(s)
    .replace(/[\u2066\u2067\u2068][^\u2069]*\u2069/g, '')
    .replace(/<bdi\b[^>]*>[\s\S]*?<\/bdi>/g, '');
}
function clientSlice(file, startMark, endMark, ctx) {
  const src = read(file);
  const a = src.indexOf(startMark);
  const b = src.indexOf(endMark, a + 1);
  if (!(a >= 0 && b > a)) throw new Error('العلامتان غير موجودتين في ' + file + ': ' + startMark.slice(0, 40) + ' … ' + endMark.slice(0, 40));
  vm.createContext(ctx);
  vm.runInContext(src.slice(a, b), ctx);
  return ctx;
}
const flush = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };

module.exports = { read, root, dicts, dictFor, tFor, AR_RE, visibleOutsideIso, clientSlice, flush, LANGS12 };
