import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
const env = Object.fromEntries((await Bun.file('/tasklet/agent/home/.secrets/vercel.env').text())
  .split('\n').filter(Boolean).map(l=>l.split('=') as [string,string]));
const T=env.VERCEL_TOKEN, TEAM=env.VERCEL_TEAM, PRJ=env.VERCEL_PROJECT;
const H={Authorization:`Bearer ${T}`};
const NEW_FILE='/tasklet/agent/home/design/deploy/index-rtl-mirror.html';

// ① الإنتاج الحالي = نقطة الرجوع
const p = await fetch(`https://api.vercel.com/v9/projects/${PRJ}?teamId=${TEAM}`,{headers:H});
const pj:any = await p.json();
const CUR = pj?.targets?.production?.id;
console.log('① الإنتاج الحالي (نقطة الرجوع):', CUR);

const meta = JSON.parse(await Bun.file('/tasklet/agent/home/deploy/prod-meta-sha1.json').text()) as {file:string,sha:string,size:number}[];

// ② رفع index.html الجديد
const buf = Buffer.from(await Bun.file(NEW_FILE).arrayBuffer());
const sha = createHash('sha1').update(buf).digest('hex');
const up = await fetch(`https://api.vercel.com/v2/files?teamId=${TEAM}`,{
  method:'POST', headers:{...H,'x-vercel-digest':sha,'Content-Type':'application/octet-stream'}, body:buf});
console.log(`② رفع index.html: HTTP ${up.status} | ${buf.length} بايت | sha ${sha.slice(0,10)}…`);
if(!up.ok){ console.log('   خطأ:', (await up.text()).slice(0,300)); process.exit(1); }

// ③ النشر: باقي الملفات ببصماتها نفسها (لا تُمَس)
const files = meta.map(m => m.file==='index.html' ? {file:'index.html', sha, size:buf.length} : {file:m.file, sha:m.sha, size:m.size});
console.log(`③ ملفات النشر: ${files.length} (${files.length-1} ببصماتها الأصلية)`);
const cr = await fetch(`https://api.vercel.com/v13/deployments?teamId=${TEAM}&skipAutoDetectionConfirmation=1`,{
  method:'POST', headers:{...H,'Content-Type':'application/json'},
  body: JSON.stringify({ name:'omran-ai-builder', project:PRJ, target:'production', files })});
const cj:any = await cr.json();
if(!cr.ok){ console.log(`   ✗ HTTP ${cr.status}:`, JSON.stringify(cj).slice(0,700)); process.exit(1); }
console.log(`④ أُنشئ النشر: ${cj.id}`);

let st='', last='';
for(let i=0;i<60;i++){
  await new Promise(r=>setTimeout(r,4000));
  const s = await fetch(`https://api.vercel.com/v13/deployments/${cj.id}?teamId=${TEAM}`,{headers:H});
  const sj:any = await s.json();
  st = sj.readyState ?? sj.status;
  if(st!==last){ console.log(`   … ${st} (${(i+1)*4}ث)`); last=st; }
  if(st==='READY'){ console.log(`⑤ ✅ جاهز | ${(sj.alias??[]).join(', ')}`); break; }
  if(st==='ERROR'||st==='CANCELED'){ console.log(`⑤ ✗ ${st}`, JSON.stringify(sj.errorMessage??'').slice(0,300)); break; }
}
await writeFile('/tasklet/agent/home/deploy/newdep3.txt', `${cj.id}\nrollbackTo=${CUR}\nsha=${sha}\n`);
await writeFile('/tasklet/agent/home/deploy/LAST-DEPLOY.txt',
  `deployment=${cj.id}\nrollbackTo=${CUR}\nindexSha=${sha}\nindexBytes=${buf.length}\nat=${new Date().toISOString()}\nchange=انعكاس التخطيط مع اتجاه اللغة (RTL: الشريط يمين / المعاينة يسار) + سحب حسّاس للجهة\n`);
console.log(`\nالحالة: ${st} | للرجوع: ${CUR}`);
