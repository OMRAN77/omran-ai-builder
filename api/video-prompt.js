// api/video-prompt.js — v525
// يستقبل صورة (base64) ويُعيد prompt إنجليزي لـ Runway AI
// يُستدعى من كود الاعتراض في sendPrompt عندما يرفق المستخدم صورة مع طلب فيديو
// v-video-open-lock: كان بلا رمز ولا حدّ — أيّ زائر يشغّل نموذج الرؤية على مفتاح المالك بلا سقف. الآن جلسة حقيقيّة
// (لا تذكرة) وسقف ثابت ٣٠ يوميًّا للحساب قبل أيّ نداء مدفوع؛ المالك وVIP معفيّان، والمحظور مرفوض.
'use strict';
const { oaLightFetch } = require('./_lib/_oa-light.js'); // v-models-latest

const VIDEO_PROMPT_DAILY = 30;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  try {
    let body = req.body;
    if (!body || typeof body === 'string') body = JSON.parse(body || '{}');

    // الهويّة والسقف قبل المفتاح وقبل أيّ نداء مدفوع (الأسرار تُقرأ هنا لا في نطاق الوحدة)
    const session = require('./_lib/_session.js');
    const token = session.tokenOf({ body, query: req.query, headers: req.headers });
    if (!session.sessionUser(token)) { res.status(401).json({ error: 'auth_required' }); return; }
    const { imageBase64, mime } = body;
    if (!imageBase64) { res.status(400).json({ error: 'missing image' }); return; }
    const usage = require('./_lib/_usage.js');
    const gate = await usage.checkAndConsumeCustom(token, null, usage.clientIp(req), 'video-prompt', VIDEO_PROMPT_DAILY);
    if (!gate.allowed) {
      if (gate.banned) { res.status(403).json({ error: 'banned' }); return; }
      if (gate.reason === 'auth') { res.status(401).json({ error: 'auth_required' }); return; }
      res.status(429).json({ error: 'daily_limit_reached', limit: VIDEO_PROMPT_DAILY });
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) { res.status(500).json({ error: 'missing key' }); return; }

    const mimeType = mime || 'image/jpeg';
    const dataUrl = 'data:' + mimeType + ';base64,' + imageBase64;

    const upstream = await oaLightFetch(apiKey, { // v-models-latest
        max_tokens: 100,
        temperature: 0.4,
        store: false,
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: dataUrl, detail: 'low' } },
            {
              type: 'text',
              text: 'Describe this image as a Runway AI video generation prompt in ONE English sentence (max 20 words). Focus on: scene type, main visual elements, atmosphere, style, possible camera movement. Return ONLY the prompt sentence — no explanation, no punctuation at start. Example: "Cinematic ancient city with giant humans and animals, slow pan, warm golden light, documentary style"',
            },
          ],
        }],
      });

    const data = await upstream.json();
    const prompt = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '').trim();
    if (!prompt) { res.status(500).json({ error: 'empty response' }); return; }
    res.json({ prompt });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
};
module.exports.VIDEO_PROMPT_DAILY = VIDEO_PROMPT_DAILY;
