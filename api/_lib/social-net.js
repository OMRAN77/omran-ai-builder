'use strict';
/* v-social-net (المالك ٢٧ نوفمبر: «سوهم كلهم الحين… linkedin زيد… الي اريدهم بالمجان»): نشر مباشر مجّانيّ إلى LinkedIn ويوتيوب
   وتيك توك بتطبيقات مطوّر يملكها المالك — بلا وسيط. يعمل تحت social-direct.js (اللوحة نفسها وردودها)، وكلّ منصّة ساكتة ما لم
   تُضبط مفاتيحها: LINKEDIN_CLIENT_ID/SECRET · YOUTUBE_CLIENT_ID/SECRET · TIKTOK_CLIENT_KEY/SECRET.
     net-connect ← رابط الربط بحالة عشوائيّة في KV (عشر دقائق: المالك والمنصّة).
     net-cb      ← GET (عبر ‎/api/social-cb): رمز ← توكن (+ معرّف العضو في LinkedIn) مشفَّر في KV؛ آخر نتيجة تبقى أسبوعًا.
     النشر       ← publish يسجّل المنصّة «في الطابور» فقط؛ الرفع الثقيل يبدأ فورًا في خلفيّة نداء النشر (waitUntil)، والمتابعة status تكمل
                   ما بقي — المنصّات بالتوازي وبقفل خمس دقائق لكلّ منصّة، فلا يُرفع الفيديو مرّتين (v-socnet-fast). الملفّ من الرابط العامّ المؤقّت نفسه (حتّى ٢٥٦ م.ب).
   حدود معلنة للمالك: يوتيوب من مشروع غير مدقّق يقفل الفيديو «خاصًّا» (يظهر «private» تحت المنصّة) حتّى تدقيق Google؛ وتيك توك بلا
   تدقيق ينزل الفيديو في صندوقه («inbox») وينشره المالك من التطبيق؛ وLinkedIn بلا تجديد آليّ — ربط كلّ ٦٠ يومًا.
   لا توكن ولا رابط مزوّد في ردّ أو سجلّ؛ الأخطاء رموز. المفاتيح تُقرأ داخل الدوالّ. */
const crypto = require('node:crypto');
const { kvGetRaw, kvSetRaw, kvSetIfAbsent, kvDel } = require('./kv.js');

const PROV = {
  linkedin: {
    id: 'LINKEDIN_CLIENT_ID', secret: 'LINKEDIN_CLIENT_SECRET', idParam: 'client_id',
    auth: 'https://www.linkedin.com/oauth/v2/authorization', token: 'https://www.linkedin.com/oauth/v2/accessToken',
    scope: 'openid profile w_member_social', host: 'www.linkedin.com',
  },
  youtube: {
    id: 'YOUTUBE_CLIENT_ID', secret: 'YOUTUBE_CLIENT_SECRET', idParam: 'client_id',
    alt: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'], // v-socpub-paused: بلا مفتاحَي يوتيوب يُستعمل عميل «الدخول بحساب Google» القائم — لا عميل جديد ولا سرّ يُنسخ

    auth: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/youtube.upload', host: 'accounts.google.com',
    extra: { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' },
  },
  tiktok: {
    id: 'TIKTOK_CLIENT_KEY', secret: 'TIKTOK_CLIENT_SECRET', idParam: 'client_key',
    auth: 'https://www.tiktok.com/v2/auth/authorize/', token: 'https://open.tiktokapis.com/v2/oauth/token/',
    scope: 'user.info.basic,video.upload', host: 'www.tiktok.com',
  },
};
const PLATS = Object.keys(PROV);
const MAX = 256 * 1024 * 1024;
const UP_LOCK = 300;
const MB = 1024 * 1024;
const TT_ONE = 64 * MB; // v-tiktok-init: حتّى ٦٤ م.ب يُرفع الفيديو قطعة واحدة (chunk_size = حجمه) — أبسط شكل موثّق؛ فوقها قطع ١٠ م.ب
const stateKey = (s) => 'socnet:state:' + s;
const credKey = (p) => 'socnet:cred:' + p;
const badKey = (p) => 'socnet:bad:' + p;
const lastKey = (p) => 'socnet:last:' + p;
const upKey = (r, p) => 'socnet:up:' + r + ':' + p;

const env = (k) => String(process.env[k] || '').trim();
/** مفتاحا المنصّة: زوجها الخاصّ إن اكتمل، وإلّا البديل المكتمل (`alt`) — لا خلط بين زوجين */
const keys = (p) => {
  const P = PROV[p];
  if (!P) return null;
  for (const [i, k] of [[P.id, P.secret]].concat(P.alt ? [P.alt] : [])) if (env(i) && env(k)) return { id: env(i), secret: env(k) };
  return null;
};
const configured = (p) => !!keys(p);
const any = () => PLATS.some(configured);
const site = () => require('./_site.js').siteUrl();
const redirectUri = () => site() + '/api/social-cb'; // مسار بلا استعلام (vercel.json يعيد كتابته إلى media?action=social-publish&op=net-cb)
const liVer = () => env('LINKEDIN_VERSION') || '202606';
const logErr = (w, e) => console.error('[social-net] ' + w + ': ' + String((e && e.message) || e).replace(/https?:\/\/\S+/g, '<url>').slice(0, 200));
const readJSON = (s) => { try { const o = JSON.parse(s); return o && typeof o === 'object' ? o : null; } catch (e) { return null; } };
const fail = (res, status, error, extra) => res.status(status).json(Object.assign({ ok: false, error }, extra || {}));
/** نصّ خطأ المنصّة للسجلّ وحده (logErr يقصّه ويستبدل الروابط) */
const msgOf = (r) => { const j = (r && r.j) || {}; return String((j.error && typeof j.error === 'object' ? j.error.message : '') || j.message || j.error_description || '').replace(/[\r\n]+/g, ' ').slice(0, 140); };
/** رمز خطأ قصير بلا نصّ مزوّد: e<الحالة>[-<رمز آمن>] */
function codeOf(r) {
  const j = (r && r.j) || {};
  const e = j.error && typeof j.error === 'object' ? (j.error.code || '') : (j.error || j.serviceErrorCode || j.code || '');
  const s = String(e).toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24);
  return 'e' + ((r && r.status) || 0) + (s && s !== 'ok' ? '-' + s : '');
}

