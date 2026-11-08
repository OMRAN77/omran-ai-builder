'use strict';
/* v-director-publish (المالك ٧ نوفمبر: «اي فيديو الي اسويه اقدر ارسله الي اي مكان… في السوشيل ميديا هذي الخاصيه موجوده عندي لكن ضيفها
   عندي في المخرج»، واختار «انشر في حساباتي»): زرّ في «مخرج التطبيق» — للمالك وحده — ينشر الفيديو في حساباته الموصولة بخدمة النشر نفسها
   التي يستعملها بوت التسويق (scripts/social-bot.mjs: الملفّ UPLOAD_POST_USER والمنصّات الستّ).
   الفيديو ملفّ على جهاز المالك (يُلصق في المتصفّح) وحدّ جسم الدالّة ٤٫٥MB، فالمتصفّح يرفعه مباشرة إلى هدف مؤقّت عند مزوّد التخزين (المسار
   نفسه في video-enhance.js)، وخدمة النشر تجلب الرابط العامّ بنفسها (video رابط + async_upload):
     accounts ← المنصّات الموصولة (والتي تحتاج إعادة ربط) — بلا نشر.
     target   ← هدف رفع مؤقّت؛ الرابط العامّ يُحفظ في KV باسم معرّف عشوائيّ ولا يُرسل للعميل، فلا يُنشر إلّا ملفّ رفعه المالك هنا.
     publish  ← نشر واحد لكلّ فيديو ومنصّة (ضغطتان = طلب واحد)، بمعرّف طلب يُرسل أيضًا مفتاح عدم تكرار.
     status   ← حالة كلّ منصّة ورابط منشورها.
   المفاتيح تُقرأ داخل المعالج لا في نطاق الوحدة، ولا اسم مزوّد ولا رابط ولا مفتاح في أيّ ردّ.
   v-director-publish-guard (مراجعة مستقلّة ٨ نوفمبر): القفل كان على «مجموعة المنصّات»، فمجموعة تتداخل مع سابقتها (إنستغرام ثمّ إنستغرام +
   يوتيوب) تنشر الفيديو مرّة ثانية علنًا في المنصّة المشتركة. الآن كلّ (فيديو، منصّة) يُحجز وحده، ولا يتحرّر الحجز إلّا بإثبات من الخدمة أنّ
   المنصّة لم تنشر (فشل نهائيّ، أو طلب ما وصلها بعد مهلة أطول من عمر الدالّة). «في الطابور» ليس «نزل»، ومسوّدة صندوق تيك توك ليست منشورًا،
   ونصّ X بوزن X ونصّ Threads ببايتات الإيموجي. */
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
const GRACE_MS = 10 * 60 * 1000; // أطول من أقصى عمر للدالّة (٣٠٠ ث): «لا طلب بهذا المعرّف» بعدها = ما وصلهم أبدًا
const LOST_MAX_MS = 24 * 3600 * 1000; // بعد يوم قد تكون الخدمة نسيت الطلب: غيابه عندها لم يعد دليلًا على أنّه ما وصل
const REL_TTL = 60; // رمز التحرير قصير: يمنع محرِّرَين متزامنَين، وحذفٌ فشل يُعاد بعد دقيقة لا بعد أسبوع
const CAP_MAX = 2200;
const HEX24 = /^[0-9a-f]{24}$/;
const REQ_RE = /^[A-Za-z0-9_-]{6,80}$/;
const PENDING = ['queued', 'pending', 'processing', 'retryable']; // retryable: فشل والخدمة تعيد المحاولة بنفسها — لم يُحسم
const PRE_SEND = ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'UND_ERR_CONNECT_TIMEOUT']; // الطلب ما خرج أصلًا
const fileKey = (id) => 'socpub:file:' + id;
const sentKey = (v, p) => 'socpub:sent:' + v + ':' + p; // المنصّة p أخذت الفيديو v بالطلب المخزَّن قيمةً
const reqKey = (r) => 'socpub:req:' + r; // وقت الطلب وقبول الخدمة له: «لا طلب» في المهلة = ينتظر، وبعدها = ما وصل
const seenKey = (r) => 'socpub:seen:' + r; // الخدمة أرت الطلب حيًّا مرّة: غيابه بعدها نسيان لا ضياع
const relKey = (r, p) => 'socpub:rel:' + r + ':' + p; // تحرير حجز منصّة من طلب ميّت: محرِّر واحد في الدقيقة، ولا يمسح حجزًا جديدًا لغيره
const logErr = (where, e) => console.error('[social-publish] ' + where + ': ' + String((e && e.message) || e).replace(/https?:\/\/\S+/g, '<url>').slice(0, 200));
const isHttps = (u) => typeof u === 'string' && u.startsWith('https://');
const lc = (v) => String(v == null ? '' : v).trim().toLowerCase();
const norm = (p) => { const q = lc(p); return q === 'twitter' ? 'x' : q; };
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
const upStatus = (key, r) => upFetch(key, '/uploadposts/status?request_id=' + encodeURIComponent(r));

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

