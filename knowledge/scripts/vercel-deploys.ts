import { invokeTool, summarizeJsonStructure } from '@tasklet/tools/v2';
const CONN = 'conn_ghpnmc2qpyh0ekrazrdy';
async function get(url: string) {
  const r = await invokeTool({ toolName: 'remote_http_call', connectionId: CONN, args: { url, method: 'GET', timeout: 45 } });
  if (!r.ok) return { err: r.error };
  return await r.json();
}
const d: any = await get('https://api.vercel.com/v6/deployments?app=omran-ai-builder&limit=8');
if (d?.err) { console.log('ERR:', String(d.err).slice(0, 400)); }
else if (!d?.deployments) { console.log('SHAPE:', summarizeJsonStructure(d)); }
else {
  for (const x of d.deployments) {
    console.log([
      new Date(x.created ?? x.createdAt).toISOString(),
      x.state ?? x.readyState,
      x.target ?? '-',
      (x.meta?.githubCommitSha ?? '-').slice(0, 7),
      (x.meta?.githubCommitRef ?? '-'),
      x.url,
    ].join(' | '));
  }
}
