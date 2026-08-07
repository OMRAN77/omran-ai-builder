// دفع ملفات محدّدة إلى main برسالة واحدة + تحقّق بالبصمة
// الاستخدام: bun gh-push-one.ts "الرسالة" ملف [ملف...]
import { invokeTool } from '@tasklet/tools/v2';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const CONN = 'conn_v99nvvn81c6baxgr3m9w', owner = 'OMRAN77', repo = 'omran-ai-builder', branch = 'main';
const BASE = '/tasklet/agent/home/sync/push';
const blobSha = (b: Buffer) => createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${b.length}\0`), b])).digest('hex');
const [msg, ...files] = process.argv.slice(2);
if (!msg || !files.length) { console.log('الاستخدام: bun gh-push-one.ts "الرسالة" ملف [ملف...]'); process.exit(1); }
const res = await invokeTool({ connectionId: CONN, toolName: 'github_push_to_branch',
  args: { owner, repo, branch, commitMessage: msg, files: files.map(f => ({ repoPath: f, localPath: `${BASE}/${f}` })) } });
if (!res.ok) { console.log('✗ فشل:', String(res.error).slice(0, 400)); process.exit(1); }
const d: any = await res.json();
console.log('✓ commit:', d.commit?.sha?.slice(0, 7) ?? JSON.stringify(d).slice(0, 150));
for (const f of files) {
  const dest = `/tasklet/agent/home/sync/verify/${f.replace(/\//g, '_')}`;
  const dl = await invokeTool({ connectionId: CONN, toolName: 'github_download_file', args: { owner, repo, repoPath: f, destinationPath: dest } });
  if (!dl.ok) { console.log(`? ${f}: تعذّر التحقّق`); continue; }
  // نظام الملفات السحابي قد يُقرأ قبل أن يفرغ التنزيل → بصمة كاذبة. نعيد مرّة.
  let a = blobSha(readFileSync(`${BASE}/${f}`)), c = blobSha(readFileSync(dest));
  if (a !== c) { await new Promise(r => setTimeout(r, 2000)); c = blobSha(readFileSync(dest)); }
  console.log(`${a === c ? '✓' : '✗'} ${f} ${a === c ? 'مطابق' : `مختلف local=${a.slice(0,7)} gh=${c.slice(0,7)}`}`);
}