/* أطوال المنصّات. X يزن النصّ: ١ للّاتينيّة والعربيّة وعلامات بعينها و٢ لغيرها (الإيموجي و«…» نفسها) — xLen بوت التسويق حرفيًّا.
   Threads: ٥٠٠ والإيموجي ببايتاته UTF-8 (وثائق Meta وخدمة النشر) — كلّ نقطة رمز من الإيموجي، ومعها ZWJ وVS16 ومفتاح الأرقام، ببايتاتها. */
const xLen = (s) => { let n = 0; for (const ch of String(s)) { const c = ch.codePointAt(0); n += (c <= 0x10FF || (c >= 0x2000 && c <= 0x200D) || (c >= 0x2010 && c <= 0x201F) || (c >= 0x2032 && c <= 0x2037)) ? 1 : 2; } return n; };
const EMO = /[\p{Extended_Pictographic}‍️⃣]/u;
const threadsLen = (s) => { let n = 0; for (const ch of String(s)) n += ch.codePointAt(0) > 0xFFFF ? 4 : (EMO.test(ch) ? Buffer.byteLength(ch, 'utf8') : 1); return n; };
const u16 = (s) => String(s).length;
/** قصّ بمقياس المنصّة نقطةَ رمزٍ نقطة (لا نصف زوج بديل)، و«…» داخل الحدّ. */
function cutBy(s, n, len) {
  const t = String(s || '').trim();
  if (len(t) <= n) return t;
  const room = n - len('…');
  let out = '', w = 0;
  for (const ch of t) { const k = len(ch); if (w + k > room) break; out += ch; w += k; }
  return out.trimEnd() + '…';
}
const cut = (s, n) => cutBy(s, n, u16);
/** نصّ كلّ منصّة بحدّها: يوتيوب عنوان سطر واحد ≤١٠٠، وX ≤٢٨٠ بوزنه، وThreads ≤٥٠٠ بمقياسه. */
function captions(raw) {
  const cap = cut(String(raw || '').replace(/\r\n?/g, '\n'), CAP_MAX);
  const first = (cap.split('\n').find((l) => l.trim()) || cap).trim();
  return { cap, yt: cut(first, 100), x: cutBy(cap, 280, xLen), threads: cutBy(cap, 500, threadsLen) };
}

