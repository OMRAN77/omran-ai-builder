// api/webhook.js — ويب هوك سترايب: يستقبل أحداث الدفع موقَّعة من سترايب
// ويضيف النقاط من الخادم مباشرة — لا يعتمد على رجوع المتصفح إطلاقًا
// (يغطي آيفون المثبَّت، وإغلاق الصفحة قبل العودة، وتجديد الاشتراك الشهري).
//
// الإعداد (مرة واحدة): في Stripe → Developers → Webhooks → endpoint
//   https://omran-ai-builder.vercel.app/api/webhook
// بأحداث checkout.session.completed وinvoice.paid، وينسخ «Signing secret»
// (يبدأ بـ whsec_) إلى متغير بيئة STRIPE_WEBHOOK_SECRET في Vercel.
//
// التحقق من التوقيع يدويًا بـ HMAC (بلا مكتبة stripe — المشروع كله fetch خام)،
// والمنح عبر grantPlanToUser نفسه: أمان التكرار مضمون (نفس الجلسة/الفاتورة
// لا تضيف النقاط مرتين حتى لو وصل الحدث والتحقق اليدوي معًا).
const crypto = require('crypto');
const { grantPlanToUser, PLANS } = require('./_lib/create-checkout-session.js');

// جسم خام — بدونه يتغير النص بعد التحليل ويفشل توقيع سترايب دائمًا.
module.exports.config = { api: { bodyParser: false } };

function rawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function verifyStripeSig(payload, sigHeader, secret) {
  try {
    let t = '';
    const v1s = [];
    for (const part of String(sigHeader || '').split(',')) {
      const i = part.indexOf('=');
      if (i < 0) continue;
      const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
      if (k === 't') t = v;
      else if (k === 'v1') v1s.push(v);
    }
    if (!t || !v1s.length) return false;
    if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false; // ٥ دقائق تسامحًا
    const expected = crypto.createHmac('sha256', secret).update(t + '.' + payload).digest('hex');
    const eb = Buffer.from(expected);
    return v1s.some((v) => {
      const vb = Buffer.from(String(v));
      return vb.length === eb.length && crypto.timingSafeEqual(vb, eb);
    });
  } catch (e) { return false; }
}

/* v-phone-link (أمر المالك ٤ أكتوبر «ربط الهاتف بالواتساب… اللي يرسل بالمجان»): ويب هوك واتساب على الدالّة نفسها (جسم خامّ،
   وحدّ الـ١٢ دالّة) — ‎?src=wa‎. ‏GET تحقّق Meta بـWHATSAPP_VERIFY_TOKEN، وPOST موقَّع بـWHATSAPP_APP_SECRET (بلا سرّ = رفض،
   وإلّا ربط أيّ أحد أيّ رقم). الرمز في نصّ الرسالة ورقم المرسل من واتساب نفسه؛ والردّ (رابط الاسترجاع) رسالة خدمة مجّانيّة. */
async function waWebhook(req, res) {
  const pl = require('./_lib/phone-link.js');
  if (req.method === 'GET') {
    const q = req.query || {};
    const vt = String(process.env.WHATSAPP_VERIFY_TOKEN || '').trim();
    if (vt && q['hub.mode'] === 'subscribe' && q['hub.verify_token'] === vt) { res.status(200).end(String(q['hub.challenge'] || '')); return; }
    res.status(403).end('forbidden');
    return;
  }
  if (req.method !== 'POST') { res.status(405).end('Method Not Allowed'); return; }
  const appSecret = String(process.env.WHATSAPP_APP_SECRET || '').trim();
  if (!appSecret) { res.status(503).json({ error: 'WHATSAPP_APP_SECRET missing' }); return; }
  let payload;
  try {
    const buf = await rawBody(req);
    if (!pl.verifyMetaSig(buf, req.headers['x-hub-signature-256'], appSecret)) { res.status(401).json({ error: 'bad signature' }); return; }
    payload = JSON.parse(buf.toString('utf8'));
  } catch (e) { res.status(400).json({ error: 'bad payload' }); return; }
  for (const m of pl.waMessages(payload)) {
    const code = pl.CODE_RE.exec(m.text.toUpperCase());
    if (!code) continue;
    try { const r = await pl.complete(code[0], m.from, 'whatsapp'); if (r.status !== 'dup') await pl.waSend(m.from, pl.replyText(r)); } catch (e) { console.error('[webhook/wa]', e && e.message); }
  }
  res.status(200).json({ received: true });
}

module.exports = async (req, res) => {
  if (req.query && req.query.src === 'wa') return waWebhook(req, res); // v-phone-link
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); res.status(405).end('Method Not Allowed'); return; }
  const secret = (process.env.STRIPE_WEBHOOK_SECRET || '').trim();
  if (!secret) { res.status(503).json({ error: 'STRIPE_WEBHOOK_SECRET missing' }); return; }

  let event;
  try {
    const buf = await rawBody(req);
    if (!verifyStripeSig(buf.toString('utf8'), req.headers['stripe-signature'], secret)) {
      res.status(400).json({ error: 'signature verification failed' });
      return;
    }
    event = JSON.parse(buf.toString('utf8'));
  } catch (e) {
    res.status(400).json({ error: 'bad payload' });
    return;
  }

  try {
    const obj = (event.data && event.data.object) || {};

    if (event.type === 'checkout.session.completed') {
      const md = obj.metadata || {};
      if (obj.payment_status === 'paid' && md.username && PLANS[md.plan]) {
        const g = await grantPlanToUser(md.username, md.plan, 'lastStripeSessionId', obj.id);
        console.log('[webhook] checkout ' + obj.id + ' → ' + (g.error || (g.alreadyGranted ? 'already' : '+' + g.pointsAdded)));
      }
    } else if (event.type === 'invoice.paid') {
      // تجديد شهري فقط — فاتورة الإنشاء الأولى غطّاها حدث الجلسة أعلاه.
      const md = (obj.subscription_details && obj.subscription_details.metadata)
        || (obj.lines && obj.lines.data && obj.lines.data[0] && obj.lines.data[0].metadata) || {};
      if (obj.billing_reason === 'subscription_cycle' && md.username && PLANS[md.plan]) {
        const g = await grantPlanToUser(md.username, md.plan, 'lastStripeInvoiceId', obj.id);
        console.log('[webhook] renewal ' + obj.id + ' → ' + (g.error || (g.alreadyGranted ? 'already' : '+' + g.pointsAdded)));
      }
    }

    res.status(200).json({ received: true });
  } catch (e) {
    // خطأ داخلي: 500 حتى يعيد سترايب المحاولة لاحقًا — لا نبتلع الشحن.
    console.error('[webhook]', e && e.message);
    res.status(500).json({ error: 'handler error' });
  }
};
