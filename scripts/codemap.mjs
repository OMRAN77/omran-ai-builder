// v-codemap (طلب المالك ١٠ أكتوبر «المزوّدون يكون عندهم كافّة المعلومات… معلومات الكود من الصفر»):
// خريطة الكود كلّه تُولَّد آليًّا من الملفّات نفسها — لكلّ ملفّ: غرضه (أوّل تعليق فيه أو وصف مكتوب هنا)،
// وحجمه، ودوالّه وصادراته وأدواته. الناتج api/_lib/codemap.json يقرؤه الخادم: ملخّص في معرفة المالك
// (_knowledge.js) والتفصيل بـread_github what=map. يُعاد توليدها تلقائيًّا بعد كلّ دمج (codemap.yml).
// بلا أرقام أسطر عمدًا: تتغيّر مع كلّ تعديل فتصير الخريطة كاذبة — الموضع يُجلب بـread_github query.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'api/_lib/codemap.json');

/* أوصاف مكتوبة للملفّات المحوريّة — تعلو على أوّل تعليق (التعليق الأوّل كثيرًا ما يكون تاريخ القرار لا الغرض). */
const PURPOSE = {
  'index.html': 'الصفحة الوحيدة للتطبيق: هيكل الواجهة كلّه، وتحمّل js/app.bundle.js وcss/*.css بإصدار ?v=N لكلّ ملفّ',
  'sw.js': 'Service Worker: كاش الواجهة، ويحمل بصمة الحزمة (تُرفع مع كلّ تغيير في app.bundle.js)',
  'vercel.json': 'إعداد Vercel: المنطقة bom1، والترويسات، وrewrites المسارات المختصرة (/api/openai…) إلى /api/ai?action=',
  'package.json': 'السكربتات: bundle (بناء الحزمة) · check · guard · verify · test · ci (كلّها) — والاختبارات مسجّلة في test',
  'api/ai.js': 'الموجّه الواحد ?action= لكلّ دوالّ الذكاء: chat (المحادثة) · agent (الوكيل) · بقيّة المزوّدين والأدوات',
  'api/_lib/chat.js': 'المحادثة لكلّ المزوّدين (/api/ai?action=chat): النظام، الأدوات، حلقة استدعاء الأدوات، البثّ، أدوات المالك',
  'api/_lib/agent.js': 'الوكيل (/api/ai?action=agent): بناء التطبيقات وتعديل الكود بأدوات (read_github، الرفع، النشر)',
  'api/_lib/_knowledge.js': 'معرفة المالك المحقونة في نظام المحادثة والوكيل (للمالك وحده بتوقيع HMAC) + ملخّص خريطة الكود',
  'api/_lib/_owner.js': 'isOwner: التحقّق من المالك بتوقيع HMAC في الخادم',
  'api/_lib/oa-direct.js': 'GPT وGroq وKimi بمفاتيحها المباشرة (بلا OpenRouter)',
  'api/_lib/github-read.js': 'read_github: قراءة المستودع/الملفّ/المجلّد/الدفعات/طلبات السحب، والبحث النصّيّ، وخريطة الكود (what=map)',
  'api/_lib/github-write.js': 'write_github: رفع ملفّات كاملة إلى فرع وفتح طلب سحب',
  'api/_lib/github-edit.js': 'edit_github (تعديل أجزاء ملفّ) وmerge_github (دمج بأمر المالك) + WORK_NOTE قواعد عمل المالك',
  'api/_lib/github-manage.js': 'manage_github: حالة الطلبات وتشغيلات CI وسجلّها، والإغلاق/الحذف بإذن المالك المكتوب',
  'api/_lib/agent-delegate.js': 'تفويض مهمّة لنسخة المزوّد نفسه في GitHub Actions ومتابعتها',
  'api/_lib/app-errors.js': 'read_app_errors: سجلّ أخطاء التطبيق الحيّ (سبب «ما قدرت أردّ الحين — خطأ N»)',
  'api/_lib/provider-level.js': 'منهج المزوّدين للمالك: ملاحظة المستوى، وصف read_github للمالك، تنبيه الحزمة بعد الرفع',
  'api/_lib/owner-carry.js': 'إكمال المالك: إعادة الحلقة حين يكتب الموديل خطّة ويتوقّف، وتعديل الواجهة من لقطة',
  'api/_lib/prov-self.js': 'أدوات المزوّد لنفسه (SELF/TEACH): كلّ مزوّد يصلح ملفّه ويحفظ تعليماته — للمالك وحده',
  'api/_lib/codemap.json': 'خريطة الكود المولَّدة آليًّا (scripts/codemap.mjs) — لا تُعدَّل يدويًّا',
  'js/app.bundle.js': 'الحزمة المبنيّة من js/app-NN-*.js (npm run bundle) — لا تُعدَّل يدويًّا',
  'js/modes.js': 'الأوضاع الصريحة داخل قائمة + في صندوق الكتابة: صورة · بحث · تفكير',
  'js/partials-core.js': 'أجزاء HTML (المودالات وغيرها) منقولة من index.html وتُدرج في الصفحة — لا تُحزم: يكفي رفع ?v= في index.html',
  'js/partials-settings.js': 'أجزاء HTML للإعدادات (لا تُحزم: يكفي رفع ?v= في index.html)',
  'js/app-06-checkout.js': 'الدفع (Stripe checkout) + جزء من مسار المحادثة في الواجهة (sanitizeGeminiContents، postWithConfirm)',
  'js/app-09-attach.js': 'أكبر جزء في الواجهة: فيه __sendPromptCore — إرسال رسالة المستخدم وتوجيهها — والمرفقات',
  'js/app-01-boot-auth.js': 'إقلاع التطبيق وتسجيل الدخول والجلسة',
  'css/redesign.css': 'التصميم الرئيسيّ للواجهة (الرأس، الشريط الجانبيّ، المحادثة) — حدود مستقيمة 1px',
  'css/إطارات.css': 'إطارات سطح المكتب وحده (اختبار frame-design يشترط ذلك)',
  'scripts/build.mjs': 'npm run bundle: يجمع js/app-NN-*.js في js/app.bundle.js ويختم index.html وsw.js',
  'scripts/codemap.mjs': 'مولّد خريطة الكود هذه',
  'api/_lib/openai.js': 'وسيط OpenAI (مسار /api/openai)', 'api/_lib/groq.js': 'وسيط Groq (مسار /api/groq)',
  'api/_lib/deepseek.js': 'وسيط DeepSeek (مسار /api/deepseek)', 'api/_lib/mistral.js': 'وسيط Mistral (مسار /api/mistral)',
  'api/_lib/cohere.js': 'وسيط Cohere (مسار /api/cohere)', 'api/_lib/openrouter.js': 'وسيط OpenRouter (مسار /api/openrouter)',
  'api/_lib/perplexity.js': 'وسيط Perplexity (مسار /api/perplexity)', 'api/_lib/cors.js': 'ترويسات CORS المشتركة',
  'api/_lib/safe-url.js': 'فحص الروابط قبل جلبها (منع العناوين الداخليّة)', 'api/_lib/image-prompt.js': 'صياغة أوامر توليد الصور وتعديلها',
  'api/_lib/analyze-zip.js': 'تحليل مستودع/أرشيف zip لمحلّل الكود', 'js/app-03-i18n-data.js': 'نصوص الترجمة (مفاتيح الواجهة بكلّ اللغات)',
};