async function call(method, url, opts) {
  const o = opts || {};
  const r = await fetch(url, { method, headers: o.headers || {}, body: o.body });
  const j = o.raw ? {} : ((await r.json().catch(() => null)) || {});
  return { ok: r.ok && !(j.error && (typeof j.error !== 'object' || (j.error.code && j.error.code !== 'ok'))), status: r.status, j, h: r.headers };
}
const form = (o) => new URLSearchParams(o);

async function getCred(p) {
  const raw = await kvGetRaw(credKey(p));
  return raw ? readJSON(require('./_emailCrypto.js').decrypt(raw)) : null;
}
const putCred = (p, c) => kvSetRaw(credKey(p), require('./_emailCrypto.js').encrypt(JSON.stringify(c)));

/** توكن صالح للمنصّة: يجدّد يوتيوب وتيك توك بالـrefresh؛ LinkedIn بلا تجديد ذاتيّ (ربط كلّ ٦٠ يومًا). null = يحتاج ربط. */
async function token(p) {
  const c = await getCred(p);
  if (!c || !c.access) return null;
  if (!(Number(c.exp) > 0) || Date.now() < Number(c.exp) - 60000) return c;
  if (p === 'linkedin' || !c.refresh || !keys(p)) return null;
  const P = PROV[p];
  const body = p === 'tiktok'
    ? { client_key: keys(p).id, client_secret: keys(p).secret, grant_type: 'refresh_token', refresh_token: c.refresh }
    : { client_id: keys(p).id, client_secret: keys(p).secret, grant_type: 'refresh_token', refresh_token: c.refresh };
  const r = await call('POST', P.token, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form(body) });
  if (!r.ok || !r.j.access_token) { logErr('refresh ' + p, codeOf(r)); if (r.status === 400 || r.status === 401) await kvSetRaw(badKey(p), '1'); return null; }
  const n = Object.assign({}, c, { access: r.j.access_token, refresh: r.j.refresh_token || c.refresh, exp: Date.now() + (Number(r.j.expires_in) || 3600) * 1000 });
  await putCred(p, n);
  return n;
}

/** الموصول مباشرة من المنصّات المضبوطة، وما يحتاج ربطًا مع سببه رمزًا. */
async function state() {
  const on = [], need = [], whyBy = {};
  for (const p of PLATS) {
    if (!configured(p)) continue;
    const c = await getCred(p).catch(() => null);
    const bad = !!(await kvGetRaw(badKey(p)).catch(() => null));
    const expired = c && p === 'linkedin' && Number(c.exp) > 0 && Date.now() > Number(c.exp);
    if (c && c.access && !bad && !expired) { on.push(p); continue; }
    need.push(p);
    const last = readJSON(await kvGetRaw(lastKey(p)).catch(() => null));
    whyBy[p] = (bad || expired) ? 'expired' : (last && last.why && last.why !== 'ok' ? last.why : '');
  }
  return { on, need, whyBy };
}

