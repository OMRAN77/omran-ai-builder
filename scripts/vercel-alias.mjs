// scripts/vercel-alias.mjs — يسأل Vercel نفسه: أيّ نشرة يحملها الاسم؟ ولماذا لا يتحرّك؟
//
// اليوم قضينا ساعتين نستدلّ على هذا من الخارج: بصمة حزمة، ورؤوس كاش، ومِجسّ
// بمسار جديد. كلّها أثبتت أنّ النطاق عالق على نشرة ٢٣ أغسطس — لكن أيًّا منها
// لم يقل **لماذا**، لأنّ الجواب داخل Vercel لا في الشبكة.
//
// بمفتاح واحد نسأله مباشرة. وبلا مفتاح لا يفعل شيئًا ولا يفشل.
//
//   node scripts/vercel-alias.mjs            → تشخيص فقط (لا يغيّر شيئًا)
//   node scripts/vercel-alias.mjs --apply    → يعيد ربط الاسم بأحدث نشرة إنتاج
const TOKEN = (process.env.VERCEL_TOKEN || '').trim();
const PROJECT = process.env.VERCEL_PROJECT || 'omran-ai-builder';
const DOMAIN = process.env.VERCEL_DOMAIN || 'omran-ai-builder.vercel.app';
const TEAM = (process.env.VERCEL_TEAM_ID || '').trim();
const APPLY = process.argv.includes('--apply');

if (!TOKEN) {
  console.log('· لا VERCEL_TOKEN — لا شيء يُفعل. أضفه في أسرار المستودع ليعمل هذا.');
  process.exit(0);
}

const q = (extra = '') => (TEAM ? `?teamId=${TEAM}${extra}` : (extra ? '?' + extra.replace(/^&/, '') : ''));
const api = async (path, init) => {
  const r = await fetch('https://api.vercel.com' + path, {
    ...init,
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', ...(init && init.headers) },
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path} → ${r.status} ${JSON.stringify(body).slice(0, 200)}`);
  return body;
};

const proj = await api(`/v9/projects/${PROJECT}` + q());
console.log(`المشروع: ${proj.name}  (${proj.id})`);

// ① ما الذي يحمله الاسم الآن؟
let current = null;
try {
  const d = await api(`/v9/projects/${proj.id}/domains/${DOMAIN}` + q());
  current = d;
  console.log(`الاسم ${DOMAIN}:`);
  console.log(`  · مثبَّت على نشرة بعينها؟ ${d.gitBranch ? 'فرع ' + d.gitBranch : (d.redirect ? 'تحويل → ' + d.redirect : 'الإنتاج')}`);
} catch (e) {
  console.log(`الاسم ${DOMAIN}: تعذّرت قراءته — ${e.message}`);
}

// ② أحدث نشرة إنتاج جاهزة
const deps = await api(`/v6/deployments${q(`&projectId=${proj.id}&target=production&state=READY&limit=3`)}`);
const list = deps.deployments || [];
if (!list.length) { console.log('لا نشرة إنتاج جاهزة.'); process.exit(1); }
console.log('أحدث نشرات الإنتاج الجاهزة:');
for (const d of list) {
  const when = new Date(d.created).toISOString().replace('T', ' ').slice(0, 16);
  console.log(`  · ${d.uid}  ${when}  ${(d.meta && d.meta.githubCommitSha || '').slice(0, 7)}  ${d.url}`);
}
const newest = list[0];

// ③ ما الذي يخدمه الاسم فعلًا؟ نسأل عن نشرة الاسم مباشرة.
try {
  const alias = await api(`/v4/aliases/${DOMAIN}` + q());
  const servingSha = ((alias.deployment && alias.deployment.meta && alias.deployment.meta.githubCommitSha) || '').slice(0, 7);
  console.log(`الاسم يخدم الآن: ${alias.deploymentId || '؟'}  ${servingSha || ''}`);
  if (alias.deploymentId === newest.uid) console.log('  ✓ الاسم على أحدث نشرة.');
  else console.log(`  ✗ الاسم متأخّر — أحدث نشرة ${newest.uid}`);
} catch (e) {
  console.log(`قراءة الاسم: ${e.message}`);
}

if (!APPLY) { console.log('\n(تشخيص فقط — أضف --apply لإعادة الربط)'); process.exit(0); }

// ④ إعادة الربط
console.log(`\nإعادة ربط ${DOMAIN} → ${newest.uid} …`);
await api(`/v2/deployments/${newest.uid}/aliases` + q(), { method: 'POST', body: JSON.stringify({ alias: DOMAIN }) });
console.log('✓ تمّت. تحقّق بالمِجسّ: node scripts/smoke.mjs');
