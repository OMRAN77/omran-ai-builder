'use strict';
/* api/_lib/car3d.js — v-car3d (المالك ٩ أكتوبر على لقطات الكورفيت: «اريد سيارات شبه حقيقيّة… شخص يقدر يضيف سيارته»؛
   ووافق على «السريعة» بسقف ~٠٫٧٥$ لثلاث سيّارات تجريبيّة).

   وصف سيّارة (أو صورة جاهزة) ← صورة استوديو بلا شعارات ← مجسّم ثلاثيّ الأبعاد ملوّن (glb) عبر طابور fal.
   للمالك وحده الآن (ميزة «ضيف سيارتك» للمستخدمين قرار مالك لاحق: النقاط والسقف).
   السقف الماليّ في الخادم نفسه لا في الواجهة: كلّ طلب يحجز كلفته التقديريّة في KV قبل أيّ نداء مدفوع، ويُردّ الحجز
   إن فشل الطلب قبل أن يُحاسَب. المفتاح يُقرأ داخل المعالج (بيئة عارية عند التحميل) ولا يصل المتصفّح.

   POST {token, desc?, imageUrl?}  → { id, image }      (المالك فقط)
   GET  ?id=…                      → { status: RUNNING | SUCCEEDED + car | FAILED + failure }
   GET  ?list=1                    → { cars: [...], spentCents, capCents }  (قراءة عامّة: صفحات المدينة تحمّل السيّارات) */

const QUEUE = 'https://queue.fal.run/';
const SYNC = 'https://fal.run/';
const MODEL_3D_DEFAULT = 'fal-ai/hunyuan3d/v2/mini/turbo';
const MODEL_IMG_DEFAULT = 'fal-ai/flux/schnell';
const COST_CENTS = 25;          // تقدير محافظ لكلّ سيّارة: المجسّم الملوّن (~٢٤ سنتًا) + الصورة (أقلّ من سنت)
const CAP_CENTS_DEFAULT = 75;   // موافقة المالك: ثلاث سيّارات بالنسخة السريعة
const SPENT_KEY = 'car3d/spent_cents';
const LIST_KEY = 'car3d/list';

const model3d = () => String(process.env.CAR3D_MODEL || '').trim() || MODEL_3D_DEFAULT;
const capCents = () => Number(process.env.CAR3D_CAP_CENTS) || CAP_CENTS_DEFAULT;

/** صورة الاستوديو التي يُبنى منها المجسّم: السيّارة كاملة بزاوية ثلاثة أرباع، خلفيّة صافية، بلا شعار ولا لوحة. */
function studioPrompt(desc) {
  const what = String(desc || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 300) || 'modern family sedan, white';
  return 'Studio product photo of a single ' + what + ', three-quarter front view, the entire car visible and centered, '
    + 'plain light grey seamless background, soft even lighting, photorealistic, sharp details, '
    + 'generic unbranded design, debadged: smooth grille and trunk with no emblem, no manufacturer badge, no logos, no text, no license plate, no people.';
}

/** ناتج المحرّك: رابط glb أيًّا كان اسم حقله. */
function meshUrlOf(rd) {
  if (!rd) return '';
  const c = rd.model_mesh || rd.model_glb || rd.glb || rd.mesh || (rd.model_urls && rd.model_urls.glb);
  return String((c && c.url) || (typeof c === 'string' ? c : '') || '');
}

async function body(req) {
  let b = req.body;
  if (!b || typeof b === 'string') { try { b = JSON.parse(b || '{}'); } catch (e) { b = {}; } } // جسم غير JSON = بلا حقول
  return b || {};
}

