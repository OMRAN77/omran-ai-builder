// يزامن ملفات الإنتاج المتغيّرة مع GitHub main، ويتحقّق بالبصمة بعد كل دفعة
import { invokeTool } from '@tasklet/tools/v2';
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
const CONN = 'conn_v99nvvn81c6baxgr3m9w', owner = 'OMRAN77', repo = 'omran-ai-builder', branch = 'main';
const BASE = '/tasklet/agent/home/sync/push';
const blobSha = (b: Buffer) => createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${b.length}\0`), b])).digest('hex');

const batches: { msg: string, files: string[] }[] = [
  { msg: 'sync: index.html to production v414 (identity unification + gold decor)', files: ['index.html', 'p.html', 'sw.js', '.tasklet-source-revision', '.vercelignore'] },
  { msg: 'sync: js/app.bundle.js to production build', files: ['js/app.bundle.js'] },
  { msg: 'sync: refreshed v2 icons to production', files: ['icons/favicon-32-v2.png', 'icons/icon-192-v2.png', 'icons/icon-512-v2.png', 'icons/apple-touch-icon-v2.png'] },
];
const only = process.argv[2] ? Number(process.argv[2]) : null;

for (let i = 0; i < batches.length; i++) {
  if (only !== null && only !== i) continue;
  const b = batches[i];
  const size = b.files.reduce((a, f) => a + statSync(`${BASE}/${f}`).size, 0);
  console.log(`\n▶ دفعة ${i}: ${b.files.length} ملف · ${(size / 1024).toFixed(0)}KB`);
  const res = await invokeTool({
    connectionId: CONN, toolName: 'github_push_to_branch',
    args: { owner, repo, branch, commitMessage: b.msg, files: b.files.map(f => ({ repoPath: f, localPath: `${BASE}/${f}` })) },
  });
  if (!res.ok) { console.log('  ✗ فشل:', String(res.error).slice(0, 300)); continue; }
  const d: any = await res.json();
  console.log('  ✓ commit:', d.commit?.sha?.slice(0, 7) ?? JSON.stringify(d).slice(0, 120));
  // تحقّق: نزّل كل ملف وقارن البصمة
  for (const f of b.files) {
    const dest = `/tasklet/agent/home/sync/verify/${f.replace(/\//g, '_')}`;
    const dl = await invokeTool({ connectionId: CONN, toolName: 'github_download_file', args: { owner, repo, repoPath: f, destinationPath: dest } });
    if (!dl.ok) { console.log(`  ? ${f}: تعذّر التحقّق`); continue; }
    const a = blobSha(readFileSync(`${BASE}/${f}`)), c = blobSha(readFileSync(dest));
    console.log(`  ${a === c ? '✓' : '✗'} ${f}  ${a === c ? 'مطابق' : `مختلف local=${a.slice(0, 7)} gh=${c.slice(0, 7)}`}`);
  }
}
