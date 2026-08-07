// قياس فقط: أيّ نسخ نماذج يقبلها كلّ مفتاح. لا يطبع أي مفتاح إطلاقًا.
import { readFileSync } from 'node:fs';

const env: Record<string,string> = {};
for (const line of readFileSync('/tasklet/agent/home/.secrets/vercel.env','utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g,'');
}
const TOKEN = env.VERCEL_TOKEN || env.TOKEN || Object.values(env).find(v=>v.length>20) || '';
const TEAM = env.VERCEL_TEAM || env.VERCEL_TEAM_ID || '';
const PROJ = env.VERCEL_PROJECT || env.VERCEL_PROJECT_ID || '';

const q = (s:string)=> TEAM ? `${s}${s.includes('?')?'&':'?'}teamId=${TEAM}` : s;
const r = await fetch(q(`https://api.vercel.com/v9/projects/${PROJ}/env?decrypt=true`), { headers:{ Authorization:`Bearer ${TOKEN}` }});
if (!r.ok) { console.log('فشل سحب المتغيّرات:', r.status); process.exit(1); }
const data:any = await r.json();
const vars: Record<string,string> = {};
for (const e of data.envs||[]) if (typeof e.value === 'string') vars[e.key] = e.value;
console.log('عدد المتغيّرات:', Object.keys(vars).length);

const pick = (...names:string[]) => { for (const n of names) if (vars[n]) return vars[n]; return ''; };

// ---- Anthropic ----
const ak = pick('ANTHROPIC_API_KEY','CLAUDE_API_KEY');
if (ak) {
  const a = await fetch('https://api.anthropic.com/v1/models?limit=40', { headers:{ 'x-api-key':ak, 'anthropic-version':'2023-06-01' }});
  if (a.ok) { const j:any = await a.json();
    console.log('\n== Claude — نسخ متاحة ==');
    for (const m of j.data||[]) console.log(' ', m.id, '|', (m.display_name||''), '|', (m.created_at||'').slice(0,10));
  } else console.log('\nClaude: فشل', a.status, (await a.text()).slice(0,120));
} else console.log('\nClaude: لا مفتاح');

// ---- OpenAI ----
const ok = pick('OPENAI_API_KEY','GPT_API_KEY');
if (ok) {
  const o = await fetch('https://api.openai.com/v1/models', { headers:{ Authorization:`Bearer ${ok}` }});
  if (o.ok) { const j:any = await o.json();
    const ids = (j.data||[]).map((m:any)=>m.id).filter((id:string)=>/^(gpt-5|gpt-4\.|gpt-4o|o[1-9]|gpt-image|chatgpt)/.test(id)).sort();
    console.log('\n== GPT — نسخ متاحة (نصّ/صور) ==');
    for (const id of ids) console.log(' ', id);
    console.log('  (الإجمالي:', (j.data||[]).length, 'نموذج)');
  } else console.log('\nGPT: فشل', o.status, (await o.text()).slice(0,120));
} else console.log('\nGPT: لا مفتاح');

// ---- Gemini ----
const gk = pick('GEMINI_API_KEY','GOOGLE_API_KEY','GOOGLE_GENAI_API_KEY');
if (gk) {
  const g = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${gk}&pageSize=100`);
  if (g.ok) { const j:any = await g.json();
    const ids = (j.models||[]).map((m:any)=>m.name.replace('models/','')).filter((id:string)=>/^(gemini-3|gemini-2|imagen)/.test(id)).sort();
    console.log('\n== Gemini — نسخ متاحة ==');
    for (const id of ids) console.log(' ', id);
  } else console.log('\nGemini: فشل', g.status, (await g.text()).slice(0,120));
} else console.log('\nGemini: لا مفتاح');
