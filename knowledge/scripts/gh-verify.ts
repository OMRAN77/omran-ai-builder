import { invokeTool } from '@tasklet/tools/v2';
const CONN='conn_v99nvvn81c6baxgr3m9w', owner='OMRAN77', repo='omran-ai-builder';
for (const f of process.argv.slice(2)) {
  const r = await invokeTool({ connectionId: CONN, toolName:'github_get_file_content', args:{ owner, repo, repoPath:f } });
  if(!r.ok){ console.log('✗',f,String(r.error).slice(0,120)); continue; }
  const j:any = await r.json();
  const c = j.content ?? j.text ?? '';
  console.log(`${f} | sha=${String(j.sha).slice(0,8)} | size=${j.size ?? c.length} | generate_image=${(String(c).match(/generate_image/g)||[]).length} | gateAsk=${/تبيني أبدأ البناء الحين/.test(String(c))}`);
}
