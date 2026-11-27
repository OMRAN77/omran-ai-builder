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
   لا اسم مزوّد ولا رابط ولا توكن في أيّ ردّ أو سجلّ؛ الأخطاء رموز (e190…). المفاتيح تُقرأ داخل الدوالّ لا في نطاق الوحدة. */
const crypto = require('node:crypto');
const { kvGetRaw, kvSetRaw, kvSetIfAbsent, kvDel } = require('./kv.js');
const net = require('./social-net.js'); // v-social-net: LinkedIn ويوتيوب وتيك توك بالنمط نفسه

const DIRECT = ['instagram', 'facebook'];
const ORDER = ['instagram', 'facebook', 'tiktok', 'youtube', 'linkedin', 'x', 'threads']; // ترتيب اللوحة كما في social-publish
const SCOPES = 'pages_show_list,pages_read_engagement,pages_manage_posts,business_management,instagram_basic,instagram_content_publish';
const SENT_TTL = 7 * 86400;
const STATE_TTL = 600;
const LOCK_TTL = 120; // نشر حاوية إنستغرام: سؤال واحد ينشر، وقفل يموت مع دالّة ماتت فتعيد التالية
const CRED = 'socdir:meta';
const BAD = 'socdir:meta:reauth';
const LAST = 'socdir:meta:last'; // آخر نتيجة رجوع من Meta
const CHECK = 'socdir:meta:check'; // فحص سرّ التطبيق (عشر دقائق)
const stateKey = (s) => 'socdir:state:' + s;
const recKey = (r) => 'socdir:req:' + r;
const sentKey = (v, p) => 'socdir:sent:' + v + ':' + p;
const lockKey = (c) => 'socdir:igpub:' + c;
const jobKey = (r, p) => 'socdir:job:' + r + ':' + p; // v-social-net: حالة منصّة مباشرة في مفتاحها — نداءان متزامنان لا يمحو أحدهما تقدّم الآخر
const REQ = /^sd-[0-9a-f]{24}-[0-9a-f]{8}$/;

const env = (k) => String(process.env[k] || '').trim();
const ver = () => env('META_GRAPH_VERSION') || 'v23.0';
const G = () => 'https://graph.facebook.com/' + ver();
const GV = () => 'https://graph-video.facebook.com/' + ver();
const configured = () => !!(env('META_APP_ID') && env('META_APP_SECRET'));
const active = () => configured() || net.any(); // أيّ منصّة مباشرة مضبوطة
const metaPlats = () => (configured() ? DIRECT : []);
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
  return res.status(200).json({ ok: true, url: 'https://www.facebook.com/' + ver() + '/dialog/oauth?' + q, host: 'www.facebook.com' });
}

