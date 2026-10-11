// v-oauth-bind: تذكرة ربط Gmail — بدل رمز الجلسة في state.
// كانت الواجهة ترسل رمز الجلسة نفسه (٣٠ يومًا) state لجوجل: يمرّ في روابط جوجل وسجلّاتها، وemail-callback يربط
// Gmail من أكمل التفويض بأيّ حساب يحمله state — فمهاجم يرسل للضحيّة رابطًا برمزه هو فتُربط Gmail الضحيّة (قراءة
// وإرسال وتقويم) بحساب المهاجم. الآن: نداء موثَّق (رمز الجلسة في الجسم كجيرانه email-*) يسكّ تذكرة عشوائيّة ١٢٨ بتّ
// db/gmail-link/<32 سداسيّ> = { u, net, ts } لعشر دقائق؛ state = التذكرة وحدها؛ والكولباك يستهلكها مرّة، ولا يربط
// إلّا لصاحبها ومن الشبكة التي سكّتها (OAUTH_CLAIM_NET_BIND=off يوقف فحص الشبكة كما في oauth-claim).
const crypto = require('crypto');
const { sessionUser, tokenOf } = require('./_session.js');
const { netOf, sameNet } = require('./oauth-claim.js');

const TTL_SEC = 600;
const TICKET_RE = /^[0-9a-f]{32,64}$/;
const keyOf = (t) => 'db/gmail-link/' + t;

/** شكل التذكرة (سداسيّ ٣٢–٦٤) — رمز الجلسة (base64url بنقطة) لا يطابقه أبدًا. */
const isTicket = (s) => typeof s === 'string' && TICKET_RE.test(s);

/** يستهلك التذكرة (قراءة ثمّ حذف — استعمال واحد) ويعيد اسم صاحبها، أو null إن غابت أو قدمت أو جاءت من شبكة أخرى. */
async function takeTicket(state, req) {
  if (!isTicket(state)) return null;
  const { kvGetJSON, kvDel } = require('./kv.js');
  const t = state.toLowerCase();
  const rec = await kvGetJSON(keyOf(t));
  if (!rec) return null;
  await kvDel(keyOf(t));
  if (typeof rec.u !== 'string' || !rec.u) return null;
  if (!(Date.now() - Number(rec.ts || 0) <= TTL_SEC * 1000)) return null;
  if (!sameNet(rec.net, req)) return null;
  return rec.u;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  try {
    let body = req.body;
    if (!body || typeof body === 'string') body = JSON.parse(body || '{}');
    const u = sessionUser(tokenOf({ body, query: req.query, headers: req.headers }));
    if (!u) { res.status(401).json({ error: 'session_expired' }); return; }
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
