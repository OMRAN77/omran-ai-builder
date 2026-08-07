import { invokeTool, summarizeJsonStructure } from '@tasklet/tools/v2';
const CONN = 'conn_ghpnmc2qpyh0ekrazrdy';
async function g(url: string) {
  const r = await invokeTool({ toolName: 'remote_http_call', connectionId: CONN, args: { url, method: 'GET' } });
  if (!r.ok) return { err: r.error };
  return await r.json();
}
const list: any = await g('https://api.vercel.com/v6/deployments?app=omran-ai-builder&limit=6');
if (list.err) { console.log('ERR:', String(list.err).slice(0, 400)); process.exit(0); }
console.log('SHAPE:', summarizeJsonStructure(list).slice(0, 700));
const ds = (list.deployments ?? []) as any[];
for (const d of ds) {
  console.log('---');
  console.log('id      :', d.uid ?? d.id);
  console.log('url     :', d.url);
  console.log('state   :', d.state ?? d.readyState, '| target:', d.target);
  console.log('created :', new Date(d.created ?? d.createdAt).toISOString());
  console.log('source  :', d.source);
  console.log('meta    :', JSON.stringify(d.meta ?? {}).slice(0, 500));
}
