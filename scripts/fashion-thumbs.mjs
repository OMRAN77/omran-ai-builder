// scripts/fashion-thumbs.mjs — توليد صور نماذج الأنماط الستة لبطاقات استوديو
// الأزياء عبر خطّ الإنتاج نفسه (حسابا فحص zzcheck… × ٣ توليدات لكل حساب بسبب
// الحدّ اليومي). المخرجات PNG خام في thumbs-raw/ ليصغّرها fashion-thumbs-resize.
//
//   node scripts/fashion-thumbs.mjs [BASE_URL]
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = (process.argv[2] || 'https://omran-ai-builder.vercel.app').replace(/\/$/, '');
const t0 = Date.now();
const el = () => String(Date.now() - t0).padStart(6, ' ') + 'ms';

// وصف موحّد يضمن نفس الاستوديو والإضاءة في كل البطاقات.
const LOOK = 'consistent dark charcoal studio backdrop, soft golden rim lighting, editorial fashion catalog look, elegant confident pose';
const STYLES = ['evening', 'formal', 'casual', 'abaya', 'wedding', 'traditional'];

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

const signup = async () => {
  const user = 'zzcheck' + randomBytes(4).toString('hex');
  const pw = randomBytes(16).toString('base64url'); // لا يُطبع أبدًا
  const su = await post('/api/account?action=auth', { action: 'signup', username: user, password: pw, lang: 'ar' });
  const token = su.json && su.json.token;
  if (!token) { console.log('✗ التسجيل فشل: HTTP ' + su.status); process.exit(1); }
  console.log(el(), '✓ حساب فحص ' + user);
  return token;
};

mkdirSync('thumbs-raw', { recursive: true });
let failed = 0;
let token = await signup();
for (let i = 0; i < STYLES.length; i++) {
  if (i === 3) token = await signup(); // الحدّ اليومي ٣ لكل حساب
  const s = STYLES[i];
  const r = await post('/api/fashion-create', {
    mode: 'text', style: s, gender: 'women',
    description: LOOK, token, multiAngle: false, engine: '',
  });
  if (r.status === 200 && r.json && r.json.imageBase64) {
    writeFileSync('thumbs-raw/' + s + '.png', Buffer.from(r.json.imageBase64, 'base64'));
    console.log(el(), '✓ ' + s + ' — ' + Math.round(r.json.imageBase64.length * 3 / 4 / 1024) + 'KB · محرك=' + (r.json.engine || 'gemini'));
  } else {
    console.log(el(), '✗ ' + s + ' — HTTP ' + r.status + ' → ' + String(r.text).slice(0, 160));
    failed++;
  }
}
console.log('\n· احذف حسابَي الفحص zzcheck… من لوحة الإدارة متى شئت.');
if (failed) { console.log('✗ ' + failed + ' من ' + STYLES.length + ' فشلت'); process.exit(2); }
console.log('✓ الصور الست جاهزة في thumbs-raw/');
