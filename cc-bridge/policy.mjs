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
  // v-sec-bridge-interp: node/npx/python3/pip لم تعد مسموحة مسبقًا — تمرّ الآن على decideTool فتُفحص.
  // كانت الموافقة المسبقة تتخطّى كلّ قواعد المنع، فـ«node -e» أو «python3 -c» يشغّل git push أو يقرأ
  // الأسرار بلا أيّ فحص. «node ملف.js» يبقى مسموحًا (لا يطابق قاعدة منع)، والمحظور هو التنفيذ السطريّ.
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
  // v-sec-bridge-interp: التنفيذ السطريّ لمفسّر (node -e/-p، python -c، ruby/perl/php -e، أو قراءة من stdin «-»)
  // يشغّل أيّ أمر فيتخطّى كلّ ما تحته — فيُرفض. تشغيل ملفّ (node script.js) يبقى مسموحًا.
  { re: /\b(?:node|nodejs|deno|bun|python|python3|ruby|perl|php)\s+(?:-{1,2}\S+\s+)*-(?:e|p|c|print|eval)\b/i, why: 'تشغيل كود سطريّ بمفسّر ممنوع — استعمل ملفًّا أو سكربت npm.' },
  { re: /\b(?:node|nodejs|deno|bun|python|python3|ruby|perl|php)\s+-\s*(?:$|[<;|&])/i, why: 'تمرير كود عبر stdin لمفسّر ممنوع.' },
  { re: /(^|[|&;])\s*(?:cat|echo|printf)\b[^|]*\|\s*(?:node|nodejs|deno|bun|python|python3|ruby|perl|php|sh|bash|zsh)\b/i, why: 'أنبوب إلى مفسّر لتشغيل كود ممنوع.' },
  // أغلفة الصدفة والتنفيذ غير المباشر: bash -c/sh -c/eval/xargs/env تُعيد تشغيل أمر فتلتفّ على الفحص.
  { re: /(^|[\s;&|(])(?:bash|sh|zsh|dash)\s+-[a-z]*c\b/i, why: 'صدفة فرعيّة (-c) تلتفّ على الفحص — ممنوعة.' },
  { re: /(^|[\s;&|(])(?:eval|exec|source)\b|(^|[\s;&|(])\.\s+\//i, why: 'eval/exec/source تلتفّ على الفحص — ممنوعة.' },
  { re: /(^|[\s;&|(])(?:xargs|timeout|nohup|setsid|nice|ionice|stdbuf|watch)\b/i, why: 'تغليف أمرٍ بأداةٍ أخرى (timeout/xargs…) يلتفّ على الفحص — نفّذ الأمر مباشرةً.' },
  { re: /(^|[\s;&|(])npx\b/i, why: 'npx يجلب ويشغّل حزمةً من الشبكة — استعمل سكربت npm معرَّفًا.' },
  // كتابة سير العمل والإعدادات: المالك وحده يلمس .github (الوكيل يلتزم على فرع ويُراجَع).
  { re: /(^|[\s;&|=(])(?:\.?\/)?\.github\//i, why: 'ملفّات .github لا تُكتب من الجسر — بيد المالك.' },
  { re: /\bgh\s+pr\s+merge\b/, why: 'الدمج بأمر المالك «ادمج» وحده.' },
  { re: /\bgh\s+(auth|secret|variable|ssh-key|gpg-key|config)\b/, why: 'مفاتيح GitHub وإعداداته لا تُمسّ.' },
  { re: /\bgh\s+repo\s+(delete|archive|unarchive|rename|edit|sync|create|fork|deploy-key|set-default)\b/, why: 'المستودع نفسه لا يُمسّ.' },
  { re: /\bgh\s+release\s+(create|delete|edit|upload|delete-asset)\b/, why: 'الإصدارات بيد المالك.' },
  { re: /\bgh\s+(workflow\s+(run|enable|disable)|run\s+(cancel|delete)|issue\s+delete)\b/, why: 'تشغيل سير العمل وحذفه بيد المالك (المشاهدة وإعادة التشغيل مسموحتان).' },
  { re: /\bgh\s+api\b(?=.*\s(?:-X|--method)[\s=]+(?!GET\b)\w)/i, why: 'gh api للقراءة فقط (GET).' },
  { re: /\bgh\s+api\b(?=.*\s(?:-f|-F|--field|--raw-field|--input)\b)/, why: 'gh api للقراءة فقط (GET).' },
  // v-audit-bridge: الأسماء المستعارة تُخفي الأمر الفعليّ عن الفحص («gh alias set m 'pr merge'»، «git config alias.pp push»).
  { re: /\bgh\s+alias\s+(set|import)\b/, why: 'أسماء gh المستعارة تُخفي الأمر الفعليّ عن الفحص — اكتب الأمر نفسه.' },
  { re: /\bgit\b[^;&|\n]*(?:\s-c\s*alias\.|\sconfig\b[^;&|\n]*\salias\.)/i, why: 'أسماء git المستعارة تُخفي الأمر الفعليّ عن الفحص — اكتب الأمر نفسه.' },
  { re: /\bgit\s+remote\s+(add|set-url|remove|rm|rename)\b/, why: 'المستودع البعيد ثابت.' },
  { re: /\bgit\s+branch\s+(-D|-d|--delete)\s+(main|master)\b/, why: 'الفرع الرئيسيّ لا يُحذف.' },
  { re: /\bvercel\b(?!\s+(ls|list|inspect|logs|whoami|help|--version|-v)\b)/, why: 'النشر على Vercel بيد المالك (يدمج من التطبيق فينشر Vercel من main).' },
  { re: /\b(npm|pnpm|yarn)\s+(publish|unpublish|deprecate|dist-tag|owner|token|login|adduser|access)\b/, why: 'نشر الحزم بيد المالك.' },
  { re: /\bgit\s+(reset\s+--hard|clean\s+-\S*[fx]|checkout\s+--\s+\.)/, why: 'الرجوع المدمّر عن التغييرات بأمر المالك «تراجع» وحده.' },
  { re: /\brm\s+(?:-\S+\s+)*(?:\/|~|\$HOME|\/work(?:\/repo|\/state)?|\/app|\.git|\.|\.\.|\*)\/?(?=\s|$)/, why: 'حذف المستودع أو النظام ممنوع.' },
  { re: /(^|[\s;&|])(sudo|su|doas)\b|\b(shutdown|reboot|halt|poweroff|systemctl|pkill|killall)\b/, why: 'لا صلاحيّات نظام ولا إيقاف للخدمات.' },
  { re: /\.env(?!\.example\b)(\.[\w-]+)?\b|\.npmrc\b|\b(AUTH_SECRET|ANTHROPIC_API_KEY|GH_TOKEN|GITHUB_TOKEN|CC_AGENT_GH_TOKEN|CLAUDE_CODE_OAUTH_TOKEN|CC_BRIDGE_SECRET)\b|\/work\/state\b|\.claude\/settings|\/proc\/\S*environ\b/, why: 'ملفّات البيئة والأسرار وإعدادات السياج لا تُقرأ ولا تُكتب.' },
  { re: /(^|[\s;&|])(printenv|env)\s*($|[;&|>])/, why: 'لا طباعة للبيئة كاملة (فيها الأسرار).' },
];

const PUSH_FLAGS_DENIED = /^(-f|--force|--force-with-lease(=.*)?|--force-if-includes|-d|--delete|--mirror|--all|--branches|--prune)$/;
// خيارات git العامّة التي تأخذ قيمةً في الوسيط التالي (تُتخطّى مع قيمتها قبل الأمر الفرعيّ).
const GIT_GLOBAL_OPT_VALUE = new Set(['-c', '-C', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--super-prefix']);
// الوجهة الممنوعة (بعد تجريد + واقتباس وrefs/ وheads/): الفرع الرئيسيّ.
// v-audit-bridge: git يحسم «HEAD:heads/main» إلى refs/heads/main (قاعدة refs/%s) — كان يمرّ لأنّ التجريد refs/heads/ وحده.
function pushDstIsMain(ref) {
  const r = String(ref).replace(/^['"]+|['"]+$/g, '').replace(/^\+/, '');
  const dst = (r.includes(':') ? r.slice(r.lastIndexOf(':') + 1) : r).replace(/^refs\//, '').replace(/^heads\//, '');
  return /^(main|master)$/i.test(dst);
}
// v-audit-bridge: الأمر باسمه الأساسيّ — «/usr/bin/git» و«\git» هما git نفسه، و«$(gh» و«(gh» و«`gh» هي gh داخل
// استبدال أمر أو صدفة فرعيّة (الجولة ٢: «echo $(gh -R o/r pr merge 5)» كان لا يُرى).
const cmdName = (t) => String(t || '').replace(/^[\\$({`!]+/, '').split('/').pop();
const cmdTokens = (segment) => String(segment || '').replace(/[)`]+$/, '').split(/\s+/).map((t) => t.replace(/^['"]+|['"]+$/g, '')).filter(Boolean);

/* فحص git push وحده: فرع مسمّى غير الرئيسيّ، بلا قسر ولا حذف — وإلّا رُفض.
   v-sec-gitpush: التحليل السابق كان يتسامح مع «-C مسار» وحده بين git وpush، فـ«git -c k=v push
   origin HEAD:main» أو refspec بين علامتَي اقتباس كانا يتخطّيانه. الآن: نجرّد الاقتباس من كلّ رمز،
   نتخطّى كلّ خيارات git العامّة (وقيَمها)، ونحسم إلى main بفحص مستقلّ لكلّ رمز مهما اختلّ ترتيب الخيارات. */
export function checkGitPush(segment) {
  const toks = cmdTokens(segment);
  const gi = toks.findIndex((t) => cmdName(t) === 'git');
  if (gi < 0) return '';
  let i = gi + 1;
  while (i < toks.length && toks[i].startsWith('-')) {
    i += GIT_GLOBAL_OPT_VALUE.has(toks[i]) ? 2 : 1;
  }
  if (toks[i] !== 'push') return '';
  const args = toks.slice(i + 1);
  // حسم مستقلّ عن ترتيب الخيارات: أيّ رمزٍ وجهتُه main/master = رفض (يمسك القيم ذات المسافات أيضًا).
  for (const a of args) { if (!a.startsWith('-') && pushDstIsMain(a)) return 'الدفع إلى main ممنوع: ادفع فرعًا وافتح طلب سحب، والمالك يدمج بأمر «ادمج».'; }
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
    const dst = (ref.includes(':') ? ref.slice(ref.lastIndexOf(':') + 1) : ref).replace(/^refs\/heads\//, '');
    if (!dst) return 'لا حذف فروع عن بُعد.';
    if (/^HEAD$/i.test(dst)) return 'اذكر اسم الفرع بدل HEAD.';
    if (/[$`()]/.test(dst)) return 'اذكر اسم الفرع حرفيًّا لا عبر متغيّر.';
  }
  return '';
}

/* v-audit-bridge (sat-bridges-1): Claude Code بلا مفتاح كتابة على GitHub — «git push» الذي يجيزه السياج يجريه الجسر نفسه
   بمفتاحه (bridgeDecision أدناه ← git.mjs pushBranch) بوجهة refs/heads/<فرع> صريحة، فلا remote.origin.push ولا اسم مستعار
   ولا تخمين git يغيّر الوجهة. الشكل الوحيد: أمر مستقلّ «git [-C <المستودع>] push [-u] origin <مصدر>[:<فرع>]».
   يعود null إن لم يكن في الأمر دفع، و{ error } لشكل لا يُجرى، و{ src, branch, upstream, dir } للطلب. */
const PUSH_NOOP_FLAGS = /^(-q|--quiet|-v|--verbose|--progress|--no-verify)$/;
const BRANCH_NAME = /^(?!-)(?!.*\.\.)(?!.*\/\/)(?!.*\.lock$)[A-Za-z0-9._/-]+(?<![./])$/;
function isGitPushSeg(seg) {
  const t = cmdTokens(seg);
  const gi = t.findIndex((x) => cmdName(x) === 'git');
  if (gi < 0) return false;
  let i = gi + 1;
  while (i < t.length && t[i].startsWith('-')) i += GIT_GLOBAL_OPT_VALUE.has(t[i]) ? 2 : 1;
  return t[i] === 'push';
}
export function pushRequest(cmd) {
  const s = String(cmd || '').replace(/\s+2>&1\s*$/, '');
  const segs = commandSegments(s);
  if (!segs.some(isGitPushSeg)) return null;
  const alone = 'شغّل الدفع وحده في أمر مستقلّ: git push -u origin <الفرع> — الجسر يجريه بمفتاحه (لا مفتاح كتابة في بيئتك).';
  if (segs.length !== 1 || /[$`(){}<>*?~!\\]/.test(s)) return { error: alone };
  const t = cmdTokens(s);
  if (cmdName(t[0]) !== 'git') return { error: alone };
  let i = 1, dir = '';
  while (i < t.length && t[i] !== 'push') {
    if (t[i] === '-C' && t[i + 1]) { dir = t[i + 1]; i += 2; continue; }
    return { error: 'دفع الجسر بلا خيارات git العامّة (عدا ‎-C المستودع): git push -u origin <الفرع>.' };
  }
  let upstream = false;
  const pos = [];
  for (const a of t.slice(i + 1)) {
    if (a === '-u' || a === '--set-upstream') { upstream = true; continue; }
    if (PUSH_NOOP_FLAGS.test(a)) continue;
    if (a.startsWith('-')) return { error: 'خيار غير مدعوم في دفع الجسر: ' + a + ' — المسموح: git push [-u] origin <الفرع>.' };
    pos.push(a);
  }
  if (pos.length !== 2 || pos[0] !== 'origin') return { error: 'ادفع إلى origin فرعًا واحدًا: git push -u origin <الفرع>.' };
  const ref = pos[1], colon = ref.indexOf(':');
  const src = (colon < 0 ? ref : ref.slice(0, colon)).replace(/^refs\/heads\//, '');
  const branch = (colon < 0 ? ref : ref.slice(colon + 1)).replace(/^refs\/heads\//, '');
  if ((src !== 'HEAD' && !BRANCH_NAME.test(src)) || !BRANCH_NAME.test(branch) || /^HEAD$/i.test(branch) || pushDstIsMain(branch)) return { error: 'اذكر فرعًا مسمّى غير main: git push -u origin <الفرع>.' };
  return { src, branch, upstream, dir };
}

/* v-audit-bridge (sat-bridges-2): gh بالرموز لا بالنصّ — الخيار الملتصق بقيمته (‎-XPUT، ‎-fbase=main، ‎--method=PUT)، والعناقيد
   (‎-iXPUT)، و«gh pr -R x merge». gh api للقراءة فقط: طريقة غير GET أو أيّ حقل (الحقول تجعلها POST) = رفض.
   الجولة ٢: gh (cobra) يقبل الخيارات قبل الأمر الفرعيّ ويحملها إلى الأمر الأخير («gh -X PUT api …/merge»، «gh -R o/r pr
   merge 5») — فلا خيار قبل الأمر الفرعيّ الأوّل. والفرعيّ الثاني يُحسم كما يحسمه cobra (خيار بلا «=» بصيغة ‎--x أو ‎-x
   يأخذ ما بعده قيمةً، فـ«gh pr --body x merge 5» يدمج) ثمّ يُفحص بقواعد gh في DENY_RULES («gh workflow -R x run»).
   والاقتباس والشرطة المائلة داخل الرمز يُزالان كما تزيلهما الصدفة («m''erge»)، والمتغيّر في موضع الأمر مرفوض،
   و«gh extension install|exec» يجلب كودًا ويشغّله. الضمان الأخير الرمز نفسه (CC_AGENT_GH_TOKEN بلا Contents: write). */
const GH_API_VALUE_SHORT = 'XfFHpqt';
const GH_RULES = DENY_RULES.filter((r) => r.re.source.startsWith('\\bgh\\s+'));
export function checkGh(segment) {
  const rest = cmdTokens(segment).map((x) => x.replace(/['"\\]/g, '')).filter(Boolean);
  const gi = rest.findIndex((x) => cmdName(x) === 'gh');
  if (gi < 0) return '';
  rest.splice(0, gi + 1);
  const ci = rest.findIndex((x) => !x.startsWith('-'));
  if (ci > 0) return 'خيارات gh قبل الأمر الفرعيّ تُخفيه عن الفحص — اكتبها بعده: gh pr view 5 -R o/r.';
  const sub = ci < 0 ? '' : rest[ci];
  const literal = 'اكتب أمر gh الفرعيّ حرفيًّا لا عبر متغيّر أو استبدال أمر.';
  if (sub !== 'api') {
    let sub2 = '';
    for (let j = ci + 1; ci >= 0 && j < rest.length; j++) {
      const a = rest[j];
      if (a === '--') break;
      if (!a.startsWith('-')) { sub2 = a; break; }
      if (!a.includes('=') && a !== '-h' && a !== '--help' && (a.startsWith('--') || a.length === 2)) j++; // ‎-R x، ‎--body x
    }
    if (/[$`]/.test(sub + sub2)) return literal;
    if (/^(?:extensions?|ext)$/.test(sub) && /^(?:install|exec)$/.test(sub2)) return 'إضافات gh تجلب كودًا وتشغّله — بيد المالك.';
    const canon = 'gh ' + sub + ' ' + sub2;
    for (const r of GH_RULES) if (r.re.test(canon)) return r.why;
    return '';
  }
  const ro = 'gh api للقراءة فقط (GET).';
  let method = '';
  for (let j = ci + 1; j < rest.length; j++) {
    const a = rest[j];
    if (/[$`]/.test(a)) return literal;
    if (a === '--') break;
    const m = /^--method(?:=(.*))?$/.exec(a);
    if (m) { method = m[1] != null ? m[1] : (rest[++j] || ''); continue; }
    if (/^--(?:field|raw-field|input)(?:=|$)/.test(a)) return ro;
    if (a.startsWith('--') || !a.startsWith('-') || a.length < 2) continue;
    for (let k = 1; k < a.length; k++) {
      if (!GH_API_VALUE_SHORT.includes(a[k])) continue; // خيار منطقيّ (‎-i…) في العنقود
      if (a[k] === 'f' || a[k] === 'F') return ro;
      const v = a.slice(k + 1).replace(/^=/, '') || rest[++j] || '';
      if (a[k] === 'X') method = v;
      break;
    }
  }
  return method && !/^GET$/i.test(method) ? ro : '';
}

/** يقسّم سطر الأوامر إلى مقاطع (&& || ; | & وأسطر) ليُفحص كلّ أمر على حدة.
    v-audit-bridge (الجولة ٢): «\» قبل نهاية السطر وصلُ سطر عند الصدفة لا فاصل — «gh pr \⏎merge 5» أمر واحد. */
export function commandSegments(cmd) {
  return String(cmd || '').replace(/\\\r?\n/g, ' ').split(/\|\||&&|[;|&\n]/).map((s) => s.trim()).filter(Boolean);
}

/** سبب الرفض لأمر Bash كامل، أو '' إن كان مسموحًا. */
export function denyReason(cmd) {
  const s = String(cmd || '');
  for (const r of DENY_RULES) if (r.re.test(s)) return r.why;
  for (const seg of commandSegments(s)) { const why = checkGitPush(seg) || checkGh(seg); if (why) return why; }
  const push = pushRequest(s);
  return (push && push.error) || '';
}

/** v-audit-bridge (sat-bridges-1/2): بيئة Claude Code — بلا سرّ الجسر ولا مفتاح الكتابة على GitHub (GITHUB_TOKEN يبقى في
    git.mjs وحده: الدفع بـGIT_ASKPASS والدمج). gh يأخذ CC_AGENT_GH_TOKEN إن ضبطه المالك: رمز قراءة وفتح طلبات سحب بلا
    Contents: write، فلا دفع ولا دمج بأيّ صيغة مهما فات السياجَ النصّيّ. */
export function agentEnv(env) {
  const e = Object.assign({}, env || {});
  const ro = String(e.CC_AGENT_GH_TOKEN || '').trim();
  for (const k of ['CC_BRIDGE_SECRET', 'GITHUB_TOKEN', 'GH_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN', 'CC_AGENT_GH_TOKEN', 'CC_GH_TOKEN']) delete e[k];
  if (ro) e.GH_TOKEN = ro;
  return e;
}

/** v-audit-bridge (sat-bridges-1): قرار canUseTool في الجسر — decideTool، ثمّ «git push» الذي يجيزه يجريه الجسر نفسه بمفتاحه
    (pushBranch من git.mjs) ويُستبدل الأمر بطباعة النتيجة فيراها Claude Code ناتجَ أمره؛ ورفض الدفع يصله سببًا. */
const shQuote = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";
export async function bridgeDecision(name, input, pushBranch) {
  const d = decideTool(name, input);
  const p = (d.behavior === 'allow' && name === 'Bash') ? pushRequest(input && input.command) : null;
  if (!p || p.error) return d;
  const r = await Promise.resolve().then(() => pushBranch(p)).catch((e) => ({ error: redact(String((e && e.message) || e).slice(0, 400)) }));
  if (!r || r.error) return { behavior: 'deny', message: (r && r.error) || 'تعذّر الدفع.' };
  const msg = '✓ الجسر دفع ' + r.src + ' إلى origin/' + r.branch + ' (' + r.sha + ') بمفتاحه' + (p.upstream ? ' وضبط المتعقَّب' : '') + ' — لا تُعِد الدفع؛ تابع (gh pr create…).';
  return { behavior: 'allow', updatedInput: Object.assign({}, input, { command: "printf '%s\\n' " + shQuote(msg) }) };
}

/** مسارات الملفّات التي لا تُمسّ بأدوات القراءة والتعديل (الأسرار، وسياج الجسر نفسه، وبيئة العمليّات). */
const PROTECTED_PATH = /(^|\/)\.env(?!\.example$)(\.[\w-]+)?$|(^|\/)\.npmrc$|(^|\/)\.git\/|^\/work\/state(\/|$)|^\/app(\/|$)|(^|\/)\.claude\/settings(\.local)?\.json$|^\/proc\/.*environ$/;

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
  '- اعمل دائمًا على فرع غير main (أنشئ cc/<اسم-قصير> إن كنت على main) والتزم برسائل واضحة. لا تدفع إلى main أبدًا ولا دفعًا قسريًّا. الدفع يجريه الجسر نفسه بمفتاحه (لا مفتاح كتابة في بيئتك): اكتب git push -u origin <الفرع> وحده في أمر مستقلّ.',
  '- لا تدمج طلب سحب ولا تنشر على Vercel ولا تنشر حزمًا: المالك يدمج بأمر «ادمج» من التطبيق فينشر Vercel من main. «انشر» عنده = دفع الفرع وفتح طلب السحب؛ وإن طلب ذلك منك في المهمّة فادفع الفرع وافتح الطلب بـgh pr create وأعطه الرابط.',
  '- لا تقرأ ولا تكتب ملفّات البيئة والأسرار (.env، الرموز) ولا /work/state ولا .claude/settings؛ والرجوع المدمّر عن التغييرات (git reset --hard) بأمر المالك «تراجع» وحده.',
  '- بعد أيّ تعديل على js/app-NN-*.js أو js/partials-*.js شغّل npm run bundle، ثمّ npm run ci حتّى يمرّ قبل أن تقول إنّك انتهيت.',
  '- اعمل بعمق وشمول كما في جلسة ويب كاملة: افحص قبل أن تغيّر، تحقّق بعد التغيير، ولا تختصر على حساب الجودة؛ قاعدة «الردود القصيرة» في CLAUDE.md تخصّ محادثة التطبيق لا عملك هنا، فأجب بما تتطلّبه المهمّة.',
  '- اتّبع «طريقة العمل التي يتوقّعها المالك» و«قواعد المالك الثابتة» في CLAUDE.md حرفيًّا: افهم، أعد الإنتاج، أصغر تغيير، اختبار + DECISIONS، npm run ci، لقطات scripts/ui-shot.mjs (مهارة verify-ui)، ثمّ التقرير.',
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
  for (const k of ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'GITHUB_TOKEN', 'GH_TOKEN', 'CC_AGENT_GH_TOKEN', 'CC_BRIDGE_SECRET']) {
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

/** v-cc-fold: تفاصيل الأداة التي تنفتح تحت سطرها المطويّ — الأمر كاملًا، والتعديل سطورًا «- قبل / + بعد». */
export const DETAIL_MAX = 3000;
export function detailTool(name, input) {
  const i = input && typeof input === 'object' ? input : {};
  const clip = (s) => { const t = String(s == null ? '' : s); return t.length > DETAIL_MAX ? t.slice(0, DETAIL_MAX) + '\n… (مقصوص)' : t; };
  const diff = (a, b) => String(a || '').split('\n').map((l) => '- ' + l).concat(String(b || '').split('\n').map((l) => '+ ' + l)).join('\n');
  if (name === 'Bash') return clip(i.command);
  if (name === 'Edit') return clip(diff(i.old_string, i.new_string));
  if (name === 'MultiEdit') return clip((Array.isArray(i.edits) ? i.edits : []).map((e) => diff(e && e.old_string, e && e.new_string)).join('\n…\n'));
  if (name === 'Write') return clip(String(i.content || '').split('\n').map((l) => '+ ' + l).join('\n'));
  return '';
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
