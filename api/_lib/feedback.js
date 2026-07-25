// Vercel Serverless Function: "رأيك يهمنا" — user feedback/ratings/suggestions
// with an instant AI reply, public upvotable idea board, and an owner-only
// AI-generated daily summary. Storage follows the same per-item Redis pattern
// used across this app (auth.js, admin-stats.js): one JSON record per
// feedback item, one tiny marker record per vote (dedupe by voter key).
const crypto = require('crypto');
const { kvGetJSON, kvPutJSON, kvList } = require('./kv.js');

const AUTH_SECRET = process.env.AUTH_SECRET || 'fallback-dev-secret-change-me';
const OWNER_USERNAME = (process.env.OWNER_USERNAME || 'omran').trim().toLowerCase();
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

function verifyToken(token) {
  try {
    const [payload, sig] = String(token).split('.');
    const expected = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.exp < Date.now()) return null;
    return data.u;
  } catch (e) {
    return null;
  }
}

function itemPath(id) { return 'db/feedback/items/' + id + '.json'; }
function votePath(id, voter) { return 'db/feedback/votes/' + id + '/' + encodeURIComponent(voter) + '.json'; }

async function putBlob(path, obj) {
  await kvPutJSON(path, obj);
}

async function getBlob(path) {
  return kvGetJSON(path);
}

async function listAll(prefix) {
  return kvList(prefix);
}

async function aiReply(text, rating, tag, lang) {
  if (!OPENAI_API_KEY) return null;
  const isEn = lang !== 'ar';
  const sys = isEn
    ? 'You are "Omran AI" replying briefly (max 3 short sentences) to app feedback. If rating is low (1-2) or tag is "bug", be empathetic, apologize briefly, and either suggest a quick fix or say the owner will look into it personally. If rating is high (4-5), thank them warmly and invite them to share the app with friends. If tag is "idea", thank them and say the owner personally reviews every suggestion. Keep it natural, warm, never robotic. Reply in English.'
    : 'أنت "عمران AI" ترد بإيجاز (3 جمل قصيرة كحد أقصى) على تعليق مستخدم بالتطبيق. إذا كان التقييم منخفض (1-2) أو الوسم "مشكلة"، كن متعاطفًا، اعتذر بإيجاز، واقترح حلًا سريعًا أو قل إن المالك بيشوفها بنفسه. إذا كان التقييم عالي (4-5)، اشكره بحرارة وادعه يشارك التطبيق مع أصدقائه. إذا كان الوسم "اقتراح"، اشكره وقل إن المالك يراجع كل اقتراح بنفسه. اجعل الرد طبيعيًا ودافئًا وليس آليًا. رد بالعربية.';
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + OPENAI_API_KEY },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: 'Rating: ' + rating + '/5, Tag: ' + tag + '\nFeedback: ' + text },
        ],
        temperature: 0.8,
        max_tokens: 150,
      }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || null;
  } catch (e) {
    return null;
  }
}

async function aiSummary(items, lang) {
  if (!OPENAI_API_KEY) return null;
  const isEn = lang !== 'ar';
  const sys = isEn
    ? 'You are an analyst summarizing recent app feedback for the owner. Given a list of feedback entries (rating, tag, text), produce a concise structured summary: (1) Average rating trend, (2) Top 3 recurring complaints/bugs (merge duplicates), (3) Top 3 most valuable suggestions, (4) One-line overall sentiment verdict. Keep it short and scannable with headers and bullets.'
    : 'أنت محلل تلخص آراء المستخدمين الأخيرة للمالك. بناءً على قائمة التعليقات (تقييم، وسم، نص)، أنتج ملخصًا منظمًا ومختصرًا: (1) متوسط التقييم واتجاهه، (2) أهم 3 مشاكل/شكاوى متكررة (ادمج المتشابه)، (3) أفضل 3 اقتراحات قيّمة، (4) خلاصة عامة بجملة واحدة عن الرضا العام. اجعله مختصرًا وسهل القراءة بعناوين ونقاط.';
  const payload = items.slice(0, 80).map((it) => ({ rating: it.rating, tag: it.tag, text: String(it.text || '').slice(0, 300) }));
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + OPENAI_API_KEY },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: JSON.stringify(payload) },
        ],
        temperature: 0.4,
        max_tokens: 500,
      }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || null;
  } catch (e) {
    return null;
  }
}

