// مجس صور المحادثة: يفحص /api/maha-image على الإنتاج — توليد عادي ومسار الدعاء —
// ويطبع الحالة والخطأ (منقحًا من أي مفاتيح). حساب zzcheck مؤقت.
const BASE = process.env.PROBE_BASE || 'https://omran-ai-builder.vercel.app';
const rnd = Math.random().toString(16).slice(2, 8);

const su = await fetch(BASE + '/api/account?action=auth', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'signup', username: 'zzcheck' + rnd, password: 'Pp1!' + rnd + rnd, lang: 'ar' }),
});
const sj = await su.json().catch(() => ({}));
if (!sj.token) { console.log('signup failed', su.status); process.exit(1); }
console.log('account ready');

function scrub(s) { return String(s).replace(/(key|token|sig|secret)=[^&\s"']+/gi, '$1=***').slice(0, 500); }

async function probe(label, body) {
  const t0 = Date.now();
  try {
    const r = await fetch(BASE + '/api/maha-image', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, token: sj.token }),
    });
    const j = await r.json().catch(() => ({}));
    const ms = Date.now() - t0;
    console.log('== ' + label + ' == status=' + r.status + ' ' + ms + 'ms');
    if (j.imageBase64) console.log('  IMAGE OK ✓ bytes≈' + Math.round(j.imageBase64.length * 0.75) + ' engine=' + (j.engine || 'gemini') + (j.authoredText ? ' | دعاء: ' + String(j.authoredText).slice(0, 60) : ''));
    else console.log('  NO IMAGE ✗ error=' + scrub(j.error || '') + ' retryable=' + j.retryable);
  } catch (e) { console.log('== ' + label + ' == FETCH FAIL ' + scrub(e.message)); }
}

await probe('PLAIN (بلا نص)', { prompt: 'A serene desert landscape at dawn, soft golden light over sand dunes, wide calm sky, photorealistic, no text' });
await probe('PRAYER (دعاء الجمعة)', { prompt: 'beautiful background', prayerRequest: 'دعاء يوم الجمعة', reserveTextArea: true, textPosition: 'bottom' });

// v-eye-probe: المرشد البصري («عين عمران») — صورة اختبار صغيرة، المهم 200 + نص + اسم المحرك.
{
  const px = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const t0 = Date.now();
  try {
    const r = await fetch(BASE + '/api/ai?action=visual-guide', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: px, token: sj.token, lang: 'ar', mode: 'describe', question: 'صف لي ما أمامي الآن.' }),
    });
    const j = await r.json().catch(() => ({}));
    console.log('== VISUAL-GUIDE == status=' + r.status + ' ' + (Date.now() - t0) + 'ms');
    if (j.text) console.log('  GUIDE OK ✓ engine=' + (j.engine || '؟') + ' | ' + String(j.text).slice(0, 80));
    else console.log('  GUIDE FAIL ✗ error=' + scrub(j.error || ''));
  } catch (e) { console.log('== VISUAL-GUIDE == FETCH FAIL ' + scrub(e.message)); }
}
