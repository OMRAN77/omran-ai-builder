// v-deploy-probe (أمر المالك ١٨ أكتوبر: «deploy-probe.txt: خلّه يثبت النشر فعلًا. كل دمج يكتب فيه رقم الكوميت، وفحص
// النشر يقارنه بالموقع الحي ويفشل إذا ما تطابق»). كان ملفًّا ثابتًا في المستودع (commit=fe5ea5a منذ أغسطس)، فخطوة
// المِجسّ في smoke.mjs تقارن الملفّ بنفسه وتنجح دائمًا. الآن /deploy-probe.txt يُعاد كتابته إلى هنا (vercel.json)،
// والالتزام يأتي من النشرة نفسها: Vercel يضع VERCEL_GIT_COMMIT_SHA لكلّ نشرة من GitHub — فكلّ دمج يكتب رقمه.
// بلا الرقم لا نجاح كاذب: 503 وcommit=unknown، والدخان يفشل.
module.exports = async (req, res) => {
  const sha = String(process.env.VERCEL_GIT_COMMIT_SHA || '').trim();
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const ok = /^[0-9a-f]{7,40}$/i.test(sha);
  res.status(ok ? 200 : 503).send('omran-deploy-probe\ncommit=' + (ok ? sha.toLowerCase() : 'unknown') + '\n');
};
