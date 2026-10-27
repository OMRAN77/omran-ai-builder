// api/_lib/account-delete.js — v-acct-delete (تدقيق ١٨ أكتوبر «ما في حذف حساب داخل التطبيق، لازم المستخدم يراسل بالإيميل»،
// وأمر المالك ٢٠ أكتوبر، الدفعة ٢: «حذف الحساب داخل التطبيق: استثناء من التجميد بموافقتي، لأنّ Apple وGoogle يطلبونه»).
//
// صاحب الحساب يحذفه بنفسه من «حسابي»: يكتب اسمه تأكيدًا، وكلمة مروره إن كان حسابه بكلمة مرور (حساب Google بلا كلمة مرور).
// الترتيب:
//   ١) إيقاف التجديد التلقائيّ في Stripe بالمسار نفسه الذي يوقفه به زرّه (autoRenewToggle on:false)، لكن إلغاءً فوريًّا لكلّ اشتراك
//      حيّ بما فيه past_due (v-lock-subs، srv-money-5)، بلا خصم جديد. تعذّر الوصول لـStripe = لا حذف (لا نترك بطاقة تُخصم لحساب لا يملكه أحد).
//   ٢) محو بياناته: المحادثات وسجلّ حذفها، الذاكرة والذاكرة الحيّة، التذكيرات واشتراك الإشعارات، المحفظة التعليميّة، سجلّ الوكيل،
//      رصيد النقاط ورصيد اشتراكات الوسائط وفيديوهات الباقة، حجوزات صور مها، مسوّدات البريد، روابط المشاركة العامّة باسمه،
//      وفهارس بريده وهاتفه وربط Google إن كانت تشير إليه وحده.
//   ٣) سجلّ الحساب يصير شاهدًا {deleted:true} بلا أيّ بيانات (لا بريد ولا كلمة مرور ولا ملفّ) — والاسم يبقى محجوزًا
//      (v-name-reuse) فلا يسجّله أحد ويرث شيئًا منه.
// يبقى ما يلزم قانونًا ولا يُعرض لأحد: سجلّات الدفع عند مزوّد الدفع وعندنا (payrec وما يشبهها)، وعدّادات الاستخدام والتكلفة
// الإجماليّة. المالك لا يحذف حسابه من هنا. محاولات كلمة المرور الخاطئة لها حدّ (٥ في ١٥ دقيقة).
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

async function stopAutoRenew(token, o) {
  const toggle = (o && o.autoRenewToggle) || require('./create-checkout-session.js').autoRenewToggle;
  return new Promise((resolve) => {
    const res = { code: 200, status(c) { this.code = c; return this; }, json(j) { resolve({ code: this.code, body: j }); return this; } };
    // v-lock-subs (srv-money-5): immediate — الحساب يُحذف فلا فترة تُكمَّل: كلّ اشتراك (نشط وpast_due وunpaid) يُلغى فورًا، وكان past_due
    // يبقى يُعاد سحبه بعد الحذف بلا منح. الحقل على الطلب نفسه لا في جسمه: لا يصل من العميل.
    Promise.resolve(toggle({ body: { token, on: false }, immediate: true }, res, o && o.fetch)).catch((e) => resolve({ code: 500, body: { error: String(e && e.message || e) } }));
  });
}

/**
 * يحذف حساب صاحب الرمز. يرجع {status, body} — body.code للواجهة: name_mismatch · wrong_password · too_many · owner · billing · gone.
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
  if (String(confirmUsername || '').trim().toLowerCase() !== key) return { status: 400, body: { ok: false, code: 'name_mismatch' } };
  const user = await auth.getUser(key);
  if (!user || user.deleted) return { status: 404, body: { ok: false, code: 'gone' } };

  if (user.hash && user.salt) {
    const failKey = 'db/acct-del-fail/' + n(key);
    let fails = 0;
    try { fails = Number(await kv.kvGetRaw(failKey)) || 0; } catch (e) { fails = 0; }
    if (fails >= FAIL_MAX) return { status: 429, body: { ok: false, code: 'too_many' } };
    if (!password || !verifyPassword(password, user.salt, user.hash)) {
      try { const c = Number(await kv.kvIncr(failKey)); if (c === 1) await kv.kvExpire(failKey, FAIL_TTL); } catch (e) { /* guard-ok — العدّاد أفضل جهد؛ الرفض قائم */ }
      return { status: 401, body: { ok: false, code: 'wrong_password' } };
    }
  }

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
  // روابط المشاركة العامّة باسمه (فهرس «استكشف» يحمل الاسم والمعرّف)
  try {
    const ex = await kv.kvList('db/explore/');
    for (const k of ex.slice(0, 2000)) {
      const e = await kv.kvGetJSON(k);
      if (e && String(e.username || '').trim().toLowerCase() === key) {
        await del(k);
        if (e.id) await del('db/shares/' + encodeURIComponent(e.id) + '.json');
      }
    }
  } catch (e) { console.error('[account-delete] explore scan failed'); }
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

module.exports = { deleteAccount, singleKeys, prefixKeys, FAIL_MAX };
