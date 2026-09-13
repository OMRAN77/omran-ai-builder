// cc-bridge/policy.mjs — v-cc-bridge: قواعد صافية بلا شبكة ولا SDK (تُختبر مباشرةً).
//
// أمر عمران ١٣ سبتمبر: «أريد كلاود كود خام وليس تركيبًا من عندك، تزيد عليه النشر
// والدمج بأمري فقط»، ثمّ: «لا تنشر إلى أن تصله إلى مستواك وصلاحيّتك». فالجسر يشغّل
// Claude Code نفسه (حزمة الوكيل الرسميّة) بصلاحيّات جلسة المالك على الويب: بحث الويب
// وجلبه، الشبكة من داخل الأوامر، الجلب والسحب والدفع إلى أيّ فرع غير الرئيسيّ، وفتح
// طلبات السحب وقراءتها وفحوصها بـgh. ولا يزيد إلّا ثلاثة أشياء:
//   ① سياج ضيّق (الأبواب المقفلة): لا دفع إلى main/master ولا دفع قسريّ، لا دمج طلب
//      سحب، لا نشر على Vercel ولا نشر حزم، لا رجوع مدمّر عن التغييرات، لا صلاحيّات
//      نظام، ولا مسّ للأسرار ولا لإعدادات السياج نفسه. الدمج يجريه الجسر وحده عند أمر
//      المالك الصريح («انشر» = طلب سحب، «ادمج» = دمج).
//   ② سطور تُلحق بتعليمات النظام تشرح ذلك (لا تعليمات أسلوب ولا شخصيّة).
//   ③ سجلّ أحداث لكلّ تشغيل يمكن الرجوع إليه إن انقطع الاتّصال.
'use strict';

/**
 * الأدوات المسموحة بلا سؤال (لا تمرّ على decideTool أصلًا) — ما لا يتغيّر حكمه
 * بتغيّر معطياته. كلّ ما قد يحمل بابًا مقفلًا (git push، gh، curl، rm، env…) يبقى
 * خارج هذه القائمة فيمرّ على decideTool ويُفحص أمرًا أمرًا.
 */
export const ALLOWED_TOOLS = [
  'Read', 'Edit', 'MultiEdit', 'Write', 'NotebookEdit', 'Glob', 'Grep', 'LS', 'TodoWrite', 'Task',
  'WebFetch', 'WebSearch',
  'Bash(npm run *)', 'Bash(npm test*)', 'Bash(npm ci*)', 'Bash(npm install*)', 'Bash(npm i *)', 'Bash(npm ls*)', 'Bash(npm view*)',
  'Bash(npx *)', 'Bash(node *)', 'Bash(python3 *)', 'Bash(pip *)', 'Bash(pip3 *)',
  'Bash(git status*)', 'Bash(git diff*)', 'Bash(git log*)', 'Bash(git show*)', 'Bash(git add*)',
  'Bash(git commit*)', 'Bash(git checkout*)', 'Bash(git switch*)', 'Bash(git stash*)', 'Bash(git restore*)',
  'Bash(git rev-parse*)', 'Bash(git rev-list*)', 'Bash(git merge*)', 'Bash(git rebase*)', 'Bash(git cherry-pick*)',
  'Bash(git fetch*)', 'Bash(git pull*)', 'Bash(git tag*)', 'Bash(git blame*)', 'Bash(git ls-files*)', 'Bash(git grep*)',
  'Bash(gh pr create*)', 'Bash(gh pr view*)', 'Bash(gh pr list*)', 'Bash(gh pr checks*)', 'Bash(gh pr status*)',
  'Bash(gh pr diff*)', 'Bash(gh pr comment*)', 'Bash(gh run list*)', 'Bash(gh run view*)', 'Bash(gh run watch*)',
  'Bash(gh issue list*)', 'Bash(gh issue view*)', 'Bash(gh search*)',
  'Bash(ls*)', 'Bash(cat*)', 'Bash(head*)', 'Bash(tail*)', 'Bash(sed*)', 'Bash(grep*)', 'Bash(rg*)', 'Bash(jq*)',
  'Bash(find*)', 'Bash(wc*)', 'Bash(mkdir*)', 'Bash(cp*)', 'Bash(mv*)', 'Bash(echo*)', 'Bash(printf*)',
  'Bash(diff*)', 'Bash(sort*)', 'Bash(uniq*)', 'Bash(cut*)', 'Bash(awk*)', 'Bash(tr*)', 'Bash(tee*)', 'Bash(stat*)',
  'Bash(true)', 'Bash(pwd)', 'Bash(date*)', 'Bash(which*)', 'Bash(chmod*)', 'Bash(touch*)', 'Bash(sleep*)', 'Bash(timeout*)',
];

/** أدوات مرفوضة بالمطلق: لا شيء — Claude Code بأدواته كلّها كجلسة المالك على الويب. */
export const DENIED_TOOLS = [];

