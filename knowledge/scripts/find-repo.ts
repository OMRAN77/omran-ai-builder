import { invokeTool } from '@tasklet/tools/v2';
const CONN = 'conn_v99nvvn81c6baxgr3m9w';
const all: any[] = [];
for (let page = 1; page <= 5; page++) {
  const r = await invokeTool({ toolName: 'github_list_repositories', connectionId: CONN, args: { type: 'all', sort: 'updated', direction: 'desc', per_page: 100, page } });
  if (!r.ok) { console.log('ERR', r.error); break; }
  const d = await r.json() as any[];
  all.push(...d);
  if (d.length < 100) break;
}
console.log('total repos:', all.length);
const hits = all.filter(r => /omran|builder|ai/i.test(r.name));
console.log('candidates:');
for (const r of hits) console.log(`  ${r.fullName} | private=${r.private} | lang=${r.language} | branch=${r.defaultBranch} | updated=${r.updatedAt}`);
console.log('--- all names ---');
console.log(all.map(r => r.fullName).join(', '));
