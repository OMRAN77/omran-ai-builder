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

// يتحقّق أن محرّك Pollinations المجاني (بلا مفتاح) يرجّع صورة فعلية — إثبات أن
// خط الإنقاذ المجاني الجديد سيعمل حتى مع خلوّ الرصيد المدفوع.
async function freeCheck(label, prompt) {
  const t0 = Date.now();
  try {
    const url = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt)
      + '?width=768&height=1024&nologo=true&model=flux&seed=' + Math.floor(Math.random() * 1e9);
    const r = await fetch(url, { signal: AbortSignal.timeout(45000) });
    const ms = Date.now() - t0;
    const ct = String(r.headers.get('content-type') || '');
    let bytes = 0;
    if (r.ok && /^image\//.test(ct)) { bytes = (await r.arrayBuffer()).byteLength; }
    console.log((bytes > 1500 ? '✅' : '❌') + ' ' + label + ': status=' + r.status + ' ' + ms + 'ms'
      + ' | content-type=' + (ct || '—') + ' | bytes=' + bytes);
  } catch (e) { console.log('❌ ' + label + ': FAIL ' + String(e.message).slice(0, 80)); }
}

console.log('BASE=' + BASE + ' @ ' + new Date().toISOString());
// المحرّكات المدفوعة على الإنتاج (قد تكون 502 عند خلوّ الرصيد).
await gen('مدفوع', 'منظر جبلي واقعي عالي الجودة مع بحيرة');
// المحرّك المجاني مباشرةً — إثبات أنه ينتج صورة بلا مفتاح ولا رصيد.
await freeCheck('مجاني', 'a realistic high quality mountain landscape with a lake, soft light');
console.log('PROBE DONE');
