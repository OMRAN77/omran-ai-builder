import { invokeTool } from '@tasklet/tools/v2';

const CONN = 'conn_v99nvvn81c6baxgr3m9w';
const out: any[] = [];

for (const state of ['open', 'closed'] as const) {
  const r = await invokeTool({
    toolName: 'github_list_pull_requests',
    connectionId: CONN,
    args: { owner: 'OMRAN77', repo: 'omran-ai-builder', state, per_page: 100 },
  });
  if (!r.ok) {
    console.log(`FAIL ${state}: ${r.error}`);
    continue;
  }
  const data: any = await r.json();
  const arr = Array.isArray(data) ? data : (data.pullRequests ?? data.items ?? data.data ?? []);
  for (const p of arr) {
    out.push({
      n: p.number,
      state: p.state,
      title: p.title,
      head: p.head?.ref ?? p.headBranch ?? p.head,
      base: p.base?.ref ?? p.baseBranch ?? p.base,
      merged: p.merged_at ?? p.mergedAt ?? null,
      created: p.created_at ?? p.createdAt ?? null,
    });
  }
}

console.log(JSON.stringify(out, null, 1));