async function connect(res, user, p) {
  if (!configured(p)) return fail(res, 400, 'bad_platform');
  const P = PROV[p];
  const s = crypto.randomBytes(16).toString('hex');
  await kvSetRaw(stateKey(s), JSON.stringify({ u: String(user), p }), 600);
  const q = Object.assign({ [P.idParam]: keys(p).id, redirect_uri: redirectUri(), response_type: 'code', scope: P.scope, state: s }, P.extra || {});
  return res.status(200).json({ ok: true, url: P.auth + '?' + form(q), host: new URL(P.auth).host });
}

/** رجوع المنصّة (GET): الحالة في KV وحدها تثبت أنّ المالك بدأ الربط. */
async function callback(req, res) {
  const q = req.query || {};
  const back = async (p, why) => {
    if (p) await kvSetRaw(lastKey(p), JSON.stringify({ why: String(why).slice(0, 40), at: Date.now() }), 7 * 86400).catch((e) => logErr('last', e));
    res.setHeader('Location', site() + '/?socpub=' + (p ? p + '-' : '') + why); res.setHeader('Cache-Control', 'no-store');
    return res.status(302).end();
  };
  const st = String(q.state || '');
  if (!/^[0-9a-f]{32}$/.test(st)) return back('', 'fail');
  const rec = readJSON(await kvGetRaw(stateKey(st)));
  await kvDel(stateKey(st));
  if (!rec || !PROV[rec.p] || !configured(rec.p) || !require('./_owner.js').isOwnerName(rec.u)) return back('', 'fail');
  const p = rec.p, P = PROV[p];
  if (q.error || !q.code) return back(p, 'denied');
  try {
    const body = p === 'tiktok'
      ? { client_key: keys(p).id, client_secret: keys(p).secret, code: String(q.code), grant_type: 'authorization_code', redirect_uri: redirectUri() }
      : { client_id: keys(p).id, client_secret: keys(p).secret, code: String(q.code), grant_type: 'authorization_code', redirect_uri: redirectUri() };
    const t = await call('POST', P.token, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form(body) });
    if (!t.ok || !t.j.access_token) { logErr('token ' + p, codeOf(t)); return back(p, 'fail-token-' + codeOf(t)); }
    const old = await getCred(p).catch(() => null);
    const cred = { access: t.j.access_token, refresh: t.j.refresh_token || (old && old.refresh) || '', exp: Date.now() + (Number(t.j.expires_in) || 3600) * 1000, at: Date.now() };
    if (p === 'tiktok') cred.sub = String(t.j.open_id || '');
    if (p === 'linkedin') {
      const me = await call('GET', 'https://api.linkedin.com/v2/userinfo', { headers: { Authorization: 'Bearer ' + cred.access } });
      if (!me.ok || !me.j.sub) { logErr('me ' + p, codeOf(me)); return back(p, 'fail-me-' + codeOf(me)); }
      cred.sub = String(me.j.sub);
    }
    if (p === 'youtube' && !cred.refresh) return back(p, 'fail-norefresh'); // بلا refresh يموت الربط بعد ساعة
    await putCred(p, cred);
    await kvDel(badKey(p));
    return back(p, 'ok');
  } catch (e) {
    logErr('callback ' + p, e);
    return back(p, 'fail');
  }
}

