import { invokeTool, summarizeJsonStructure } from '@tasklet/tools/v2';
const cands = ['', 'omran77', 'omran', 'omran-77', 'omrans-projects', 'omran77s-projects'];
for (const team of cands) {
  const r = await invokeTool({
    toolName: 'vercel_token_auth-list-deployments',
    connectionId: 'conn_verennr83r5s05yat4ef',
    args: { team, max: 30 },
  });
  if (!r.ok) { console.log(`[${team || '(empty)'}] FAIL: ${String(r.error).slice(0,140)}`); continue; }
  const data: any = await r.json();
  const arr = data.deployments ?? data.data ?? (Array.isArray(data) ? data : []);
  console.log(`[${team || '(empty)'}] OK  count=${arr.length}`);
  if (arr.length) {
    console.log(JSON.stringify(arr.slice(0,12).map((d:any)=>({name:d.name,url:d.url,state:d.state??d.readyState,target:d.target,branch:d.meta?.githubCommitRef??null,created:d.created?new Date(d.created).toISOString():null})),null,1));
    break;
  } else { console.log('SHAPE:', summarizeJsonStructure(data).slice(0,400)); }
}
