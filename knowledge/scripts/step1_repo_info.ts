import { invokeTool } from '@tasklet/tools/v2';

const conn = 'conn_v99nvvn81c6baxgr3m9w';

const repo = await invokeTool({
  toolName: 'github_get_repository',
  connectionId: conn,
  args: { owner: 'OMRAN77', repo: 'omran-ai-builder' },
});
console.log('REPO INFO:', JSON.stringify(await repo.json(), null, 2));
