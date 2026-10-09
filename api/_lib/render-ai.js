'use strict';
/* api/_lib/render-ai.js — v-render-ai (المالك ٩ أكتوبر: «كمل بالذكاء الاصطناعي» على عرض «صوّر بالذكاء الاصطناعي» بثلاث
   صور تجريبيّة ~٠٫٠٥$ للصورة): لقطة من المدينة المصوَّرة ← صورة سينمائيّة واقعيّة بالتخطيط نفسه (صورة إلى صورة).
   للمالك وحده الآن، والسقف في الخادم: كلّ طلب يحجز ٥ سنتات في KV قبل النداء المدفوع، والرابع يُرفض (١٥ سنتًا)،
   والفشل يردّ الحجز. المفتاح داخل المعالج.
   POST {token, image: dataURL jpeg, mood?} → { url } */

const SYNC = 'https://fal.run/';
const MODEL_DEFAULT = 'fal-ai/flux/dev/image-to-image';
const COST_CENTS = 5;
const CAP_CENTS_DEFAULT = 15;
const SPENT_KEY = 'renderai/spent_cents';
const capCents = () => Number(process.env.RENDER_AI_CAP_CENTS) || CAP_CENTS_DEFAULT;

const MOODS = {
  night: 'at night, city lights, glowing windows, street lamps',
  sunset: 'at golden hour sunset, warm orange light, long shadows',
  rain: 'in heavy rain, wet reflective asphalt, raindrops, overcast sky',
  snow: 'in light snowfall, snow on roofs',
  dust: 'in a desert dust storm, hazy sandy air',
  fog: 'in thick morning fog, soft diffused light',
  day: 'on a clear sunny day, crisp light',
};
/** نصّ الطلب من حالة الطقس في الصفحة (night+rain …) — يحافظ على التخطيط ويضيف الواقعيّة. */
function promptFor(mood) {
  const parts = String(mood || '').split('+').map((m) => MOODS[m]).filter(Boolean);
  return 'Photorealistic cinematic photograph of this exact scene, same composition, same buildings, roads and vehicles, '
    + (parts.length ? parts.join(', ') + ', ' : 'on a clear day, ') + 'real camera, natural detail, high dynamic range, no text, no logos, no watermark.';
}

module.exports = async (req, res, deps) => {
  const d = deps || {};
  const f = d.fetch || fetch;
  const kv = d.kv || require('./kv.js');
  const ownerGate = d.ownerGate || ((t) => require('./_videoUsage').checkOwnerBypass(t));
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
    let b = req.body; if (!b || typeof b === 'string') { try { b = JSON.parse(b || '{}'); } catch (e) { b = {}; } } // جسم غير JSON = بلا حقول
    const image = String(b.image || '');
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(image) || image.length > 4.5e6) { res.status(400).json({ error: 'bad image' }); return; }
    const gate = await ownerGate(b.token);
    if (!gate.allowed) { res.status(gate.reason === 'auth' ? 401 : 403).json({ error: gate.reason === 'auth' ? 'auth_required' : 'owner_only' }); return; }
    const key = String(process.env.FAL_KEY || '').trim();
    if (!key) { res.status(503).json({ error: 'generator_unavailable' }); return; }

    const spent = Number(await kv.kvIncrBy(SPENT_KEY, COST_CENTS)) || 0;
    if (spent > capCents()) { await kv.kvDecrBy(SPENT_KEY, COST_CENTS); res.status(402).json({ error: 'budget_reached', capCents: capCents() }); return; }
    const refund = async () => { try { await kv.kvDecrBy(SPENT_KEY, COST_CENTS); } catch (e) { console.error('[render-ai] refund ' + (e && e.message)); } };

    const r = await f(SYNC + (String(process.env.RENDER_AI_MODEL || '').trim() || MODEL_DEFAULT), {
      method: 'POST', headers: { Authorization: 'Key ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: image, prompt: promptFor(b.mood), strength: 0.6, num_inference_steps: 28, guidance_scale: 3.5, num_images: 1 }),
    });
    const j = await r.json().catch(() => ({}));
    const url = String((j && j.images && j.images[0] && j.images[0].url) || '');
    if (!r.ok || !url) { await refund(); res.status(502).json({ error: 'render_failed', status: r.status }); return; }
    res.status(200).json({ url, spentCents: spent, capCents: capCents() });
  } catch (e) {
    res.status(500).json({ error: 'render-ai: ' + (e && e.message ? e.message : String(e)) });
  }
};
module.exports.promptFor = promptFor;
module.exports.COST_CENTS = COST_CENTS;
module.exports.CAP_CENTS_DEFAULT = CAP_CENTS_DEFAULT;
module.exports.MODEL_DEFAULT = MODEL_DEFAULT;
