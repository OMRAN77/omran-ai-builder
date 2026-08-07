// نشر index.html وحده — بقية الملفات ١٦٣ تُمرَّر ببصماتها الأصلية (لا يُمَسّ منها بايت)
// الاستخدام: bun deploy-index.ts <مسار index.html> <preview|production> "<وصف التغيير>"
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const [FILE, TARGET, NOTE = ''] = process.argv.slice(2);

// ⓪ نفس بوّابة deploy-files.ts — وإلّا كان في السياج ثقب بحجم هذا النصّ.
const g = spawnSync('npm', ['run', '--silent', 'ci'], { cwd: '/tmp/vc/src', encoding: 'utf8' });
if (g.status !== 0) {
  console.log('⓪ ✗ فحوص ما قبل النشر أحمر — أُلغي النشر، لم يُلمس Vercel:');
  console.log(((g.stdout ?? '') + (g.stderr ?? '')).trim().split('\n').slice(-12).join('\n'));
  process.exit(1);
}
console.log('⓪ ✅ فحوص ما قبل النشر');
if (!FILE || !['preview', 'production'].includes(TARGET)) {
  console.log('الاستخدام: bun deploy-index.ts <file> <preview|production> "<note>"'); process.exit(1);
}
const env = Object.fromEntries((await Bun.file('/tasklet/agent/home/.secrets/vercel.env').text())
  .split('\n').filter(Boolean).map(l => l.split('=') as [string, string]));
const T = env.VERCEL_TOKEN, TEAM = env.VERCEL_TEAM, PRJ = env.VERCEL_PROJECT;
const H = { Authorization: `Bearer ${T}` };

const p = await fetch(`https://api.vercel.com/v9/projects/${PRJ}?teamId=${TEAM}`, { headers: H });
const pj: any = await p.json();
const CUR = pj?.targets?.production?.id;
console.log('① الإنتاج الحالي (نقطة الرجوع):', CUR);

const meta = JSON.parse(await Bun.file('/tasklet/agent/home/deploy/prod-meta-sha1.json').text()) as { file: string, sha: string, size: number }[];
const buf = Buffer.from(await Bun.file(FILE).arrayBuffer());
const sha = createHash('sha1').update(buf).digest('hex');
const up = await fetch(`https://api.vercel.com/v2/files?teamId=${TEAM}`, {
  method: 'POST', headers: { ...H, 'x-vercel-digest': sha, 'Content-Type': 'application/octet-stream' }, body: buf
});
console.log(`② رفع index.html: HTTP ${up.status} | ${buf.length} بايت | sha ${sha.slice(0, 10)}…`);
if (!up.ok) { console.log('   خطأ:', (await up.text()).slice(0, 300)); process.exit(1); }

const files = meta.map(m => m.file === 'index.html' ? { file: 'index.html', sha, size: buf.length } : m);
const body: any = { name: 'omran-ai-builder', project: PRJ, files };
if (TARGET === 'production') body.target = 'production';
const cr = await fetch(`https://api.vercel.com/v13/deployments?teamId=${TEAM}&skipAutoDetectionConfirmation=1`, {
  method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
});
const cj: any = await cr.json();
if (!cr.ok) { console.log(`   ✗ HTTP ${cr.status}:`, JSON.stringify(cj).slice(0, 700)); process.exit(1); }
console.log(`③ أُنشئ نشر (${TARGET}): ${cj.id}`);

let st = '', last = '', urls: string[] = [];
for (let i = 0; i < 60; i++) {
  await new Promise(r => setTimeout(r, 4000));
  const s = await fetch(`https://api.vercel.com/v13/deployments/${cj.id}?teamId=${TEAM}`, { headers: H });
  const sj: any = await s.json();
  st = sj.readyState ?? sj.status;
  urls = [sj.url, ...(sj.alias ?? [])].filter(Boolean);
  if (st !== last) { console.log(`   … ${st} (${(i + 1) * 4}ث)`); last = st; }
  if (st === 'READY') { console.log(`④ ✅ جاهز | https://${urls[0]}`); break; }
  if (st === 'ERROR' || st === 'CANCELED') { console.log(`④ ✗ ${st}`, JSON.stringify(sj.errorMessage ?? '').slice(0, 300)); break; }
}
await writeFile('/tasklet/agent/home/deploy/LAST-DEPLOY.txt',
  `deployment=${cj.id}\ntarget=${TARGET}\nrollbackTo=${CUR}\nindexSha=${sha}\nindexBytes=${buf.length}\nurls=${urls.join(' ')}\nat=${new Date().toISOString()}\nchange=${NOTE}\n`);
console.log(`\nالحالة: ${st} | الرابط: https://${urls[0]} | للرجوع: ${CUR}`);