function rowsOf(j) {
  const raw = (j && (j.results || j.data)) || [];
  const rows = Array.isArray(raw) ? raw : (typeof raw === 'object' ? Object.entries(raw).map(([platform, v]) => Object.assign({ platform }, v || {})) : []);
  return rows.filter((x) => x && x.platform);
}
/** صفّ منصّة ← ok|fail|wait. «success:true» وحده لا يعني «نزل»: الخدمة تقولها لما هو في الطابور (message: Queued). */
function rowOf(x, top) {
  const s = lc(x.status), msg = lc(x.message);
  const url = isHttps(x.post_url) ? x.post_url : (isHttps(x.url) ? x.url : '');
  const why = (t) => cut(String(t || ''), 160);
  if (x.fallback_to_inbox === true) { // مسوّدة في صندوق تيك توك بلا رابط علنيّ — لم ينزل للعامّة
    const note = typeof x.post_url === 'string' && x.post_url && !isHttps(x.post_url) ? x.post_url : 'fallback_to_inbox';
    return { state: 'fail', url: '', error: why('inbox: ' + note) };
  }
  // طابور في مهمّة أعلنت الخدمة فشلها لن يُعالَج: «ما نزل» (كما يحرّره deadRow) لا «ينتظر» للأبد
  if (top === 'failed' && (s === 'queued' || s === 'pending' || (!s && msg === 'queued'))) return { state: 'fail', url, error: why(x.message || s || 'failed') };
  if (PENDING.includes(s)) return { state: 'wait', url, error: '' };
  if (s === 'failed' || s === 'skipped' || x.skipped === true || x.success === false || x.error || x.error_code) {
    return { state: 'fail', url, error: why(x.error_message || (typeof x.error === 'string' ? x.error : '') || x.skip_reason || x.message || x.error_code || s) };
  }
  const ok = s === 'completed' || msg === 'published' || !!url || (top === 'completed' && x.success === true);
  return { state: ok ? 'ok' : 'wait', url, error: '' };
}
/** حالة خدمة النشر ← { state: wait|done|fail, results: [{ platform, state: ok|fail|wait, url, error }] } */
function statusOf(j) {
  const top = lc(j && j.status);
  const results = rowsOf(j).map((x) => Object.assign({ platform: norm(x.platform) }, rowOf(x, top)));
  const state = top === 'completed' ? 'done' : (top === 'failed' || top === 'not_found' ? 'fail' : 'wait');
  return { state, results };
}
/** المنصّة لم تنشر يقينًا فيُسمح بإرسالها من جديد: فشل نهائيّ أو تخطٍّ، أو طابور في مهمّة أعلنت الخدمة فشلها، أو لا صفّ لها فيها.
    لا يُحرَّر: ما في الطابور أو قيد المعالجة أو إعادة المحاولة، وما له رابط أو اكتمل، ومسوّدة صندوق تيك توك (موجودة وإن لم تكن علنيّة). */
function deadRow(x, top) {
  if (!x) return top === 'failed';
  const s = lc(x.status), msg = lc(x.message);
  if (x.fallback_to_inbox === true || isHttps(x.post_url) || isHttps(x.url) || s === 'completed' || msg === 'published') return false;
  if (s === 'failed' || s === 'skipped' || x.skipped === true) return true;
  if (s === 'processing' || s === 'retryable') return false;
  if (s === 'queued' || s === 'pending' || msg === 'queued') return top === 'failed';
  return x.success === false;
}
const readRec = (s) => { try { const o = JSON.parse(s); return o && typeof o === 'object' ? o : null; } catch (e) { return null; } }; // سجلّ تالف = لا سجلّ
/** الطلب ما وصل الخدمة أبدًا: لا طلب عندهم، ومضت المهلة على إرساله، ولم تقبله صراحةً (ردّ 2xx) ولم ترِه حيًّا قطّ، وما زال في يومه الأوّل
    (بعدها قد تكون نسيته). بلا سجلّ لا نحكم (يبقى محجوزًا). */
