// دفعٌ عامّ إلى GitHub main: مسارات نسبية من /tmp/vc/src، وتحقّق بالبصمة بعد الدفع.
// الاستخدام: bun scripts/gh-push.ts "<رسالة>" <مسار> [مسار...]
import { invokeTool } from '@tasklet/tools/v2';
import { readFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
const CONN = 'conn_v99nvvn81c6baxgr3m9w', owner = 'OMRAN77', repo = 'omran-ai-builder', branch = 'main';
const SRC = '/tmp/vc/src';
// مجلّد تنظيم جديد لكلّ دفعة: /tasklet متّسق بالتراخي، وإعادة استخدام نفس المسار
// قد تجعل أداة الدفع تقرأ بايتات الدفعة السابقة.
const STAGE = `/tasklet/agent/home/sync/push/${Date.now()}`;
const [msg, ...files] = process.argv.slice(2);
if (!msg || !files.length) { console.log('الاستخدام: bun gh-push.ts "<رسالة>" <ملف>...'); process.exit(1); }
const sha1 = (b: Buffer) => createHash('sha1').update(b).digest('hex');
for (const f of files) { mkdirSync(`${STAGE}/${dirname(f)}`, { recursive: true }); copyFileSync(`${SRC}/${f}`, `${STAGE}/${f}`); }
const res = await invokeTool({ connectionId: CONN, toolName: 'github_push_to_branch',
  args: { owner, repo, branch, commitMessage: msg, files: files.map(f => ({ repoPath: f, localPath: `${STAGE}/${f}` })) } });
if (!res.ok) { console.log('✗ فشل الدفع: ' + res.error); process.exit(1); }
console.log('دُفِع: ' + JSON.stringify(await res.json()).slice(0, 200));
// التحقّق ببصمة git blob من واصفة GitHub نفسها — لا تنزيل ولا قراءة ملفّ منزَّل:
// قراءة ملفّ كُتب قبل لحظة في /tasklet قد تُرجع بايتات قديمة فتكذب في كلا الاتّجاهين.
const blob = (b: Buffer) => createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${b.length}\0`), b])).digest('hex');
let good = 0;
for (const f of files) {
  const r = await invokeTool({ connectionId: CONN, toolName: 'github_get_file_content', args: { owner, repo, repoPath: f } });
  if (!r.ok) { console.log(`\u2717 ${f} — لم يُقرأ من main: ${r.error}`); continue; }
  const j: any = await r.json();
  const same = j.sha === blob(readFileSync(`${SRC}/${f}`));
  if (same) good++; else console.log(`\u2717 ${f} — البصمة مختلفة (main=${String(j.sha).slice(0, 10)}…)`);
}
console.log(`تحقّق البصمة: ${good}/${files.length}`);
