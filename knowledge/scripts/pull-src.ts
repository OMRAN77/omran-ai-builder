// يسحب شجرة src من نشر الإنتاج الحالي إلى /tmp/vc/src
// الاستخدام: bun pull-src.ts
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const env = Object.fromEntries((await Bun.file('/tasklet/agent/home/.secrets/vercel.env').text())
  .split('\n').filter(Boolean).map(l => l.split('=') as [string, string]));
const T = env.VERCEL_TOKEN, TEAM = env.VERCEL_TEAM, PRJ = env.VERCEL_PROJECT;
const H = { Authorization: `Bearer ${T}` };

const pj: any = await (await fetch(`https://api.vercel.com/v9/projects/${PRJ}?teamId=${TEAM}`, { headers: H })).json();
const DPL = pj?.targets?.production?.id;
console.log('① نشر الإنتاج:', DPL);

const tree: any = await (await fetch(`https://api.vercel.com/v6/deployments/${DPL}/files?teamId=${TEAM}`, { headers: H })).json();
const src = (Array.isArray(tree) ? tree : []).find((n: any) => n.name === 'src');
if (!src) { console.log('✗ لا عقدة src'); process.exit(1); }

type F = { path: string, uid: string };
const files: F[] = [];
const walk = (n: any, p: string) => {
  const np = p ? `${p}/${n.name}` : n.name;
  if (n.type === 'directory') (n.children ?? []).forEach((c: any) => walk(c, np));
  else if (n.uid) files.push({ path: np, uid: n.uid });
};
(src.children ?? []).forEach((c: any) => walk(c, ''));
console.log('② ملفات:', files.length);

let done = 0, fail = 0;
const CONC = 8;
for (let i = 0; i < files.length; i += CONC) {
  await Promise.all(files.slice(i, i + CONC).map(async f => {
    const r = await fetch(`https://api.vercel.com/v7/deployments/${DPL}/files/${f.uid}?teamId=${TEAM}`, { headers: H });
    if (!r.ok) { fail++; console.log(`   ✗ ${f.path} HTTP ${r.status}`); return; }
    const j: any = await r.json();
    const out = `/tmp/vc/src/${f.path}`;
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, Buffer.from(j.data, 'base64'));
    done++;
  }));
}
console.log(`③ نُزّل ${done} | فشل ${fail}`);
