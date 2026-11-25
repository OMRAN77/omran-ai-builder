'use strict';
/* v-talk-contacts (المالك ٢٤ نوفمبر: «كيف اقدر اضيف الارقام» ← «جهات اتصال مثل بوتم»): جهات اتصال «غرفة الربع».
   كلّ مستخدم يحفظ أرقام ربعه، ويرى من منهم على التطبيق، ويتّصل به: تُفتح غرفة ويصله إشعار «فلان يتّصل فيك»، وحين يردّ يدخل
   بلا انتظار موافقة (الدعوة نفسها هي الموافقة). «على التطبيق» = رقم ربطه صاحبه بحسابه وأثبته عبر واتساب/تيليجرام (phone-link)،
   فلا يدّعي أحد رقم غيره. الحفظ في الخادم لكلّ حساب؛ الرقم لا يُكشف لغير من أضافه، واسم الحساب لا يُكشف أبدًا (الاسم الذي
   كتبه المضيف هو ما يُعرض). الإضافة محدودة في اليوم (منع مسح الأرقام لمعرفة من على التطبيق).

   عبر act في talk-room.js (POST /api/system?action=room) — كلّها تحتاج جلسة (who):
     contacts     {}                        -> { me: { phone: '+971•••••12' | null, name }, list: [{ phone, name, onApp }] }   (name: اسمه في الحساب ليكون اسمه في الغرفة)
                                               (no number: me.linkVia = the channels the room can link it through — v-talk-room-phone)
     contact-add  { phone, name }           -> { ok, contact }       | bad-phone | self | full | slow-down
     contact-del  { phone }                 -> { ok }
     ring         { code, key, phone }      -> { ok, pushed }        صاحب الغرفة يتّصل بجهة على التطبيق (غرفته وبسرّها)
                  { code, key, callee }     -> { ok, pushed }        أو برمز المتّصَل به من مطابقة جهات الهاتف (v-talk-contacts-sync، talk-sync.js):
                                                                     الرمز مربوط بالمتّصل، وصاحب الرقم يُعاد فحصه — وإلّا not-on-app
     rings        {}                        -> { ring: { code, from } | null }   مكالمة واردة لهذا الحساب (تُقرأ والصفحة مفتوحة)
     ring-end     { code }                  -> { ok }                رفض/انتهى: تُمحى المكالمة الواردة */
const MAX_CONTACTS = 200, ADDS_PER_DAY = 40, RING_TTL = 60;
const listKey = (u) => 'talk/contacts/' + encodeURIComponent(u);
const ringKey = (u) => 'talk/ring/' + encodeURIComponent(u);
const cleanLabel = (v) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069<>&"'`]/g, '').trim().slice(0, 30);

