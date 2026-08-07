import { invokeTool } from '@tasklet/tools/v2';

const res = await invokeTool({
  toolName: 'github_get_file_content',
  connectionId: 'conn_v99nvvn81c6baxgr3m9w',
  args: { owner: 'OMRAN77', repo: 'omran-ai-builder', repoPath: '' },
});
if (!res.ok) { console.log('ERR', res.error); process.exit(1); }
const data = await res.json();
console.log(JSON.stringify(data, null, 2));
