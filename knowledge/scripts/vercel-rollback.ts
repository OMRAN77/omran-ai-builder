// رجوع فوري إلى النشر السابق. التشغيل: bun /tasklet/agent/home/scripts/vercel-rollback.ts
const env = Object.fromEntries((await Bun.file('/tasklet/agent/home/.secrets/vercel.env').text())
  .split('\n').filter(Boolean).map(l=>l.split('=') as [string,string]));
const H={Authorization:`Bearer ${env.VERCEL_TOKEN}`};
const PREV='dpl_Ab664uLR2YFeshwUjF9em3zCQEcg'; // إنتاج ما قبل حذف اللوحة (٥ أغسطس ٢٠٢٦)
const r = await fetch(`https://api.vercel.com/v9/projects/${env.VERCEL_PROJECT}/rollback/${PREV}?teamId=${env.VERCEL_TEAM}`,{method:'POST',headers:H});
console.log('الرجوع:', r.status, (await r.text()).slice(0,300));
