#!/usr/bin/env bun
/**
 * gh-fetch.ts — يسحب ملفًّا (أو أكثر) من main إلى القرص للتحليل.
 * الاستخدام: bun gh-fetch.ts <repoPath> <destAbs> [<repoPath> <destAbs> ...]
 */
import { invokeTool } from '@tasklet/tools/v2';

const OWNER = 'OMRAN77';
const REPO = 'omran-ai-builder';
const CONN = 'conn_v99nvvn81c6baxgr3m9w';

const args = process.argv.slice(2);
if (args.length === 0 || args.length % 2 !== 0) {
  console.error('usage: bun gh-fetch.ts <repoPath> <destAbs> [...]');
  process.exit(1);
}

for (let i = 0; i < args.length; i += 2) {
  const repoPath = args[i];
  const destinationPath = args[i + 1];
  const res = await invokeTool({
    toolName: 'github_download_file',
    connectionId: CONN,
    args: { owner: OWNER, repo: REPO, repoPath, destinationPath },
  });
  if (!res.ok) {
    console.log(`FAIL ${repoPath}: ${res.error}`);
    continue;
  }
  const d = await res.json();
  console.log(`OK ${repoPath} -> ${d.savedPath} (${d.size} bytes, sha ${String(d.sha).slice(0, 8)})`);
}
