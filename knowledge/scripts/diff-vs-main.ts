// يقارن ملفّات محلّيّة في /tmp/vc/src ببصمة git blob على main — قراءة فقط.
import { invokeTool } from '@tasklet/tools/v2';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const CONN='conn_v99nvvn81c6baxgr3m9w', owner='OMRAN77', repo='omran-ai-builder', SRC='/tmp/vc/src';
const blob=(b:Buffer)=>createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${b.length}\0`),b])).digest('hex');
const files=process.argv.slice(2);
const diff:string[]=[]; const same:string[]=[]; const err:string[]=[];
for(const f of files){
  const r=await invokeTool({connectionId:CONN,toolName:'github_get_file_content',args:{owner,repo,repoPath:f}});
  if(!r.ok){err.push(`${f}: ${r.error}`);continue;}
  const j:any=await r.json();
  (j.sha===blob(readFileSync(`${SRC}/${f}`))?same:diff).push(f);
}
console.log('مختلف ('+diff.length+'):\n'+diff.map(x=>'  '+x).join('\n'));
console.log('مطابق ('+same.length+'): '+same.join(' '));
if(err.length)console.log('أخطاء:\n'+err.join('\n'));
