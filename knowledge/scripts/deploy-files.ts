// ينشر شجرة /tmp/vc/src كاملة (١٦٤ ملفًا) ويرفع فقط الملفات المذكورة
// الاستخدام: bun deploy-files.ts <preview|production> "<وصف>" <مسار نسبي> [مسار نسبي...]
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const [TARGET, NOTE, ...CHANGED] = process.argv.slice(2);
if (!['preview', 'production'].includes(TARGET) || !CHANGED.length) {
  console.log('الاستخدام: bun deploy-files.ts <preview|production> "<وصف>" <ملف> [ملف...]'); process.exit(1);
}
const ROOT = process.env.SRC_ROOT ?? '/tmp/vc/src';

// ⓪ بوّابة ①: لا يخرج أحمرٌ من هذه الآلة. الفحوص تسبق أوّل اتّصال بـVercel،
// لأنّ النشر هنا يمضي من هذه النصوص إلى Vercel مباشرةً ولا يعبر GitHub — فلا
// يستطيع Actions أن يحرس هذا الطريق. الحارس يسكن حيث يمرّ النشر فعلًا.
const MON = Object.fromEntries((await Bun.file('/tasklet/agent/home/.secrets/monitor.env').text())
  .split('\n').filter(Boolean).map(l => l.split('=') as [string, string]));
const run = (args: string[], label: string, root = ROOT) => {
  const r = spawnSync(args[0], args.slice(1), { cwd: root, encoding: 'utf8',
    env: { ...process.env, ...MON } });
  const out = ((r.stdout ?? '') + (r.stderr ?? '')).trim().split('\n');
  if (r.status !== 0) { console.log(`✗ ${label} أحمر:`); console.log(out.slice(-14).join('\n')); }
  else console.log(`✅ ${label}`);
  return { ok: r.status === 0, out };
};
if (!run(['npm', 'run', '--silent', 'ci'], 'فحوص ما قبل النشر (check·guard·verify·test)').ok) {
  console.log('⓪ أُلغي النشر — لم يُلمس Vercel.'); process.exit(1);
}

const env = Object.fromEntries((await Bun.file('/tasklet/agent/home/.secrets/vercel.env').text())
  .split('\n').filter(Boolean).map(l => l.split('=') as [string, string]));
const T = env.VERCEL_TOKEN, TEAM = env.VERCEL_TEAM, PRJ = env.VERCEL_PROJECT;
const H = { Authorization: `Bearer ${T}` };

const pj: any = await (await fetch(`https://api.vercel.com/v9/projects/${PRJ}?teamId=${TEAM}`, { headers: H })).json();
const CUR = pj?.targets?.production?.id;
console.log('① نقطة الرجوع:', CUR);

const all: string[] = [];
const walk = (d: string, p = '') => readdirSync(d).forEach(n => {
  const fp = `${d}/${n}`, rel = p ? `${p}/${n}` : n;
  statSync(fp).isDirectory() ? walk(fp, rel) : all.push(rel);
});
walk(ROOT);
const files = await Promise.all(all.map(async rel => {
  const buf = Buffer.from(await Bun.file(`${ROOT}/${rel}`).arrayBuffer());
  return { file: rel, sha: createHash('sha1').update(buf).digest('hex'), size: buf.length, buf };
}));
console.log('② ملفات الشجرة:', files.length);
for (const c of CHANGED) if (!files.some(f => f.file === c)) { console.log('   ✗ غير موجود:', c); process.exit(1); }

for (const rel of CHANGED) {
  const f = files.find(x => x.file === rel)!;
  const up = await fetch(`https://api.vercel.com/v2/files?teamId=${TEAM}`, {
    method: 'POST', headers: { ...H, 'x-vercel-digest': f.sha, 'Content-Type': 'application/octet-stream' }, body: f.buf
  });
  console.log(`   رفع ${rel}: HTTP ${up.status} | ${f.size} بايت | ${f.sha.slice(0, 10)}…`);
  if (!up.ok) { console.log('   خطأ:', (await up.text()).slice(0, 300)); process.exit(1); }
}

const body: any = { name: 'omran-ai-builder', project: PRJ, files: files.map(({ file, sha, size }) => ({ file, sha, size })) };
if (TARGET === 'production') body.target = 'production';
const cr = await fetch(`https://api.vercel.com/v13/deployments?teamId=${TEAM}&skipAutoDetectionConfirmation=1`, {
  method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
});
const cj: any = await cr.json();
if (!cr.ok) { console.log(`   ✗ HTTP ${cr.status}:`, JSON.stringify(cj).slice(0, 700)); process.exit(1); }
console.log(`③ أُنشئ نشر (${TARGET}): ${cj.id}`);

let st = '', last = '', urls: string[] = [];
for (let i = 0; i < 75; i++) {
  await new Promise(r => setTimeout(r, 4000));
  const sj: any = await (await fetch(`https://api.vercel.com/v13/deployments/${cj.id}?teamId=${TEAM}`, { headers: H })).json();
  st = sj.readyState ?? sj.status;
  urls = [sj.url, ...(sj.alias ?? [])].filter(Boolean);
  if (st !== last) { console.log(`   … ${st} (${(i + 1) * 4}ث)`); last = st; }
  if (st === 'READY') { console.log(`④ ✅ جاهز | https://${urls[0]}`); break; }
  if (st === 'ERROR' || st === 'CANCELED') { console.log(`④ ✗ ${st}`, JSON.stringify(sj.errorMessage ?? '').slice(0, 300)); break; }
}
let smoke = 'skipped';
if (st === 'READY') {
  const s5 = run(['node', 'scripts/smoke.mjs', `https://${urls[0]}`], `دخان على ${TARGET}`);
  smoke = s5.ok ? 'green' : 'red';
  console.log(s5.out.slice(-6).join('\n'));
  if (!s5.ok) console.log(TARGET === 'production'
    ? `   ⚠ أحمر على الإنتاج — للرجوع فورًا: bun scripts/vercel-rollback.ts ${CUR}`
    : '   ⚠ أحمر على المعاينة — لا تُرقّ هذه النشرة.');
}
await writeFile('/tasklet/agent/home/deploy/LAST-DEPLOY.txt',
  `deployment=${cj.id}\ntarget=${TARGET}\nrollbackTo=${CUR}\nchangedFiles=${CHANGED.join(' ')}\nurls=${urls.join(' ')}\nsmoke=${smoke}\nat=${new Date().toISOString()}\nchange=${NOTE}\n`);
console.log(`\nالحالة: ${st} | دخان: ${smoke} | الرابط: https://${urls[0]} | للرجوع: ${CUR}`);
