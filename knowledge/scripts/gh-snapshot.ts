// نسخة احتياطيّة من نسخ main الحالية للملفّات المذكورة، قبل الدفع.
// الاستخدام: bun scripts/gh-snapshot.ts <مجلّد الحفظ> <مسار> [مسار...]
import { invokeTool } from '@tasklet/tools/v2';
import { mkdirSync, existsSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
const CONN = 'conn_v99nvvn81c6baxgr3m9w', owner = 'OMRAN77', repo = 'omran-ai-builder';
const [dest, ...files] = process.argv.slice(2);
if (!dest || !files.length) { console.log('الاستخدام: bun gh-snapshot.ts <مجلّد> <ملف>...'); process.exit(1); }
let have = 0, missing: string[] = [];
for (const f of files) {
  const out = `${dest}/${f}`;
  mkdirSync(dirname(out), { recursive: true });
  const r = await invokeTool({ connectionId: CONN, toolName: 'github_download_file',
    args: { owner, repo, repoPath: f, destinationPath: out } });
  if (!r.ok) { missing.push(f); console.log(`✗ ${f} — ${String(r.error).slice(0,160)}`); continue; }
  let size = 0;
  for (let i = 0; i < 8 && size === 0; i++) {           // /tasklet متّسق بالتراخي: أعِد المحاولة
    await new Promise(res => setTimeout(res, 400));
    if (existsSync(out)) size = statSync(out).size;
  }
  if (size > 0) { have++; console.log(`✓ ${f} (${size} بايت)`); } else missing.push(f + ' [نُزّل ولم يُقرأ]');
}
console.log(`\nمحفوظ من main: ${have}/${files.length}`);
if (missing.length) console.log('غير موجود على main (ملفّات جديدة): ' + missing.join(' '));
