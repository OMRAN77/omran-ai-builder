// مجس محرّك الصور: يستدعي /api/media?action=maha-image على الإنتاج (ضيف: 3 مجانية)
// ويطبع الحقول الصغيرة فقط — engine و caption — لكشف:
//   • هل gemini-3-pro-image متاح للمفتاح؟ (engine=nano-pro) أم يسقط لنانو 2.5
//     الاحتياطي (engine=gemini-nano-banana/openai) = سبب «البناء ضعيف».
//   • هل imageCaption يرجع نصًّا فعلًا بعد إصلاح thinkingBudget؟ (caption غير فارغ)
const BASE = process.env.PROBE_BASE || 'https://omran-ai-builder.vercel.app';
const gid = () => 'probe' + Math.random().toString(36).slice(2, 12);

async function gen(label, prompt) {
  const t0 = Date.now();
  try {
    const r = await fetch(BASE + '/api/media?action=maha-image', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, guestId: gid() }),
    });
    const j = await r.json().catch(() => ({}));
    const ms = Date.now() - t0;
    const cap = typeof j.caption === 'string' ? j.caption : null;
    console.log((r.ok && j.imageBase64 ? '✅' : '❌') + ' ' + label + ': status=' + r.status + ' ' + ms + 'ms'
      + ' | engine=' + (j.engine || '—')
      + ' | caption=' + (cap === null ? 'MISSING ❌' : (cap.trim() ? ('"' + cap.replace(/\s+/g, ' ').slice(0, 70) + '"') : 'EMPTY ❌'))
      + (j.error ? ' | error=' + String(j.error).slice(0, 60) : '')
      + ' | keys=' + Object.keys(j).filter((k) => k !== 'imageBase64').join(','));
    return j;
  } catch (e) { console.log('❌ ' + label + ': FAIL ' + String(e.message).slice(0, 80)); return {}; }
}

console.log('BASE=' + BASE + ' @ ' + new Date().toISOString());
// عيّنات متتابعة: نميّز بين إرهاق حصّة دائم (كل المحاولات busy) وارتفاع حِمل لحظي.
const prompts = [
  'منظر جبلي واقعي عالي الجودة مع بحيرة',
  'قط صغير أبيض يجلس على سجادة حمراء، إضاءة ناعمة، واقعي',
  'كوب قهوة على طاولة خشبية بجانب نافذة، ضوء الصباح، واقعي',
];
for (let i = 0; i < prompts.length; i++) {
  await gen('عيّنة ' + (i + 1), prompts[i]);
}
console.log('PROBE DONE');
