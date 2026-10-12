// v-atomic-quota: الحصّة اليوميّة الذرّيّة لأدوات الصور والفيديو (الديكور، الأزياء، الاستوديو، البورتريه،
// المقاولات، السيارات، الفيديو). كانت check*Quota تقرأ ملفّ JSON وconsume* تقرأه ثمّ تعدّله ثمّ تكتبه بعد
// نجاح التوليد بثوانٍ — فعشرة طلبات متزامنة من حساب جديد مرّت كلّها والعدّاد بقي ١ والسقف ٣.
// الآن:
//   • check(…, res) يحجز مقعدًا بـINCR ذرّيّ على مفتاح يوميّ بانتهاء قبل التوليد؛ ما يتجاوز السقف يُرفض
//     وتُرجَع زيادته (DECR) — فلا يعبر السقفَ متزامنٌ أبدًا.
//   • consume بعد النجاح يثبّت الحجز بلا أمر جديد؛ والطلب الذي يخرج ردّه بلا consume (فشل المولّد، خطأ،
//     رفض لاحق) يُردّ حجزه **قبل** أن يخرج ردّه (لا بعده: الدالّة قد تُجمَّد بعد الردّ) — فالفشل لا يحرق
//     حصّة كما كان. وما تقتله المهلة (maxDuration ٣٠٠ث) يُردّ حجزه قبلها بمؤقّت.
//   • check بلا res (مسارات الاقتراح) قراءة مجرّدة لا تحجز، كما كانت.
//   • يوم الترحيل: أوّل لمسة لمفتاح اليوم تبذره (SET NX) بعدّ اليوم من ملفّ JSON القديم، فلا يوم مجّانيّ.
//   • عطل KV = مفتوح كما كان (القراءة القديمة ترجع null فالعدّ ٠، والكتابة تُبتلع)، ولا حجز يُردّ.
//   • v-farm-gate: سقف صفر (حساب فوق سقف هديّة شبكته — free-tier.js) يُرفض قبل أيّ أمر KV كـtakeTally، فلا يفتحه عطل.
//     ولـ{ free } (مجّانيّ غير دافع) وحده: امتلاء القاعدة أو سقف FREE_MEDIA_DAILY مضبوط لا يُعدّ = مغلق، ومقعد من السقف
//     الكلّيّ يركب الحجز نفسه (يُثبَّت بالنجاح ويُردّ بالفشل والمهلة). المشترك وباقة الوسائط: كما كانا.
const { kvGetJSON, kvGetRaw, kvSetIfAbsent, kvIncr, kvIncrBy, kvDecrBy } = require('./kv.js');

const TALLY_TTL_SEC = 172800; // يومان: المفتاح مؤرَّخ فلا يتراكم
const HOLD_MAX_MS = 270000; // قبل maxDuration (٣٠٠ث في vercel.json) بهامش

function todayStr() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

function tallyKey(ns, username) {
  return 'db/' + ns + '-usage/tally/' + encodeURIComponent(username) + '/' + todayStr();
}

// ملفّ اليوم القديم (db/<ns>-usage/<user>.json) — يُقرأ مرّة واحدة لبذر مفتاح اليوم.
async function legacyToday(ns, username) {
  const u = await kvGetJSON('db/' + ns + '-usage/' + encodeURIComponent(username) + '.json');
  const n = u && u.date === todayStr() ? Math.trunc(Number(u.count)) : 0;
  return n > 0 ? n : 0;
}

// يضمن وجود مفتاح اليوم بانتهائه قبل أيّ INCR/DECR (DECR/INCR على مفتاح غائب ينشئه بلا انتهاء).
async function ensureKey(k, ns, username) {
  if ((await kvGetRaw(k)) == null) await kvSetIfAbsent(k, await legacyToday(ns, username), TALLY_TTL_SEC);
}

// إنقاص بواحد لا ينزل تحت الصفر: من أنزله تحت الصفر يعيد ما أنقصه هو.
async function decrement(k) {
  try {
    const v = Number(await kvDecrBy(k, 1));
    if (v < 0) await kvIncrBy(k, 1);
  } catch (e) {
    console.warn('[daily-quota] release failed: ' + (e && e.message));
  }
}

