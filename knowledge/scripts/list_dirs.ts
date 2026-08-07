import { invokeTool } from '@tasklet/tools/v2';

for (const p of ['js', 'assets']) {
  const res = await invokeTool({
    toolName: 'github_get_file_content',
    connectionId: 'conn_v99nvvn81c6baxgr3m9w',
    args: { owner: 'OMRAN77', repo: 'omran-ai-builder', repoPath: p },
  });
  if (!res.ok) { console.log('ERR', p, res.error); continue; }
  const data = await res.json();
  console.log('=== ' + p + ' ===');
  console.log(JSON.stringify(data, null, 2));
}
