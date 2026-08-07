// Preview a CSS block on the live site without deploying: inject <style> then open a modal.
import { invokeTool } from '@tasklet/tools/v2';
import { readFileSync } from 'node:fs';
const b64 = readFileSync(process.argv[2], 'utf8').trim();
const openId = process.argv[3] || '';
const url = process.argv[4] || 'https://omran-ai-builder.vercel.app/';
const expr = `(()=>{const css=atob(${JSON.stringify(b64)});let e=document.getElementById('__preview_css');if(!e){e=document.createElement('style');e.id='__preview_css';document.head.appendChild(e);}e.textContent=css;const m=document.getElementById(${JSON.stringify(openId)});if(m){m.style.display='flex';}const s=document.getElementById('videoMakerStyle');return {injected:css.length,mobile:document.documentElement.classList.contains('mobile-ui'),selRadius:s?getComputedStyle(s).borderRadius:null,selBg:s?getComputedStyle(s).backgroundColor:null};})()`;
const r = await invokeTool({ toolName: 'browser', args: { actions: [ { navigate: { url, duration_seconds: 4 } }, { evaluate: { expression: expr } } ] } });
console.log(r.ok ? JSON.stringify(await r.json()).slice(0, 900) : 'ERR ' + r.error);
