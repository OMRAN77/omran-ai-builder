'use strict';
/* v-director-publish (المالك ٧ نوفمبر: «اي فيديو الي اسويه اقدر ارسله الي اي مكان… في السوشيل ميديا هذي الخاصيه موجوده عندي لكن ضيفها
   عندي في المخرج»، واختار «انشر في حساباتي»): زرّ في «مخرج التطبيق» — للمالك وحده — ينشر الفيديو في حساباته الموصولة بخدمة النشر نفسها
   التي يستعملها بوت التسويق (scripts/social-bot.mjs: الملفّ UPLOAD_POST_USER والمنصّات الستّ).
   الفيديو ملفّ على جهاز المالك (يُلصق في المتصفّح) وحدّ جسم الدالّة ٤٫٥MB، فالمتصفّح يرفعه مباشرة إلى هدف مؤقّت عند مزوّد التخزين (المسار
   نفسه في video-enhance.js)، وخدمة النشر تجلب الرابط العامّ بنفسها (video رابط + async_upload):
     accounts ← المنصّات الموصولة (والتي تحتاج إعادة ربط) — بلا نشر.
     target   ← هدف رفع مؤقّت؛ الرابط العامّ يُحفظ في KV باسم معرّف عشوائيّ ولا يُرسل للعميل، فلا يُنشر إلّا ملفّ رفعه المالك هنا.
     publish  ← نشر واحد للمعرّف (ضغطتان = طلب واحد) بمعرّف طلب ثابت يُرسل أيضًا مفتاح عدم تكرار.
     status   ← حالة كلّ منصّة ورابط منشورها.
   المفاتيح تُقرأ داخل المعالج لا في نطاق الوحدة، ولا اسم مزوّد ولا رابط ولا مفتاح في أيّ ردّ. */
const crypto = require('node:crypto');
const { kvGetRaw, kvSetRaw, kvSetIfAbsent, kvDel } = require('./kv.js');
const { sessionUser, tokenOf } = require('./_session.js');
const { isOwnerName } = require('./_owner.js');

const UP_API = 'https://api.upload-post.com/api';
const INITIATE = 'https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3';
const PLATFORMS = ['instagram', 'facebook', 'tiktok', 'youtube', 'x', 'threads'];
const TYPES = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };
const MAX_BYTES = 500 * 1024 * 1024;
const FILE_TTL = 6 * 3600; // خدمة النشر تجلب الملفّ في الخلفيّة وقد تعيد المحاولة — يبقى ستّ ساعات ثمّ يُحذف عند المزوّد
const SENT_TTL = 7 * 86400;
const CAP_MAX = 2200;
const fileKey = (id) => 'socpub:file:' + id;
const sentKey = (id) => 'socpub:sent:' + id;
const isHttps = (u) => typeof u === 'string' && u.startsWith('https://');
const fail = (res, status, error, extra) => res.status(status).json(Object.assign({ ok: false, error }, extra || {}));
const upKey = () => String(process.env.UPLOAD_POST_API_KEY || '').trim();
const upUser = () => String(process.env.UPLOAD_POST_USER || 'omranaibuilder').trim();
const falKey = () => String(process.env.FAL_KEY || '').trim();

async function upFetch(key, p, opts) {
  const o = opts || {};
  const r = await fetch(UP_API + p, Object.assign({}, o, { headers: Object.assign({ Authorization: 'Apikey ' + key }, o.headers || {}) }));
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok, j: j || {} };
}

/** المنصّات الموصولة من social_accounts: مفتاح X قد يأتي twitter، والحساب الذي يحتاج إعادة ربط لا يُعدّ موصولًا. */
function accountsOf(sa) {
  const acc = (p) => (sa && (sa[p] || (p === 'x' ? sa.twitter : null))) || null;
  const on = [], reauth = [];
  for (const p of PLATFORMS) {
    const a = acc(p);
    if (!a || typeof a !== 'object') continue;
    if (a.reauth_required) reauth.push(p); else on.push(p);
  }
  return { on, reauth };
}

/** نصّ كلّ منصّة بحدّها: يوتيوب عنوان سطر واحد ≤١٠٠، وX ≤٢٨٠، وThreads ≤٥٠٠. */
function cut(s, n) { const t = String(s || '').trim(); return t.length <= n ? t : t.slice(0, n - 1).trimEnd() + '…'; }
function captions(raw) {
  const cap = cut(String(raw || '').replace(/\r\n?/g, '\n'), CAP_MAX);
  const first = (cap.split('\n').find((l) => l.trim()) || cap).trim();
  return { cap, yt: cut(first, 100), x: cut(cap, 280), threads: cut(cap, 500) };
}

