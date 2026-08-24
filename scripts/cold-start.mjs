// scripts/cold-start.mjs — هل تُحمَّل كلّ دالّة خادم في بيئة عارية؟
//
// العطب الذي كتب هذا الملفّ: /api/auth-google-callback و /api/edu كانا
// يقرآن AUTH_SECRET في نطاق الوحدة عبر api/_lib/auth.js و _usage.js.
// و_secrets.js يرمي عمدًا عند غياب المتغيّر — وهو تصميم صحيح — لكنّ القراءة
// وقت التحميل حوّلت الرمي إلى انهيار عند الإقلاع البارد:
// FUNCTION_INVOCATION_FAILED، صفحة Vercel بيضاء للزائر، ولا قيد في سجلّ
// التطبيق، لأنّ withErrorCapture يلفّ المعالِج لا تحميل الوحدة.
//
// node --check لا يراه: الملفّ صحيح الصياغة. والاختبارات لا تراه: لا أحد
// كان يحمّل نقاط الدخول. هذا يفعل — بالضبط كما يفعل Vercel عند أوّل طلب،
// وفي بيئة عارية عمدًا: أيّ متغيّر مفقود يجب أن يصير 500 مسجّلًا داخل
// المعالِج، لا موتًا صامتًا قبله.
import { readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = new URL('..', import.meta.url).pathname;

// بيئة عارية: نُبقي ما يحتاجه Node نفسه فقط.
const BARE = { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'production' };

const names = (await readdir(ROOT + 'api')).filter((f) => f.endsWith('.js')).sort();
const broken = [];

for (const n of names) {
  try {
    await run(process.execPath, ['-e', `require('${ROOT}api/${n}')`], { env: BARE, timeout: 20000 });
  } catch (e) {
    const why = String((e && e.stderr) || e).split('\n').find((L) => /Error|throw/.test(L)) || 'سبب غير معروف';
    broken.push(`api/${n}  ينهار عند التحميل → ${why.trim().slice(0, 120)}`);
  }
}

if (broken.length) {
  console.error(`\n✗ الإقلاع البارد: ${broken.length} دالّة تنهار قبل معالجها — لا نشر.\n`);
  for (const b of broken) console.error(`  ${b}`);
  console.error('\nالقراءة من _secrets يجب أن تكون داخل دالّة، لا في نطاق الوحدة.\n');
  process.exit(1);
}
console.log(`✓ الإقلاع البارد: ${names.length} دالّة تُحمَّل في بيئة عارية — المتغيّر المفقود يصير 500 مسجّلًا لا انهيارًا.`);