const VALID_TAGS = ['bug', 'idea', 'like'];

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (!process.env.UPSTASH_REDIS_REST_URL) { res.status(500).json({ error: 'Server is missing UPSTASH_REDIS_REST_URL' }); return; }

  try {
    let body = req.body;
    if (req.method === 'GET') body = req.query || {};
    else if (!body || typeof body === 'string') body = JSON.parse(body || '{}');
    const action = body.action;

    // ---- Submit new feedback (any user, guest or logged in) ----
    if (action === 'submit') {
      const rating = Math.max(1, Math.min(5, parseInt(body.rating, 10) || 5));
      const tag = VALID_TAGS.includes(body.tag) ? body.tag : 'like';
      const text = String(body.text || '').trim().slice(0, 1000);
      if (!text) { res.status(400).json({ error: 'empty_text' }); return; }
      const lang = body.lang === 'ar' ? 'ar' : 'en';
      let username = null;
      if (body.token) { username = verifyToken(body.token); }
      const displayName = username || (body.guestId ? 'زائر' : 'زائر');

      const id = Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
      const reply = await aiReply(text, rating, tag, lang);
      const item = {
        id, rating, tag, text, lang,
        username: username || null,
        displayName,
        aiReply: reply || (lang === 'ar' ? 'شكرًا لك على رأيك، وصلنا وتم تسجيله! 🙏' : 'Thanks for your feedback, it has been recorded! 🙏'),
        createdAt: new Date().toISOString(),
        isPublic: tag === 'idea',
        implemented: false,
        deleted: false,
      };
      await putBlob(itemPath(id), item);
      res.status(200).json({ ok: true, id, aiReply: item.aiReply });
      return;
    }

    // ---- Vote on a public idea (dedupe per voter key) ----
    if (action === 'vote') {
      const id = String(body.id || '');
      if (!id) { res.status(400).json({ error: 'missing id' }); return; }
      let voter = body.token ? verifyToken(body.token) : null;
      voter = voter || String(body.guestId || '').slice(0, 64);
      if (!voter) { res.status(400).json({ error: 'missing voter' }); return; }
      const marker = votePath(id, voter);
      const existing = await getBlob(marker);
      if (existing) { res.status(200).json({ ok: true, already: true }); return; }
      await putBlob(marker, { at: Date.now() });
      res.status(200).json({ ok: true });
      return;
    }

    // ---- Public idea board (any user) ----
    if (action === 'publicList') {
      const [itemKeys, voteKeys] = await Promise.all([listAll('db/feedback/items/'), listAll('db/feedback/votes/')]);
      const voteCounts = {};
      voteKeys.forEach((k) => {
        const rest = String(k).replace(/^db\/feedback\/votes\//, '');
        const id = rest.split('/')[0];
        voteCounts[id] = (voteCounts[id] || 0) + 1;
      });
      const full = await Promise.all(itemKeys.map((k) => getBlob(k)));
      const ideas = full
        .filter((it) => it && it.isPublic && !it.deleted)
        .map((it) => ({
          id: it.id, text: it.text, displayName: it.displayName, implemented: !!it.implemented,
          createdAt: it.createdAt, votes: voteCounts[it.id] || 0,
        }))
        .sort((a, b) => (b.votes - a.votes) || (new Date(b.createdAt) - new Date(a.createdAt)))
        .slice(0, 100);
      res.status(200).json({ ok: true, ideas });
      return;
    }

    // ---- Everything below is owner-only ----
    const requester = body.token ? verifyToken(body.token) : null;
    const isOwner = requester && String(requester).trim().toLowerCase() === OWNER_USERNAME;

    if (action === 'adminList') {
      if (!isOwner) { res.status(403).json({ error: 'forbidden' }); return; }
      const itemKeys = await listAll('db/feedback/items/');
      const full = await Promise.all(itemKeys.map((k) => getBlob(k)));
      const clean = full.filter((it) => it && !it.deleted).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const avgRating = clean.length ? (clean.reduce((s, it) => s + it.rating, 0) / clean.length).toFixed(2) : null;
      res.status(200).json({ ok: true, items: clean.slice(0, 150), avgRating, total: clean.length });
      return;
    }

    if (action === 'adminSummary') {
      if (!isOwner) { res.status(403).json({ error: 'forbidden' }); return; }
      const itemKeys = await listAll('db/feedback/items/');
      const full = await Promise.all(itemKeys.map((k) => getBlob(k)));
      const clean = full.filter((it) => it && !it.deleted).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).reverse();
      if (!clean.length) { res.status(200).json({ ok: true, summary: body.lang === 'ar' ? 'لا توجد آراء بعد.' : 'No feedback yet.' }); return; }
      const summary = await aiSummary(clean, body.lang);
      res.status(200).json({ ok: true, summary: summary || 'تعذر توليد الملخص حاليًا.' });
      return;
    }

    if (action === 'implement') {
      if (!isOwner) { res.status(403).json({ error: 'forbidden' }); return; }
      const id = String(body.id || '');
      const item = await getBlob(itemPath(id));
      if (!item) { res.status(404).json({ error: 'not_found' }); return; }
      item.implemented = !item.implemented;
      await putBlob(itemPath(id), item);
      res.status(200).json({ ok: true, implemented: item.implemented });
      return;
    }

    if (action === 'delete') {
      if (!isOwner) { res.status(403).json({ error: 'forbidden' }); return; }
      const id = String(body.id || '');
      const item = await getBlob(itemPath(id));
      if (!item) { res.status(404).json({ error: 'not_found' }); return; }
      item.deleted = true;
      await putBlob(itemPath(id), item);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ error: 'unknown action' });
  } catch (e) {
    res.status(500).json({ error: 'server_error', message: String(e && e.message || e) });
  }
};