/** حالة خدمة النشر ← { state: wait|done|fail, results: [{ platform, state: ok|fail|wait, url, error }] } */
function statusOf(j) {
  const top = String((j && j.status) || '').toLowerCase();
  const raw = (j && (j.results || j.data)) || [];
  const rows = Array.isArray(raw) ? raw : Object.entries(raw).map(([platform, v]) => Object.assign({ platform }, v || {}));
  const results = rows.filter((x) => x && x.platform).map((x) => {
    const s = String(x.status || '').toLowerCase();
    const bad = x.success === false || !!x.error || s === 'failed' || s === 'skipped';
    const good = !bad && (x.success === true || s === 'completed');
    const url = isHttps(x.post_url) ? x.post_url : (isHttps(x.url) ? x.url : '');
    return { platform: String(x.platform), state: bad ? 'fail' : (good ? 'ok' : 'wait'), url, error: bad ? cut(String(x.error_message || x.error || x.message || s || ''), 160) : '' };
  });
  const state = top === 'completed' ? 'done' : (top === 'failed' || top === 'not_found' ? 'fail' : 'wait');
  return { state, results };
}

async function accounts(res, key) {
  const r = await upFetch(key, '/uploadposts/users');
  if (!r.ok) return fail(res, 502, 'accounts', { status: r.status });
  const profs = r.j.profiles || (r.j.profile ? [r.j.profile] : []);
  const prof = profs.find((p) => p && p.username === upUser()) || null;
  if (!prof) return fail(res, 404, 'no_profile');
  return res.status(200).json(Object.assign({ ok: true }, accountsOf(prof.social_accounts || {})));
}

async function target(res, body) {
  const fk = falKey();
  if (!fk) return fail(res, 503, 'no_storage');
  const ctype = String(body.type || '').toLowerCase().split(';')[0].trim();
  const ext = TYPES[ctype];
  const size = Number(body.size);
  if (!ext) return fail(res, 400, 'bad_type');
  if (!(size > 0) || size > MAX_BYTES) return fail(res, 413, 'too_big', { maxMB: MAX_BYTES / 1048576 });
  const life = JSON.stringify({ expiration_duration_seconds: FILE_TTL });
  const r = await fetch(INITIATE, {
    method: 'POST',
    headers: { Authorization: 'Key ' + fk, 'Content-Type': 'application/json', 'X-Fal-Object-Lifecycle': life, 'X-Fal-Object-Lifecycle-Preference': life },
    body: JSON.stringify({ file_name: 'om-' + crypto.randomBytes(8).toString('hex') + '.' + ext, content_type: ctype }),
  });
  const d = r.ok ? await r.json().catch(() => null) : null;
  if (!d || !isHttps(d.upload_url) || !isHttps(d.file_url)) return fail(res, 502, 'storage', { status: r.status });
  const id = crypto.randomBytes(12).toString('hex');
  await kvSetRaw(fileKey(id), d.file_url, FILE_TTL);
  return res.status(200).json({ ok: true, id, up: d.upload_url, ctype });
}

