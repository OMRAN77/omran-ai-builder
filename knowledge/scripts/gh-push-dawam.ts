// يدفع ملفات الدوام إلى GitHub main ويتحقّق بالبصمة
import { invokeTool } from '@tasklet/tools/v2';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const CONN = 'conn_v99nvvn81c6baxgr3m9w', owner = 'OMRAN77', repo = 'omran-ai-builder', branch = 'main';
const SRC = '/tasklet/agent/home/sync/push';
const files = ['api/_lib/agent.js', 'js/app.bundle.js'];
const blobSha = (b: Buffer) => createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${b.length}\0`), b])).digest('hex');

const res = await invokeTool({
  connectionId: CONN, toolName: 'github_push_to_branch',
  args: { owner, repo, branch, commitMessage: 'dawam: persist agent run journal in KV (1h TTL) + client recovers work after stream drop', files: files.map(f => ({ repoPath: f, localPath: `${SRC}/${f}` })) },
});
if (!res.ok) { console.log('✗ فشل:', String(res.error).slice(0, 300)); process.exit(1); }
const d: any = await res.json();
console.log('✓ commit:', d.commit?.sha?.slice(0, 7) ?? JSON.stringify(d).slice(0, 120));
for (const f of files) {
  const dest = `/tasklet/agent/home/sync/verify/${f.replace(/\//g, '_')}`;
  const dl = await invokeTool({ connectionId: CONN, toolName: 'github_download_file', args: { owner, repo, repoPath: f, destinationPath: dest } });
  if (!dl.ok) { console.log(`? ${f}: تعذّر التحقّق`); continue; }
  const a = blobSha(readFileSync(`${SRC}/${f}`)), c = blobSha(readFileSync(dest));
  console.log(`${a === c ? '✓' : '✗'} ${f} ${a === c ? 'مطابق' : 'مختلف'}`);
}
