// v-oauth-bind: تذكرة ربط Gmail — بدل رمز الجلسة في state.
// كانت الواجهة ترسل رمز الجلسة نفسه (٣٠ يومًا) state لجوجل: يمرّ في روابط جوجل وسجلّاتها، وemail-callback يربط
// Gmail من أكمل التفويض بأيّ حساب يحمله state — فمهاجم يرسل للضحيّة رابطًا برمزه هو فتُربط Gmail الضحيّة (قراءة
// وإرسال وتقويم) بحساب المهاجم. الآن: نداء موثَّق (رمز الجلسة في الجسم كجيرانه email-*) يسكّ تذكرة عشوائيّة ١٢٨ بتّ
// db/gmail-link/<32 سداسيّ> = { u, net, ts } لعشر دقائق؛ state = التذكرة وحدها؛ والكولباك يستهلكها مرّة، ولا يربط
// إلّا لصاحبها ومن الشبكة التي سكّتها — دائمًا: مفتاح طوارئ الدخول OAUTH_CLAIM_NET_BIND لا يمسّ هذا الفحص، فإيقافه
// يعيد ثغرة الربط (تذكرة المهاجم تُكمَل من الضحيّة على أيّ شبكة) — المراجعة oauth-4. وعدم تطابق الشبكة سببه network_changed
// لا session_expired (oauth-2: الغلاف مع Private Relay — «سجّل الدخول من جديد» لا ينفع هناك).
const crypto = require('crypto');
const { sessionUser, tokenOf } = require('./_session.js');
const { netOf, netMatches } = require('./oauth-claim.js');

const TTL_SEC = 600;
const TICKET_RE = /^[0-9a-f]{32,64}$/;
const keyOf = (t) => 'db/gmail-link/' + t;

/** شكل التذكرة (سداسيّ ٣٢–٦٤) — رمز الجلسة (base64url بنقطة) لا يطابقه أبدًا. */
const isTicket = (s) => typeof s === 'string' && TICKET_RE.test(s);

/** يستهلك التذكرة (قراءة ثمّ حذف — استعمال واحد) ويعيد اسم صاحبها، أو null إن غابت أو قدمت أو جاءت من شبكة أخرى.
    out.reason = 'network_changed' حين لا يردّها إلّا اختلاف الشبكة (الغائبة والقديمة بلا سبب = session_expired عند المنادي). */
async function takeTicket(state, req, out) {
  if (!isTicket(state)) return null;
  const { kvGetJSON, kvDel } = require('./kv.js');
  const t = state.toLowerCase();
  const rec = await kvGetJSON(keyOf(t));
  if (!rec) return null;
  await kvDel(keyOf(t));
  if (typeof rec.u !== 'string' || !rec.u) return null;
  if (!(Date.now() - Number(rec.ts || 0) <= TTL_SEC * 1000)) return null;
  if (!netMatches(rec.net, req)) { if (out) out.reason = 'network_changed'; return null; }
  return rec.u;
}

/* v-audit-main-b (userdata-4 × v-owner-reset-records): صندوق Gmail المربوط صار إثبات استرجاع «قويًّا» عند المالك (owner-lookup: رابط تلقائيّ)، وسكّ
   تذكرة ربطه كان بالجلسة وحدها — رمز جلسة مسروق يربط Gmail المهاجم ثمّ «نسيت كلمتي، بريدي …» فيأخذ رابط حساب الضحيّة ويضع كلمته ويحذفه بها
   (يسقط شرط الحذف «الجلسة والاسم لا يكفيان»). كالبريد والهاتف (recoveryPasswordOk): من وضع كلمته بنفسه (needsPassword، معيار الحذف) يكتبها هنا،
   وحساب Google/رمز البريد بلا كلمة يعرفها كما كان. التخمين من هنا ٥ في ربع ساعة لكلّ حساب، وعطل قراءة السجلّ يرمي (لا يُقرأ «لا كلمة»).
   يعيد { status, body } للرفض أو null. */
async function passwordGate(u, body) {
  const auth = require('./auth.js');
  const user = await auth.getUserSure(u);
  if (!user || user.deleted) return { status: 401, body: { error: 'session_expired' } };
  if (!require('./account-delete.js').needsPassword(user)) return null;
  const pw = body && typeof body.password === 'string' ? body.password : '';
  if (!pw) return { status: 401, body: { error: 'password_required', code: 'password_required' } };
  const wait = await auth.rateWait('gmail-link-pw', u, 5, 15 * 60 * 1000);
  if (wait) return { status: 429, body: { error: 'too_many', code: 'too_many', minutes: wait } };
  if (!auth.verifyPassword(pw, user.salt, user.hash)) return { status: 401, body: { error: 'wrong_password', code: 'wrong_password' } };
  return null;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  try {
    let body = req.body;
    if (!body || typeof body === 'string') body = JSON.parse(body || '{}');
    const u = sessionUser(tokenOf({ body, query: req.query, headers: req.headers }));
    if (!u) { res.status(401).json({ error: 'session_expired' }); return; }
    const gate = await passwordGate(u, body); // v-audit-main-b (userdata-4)
    if (gate) { res.status(gate.status).json(gate.body); return; }
    const ticket = crypto.randomBytes(16).toString('hex');
    const { kvSetRaw } = require('./kv.js');
    await kvSetRaw(keyOf(ticket), JSON.stringify({ u, net: netOf(req), ts: Date.now() }), TTL_SEC);
    res.status(200).json({ ticket });
  } catch (e) {
    res.status(500).json({ error: 'server_error' });
  }
};
module.exports.takeTicket = takeTicket;
module.exports.isTicket = isTicket;
