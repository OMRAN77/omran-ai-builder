import { invokeTool } from '@tasklet/tools/v2';
const CONN='conn_v99nvvn81c6baxgr3m9w';
const r = await invokeTool({ toolName:'github_list_repositories', connectionId: CONN, args:{ per_page:100 }});
if(!r.ok){ console.log('ERR:', String(r.error).slice(0,300)); process.exit(0);}
const d:any = await r.json();
const repos = (d.repositories ?? d ?? []) as any[];
console.log('عدد المستودعات:', repos.length);
for(const x of repos) console.log('-', x.fullName ?? x.full_name ?? x.name, '| private:', x.private, '| pushed:', (x.pushedAt ?? x.pushed_at ?? '').slice(0,16));
