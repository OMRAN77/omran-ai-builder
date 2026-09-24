// scripts/tts-probe.mjs — v-tts-free: أيّ مفتاح يخدم صوت القراءة على الإنتاج الآن؟
// يطلب جملة قصيرة بصوت القراءة (فاطمة/حمدان) ويطبع الحالة وترويسة X-TTS-Tier:
//   free = مفتاح Azure المجّانيّ (AZURE_SPEECH_KEY_FREE) · paid = المدفوع · fallback = الاحتياط المدفوع الآخر
//   غياب الترويسة مع 200 = النشر أقدم من v-tts-free · 429 = الحدّ المجّانيّ أو حصّة اليوم لهذا العنوان.
// كلّ تشغيل يستهلك طلبًا واحدًا من حصّة اليوم لعنوانك (٦٠).
//
//   node scripts/tts-probe.mjs [BASE_URL] [male]
const BASE = (process.argv[2] || 'https://omran-ai-builder.vercel.app').replace(/\/$/, '');
const gender = process.argv[3] === 'male' ? 'male' : 'female';
const t0 = Date.now();
const r = await fetch(BASE + '/api/tts', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ voice: 'maha', gender, lang: 'ar', text: 'مرحبًا، هذا اختبار لصوت القراءة في التطبيق.' }),
});
const buf = Buffer.from(await r.arrayBuffer());
const mp3 = r.ok && buf.length > 1000 && (buf[0] === 0x49 || buf[0] === 0xff); // ID3 أو إطار MP3
const tier = r.headers.get('x-tts-tier') || '—';
console.log(JSON.stringify({ status: r.status, tier, bytes: buf.length, mp3, ms: Date.now() - t0,
  error: r.ok ? undefined : buf.toString('utf8', 0, 200) }, null, 1));
process.exit(mp3 ? 0 : 1);
