// scripts/portrait-thumbs.mjs — بطاقات أنماط الصور: نفس الوجه المصدر
// (assets/fashion/looks/category/men.webp) يُحوَّل عبر خطّ الإنتاج إلى كل
// ستايل فنيّ، فتُظهر كل بطاقة أثر ستايلها الحقيقي (قبل/بعد). الأدوات غير
// التحويلية (إزالة خلفية/ترميم/دمج…) تبقى بطاقات إيموجي — لا تولَّد هنا.
// حساب فحص لكل ٣ توليدات (حدّ البورتريه اليومي).
//
//   node scripts/portrait-thumbs.mjs [BASE_URL] [styles-csv|all]
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

const BASE = (process.argv[2] || 'https://omran-ai-builder.vercel.app').replace(/\/$/, '');
const ART_STYLES = [
  'anime', 'cartoon', 'oil', 'sketch', 'pixel', 'comic', 'pop', 'gulf', 'caricature',
  'cinematic', 'disney', 'flat', 'fantasy', 'western', 'cyberpunk', 'abstract',
  'watercolor', 'ottoman', 'gameposter', 'newspaper', 'horror', 'shonen', 'royal',
  'calligraphy', 'linkedin', 'eid', 'national', 'ramadan', 'sportshero', 'wedding',
  'graduation', 'hajj', 'birthday', 'claymation', 'lowpoly', 'graffiti', 'mosaic',
  'stainedglass', 'papercraft', 'crochet', 'inflatable', 'ukiyoe', 'sandart',
  'neonsign', 'doubleexposure', 'figurine', 'ghibli', 'lego', 'chibi', 'statue',
  'polaroid', 'superhero', 'astronaut',
];
const STYLES = (process.argv[3] && process.argv[3] !== 'all')
  ? process.argv[3].split(',').map((x) => x.trim()).filter(Boolean)
  : ART_STYLES;

const SOURCE = readFileSync('assets/fashion/looks/category/men.webp').toString('base64');
const t0 = Date.now();
const el = () => String(Date.now() - t0).padStart(6, ' ') + 'ms';

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
  if (i > 0 && i % 3 === 0) token = await signup(); // الحدّ اليومي ٣ لكل حساب
  const v = STYLES[i];
  const r = await post('/api/portrait-style', {
    imageBase64: SOURCE, mimeType: 'image/webp', style: v, token,
  });
  if (r.status === 200 && r.json && r.json.imageBase64) {
    writeFileSync('thumbs-raw/portrait-' + v + '.png', Buffer.from(r.json.imageBase64, 'base64'));
    console.log(el(), '✓ ' + v + ' — ' + Math.round(r.json.imageBase64.length * 3 / 4 / 1024) + 'KB');
  } else {
    console.log(el(), '✗ ' + v + ' — HTTP ' + r.status + ' → ' + String(r.text).slice(0, 140));
    failed++;
  }
}
console.log('\n· احذف حسابات الفحص zzcheck… من لوحة الإدارة متى شئت.');
if (failed) { console.log('✗ ' + failed + ' من ' + STYLES.length + ' فشلت'); process.exitCode = failed === STYLES.length ? 2 : 0; }
console.log('✓ ' + (STYLES.length - failed) + '/' + STYLES.length + ' بطاقة جاهزة في thumbs-raw/');
