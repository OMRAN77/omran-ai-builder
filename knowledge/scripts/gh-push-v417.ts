// يدفع ملفات v417 إلى GitHub main ويتحقّق بالبصمة
import { invokeTool } from '@tasklet/tools/v2';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const CONN = 'conn_v99nvvn81c6baxgr3m9w', owner = 'OMRAN77', repo = 'omran-ai-builder', branch = 'main';
const SRC = '/tasklet/agent/home/sync/push';
const files = ['index.html', 'js/app.bundle.js', 'js/app-12-studios.js', 'api/_lib/fashion-create.js', 'api/_lib/fashion-suggest.js'];
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex').slice(0, 8);

const res = await invokeTool({
  connectionId: CONN, toolName: 'github_push_to_branch',
  args: {
    owner, repo, branch,
    commitMessage: 'v417: fashion AI — gender/colours/accessories/seasons reach the generator; 21 cards replace dropdowns',
    files: files.map(f => ({ repoPath: f, localPath: `${SRC}/${f}` })),
  },
});
if (!res.ok) { console.log('✗ فشل:', String(res.error).slice(0, 400)); process.exit(1); }
const d: any = await res.json();
console.log('✓ commit:', d.commit?.sha?.slice(0, 7) ?? JSON.stringify(d).slice(0, 150));

// تحقّق: اقرأ كل ملف من GitHub raw وقارن البصمة
await new Promise(r => setTimeout(r, 3000));
for (const f of files) {
  const local = sha256(readFileSync(`${SRC}/${f}`));
  const r = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${f}`);
  const remote = r.ok ? sha256(Buffer.from(await r.arrayBuffer())) : `HTTP${r.status}`;
  console.log(`${local === remote ? '✓' : '✗'} ${f}  local=${local} github=${remote}`);
}
