#!/usr/bin/env node
// scripts/repo-map.mjs — v-repo-map (المالك ١٥ أكتوبر: «أوصل للمزوّدين معلومات الكود… أوصلهم لمستوى كودي»): Claude Code يبدأ
// الجلسة وخريطة المستودع في رأسه (CLAUDE.md)؛ المزوّد في المحادثة كان يبدأ كلّ ردّ بالبحث من الصفر (٣ إلى ٥ جولات). هذا السكربت
// يولّد api/_lib/repo-map.js — ثابت REPO_NOTE يُحقن في الكتلة الثابتة المخزَّنة لنظام المالك عند كلّ مزوّد — من المستودع نفسه:
// أجزاء الواجهة، الملفّات المنفصلة، موجّهات الخادم، مكتبة الخادم (مع وظيفة الملفّات المركزيّة)، الاختبارات والمعرفة، وأحدث
// الفخاخ المثبتة (عناوينها من knowledge/PITFALLS.md). وقت البناء لا وقت التشغيل: api/*.js تُحمَّل عارية ولا تقرأ ملفّات المعرفة.
//
//   node scripts/repo-map.mjs          يكتب api/_lib/repo-map.js (يُستدعى من npm run bundle)
//   import { buildMap }                للاختبار: يبني النصّ نفسه في الذاكرة
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..');
export const OUT = 'api/_lib/repo-map.js';
export const PITFALLS_N = 10;
export const MAX_CHARS = 7000;

// وظيفة الملفّات المركزيّة في api/_lib — مكتوبة يدًا ممّا قُرئ فعلًا؛ غير المذكور يُسرد باسمه (الاسم نفسه خريطة).
const LIB_PURPOSE = {
  'chat': 'المحادثة الرئيسيّة: النظام، الأدوات، حلقة المالك، المسارات',
  'agent': 'وكيل التطبيق (مهامّ طويلة بالأدوات نفسها)',
  'agent-delegate': 'التفويض إلى GitHub Actions',
  'owner-loop': 'حلقة المالك: الخطوات والمهل والإعادة (C1–C6) واستئناف «كمل»',
  'owner-think': 'التفكير والجهد لكلّ مزوّد عند المالك',
  'owner-carry': 'حمل «نفّذ الآن» إن توقّف المزوّد بعد القراءة',
  'owner-media': 'بوّابة الرسم/الفيديو المدفوعة (الطلب في الرسالة الأخيرة)',
  'owner-vision': 'من يرى الصور على أيّ مسار',
  'provider-level': 'منهج Claude Code للمالك (OWNER_METHOD) وبطاقة مستوى العائلة والموديل',
  'provider-models': 'قوائم الموديلات الحيّة من الوسيط وبياناتها الوصفيّة والافتراضيّ الحيّ',
  'oa-direct': 'المسارات المباشرة (OpenAI، Groq، Kimi، Gemini، Perplexity) وترجمة البروتوكول',
  'free-chain': 'سلاسل الاحتياط لغير المالك وكشف «موديل غير موجود»',
  'tier': 'الباقات وتوجيهها والدور الصعب (isStrongTurn)',
  'github-read': 'read_github: شجرة، ملفّ بأسطر، بحث محتوى (الدالّة الحاوية والمستدعون)، التزامات وفروق',
  'github-edit': 'edit_github برقع حرفيّة، merge_github، WORK_NOTE (قواعد العمل لكلّ مزوّد)',
  'github-write': 'write_github للملفّات والصور الجديدة وطلب السحب والحزمة التلقائيّة',
  'github-manage': 'manage_github: status · deploy · ci · test · shots · runs · run_log · close…',
  'branch-shots': 'فاحصا جهاز اللقطات (branch-shots.yml)',
  'branch-test': 'فاحص جهاز الاختبار الواحد (branch-test.yml)',
  'bundle-core': 'بناء الحزمة js/app.bundle.js وبصمتها (يشاركه الخادم والسكربت)',
  'app-errors': 'read_app_errors: سجلّ أخطاء الإنتاج الحيّ',
  'secrets': 'خزنة الأسرار',
  'kv': 'التخزين KV',
  'auth': 'الجلسات والرموز',
  '_owner': 'من هو المالك',
  '_knowledge': 'ملخّص معرفة المالك الثابت (BRIEF)',
  'safe-url': 'جلب آمن (منع SSRF) مع التحويلات',
  'log-error': 'تسجيل الأخطاء',
  'cost-meter': 'أسعار الموديلات وحساب الكلفة',
  'analyze-zip': 'فكّ الأرشيفات',
  'repo-map': 'هذه الخريطة (مولَّدة)',
};

