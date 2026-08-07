import fs from 'node:fs';
const F='/tasklet/agent/home/design/deploy/index.html';
const BK='/tasklet/agent/home/backup/rollback-points/index-before-v414.html';
const orig=fs.readFileSync(F,'utf8');
if(!fs.existsSync(BK)) fs.writeFileSync(BK,orig);
const lines=orig.split('\n');

// ---- مناطق محميّة ----
const protect=new Set<number>();
// 1) كل السكربتات
{ let inS=false;
  lines.forEach((L,i)=>{ if(/<script\b/i.test(L)) inS=true; if(inS) protect.add(i); if(/<\/script>/i.test(L)) inS=false; });
}
// 2) منطقة الدفع/الاشتراك (باب مقفل) ±18 سطرًا
lines.forEach((L,i)=>{ if(/openCheckout|checkout|stripe|paypal/i.test(L)) for(let k=i-18;k<=i+18;k++) protect.add(k); });

const rules:[RegExp,string,string][]=[
  // الرمادي: توحيد على متغيّر واحد محايد
  [/--muted:#98a0b3/g,'--muted:#9a9a9e','رمادي المصدر → محايد'],
  [/#98a0b3/g,'var(--muted)','رمادي خام مكرّر'],
  [/#999(?![0-9a-fA-F])/g,'var(--muted)','#999 → متغيّر'],
  // الذهب
  [/#d4af37/g,'var(--accent)','ذهب خام → متغيّر'],
  // متغيّرات ميتة/غريبة
  [/;\s*--accent3:#ff4ecd/g,'','حذف --accent3 الميت'],
  [/--accent2:#00e0b8/g,'--accent2:#e8c766','تركوازي → ذهب فاتح'],
  [/var\(--accent2,#00e0b8\)/g,'var(--accent2,#e8c766)','بديل تركوازي'],
  [/var\(--accent,#3b82f6\)/g,'var(--accent,#d4af37)','بديل أزرق ميت'],
  // البنفسجي → ذهب
  [/#a78bfa/g,'var(--accent-light)','بنفسجي فاتح'],
  [/#c4b5fd/g,'var(--accent-light)','بنفسجي باهت'],
  [/rgba\(139,92,246,/g,'rgba(212,175,55,','بنفسجي شفاف'],
  [/rgba\(167,139,250,/g,'rgba(232,199,102,','بنفسجي شفاف ٢'],
  [/rgba\(124,92,255,/g,'rgba(212,175,55,','بنفسجي شفاف ٣'],
];
const hits:Record<string,number>={};
const out=lines.map((L,i)=>{
  if(protect.has(i)) return L;
  let s=L;
  for(const [rx,rep,name] of rules){
    const n=(s.match(rx)||[]).length;
    if(n){ s=s.replace(rx,rep); hits[name]=(hits[name]||0)+n; }
  }
  return s;
});
// إصلاح ترتيب: --accent داخل :root نفسه يجب أن يبقى قيمة خامًا
out[82]=out[82].replace('--accent:var(--accent)','--accent:#d4af37')
               .replace('--accent-light:var(--accent)','--accent-light:#e8c766');
let txt=out.join('\n');
// :root الثاني (سطر 729) — omGold يجب أن يبقى خامًا
txt=txt.replace('--omGold:var(--accent)','--omGold:#d4af37');
// الأيقونة البنفسجية داخل السكربت (استثناء مقصود، لون خام لأنه سمة SVG)
txt=txt.replace('stroke="#a78bfa"','stroke="#e8c766"');
// تدرّجات كانت ذهب→أخضر بعد التحويل: نعيّد الطرف الثاني ذهبًا خفيفًا
let grad=0;
txt=txt.split('\n').map(L=>{
  if(/rgba\(212,175,55,[^)]*\)\s*,\s*rgba\(16,185,129,/.test(L)){ grad++; return L.replace(/rgba\(16,185,129,\s*\.(\d+)\)/g,'rgba(212,175,55,.10)'); }
  return L;
}).join('\n');

// ---- تحقّق ----
const a=orig.split('\n'), b=txt.split('\n');
if(a.length!==b.length) throw new Error('تغيّر عدد الأسطر!');
let changed=0; for(let i=0;i<a.length;i++) if(a[i]!==b[i]) changed++;
if(/var\(var\(/.test(txt)) throw new Error('var متشعّب');
if(!/--accent:#d4af37/.test(txt)) throw new Error('--accent فُقد');
if(!/--muted:#9a9a9e/.test(txt)) throw new Error('--muted فُقد');
const left=(s:string,rx:RegExp)=>(s.match(rx)||[]).length;
fs.writeFileSync(F,txt);
console.log('=== ما تغيّر ===');
for(const k in hits) console.log('  '+k+': '+hits[k]);
console.log('  تدرّجات معدّلة: '+grad);
console.log('أسطر معدّلة = '+changed+' | إجمالي الأسطر '+b.length+' (ثابت)');
console.log('بقايا محميّة: #999='+left(txt,/#999(?![0-9a-fA-F])/g)+' #d4af37='+left(txt,/#d4af37/g)+' بنفسجي='+left(txt,/#a78bfa|#c4b5fd|139,92,246/g)+' أزرق='+left(txt,/#3b82f6/g));