const SKIP = /(^|\/)(vendor|node_modules)\/|\.min\.js$|^js\/app\.bundle\.js$|^api\/_lib\/codemap\.json$/;
const INCLUDE = /^(api\/[^/]+\.js|api\/_lib\/[^/]+\.(js|cjs|mjs)|js\/[^/]+\.js|css\/[^/]+\.css|[^/]+\.html|sw\.js|scripts\/[^/]+\.(mjs|cjs|js)|\.github\/workflows\/[^/]+\.ya?ml)$/;

function files() {
  let list;
  try { list = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }).split('\n'); }
  catch (e) { list = []; }
  return list.filter((f) => f && INCLUDE.test(f) && !SKIP.test(f) && fs.existsSync(path.join(ROOT, f))).sort();
}

const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trim() + '…' : s);
function clean(s) {
  let t = s.replace(/\s+/g, ' ').trim();
  t = t.replace(/^[\w./\u0600-\u06FF-]+\.(?:js|cjs|mjs|css|html)\s*[—–:-]+\s*/i, '').replace(/^Vercel Serverless Function:\s*/i, '');
  for (let i = 0; i < 3; i++) t = t.replace(/^(v-[\w\u0600-\u06FF.-]+(\s*\d+)?(\s*\([^)]{0,200}\))?\s*[:：—–-]+\s*)/i, '').trim();
  t = t.replace(/[─━═]{2,}|={3,}|\s\*(?=\s)/g, ' ').replace(/\s+/g, ' ').trim();
  t = t.replace(/^[=\-*#\s]+|[=\-*#\s]+$/g, '').trim();
  for (let i = 0; i < 2; i++) t = t.replace(/^(v-[\w\u0600-\u06FF.-]+(\s*\d+)?(\s*\([^)]{0,200}\))?\s*[:：—–-]+\s*)/i, '').replace(/^v\d{2,4}:?\s+/i, '').trim();
  const cut = t.search(/[.؛۔](\s|$)/);
  if (cut > 30) t = t.slice(0, cut + 1);
  return clip(t, 150);
}

