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
  return decrement(hold.key);
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
async function check(ns, username, limit, res) {
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
    console.warn('[daily-quota] reserve failed, allowing: ' + (e && e.message));
    return { allowed: true, username, remaining: limit }; // عطل KV = مفتوح كما كان، ولا حجز يُردّ
  }
  if (n > limit) {
    await decrement(k);
    return { allowed: false, reason: 'limit', username };
  }
  const id = stateId(ns, username);
  const state = states.get(id) || { id, holds: [], claims: 0 };
  states.set(id, state);
  const hold = { state, key: k, count: n, done: false, timer: null };
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

module.exports = { check, consume, todayCount, giveBack, todayStr, HOLD_MAX_MS };