/** رجوع Meta (GET): الحالة من KV وحدها تثبت أنّ المالك بدأ الربط — لا جلسة في هذا الطلب. */
async function callback(req, res) {
  const q = req.query || {};
  const back = async (why, keep) => {
    // v-social-direct-why: آخر نتيجة ربط تبقى أسبوعًا وتظهر جنب المنصّة في اللوحة — لا يعتمد السبب على لقطة شاشة في لحظتها
    if (keep !== false) await kvSetRaw(LAST, JSON.stringify({ why: String(why).slice(0, 40), at: Date.now() }), 7 * 86400).catch((e) => logErr('last', e));
    res.setHeader('Location', site() + '/?socpub=' + why); res.setHeader('Cache-Control', 'no-store'); return res.status(302).end();
  };
  const st = String(q.state || '');
  if (!/^[0-9a-f]{32}$/.test(st)) return await back('fail', false); // طلب بلا حالة المالك لا يكتب «آخر نتيجة»
  const who = await kvGetRaw(stateKey(st));
  await kvDel(stateKey(st));
  if (!who || !require('./_owner.js').isOwnerName(who)) return await back('fail', false);
  if (q.error || !q.code) return await back('denied');
  try {
    const id = env('META_APP_ID'), secret = env('META_APP_SECRET');
    const a = await graph('GET', G() + '/oauth/access_token', { client_id: id, client_secret: secret, redirect_uri: redirectUri(), code: String(q.code) });
    // v-social-direct-step: الرمز يحمل الخطوة — «e1» وحده ما يقول أين (سرّ التطبيق الخاطئ يرجع code 1 عند تبديل الرمز)
    if (!a.ok || !a.j.access_token) { logErr('callback', 'token ' + errOf(a)); return await back('fail-token-' + errOf(a)); }
    const l = await graph('GET', G() + '/oauth/access_token', { grant_type: 'fb_exchange_token', client_id: id, client_secret: secret, fb_exchange_token: a.j.access_token });
    const user = (l.ok && l.j.access_token) || a.j.access_token;
    // توكن الصفحة المأخوذ بتوكن مستخدم طويل لا ينتهي
    const FIELDS = 'id,name,access_token,instagram_business_account{id,username}';
    let pg = await graph('GET', G() + '/me/accounts', { fields: FIELDS, limit: '50', access_token: user });
    // الحقل المتداخل (إنستغرام) قد يُسقط القائمة كلّها: مرّة ثانية بلاه، وإنستغرام يُسأل لكلّ صفحة وحدها تحت
    if (!pg.ok) pg = await graph('GET', G() + '/me/accounts', { fields: 'id,name,access_token', limit: '50', access_token: user });
    if (!pg.ok) { logErr('callback', 'pages ' + errOf(pg)); return await back('fail-pages-' + errOf(pg)); } // خطأ Graph ليس «لا صفحة»
    const pages = ((pg.j && pg.j.data) || []).filter((x) => x && x.id && x.access_token);
    /* v-social-direct-keep (مراجعة مستقلّة ٢٧ نوفمبر): في تطبيقات «تسجيل دخول فيسبوك للأعمال» وللصفحة المملوكة لحافظة أعمال يرجع
       ‎/me/accounts فارغًا مع أنّ الصفحة مختارة — فالصفحات الممنوحة من debug_token (granular_scopes.target_ids)، ثمّ صفحات حافظات الأعمال. */
    if (!pages.length) {
      const dbg = await graph('GET', G() + '/debug_token', { input_token: user, access_token: id + '|' + secret });
      const d = (dbg.j && dbg.j.data) || {};
      const ids = [...new Set((d.granular_scopes || []).filter((x) => /^pages_/.test(String(x.scope || ''))).flatMap((x) => x.target_ids || []))].slice(0, 10);
      for (const pid of ids) {
        const one = await graph('GET', G() + '/' + encodeURIComponent(pid), { fields: FIELDS, access_token: user });
        if (one.ok && one.j.id && one.j.access_token) pages.push(one.j);
      }
      if (!pages.length) {
        const b = await graph('GET', G() + '/me/businesses', { fields: 'owned_pages{' + FIELDS + '},client_pages{' + FIELDS + '}', access_token: user });
        for (const biz of (b.j && b.j.data) || []) for (const k of ['owned_pages', 'client_pages']) {
          for (const x of ((biz[k] || {}).data) || []) if (x && x.id && x.access_token && !pages.some((y) => y.id === x.id)) pages.push(x);
        }
      }
      if (!pages.length) logErr('callback', 'no pages; granted=' + (Array.isArray(d.scopes) ? d.scopes.join(',') : '?'));
    }
    for (const x of pages.slice(0, 10)) { // صفحة بلا حقل إنستغرام (القائمة الخفيفة): يُسأل عنه وحده، وفشله لا يُسقط الربط
      if (x.instagram_business_account) continue;
      const ig = await graph('GET', G() + '/' + encodeURIComponent(x.id), { fields: 'instagram_business_account{id,username}', access_token: x.access_token }).catch(() => null);
      if (ig && ig.ok && ig.j.instagram_business_account) x.instagram_business_account = ig.j.instagram_business_account;
    }
    const om = (x) => /om\s*ai/i.test((x && x.name) || '');
    const igOf = (x) => x && x.instagram_business_account && x.instagram_business_account.id;
    const pick = pages.find((x) => igOf(x) && om(x)) || pages.find(igOf) || pages.find(om) || pages[0];
    if (!pick) return await back('no_page');
    const rec = { page: pick.id, pageName: pick.name || '', token: pick.access_token, ig: igOf(pick) || '', igName: (pick.instagram_business_account && pick.instagram_business_account.username) || '', at: Date.now() };
    await kvSetRaw(CRED, require('./_emailCrypto.js').encrypt(JSON.stringify(rec)));
    await kvDel(BAD); await kvDel(CHECK);
    return await back(rec.ig ? 'ok' : 'no_ig');
  } catch (e) {
    logErr('callback', e);
    return await back('fail');
  }
}