/** يحمّل الفيديو من الرابط العامّ المؤقّت. */
async function bytes(file) {
  const r = await fetch(file);
  if (!r.ok) throw Object.assign(new Error('file ' + r.status), { code: 'file' });
  const b = Buffer.from(await r.arrayBuffer());
  if (!b.length) throw Object.assign(new Error('empty'), { code: 'file' });
  if (b.length > MAX) throw Object.assign(new Error('too_big'), { code: 'too_big' });
  return b;
}
const liHeaders = (c) => ({ Authorization: 'Bearer ' + c.access, 'LinkedIn-Version': liVer(), 'X-Restli-Protocol-Version': '2.0.0', 'Content-Type': 'application/json' });
// نصّ LinkedIn «little text»: المحارف المحجوزة تُهرَّب وإلّا رُفض المنشور
const liText = (s) => String(s || '').replace(/[\\|{}@[\]()<>#*_~]/g, (m) => '\\' + m).slice(0, 2900);
const ytText = (s, n) => String(s || '').replace(/[<>]/g, '').slice(0, n);

/** الرفع الثقيل لمنصّة واحدة؛ يرجع حالة المهمّة الجديدة. */
async function upload(p, j, c, file, cap, ctx) {
  // v-socnet-fast: المنصّات تُرفع معًا في نداء واحد — الفيديو يُحمَّل مرّة واحدة ويتشاركونه
  const bufs = (ctx && (ctx.bufs || (ctx.bufs = {}))) || {};
  const buf = await (bufs[file] || (bufs[file] = bytes(file)));
  if (p === 'youtube') {
    const meta = { snippet: { title: ytText(cap.yt, 100) || 'om ai', description: ytText(cap.cap, 4900), categoryId: '22' }, status: { privacyStatus: 'public', selfDeclaredMadeForKids: false } };
    const init = await call('POST', 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
      headers: { Authorization: 'Bearer ' + c.access, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(buf.length), 'X-Upload-Content-Type': 'video/mp4' },
      body: JSON.stringify(meta), raw: true,
    });
    const loc = init.h && init.h.get && init.h.get('location');
    if (!init.ok || !loc) return { state: 'fail', error: 'init-' + codeOf(init) };
    const put = await call('PUT', loc, { headers: { 'Content-Type': 'video/mp4' }, body: buf });
    if (!put.ok || !put.j.id) return { state: 'fail', error: 'up-' + codeOf(put) };
    const priv = put.j.status && put.j.status.privacyStatus;
    return { state: 'ok', url: 'https://youtu.be/' + encodeURIComponent(put.j.id), error: priv && priv !== 'public' ? priv : '' }; // غير مدقّق ← private
  }
  if (p === 'tiktok') {
    const size = buf.length;
    const chunk = size <= TT_ONE ? size : 10 * MB;
    const count = Math.max(1, Math.floor(size / chunk));
    const init = await call('POST', 'https://open.tiktokapis.com/v2/post/publish/inbox/video/init/', {
      headers: { Authorization: 'Bearer ' + c.access, 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: chunk, total_chunk_count: count } }),
    });
    const d = (init.j && init.j.data) || {};
    if (!init.ok || !d.publish_id || !d.upload_url) {
      // v-tiktok-init: الرمز وحده («invalid_params») لا يقول أيّ حقل — نصّ المنصّة والأحجام في سجلّ الخادم (بلا توكن ولا رابط)
      logErr('init tiktok', codeOf(init) + ' ' + msgOf(init) + ' size=' + size + ' chunk=' + chunk + ' n=' + count);
      return { state: 'fail', error: 'init-' + codeOf(init) };
    }
    for (let i = 0; i < count; i++) {
      const a = i * chunk, b = i === count - 1 ? size - 1 : a + chunk - 1; // القطعة الأخيرة تأخذ الباقي
      const part = buf.subarray(a, b + 1);
      const put = await call('PUT', d.upload_url, { headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(part.length), 'Content-Range': 'bytes ' + a + '-' + b + '/' + size }, body: part, raw: true });
      if (!put.ok) { logErr('up tiktok', codeOf(put) + ' part=' + (i + 1) + '/' + count + ' bytes=' + a + '-' + b + '/' + size); return { state: 'fail', error: 'up-' + codeOf(put) }; }
    }
    return { state: 'wait', stage: 'sent', pid: String(d.publish_id) };
  }
  // LinkedIn: تهيئة ← أجزاء ← إنهاء؛ المنشور يُنشأ حين يصير الفيديو AVAILABLE (في السؤال التالي)
  const owner = 'urn:li:person:' + c.sub;
  const init = await call('POST', 'https://api.linkedin.com/rest/videos?action=initializeUpload', {
    headers: liHeaders(c), body: JSON.stringify({ initializeUploadRequest: { owner, fileSizeBytes: buf.length, uploadCaptions: false, uploadThumbnail: false } }),
  });
  const v = (init.j && init.j.value) || {};
  if (!init.ok || !v.video || !Array.isArray(v.uploadInstructions)) return { state: 'fail', error: 'init-' + codeOf(init) };
  const etags = [];
  for (const ins of v.uploadInstructions) {
    const part = buf.subarray(Number(ins.firstByte), Number(ins.lastByte) + 1);
    const put = await call('PUT', ins.uploadUrl, { headers: { 'Content-Type': 'application/octet-stream' }, body: part, raw: true });
    const et = put.h && put.h.get && put.h.get('etag');
    if (!put.ok || !et) return { state: 'fail', error: 'up-' + codeOf(put) };
    etags.push(et);
  }
  const fin = await call('POST', 'https://api.linkedin.com/rest/videos?action=finalizeUpload', {
    headers: liHeaders(c), body: JSON.stringify({ finalizeUploadRequest: { video: v.video, uploadToken: v.uploadToken || '', uploadedPartIds: etags } }), raw: true,
  });
  if (!fin.ok) return { state: 'fail', error: 'fin-' + codeOf(fin) };
  return { state: 'wait', stage: 'sent', video: String(v.video) };
}

