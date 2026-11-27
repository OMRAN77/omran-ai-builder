'use strict';
/* v-social-direct (المالك ٢٦ نوفمبر: «تبني من الصفر upload-post نفس… بدون أي اشتراكات» بعد أن رُفض دفع اشتراك خدمة النشر):
   النشر المباشر من التطبيق إلى إنستغرام وفيسبوك بتطبيق Meta يملكه المالك (وضع التطوير — صاحبه لا يحتاج مراجعة)، بلا وسيط ولا اشتراك.
   يعمل تحت لوحة «انشر في حساباتي» نفسها (social-publish.js يحوّل إليه) وبالردود نفسها، ويبقى ساكتًا ما لم يُضبط
   META_APP_ID وMETA_APP_SECRET في Vercel — فبلاهما سلوك اللوحة القديم حرفيًّا.
     meta-connect ← رابط الربط (حالة عشوائيّة في KV عشر دقائق باسم المالك).
     meta-cb      ← GET من Meta: رمز ← توكن طويل ← صفحة الفيسبوك وحساب إنستغرام المربوط بها؛ توكن الصفحة (لا ينتهي) مشفَّر في KV.
     accounts     ← المربوط مباشرة، ومعه ما بقي عند الوسيط إن وُجد مفتاحه؛ وغير المربوط «يحتاج إعادة ربط» وقابل للضغط (connect).
     publish      ← فيسبوك: فيديو الصفحة من الرابط العامّ؛ إنستغرام: حاوية ريلز ثمّ نشرها حين تجهز. منصّة لكلّ فيديو مرّة.
     status       ← طلب «sd-…»: يسأل Meta عن كلّ منصّة، وينشر حاوية إنستغرام الجاهزة مرّة واحدة (قفل)، ويضمّ ما أُرسل للوسيط.
   لا اسم مزوّد ولا رابط ولا توكن في أيّ ردّ أو سجلّ؛ الأخطاء رموز (e190…). المفاتيح تُقرأ داخل الدوالّ لا في نطاق الوحدة.
   v-social-direct-sure: الحجز يتحرّر بإثبات أنّ المنصّة لم تنشر وحده؛ غير المؤكَّد يبقى ويُحسم بالسؤال (الشرح فوق SOFT). */
const crypto = require('node:crypto');
const { kvGetRaw, kvSetRaw, kvSetIfAbsent, kvDel } = require('./kv.js');

const DIRECT = ['instagram', 'facebook'];
const SCOPES = 'pages_show_list,pages_read_engagement,pages_manage_posts,business_management,instagram_basic,instagram_content_publish';
const SENT_TTL = 7 * 86400;
const STATE_TTL = 600;
const LOCK_TTL = 120; // نشر حاوية إنستغرام: سؤال واحد ينشر، وقفل يموت مع دالّة ماتت فتعيد التالية
const CRED = 'socdir:meta';
const BAD = 'socdir:meta:reauth';
const stateKey = (s) => 'socdir:state:' + s;
const recKey = (r) => 'socdir:req:' + r;
const sentKey = (v, p) => 'socdir:sent:' + v + ':' + p;
const lockKey = (c) => 'socdir:igpub:' + c;
const REQ = /^sd-[0-9a-f]{24}-[0-9a-f]{8}$/;

const env = (k) => String(process.env[k] || '').trim();
const ver = () => env('META_GRAPH_VERSION') || 'v23.0';
const G = () => 'https://graph.facebook.com/' + ver();
const GV = () => 'https://graph-video.facebook.com/' + ver();
const configured = () => !!(env('META_APP_ID') && env('META_APP_SECRET'));
const isReq = (r) => REQ.test(String(r || ''));
const site = () => require('./_site.js').siteUrl();
const redirectUri = () => site() + '/api/media?action=social-publish&op=meta-cb';
const fail = (res, status, error, extra) => res.status(status).json(Object.assign({ ok: false, error }, extra || {}));
const logErr = (w, e) => console.error('[social-direct] ' + w + ': ' + String((e && e.message) || e).replace(/https?:\/\/\S+/g, '<url>').slice(0, 200));
const readJSON = (s) => { try { const o = JSON.parse(s); return o && typeof o === 'object' ? o : null; } catch (e) { return null; } };
const errOf = (r) => { const e = (r.j && r.j.error) || {}; return 'e' + (e.code || r.status || 0) + (e.error_subcode ? '.' + e.error_subcode : ''); };