/** الحسابات: المباشر أوّلًا، ثمّ ما عند الوسيط لغير منصّاته (إن وُجد مفتاحه ونجح سؤاله). */
async function accounts(res, upAccounts) {
  // v-social-direct-keep (المالك ٢٧ نوفمبر: «أريد النشر نفس الأشياء الموجودة»): الربط المباشر لا يأخذ منصّة من الوسيط قبل أن ينربط فعلًا —
  // كان ضبط مفاتيح Meta وحده يقلب إنستغرام الموصول عند الوسيط إلى «يحتاج إعادة ربط». الآن: الموصول مباشرة + كلّ الموصول عند الوسيط،
  // و«يحتاج ربط» لما ليس موصولًا في أيّ منهما؛ وconnect لمنصّات Meta الظاهرة «يحتاج ربط» وحدها (مدخل الربط المباشر).
  const m = configured() ? await metaState() : { on: [] };
  const n = await net.state();
  const mine = metaPlats().concat(n.on, n.need); // كلّ منصّة مباشرة مضبوطة
  const u = upAccounts ? await upAccounts().catch((e) => { logErr('up-accounts', e); return null; }) : null;
  const on = ORDER.filter((p) => m.on.includes(p) || n.on.includes(p) || ((u && u.on) || []).includes(p));
  const reauth = ORDER.filter((p) => !on.includes(p) && (mine.includes(p) || ((u && u.reauth) || []).includes(p)));
  const connect = reauth.filter((p) => mine.includes(p));
  const why = connect.some((p) => DIRECT.includes(p)) ? await metaWhy() : '';
  const whyBy = {};
  for (const p of connect) { const w = DIRECT.includes(p) ? why : (n.whyBy[p] || ''); if (w) whyBy[p] = w; }
  if (u && u.paused) for (const p of connect) if (!whyBy[p]) whyBy[p] = 'paused-402'; // v-socpub-paused: الوسيط موقوف — الربط المباشر مدخلها
  return res.status(200).json({ ok: true, on, reauth, connect, why, whyBy });
}

/** لماذا منصّات Meta غير مربوطة: سرّ التطبيق يُفحص (رمز تطبيق = المعرّف|السرّ) ويُخزَّن عشر دقائق، ثمّ آخر نتيجة رجوع، ثمّ توكن منتهٍ. رموز لا نصوص. */
async function metaWhy() {
  let chk = await kvGetRaw(CHECK).catch(() => null);
  if (!chk) {
    const id = env('META_APP_ID'), secret = env('META_APP_SECRET');
    const r = await graph('GET', G() + '/' + encodeURIComponent(id), { fields: 'id', access_token: id + '|' + secret }).catch(() => null);
    chk = !r ? 'net' : (r.ok && String(r.j.id) === id ? 'ok' : 'secret-' + errOf(r));
    if (chk !== 'net') await kvSetRaw(CHECK, chk, 600).catch(() => null);
  }
  if (chk !== 'ok' && chk !== 'net') return chk;
  if (await kvGetRaw(BAD).catch(() => null)) return 'expired';
  const last = readJSON(await kvGetRaw(LAST).catch(() => null));
  return last && last.why && last.why !== 'ok' ? last.why : '';
}

/** يُنشئ منشور منصّة: فيسبوك فيديو صفحة، وإنستغرام حاوية ريلز (تُنشر في status حين تجهز). */
async function start(p, c, cap, file) {
  if (p === 'facebook') {
    const r = await graph('POST', GV() + '/' + c.page + '/videos', { file_url: file, title: cap.yt, description: cap.cap, access_token: c.token });
    return r.ok && r.j.id ? { state: 'wait', id: String(r.j.id) } : { state: 'fail', error: errOf(r), code: r.j.error && r.j.error.code };
  }
  const r = await graph('POST', G() + '/' + c.ig + '/media', { media_type: 'REELS', video_url: file, caption: cap.cap, share_to_feed: 'true', access_token: c.token });
  return r.ok && r.j.id ? { state: 'wait', box: String(r.j.id) } : { state: 'fail', error: errOf(r), code: r.j.error && r.j.error.code };
}

