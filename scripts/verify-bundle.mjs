// scripts/verify-bundle.mjs — الحزمة المنشورة تطابق أجزاءها؟
// كان هذا الفحص `git diff`، فكان يعمل داخل مستودع فقط. وهذا العطب حدث فعلًا:
// app.bundle.js تأخّر عن أجزائه لأنّ الدمج كان يدويًّا. الفحص يجب أن يعمل
// في أي مكان — على شجرة عاريّة كما في CI. فالطريقة: صوّر، ثمّ ابنِ، ثمّ قارن.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const FILES = ['js/app.bundle.js', 'index.html', 'sw.js'];
const before = new Map();
for (const f of FILES) if (existsSync(f)) before.set(f, readFileSync(f));

execFileSync(process.execPath, ['scripts/build.mjs'], { stdio: 'inherit' });

const drifted = [...before].filter(([f, buf]) => !readFileSync(f).equals(buf)).map(([f]) => f);
if (drifted.length) {
  for (const [f, buf] of before) writeFileSync(f, buf); // أعِد الأصل — الفحص يقرأ لا يكتب
  console.error('\n✗ متأخّر عن أجزائه: ' + drifted.join(', '));
  console.error('  شغّل `npm run bundle` واضمم الناتج في نفس الالتزام.');
  process.exit(1);
}
console.log('✓ الحزمة تطابق أجزاءها (' + before.size + ' ملفات)');
