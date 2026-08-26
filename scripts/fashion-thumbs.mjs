// scripts/fashion-thumbs.mjs — توليد صور نماذج الأنماط الستة لبطاقات استوديو
// الأزياء عبر خطّ الإنتاج نفسه (حسابا فحص zzcheck… × ٣ توليدات لكل حساب بسبب
// الحدّ اليومي). المخرجات PNG خام في thumbs-raw/ ليصغّرها fashion-thumbs-resize.
//
//   node scripts/fashion-thumbs.mjs [BASE_URL] [genders=women]  ← مثال: men,kids
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = (process.argv[2] || 'https://omran-ai-builder.vercel.app').replace(/\/$/, '');
const GENDERS = (process.argv[3] || 'women').split(',').map((x) => x.trim()).filter(Boolean);
const t0 = Date.now();
const el = () => String(Date.now() - t0).padStart(6, ' ') + 'ms';

// وصف موحّد يضمن نفس الاستوديو والإضاءة في كل البطاقات.
const LOOK = 'consistent dark charcoal studio backdrop, soft golden rim lighting, editorial fashion catalog look, elegant confident pose';
// نفس قوائم الواجهة (GENDER_STYLES): العباية نسائية فقط.
const STYLES_BY_GENDER = {
  women: ['evening', 'formal', 'casual', 'abaya', 'wedding', 'traditional', 'kaftan', 'jalabiya', 'hijabchic', 'oldmoney', 'streetwear', 'sporty', 'winterlux', 'summer', 'office', 'cocktail', 'ballgown', 'boho', 'vintage', 'y2k', 'minimal', 'glam', 'leather', 'denim', 'pastel', 'monochrome', 'floral', 'velvet', 'silk', 'suitf', 'turkish', 'indian', 'princess', 'safari', 'preppy', 'artgown'],
  men: ['evening', 'formal', 'casual', 'wedding', 'traditional', 'bisht', 'oldmoney', 'streetwear', 'sporty', 'winterlux', 'summer', 'office', 'leather', 'denim', 'minimal', 'monochrome', 'vintage', 'smartcasual', 'threepiece', 'safari', 'preppy', 'athleisure', 'rockstar', 'moroccan'],
  kids: ['evening', 'formal', 'casual', 'wedding', 'traditional', 'sporty', 'winterlux', 'summer', 'school', 'denim', 'pastel', 'floral', 'streetwear', 'minimal', 'vintage', 'preppy', 'eidkids', 'princess'],
};
// مجموعات بطاقات بقية الأقسام — كل بطاقة توليد جديد خاص بها (لا إعادة لصور
// الأنماط): وجوه الفئات بورتريه، والمناسبات إطلالات بسياقها، والإضافات لقطات
// قريبة على القطعة نفسها.
const CARD_SETS = {
  category: [
    { name: 'women', p: { style: 'evening', gender: 'women', description: 'elegant confident woman, upper-body fashion portrait, looking at camera' } },
    { name: 'men', p: { style: 'formal', gender: 'men', description: 'confident stylish man, upper-body fashion portrait, looking at camera' } },
    { name: 'kids', p: { style: 'formal', gender: 'kids', description: 'cheerful well-dressed child, upper-body portrait, looking at camera' } },
  ],
  occasion: [
    { name: 'wedding', p: { style: 'wedding', gender: 'women', occasion: 'wedding', description: 'celebratory wedding look' } },
    { name: 'work', p: { style: 'formal', gender: 'women', occasion: 'work', description: 'smart modern office workwear' } },
    { name: 'casual', p: { style: 'casual', gender: 'women', occasion: 'casual', description: 'relaxed everyday street style' } },
    { name: 'sport', p: { style: 'casual', gender: 'women', occasion: 'sport', description: 'modest sporty athletic activewear, dynamic pose' } },
    { name: 'travel', p: { style: 'casual', gender: 'women', occasion: 'travel', description: 'comfortable stylish travel outfit with an elegant small suitcase' } },
    { name: 'formal', p: { style: 'formal', gender: 'women', occasion: 'formal', description: 'refined formal event look' } },
    { name: 'graduation', p: { style: 'formal', gender: 'women', occasion: 'graduation', description: 'graduation gown and cap, proud pose' } },
    { name: 'religious', p: { style: 'abaya', gender: 'women', occasion: 'religious', description: 'dignified modest look for a religious occasion' } },
  ],
  season: [
    { name: 'summer', p: { style: 'casual', gender: 'women', season: 'summer', description: 'breezy elegant summer outfit' } },
    { name: 'autumn', p: { style: 'casual', gender: 'women', season: 'autumn', description: 'layered stylish autumn outfit, warm tones' } },
    { name: 'winter', p: { style: 'casual', gender: 'women', season: 'winter', description: 'cozy elegant winter coat outfit' } },
    { name: 'spring', p: { style: 'casual', gender: 'women', season: 'spring', description: 'fresh light spring outfit, floral hints' } },
  ],
  extras: [
    { name: 'glasses', p: { style: 'casual', gender: 'women', description: 'close-up on elegant designer sunglasses worn by a model' } },
    { name: 'watch', p: { style: 'formal', gender: 'women', description: 'close-up on an elegant luxury wristwatch on a model wrist' } },
    { name: 'handbag', p: { style: 'evening', gender: 'women', description: 'close-up on an elegant designer handbag held by a model' } },
    { name: 'shoes', p: { style: 'evening', gender: 'women', description: 'close-up on elegant designer heels worn by a model' } },
    { name: 'scarf', p: { style: 'casual', gender: 'women', description: 'close-up on an elegant silk scarf styled on a model' } },
    { name: 'makeup', p: { style: 'evening', gender: 'women', description: 'close-up beauty portrait with elegant evening makeup' } },
  ],
};
const JOBS = GENDERS.flatMap((g) => CARD_SETS[g]
  ? CARD_SETS[g].map((c) => ({ folder: g, name: c.name, payload: c.p }))
  : (STYLES_BY_GENDER[g] || []).map((s) => ({ folder: g, name: s, payload: { style: s, gender: g } })));

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
  const r = await post('/api/fashion-create', {
    mode: 'text', ...j.payload,
    description: ((j.payload.description ? j.payload.description + '. ' : '') + LOOK),
    token, multiAngle: false, engine: '',
  });
  const name = j.folder + '-' + j.name;
  if (r.status === 200 && r.json && r.json.imageBase64) {
    writeFileSync('thumbs-raw/' + name + '.png', Buffer.from(r.json.imageBase64, 'base64'));
    console.log(el(), '✓ ' + name + ' — ' + Math.round(r.json.imageBase64.length * 3 / 4 / 1024) + 'KB · محرك=' + (r.json.engine || 'gemini'));
  } else {
    console.log(el(), '✗ ' + name + ' — HTTP ' + r.status + ' → ' + String(r.text).slice(0, 160));
    failed++;
  }
}
console.log('\n· احذف حسابات الفحص zzcheck… من لوحة الإدارة متى شئت.');
if (failed) { console.log('✗ ' + failed + ' من ' + JOBS.length + ' فشلت'); process.exit(2); }
console.log('✓ ' + JOBS.length + ' صورة جاهزة في thumbs-raw/');