module.exports = async (req, res, deps) => {
  const d = deps || {};
  const f = d.fetch || fetch;
  const kv = d.kv || require('./kv.js');
  const ownerGate = d.ownerGate || ((t) => require('./_videoUsage').checkOwnerBypass(t));
  res.setHeader('Cache-Control', 'no-store');
  try {
    const q = req.query || {};
    if (req.method === 'GET' && q.list) {
      const cars = (await kv.kvGetJSON(LIST_KEY)) || [];
      const spent = Number(await kv.kvGetJSON(SPENT_KEY)) || 0;
      res.status(200).json({ cars, spentCents: spent, capCents: capCents() });
      return;
    }

    const key = String(process.env.FAL_KEY || '').trim();
    if (!key) { res.status(503).json({ error: 'generator_unavailable' }); return; }
    const auth = { Authorization: 'Key ' + key };

    if (req.method === 'GET' && q.id) {
      const id = String(q.id);
      if (!/^[\w-]{8,80}$/.test(id)) { res.status(400).json({ error: 'bad id' }); return; }
      const saved = await kv.kvGetJSON('car3d/req/' + id);
      if (!saved) { res.status(404).json({ error: 'unknown id' }); return; }
      if (saved.done) { res.status(200).json(saved.done); return; }
      const st = await f(saved.s, { headers: auth });
      const sd = await st.json().catch(() => ({}));
      if (!st.ok) { res.status(502).json({ error: 'status ' + st.status }); return; }
      if (sd.status !== 'COMPLETED') { res.status(200).json({ status: 'RUNNING', queue: sd.queue_position }); return; }
      const rr = await f(saved.r, { headers: auth });
      const rd = await rr.json().catch(() => ({}));
      const glb = meshUrlOf(rd);
      let out;
      if (!rr.ok || !glb) {
        out = { status: 'FAILED', failure: String((rd && (rd.detail && JSON.stringify(rd.detail))) || (rd && rd.error) || ('HTTP ' + rr.status)).slice(0, 300) };
      } else {
        const car = { id, desc: saved.desc, image: saved.image, glb, at: Date.now() };
        const cars = (await kv.kvGetJSON(LIST_KEY)) || [];
        if (!cars.some((c) => c.id === id)) { cars.unshift(car); await kv.kvPutJSON(LIST_KEY, cars.slice(0, 200)); }
        out = { status: 'SUCCEEDED', car };
      }
      await kv.kvPutJSON('car3d/req/' + id, Object.assign({}, saved, { done: out }));
      res.status(200).json(out);
      return;
    }

    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
    const b = await body(req);
    const gate = await ownerGate(b.token);
    if (!gate.allowed) { res.status(gate.reason === 'auth' ? 401 : 403).json({ error: gate.reason === 'auth' ? 'auth_required' : 'owner_only' }); return; }

    // الحجز قبل أيّ نداء مدفوع: تجاوز السقف يُردّ فورًا ويُرفض
    const spent = Number(await kv.kvIncrBy(SPENT_KEY, COST_CENTS)) || 0;
    if (spent > capCents()) {
      await kv.kvDecrBy(SPENT_KEY, COST_CENTS);
      res.status(402).json({ error: 'budget_reached', spentCents: spent - COST_CENTS, capCents: capCents() });
      return;
    }
    const refund = async () => { try { await kv.kvDecrBy(SPENT_KEY, COST_CENTS); } catch (e) { console.error('[car3d] refund ' + (e && e.message)); } };

    const desc = String(b.desc || '').trim().slice(0, 300);
    let image = /^https:\/\//.test(String(b.imageUrl || '')) ? String(b.imageUrl) : '';
    if (!image) {
      const ir = await f(SYNC + (String(process.env.CAR3D_IMAGE_MODEL || '').trim() || MODEL_IMG_DEFAULT), {
        method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, auth),
        body: JSON.stringify({ prompt: studioPrompt(desc), image_size: 'landscape_4_3', num_images: 1 }),
      });
      const id = await ir.json().catch(() => ({}));
      image = String((id && id.images && id.images[0] && id.images[0].url) || '');
      if (!ir.ok || !image) { await refund(); res.status(502).json({ error: 'image_failed', status: ir.status }); return; }
    }

    const m = model3d();
    const sr = await f(QUEUE + m, {
      method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, auth),
      body: JSON.stringify({ input_image_url: image, textured_mesh: true }),
    });
    const sd = await sr.json().catch(() => ({}));
    if (!sr.ok || !sd.request_id) {
      // المجسّم لم يُرسَل؛ الصورة (أقلّ من سنت) صُرفت — يُردّ الحجز كلّه تبسيطًا، فالسقف محافظ أصلًا
      await refund();
      res.status(502).json({ error: 'submit_failed', status: sr.status });
      return;
    }
    const base = QUEUE + m.split('/').slice(0, 2).join('/') + '/requests/' + sd.request_id;
    await kv.kvPutJSON('car3d/req/' + sd.request_id, { s: sd.status_url || base + '/status', r: sd.response_url || base, image, desc, at: Date.now() });
    res.status(200).json({ id: String(sd.request_id), image, spentCents: spent, capCents: capCents() });
  } catch (e) {
    res.status(500).json({ error: 'car3d: ' + (e && e.message ? e.message : String(e)) });
  }
};
module.exports.studioPrompt = studioPrompt;
module.exports.meshUrlOf = meshUrlOf;
module.exports.COST_CENTS = COST_CENTS;
module.exports.CAP_CENTS_DEFAULT = CAP_CENTS_DEFAULT;
module.exports.MODEL_3D_DEFAULT = MODEL_3D_DEFAULT;
