// Preview an HTML fragment (style+script) on the live site without deploying.
import { invokeTool } from '@tasklet/tools/v2';
import { readFileSync } from 'node:fs';
const b64 = Buffer.from(readFileSync(process.argv[2], 'utf8')).toString('base64');
const openId = process.argv[3] || '';
const url = process.argv[4] || 'https://omran-ai-builder.vercel.app/';
const expr = `(async()=>{const html=decodeURIComponent(escape(atob(${JSON.stringify(b64)})));const box=document.createElement('div');box.innerHTML=html;const out=[];[...box.querySelectorAll('style')].forEach(s=>{document.head.appendChild(s);out.push('css'+s.textContent.length)});[...box.querySelectorAll('script')].forEach(s=>{const n=document.createElement('script');n.textContent=s.textContent;document.body.appendChild(n);out.push('js'+s.textContent.length)});const m=document.getElementById(${JSON.stringify(openId)});if(m)m.style.display='flex';await new Promise(r=>setTimeout(r,600));const c=m&&m.firstElementChild;return {out,studio:!!(c&&c.classList.contains('vmk-studio')),cards:document.querySelectorAll('.vmk-card').length,pills:document.querySelectorAll('.vmk-pill').length,chips:document.querySelectorAll('.vmk-chip').length,checked:[...document.querySelectorAll('[aria-checked=true]')].map(e=>e.dataset.v),cols:c?getComputedStyle(c).gridTemplateColumns:null,mobile:document.documentElement.classList.contains('mobile-ui')};})()`;
const r = await invokeTool({ toolName: 'browser', args: { actions: [ { navigate: { url, duration_seconds: 4 } }, { evaluate: { expression: expr } } ] } });
console.log(r.ok ? JSON.stringify(await r.json()).slice(0, 1200) : 'ERR ' + r.error);
