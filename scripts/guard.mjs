// scripts/guard.mjs — يمنع تكرار عطبين حدثا فعلًا في هذا المستودع.
//
// (أ) سرّ في حزمة العميل. `omran-monitor-2026` عاش في js/app-11-video.js
//     و app-05-ui.js حتى ٦ أغسطس ٢٠٢٦. لم يُستغلّ — دُوِّر قبل ذلك — لكن
//     أربع أدوات مالك بقيت ميتة بصمت لأربعة أيام.
// (ب) سرّ افتراضي منشور مع الشيفرة. `process.env.AUTH_SECRET ||
//     'fallback-dev-secret-change-me'` كان في ١٠+ ملفات: أي نشرة تفقد
//     المتغيّر تقبل رموز جلسة مُلفَّقة لأي مستخدم، والمالك ضمنهم.
//
// يُشغَّل: node scripts/guard.mjs   ·   يخرج ١ عند أول اكتشاف.
// للاستثناء المتعمَّد: اكتب guard-ok في نفس السطر واشرح لماذا.

import { readFile, readdir } from 'node:fs/promises';

const ROOT = new URL('..', import.meta.url).pathname;
const found = [];
const seen = new Set();   // js/app.bundle.js يظهر في القائمة وفي جرد المجلّد

// ما يصل متصفّح الزائر فعلًا. الأجزاء js/app-NN-*.js مُستثناة في
// .vercelignore ولا تُنشر — الحزمة وحدها تُنشر، فهي المقياس.
const CLIENT = [
  'js/app.bundle.js', 'sw.js', 'legal-strings.js', 'templates-data.js',
  'index.html', 'explore.html', 'privacy.html', 'terms.html', 'p.html',
];

const SECRETS = [
  ['OpenAI',       /\bsk-[A-Za-z0-9_-]{20,}/],
  ['Anthropic',    /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['Google',       /\bAIza[0-9A-Za-z_-]{35}/],
  ['AWS',          /\bAKIA[0-9A-Z]{16}\b/],
  ['GitHub',       /\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})/],
  ['Vercel Blob',  /\bvercel_blob_rw_[A-Za-z0-9_]{20,}/],
  ['Slack',        /\bxox[abpsr]-[A-Za-z0-9-]{10,}/],
  ['Stripe حيّ',   /\b(sk|rk)_live_[A-Za-z0-9]{20,}/],
  ['مفتاح خاصّ',   /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['مفتاح المراقبة', /\bomran-monitor-\d{4}\b/],
  ['سرّ مُسنَد لنصّ', /\b(?:AUTH_SECRET|MONITOR_KEY|[A-Z0-9_]*(?:API_KEY|_TOKEN|_PASSWORD))\s*[:=]\s*['"`][^'"`\n]{8,}['"`]/],
];

// اسمٌ سرّيّ له بديل حرفيّ = سرّ منشور مع المصدر.
const PUBLISHED_DEFAULT =
  /process\.env\.([A-Z0-9_]*(?:SECRET|KEY|TOKEN|PASSWORD|SIGNING|WEBHOOK|CREDENTIAL)[A-Z0-9_]*)\s*\|\|\s*['"`]([^'"`\n]{6,})['"`]/;

const mask = (s) => (s.length <= 10 ? s : `${s.slice(0, 4)}…${s.slice(-2)} (${s.length} حرفًا)`);

async function scan(rel, tests, { skipComments = false } = {}) {
  if (seen.has(rel)) return;
  seen.add(rel);
  let text;
  try { text = await readFile(ROOT + rel, 'utf8'); } catch { return; }  // ملف غائب ليس عطبًا
  text.split('\n').forEach((line, i) => {
    if (line.includes('guard-ok')) return;
    const t = line.trim();
    if (skipComments && (t.startsWith('//') || t.startsWith('*'))) return;
    for (const [label, re] of tests) {
      const m = line.match(re);
      if (m) found.push(`${rel}:${i + 1}  ${label} → ${mask(m[0])}`);
    }
  });
}

// (أ) كل ما يُنشر للعميل.
for (const f of CLIENT) await scan(f, SECRETS);
for (const d of ['i18n', 'js']) {
  let names = [];
  try { names = await readdir(ROOT + d); } catch { /* المجلّد اختياري */ }
  for (const n of names) {
    if (!/\.(js|json)$/.test(n) || /^app-\d\d-/.test(n)) continue;
    await scan(`${d}/${n}`, SECRETS);
  }
}

// (ب) كل شيفرة الخادم. التعليقات مُستثناة: توثيق عطب قديم ليس عطبًا.
const apiFiles = [];
for (const d of ['api', 'api/_lib']) {
  let names = [];
  try { names = await readdir(ROOT + d); } catch { /* */ }
  for (const n of names) if (n.endsWith('.js')) apiFiles.push(`${d}/${n}`);
}
for (const f of apiFiles) await scan(f, [['بديل سرّيّ منشور', PUBLISHED_DEFAULT]], { skipComments: true });

if (found.length) {
  console.error(`\n✗ الحارس: ${found.length} اكتشافًا — لا نشر.\n`);
  for (const f of found) console.error(`  ${f}`);
  console.error('\nإن كان مقصودًا: اكتب guard-ok في السطر واشرح السبب.\n');
  process.exit(1);
}
console.log(`✓ الحارس: ${seen.size} ملفًا نظيفًا — لا سرّ في العميل، لا بديل سرّيّ منشور.`);
