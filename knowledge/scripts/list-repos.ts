import { invokeTool } from '@tasklet/tools/v2';
const CONN = 'conn_v99nvvn81c6baxgr3m9w';
const r = await invokeTool({ connectionId: CONN, toolName: 'github_list_repositories', args: { per_page: 100 } });
if (!r.ok) { console.log('ERR', r.error); process.exit(1); }
const d: any = await r.json();
const list = Array.isArray(d) ? d : (d.repositories ?? d.items ?? d.data ?? []);
console.log('count=', list.length);
for (const x of list) {
  console.log([x.full_name ?? x.name, x.private ? 'private' : 'public', x.language ?? '-', 'push:' + (x.pushed_at ?? '-'), 'issues:' + (x.open_issues_count ?? '?')].join(' | '));
}
