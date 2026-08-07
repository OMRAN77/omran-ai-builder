import { invokeTool } from '@tasklet/tools/v2';
const CONN='conn_v99nvvn81c6baxgr3m9w', owner='OMRAN77', repo='omran-ai-builder';
const keys=['omranRightPanel','omranBalanceCard','omranBalanceTop','omranTopUpBtn',"'#omranQuickList'"];
for (const ref of ['068d8a2','main']) {
  const r = await invokeTool({ toolName:'github_get_file_content', connectionId:CONN,
    args:{ owner, repo, repoPath:'index.html', ref } });
  if(!r.ok){ console.log(`[${ref}] FAIL ${String(r.error).slice(0,150)}`); continue; }
  const d:any = await r.json();
  const txt = typeof d==='string' ? d : (d.content ?? d.text ?? JSON.stringify(d));
  const bad = keys.filter(k=>txt.includes(k));
  console.log(`[${ref}] bytes=${txt.length} lines=${txt.split('\n').length} sha=${String(d.sha??'').slice(0,7)}`);
  console.log(`   ${bad.length? '✗ بقايا: '+bad.join(', ') : '✓ صفر بقايا'}   |   جوال: ${txt.includes('omranQuickListMobile')?'باقٍ ✓':'مفقود ✗'}`);
}
