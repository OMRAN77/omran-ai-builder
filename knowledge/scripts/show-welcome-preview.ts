import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
const D='/tasklet/agent/home/design/deploy';
const SRC=`${D}/index.html`, OUT=`${D}/index-welcome-preview.html`;
let s=readFileSync(SRC,'utf8'); const before=s;

const OLD=`  html:not(.mobile-ui) body.omranWelcome #workarea,
  html:not(.mobile-ui) body.omranWelcome #resizer2{display:none !important;}`;
const NEW=`  html:not(.mobile-ui) body.omranWelcome #workarea{min-width:380px;}`;

const n=s.split(OLD).length-1;
console.log('عدد المطابقات:', n);
if(n!==1){ console.log('✗ توقّفت — المطابقة ليست واحدة بالضبط'); process.exit(1); }
s=s.replace(OLD,NEW);

// نسخة احتياطية قبل أي كتابة
copyFileSync(SRC, '/tasklet/agent/home/backup/rollback-points/index-before-welcome-preview.html');
writeFileSync(OUT,s);

const lb=before.split('\n').length, la=s.split('\n').length;
console.log(`أسطر: ${lb} → ${la} (${la-lb})`);
console.log(`بايت: ${Buffer.byteLength(before)} → ${Buffer.byteLength(s)}`);
const bal=(t:string,a:string,b:string)=>[t.split(a).length-1,t.split(b).length-1];
console.log('توازن {} :', bal(s,'{','}').join('='));
