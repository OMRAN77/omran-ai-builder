// cc-bridge/policy.mjs — v-cc-bridge: قواعد صافية بلا شبكة ولا SDK (تُختبر مباشرةً).
//
// أمر عمران ١٣ سبتمبر: «أريد كلاود كود خام وليس تركيبًا من عندك، تزيد عليه النشر
// والدمج بأمري فقط». فالجسر لا يبني وكيلًا: يشغّل Claude Code نفسه (حزمة الوكيل
// الرسميّة) على نسخة المستودع، ولا يضيف إلّا ثلاثة أشياء:
//   ① سياج الأدوات: كلّ شيء يعمل محلّيًّا كما في أيّ جلسة، إلّا الدفع والنشر والدمج
//      وأيّ عبور للشبكة من داخل الأوامر — هذه لا يفعلها Claude Code أبدًا؛ يفعلها
//      الجسر وحده عند أمر المالك الصريح (/publish و/merge).
//   ② سطر واحد يُلحق بتعليمات النظام يشرح ذلك (لا تعليمات أسلوب ولا شخصيّة).
//   ③ سجلّ أحداث لكلّ تشغيل يمكن الرجوع إليه إن انقطع الاتّصال.
'use strict';

/** الأدوات المسموحة بلا سؤال (Claude Code يعمل بطبيعته داخل المستودع). */
export const ALLOWED_TOOLS = [
  'Read', 'Edit', 'MultiEdit', 'Write', 'Glob', 'Grep', 'LS', 'TodoWrite', 'Task',
  'Bash(npm *)', 'Bash(npx *)', 'Bash(node *)', 'Bash(python3 *)',
  'Bash(git status*)', 'Bash(git diff*)', 'Bash(git log*)', 'Bash(git show*)', 'Bash(git add*)',
  'Bash(git commit*)', 'Bash(git checkout*)', 'Bash(git switch*)', 'Bash(git branch*)',
  'Bash(git stash*)', 'Bash(git restore*)', 'Bash(git rev-parse*)', 'Bash(git merge*)',
  'Bash(ls*)', 'Bash(cat*)', 'Bash(head*)', 'Bash(tail*)', 'Bash(sed*)', 'Bash(grep*)',
  'Bash(find*)', 'Bash(wc*)', 'Bash(mkdir*)', 'Bash(cp*)', 'Bash(mv*)', 'Bash(rm *)', 'Bash(echo*)',
  'Bash(printf*)', 'Bash(diff*)', 'Bash(sort*)', 'Bash(uniq*)', 'Bash(cut*)', 'Bash(awk*)', 'Bash(tr*)',
  'Bash(true)', 'Bash(pwd)', 'Bash(date*)', 'Bash(env)', 'Bash(which*)', 'Bash(chmod*)', 'Bash(touch*)',
];

/** ما يُرفض دائمًا ولو طلبه النموذج — الدفع والنشر والدمج والشبكة والأسرار. */
export const DENY_RULES = [
  { re: /\bgit\s+push\b/, why: 'الدفع إلى GitHub يجريه الجسر وحده عند أمر المالك «انشر».' },
  { re: /\bgh\s+(pr|repo|api|release|workflow|run)\b/, why: 'طلبات السحب والدمج بأمر المالك وحده.' },
  { re: /\bgit\s+(remote\s+(add|set-url)|fetch|pull)\b/, why: 'الشبكة من داخل الأوامر ممنوعة؛ الجسر يجلب من المستودع بنفسه.' },
  { re: /\b(curl|wget|ssh|scp|rsync|nc|netcat|telnet)\b/, why: 'لا عبور للشبكة من داخل الأوامر.' },
  { re: /\bvercel\b/, why: 'النشر بيد المالك.' },
  { re: /\b(npm|pnpm|yarn)\s+publish\b/, why: 'النشر بيد المالك.' },
  { re: /\bgit\s+(reset\s+--hard|clean)\b/, why: 'الرجوع عن التغييرات بأمر المالك «تراجع» وحده.' },
  { re: /\bgit\s+push\b.*--force/, why: 'ممنوع.' },
  { re: /(^|[\s;&|])(sudo|su)\b/, why: 'لا صلاحيّات نظام.' },
  { re: /\.(env|npmrc)\b|\bAUTH_SECRET\b|\bANTHROPIC_API_KEY\b|\bGITHUB_TOKEN\b|CLAUDE_CODE_OAUTH_TOKEN|CC_BRIDGE_SECRET/, why: 'ملفّات البيئة والأسرار لا تُقرأ ولا تُكتب.' },
];

/** أدوات غير محلّيّة لا يحتاجها العمل على المستودع، تُرفض بلا نقاش. */
export const DENIED_TOOLS = ['WebFetch', 'WebSearch'];

/**
 * قرار الأداة عند سؤال Claude Code: يعود بالشكل الذي ينتظره canUseTool.
 * الأدوات المسموحة مسبقًا لا تصل هنا أصلًا؛ ما يصل هو Bash خارج القائمة أو أداة أخرى.
 */
