// scripts/design-thumbs.mjs — بطاقات الديكور: معاينة حقيقية لكل نمط (غرفة
// معيشة بذلك النمط) ولكل نوع مكان، عبر خطّ الإنتاج (design-create النصّي).
// حساب فحص لكل ٣ توليدات (حدّ الديكور اليومي).
//
//   node scripts/design-thumbs.mjs [BASE_URL] [styles|places|all]
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = (process.argv[2] || 'https://omran-ai-builder.vercel.app').replace(/\/$/, '');
const MODE = process.argv[3] || 'all';

// v-decor-45: نفس كتالوج السلكت في partials-core (٤٨ نمطًا).
const STYLES = ['modern', 'simple', 'bohemian', 'luxury', 'arabic', 'classic', 'najdi', 'islamic', 'andalusi', 'emirati', 'scandinavian', 'japandi', 'industrial', 'midcentury', 'artdeco', 'neoclassic', 'victorian', 'baroque', 'gothic', 'rustic', 'farmhouse', 'coastal', 'mediterranean', 'moroccan', 'turkish', 'persian', 'indian', 'japanese', 'zen', 'wabisabi', 'tropical', 'desert', 'loft', 'futuristic', 'cyberpunk', 'gamer', 'darkacademia', 'chalet', 'provence', 'hollywood', 'monochrome', 'earthy', 'pastel', 'smart', 'eco', 'retro70s', 'popart', 'minimalwhite'];
const PLACES = ['restaurant', 'cafe', 'bedroom', 'majlis', 'living', 'kitchen', 'office', 'shop', 'bath', 'kids', 'entrance', 'garden'];

const JOBS = [];
if (MODE === 'styles' || MODE === 'all') {
  STYLES.forEach((v) => JOBS.push({ kind: 'dstyle', name: v, place: 'living', style: v }));
}
if (MODE === 'places' || MODE === 'all') {
  PLACES.forEach((v) => JOBS.push({ kind: 'dplace', name: v, place: v, style: 'modern' }));
}

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
for (let i = 0; i < JOBS.length; i++) {
  if (i > 0 && i % 3 === 0) token = await signup(); // الحدّ اليومي ٣ لكل حساب
  const j = JOBS[i];
  const r = await post('/api/design-create', { place: j.place, style: j.style, count: 1, token });
  const im = r.json && (r.json.imageBase64 || (Array.isArray(r.json.images) && r.json.images[0] && r.json.images[0].imageBase64));
  if (r.status === 200 && im) {
    writeFileSync('thumbs-raw/' + j.kind + '-' + j.name + '.png', Buffer.from(im, 'base64'));
    console.log(el(), '✓ ' + j.kind + '/' + j.name + ' — ' + Math.round(im.length * 3 / 4 / 1024) + 'KB');
  } else {
    console.log(el(), '✗ ' + j.kind + '/' + j.name + ' — HTTP ' + r.status + ' → ' + String(r.text).slice(0, 140));
    failed++;
  }
}
console.log('\n· احذف حسابات الفحص zzcheck… من لوحة الإدارة متى شئت.');
if (failed) { console.log('✗ ' + failed + ' من ' + JOBS.length + ' فشلت'); process.exitCode = failed === JOBS.length ? 2 : 0; }
console.log('✓ ' + (JOBS.length - failed) + '/' + JOBS.length + ' بطاقة جاهزة');
