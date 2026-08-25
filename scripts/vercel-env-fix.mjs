// scripts/vercel-env-fix.mjs — يصحّح متغيّرَي البيئة العالقين ويعيد النشر.
//
// بقي على المالك تصحيحان في Vercel لا تبلغهما شيفرة المستودع:
//   SITE_URL        فيها سرّ جوجل القديم بدل العنوان (منذ ٢٣ أغسطس)
//   OWNER_USERNAME  يشير إلى حساب «omran» المقفل بالسرّ الضائع، فلوحة
//                   المالك بلا مالك
// هذا يصحّحهما عبر واجهة Vercel ثمّ يطلق نشرة إنتاج جديدة لتسريا.
//
// لا يطبع قيمة أيّ متغيّر قائم أبدًا — القديم في SITE_URL سرّ مكشوف يكفيه
// ما ذاع. يطبع الأسماء والمعرّفات وما ضُبط حديثًا (وكلاهما علنيّ بطبيعته).
//
//   VERCEL_TOKEN=... node scripts/vercel-env-fix.mjs
const TOKEN = (process.env.VERCEL_TOKEN || '').trim();
const PROJECT = process.env.VERCEL_PROJECT || 'omran-ai-builder';
const WANT = {
  SITE_URL: 'https://omran-ai-builder.vercel.app',
  OWNER_USERNAME: 'omran2026',
};

if (!TOKEN) {
  console.log('· لا VERCEL_TOKEN — لا شيء يُفعل. أضفه في أسرار المستودع ليعمل هذا.');
  process.exit(0);
}

const api = async (path, init) => {
  const r = await fetch('https://api.vercel.com' + path, {
    ...init,
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', ...(init && init.headers) },
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path} → ${r.status} ${JSON.stringify(body).slice(0, 300)}`);
  return body;
};

const proj = await api(`/v9/projects/${PROJECT}`);
console.log(`المشروع: ${proj.name} (${proj.id})`);

const { envs } = await api(`/v9/projects/${proj.id}/env?decrypt=false`);
const TARGETS = ['production', 'preview', 'development'];

for (const [name, value] of Object.entries(WANT)) {
  const existing = (envs || []).filter((e) => e.key === name);
  if (existing.length) {
    for (const e of existing) {
      await api(`/v9/projects/${proj.id}/env/${e.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ value, target: e.target && e.target.length ? e.target : TARGETS }),
      });
      console.log(`✓ ${name}: صُحّح (${e.id})`);
    }
  } else {
    await api(`/v10/projects/${proj.id}/env`, {
      method: 'POST',
      body: JSON.stringify({ key: name, value, type: 'encrypted', target: TARGETS }),
    });
    console.log(`✓ ${name}: أُنشئ`);
  }
  console.log(`  ← القيمة الآن: ${value}`);
}

// نشرة إنتاج جديدة من main كي تسري القيم — المتغيّرات لا تلمس نشرة قائمة.
const repoId = proj.link && proj.link.repoId;
if (!repoId) {
  console.log('⚠ المشروع غير مربوط بمستودع git ظاهر — أعد النشر يدويًّا من اللوحة (Redeploy).');
  process.exit(0);
}
const dep = await api('/v13/deployments', {
  method: 'POST',
  body: JSON.stringify({
    name: proj.name,
    target: 'production',
    gitSource: { type: 'github', repoId, ref: 'main' },
  }),
});
console.log(`✓ أُطلقت نشرة إنتاج جديدة: ${dep.id || dep.uid || '؟'} — ستسري القيم معها.`);
console.log('  (فحص الدخان سيعمل تلقائيًّا بعد اكتمالها ويُظهر النتيجة)');
