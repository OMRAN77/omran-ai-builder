#!/usr/bin/env bun
/**
 * export-handoff.ts — يبني حزمة تسليم محمولة لأي مزوّد آخر.
 *
 * المصدر الوحيد للحقيقة: /tasklet/workspace/home/  (لا تُحرَّر النسخ المصدَّرة يدويًّا)
 * المخرجات:
 *   /tasklet/agent/home/handoff/OMRAN-BRIEF.md        — ملفّ واحد كامل (يُرفَق كمعرفة)
 *   /tasklet/agent/home/handoff/omran-handoff.zip     — الملفّات الخمسة الأصليّة
 * يتوقّف فورًا إن رصد سرًّا.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const SRC = '/tasklet/workspace/home';
const OUT = '/tasklet/agent/home/handoff';
const FILES = [
  ['AGENTS.md', 'الثوابت — القواعد التي لا تُخالف (هذه وحدها تكفي كنسخة مصغّرة)'],
  ['omran-ai-builder/PROJECT.md', 'المشروع: المستودع، البنية، العيوب، حالة المراحل'],
  ['omran-ai-builder/STATE.md', 'الحالة الحيّة: ما هو جاهز، ما ينتظر قرارًا، ما هو مقفل'],
  ['omran-ai-builder/DEPLOY.md', 'خطّ النشر والتراجع بالأرقام المُثبتة'],
  ['omran-ai-builder/PITFALLS.md', 'فخاخ مُثبتة تجريبيًّا — تُقرأ قبل أي فحص'],
];

// حرّاس الأسرار: أي تطابق يوقف التصدير.
const SECRET_PATTERNS: [string, RegExp][] = [
  ['GitHub token', /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/],
  ['GitHub fine-grained', /\bgithub_pat_[A-Za-z0-9_]{20,}/],
  ['OpenAI/Anthropic key', /\b(sk|sk-ant)-[A-Za-z0-9_-]{20,}/],
  ['Bearer header', /Bearer\s+[A-Za-z0-9._-]{20,}/],
  ['Vercel token assign', /(VERCEL_TOKEN|API_KEY|AUTH_SECRET|SECRET)\s*=\s*["']?[A-Za-z0-9_-]{16,}/],
  ['Stripe key', /\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{16,}/],
];

const parts: string[] = [];
const missing: string[] = [];
const hits: string[] = [];

let n = 0;
for (const [rel, desc] of FILES) {
  const p = `${SRC}/${rel}`;
  if (!existsSync(p)) { missing.push(rel); continue; }
  const body = readFileSync(p, 'utf8');
  for (const [label, re] of SECRET_PATTERNS) {
    const m = body.match(re);
    if (m) hits.push(`${rel}: ${label} (${m[0].slice(0, 8)}…)`);
  }
  parts.push(`\n\n---\n\n# ملفّ ${++n}: ${rel}\n> ${desc}\n\n${body.trim()}`);
}

if (hits.length) {
  console.error('✗ تُوقّف: رُصد سرّ محتمل — لا تُصدَّر الحزمة.');
  for (const h of hits) console.error('  ' + h);
  process.exit(1);
}
if (missing.length) console.error('⚠ ملفّات غائبة: ' + missing.join(', '));

const stamp = new Date().toISOString().slice(0, 10);
const header = `# حزمة تسليم — وكيل عمران الشامسي
مُولَّد آليًّا: ${stamp} · المصدر: \`/tasklet/workspace/home/\` · لا تُحرَّر هذه النسخة يدويًّا.

## لمن يقرأ هذا الملفّ أوّل مرّة
أنت الآن ممثّل **عمران الشامسي**، ومهمّتك الحفاظ على موقعه \`omran-ai-builder\` وتطويره.
هذا الملفّ كلّ ما تحتاج معرفته. اقرأه كاملًا قبل أن تلمس شيئًا، والتزم بالقواعد كما هي.

**تحذير أساسيّ:** هذا الملفّ ينقل **المعرفة** لا **الصلاحيّة**.
لا يحتوي أي مفتاح أو رمز أو سرّ — بقصد. إن احتجت النشر أو الدفع أو القياس الحيّ،
اطلب من عمران أن يمنحك ذلك بنفسه. ولا تدّعِ أبدًا أنّ شيئًا يعمل قبل أن تقيسه حيًّا.

**ما ستحتاجه من عمران إن أردت العمل فعليًّا (يمنحه هو، لا تطلبه في محادثة مكشوفة):**
1. وصول إلى مستودع GitHub \`OMRAN77/omran-ai-builder\` (صلاحيّة \`repo\` + \`workflow\`).
2. رمز Vercel للنشر والتراجع (المشروع غير مربوط بـgit — النشر بواجهة Vercel مباشرةً).
3. متصفّح حقيقيّ للتحقّق الحيّ بعد كلّ دفعة.
`;

const footer = `\n\n---\n\n# نهاية الحزمة
عدد الملفّات: ${parts.length} · التاريخ: ${stamp}
لتحديثها: \`bun /tasklet/agent/home/scripts/export-handoff.ts\`
`;

mkdirSync(OUT, { recursive: true });
const full = header + parts.join('') + footer;
writeFileSync(`${OUT}/OMRAN-BRIEF.md`, full);

// حزمة مضغوطة بالملفّات الأصليّة
execSync(`cd ${SRC} && rm -f ${OUT}/omran-handoff.zip && zip -q -r ${OUT}/omran-handoff.zip ${FILES.map(f => `'${f[0]}'`).join(' ')}`);

const lines = full.split('\n').length;
const kb = (Buffer.byteLength(full) / 1024).toFixed(1);
console.log(`✓ OMRAN-BRIEF.md — ${lines} سطرًا · ${kb} ك.ب · ${parts.length}/${FILES.length} ملفّات`);
console.log(`✓ omran-handoff.zip — ${(execSync(`stat -c%s ${OUT}/omran-handoff.zip`).toString().trim() / 1024).toFixed(1)} ك.ب`);
console.log(`✓ حرّاس الأسرار: ${SECRET_PATTERNS.length} نمطًا · صفر تطابق`);