async function publish(res, body, d) {
  const id = String(body.id || '');
  if (!/^[0-9a-f]{24}$/.test(id)) return fail(res, 400, 'bad_id');
  const vid = /^[0-9a-f]{24}$/.test(String(body.vid || '')) ? String(body.vid) : id;
  const plats = [...new Set((Array.isArray(body.platforms) ? body.platforms : []).map((p) => String(p).toLowerCase()))];
  const m = configured() ? await metaState() : { on: [], c: null };
  const n = await net.state();
  const mine0 = plats.filter((p) => m.on.includes(p) || n.on.includes(p));
  const rest = plats.filter((p) => !mine0.includes(p));
  if (!mine0.length) return d.upPublish ? d.upPublish(body) : fail(res, 503, 'no_key'); // لا شيء مباشر: الطريق القديم كما هو
  const cap = d.captions(body.caption);
  if (!cap.cap) return fail(res, 400, 'no_caption');
  const file = await d.fileOf(id);
  if (!(typeof file === 'string' && file.startsWith('https://'))) return fail(res, 404, 'no_file');
  const reqId = 'sd-' + id + '-' + crypto.randomBytes(4).toString('hex');
  const already = [], held = {}, jobs = {};
  for (const p of mine0) {
    if (await kvSetIfAbsent(sentKey(vid, p), reqId, SENT_TTL)) jobs[p] = null;
    else { already.push(p); held[p] = String((await kvGetRaw(sentKey(vid, p))) || ''); }
  }
  // ما بقي للوسيط يُرسل بطريقه القديم ويُتابَع ضمن هذا الطلب
  let up = '', upPlats = [], upErr = '';
  if (rest.length) {
    if (!d.upCapture) upErr = 'no_key';
    else {
      const u = await d.upCapture(Object.assign({}, body, { platforms: rest })).catch((e) => { logErr('up-publish', e); return { body: { ok: false, error: 'retry' } }; });
      const b = (u && u.body) || {};
      if (b.ok) {
        for (const p of b.already || []) already.push(p);
        Object.assign(held, b.held || {});
        if (!b.again) { up = String(b.request || ''); upPlats = rest.filter((p) => !(b.already || []).includes(p)); }
      } else { upErr = String(b.error || 'publish'); upPlats = rest; }
    }
    if (upErr && !upPlats.length) upPlats = rest;
  }
  for (const p of Object.keys(jobs)) {
    if (net.PLATS.includes(p)) { jobs[p] = { state: 'wait', stage: 'queued', id, cap: { cap: cap.cap, yt: cap.yt } }; continue; } // الرفع في status — منصّة لكلّ نداء
    const j = await start(p, m.c, cap, file).catch((e) => { logErr('start ' + p, e); return { state: 'fail', error: 'retry' }; });
    if (j.code === 190) await kvSetRaw(BAD, '1');
    if (j.state === 'fail') await kvDel(sentKey(vid, p)); // ما نُشر يتحرّر فتصحّ محاولة ثانية
    jobs[p] = j;
  }
  if (!Object.keys(jobs).length && !up && !upErr) return res.status(200).json({ ok: true, again: true, already, held, request: Object.values(held).find(Boolean) || '' });
  await kvSetRaw(recKey(reqId), JSON.stringify({ at: Date.now(), vid, jobs, up, upPlats, upErr }), SENT_TTL);
  return res.status(200).json({ ok: true, request: reqId, already, held });
}

