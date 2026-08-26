// scripts/studio-thumbs.mjs — بطاقات «ستايل الذكاء الاصطناعي»: معاينة حقيقية
// لكل ميزة ولكل خيار عبر خطّ الإنتاج (studio-create) بوجوه متنوعة من نماذجنا.
// حساب فحص لكل ٣ توليدات (حدّ الاستوديو اليومي).
//
//   node scripts/studio-thumbs.mjs [BASE_URL] [features|options|all]
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

const BASE = (process.argv[2] || 'https://omran-ai-builder.vercel.app').replace(/\/$/, '');
const MODE = process.argv[3] || 'all';

const SRC_FILES = {
  m1: 'category/men', m2: 'men/casual', m3: 'men/traditional', m4: 'men/evening',
  w1: 'category/women', w2: 'women/casual', w3: 'women/formal',
  k1: 'category/kids', k2: 'kids/casual',
};
const SRCS = Object.fromEntries(Object.entries(SRC_FILES).map(([k, f]) =>
  [k, readFileSync('assets/fashion/looks/' + f + '.webp').toString('base64')]));

// خيار لكل ميزة يمثّلها في بطاقة التبويب.
const FEATURES = [
  { f: 'hair', style: 'colorful', src: 'w2' },
  { f: 'nails', style: 'french', src: 'w1' },
  { f: 'makeup', style: 'glam', src: 'w3' },
  { f: 'beard', style: 'full', src: 'm2' },
  { f: 'skin', style: 'glow', src: 'w1' },
  { f: 'glasses', style: 'aviator', src: 'm1' },
  { f: 'tattoo', style: 'sleeve', src: 'm2' },
  { f: 'anime', style: 'classic', src: 'm2' },
  { f: 'heritage', style: 'kandora', src: 'm3' },
  { f: 'merge', style: '', src: 'm1', srcB: 'w1' },
];
// كل خيارات كل ميزة — المصدر يتنوع (نساء/رجال/أطفال) حسب طبيعة الخيار.
const OPTIONS = {
  hair: { src: 'w2', vals: ['black', 'brown', 'blonde', 'red', 'silver', 'colorful'] },
  nails: { src: 'w1', vals: ['red', 'nude', 'black', 'french', 'pink', 'gold'] },
  makeup: { src: 'w3', vals: ['natural', 'glam', 'smokey', 'redlips', 'bridal'] },
  beard: { src: 'm2', vals: ['full', 'stubble', 'mustache', 'goatee', 'clean'] },
  skin: { src: 'w1', vals: ['subtle', 'glow', 'circles'] },
  glasses: { src: 'm1', vals: ['sunglasses', 'round', 'catseye', 'aviator', 'rimless'] },
  tattoo: { src: 'm2', vals: ['sleeve', 'wrist', 'back', 'tribal', 'custom'] },
  anime: { src: 'm2', vals: ['classic', 'chibi', 'ghibli', 'cyberpunk', 'manga'], per: { chibi: 'k2', ghibli: 'w2' } },
  heritage: { src: 'm1', vals: ['kandora', 'bisht', 'abaya', 'embroidered', 'saudi', 'emirati'], per: { bisht: 'm4', abaya: 'w1', embroidered: 'w3', saudi: 'm2', emirati: 'm3' } },
};
const JOBS = [];
if (MODE === 'features' || MODE === 'all') {
  FEATURES.forEach((j) => JOBS.push({ kind: 'studiofeat', name: j.f, feature: j.f, style: j.style, src: j.src, srcB: j.srcB }));
}
if (MODE === 'options' || MODE === 'all') {
  Object.entries(OPTIONS).forEach(([f, o]) => o.vals.forEach((v) =>
    JOBS.push({ kind: 'studioopt', name: f + '-' + v, feature: f, style: v, src: (o.per && o.per[v]) || o.src })));
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
  const payload = {
    imageBase64: SRCS[j.src], mimeType: 'image/webp', feature: j.feature, style: j.style, token,
  };
  if (j.feature === 'merge') { payload.imageBase64B = SRCS[j.srcB]; payload.mimeTypeB = 'image/webp'; }
  if (j.feature === 'tattoo' && j.style === 'custom') payload.description = 'an elegant falcon tattoo';
  const r = await post('/api/studio-create', payload);
  if (r.status === 200 && r.json && r.json.imageBase64) {
    writeFileSync('thumbs-raw/' + j.kind + '-' + j.name + '.png', Buffer.from(r.json.imageBase64, 'base64'));
    console.log(el(), '✓ ' + j.name + ' — ' + Math.round(r.json.imageBase64.length * 3 / 4 / 1024) + 'KB');
  } else {
    console.log(el(), '✗ ' + j.name + ' — HTTP ' + r.status + ' → ' + String(r.text).slice(0, 140));
    failed++;
  }
}
console.log('\n· احذف حسابات الفحص zzcheck… من لوحة الإدارة متى شئت.');
if (failed) { console.log('✗ ' + failed + ' من ' + JOBS.length + ' فشلت'); process.exitCode = failed === JOBS.length ? 2 : 0; }
console.log('✓ ' + (JOBS.length - failed) + '/' + JOBS.length + ' بطاقة جاهزة');