/** الأبواب المقفلة في الأوامر — ما يُرفض دائمًا ولو طلبه النموذج. */
export const DENY_RULES = [
  { re: /\bgh\s+pr\s+merge\b/, why: 'الدمج بأمر المالك «ادمج» وحده.' },
  { re: /\bgh\s+(auth|secret|variable|ssh-key|gpg-key|config)\b/, why: 'مفاتيح GitHub وإعداداته لا تُمسّ.' },
  { re: /\bgh\s+repo\s+(delete|archive|unarchive|rename|edit|sync|create|fork|deploy-key|set-default)\b/, why: 'المستودع نفسه لا يُمسّ.' },
  { re: /\bgh\s+release\s+(create|delete|edit|upload|delete-asset)\b/, why: 'الإصدارات بيد المالك.' },
  { re: /\bgh\s+(workflow\s+(run|enable|disable)|run\s+(cancel|delete)|issue\s+delete)\b/, why: 'تشغيل سير العمل وحذفه بيد المالك (المشاهدة وإعادة التشغيل مسموحتان).' },
  { re: /\bgh\s+api\b(?=.*\s(?:-X|--method)[\s=]+(?!GET\b)\w)/i, why: 'gh api للقراءة فقط (GET).' },
  { re: /\bgh\s+api\b(?=.*\s(?:-f|-F|--field|--raw-field|--input)\b)/, why: 'gh api للقراءة فقط (GET).' },
  { re: /\bgit\s+remote\s+(add|set-url|remove|rm|rename)\b/, why: 'المستودع البعيد ثابت.' },
  { re: /\bgit\s+branch\s+(-D|-d|--delete)\s+(main|master)\b/, why: 'الفرع الرئيسيّ لا يُحذف.' },
  { re: /\bvercel\b(?!\s+(ls|list|inspect|logs|whoami|help|--version|-v)\b)/, why: 'النشر على Vercel بيد المالك (يدمج من التطبيق فينشر Vercel من main).' },
  { re: /\b(npm|pnpm|yarn)\s+(publish|unpublish|deprecate|dist-tag|owner|token|login|adduser|access)\b/, why: 'نشر الحزم بيد المالك.' },
  { re: /\bgit\s+(reset\s+--hard|clean\s+-\S*[fx]|checkout\s+--\s+\.)/, why: 'الرجوع المدمّر عن التغييرات بأمر المالك «تراجع» وحده.' },
  { re: /\brm\s+(?:-\S+\s+)*(?:\/|~|\$HOME|\/work(?:\/repo|\/state)?|\/app|\.git|\.|\.\.|\*)\/?(?=\s|$)/, why: 'حذف المستودع أو النظام ممنوع.' },
  { re: /(^|[\s;&|])(sudo|su|doas)\b|\b(shutdown|reboot|halt|poweroff|systemctl|pkill|killall)\b/, why: 'لا صلاحيّات نظام ولا إيقاف للخدمات.' },
  { re: /\.env(?!\.example\b)(\.[\w-]+)?\b|\.npmrc\b|\b(AUTH_SECRET|ANTHROPIC_API_KEY|GH_TOKEN|GITHUB_TOKEN|CLAUDE_CODE_OAUTH_TOKEN|CC_BRIDGE_SECRET)\b|\/work\/state\b|\.claude\/settings/, why: 'ملفّات البيئة والأسرار وإعدادات السياج لا تُقرأ ولا تُكتب.' },
  { re: /(^|[\s;&|])(printenv|env)\s*($|[;&|>])/, why: 'لا طباعة للبيئة كاملة (فيها الأسرار).' },
];

const PUSH_FLAGS_DENIED = /^(-f|--force|--force-with-lease(=.*)?|--force-if-includes|-d|--delete|--mirror|--all|--branches|--prune)$/;

/** فحص git push وحده: فرع مسمّى غير الرئيسيّ، بلا قسر ولا حذف — وإلّا رُفض. */
export function checkGitPush(segment) {
  const m = /\bgit\s+(?:-C\s+\S+\s+)?push\b(.*)$/.exec(String(segment || ''));
  if (!m) return '';
  const args = m[1].replace(/[)`]+$/, '').trim().split(/\s+/).filter(Boolean);
  const positional = [];
  for (const a of args) {
    if (PUSH_FLAGS_DENIED.test(a)) return 'لا دفع قسريّ ولا حذف فروع ولا دفع كلّ الفروع.';
    if (a.startsWith('-')) continue;
    positional.push(a);
  }
  if (positional.length < 2) return 'اذكر الوجهة صراحةً: git push -u origin <branch> — لا دفع ضمنيًّا قد يصيب main.';
  for (const ref of positional.slice(1)) {
    if (ref.startsWith('+')) return 'لا دفع قسريّ.';
    if (ref.startsWith(':') || ref.endsWith(':')) return 'لا حذف فروع عن بُعد.';
    const dst = (ref.includes(':') ? ref.slice(ref.indexOf(':') + 1) : ref).replace(/^refs\/heads\//, '');
    if (!dst) return 'لا حذف فروع عن بُعد.';
    if (/^(main|master)$/i.test(dst)) return 'الدفع إلى main ممنوع: ادفع فرعًا وافتح طلب سحب، والمالك يدمج بأمر «ادمج».';
    if (/^HEAD$/i.test(dst)) return 'اذكر اسم الفرع بدل HEAD.';
    if (/[$`()]/.test(dst)) return 'اذكر اسم الفرع حرفيًّا لا عبر متغيّر.';
  }
  return '';
}