// حالة كلّ (أداة، حساب) في ذاكرة العمليّة: الحجوزات غير المغلقة، وعدد ما ثبّته consume منها ولم يُغلق.
// consume(username) لا يعرف أيّ طلب يناديه، وحجوزات الحساب الواحد متكافئة (كلّها INCR على المفتاح نفسه):
// فالتثبيت «مطالبة» عامّة، وإغلاق أيّ حجز (ردّه خرج أو مهلته حلّت) يأخذ مطالبة إن وُجدت بلا أمر، وإلّا يردّ
// مقعده (DECR). المطالبات لا تتجاوز الحجوزات المفتوحة، فحين تنتهي الطلبات كلّها: العدّاد = عدد النجاحات.
const states = new Map();
const stateId = (ns, username) => ns + '\n' + String(username);
function forget(s) {
  if (!s.holds.length && !s.claims) states.delete(s.id);
}

// يغلق حجز طلب انتهى. يرجع وعد الردّ (DECR) حين يُردّ المقعد، أو null حين لا شيء يُنتظر.
function settle(hold) {
  if (hold.done) return null;
  hold.done = true;
  clearTimeout(hold.timer);
  const s = hold.state;
  const i = s.holds.indexOf(hold);
  if (i >= 0) s.holds.splice(i, 1);
  if (s.claims > 0) {
    s.claims--;
    forget(s);
    return null;
  }
  forget(s);
  const back = decrement(hold.key);
  return hold.gkey ? Promise.all([back, decrement(hold.gkey)]) : back; // v-farm-gate: مقعد السقف الكلّيّ يُردّ معه
}

// أوّل إرسال للردّ (json/send/end) يغلق الحجز؛ فإن كان ردًّا للمقعد انتظره ثمّ أرسل، وإلّا أرسل فورًا
// (مسار النجاح بعد consume لا يتأخّر). ومؤقّت المهلة يغلقه إن لم يخرج ردّ قبل maxDuration.
function bindToResponse(res, hold) {
  hold.timer = setTimeout(settle, HOLD_MAX_MS, hold);
  if (hold.timer && hold.timer.unref) hold.timer.unref();
  if (!res) return;
  let gate = null;
  let open = false;
  for (const m of ['json', 'send', 'end']) {
    const orig = res[m];
    if (typeof orig !== 'function') continue;
    res[m] = function () {
      if (!gate && !open) {
        gate = settle(hold);
        if (!gate) open = true;
      }
      if (open) return orig.apply(this, arguments);
      const self = this;
      const args = arguments;
      gate = gate.then(() => {
        open = true;
        try { orig.apply(self, args); } catch (e) { console.error('[daily-quota] deferred send failed: ' + (e && e.message)); }
      });
      return this;
    };
  }
}

// عدّ اليوم بلا استهلاك (عطل KV = ٠ كما كان).
async function todayCount(ns, username) {
  try {
    const raw = await kvGetRaw(tallyKey(ns, username));
    return raw != null ? (parseInt(raw, 10) || 0) : await legacyToday(ns, username);
  } catch (e) {
    return 0;
  }
}

// الفحص: بلا res قراءة مجرّدة؛ مع res حجز ذرّيّ مربوط بالردّ. يرجع شكل check*Quota نفسه.
// opts.free: حساب مجّانيّ غير دافع (_planCap.planLimitInfo) — يُعدّ في FREE_MEDIA_DAILY ويُغلق على امتلاء القاعدة.
async function check(ns, username, limit, res, opts) {
  if (!(limit > 0)) return { allowed: false, reason: 'limit', username }; // v-farm-gate: قبل أيّ KV — العطل لا يفتح حدّ 0
  const free = !!(opts && opts.free);
  if (!res) {
    const count = await todayCount(ns, username);
    if (count >= limit) return { allowed: false, reason: 'limit', username };
    return { allowed: true, username, remaining: limit - count };
  }
  const k = tallyKey(ns, username);
  let n;
  try {
    await ensureKey(k, ns, username);
    n = Number(await kvIncr(k));
  } catch (e) {
    // v-farm-gate: للمجّانيّ غير الدافع وحده — القاعدة ممتلئة (الكتابة مرفوضة والقراءة تعمل: لا حصّة تُعدّ لأحد)، أو سقف كلّيّ
    // مضبوط لا يُعدّ = مغلق. المشترك وباقة الوسائط وكلّ عطل آخر للمجّانيّ: مفتوح كما كان (atomic-quota ٨).
    if (free && (require('./media-purge.js').isStoreFull(e) || require('./free-tier.js').mediaBudgetOn())) {
      console.warn('[daily-quota] reserve failed, free tier closed: ' + (e && e.message));
      return { allowed: false, reason: 'limit', username };
    }
    console.warn('[daily-quota] reserve failed, allowing: ' + (e && e.message));
    return { allowed: true, username, remaining: limit }; // عطل KV = مفتوح كما كان، ولا حجز يُردّ
  }
  if (n > limit) {
    await decrement(k);
    return { allowed: false, reason: 'limit', username };
  }
  let gkey = null; // v-farm-gate: مقعد FREE_MEDIA_DAILY (مطفأ افتراضيًّا: لا عدّ)
  if (free) {
    const slot = await require('./free-tier.js').takeDailySlot('media', { kvSetIfAbsent, kvIncrBy, kvDecrBy });
    if (!slot.ok) { await decrement(k); return { allowed: false, reason: 'limit', username }; }
    gkey = slot.key || null;
  }
  const id = stateId(ns, username);
  const state = states.get(id) || { id, holds: [], claims: 0 };
  states.set(id, state);
  const hold = { state, key: k, gkey, count: n, done: false, timer: null };
  state.holds.push(hold);
  bindToResponse(res, hold);
  return { allowed: true, username, remaining: limit - (n - 1) };
}