export function decideTool(name, input) {
  const tool = String(name || '');
  if (DENIED_TOOLS.includes(tool)) return { behavior: 'deny', message: 'هذه الأداة معطّلة في الجسر (العمل محلّيّ على المستودع فقط).' };
  if (tool === 'Bash') {
    const cmd = String((input && input.command) || '');
    for (const r of DENY_RULES) if (r.re.test(cmd)) return { behavior: 'deny', message: r.why };
    return { behavior: 'allow', updatedInput: input };
  }
  if (/^(Read|Edit|MultiEdit|Write|Glob|Grep|LS|TodoWrite|Task|NotebookEdit)$/.test(tool)) {
    const p = String((input && (input.file_path || input.path || input.notebook_path)) || '');
    if (/(^|\/)\.(env|npmrc)(\.|$)|(^|\/)\.git\//.test(p)) return { behavior: 'deny', message: 'ملفّات البيئة والأسرار لا تُمسّ.' };
    return { behavior: 'allow', updatedInput: input };
  }
  return { behavior: 'deny', message: 'أداة غير مفعّلة في الجسر: ' + tool };
}

/** الإضافة الوحيدة على تعليمات Claude Code — الحدود، لا الأسلوب. */
export const RULES_APPEND = [
  'أنت تعمل داخل مستودع المالك عبر جسر خاصّ به. القواعد الإضافيّة الوحيدة:',
  '- لا تدفع إلى GitHub ولا تفتح طلب سحب ولا تدمج ولا تنشر؛ المالك يأمر بذلك من التطبيق («انشر» ثمّ «ادمج») والجسر ينفّذه. اعمل والتزم محلّيًّا على الفرع الحاليّ فقط.',
  '- لا شبكة من داخل الأوامر (curl/wget/gh/git fetch) ولا قراءة ملفّات البيئة أو الأسرار.',
  '- بعد أيّ تعديل على js/app-NN-*.js أو js/partials-*.js شغّل npm run bundle، ثمّ npm run ci حتّى يمرّ قبل أن تقول إنّك انتهيت.',
  '- اختم كلّ مهمّة بسطرين: ماذا غيّرت وكيف تحقّقت.',
].join('\n');

/** اسم فرع للرفع من عنوان المهمّة. */
export function slugBranch(title, now) {
  const s = String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'task';
  return 'cc/' + s + '-' + (Number(now) || Date.now()).toString(36);
}

/** الكلمات الآمرة التي يكتبها المالك في الصندوق بدل الأزرار — بالضبط، لا ضمن جملة. */
export function commandWord(text) {
  const t = String(text || '').trim().replace(/[!.،؟]+$/, '');
  if (/^(انشر|ارفع|publish|push)$/i.test(t)) return 'publish';
  if (/^(ادمج|merge)$/i.test(t)) return 'merge';
  if (/^(تراجع|reset)$/i.test(t)) return 'reset';
  if (/^(الحالة|status)$/i.test(t)) return 'status';
  if (/^(جلسة جديدة|new session)$/i.test(t)) return 'new';
  return '';
}

/** تنقيح قيم الأسرار من أيّ نصّ يخرج للمالك (الدفتر أو الخطأ). */
export function redact(text, env) {
  let s = String(text == null ? '' : text);
  const e = env || process.env;
  for (const k of ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'GITHUB_TOKEN', 'CC_BRIDGE_SECRET']) {
    const v = e[k]; if (v && v.length >= 8) s = s.split(v).join('[' + k + ']');
  }
  return s.replace(/sk-ant-[A-Za-z0-9_\-]{10,}/g, '[key]').replace(/gh[pousr]_[A-Za-z0-9]{20,}/g, '[token]');
}

/** سجلّ أحداث تشغيل واحد: يُبثّ حيًّا ويُعاد من أيّ نقطة إن انقطع الاتّصال. */
export class RunLog {
  constructor(id) { this.id = id; this.events = []; this.done = false; this.waiters = []; this.startedAt = Date.now(); }
  push(ev) { this.events.push(ev); const w = this.waiters.splice(0); for (const f of w) f(); }
  end() { this.done = true; const w = this.waiters.splice(0); for (const f of w) f(); }
  since(i) { return this.events.slice(Math.max(0, Number(i) || 0)); }
  wait(ms) { return new Promise((res) => { const t = setTimeout(() => { this.waiters = this.waiters.filter((f) => f !== fn); res(); }, ms); const fn = () => { clearTimeout(t); res(); }; this.waiters.push(fn); }); }
}

/** ملخّص قصير لمدخل أداة يُعرض في السجلّ (بلا أسرار وبلا محتوى ملفّات كامل). */
export function briefTool(name, input) {
  const i = input && typeof input === 'object' ? input : {};
  const s = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
  if (name === 'Bash') return '$ ' + s(i.command, 140);
  if (name === 'Read') return 'قراءة ' + s(i.file_path, 100);
  if (name === 'Edit' || name === 'MultiEdit') return 'تعديل ' + s(i.file_path, 100);
  if (name === 'Write') return 'كتابة ' + s(i.file_path, 100);
  if (name === 'Glob') return 'بحث ملفّات ' + s(i.pattern, 80);
  if (name === 'Grep') return 'بحث نصّ «' + s(i.pattern, 60) + '»';
  if (name === 'Task') return 'مهمّة فرعيّة: ' + s(i.description || i.prompt, 100);
  return name + (Object.keys(i).length ? ' ' + s(JSON.stringify(i), 100) : '');
}
