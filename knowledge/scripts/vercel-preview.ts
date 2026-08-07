import { invokeTool, summarizeJsonStructure } from '@tasklet/tools/v2';

const r = await invokeTool({
  toolName: 'vercel_token_auth-list-deployments',
  connectionId: 'conn_verennr83r5s05yat4ef',
  args: { limit: 30 },
});

if (!r.ok) {
  console.log('FAIL: ' + r.error);
} else {
  const data: any = await r.json();
  const arr = data.deployments ?? data.data ?? (Array.isArray(data) ? data : []);
  if (!arr.length) {
    console.log('SHAPE:', summarizeJsonStructure(data));
  } else {
    const rows = arr.map((d: any) => ({
      name: d.name,
      url: d.url,
      state: d.state ?? d.readyState,
      target: d.target,
      branch: d.meta?.githubCommitRef ?? d.gitSource?.ref ?? null,
      msg: (d.meta?.githubCommitMessage ?? '').slice(0, 60),
      created: d.created ? new Date(d.created).toISOString() : null,
    }));
    console.log(JSON.stringify(rows, null, 1));
  }
}
