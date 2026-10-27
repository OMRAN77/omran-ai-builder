// api/_lib/account-delete.js — v-acct-delete (تدقيق ١٨ أكتوبر «ما في حذف حساب داخل التطبيق، لازم المستخدم يراسل بالإيميل»،
// وأمر المالك ٢٠ أكتوبر، الدفعة ٢: «حذف الحساب داخل التطبيق: استثناء من التجميد بموافقتي، لأنّ Apple وGoogle يطلبونه»).
//
// صاحب الحساب يحذفه بنفسه من «حسابي»: يكتب اسمه تأكيدًا، وكلمة مروره إن كان حسابه بكلمة مرور (حساب Google بلا كلمة مرور).
// الترتيب:
//   ١) إيقاف التجديد التلقائيّ في Stripe بالمسار نفسه الذي يوقفه به زرّه (autoRenewToggle on:false — نهاية الشهر المدفوع، بلا
//      خصم جديد). تعذّر الوصول لـStripe = لا حذف (لا نترك بطاقة تُخصم لحساب لا يملكه أحد).
//   ٢) محو بياناته: المحادثات وسجلّ حذفها، الذاكرة والذاكرة الحيّة، التذكيرات واشتراك الإشعارات، المحفظة التعليميّة، سجلّ الوكيل،
//      رصيد النقاط ورصيد اشتراكات الوسائط وفيديوهات الباقة، حجوزات صور مها، مسوّدات البريد، مشاركاته العامّة والخاصّة (بمالكها)،
//      وفهارس بريده وهاتفه وربط Google إن كانت تشير إليه وحده.
//   ٣) سجلّ الحساب يصير شاهدًا {deleted:true} بلا أيّ بيانات (لا بريد ولا كلمة مرور ولا ملفّ) — والاسم يبقى محجوزًا
//      (v-name-reuse) فلا يسجّله أحد ويرث شيئًا منه.
// يبقى ما يلزم قانونًا ولا يُعرض لأحد: سجلّات الدفع عند مزوّد الدفع وعندنا (payrec وما يشبهها)، وعدّادات الاستخدام والتكلفة
// الإجماليّة. المالك لا يحذف حسابه من هنا. محاولات كلمة المرور الخاطئة لها حدّ (٥ في ١٥ دقيقة).
// v-lock-acct (باب بيانات المستخدمين، موافقة المالك ٢٧ أكتوبر): المشاركات تُطابَق بمالكها (owner) لا بالاسم المعروض، والحساب الذي
// لم يضع صاحبه كلمة مرور (Google، رمز البريد) يحذف نفسه بالاسم وحده — التفاصيل عند كلّ دالّة.
const crypto = require('crypto');

const FAIL_MAX = 5;
const FAIL_TTL = 15 * 60;

