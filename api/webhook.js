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

module.exports = async (req, res) => {
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
