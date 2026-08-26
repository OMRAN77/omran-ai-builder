// scripts/fashion-probe.mjs — قياس أداة الأزياء على الإنتاج من الطرف للطرف:
// حساب فحص مؤقّت (zzcheck…) ← توليد نصّي فعليّ عبر fashion-create ← النتيجة
// والأزمنة. الوضع النصّي لا يحتاج صورة مصدر ويختبر خطّ Gemini + الأقفال كاملًا.
// يترك حساب فحص واحدًا يُحذف من لوحة الإدارة.
//
//   node scripts/fashion-probe.mjs [BASE_URL] [engine]
import { randomBytes } from 'node:crypto';

const BASE = (process.argv[2] || 'https://omran-ai-builder.vercel.app').replace(/\/$/, '');
const ENGINE = process.argv[3] || '';
const t0 = Date.now();
const el = () => String(Date.now() - t0).padStart(6, ' ') + 'ms';

const user = 'zzcheck' + randomBytes(4).toString('hex');
const pw = randomBytes(16).toString('base64url'); // لا يُطبع أبدًا

const post = async (path, payload) => {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  let j = null; const t = await r.text();
  try { j = JSON.parse(t); } catch (e) { /* خام */ }
  return { status: r.status, json: j, text: t };
};

console.log('① حساب فحص (' + user + ')');
const su = await post('/api/account?action=auth', { action: 'signup', username: user, password: pw, lang: 'ar' });
const token = su.json && su.json.token;
if (!token) { console.log('✗ التسجيل فشل: HTTP ' + su.status + ' ' + String(su.text).slice(0, 150)); process.exit(1); }
console.log(el(), '✓ توكن جاهز');

console.log('② توليد أزياء نصّي (engine=' + (ENGINE || 'gemini') + ')');
const fc = await post('/api/fashion-create', {
  mode: 'text', style: 'abaya', gender: 'women', occasion: 'formal',
  description: 'عباية سوداء أنيقة بتطريز ذهبي بسيط على الأكمام',
  token, multiAngle: false, engine: ENGINE,
});
if (fc.status === 200 && fc.json && fc.json.imageBase64) {
  console.log(el(), '✅ صورة رجعت — ' + Math.round(fc.json.imageBase64.length * 3 / 4 / 1024) + 'KB · mime=' + (fc.json.mimeType || '?') + ' · متبقٍ اليوم=' + fc.json.remaining);
} else {
  console.log(el(), '✗ فشل: HTTP ' + fc.status + ' → ' + String(fc.text).slice(0, 200));
  process.exitCode = 2;
}

console.log('③ توليد مقارنة (fairness) بنمطين');
const styles = ['evening', 'traditional'];
for (const s of styles) {
  const r = await post('/api/fashion-create', {
    mode: 'text', style: s, gender: 'women',
    description: 'إطلالة كاملة لنفس العارضة',
    token, multiAngle: false, fairness: true, engine: ENGINE,
  });
  if (r.status === 200 && r.json && r.json.imageBase64) console.log(el(), '  ✓ ' + s + ' — صورة ' + Math.round(r.json.imageBase64.length * 3 / 4 / 1024) + 'KB');
  else { console.log(el(), '  ✗ ' + s + ' — HTTP ' + r.status + ' → ' + String(r.text).slice(0, 160)); process.exitCode = 2; }
}

console.log('\n· احذف حساب الفحص ' + user + ' من لوحة الإدارة متى شئت.');
console.log(process.exitCode === 2 ? '✗ أداة الأزياء تنكسر — والسطور أعلاه تسمّي أين' : '✓ أداة الأزياء تعمل على الإنتاج كاملةً');
