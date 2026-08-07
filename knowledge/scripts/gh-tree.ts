import { invokeTool } from '@tasklet/tools/v2';
const CONN = 'conn_v99nvvn81c6baxgr3m9w', owner = 'OMRAN77', repo = 'omran-ai-builder';
const files: { path: string, size: number, sha: string }[] = [];
const queue: string[] = [''];
while (queue.length) {
  const dir = queue.shift()!;
  const res = await invokeTool({ connectionId: CONN, toolName: 'github_get_file_content', args: { owner, repo, repoPath: dir } });
  if (!res.ok) { console.log('ERR', dir || '/', String(res.error).slice(0, 80)); continue; }
  const d: any = await res.json();
  const entries = d.entries ?? d.contents ?? d.items ?? [];
  for (const e of entries) {
    const p = e.path ?? (dir ? `${dir}/${e.name}` : e.name);
    if ((e.type ?? '') === 'dir' || (e.type ?? '') === 'directory') queue.push(p);
    else files.push({ path: p, size: e.size ?? 0, sha: e.sha ?? "" });
  }
}
files.sort((a, b) => a.path.localeCompare(b.path));
await Bun.write('/tasklet/agent/home/audit/github-gap/gh-tree.json', JSON.stringify(files, null, 1));
console.log('GH files:', files.length);
console.log(files.map(f => f.path).join('\n'));
