// 🩺 فحص صحّة المزوّدين — قياس فقط. لا يطبع أي مفتاح.
import { readFileSync } from 'node:fs';
const rd = (p:string)=>Object.fromEntries(readFileSync(p,'utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const V = rd('/tasklet/agent/home/.secrets/vercel.env');
const M = rd('/tasklet/agent/home/.secrets/monitor.env');
const SITE = process.env.SITE || 'https://omran-ai-builder.vercel.app';

// 1) نقطة الصحّة الحيّة
const hr = await fetch(`${SITE}/api/health?key=${encodeURIComponent(M.MONITOR_KEY)}`);
console.log('health status:', hr.status);
const ht = await hr.text();
try {
  const j = JSON.parse(ht);
  console.log('redisOk:', j.redisOk, '| ok:', j.ok, '| clientErrors:', j.clientErrorsCount);
  console.log('envKeys present:', JSON.stringify(j.envKeys));
  if (j.env) console.log('env core missing:', JSON.stringify(j.env.core||j.env.missing||null));
} catch { console.log('body(first 300):', ht.slice(0,300)); }

// 2) هل أستطيع سحب القيم من Vercel لفحص الصلاحية؟
const u = `https://api.vercel.com/v9/projects/${V.VERCEL_PROJECT}/env?decrypt=true&teamId=${V.VERCEL_TEAM}`;
const er = await fetch(u, { headers: { Authorization: `Bearer ${V.VERCEL_TOKEN}` } });
console.log('vercel env status:', er.status);
if (er.ok) {
  const d:any = await er.json();
  const envs = d.envs||[];
  const decrypted = envs.filter((e:any)=>typeof e.value==='string' && e.value.length>0 && e.value!=='<encrypted>');
  console.log('total env:', envs.length, '| with readable value:', decrypted.length);
  console.log('sample names:', decrypted.slice(0,5).map((e:any)=>e.key).join(', '));
} else { console.log('err(200):', (await er.text()).slice(0,200)); }