/** نداء Graph: المعاملات في الجسم (POST) أو الاستعلام (GET)؛ «ok» يعني ردًّا ناجحًا بلا error. */
async function graph(method, url, params) {
  const q = new URLSearchParams(params || {});
  const r = await fetch(method === 'GET' ? url + (url.includes('?') ? '&' : '?') + q : url, method === 'GET' ? { method } : { method, body: q });
  const j = (await r.json().catch(() => null)) || {};
  return { ok: r.ok && !j.error, status: r.status, j };
}

async function creds() {
  const raw = await kvGetRaw(CRED);
  if (!raw) return null;
  return readJSON(require('./_emailCrypto.js').decrypt(raw));
}

/** ما الموصول مباشرة: on، وما يحتاج ربطًا: reauth + connect (اللوحة تجعله قابلًا للضغط). */
async function metaState() {
  const c = await creds();
  const bad = !!(await kvGetRaw(BAD));
  const on = [];
  if (c && !bad) { if (c.ig) on.push('instagram'); if (c.page) on.push('facebook'); }
  const need = DIRECT.filter((p) => !on.includes(p));
  return { on, reauth: need, connect: need, c: bad ? null : c };
}

async function connect(res, user) {
  const state = crypto.randomBytes(16).toString('hex');
  await kvSetRaw(stateKey(state), String(user), STATE_TTL);
  // تطبيقات «الأعمال» الجديدة عند Meta قد ترفض scope وتطلب تهيئة (config_id) من «تسجيل دخول فيسبوك للأعمال» — احتياط بمتغيّر واحد
  const cfg = env('META_CONFIG_ID');
  const q = new URLSearchParams(Object.assign({ client_id: env('META_APP_ID'), redirect_uri: redirectUri(), state, response_type: 'code' }, cfg ? { config_id: cfg } : { scope: SCOPES }));
  return res.status(200).json({ ok: true, url: 'https://www.facebook.com/' + ver() + '/dialog/oauth?' + q });
}

/** رجوع Meta (GET): الحالة من KV وحدها تثبت أنّ المالك بدأ الربط — لا جلسة في هذا الطلب. */
async function callback(req, res) {
  const q = req.query || {};
  const back = (why) => { res.setHeader('Location', site() + '/?socpub=' + why); res.setHeader('Cache-Control', 'no-store'); return res.status(302).end(); };
  const st = String(q.state || '');
  if (!/^[0-9a-f]{32}$/.test(st)) return back('fail');
  const who = await kvGetRaw(stateKey(st));
  await kvDel(stateKey(st));
  if (!who || !require('./_owner.js').isOwnerName(who)) return back('fail');
  if (q.error || !q.code) return back('denied');
  try {
    const id = env('META_APP_ID'), secret = env('META_APP_SECRET');
    const a = await graph('GET', G() + '/oauth/access_token', { client_id: id, client_secret: secret, redirect_uri: redirectUri(), code: String(q.code) });
    if (!a.ok || !a.j.access_token) return back('fail-' + errOf(a));
    const l = await graph('GET', G() + '/oauth/access_token', { grant_type: 'fb_exchange_token', client_id: id, client_secret: secret, fb_exchange_token: a.j.access_token });
    const user = (l.ok && l.j.access_token) || a.j.access_token;
    // توكن الصفحة المأخوذ بتوكن مستخدم طويل لا ينتهي
    const pg = await graph('GET', G() + '/me/accounts', { fields: 'id,name,access_token,instagram_business_account{id,username}', limit: '50', access_token: user });
    const pages = ((pg.j && pg.j.data) || []).filter((x) => x && x.id && x.access_token);
    const om = (x) => /om\s*ai/i.test((x && x.name) || '');
    const igOf = (x) => x && x.instagram_business_account && x.instagram_business_account.id;
    const pick = pages.find((x) => igOf(x) && om(x)) || pages.find(igOf) || pages.find(om) || pages[0];
    if (!pick) return back('no_page');
    const rec = { page: pick.id, pageName: pick.name || '', token: pick.access_token, ig: igOf(pick) || '', igName: (pick.instagram_business_account && pick.instagram_business_account.username) || '', at: Date.now() };
    await kvSetRaw(CRED, require('./_emailCrypto.js').encrypt(JSON.stringify(rec)));
    await kvDel(BAD);
    return back(rec.ig ? 'ok' : 'no_ig');
  } catch (e) {
    logErr('callback', e);
    return back('fail');
  }
}

