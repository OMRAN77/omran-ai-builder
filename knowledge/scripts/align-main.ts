import { invokeTool } from '@tasklet/tools/v2';
const CONN='conn_v99nvvn81c6baxgr3m9w';
const r = await invokeTool({ toolName:'github_push_to_branch', connectionId: CONN, args:{
  owner:'OMRAN77', repo:'omran-ai-builder', branch:'main',
  commitMessage:'fix(ui): align index.html with production + remove right panel\n\nالمستودع كان متأخّرًا عن الموقع الحيّ (تعديلات المستخدم: حركة ظهور الرسائل، زر محادثة جديدة).\nهذه النسخة = نسخة الموقع الحيّ نفسها مع حذف اللوحة اليمنى فقط (-30 سطرًا، صفر مضاف).',
  files:[{ repoPath:'index.html', localPath:'/tasklet/agent/home/design/ready/index-live.html' }]
}});
if(!r.ok){ console.log('ERR:', String(r.error).slice(0,400)); process.exit(0);}
const d:any = await r.json(); console.log('commit:', d.commit?.sha?.slice(0,7), '| files:', d.filesChanged);
const v = await invokeTool({ toolName:'github_get_file_content', connectionId: CONN, args:{ owner:'OMRAN77', repo:'omran-ai-builder', repoPath:'index.html', ref:'main' }});
if(v.ok){ const f:any = await v.json(); const c=f.content??'';
  console.log('main: أسطر =', c.split('\n').length, '| omranRightPanel =', (c.match(/omranRightPanel/g)||[]).length, '| msgFadeIn =', (c.match(/msgFadeIn/g)||[]).length, '| omranQuickListMobile =', (c.match(/omranQuickListMobile/g)||[]).length);
}