const slug = (f, re) => (re.exec(f) || [])[1] || '';
function pitfallTitles(md) {
  const out = [];
  for (const line of String(md).split('\n')) {
    const m = /^- \*\*(.+?)\*\*/.exec(line);
    if (!m) continue;
    const t = m[1].replace(/`/g, '').replace(/[:：]\s*$/, '').trim();
    if (t) out.push(t.length > 110 ? t.slice(0, 109) + '…' : t);
    if (out.length >= PITFALLS_N) break;
  }
  return out;
}

export function buildMap(root = ROOT) {
  const ls = (d, re) => readdirSync(path.join(root, d)).filter((f) => re.test(f)).sort();
  const parts = ls('js', /^app-\d+-.+\.js$/).map((f) => slug(f, /^app-(\d+-.+)\.js$/));
  const partials = ls('js', /^partials-.+\.js$/).map((f) => slug(f, /^partials-(.+)\.js$/));
  const routes = ls('api', /^[^_].*\.js$/).map((f) => f.replace(/\.js$/, ''));
  const libs = ls('api/_lib', /\.js$/).map((f) => f.replace(/\.js$/, ''));
  const central = libs.filter((n) => LIB_PURPOSE[n]).map((n) => n + ' (' + LIB_PURPOSE[n] + ')');
  const rest = libs.filter((n) => !LIB_PURPOSE[n]);
  const pitfalls = pitfallTitles(readFileSync(path.join(root, 'knowledge/PITFALLS.md'), 'utf8'));
  const note = '[خريطة المستودع OMRAN77/omran-ai-builder — مولَّدة من الكود نفسه؛ ما هنا لا تبحث عنه، واذهب إليه مباشرة بـread_github]:\n'
    + '• الواجهة: index.html + js/app-NN-*.js (' + parts.length + ' جزءًا تُلصق بالترتيب في js/app.bundle.js تلقائيًّا عند الرفع؛ رأس كلّ جزء تعليق يشرحه): ' + parts.join(' · ') + '.\n'
    + '• ملفّات تُحمَّل منفصلة بوسم ?v= في index.html (ارفع الرقم عند تغييرها): js/partials-' + partials.join('.js · js/partials-') + '.js؛ css/tokens.css الأنماط؛ js/app-03-i18n-data.js وi18n/*.js النصوص بالـ١٤ لغة.\n'
    + '• الخادم: api/*.js موجّهات Vercel (' + routes.join(' · ') + ') توزّع الإجراءات على api/_lib/*.js.\n'
    + '• api/_lib المركزيّة: ' + central.join('؛ ') + '.\n'
    + '• بقيّة api/_lib (' + rest.length + ' ملفًّا، الاسم يدلّ): ' + rest.join(' · ') + '.\n'
    + '• الاختبارات: tests/*.test.cjs بـnode:test، كلّ ملفّ مسجّل في سلسلة test في package.json (test-registry يفرضه)؛ الفحص الكامل npm run ci (check + guard + coldstart + verify + test). المعرفة: knowledge/DECISIONS.md (سجلّ القرارات، الأحدث في الرأس) · knowledge/PITFALLS.md (فخاخ مثبتة) · knowledge/ROUTING.md (خريطة التوجيه بأرقام الأسطر) · CLAUDE.md (قواعد العمل).\n'
    + '• أحدث الفخاخ المثبتة (PITFALLS.md، الأحدث أوّلًا — التفاصيل في الملفّ): ' + pitfalls.map((t, i) => (i + 1) + ') ' + t).join(' ') + '.';
  return { note, parts, partials, routes, libs, pitfalls };
}

export function render(map) {
  return "'use strict';\n/* مولَّد — لا يُحرَّر يدويًّا: node scripts/repo-map.mjs (v-repo-map). يُحقن في الكتلة الثابتة لنظام المالك عند كلّ مزوّد. */\n"
    + 'const REPO_NOTE = ' + JSON.stringify(map.note) + ';\n'
    + 'const PITFALLS = ' + JSON.stringify(map.pitfalls) + ';\n'
    + 'module.exports = { REPO_NOTE, PITFALLS };\n';
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const map = buildMap();
  if (map.note.length > MAX_CHARS) { console.error('✗ الخريطة ' + map.note.length + ' حرفًا — فوق السقف ' + MAX_CHARS + '؛ قصّ LIB_PURPOSE أو PITFALLS_N.'); process.exit(1); }
  writeFileSync(path.join(ROOT, OUT), render(map));
  console.log('✓ ' + OUT + ' · ' + map.note.length + ' حرفًا · ' + map.parts.length + ' جزءًا · ' + map.libs.length + ' ملفّ مكتبة · ' + map.pitfalls.length + ' فخاخ');
}