/** الحسابات: المباشر أوّلًا، ثمّ ما عند الوسيط لغير منصّاته (إن وُجد مفتاحه ونجح سؤاله). فتح اللوحة يحسم أيضًا ما عُلّق من طلبات (settle). */
async function accounts(res, upAccounts) {
  await settle().catch((e) => logErr('settle', e));
  const m = await metaState();
  let on = m.on.slice(), reauth = m.reauth.slice();
  if (upAccounts) {
    const u = await upAccounts().catch((e) => { logErr('up-accounts', e); return null; });
    if (u) {
      for (const p of u.on || []) if (!DIRECT.includes(p) && !on.includes(p)) on.push(p);
      for (const p of u.reauth || []) if (!DIRECT.includes(p) && !reauth.includes(p)) reauth.push(p);
    }
  }
  return res.status(200).json({ ok: true, on, reauth, connect: m.connect });
}

/* v-social-direct-sure (مراجعة مستقلّة ٢٧ نوفمبر): الحجز لا يتحرّر إلّا بإثبات أنّ المنصّة لم تنشر — رفض صريح من Meta (4xx بخطأ غير عابر)،
   أو طلب لم يخرج أصلًا، أو حاوية إنستغرام لم نحاول نشرها قطّ (لا ينشرها غيرنا). ما سواه «غير مؤكَّد»: يبقى محجوزًا ويُحسم بالسؤال، ويظهر
   للمالك «ما نزل» برمزه (err) متى طال، ويُعاد سؤاله في كلّ سؤال لاحق فينقلب «نزل» إن ظهر — كما يفعل social-publish.js للوسيط. */
const SOFT = [1, 2, 4, 17, 32, 341, 613, 9007]; // عابر: خطأ مؤقّت أو حدّ معدّل — يُعاد لاحقًا
const PRE_SEND = ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'UND_ERR_CONNECT_TIMEOUT']; // الطلب ما خرج أصلًا
const GRACE_MS = 10 * 60 * 1000; // أطول من أقصى عمر للدالّة (٣٠٠ ث): مهمّة بلا نتيجة بعدها = ماتت الدالّة وسطها
const OPEN = 'socdir:open'; // طلبات فيها منصّة لم تُحسم: فتح اللوحة التالي يكملها وإن أُغلق التبويب
const OPEN_MAX = 10, OPEN_AGE = 2 * 86400 * 1000; // الحاوية تنتهي بعد ٢٤ ساعة؛ وفيسبوك غير المحسوم يُسأل يومين ثمّ يبقى لسؤال اللوحة
const IG_MAX = 300 * 1048576; // ريلز إنستغرام: MP4/MOV حتّى ٣٠٠ ميغا
const codeOf = (r) => Number((r.j.error && r.j.error.code) || 0);
const soft = (r) => { const e = r.j.error; return !e || !!e.is_transient || r.status >= 500 || SOFT.includes(Number(e.code)); };
const refused = (r) => r.status >= 400 && r.status < 500 && !!r.j.error && !soft(r); // عالجته Meta ورفضته: لم يُنشأ شيء
const unsure = (j, r) => Object.assign(j, { err: errOf(r), code: codeOf(r) }); // يظهر برمزه ويبقى «ينتظر» داخليًّا ومحجوزًا
const clear = (j) => { delete j.err; delete j.code; return j; };
const markOf = (t) => crypto.createHash('sha256').update(String(t || '').trim()).digest('hex').slice(0, 16); // بصمة النصّ: يُلقى بها منشور فيسبوك غير المؤكَّد