function firstComment(src, ext) {
  const lines = src.split('\n').slice(0, 60);
  if (ext === 'html') { const m = /<title[^>]*>([^<]{2,200})<\/title>/i.exec(src); if (m) return m[1].trim(); }
  if (ext === 'yml' || ext === 'yaml') { const m = /^name:\s*(.+)$/m.exec(src); return m ? m[1].replace(/^['"]|['"]$/g, '') : ''; }
  let buf = [];
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i].trim();
    if (!L || (!buf.length && i < 6 && /^(:root\s*\{|\(function\s*\(\)\s*\{|\(\(\)\s*=>\s*\{|['"]use strict['"];?)$/.test(L)) || /^['"]use strict['"];?$/.test(L) || /^\/\/\s*deploy-trigger/.test(L) || /^window\.[\w$]+\s*=/.test(L) || /^#!/.test(L) || /^<!doctype|^<html|^<head|^<meta/i.test(L)) { if (buf.length) break; continue; }
    if (/^\/\//.test(L)) { buf.push(L.replace(/^\/\/+\s?/, '')); continue; }
    if (/^\/\*/.test(L) || /^<!--/.test(L)) {
      let j = i, acc = [];
      for (; j < lines.length; j++) { acc.push(lines[j]); if (/\*\/|-->/.test(lines[j]) && (j > i || /\*\/|-->/.test(lines[j].replace(/^\s*(\/\*|<!--)/, '')))) break; }
      const text = acc.join(' ').replace(/^\s*(\/\*+|<!--)/, '').replace(/(\*+\/|-->)[\s\S]*$/, '').replace(/^\s*\*\s?/gm, '');
      if (text.replace(/[=\-*\s]/g, '').length > 3) return text;
      i = j; continue;
    }
    break;
  }
  return buf.join(' ');
}

function symbols(src, ext) {
  if (!/^(js|cjs|mjs)$/.test(ext)) return {};
  const fn = new Set(), ex = new Set(), tools = new Set();
  const lines = src.split('\n');
  for (const line of lines) {
    let m;
    if ((m = /^(?: {0,2})(?:export\s+)?(?:async\s+)?function\s*\*?\s*([\w$]+)\s*\(/.exec(line))) fn.add(m[1]);
    else if ((m = /^(?:export\s+)?(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|[\w$]+\s*=>)/.exec(line))) fn.add(m[1]);
    if ((m = /^window\.([\w$]+)\s*=/.exec(line))) ex.add(m[1]);
    if ((m = /^(?:module\.)?exports\.([\w$]+)\s*=/.exec(line))) ex.add(m[1]);
  }
  const me = /module\.exports\s*=\s*\{([\s\S]*?)\};?\s*$/m.exec(src) || /module\.exports\s*=\s*\{([^}]*)\}/.exec(src);
  if (me) me[1].replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '').split(',').forEach((k) => { const n = /^\s*([\w$]+)/.exec(k); if (n) ex.add(n[1]); });
  const tr = /\bname:\s*'([a-z][a-z0-9_]{2,40})',?\s*(?:\/\/[^\n]*)?\s*\n?\s*description:/g;
  let t; while ((t = tr.exec(src))) tools.add(t[1]);
  const out = {};
  if (fn.size) out.f = [...fn].slice(0, 150);
  if (ex.size) out.x = [...ex].slice(0, 80);
  if (tools.size) out.t = [...tools];
  return out;
}

/* عناصر الواجهة: id العنصر ونصّه الظاهر (aria-label/title/placeholder أو أوّل نصّ بعده) — لقطة المالك «احذف هذا المكان»
   تُطابَق بنصّها العربيّ فيُعرف الـid، ثمّ يُبحث عنه في css/ وjs/. */
function uiIndex(src) {
  const out = [], seen = new Set();
  const re = /<([a-z][a-z0-9-]*)\b([^<>]*?)\bid="([A-Za-z][\w-]{1,60})"([^<>]*)>([^<]{0,80})/g;
  let m;
  while ((m = re.exec(src))) {
    const id = m[3];
    if (seen.has(id) || /\$\{/.test(id)) continue;
    seen.add(id);
    const attrs = m[2] + ' ' + m[4];
    const a = /\b(?:aria-label|title|placeholder|data-i18n-label)="([^"]{2,60})"/.exec(attrs);
    let label = a ? a[1] : m[5].replace(/&[a-z#0-9]+;/gi, ' ').replace(/\$\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim();
    if (!/[\u0600-\u06FFA-Za-z]{2}/.test(label)) label = '';
    out.push(label ? id + '«' + clip(label, 40) + '»' : id);
  }
  return out;
}

function sizeClass(n) { return n < 100 ? n : Math.round(n / 50) * 50; }

function build() {
  const out = [];
  for (const f of files()) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const ext = f.split('.').pop().toLowerCase();
    const n = src.split('\n').length;
    const d = PURPOSE[f] || clean(firstComment(src, ext));
    const ui = (ext === 'html' || /^js\/partials-/.test(f)) ? uiIndex(src) : [];
    out.push(Object.assign({ p: f, n: sizeClass(n), d }, PURPOSE[f] ? { k: 1 } : {}, symbols(src, ext), ui.length ? { u: ui } : {}));
  }
  for (const k of ['index.html', 'vercel.json', 'package.json']) if (!out.some((e) => e.p === k) && fs.existsSync(path.join(ROOT, k))) out.push({ p: k, n: sizeClass(fs.readFileSync(path.join(ROOT, k), 'utf8').split('\n').length), d: PURPOSE[k], k: 1 });
  out.sort((a, b) => (a.p < b.p ? -1 : a.p > b.p ? 1 : 0));
  let tests = 0; try { tests = execSync('git ls-files tests', { cwd: ROOT, encoding: 'utf8' }).split('\n').filter((x) => /\.test\.cjs$/.test(x)).length; } catch (e) {}
  return { v: 1, tests, files: out };
}

function serialize(m) {
  return '{"v":' + m.v + ',"tests":' + m.tests + ',"files":[\n' + m.files.map((e) => JSON.stringify(e)).join(',\n') + '\n]}\n';
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const text = serialize(build());
  if (process.argv.includes('--check')) {
    const old = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (old !== text) { console.log('codemap: الخريطة قديمة — npm run codemap'); process.exit(1); }
    console.log('codemap: محدّثة'); process.exit(0);
  }
  fs.writeFileSync(OUT, text);
  console.log('codemap: ' + JSON.parse(text).files.length + ' ملفًّا · ' + text.length + ' حرفًا → api/_lib/codemap.json');
}

export { build, serialize, PURPOSE };
