import { invokeTool } from '@tasklet/tools/v2';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';

const CONN = 'conn_v99nvvn81c6baxgr3m9w';
const owner = 'OMRAN77', repo = 'omran-ai-builder';

const repoInfo = await invokeTool({ connectionId: CONN, toolName: 'github_get_repository', args: { owner, repo } });
if (repoInfo.ok) {
  const r: any = await repoInfo.json();
  console.log('REPO', r.fullName, '| private:', r.private, '| default:', r.defaultBranch, '| updatedAt:', r.updatedAt);
} else console.log('REPO ERR', repoInfo.error);

const candidates = ['src/index.html', 'index.html', 'public/index.html'];
for (const p of candidates) {
  const dest = `/tasklet/agent/home/audit/github-gap/${p.replace(/\//g, '_')}`;
  const res = await invokeTool({ connectionId: CONN, toolName: 'github_download_file', args: { owner, repo, repoPath: p, destinationPath: dest } });
  if (!res.ok) { console.log('MISS', p, '->', String(res.error).slice(0, 120)); continue; }
  const d: any = await res.json();
  const buf = readFileSync(d.savedPath);
  const lines = buf.toString('utf8').split('\n').length;
  const sha = createHash('sha256').update(buf).digest('hex').slice(0, 8);
  console.log('FOUND', p, '| size:', d.size, '| lines:', lines, '| sha256:', sha);
}

const live = '/tasklet/agent/home/design/deploy/index.html';
if (existsSync(live)) {
  const buf = readFileSync(live);
  console.log('LIVE  index.html | size:', statSync(live).size, '| lines:', buf.toString('utf8').split('\n').length,
    '| sha256:', createHash('sha256').update(buf).digest('hex').slice(0, 8));
}