function n(u) { return encodeURIComponent(String(u || '').trim().toLowerCase()); }
function verifyPassword(password, salt, hash) {
  try {
    const a = crypto.scryptSync(String(password), String(salt), 64);
    const b = Buffer.from(String(hash || ''), 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (e) { return false; }
}

/** مفاتيح الحساب المفردة (كلّ مكتبة تبني مفتاحها من الاسم مطبَّعًا: صغيرًا مقصوصًا ومرمَّزًا). */
function singleKeys(key) {
  const k = n(key);
  return [
    'chats:' + k, 'chats_deleted:' + k,
    'db/memory/' + k + '.json', 'db/living/' + k + '.json',
    'db/reminders/' + k + '.json', 'db/push-subs/' + k + '.json',
    'db/stocks/pf/' + k + '.json', 'db/agentrun/' + k + '.json',
    'imghold:' + k, 'points:' + k,
    'media:image:' + k, 'media:video:' + k, 'media:maha:' + k, 'media:mix:' + k,
  ];
}
/** بادئات مفاتيح متعدّدة باسمه (فيديوهات الباقة لكلّ فترة، مسوّدات البريد لكلّ رسالة). */
function prefixKeys(key) {
  return ['planvid:' + n(key) + ':', 'emaildraft:' + String(key).trim().toLowerCase() + ':'];
}

/* v-lock-acct (srv-auth-3): الكولباك ورمز البريد ينشئان salt/hash عشوائيّين لا يعرفهما صاحب الحساب، فكان الحذف يطلب كلمة مرور لا
   وجود لها (wrong_password دائمًا). كلمة المرور تُطلب ممّن وضعها بنفسه: حساب التسجيل، أو حساب Google/رمز البريد بعد استرجاع أو تغيير
   (passwordSet من resetWithToken وchangePassword في auth.js؛ وما قبل العلامة: sv > 0 لا يرفعه إلّا هذان). */
function needsPassword(user) {
  if (!(user.hash && user.salt)) return false;
  const passwordless = (user.googleAuth === true || user.otpOnly === true) && user.passwordSet !== true && !(Number(user.sv) > 0);
  return !passwordless;
}

/* v-lock-acct (srv-auth-1 · pages-static-3): المشاركات كانت تُطابَق بالاسم المعروض في فهرس «استكشف» — فحذف حساب اسمه «Mohammed Ali»
   أو «زائر» يمحو مشاركات غيره بالاسم نفسه، ومشاركات حساب Google (اسمه المعروض غير مفتاحه) أو ما نُشر قبل تغيير الاسم أو الخاصّة
   (بلا مدخل فهرس) تبقى بعد «تم حذف حسابك». الآن تُقرأ سجلّات db/shares نفسها وتُطابَق بحقل owner (مفتاح الحساب من الرمز —
   v-share-owner)، والسجلّ القديم بلا owner باسمه حرفيًّا كما يفعل حذف المشاركة الواحدة في share.js، ما عدا الاسم الافتراضيّ. */
const SHARE_DEFAULT_NAME = 'زائر'; // DEFAULT_NAME في share.js: ضيف بلا حساب أو اسم لا يُعرض — ليس هويّة أحد
async function leadsTo(auth, fromKey, key) {
  try {
    let rec = await auth.getUser(fromKey, 1);
    for (let i = 0; i < 32; i++) {
      if (!rec || !rec.deleted || !rec.movedTo) return false;
      const next = String(rec.movedTo).trim().toLowerCase();
      if (next === key) return true;
      rec = await auth.getUser(next, 1);
    }
  } catch (e) { console.error('[account-delete] chain read failed'); }
  return false;
}
/** مفاتيح هذا الحساب: مفتاحه، وأسماؤه السابقة ومفتاح Google الأوّل إن قادت شواهدها إليه (الاسم المتروك لا يُعطى لغيره — v-name-reuse). */
async function ownerKeys(key, user, auth) {
  const keys = new Set([key]);
  const cand = (Array.isArray(user.prevUsernames) ? user.prevUsernames : []).slice(0, 20);
  if (user.googleAuth === true && user.email) cand.push('g_' + String(user.email).trim().toLowerCase());
  for (const c of cand) {
    const k = String(c || '').trim().toLowerCase();
    if (k && !keys.has(k) && await leadsTo(auth, k, key)) keys.add(k);
  }
  return keys;
}
function ownsShare(rec, keys) {
  if (!rec || typeof rec !== 'object') return false;
  if (rec.owner) return keys.has(String(rec.owner).trim().toLowerCase());
  const u = String(rec.username || '');
  return u !== SHARE_DEFAULT_NAME && keys.has(u);
}
/** مشاركاته ومداخل فهرسها — قراءة وحدها قبل أيّ أثر؛ تعذّر السرد يرمي فلا يُحذف شيء. */
async function ownedShares(kv, keys) {
  const shareKeys = await kv.kvList('db/shares/');
  const exploreKeys = await kv.kvList('db/explore/');
  const owned = [];
  for (let i = 0; i < shareKeys.length; i += 16) {
    const chunk = shareKeys.slice(i, i + 16);
    const recs = await Promise.all(chunk.map((k) => Promise.resolve().then(() => kv.kvGetJSON(k)).catch(() => null)));
    recs.forEach((rec, j) => { if (ownsShare(rec, keys)) owned.push(chunk[j]); });
  }
  const idOf = (k) => { const raw = k.slice('db/shares/'.length).replace(/\.json$/, ''); try { return decodeURIComponent(raw); } catch (e) { return raw; } }; // مفتاح بترميز تالف: المعرّف كما هو
  const ids = new Set(owned.map(idOf));
  const explore = exploreKeys.filter((k) => { const m = /_([^/]+)\.json$/.exec(k); return !!(m && ids.has(m[1])); });
  return owned.concat(explore);
}

async function stopAutoRenew(token, o) {
  const toggle = (o && o.autoRenewToggle) || require('./create-checkout-session.js').autoRenewToggle;
  return new Promise((resolve) => {
    const res = { code: 200, status(c) { this.code = c; return this; }, json(j) { resolve({ code: this.code, body: j }); return this; } };
    Promise.resolve(toggle({ body: { token, on: false } }, res, o && o.fetch)).catch((e) => resolve({ code: 500, body: { error: String(e && e.message || e) } }));
  });
}

/**
 * يحذف حساب صاحب الرمز. يرجع {status, body} — body.code للواجهة: name_mismatch · wrong_password · too_many · owner · billing · gone · retry.
 * o: { kv, auth, now, autoRenewToggle, fetch } للاختبار.
 */
async function deleteAccount(input, o) {
  const opt = o || {};
  const kv = opt.kv || require('./kv.js');
  const auth = opt.auth || require('./auth.js');
  const { username, token, confirmUsername, password } = input || {};
  const key = String(username || '').trim().toLowerCase();
  if (!key) return { status: 401, body: { ok: false, code: 'auth' } };
  if (require('./_owner.js').isOwnerName(key)) return { status: 403, body: { ok: false, code: 'owner' } };
  const user = await auth.getUser(key);
  if (!user || user.deleted) return { status: 404, body: { ok: false, code: 'gone' } };
  // v-lock-acct (srv-auth-3): الواجهة تقارن بالاسم المعروض (aiapp_username) — لحساب Google «Gina Smith» ومفتاحه g_<البريد>؛ كلاهما يُقبل
  const typed = String(confirmUsername || '').trim().toLowerCase();
  if (!typed || (typed !== key && typed !== String(user.username || '').trim().toLowerCase())) return { status: 400, body: { ok: false, code: 'name_mismatch' } };

  if (needsPassword(user)) {
    const failKey = 'db/acct-del-fail/' + n(key);
    let fails = 0;
    try { fails = Number(await kv.kvGetRaw(failKey)) || 0; } catch (e) { fails = 0; }
    if (fails >= FAIL_MAX) return { status: 429, body: { ok: false, code: 'too_many' } };
    if (!password || !verifyPassword(password, user.salt, user.hash)) {
      try { const c = Number(await kv.kvIncr(failKey)); if (c === 1) await kv.kvExpire(failKey, FAIL_TTL); } catch (e) { /* guard-ok — العدّاد أفضل جهد؛ الرفض قائم */ }
      return { status: 401, body: { ok: false, code: 'wrong_password' } };
    }
  }

  // v-lock-acct (srv-auth-1 · pages-static-3): المشاركات تُجمع قبل أيّ أثر — تعذّر السرد = لا حذف (لا «تم» ومشاركاته منشورة)
  let shareKeys;
  try { shareKeys = await ownedShares(kv, await ownerKeys(key, user, auth)); }
  catch (e) { console.error('[account-delete] share scan failed'); return { status: 503, body: { ok: false, code: 'retry' } }; }

  const renew = await stopAutoRenew(token, opt);
  if (renew.code !== 200) return { status: 502, body: { ok: false, code: 'billing' } };

  const removed = [];
  const del = async (k) => { try { await kv.kvDel(k); removed.push(k); } catch (e) { console.error('[account-delete] del failed: ' + k.split(':')[0]); } };
  for (const k of singleKeys(key)) await del(k);
  for (const p of prefixKeys(key)) {
    let keys = [];
    try { keys = await kv.kvList(p); } catch (e) { keys = []; }
    for (const k of keys) await del(k);
  }
  // مشاركاته العامّة والخاصّة ومداخل «استكشف» لها (جُمعت أعلاه بمالكها — v-lock-acct)
  for (const k of shareKeys) await del(k);
  // الفهارس تُحذف إن كانت تشير إليه وحده (لا يمسّ حسابًا آخر يحمل البريد نفسه)
  const email = String(user.email || '').trim().toLowerCase();
  if (email) {
    try { const idx = await kv.kvGetJSON('db/email-index/' + email); if (idx && String(idx.username || '').trim().toLowerCase() === key) await del('db/email-index/' + email); } catch (e) { /* guard-ok — فهرس مقروء بعطب يبقى؛ الحساب نفسه شاهد محذوف فلا يدخل به أحد */ }
    try { const al = await kv.kvGetJSON('db/alias/g_' + email); if (al && String(al.primary || '').trim().toLowerCase() === key) await del('db/alias/g_' + email); } catch (e) { /* guard-ok — كما أعلاه */ }
  }
  const phone = String(user.phone || '').trim();
  if (phone) {
    try { const idx = await kv.kvGetJSON('db/phone-index/' + phone); if (idx && String(idx.username || '').trim().toLowerCase() === key) await del('db/phone-index/' + phone); } catch (e) { /* guard-ok — كما أعلاه */ }
  }
  // السجلّ: شاهد بلا بيانات — والاسم محجوز (v-name-reuse)
  await auth.putUser(key, { deleted: true, deletedAt: Number(opt.now) || Date.now(), selfDeleted: true });
  return { status: 200, body: { ok: true, removed: removed.length } };
}

module.exports = { deleteAccount, singleKeys, prefixKeys, FAIL_MAX, needsPassword, ownsShare };