async function publish(res, body, key) {
  const id = String(body.id || '');
  if (!/^[0-9a-f]{24}$/.test(id)) return fail(res, 400, 'bad_id');
  const plats = [...new Set((Array.isArray(body.platforms) ? body.platforms : []).map((p) => String(p).toLowerCase()))].filter((p) => PLATFORMS.includes(p));
  if (!plats.length) return fail(res, 400, 'no_platforms');
  const c = captions(body.caption);
  if (!c.cap) return fail(res, 400, 'no_caption');
  const file = await kvGetRaw(fileKey(id));
  if (!isHttps(file)) return fail(res, 404, 'no_file');
  // نشر واحد لكلّ ملفّ ومنصّاته: الضغطة الثانية (أو إعادة الطلب بعد انقطاع) تعيد الطلب الأوّل ولا تنشر مرّتين؛ والفيديو نفسه لمنصّات
  // أخرى بعدها طلب جديد بلا رفع جديد.
  const tag = crypto.createHash('sha256').update(plats.slice().sort().join(',')).digest('hex').slice(0, 6);
  const reqId = 'omdir-' + id + '-' + tag;
  const sk = sentKey(id + ':' + tag);
  if (!(await kvSetIfAbsent(sk, reqId, SENT_TTL))) return res.status(200).json({ ok: true, request: (await kvGetRaw(sk)) || reqId, again: true });
  const fd = new FormData();
  fd.append('user', upUser());
  for (const p of plats) fd.append('platform[]', p);
  fd.append('title', c.cap);
  fd.append('video', file);
  if (plats.includes('instagram')) { fd.append('media_type', 'REELS'); fd.append('share_to_feed', 'true'); }
  if (plats.includes('facebook')) {
    const pg = await upFetch(key, '/uploadposts/facebook/pages?profile=' + encodeURIComponent(upUser())).catch(() => ({ j: {} }));
    const pages = (pg.j && pg.j.pages) || [];
    const page = pages.find((x) => /om\s*ai/i.test((x && x.name) || '')) || pages[0];
    if (page && page.id) fd.append('facebook_page_id', String(page.id));
    fd.append('facebook_title', c.yt); fd.append('facebook_description', c.cap); fd.append('facebook_media_type', 'VIDEO'); // VIDEO: أيّ نسبة وأيّ طول (الريلز حدّها أقصر)
  }
  if (plats.includes('tiktok')) { fd.append('tiktok_title', c.cap); fd.append('privacy_level', 'PUBLIC_TO_EVERYONE'); }
  if (plats.includes('youtube')) { fd.append('youtube_title', c.yt); fd.append('youtube_description', c.cap); }
  if (plats.includes('x')) fd.append('x_title', c.x);
  if (plats.includes('threads')) fd.append('threads_title', c.threads);
  fd.append('request_id', reqId);
  fd.append('async_upload', 'true');
  fd.append('external_id', 'director-' + id);
  let r;
  try { r = await upFetch(key, '/upload', { method: 'POST', body: fd, headers: { 'Idempotency-Key': reqId } }); }
  catch (e) { return res.status(200).json({ ok: true, request: reqId, unsure: true }); } // الطلب ربّما وصل: الاستطلاع يحسم، ولا إعادة إرسال
  if (!r.ok && r.status !== 202) {
    // رفض صريح قبل البدء (حدّ الشهر، الباقة، صيغة): يُسمح بمحاولة ثانية للملفّ نفسه
    await kvDel(sk);
    return fail(res, 502, r.status === 429 ? 'limit' : 'publish', { status: r.status, detail: cut(String(r.j.message || r.j.error || ''), 160) });
  }
  return res.status(200).json({ ok: true, request: String(r.j.request_id || reqId) });
}

async function status(res, body, key) {
  const reqId = String(body.request || '');
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(reqId)) return fail(res, 400, 'bad_request');
  const r = await upFetch(key, '/uploadposts/status?request_id=' + encodeURIComponent(reqId));
  if (r.status === 404) return res.status(200).json({ ok: true, state: 'wait', results: [] }); // الطلب لم يُسجَّل بعد عندهم
  if (!r.ok) return fail(res, 502, 'status', { status: r.status });
  return res.status(200).json(Object.assign({ ok: true }, statusOf(r.j)));
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') return fail(res, 405, 'method');
  let body = req.body;
  if (!body || typeof body === 'string') { try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; } }
  if (!body || typeof body !== 'object') body = {};
  req.body = body;
  const user = sessionUser(tokenOf(req));
  if (!user) return fail(res, 401, 'auth');
  if (!isOwnerName(user)) return fail(res, 403, 'owner_only');
  const op = String((req.query && req.query.op) || body.op || '');
  try {
    if (op === 'target') return await target(res, body);
    const key = upKey();
    if (!key) return fail(res, 503, 'no_key');
    if (op === 'accounts') return await accounts(res, key);
    if (op === 'publish') return await publish(res, body, key);
    if (op === 'status') return await status(res, body, key);
    return fail(res, 400, 'bad_op');
  } catch (e) {
    console.error('[social-publish] ' + op + ': ' + String((e && e.message) || e).replace(/https?:\/\/\S+/g, '<url>').slice(0, 200));
    return fail(res, 503, 'retry');
  }
};
Object.assign(module.exports, { PLATFORMS, MAX_BYTES, FILE_TTL, accountsOf, captions, statusOf });