async function remember(reqId) {
  const l = readJSON(await kvGetRaw(OPEN));
  const a = (Array.isArray(l) ? l : []).filter((x) => x !== reqId);
  await kvSetRaw(OPEN, JSON.stringify([reqId].concat(a).slice(0, OPEN_MAX)), SENT_TTL);
}
/** إنستغرام يرفض الملفّ قبل أيّ حاوية: النوع والحجم من الرفع؛ ملفّ أقدم بلا نوع محفوظ يُرفض فقط إن قال رابطه webm صراحةً. */
function igReject(meta, file) {
  const t = String((meta && meta.ctype) || '');
  if (t ? !/^video\/(mp4|quicktime)$/.test(t) : /\.webm(\?|#|$)/i.test(String(file))) return 'e-type:mp4/mov';
  if (meta && Number(meta.size) > IG_MAX) return 'e-size:300MB';
  return '';
}

/** يُنشئ منشور منصّة: فيسبوك فيديو صفحة، وإنستغرام حاوية ريلز (تُنشر حين تجهز). */
async function start(p, c, cap, file) {
  if (p === 'facebook') {
    let r;
    try { r = await graph('POST', GV() + '/' + c.page + '/videos', { file_url: file, title: cap.yt, description: cap.cap, access_token: c.token }); }
    catch (e) {
      logErr('start facebook', e);
      const code = String((e && e.cause && e.cause.code) || (e && e.code) || '');
      return PRE_SEND.includes(code) ? { state: 'fail', error: 'retry' } : { state: 'wait', unsure: 1 }; // خرج الطلب: ربّما نُشر
    }
    if (r.ok && r.j.id) return { state: 'wait', id: String(r.j.id) };
    // رفض صريح (4xx بخطأ، والحدّ منه) = لم يُنشأ؛ «خطأ مجهول» (1/2) أو عابر معلَن أو 5xx أو بلا معرّف = ربّما أُنشئ
    const sure = r.status >= 400 && r.status < 500 && r.j.error && ![1, 2].includes(codeOf(r)) && !r.j.error.is_transient;
    return sure ? { state: 'fail', error: errOf(r), code: codeOf(r) } : { state: 'wait', unsure: 1 };
  }
  // حاوية لم تُنشر لا تظهر لأحد: أيّ فشل هنا يحرّر بلا خطر نشر ثانٍ
  const r = await graph('POST', G() + '/' + c.ig + '/media', { media_type: 'REELS', video_url: file, caption: cap.cap, share_to_feed: 'true', access_token: c.token })
    .catch((e) => { logErr('start instagram', e); return { ok: false, status: 0, j: {} }; });
  return r.ok && r.j.id ? { state: 'wait', box: String(r.j.id) } : { state: 'fail', error: r.status ? errOf(r) : 'retry', code: codeOf(r) };
}

async function publish(res, body, d) {
  const id = String(body.id || '');
  if (!/^[0-9a-f]{24}$/.test(id)) return fail(res, 400, 'bad_id');
  const vid = /^[0-9a-f]{24}$/.test(String(body.vid || '')) ? String(body.vid) : id;
  const plats = [...new Set((Array.isArray(body.platforms) ? body.platforms : []).map((p) => String(p).toLowerCase()))];
  const m = await metaState();
  const mine0 = plats.filter((p) => m.on.includes(p));
  const rest = plats.filter((p) => !mine0.includes(p));
  if (!mine0.length) return d.upPublish ? d.upPublish(body) : fail(res, 503, 'no_key'); // لا شيء مباشر: الطريق القديم كما هو
  const cap = d.captions(body.caption);
  if (!cap.cap) return fail(res, 400, 'no_caption');
  const file = await d.fileOf(id);
  if (!(typeof file === 'string' && file.startsWith('https://'))) return fail(res, 404, 'no_file');
  const reqId = 'sd-' + id + '-' + crypto.randomBytes(4).toString('hex');
  const at = Date.now();
  const already = [], held = {}, jobs = {};
  const igBad = mine0.includes('instagram') ? igReject(d.metaOf ? readJSON(await d.metaOf(id)) : null, file) : '';
  let mine = mine0;
  if (igBad) {
    mine = mine0.filter((p) => p !== 'instagram');
    const h = await kvGetRaw(sentKey(vid, 'instagram'));
    if (h) { already.push('instagram'); held.instagram = String(h); } else jobs.instagram = { state: 'fail', error: igBad };
  }
  // السجلّ (ووقته) قبل الحجز: كلّ حجز يشير إلى سجلّ موجود، ومهمّة بلا نتيجة (new) تُحسم بعد المهلة لا «ضاع» يناقض «انرسل قبل»
  let up = '', upPlats = [], upErr = '', upUnsure = false;
  const save = () => kvSetRaw(recKey(reqId), JSON.stringify({ at, vid, jobs, up, upPlats, upErr, mark: markOf(cap.cap) }), SENT_TTL);
  for (const p of mine) jobs[p] = { state: 'wait', new: 1 };
  await save();
  const reserved = [], started = [];
  try {
    for (const p of mine) {
      if (await kvSetIfAbsent(sentKey(vid, p), reqId, SENT_TTL)) reserved.push(p);
      else { delete jobs[p]; already.push(p); held[p] = String((await kvGetRaw(sentKey(vid, p))) || ''); }
    }
    // ما بقي للوسيط يُرسل بطريقه القديم ويُتابَع ضمن هذا الطلب
    if (rest.length) {
      if (!d.upCapture) upErr = 'no_key';
      else {
        const u = await d.upCapture(Object.assign({}, body, { platforms: rest })).catch((e) => { logErr('up-publish', e); return { body: { ok: false, error: 'retry' } }; });
        const b = (u && u.body) || {};
        if (b.ok) {
          for (const p of b.already || []) already.push(p);
          Object.assign(held, b.held || {});
          if (!b.again) { up = String(b.request || ''); upPlats = rest.filter((p) => !(b.already || []).includes(p)); upUnsure = !!b.unsure; }
        } else { upErr = String(b.error || 'publish'); upPlats = rest; }
      }
      if (upErr && !upPlats.length) upPlats = rest;
    }
    if (reserved.length || up || upErr) await save();
    for (const p of reserved) {
      started.push(p);
      const j = await start(p, m.c, cap, file);
      if (j.code === 190) await kvSetRaw(BAD, '1');
      if (j.state === 'fail') await kvDel(sentKey(vid, p)); // لم يُنشر يقينًا: يتحرّر فتصحّ محاولة ثانية
      jobs[p] = j;
      await save(); // بعد كلّ منصّة: موت الدالّة بعدها لا يُضيع معرّف ما أُنشئ
    }
  } catch (e) {
    // قبل نداء المنصّة (KV متعطّل): ما حُجز ولم يبدأ يتحرّر، والمعالج يقول «أعد»
    for (const p of reserved) if (!started.includes(p)) await kvDel(sentKey(vid, p)).catch((er) => logErr('release', er));
    if (!started.length) await kvDel(recKey(reqId)).catch((er) => logErr('release', er));
    throw e;
  }
  if (!Object.keys(jobs).length && !up && !upErr) {
    await kvDel(recKey(reqId));
    return res.status(200).json({ ok: true, again: true, already, held, request: Object.values(held).find(Boolean) || '' });
  }
  if (Object.values(jobs).some((j) => j.state === 'wait')) await remember(reqId).catch((e) => logErr('open', e));
  const out = { ok: true, request: reqId, already, held };
  if (upUnsure || Object.values(jobs).some((j) => j.unsure)) out.unsure = true; // اللوحة تقول «ما تأكّدنا… نتابع» لا «انرسل»
  return res.status(200).json(out);
}

/** يسأل عن منشور منصّة واحدة ويحدّث حالته؛ إنستغرام الجاهز يُنشر هنا مرّة واحدة. */
async function poll(p, j, c, rec) {
  if (p === 'facebook') {
    if (!j.id) { // نشر غير مؤكَّد: يُلقى في فيديوهات الصفحة منذ وقت الطلب ببصمة نصّه
      const r = await graph('GET', G() + '/' + c.page + '/videos', { fields: 'id,description', since: String(Math.floor(Number(rec.at || 0) / 1000) - 120), limit: '50', access_token: c.token });
      const v = r.ok && Array.isArray(r.j.data) && rec.mark ? r.j.data.find((x) => x && x.id && markOf(x.description) === rec.mark) : null;
      if (!v) {
        if (!r.ok && !soft(r)) return unsure(j, r);
        return Date.now() - Number(rec.at || 0) > GRACE_MS ? Object.assign(j, { err: 'e-unsure' }) : j;
      }
      j.id = String(v.id); delete j.unsure;
    }
    const r = await graph('GET', G() + '/' + j.id, { fields: 'status,permalink_url', access_token: c.token });
    if (!r.ok) return soft(r) ? j : unsure(j, r); // الفيديو عند Meta: تعذّر السؤال ليس إثباتًا أنّه لم يُنشر
    clear(j);
    const s = String((r.j.status && r.j.status.video_status) || '').toLowerCase();
    const url = r.j.permalink_url ? (String(r.j.permalink_url).startsWith('http') ? r.j.permalink_url : 'https://www.facebook.com' + r.j.permalink_url) : '';
    if (s === 'ready') return Object.assign(j, { state: 'ok', url });
    if (s === 'error' || s === 'expired') return Object.assign(j, { state: 'fail', error: 'e-' + s });
    return j;
  }
  if (!j.media) {
    const r = await graph('GET', G() + '/' + j.box, { fields: 'status_code', access_token: c.token });
    if (!r.ok) {
      if (soft(r)) return j;
      // لم نحاول نشرها قطّ = لم تُنشر (لا ينشرها غيرنا) فتتحرّر؛ بعد محاولة غير محسومة تبقى محجوزة
      return j.tried ? unsure(j, r) : Object.assign(j, { state: 'fail', error: errOf(r), code: codeOf(r) });
    }
    const s = String(r.j.status_code || '').toUpperCase();
    if (s === 'ERROR' || s === 'EXPIRED') return Object.assign(clear(j), { state: 'fail', error: 'e-' + s.toLowerCase() });
    if (s === 'PUBLISHED') return Object.assign(clear(j), { state: 'ok', url: '' });
    if (s !== 'FINISHED') return j;
    if (!(await kvSetIfAbsent(lockKey(j.box), '1', LOCK_TTL))) return j; // سؤال آخر ينشرها الآن
    const first = !j.tried;
    j.tried = 1; // يبقى وإن رمى النداء: نتيجته غير معروفة
    const pub = await graph('POST', G() + '/' + c.ig + '/media_publish', { creation_id: j.box, access_token: c.token });
    if (!pub.ok || !pub.j.id) {
      if (refused(pub)) return first ? Object.assign(clear(j), { state: 'fail', error: errOf(pub), code: codeOf(pub) }) : unsure(j, pub);
      return j; // غير معروف: القفل يموت بعد دقيقتين وحالة الحاوية تحسم (PUBLISHED أو تُعاد)
    }
    j.media = String(pub.j.id);
  }
  clear(j);
  const m = await graph('GET', G() + '/' + j.media, { fields: 'permalink', access_token: c.token });
  return Object.assign(j, { state: 'ok', url: (m.ok && typeof m.j.permalink === 'string' && m.j.permalink.startsWith('https://')) ? m.j.permalink : '' });
}

/** منصّات Meta في طلب: تسأل وتحدّث وتحرّر ما ثبت أنّه لم يُنشر. ← { rec, results, wait } أو null بلا سجلّ. */
async function check(reqId) {
  const rec = readJSON(await kvGetRaw(recKey(reqId)));
  if (!rec) return null;
  const c = await creds();
  const young = Date.now() - Number(rec.at || 0) < GRACE_MS;
  const running = young && Object.values(rec.jobs || {}).some((j) => j && j.new); // النشر ما زال يعمل: لا كتابة فوق سجلّه
  const results = [];
  let changed = false;
  for (const p of Object.keys(rec.jobs || {})) {
    let j = rec.jobs[p] || { state: 'fail', error: 'lost' };
    const before = JSON.stringify(j);
    if (j.new && !young) { // الدالّة ماتت قبل نتيجة المنصّة: حاوية لم تُنشر قطّ تتحرّر، وفيسبوك يُلقى في الصفحة
      j = p === 'instagram' ? { state: 'fail', error: 'lost' } : { state: 'wait', unsure: 1 };
    }
    if (j.state === 'wait' && !j.new && c) {
      j = await poll(p, j, c, rec).catch((e) => { logErr('poll ' + p, e); return j; });
      if (j.code === 190) await kvSetRaw(BAD, '1');
    }
    if (j.state === 'fail' && (await kvGetRaw(sentKey(rec.vid, p))) === reqId) await kvDel(sentKey(rec.vid, p));
    if (JSON.stringify(j) !== before) { rec.jobs[p] = j; changed = true; }
    const shown = j.state === 'wait' && j.err ? 'fail' : j.state; // غير محسوم طال: «ما نزل» برمزه، ويبقى محجوزًا ويُعاد سؤاله
    results.push({ platform: p, state: shown, url: j.url || '', error: shown === 'fail' ? String(j.error || j.err || '') : '' });
  }
  if (changed && !running) await kvSetRaw(recKey(reqId), JSON.stringify(rec), SENT_TTL);
  return { rec, results, wait: results.some((x) => x.state === 'wait') };
}

/** فتح اللوحة يكمل ما عُلّق: حاوية جهزت والتبويب مغلق تُنشر، وما حُسم يخرج من القائمة. */
async function settle() {
  const l = readJSON(await kvGetRaw(OPEN));
  if (!Array.isArray(l) || !l.length) return;
  const done = [];
  for (const r of l.slice(0, 5)) {
    const x = await check(String(r)).catch((e) => { logErr('settle', e); return undefined; });
    if (x === undefined) continue;
    if (!x || !Object.values(x.rec.jobs || {}).some((j) => j && j.state === 'wait') || Date.now() - Number(x.rec.at || 0) > OPEN_AGE) done.push(r);
  }
  if (!done.length) return;
  const now = readJSON(await kvGetRaw(OPEN)); // قائمة اليوم: طلب أُضيف أثناء الحسم لا يضيع
  await kvSetRaw(OPEN, JSON.stringify((Array.isArray(now) ? now : []).filter((x) => !done.includes(x))), SENT_TTL);
}

async function status(res, body, d) {
  const reqId = String(body.request || '');
  const x = await check(reqId);
  if (!x) return res.status(200).json({ ok: true, state: 'fail', lost: true, results: [] });
  const { rec, results } = x;
  // منصّات الوسيط: حالته بطريقه القديم حرفيًّا (المهلة، «ضاع»، «رآه حيًّا»)، ثمّ ما تقوله اللوحة القديمة لكلّ منصّة
  let upWait = false;
  if (rec.upErr) for (const p of rec.upPlats || []) results.push({ platform: p, state: 'fail', url: '', error: rec.upErr });
  else if (rec.up) {
    const s = d.upCheck ? await d.upCheck(rec.up).catch((e) => { logErr('up-status', e); return null; }) : null;
    const ok = !!(s && s.ok);
    const rows = ok ? (s.results || []).filter((y) => (rec.upPlats || []).includes(y.platform)) : [];
    for (const p of rec.upPlats || []) {
      const y = rows.find((z) => z.platform === p);
      if (y) results.push(y);
      else if (ok && (s.lost || s.state === 'fail')) results.push({ platform: p, state: 'fail', url: '', error: s.lost ? 'lost' : '' }); // ما وصل، أو مهمّة فشلت قبل أن تبلغه
      else results.push({ platform: p, state: 'wait', url: '', error: '' });
    }
    upWait = !ok || s.state === 'wait'; // «اكتمل» بلا صفّ: اللوحة القديمة تتوقّف وتفكّ القفل — هنا مثلها
  }
  const wait = x.wait || upWait;
  return res.status(200).json({ ok: true, state: wait ? 'wait' : 'done', results });
}

module.exports = { configured, isReq, connect, callback, accounts, publish, status, metaState, DIRECT, SCOPES, redirectUri };