/** يسأل عن منشور منصّة واحدة ويحدّث حالته؛ إنستغرام الجاهز يُنشر هنا مرّة واحدة. */
async function poll(p, j, c) {
  if (p === 'facebook') {
    const r = await graph('GET', G() + '/' + j.id, { fields: 'status,permalink_url', access_token: c.token });
    if (!r.ok) return r.j.error && r.j.error.code === 190 ? Object.assign(j, { state: 'fail', error: errOf(r), code: 190 }) : j;
    const s = String((r.j.status && r.j.status.video_status) || '').toLowerCase();
    const url = r.j.permalink_url ? (String(r.j.permalink_url).startsWith('http') ? r.j.permalink_url : 'https://www.facebook.com' + r.j.permalink_url) : '';
    if (s === 'ready') return Object.assign(j, { state: 'ok', url });
    if (s === 'error' || s === 'expired') return Object.assign(j, { state: 'fail', error: 'e-' + s });
    return j;
  }
  if (!j.media) {
    const r = await graph('GET', G() + '/' + j.box, { fields: 'status_code', access_token: c.token });
    if (!r.ok) return r.j.error && r.j.error.code === 190 ? Object.assign(j, { state: 'fail', error: errOf(r), code: 190 }) : j;
    const s = String(r.j.status_code || '').toUpperCase();
    if (s === 'ERROR' || s === 'EXPIRED') return Object.assign(j, { state: 'fail', error: 'e-' + s.toLowerCase() });
    if (s === 'PUBLISHED') return Object.assign(j, { state: 'ok', url: '' });
    if (s !== 'FINISHED') return j;
    if (!(await kvSetIfAbsent(lockKey(j.box), '1', LOCK_TTL))) return j; // سؤال آخر ينشرها الآن
    const pub = await graph('POST', G() + '/' + c.ig + '/media_publish', { creation_id: j.box, access_token: c.token });
    if (!pub.ok || !pub.j.id) return j; // القفل يموت بعد دقيقتين فيعيد السؤال التالي
    j.media = String(pub.j.id);
  }
  const m = await graph('GET', G() + '/' + j.media, { fields: 'permalink', access_token: c.token });
  return Object.assign(j, { state: 'ok', url: (m.ok && typeof m.j.permalink === 'string' && m.j.permalink.startsWith('https://')) ? m.j.permalink : '' });
}

async function status(res, body, d) {
  const reqId = String(body.request || '');
  const rec = readJSON(await kvGetRaw(recKey(reqId)));
  if (!rec) return res.status(200).json({ ok: true, state: 'fail', lost: true, results: [] });
  const c = await creds();
  const results = [];
  let changed = false;
  const ctx = { busy: false };
  for (const p of Object.keys(rec.jobs || {})) {
    const isNet = net.PLATS.includes(p);
    let j = (isNet && readJSON(await kvGetRaw(jobKey(reqId, p)))) || rec.jobs[p] || { state: 'fail', error: 'lost' };
    if (j.state === 'wait' && (c || isNet)) {
      const before = JSON.stringify(j);
      j = await (isNet ? net.poll(p, j, reqId, d, ctx) : poll(p, j, c)).catch((e) => { logErr('poll ' + p, e); return j; });
      if (j.code === 190) await kvSetRaw(BAD, '1');
      if (j.state === 'fail' && (await kvGetRaw(sentKey(rec.vid, p))) === reqId) await kvDel(sentKey(rec.vid, p));
      if (JSON.stringify(j) !== before) { rec.jobs[p] = j; changed = true; if (isNet) await kvSetRaw(jobKey(reqId, p), JSON.stringify(j), SENT_TTL); }
    }
    results.push({ platform: p, state: j.state, url: j.url || '', error: j.state === 'wait' ? '' : String(j.error || '') }); // ok قد تحمل ملاحظة: private · inbox
  }
  let upWait = false;
  if (rec.upErr) for (const p of rec.upPlats || []) results.push({ platform: p, state: 'fail', url: '', error: rec.upErr });
  else if (rec.up && d.upStatus) {
    const s = await d.upStatus(rec.up).catch(() => null);
    const rows = s && s.ok ? d.statusOf(s.j).results.filter((x) => (rec.upPlats || []).includes(x.platform)) : [];
    for (const p of rec.upPlats || []) {
      const x = rows.find((y) => y.platform === p);
      if (x) results.push(x); else { results.push({ platform: p, state: 'wait', url: '', error: '' }); upWait = true; }
    }
  }
  if (changed) await kvSetRaw(recKey(reqId), JSON.stringify(rec), SENT_TTL);
  const wait = upWait || results.some((x) => x.state === 'wait');
  return res.status(200).json({ ok: true, state: wait ? 'wait' : 'done', results });
}

module.exports = { configured, active, isReq, connect, callback, accounts, publish, status, metaState, DIRECT, SCOPES, redirectUri, net };