// الاستهلاك بعد النجاح: يثبّت حجزًا مفتوحًا بلا أمر جديد؛ وبلا حجز مفتوح (مسار لم يحجز، أو حجز أغلقته
// المهلة) زيادة ذرّيّة بلا فحص سقف — كما كان الاستهلاك القديم. يرجع المتبقّي (طلب منفرد: كما كان بالضبط).
async function consume(ns, username, limit) {
  const s = states.get(stateId(ns, username));
  if (s && s.claims < s.holds.length) {
    s.claims++;
    return limit - Math.max(...s.holds.map((h) => h.count));
  }
  try {
    const k = tallyKey(ns, username);
    await ensureKey(k, ns, username);
    return limit - Number(await kvIncr(k));
  } catch (e) {
    console.warn('[daily-quota] consume failed: ' + (e && e.message));
    return limit - 1; // أفضل جهد كما كان: لا يُحجب ردّ ناجح بسبب الدفتر
  }
}

// إعادة مقعد من عدّاد اليوم بعد فشل لاحق (فيديو قبله المزوّد ثمّ فشل) — لا تنزل تحت الصفر.
async function giveBack(ns, username) {
  const k = tallyKey(ns, username);
  try {
    await ensureKey(k, ns, username);
  } catch (e) {
    console.warn('[daily-quota] give back skipped: ' + (e && e.message));
    return;
  }
  await decrement(k);
}

// v-farm-gate (المراجعة العدائيّة): تغيير الاسم كان يصفّر هذه الحصص — العدّاد يبقى على الاسم القديم والجديد يبدأ من صفر،
// فحساب واحد يأخذ صورًا بلا حدّ: استعمل، غيّر الاسم، كرّر. الآن تنتقل مع الحساب كـ_usage.moveTodayTallies (INCRBY + EXPIRE
// على الجديد) ثمّ يُحذف القديم. NAMESPACES = كلّ أداة تعدّ هنا — tests/farm-gate.test.cjs يستخرجها من الكود ويقارن.
const NAMESPACES = ['design', 'fashion', 'studio', 'portrait', 'construction', 'video', 'car'];
async function moveToday(oldUser, newUser) {
  if (!oldUser || !newUser || String(oldUser) === String(newUser)) return;
  try {
    const { kvPipeline } = require('./kv.js');
    const pairs = NAMESPACES.map((ns) => [tallyKey(ns, oldUser), tallyKey(ns, newUser)]);
    const vals = await kvPipeline(pairs.map((p) => ['GET', p[0]]));
    const cmds = [];
    (vals || []).forEach((v, i) => {
      const n = parseInt(v, 10);
      if (n > 0) cmds.push(['INCRBY', pairs[i][1], String(n)], ['EXPIRE', pairs[i][1], String(TALLY_TTL_SEC)], ['DEL', pairs[i][0]]);
    });
    if (cmds.length) await kvPipeline(cmds);
  } catch (e) { console.warn('[daily-quota] rename tallies not moved: ' + (e && e.message)); }
}

module.exports = { check, consume, todayCount, giveBack, todayStr, moveToday, NAMESPACES, HOLD_MAX_MS };
