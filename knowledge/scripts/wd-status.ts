import { invokeTool } from '@tasklet/tools/v2';

const q = async (sql: string) => {
  const r = await invokeTool({ toolName: 'run_agent_memory_sql', args: { query: sql } });
  return r.ok ? await r.json() : { error: r.error };
};

const auto = await invokeTool({ toolName: 'manage_active_automations', args: { action: 'list' } });
console.log('=== AUTOMATIONS ===');
console.log(JSON.stringify(auto.ok ? await auto.json() : auto.error).slice(0, 1500));

console.log('\n=== FINDINGS ===');
console.log(JSON.stringify(await q("SELECT severity, kind, file, status, times_seen FROM wd_findings ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END")));
console.log('\n=== METRICS ===');
console.log(JSON.stringify(await q("SELECT metric, value FROM wd_metrics WHERE run_date='2026-08-05'")));
console.log('\n=== RUNS / LESSONS ===');
console.log(JSON.stringify(await q("SELECT COUNT(*) AS runs FROM wd_runs")), JSON.stringify(await q("SELECT COUNT(*) AS lessons FROM wd_lessons")));