function deps(o) {
  const x = o || {};
  return {
    pl: x.phoneLink || require('./phone-link.js'),
    auth: x.auth || require('./auth.js'),
    push: x.push || defaultPush,
  };
}
/** Web push to one user (the same subscription record as push-subscribe.js). Resolves true when sent. */
async function defaultPush(K, username, payload) {
  const env = process.env;
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return false;
  let sub = null;
  try { sub = await K.kvGetJSON('db/push-subs/' + encodeURIComponent(username) + '.json'); } catch (e) { sub = null; }
  if (!sub || !sub.endpoint) return false;
  try {
    const webpush = require('web-push');
    webpush.setVapidDetails('mailto:ommntr77@gmail.com', env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    await webpush.sendNotification(sub, JSON.stringify(payload));
    return true;
  } catch (e) { require('./_swallow.js').swallow(e, 'talk-contacts:push'); return false; }
}

async function readList(K, u) {
  try { const raw = await K.kvGetRaw(listKey(u)); const l = raw ? JSON.parse(raw) : []; return Array.isArray(l) ? l.filter((c) => c && typeof c.phone === 'string') : []; } catch (e) { return []; }
}
const writeList = (K, u, l) => K.kvSetRaw(listKey(u), JSON.stringify(l.slice(0, MAX_CONTACTS)));

/** The live account behind a verified phone, or null (never the account name to the client). */
async function ownerOf(d, phone) { const r = await d.pl.phoneOwner(phone); return r ? r.key : null; }

/** One contacts operation for the signed-in user `who`. Returns { status, json } or null when op is not a contacts op. */
async function contactsAct(b, ip, K, who, opts) {
  const op = String(b.op || '');
  if (!['contacts', 'contact-add', 'contact-del', 'ring', 'rings', 'ring-end'].includes(op)) return null;
  const bad = (error, status = 400) => ({ status, json: { error } });
  if (!who) return bad('login', 401);
  const me = String(who).trim().toLowerCase();
  const d = deps(opts);

  if (op === 'contacts') {
    const list = await readList(K, me);
    let myPhone = null, myName = me;
    let heal = null, uRec = null;
    try { const u = await d.auth.getUser(me); uRec = u; myPhone = u && u.phone ? d.pl.maskPhone(u.phone) : null; myName = cleanLabel((u && (u.displayName || u.name)) || me) || me; heal = u && u.phone ? u.phone : null; } catch (e) { myPhone = null; }
    // v-talk-contacts-sync: ترميم ذاتيّ لفهرس بصمة رقمه (من ربط رقمه قبل الفهرس) — SETNX لا يكتب فوق شيء
    if (heal) { try { await K.kvSetIfAbsent('db/phone-hash/' + require('./phone-link.js').phoneHash(heal), JSON.stringify({ username: me })); } catch (e) { require('./_swallow.js').swallow({ message: 'hash self-heal failed' }, 'talk-contacts:heal'); /* رسالة ثابتة: لا بصمة في السجلّ */ } }
    const out = [];
    for (const c of list) out.push({ phone: c.phone, name: cleanLabel(c.name) || c.phone, onApp: !!(await ownerOf(d, c.phone)) });
    // v-talk-room-phone: no number yet — the free channels the room can link it through right there (one tap, like WhatsApp's first step)
    const meOut = { phone: myPhone, name: myName };
    if (!myPhone) {
      meOut.linkVia = ['whatsapp', 'telegram'].filter((ch) => { try { return !!(d.pl.channelReady && d.pl.channelReady(ch, 'link')); } catch (e) { return false; } });
      // the number becomes a way back into the account, so linking asks for the password (auth.js recoveryPasswordOk) — the box shows up front
      try { meOut.linkPw = !!(uRec && require('./account-delete.js').needsPassword(uRec)); } catch (e) { meOut.linkPw = true; }
    }
    return { status: 200, json: { me: meOut, list: out } };
  }
  if (op === 'contact-add') {
    const phone = d.pl.normalizePhone(b.phone);
    if (!phone) return bad('bad-phone');
    const day = 'rl:talk-contacts:add:' + me + ':' + new Date().toISOString().slice(0, 10);
    const n = Number(await K.kvIncr(day)); if (n === 1) await K.kvExpire(day, 2 * 86400);
    if (n > ADDS_PER_DAY) return bad('slow-down', 429);
    const owner = await ownerOf(d, phone);
    if (owner === me) return bad('self');
    const list = await readList(K, me);
    const name = cleanLabel(b.name) || phone;
    const i = list.findIndex((c) => c.phone === phone);
    if (i >= 0) list[i].name = name; else { if (list.length >= MAX_CONTACTS) return bad('full'); list.unshift({ phone, name, at: Date.now() }); }
    await writeList(K, me, list);
    return { status: 200, json: { ok: true, contact: { phone, name, onApp: !!owner } } };
  }
  if (op === 'contact-del') {
    const phone = d.pl.normalizePhone(b.phone);
    const list = await readList(K, me);
    await writeList(K, me, list.filter((c) => c.phone !== phone));
    return { status: 200, json: { ok: true } };
  }
  if (op === 'ring') {
    let callee = null;
    if (b.callee) {      // v-talk-contacts-sync: برمز المطابقة — لا قائمة في الخادم، والرمز نفسه دليل أنّ الرقم في هاتفه
      if (!/^\d{4}$/.test(String(b.code || ''))) return bad('bad-phone');
      if (!(await opts.ownsRoom(String(b.code), b.key))) return bad('key', 403);
      callee = await require('./talk-sync.js').calleeFor(b.callee, me, d.auth);
      if (!callee) return bad('not-on-app', 404);      // رمز لغيره أو منتهٍ، أو غيّر صاحبه رقمه أو حذف حسابه
      if (callee === me) return bad('self');
    } else {
      const phone = d.pl.normalizePhone(b.phone);
      if (!phone || !/^\d{4}$/.test(String(b.code || ''))) return bad('bad-phone');
      if (!(await opts.ownsRoom(String(b.code), b.key))) return bad('key', 403);
      const list = await readList(K, me);
      const c = list.find((x) => x.phone === phone);
      if (!c) return bad('not-contact', 404);           // يتّصل فقط بمن في جهاته
      callee = await ownerOf(d, phone);
      if (!callee) return bad('not-on-app', 404);
    }
    const rl = 'rl:talk-contacts:ring:' + me + ':' + Math.floor(Date.now() / 60000);
    const n = Number(await K.kvIncr(rl)); if (n === 1) await K.kvExpire(rl, 120);
    if (n > 6) return bad('slow-down', 429);
    let from = me;
    try { const u = await d.auth.getUser(me); from = cleanLabel((u && (u.displayName || u.name)) || me) || me; } catch (e) { from = me; }
    await K.kvSetRaw(ringKey(callee), JSON.stringify({ code: String(b.code), from, by: me, at: Date.now() }), RING_TTL);
    const pushed = await d.push(K, callee, { title: '📞 ' + from, body: 'يتّصل فيك في غرفة الربع — اضغط للردّ', url: '/room?c=' + b.code + '&ring=1', tag: 'talk-ring' });
    return { status: 200, json: { ok: true, pushed: !!pushed } };
  }
  if (op === 'rings') {
    let r = null;
    try { r = JSON.parse((await K.kvGetRaw(ringKey(me))) || 'null'); } catch (e) { r = null; }
    return { status: 200, json: { ring: r && /^\d{4}$/.test(String(r.code)) ? { code: String(r.code), from: cleanLabel(r.from) || '…' } : null } };
  }
  // ring-end
  await K.kvPipeline([['DEL', ringKey(me)]]);
  return { status: 200, json: { ok: true } };
}

/** Is `who` the person this room is calling right now? (they join without waiting for the host) */
async function invited(K, who, code) {
  if (!who) return false;
  try { const r = JSON.parse((await K.kvGetRaw(ringKey(String(who).trim().toLowerCase()))) || 'null'); return !!(r && String(r.code) === String(code)); } catch (e) { return false; }
}

module.exports = { contactsAct, invited, MAX_CONTACTS, ADDS_PER_DAY, RING_TTL };