async function lostReq(r) {
  const rec = readRec(await kvGetRaw(reqKey(r)));
  if (!rec || rec.ok || !(Number(rec.at) > 0)) return false;
  const age = Date.now() - Number(rec.at);
  if (!(age > GRACE_MS && age < LOST_MAX_MS)) return false;
  return !(await kvGetRaw(seenKey(r)));
}
const notFound = (st) => !!st && (st.status === 404 || lc(st.j && st.j.status) === 'not_found');

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
  if (!HEX24.test(id)) return fail(res, 400, 'bad_id');
  const vid = HEX24.test(String(body.vid || '')) ? String(body.vid) : id; // الفيديو نفسه وإن أُعيد رفعه بعد عمر الملفّ: حجوزاته تبقى عليه
  const plats = [...new Set((Array.isArray(body.platforms) ? body.platforms : []).map((p) => String(p).toLowerCase()))].filter((p) => PLATFORMS.includes(p));
  if (!plats.length) return fail(res, 400, 'no_platforms');
  const c = captions(body.caption);
  if (!c.cap) return fail(res, 400, 'no_caption');
  const file = await kvGetRaw(fileKey(id));
  if (!isHttps(file)) return fail(res, 404, 'no_file');
  // نشر واحد لكلّ فيديو ومنصّة: كلّ منصّة تُحجز وحدها (SET NX)، فالضغطة الثانية وانقطاع الردّ ومجموعة تتداخل مع سابقتها لا تنشر في منصّة
  // أخذت الفيديو. السجلّ (ووقته) قبل الحجز: من يجد الحجز يجد وقت طلبه.
  const reqId = 'omdir-' + id + '-' + crypto.randomBytes(4).toString('hex');
  const at = Date.now();
  await kvSetRaw(reqKey(reqId), JSON.stringify({ at, id, v: vid, p: plats }), SENT_TTL);
  const mine = [], held = {};
  const release = async () => { for (const p of mine) await kvDel(sentKey(vid, p)); };
  let posting = false, r, send = [], already = [];
  const hold = {}; // منصّة ← الطلب الذي يحجزها: اللوحة تتابعه فتعرف هل نزل
  try {
    for (const p of plats) {
      if (await kvSetIfAbsent(sentKey(vid, p), reqId, SENT_TTL)) mine.push(p);
      else held[p] = String((await kvGetRaw(sentKey(vid, p))) || '');
    }
    // المحجوز لطلب سابق يتحرّر بإثبات من الخدمة وحدها: صفّه ميّت يقينًا، أو طلبه ما وصلها بعد المهلة. سؤال واحد لكلّ طلب.
    const byReq = {};
    for (const p of Object.keys(held)) (byReq[held[p]] = byReq[held[p]] || []).push(p);
    for (const q of Object.keys(byReq)) {
      let free = [];
      if (!q) free = byReq[q]; // انتهى الحجز بين الخطوتين
      else {
        const st = await upStatus(key, q).catch(() => null);
        if (notFound(st)) { if (await lostReq(q)) free = byReq[q]; }
        else if (st && st.ok) {
          const top = lc(st.j.status), rows = rowsOf(st.j);
          free = byReq[q].filter((p) => deadRow(rows.find((x) => norm(x.platform) === p), top));
        }
      }
      for (const p of free) {
        // محرِّر واحد في الدقيقة، والحجز يُحذف فقط إن بقي على الطلب الميّت نفسه — لا يُمسح حجز جديد لغيره
        if (q && (await kvSetIfAbsent(relKey(q, p), reqId, REL_TTL)) && (await kvGetRaw(sentKey(vid, p))) === q) await kvDel(sentKey(vid, p));
        if (await kvSetIfAbsent(sentKey(vid, p), reqId, SENT_TTL)) { mine.push(p); delete held[p]; }
      }
    }
    send = plats.filter((p) => mine.includes(p));
    already = plats.filter((p) => !mine.includes(p));
    for (const p of already) if (held[p]) hold[p] = held[p];
    if (!send.length) {
      await kvDel(reqKey(reqId));
      return res.status(200).json({ ok: true, again: true, already, held: hold, request: already.map((p) => held[p]).find(Boolean) || '' });
    }
    const fd = new FormData();
    fd.append('user', upUser());
    for (const p of send) fd.append('platform[]', p);
    fd.append('title', c.cap);
    fd.append('video', file);
    if (send.includes('instagram')) { fd.append('media_type', 'REELS'); fd.append('share_to_feed', 'true'); }
    if (send.includes('facebook')) {
      const pg = await upFetch(key, '/uploadposts/facebook/pages?profile=' + encodeURIComponent(upUser())).catch(() => ({ j: {} }));
      const pages = (pg.j && pg.j.pages) || [];
      const page = pages.find((x) => /om\s*ai/i.test((x && x.name) || '')) || pages[0];
      if (page && page.id) fd.append('facebook_page_id', String(page.id));
      fd.append('facebook_title', c.yt); fd.append('facebook_description', c.cap); fd.append('facebook_media_type', 'VIDEO'); // VIDEO: أيّ نسبة وأيّ طول (الريلز حدّها أقصر)
    }
    if (send.includes('tiktok')) {
      fd.append('tiktok_title', c.cap); fd.append('privacy_level', 'PUBLIC_TO_EVERYONE');
      fd.append('disable_inbox_fallback', 'true'); // حدّ تيك توك اليوميّ = فشل معلَن، لا مسوّدة بلا نصّ في صندوقه لا تُحذف
    }
    if (send.includes('youtube')) { fd.append('youtube_title', c.yt); fd.append('youtube_description', c.cap); }
    if (send.includes('x')) fd.append('x_title', c.x);
    if (send.includes('threads')) fd.append('threads_title', c.threads);
    fd.append('request_id', reqId);
    fd.append('async_upload', 'true');
    fd.append('external_id', 'director-' + vid);
    posting = true;
    r = await upFetch(key, '/upload', { method: 'POST', body: fd, headers: { 'Idempotency-Key': reqId } });
  } catch (e) {
    // قبل خروج الطلب (خطأ في الحجز أو التحضير): ما حُجز يتحرّر، والمعالج يقول «أعد» — لا «انرسل قبل» كاذبة عشر دقائق
    if (!posting) { await release().catch((er) => logErr('release', er)); throw e; }
    const code = String((e && e.cause && e.cause.code) || (e && e.code) || '');
    if (PRE_SEND.includes(code)) { await release(); return fail(res, 503, 'retry', { detail: code }); } // ما خرج الطلب: المحاولة الثانية آمنة
    return res.status(200).json({ ok: true, request: reqId, unsure: true, already, held: hold }); // ربّما وصل: الاستطلاع يحسم، وما لم يصل خلال المهلة يتحرّر
  }
  if (!r.ok && r.status !== 202) {
    // رفض صريح قبل البدء (4xx: حدّ الشهر، الباقة، صيغة): ما حُجز في هذا الطلب يتحرّر فتصحّ محاولة ثانية. أمّا 5xx (مهلة البوّابة بعد
    // الإرسال) و408/409 فقد يكون الطلب وصل وأُنشئ — وثائق الخدمة: لا تُعِد بعد مهلة — فلا تحرير: «غير متأكّد» والاستطلاع يحسم.
    if (r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 409) {
      await release();
      return fail(res, 502, r.status === 429 ? 'limit' : 'publish', { status: r.status, detail: cut(String(r.j.message || r.j.error || ''), 160) });
    }
    return res.status(200).json({ ok: true, request: reqId, unsure: true, already, held: hold });
  }
  // قبلته الخدمة صراحةً: غيابه عندها لاحقًا (نسيان) لا يحرّر حجوزه أبدًا
  const accepted = JSON.stringify({ at, id, v: vid, p: send, ok: 1 });
  await kvSetRaw(reqKey(reqId), accepted, SENT_TTL);
  const got = String(r.j.request_id || '');
  const request = REQ_RE.test(got) ? got : reqId;
  if (request !== reqId) {
    // الخدمة ردّت بمعرّفها: الحالة تُسأل به، فالحجز يشير إليه ولسجلّه الوقت نفسه
    await kvSetRaw(reqKey(request), accepted, SENT_TTL);
    for (const p of send) await kvSetRaw(sentKey(vid, p), request, SENT_TTL);
  }
  return res.status(200).json({ ok: true, request, already, held: hold });
}

async function status(res, body, key) {
  const reqId = String(body.request || '');
  if (!REQ_RE.test(reqId)) return fail(res, 400, 'bad_request');
  const r = await upStatus(key, reqId);
  // لا طلب بهذا المعرّف: في المهلة يُنتظر (قد يكون في الطريق)، وبعدها ما وصل أبدًا — اللوحة تقول ذلك والنشر التالي يرسله من جديد
  if (notFound(r)) return res.status(200).json((await lostReq(reqId)) ? { ok: true, state: 'fail', lost: true, results: [] } : { ok: true, state: 'wait', results: [] });
  if (!r.ok) return fail(res, 502, 'status', { status: r.status });
  await kvSetIfAbsent(seenKey(reqId), '1', SENT_TTL); // رأته الخدمة حيًّا: غيابه بعدها لا يحرّر
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
Object.assign(module.exports, { PLATFORMS, MAX_BYTES, FILE_TTL, GRACE_MS, LOST_MAX_MS, accountsOf, captions, statusOf, deadRow, xLen, threadsLen });
