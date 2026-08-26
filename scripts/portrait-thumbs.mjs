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
// الأدوات أيضًا لها معاينات حقيقية (بمعاملات خاصة): إزالة الخلفية على أبيض،
// الجواز صورة رسمية، المهنة طبيب، الدمج والعائلي بصورة إضافية… إلخ.
const UTILITY_PAYLOADS = {
  removebg: { backdrop: 'studio_white' },
  passport: {},
  beautify: { beautify: { skin: true, light: true, teeth: true } },
  ageshift: { ageTarget: 'older' },
  hairstyle: { hairStyle: 'a modern short textured haircut' },
  adposter: { adText: 'Omran AI' },
  timeshift: { era: '1950s' },
  profession: { profession: 'doctor' },
  outfit: { outfit: 'an elegant navy suit' },
  merge2: { extraImages: ['W1'] },
  familystyle: { extraImages: ['W1', 'K1'] },
  stickerpack: {},
  celebtoon: { charName: 'a friendly cartoon robot' },
  restore: {}, colorize: {}, upscale: {}, objectremove: { removeText: 'background clutter' },
  productshot: {}, newborn: {}, avatargif: {},
};
const UTILITY_STYLES = Object.keys(UTILITY_PAYLOADS);
const STYLES = (process.argv[3] && process.argv[3] !== 'all' && process.argv[3] !== 'utility')
  ? process.argv[3].split(',').map((x) => x.trim()).filter(Boolean)
  : (process.argv[3] === 'utility' ? UTILITY_STYLES : ART_STYLES.concat(UTILITY_STYLES)); // all = الكل

// v-variety: تسعة أشخاص مختلفين (رجال بأزياء متعددة، نساء، أطفال) موزّعون
// على الستايلات — لا وجه واحد مستنسخًا. m=رجل w=امرأة k=طفل.
const SRC_FILES = {
  m1: 'category/men', m2: 'men/casual', m3: 'men/traditional', m4: 'men/evening',
  w1: 'category/women', w2: 'women/casual', w3: 'women/formal',
  k1: 'category/kids', k2: 'kids/casual',
};
const SRCS = Object.fromEntries(Object.entries(SRC_FILES).map(([k, f]) =>
  [k, readFileSync('assets/fashion/looks/' + f + '.webp').toString('base64')]));
const STYLE_SOURCE = {
  anime: 'm2', shonen: 'm2', comic: 'm1', cartoon: 'k2', caricature: 'm2', cinematic: 'm4',
  oil: 'w3', sketch: 'm1', pixel: 'm2', flat: 'w2', fantasy: 'm4', western: 'm1',
  cyberpunk: 'm2', abstract: 'w1', gameposter: 'm4', newspaper: 'm1', horror: 'm4',
  royal: 'w3', calligraphy: 'm3', linkedin: 'm1', national: 'm3', sportshero: 'm2',
  wedding: 'w1', claymation: 'k2', lowpoly: 'm2', graffiti: 'm2', mosaic: 'w1',
  inflatable: 'k1', ukiyoe: 'w2', sandart: 'm3', neonsign: 'm4', doubleexposure: 'm4',
  figurine: 'm1', lego: 'k1', statue: 'm1', polaroid: 'w2', superhero: 'm2', astronaut: 'k1',
  watercolor: 'w2', disney: 'k1', ghibli: 'w2', chibi: 'k2', pop: 'w3', ottoman: 'm3',
  stainedglass: 'w1', papercraft: 'w2', crochet: 'k2', birthday: 'k1', graduation: 'w3',
  eid: 'm3', ramadan: 'm3', hajj: 'm3', gulf: 'm3',
  removebg: 'w2', passport: 'm1', beautify: 'w1', ageshift: 'm2', hairstyle: 'w2',
  adposter: 'm4', timeshift: 'w3', profession: 'w1', outfit: 'm2', merge2: 'm1',
  familystyle: 'm1', stickerpack: 'k2', celebtoon: 'k1', restore: 'm1', colorize: 'w3',
  upscale: 'm1', objectremove: 'm2', productshot: 'm1', newborn: 'k2', avatargif: 'm2',
};
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
  const srcB64 = SRCS[STYLE_SOURCE[v] || 'm1'];
  const extra = {};
  for (const [k, val] of Object.entries(UTILITY_PAYLOADS[v] || {})) {
    extra[k] = Array.isArray(val) ? val.map((x) => SRCS[x.toLowerCase()] || x) : val;
  }
  const r = await post('/api/portrait-style', {
    imageBase64: srcB64, mimeType: 'image/webp', style: v, token, ...extra,
  });
  // avatargif يرجع إطارات — خذ الأول كمعاينة.
  if (r.status === 200 && r.json && !r.json.imageBase64 && Array.isArray(r.json.frames) && r.json.frames[0]) {
    r.json.imageBase64 = r.json.frames[0];
  }
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