/** متابعة مهمّة منصّة: الرفع مرّة واحدة (قفل)، ثمّ المعالجة عند المنصّة. v-socnet-fast: لا دور — كلّ منصّة في الطابور تُرفع
    في أوّل نداء يصلها (المنصّات بالتوازي من status، والفيديو المحمَّل مشترك عبر ctx). */
async function poll(p, j, reqId, d, ctx) {
  const c = await token(p);
  if (!c) return Object.assign(j, { state: 'fail', error: 'expired' });
  if (j.stage === 'queued') {
    if (!(await kvSetIfAbsent(upKey(reqId, p), '1', UP_LOCK))) return j; // نداء آخر يرفعها الآن
    const file = await d.fileOf(j.id || '');
    if (!(typeof file === 'string' && file.startsWith('https://'))) return Object.assign(j, { state: 'fail', error: 'no_file' });
    const n = await upload(p, j, c, file, j.cap || {}, ctx).catch((e) => { logErr('upload ' + p, e); return { state: 'fail', error: e.code === 'too_big' ? 'too_big' : 'retry' }; });
    return Object.assign({ id: j.id, cap: j.cap }, n); // النصّ يبقى للمنشور (LinkedIn ينشره بعد المعالجة)
  }
  if (p === 'tiktok') {
    const r = await call('POST', 'https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
      headers: { Authorization: 'Bearer ' + c.access, 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify({ publish_id: j.pid }),
    });
    const s = String((r.j && r.j.data && r.j.data.status) || '').toUpperCase();
    if (s === 'SEND_TO_USER_INBOX' || s === 'PUBLISH_COMPLETE') return Object.assign(j, { state: 'ok', error: s === 'SEND_TO_USER_INBOX' ? 'inbox' : '' }); // في صندوق تيك توك: ينشره المالك من التطبيق
    if (s === 'FAILED') logErr('status tiktok', String((r.j.data && r.j.data.fail_reason) || 'failed'));
    if (s === 'FAILED') return Object.assign(j, { state: 'fail', error: 'e-' + String((r.j.data && r.j.data.fail_reason) || 'failed').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30) });
    return j;
  }
  if (p === 'linkedin' && j.video && !j.post) {
    const v = await call('GET', 'https://api.linkedin.com/rest/videos/' + encodeURIComponent(j.video), { headers: liHeaders(c) });
    const s = String((v.j && v.j.status) || '').toUpperCase();
    if (s === 'PROCESSING_FAILED') return Object.assign(j, { state: 'fail', error: 'e-processing' });
    if (s !== 'AVAILABLE') return j;
    if (!(await kvSetIfAbsent(upKey(reqId, p) + ':post', '1', UP_LOCK))) return j;
    const cap = j.cap || {};
    const post = await call('POST', 'https://api.linkedin.com/rest/posts', {
      headers: liHeaders(c), raw: true,
      body: JSON.stringify({
        author: 'urn:li:person:' + c.sub, commentary: liText(cap.cap), visibility: 'PUBLIC',
        distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
        content: { media: { title: String(cap.yt || 'om ai').slice(0, 200), id: j.video } }, lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false,
      }),
    });
    const urn = post.h && post.h.get && post.h.get('x-restli-id');
    if (!post.ok) return Object.assign(j, { state: 'fail', error: 'post-' + codeOf(post) });
    return Object.assign(j, { state: 'ok', post: String(urn || ''), url: urn ? 'https://www.linkedin.com/feed/update/' + encodeURIComponent(urn) + '/' : '' });
  }
  return j;
}

module.exports = { PLATS, PROV, configured, any, state, connect, callback, poll, token, redirectUri, MAX };