/** يقسّم سطر الأوامر إلى مقاطع (&& || ; | & وأسطر) ليُفحص كلّ أمر على حدة. */
export function commandSegments(cmd) {
  return String(cmd || '').split(/\|\||&&|[;|&\n]/).map((s) => s.trim()).filter(Boolean);
}

/** سبب الرفض لأمر Bash كامل، أو '' إن كان مسموحًا. */
export function denyReason(cmd) {
  const s = String(cmd || '');
  for (const r of DENY_RULES) if (r.re.test(s)) return r.why;
  for (const seg of commandSegments(s)) { const why = checkGitPush(seg); if (why) return why; }
  return '';
}

/** مسارات الملفّات التي لا تُمسّ بأدوات القراءة والتعديل (الأسرار، وسياج الجسر نفسه). */
const PROTECTED_PATH = /(^|\/)\.env(?!\.example$)(\.[\w-]+)?$|(^|\/)\.npmrc$|(^|\/)\.git\/|^\/work\/state(\/|$)|^\/app(\/|$)|(^|\/)\.claude\/settings(\.local)?\.json$/;

/**
 * قرار الأداة عند سؤال Claude Code: يعود بالشكل الذي ينتظره canUseTool.
 * الأدوات المسموحة مسبقًا لا تصل هنا أصلًا؛ ما يصل هو Bash خارج القائمة أو أداة أخرى.
 * الأصل الإباحة (كجلسة المالك على الويب) إلّا الأبواب المقفلة أعلاه.
 */
export function decideTool(name, input) {
  const tool = String(name || '');
  if (DENIED_TOOLS.includes(tool)) return { behavior: 'deny', message: 'هذه الأداة معطّلة في الجسر.' };
  if (tool === 'Bash') {
    const why = denyReason((input && input.command) || '');
    return why ? { behavior: 'deny', message: why } : { behavior: 'allow', updatedInput: input };
  }
  const p = String((input && (input.file_path || input.path || input.notebook_path)) || '');
  if (p && PROTECTED_PATH.test(p)) return { behavior: 'deny', message: 'ملفّات البيئة والأسرار وإعدادات السياج لا تُمسّ.' };
  return { behavior: 'allow', updatedInput: input };
}

/** الإضافة الوحيدة على تعليمات Claude Code — الحدود، لا الأسلوب. */
export const RULES_APPEND = [
  'أنت تعمل داخل مستودع المالك عبر جسر خاصّ به، بصلاحيّات جلسته على الويب: بحث الويب وجلبه، الشبكة من داخل الأوامر، git fetch/pull، الدفع إلى فرع غير main، وفتح طلبات السحب وقراءة فحوصها بـgh. القواعد الإضافيّة الوحيدة:',
  '- اعمل دائمًا على فرع غير main (أنشئ cc/<اسم-قصير> إن كنت على main) والتزم برسائل واضحة. لا تدفع إلى main أبدًا ولا دفعًا قسريًّا.',
  '- لا تدمج طلب سحب ولا تنشر على Vercel ولا تنشر حزمًا: المالك يدمج بأمر «ادمج» من التطبيق فينشر Vercel من main. «انشر» عنده = دفع الفرع وفتح طلب السحب؛ وإن طلب ذلك منك في المهمّة فادفع الفرع وافتح الطلب بـgh pr create وأعطه الرابط.',
  '- لا تقرأ ولا تكتب ملفّات البيئة والأسرار (.env، الرموز) ولا /work/state ولا .claude/settings؛ والرجوع المدمّر عن التغييرات (git reset --hard) بأمر المالك «تراجع» وحده.',
  '- بعد أيّ تعديل على js/app-NN-*.js أو js/partials-*.js شغّل npm run bundle، ثمّ npm run ci حتّى يمرّ قبل أن تقول إنّك انتهيت.',
  '- اختم كلّ مهمّة بسطور: ماذا غيّرت، كيف تحقّقت، ورابط طلب السحب إن فتحته.',
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
  for (const k of ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'GITHUB_TOKEN', 'GH_TOKEN', 'CC_BRIDGE_SECRET']) {
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
  if (name === 'WebSearch') return 'بحث في الويب «' + s(i.query, 80) + '»';
  if (name === 'WebFetch') return 'جلب ' + s(i.url, 100);
  if (name === 'Task') return 'مهمّة فرعيّة: ' + s(i.description || i.prompt, 100);
  return name + (Object.keys(i).length ? ' ' + s(JSON.stringify(i), 100) : '');
}
