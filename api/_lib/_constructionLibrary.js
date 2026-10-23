// Shared helper: growing library of saved construction designs (2D plans).
// Each generated design is saved as one JSON record in Upstash Redis so
// future users can browse similar designs (by floors + area range) before
// paying for a brand-new AI generation. Follows the same per-item KV pattern
// used across this app (auth.js, feedback.js).
const crypto = require('crypto');
const { kvGetJSON, kvPutJSON, kvList } = require('./kv.js');

function itemPath(id) { return 'db/construction-library/' + id + '.json'; }

// v-cx-lib (تدقيق ١٨–١٩ أكتوبر: «المكتبة تعرض مخطّطات بالإسبانيّ والإندونيسيّ والإنجليزيّ لمستخدم عربيّ»):
// construction-create يكتب أسماء الغرف بالعربيّة لـar/ur، وبلغة التطبيق إن كانت في LANG_NAMES، وبالإنجليزيّة لما عداها.
// كلّ تصميم يُحفظ بلغة تسمياته، والقائمة لا تعرض إلّا لغة الطالب. السجلّات القديمة بلا لغة (صورة ومفاتيح فقط، لا نصّ
// يُستدلّ منه) لا تُعرف لغتها فلا تُعرض في قائمة لغة — ولا يُحذف منها شيء. طلب بلا لغة (عميل قديم) يرى الكلّ كما كان.
const PLAN_LANGS = ['ar', 'en', 'fr', 'hi', 'bn', 'ne', 'id', 'fil', 'tr', 'zh', 'ru', 'es', 'ml'];
function planLang(l) {
  const s = String(l || '').toLowerCase();
  if (!s) return '';
  if (s === 'ur') return 'ar';
  return PLAN_LANGS.includes(s) ? s : 'en';
}

async function saveDesign(entry) {
  const id = Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex');
  const record = Object.assign({ id, createdAt: Date.now() }, entry);
  if (record.lang !== undefined) record.lang = planLang(record.lang) || 'ar';
  try {
    await kvPutJSON(itemPath(id), record);
  } catch (e) {
    return null;
  }
  return id;
}

async function listDesigns({ buildingType, floors, area, limit, lang }) {
  let keys;
  try {
    keys = await kvList('db/construction-library/');
  } catch (e) {
    return [];
  }
  const out = await Promise.all(keys.map((k) => kvGetJSON(k).catch(() => null)));
  let filtered = out.filter(Boolean);
  const wantLang = planLang(lang);
  if (wantLang) filtered = filtered.filter((d) => d.lang === wantLang); // v-cx-lib
  if (buildingType) filtered = filtered.filter((d) => d.buildingType === buildingType);
  if (floors) {
    filtered = filtered.filter((d) => Math.abs(Number(d.floors) - Number(floors)) <= 0.5);
  }
  if (area) {
    const a = Number(area);
    filtered = filtered.filter((d) => d.area && Math.abs(Number(d.area) - a) / a <= 0.35);
  }
  filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return filtered.slice(0, limit || 12);
}

module.exports = { saveDesign, listDesigns, planLang, PLAN_LANGS };
