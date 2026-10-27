// Vercel Serverless Function: full signup/login account system.
// Each user is stored as its OWN JSON record (db/users/{username}.json) in
// Upstash Redis. This avoids any read-modify-write race across concurrent
// signups/logins that a single shared JSON file would have (lost updates
// when two requests land close together). Passwords are NEVER stored in
// plain text — scrypt hash + random salt per user. Sessions are signed
// tokens (HMAC-SHA256) — no plaintext secrets ever reach the client.
const crypto = require('crypto');
const { kvGetJSON, kvPutJSON } = require('./kv.js');
const { logError } = require('./log-error.js');
const { notifyNewAccount } = require('./signup-notify.js'); // v-signup-notify: إيميل للمالك عند كلّ حساب جديد
const { takeWelcomeGift } = require('./welcome-gift.js'); // v-welcome-cap

// ⏳ القراءة مؤجَّلة عمدًا. _secrets.AUTH_SECRET رامٍ (getter)، وقراءته هنا —
// في نطاق الوحدة — تحوّل متغيّرًا مفقودًا إلى انهيار عند الإقلاع البارد:
// FUNCTION_INVOCATION_FAILED، صفحة Vercel بيضاء، ولا قيد في سجلّ التطبيق،
// لأنّ withErrorCapture يلفّ المعالِج لا تحميل الوحدة. وهذا يناقض ما ينصّ
// عليه _secrets.js نفسه: «500 بسطر سجلّ واضح يُصلَح في دقائق».
// حدث فعلًا: /api/auth-google-callback و /api/edu كانا ينهاران عند الإقلاع.
// بالتأجيل يقع الرمي داخل المعالِج، فيُمسَك ويُسجَّل ويعود 500 مفهومًا.
const __secrets = require('./_secrets.js');
const authSecret = () => __secrets.AUTH_SECRET;

// 🔑 السرّ السابق — اختياريّ، ووجوده يحوّل مناوبة AUTH_SECRET من كارثة إلى
// عمليّة عاديّة. سجلّات المستخدمين معمّاة بمفتاح مشتقّ من السرّ، فتغييره كان
// يجعل كلّ حساب سابق غير مقروء دفعةً واحدة — وهو ما حدث فعلًا، وظهر للمستخدم
// بوصفه «التسجيل ما يثبت» لأنّ سجلًّا لا يُفكّ كان يُعامَل معاملة الغائب.
// بضبط AUTH_SECRET_PREVIOUS بالقيمة القديمة: يُقرأ السجلّ بها، ثمّ يُعاد
// تعميته بالمفتاح الحاليّ فورًا، فلا يبقى شيء معتمدًا على القديم.
const prevSecret = () => (process.env.AUTH_SECRET_PREVIOUS || '').trim() || null;

// سجلّ لا يُفكّ بأيّ مفتاح ليس «حسابًا غير موجود». الخلط بينهما كلّف يومًا
// كاملًا من التشخيص، وكان يفتح بابًا أسوأ: signup يقرأ null فيظنّ الاسم حرًّا
// فيكتب فوق السجلّ القديم — أي أنّ ضياع السرّ كان يتيح الاستيلاء على الأسماء.
class UndecryptableUserRecord extends Error {
  constructor(userKey) {
    super('user_record_undecryptable');
    this.name = 'UndecryptableUserRecord';
    this.code = 'USER_RECORD_UNDECRYPTABLE';
    this.userKey = userKey;
  }
}

function userPath(key) {
  // key must already be the normalized (lowercased, trimmed) username.
  return 'db/users/' + encodeURIComponent(key) + '.json';
}

// ---------------------------------------------------------------------------
// أسماء محجوزة.
//
// _owner.js يمنح صلاحية المالك بمطابقة اسم المستخدم بـOWNER_USERNAME. ولم يكن
// الاسم محجوزًا هنا: الحماية الوحيدة كانت أنّ السجل موجود. ومسار تغيير الاسم
// أدناه يترك المفتاح القديم {deleted:true}، وsignup يقبل المحذوف — فلحظة تغيير
// المالك لاسمه يصير الاسم قابلًا للتسجيل، وأوّل من يأخذه يرث اللوحة.
//
// أمتن من هذا (لاحقًا): ownerId ثابت في السجلّ بدل اسم قابل للتغيير.
// v-owner-core: تُحجز كل أسماء المالك (البيئة + ‹omran› المدمج) لا اسمًا واحدًا.
const RESERVED_USERNAMES = new Set([
  ...require('./_owner.js').ownerList(),
  'omran', 'admin', 'administrator', 'root', 'owner', 'support', 'system', 'api',
]);

/* v-name-reuse (فحص ٨ أكتوبر): الرمز يحمل الاسم وحده، فالاسم هويّة الحساب ولا يُعطى لشخص ثانٍ أبدًا. السجلّ المحذوف
   (شاهد تغيير الاسم {deleted, movedTo} أو حذف المالك) يبقى حاجزًا: كان signup وchangeUsername يكتبان فوقه، فيصير رمز صاحب
   الاسم القديم رمزًا لحساب المسجِّل الجديد، ويرث المسجِّل عدّاد نقاط المحذوف، وينقطع movedTo الذي يتبعه الشحن.
   الاستثناء الوحيد: صاحب الحساب يرجع إلى اسم كان له — والدليل سلسلة الشواهد نفسها (movedTo ← … ← حسابه)، لا prevUsernames
   (غائب عن تغييرات ما قبل ٥ أكتوبر، ومقصوص إلى عشرة، ولا يقول من حمل الاسم أخيرًا). وحساب Google مفتاحه g_<البريد>
   (الكولباك)، فهذه المساحة لا تُختار اسمًا — وإلّا سجّلها غيرك قبلك بكلمة مرور يعرفها، ودخولك بزرّ Google يفتح حسابه. */
function isGoogleKey(key) { return /^g_.*@/.test(String(key || '')); }
/* v-name-no-at (أمر المالك ١٨ أكتوبر: «امنع حرف @ في اسم المستخدم عند التسجيل الجديد. الحسابات القديمة لا تلمسها»): قائمة VIP تقبل
   إيميلًا، وإن لم يكن له حساب بعد يبقى نصًّا خامًا فيها — فمن سجّل اسمه بذلك الإيميل نفسه صار VIP كاملًا في كلّ خصم (يُطابَق
   بالاسم). الاسم الجديد بلا @ (التسجيل وتغيير الاسم)؛ الحسابات القائمة بأسمائها، والدخول بالاسم أو الإيميل كما كان. */
// النصّ هنا احتياط بالعربيّة/الإنجليزيّة؛ الواجهة تعرض nameNoAt بلغتها الـ١٤ متى وصل code: 'name_at'.
const NAME_AT_AR = 'اختر اسم مستخدم بدون @ — تقدر تضيف إيميلك من «حسابي» بعد التسجيل';
const NAME_AT_EN = 'Choose a username without @ — you can add your email in My account after signing up';

/* v-sec-name-chars: الاسم مفتاحُ تخزينٍ ومعاملُ SCAN (planvid:<اسم>:* وغيره). حرفٌ من أنماط Redis
   (* ? [ ] \ ^) أو فاصلة (OWNER_USERNAMES تُقسَّم بالفواصل) أو محرف تحكّم/مسافة طرفيّة كان يسمح
   بحذف حساب اسمه «***» يمسح مفاتيح كلّ المستخدمين (account-delete). يُرفَض في التسجيل وتغيير الاسم
   وحدهما — الحسابات القائمة لا تُلمس. التطبيع إلى الأحرف الصغيرة يبقى كما هو. */
const NAME_BAD_CHARS_RE = /[*?\[\]\\^,\u0000-\u001f\u007f]/;
const NAME_BAD_AR = 'اسم المستخدم فيه رموز غير مسموحة (مثل * ؟ [ ] \\ أو فاصلة)';
const NAME_BAD_EN = 'Username contains disallowed characters (such as * ? [ ] \\ or comma)';
function nameHasBadChars(key) {
  const s = String(key || '');
  return NAME_BAD_CHARS_RE.test(s) || s !== s.trim();
}

// سجلّ محذوف يعود لهذا الحساب فقط إن قادت شواهده (كلّها {deleted, movedTo}) إليه. حذف المالك (بلا movedTo) أو سلسلة
// تنتهي عند حساب حيّ آخر = ليس لك. سجلّ مقفل في الطريق = ليس لك أيضًا.
async function tombstoneLeadsTo(rec, targetKey) {
  try {
    for (let i = 0; i < 32; i++) {
      if (!rec || !rec.deleted || !rec.movedTo) return false;
      const next = String(rec.movedTo).trim().toLowerCase();
      if (next === targetKey) return true;
      rec = await getUser(next, 1);
    }
  } catch (e) { logError('auth:tombstone-chain', e, { to: String(targetKey).slice(0, 40) }); }
  return false;
}

// الحدّ الأدنى لكلمة المرور. كان 4 — رقم منخفض بلا مبرّر حتّى مع قفل المحاولات.
// ثابت واحد بدل ثلاثة أرقام متفرّقة في الرسائل والشروط.
const MIN_PASSWORD = 8;

// تغيير الاسم: حدّان لكلّ حساب في ٢٤ ساعة متحرّكة (renameLog في السجلّ) — انظر changeUsername.
const RENAME_MAX = 2;
const RENAME_WINDOW_MS = 24 * 60 * 60 * 1000;

// مرسِل البريد. onboarding@resend.dev هو مرسِل Resend التجريبيّ ولا يصل إلّا
// لصاحب حساب Resend نفسه — لغيره تردّ Resend بـ403 فيُسجَّل auth:mail resend_403
// (v-signup-notify: التعليق القديم قال «ok:true» وهذا خلاف وثائق Resend).
// وثّق نطاقك في Resend واضبط MAIL_FROM.
const MAIL_FROM = process.env.MAIL_FROM || 'om ai <onboarding@resend.dev>'; // v-om-ai-name: اسم المرسل «om ai»؛ Resend لا يرسل من gmail (نطاق غير موثَّق) — الردّ يصل بريد المالك (OWNER_NOTIFY_EMAIL، لا عنوان في الكود)

// ---------------------------------------------------------------------------
// At-rest encryption for user records.
// db/users/{username}.json is stored in Redis, reachable by any server
// function that knows the key derivation — to keep the same defense in
// depth as before (in case of any future public-read exposure), every
// record is still encrypted with AES-256-GCM using a key derived from
// AUTH_SECRET before it's written, and decrypted on read. Legacy plaintext
// records (written before this change) are still readable for backward
// compatibility and get transparently re-encrypted the next time
// putUser() is called on them.
// مؤجَّل للسبب نفسه أعلاه: حسابه هنا يقرأ السرّ وقت التحميل.
const keyOf = (secret) => crypto.createHash('sha256').update(secret).digest(); // 32 bytes -> aes-256-gcm
let __encKey = null, __encKeyFor = null;
const encKey = () => {
  const s = authSecret();
  if (__encKeyFor !== s) { __encKeyFor = s; __encKey = keyOf(s); }
  return __encKey;
};
let __prevKey = null, __prevKeyFor = null;
const prevKey = () => {
  const s = prevSecret();
  if (!s) return null;
  if (__prevKeyFor !== s) { __prevKeyFor = s; __prevKey = keyOf(s); }
  return __prevKey;
};

function encryptUserBlob(obj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { enc: 1, iv: iv.toString('base64'), tag: tag.toString('base64'), data: data.toString('base64') };
}

// المفتاح صريح لا ضمنيّ: القراءة تجرّب الحاليّ ثمّ السابق، وGCM يرفض المفتاح
// الخطأ برمي عند التحقّق من الوسم — فلا يعود نصًّا مشوَّهًا بصمت.
function decryptUserBlob(encObj, key) {
  const iv = Buffer.from(encObj.iv, 'base64');
  const tag = Buffer.from(encObj.tag, 'base64');
  const data = Buffer.from(encObj.data, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key || encKey(), iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(dec.toString('utf8'));
}

function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  // نفس الطول دائمًا (64 بايت hex)، لكن نحرس على أيّ سجلّ تالف حتّى لا يرمي
  // timingSafeEqual فيتحوّل فشل تحقّق عاديّ إلى خطأ 500.
  const a = Buffer.from(check);
  const b = Buffer.from(String(hash || ''));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/* v-rename-move (فحص الاشتراكات ٥ أكتوبر): السجلّ كان ينتقل والعدّادات الحيّة تبقى على الاسم القديم — فالرجوع للاسم
   القديم يعيد الرصيد كاملًا بعد صرفه (٩٨٠ ← صرف ٨٢٥ ← رجوع ← ٩٨٠، أُثبت بهذا الكود)، والاسم الجديد يبدأ بفيديوهات باقة
   وحصص يوم جديدة، ورصيد اشتراك الوسائط يختفي عنه. الآن كلّ عدّاد يتبع الحساب ولا يبقى منه شيء تحت الاسم القديم،
   وعدّاد يتيم تحت الاسم الجديد (من صاحب سابق) يُمحى بدل أن يُبعث. */
async function moveLiveCounters(oldKey, newKey, user) {
  const { kvGetRaw, kvSetRaw, kvDel } = require('./kv.js');
  const n = (u) => encodeURIComponent(String(u).trim().toLowerCase());
  if (n(oldKey) === n(newKey)) return; // النقل إلى المفتاح نفسه = نسخ ثمّ حذف — يمحو الرصيد
  const move = async (from, to, ttlSec) => {
    const v = await kvGetRaw(from);
    if (v !== null && v !== undefined && String(v) !== '') await kvSetRaw(to, v, ttlSec);
    else await kvDel(to);
    await kvDel(from);
  };
  await move('points:' + n(oldKey), 'points:' + n(newKey));
  for (const kind of ['image', 'video', 'maha', 'mix']) { // رصيد اشتراك الوسائط بما بقي من نافذته (٣٥ يومًا) — mix: «صور وفيديو» (v-media-merge، MEDIA_KINDS)
    const m = user.media && user.media[kind];
    const left = m ? Math.floor((Number(m.at || 0) + 35 * 86400000 - Date.now()) / 1000) : 0;
    if (left > 0) await move('media:' + kind + ':' + n(oldKey), 'media:' + kind + ':' + n(newKey), left);
    else await kvDel('media:' + kind + ':' + n(newKey));
  }
  const at = Math.floor(Number(user.planUpdatedAt) || 0); // فيديوهات الباقة للفترة الحاليّة (_planVideos.js)
  if (at > 0) await move('planvid:' + n(oldKey) + ':' + at, 'planvid:' + n(newKey) + ':' + at, 40 * 86400);
  // كلّ نقل مستقلّ: عطل في واحد لا يترك البقيّة على الاسم القديم (فتتجدّد مع الاسم الجديد).
  const step = async (label, fn) => { try { await fn(); } catch (e) { console.warn('[rename] move ' + label + ' failed: ' + (e && e.message)); } };
  await step('usage', () => require('./_usage.js').moveTodayTallies(oldKey, newKey));
  await step('daily-quota', () => require('./_dailyQuota.js').moveToday(oldKey, newKey)); // v-farm-gate: حصص أدوات الصور والفيديو اليوميّة كانت تتصفّر بتغيير الاسم
  await step('image-giveback', () => require('./image-giveback.js').moveToday(oldKey, newKey)); // ردود الحارس و«لم يُنفَّذ» اليوم — كانت تتجدّد مع كلّ اسم
  await step('cost-meter', () => require('./cost-meter.js').moveMonthCosts(oldKey, newKey));
}

function makeToken(username, sv) {
  const body = { u: username, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 };
  const v = Number(sv);
  if (Number.isInteger(v) && v > 0) body.v = v; // v-audit-auth (srv-auth-8): إصدار الجلسة — انظر sessionVersion
  const payload = Buffer.from(JSON.stringify(body)).toString('base64url');
  const sig = crypto.createHmac('sha256', authSecret()).update(payload).digest('base64url');
  return payload + '.' + sig;
}

/* v-session-shape (الدفعة A، أمان): كانت هنا نسخة تقارن `data.exp < Date.now()`، فحمولة موقّعة بلا exp (تذكرة مهمّة البناء
   {u,p,h,r,n,e}) تمرّ «جلسة» لا تنتهي، و'verify' يسكّ منها رمزًا جديدًا بثلاثين يومًا. الآن الشكل كما يصنعه makeToken حرفيًّا
   (u نصّ، exp رقم في المستقبل) عبر _session.sessionUser — وكلّ من يستورد auth.verifyToken (الدفع والبريد والوكيل…) يرثه. */
function verifyToken(token) {
  return require('./_session.js').sessionUser(token);
}

// v-time-seam: مفصل الزمن لانتظار إعادة محاولة getUser (٣٠٠/٦٠٠/٩٠٠ م.ث). الإنتاج ينام كما كان تمامًا؛
// الاختبار يضبط OMRAN_TEST_FAST_SLEEP=1 (يُقرأ عند كلّ نداء لا في نطاق الوحدة) فلا يدفع ١٫٨ ثانية لكلّ سجلّ غائب،
// أو يستبدل _timing.sleep ليرى المُدَد نفسها.
const _timing = { sleep(ms) { return new Promise((r) => setTimeout(r, process.env.OMRAN_TEST_FAST_SLEEP === '1' ? 0 : ms)); } };
function sleep(ms) { return _timing.sleep(ms); }

async function getUserOnce(key) {
  try {
    const parsed = await kvGetJSON(userPath(key));
    if (!parsed) return null;
    if (parsed && parsed.enc === 1) {
      try {
        return decryptUserBlob(parsed, encKey());
      } catch (e) {
        // بالمفتاح الحاليّ فشل. نجرّب السابق إن كان مضبوطًا — وهذا هو مسار
        // المناوبة الآمنة: نقرأ بالقديم ثمّ نعيد الكتابة بالجديد فورًا.
        const pk = prevKey();
        if (pk) {
          let migrated = null;
          try { migrated = decryptUserBlob(parsed, pk); } catch (e2) { migrated = null; }
          if (migrated) {
            try { await putUser(key, migrated); }
            catch (e3) { logError('auth:rekey', e3, { key: String(key).slice(0, 40) }); }
            return migrated;
          }
        }
        // لا مفتاح يفكّه. هذا ليس «حسابًا غير موجود» — وإعادته null كانت تخفي
        // السبب خلف «كلمة المرور خاطئة»، وتتيح لـsignup الكتابة فوق السجلّ.
        logError('auth:decrypt', e, { key: String(key).slice(0, 40), hasPrev: Boolean(pk) });
        throw new UndecryptableUserRecord(key);
      }
    }
    // Legacy plaintext record (written before at-rest encryption was added).
    // Still readable for backward compatibility; putUser() below will
    // transparently re-encrypt it the next time it's saved.
    return parsed;
  } catch (e) {
    // الرمي المقصود يمرّ: خلطه بأعطال القراءة يعيده إلى الصمت الذي أُزيل.
    if (e && e.code === 'USER_RECORD_UNDECRYPTABLE') throw e;
    logError('auth:get-user', e);
    return null;
  }
}

// Redis reads are strongly consistent, but keep the retry loop (now a no-op
// in practice) so callers relying on getUser()'s multi-attempt signature
// keep working unchanged.
async function getUser(key, attempts) {
  attempts = attempts || 4;
  for (let i = 0; i < attempts; i++) {
    const user = await getUserOnce(key);
    if (user) return user;
    if (i < attempts - 1) await sleep(300 * (i + 1));
  }
  return null;
}

async function putUser(key, user) {
  await kvPutJSON(userPath(key), encryptUserBlob(user));
}

/* v-audit-auth (srv-auth-4 · srv-auth-5): فهرسا البريد والهاتف ومفتاح Google يحملون الاسم وقت كتابتهم، وتغيير الاسم يترك هناك
   شاهدًا {deleted, movedTo} — فكان الدخول بالإيميل والاسترجاع بالإيميل وبالهاتف والدخول بالرمز يقفون عند الشاهد. يُتبع movedTo
   إلى الحساب الحيّ (٣٢ قفزة كالشحن). الشاهد لا يكتبه إلّا changeUsername من جلسة صاحبه، والاسم المتروك لا يُعطى لغيره (v-name-reuse)،
   فآخر السلسلة هو الحساب نفسه. سجلّ محذوف بلا movedTo (حذف حقيقيّ) يعود كما هو. */
async function liveAccount(key, attempts) {
  let k = String(key || '').trim().toLowerCase();
  let user = k ? await getUser(k, attempts) : null;
  for (let i = 0; i < 32 && user && user.deleted && user.movedTo; i++) {
    k = String(user.movedTo).trim().toLowerCase();
    user = await getUser(k, attempts);
  }
  return { key: k, user };
}
// الحساب الحيّ الذي يصل إليه فهرس البريد وبريده هو هذا البريد نفسه، وإلّا null. يرمي عطب القراءة للمستدعي.
async function indexOwner(emailKey, attempts) {
  const idx = await kvGetJSON('db/email-index/' + emailKey);
  const uname = idx && idx.username ? String(idx.username).trim().toLowerCase() : '';
  if (!uname) return null;
  const live = await liveAccount(uname, attempts);
  return (live.user && !live.user.deleted && live.user.email === emailKey) ? live : null;
}

/* v-audit-auth (srv-auth-8): رقم إصدار الجلسة. الرمز {u, exp} وحده كان يبقى صالحًا بعد تغيير كلمة المرور أو استعادتها، و'verify'
   يسكّ منه رمزًا جديدًا ثلاثين يومًا في كلّ نداء — فالرمز المسرَّب لا يموت. الآن sv في السجلّ يُزاد عند changePassword وresetWithToken،
   والرمز يحمله (v، يُكتب حين يكون > 0 فرموز من لم يغيّر كلمته بالشكل نفسه)، ورمز أقدم من السجلّ يُرفض في verify وفي إجراءات الحساب. */
function sessionVersion(user) { const v = Number(user && user.sv); return Number.isInteger(v) && v > 0 ? v : 0; }
function tokenVersion(token) {
  try {
    const d = JSON.parse(Buffer.from(String(token || '').split('.')[0], 'base64url').toString());
    const v = Number(d && d.v);
    return Number.isInteger(v) && v > 0 ? v : 0;
  } catch (e) { return 0; } // رمز مشوّه لا يصل هنا إلّا بعد verifyToken — والإصدار صفر احتياطًا
}
function sessionCurrent(user, token) { return !user || tokenVersion(token) >= sessionVersion(user); }

const RESEND_API_KEY = process.env.RESEND_API_KEY;
// عبر _site.js لا من البيئة مباشرة: وُجد في الإنتاج أنّ SITE_URL كان سرّ
// عميل جوجل، ورابط استرجاع كلمة المرور يُرسَل بالبريد — فكان السرّ يخرج إلى
// صندوق كلّ من يطلب الاسترجاع. _site.js لا يقبل إلا عنوان https صالح.
const { siteUrl } = require('./_site.js');

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// v-simple-login: خانة الدخول تقبل اسم المستخدم أو الإيميل. الاسم أوّلًا (الأسماء بلا قيد أحرف،
// فقد يحمل اسمٌ قديم «@»)، ثمّ فهرس الإيميل الذي يكتبه التسجيل وجوجل والدخول بالرمز.
// v-unverified-email: الوصول بالفهرس لا يكفي — الحساب يُرجَع ومعه emailUnverified إن لم يكن هذا البريد مؤكَّدًا عليه
// (أو لم يعد بريده)، فيرفض الدخول والاسترجاع برسالة المالك بدل أن يفتحا الحساب.
async function resolveLoginUser(identifier) {
  const key = String(identifier || '').trim().toLowerCase();
  const direct = key ? await getUser(key) : null;
  if ((direct && !direct.deleted) || !isValidEmail(key)) return { key, user: direct };
  try {
    const idx = await kvGetJSON('db/email-index/' + key);
    const uname = idx && idx.username ? String(idx.username).trim().toLowerCase() : '';
    if (uname) {
      const { key: liveKey, user } = await liveAccount(uname); // v-audit-auth (srv-auth-5): فهرس على اسم تغيّر يتبع شاهده
      if (user && !user.deleted) return { key: liveKey, user, emailUnverified: !(user.email === key && await emailProven(liveKey, user)) };
    }
  } catch (e) { logError('auth:login-email-index', e); }
  return { key, user: direct };
}

/* v-google-login-help: حساب «المتابعة عبر Google» مفتاحه g_<البريد> (أو حساب دُمج فيه — db/alias كما في الكولباك)، بلا
   فهرس بريد ولا كلمة مرور يعرفها صاحبه. محاولة واحدة لا أربع: الغياب هنا هو الحالة الغالبة لا تأخّر تخزين. */
async function googleAccountFor(emailKey) {
  try {
    const gKey = 'g_' + emailKey;
    const alias = await kvGetJSON('db/alias/' + gKey);
    // v-audit-auth (srv-auth-4): حساب Google غيّر اسمه — مفتاحه شاهد يقود إليه
    const { key, user } = await liveAccount((alias && alias.primary) ? String(alias.primary) : gKey, 1);
    if (user && !user.deleted) return { key, user };
  } catch (e) { logError('auth:google-account', e); }
  return null;
}

// يمنع حقن HTML عبر اسم المستخدم في جسم الرسالة.
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}


/* v-vip-verified (أمر المالك ١٨ أكتوبر: «VIP بالإيميل ما ينعطى إلا لإيميل متحقّق منه… تغيير الإيميل في «حسابي» ما ينحفظ إلا بعد
   ما يدخل المستخدم الكود… أي إيميل محفوظ وما تحقّقنا منه ما يعطي VIP»). الختم verifiedEmail = البريد نفسه الذي ثبت لا true:
   كلّ كتابة أخرى للبريد (التسجيل بإيميل من الـAPI، سجلّ قديم، كتابة متأخّرة لنسخة قديمة) تتركه غير مؤكَّد من تلقاء نفسها.
   يُختم في ثلاثة مواضع فقط: رمز «حسابي» المربوط بالحساب (emailChange*)، وحساب أنشأه رمز البريد، وحساب g_<البريد> عند دخول
   Google. لا يُختم عند الدخول برمز إلى حساب قائم: من وضع بريد غيره في حسابه يستقبل دخول صاحب البريد، والختم هناك يجعله صاحبه.
   حساب Google هويّته مفتاحه g_<البريد> (تثبته Google في كلّ دخول)، فهو مؤكَّد لبريد مفتاحه. */
function emailVerifiedFor(key, user) {
  if (!user || user.deleted || !user.email) return false;
  return user.verifiedEmail === user.email || (user.googleAuth === true && String(key) === 'g_' + user.email);
}

// حساب آخر أثبت هذا البريد (برمز أو بـGoogle): هو صاحبه، ولا يأخذه غيره. من وضعه بلا إثبات لا يحجزه (كان أوّل من يكتبه يحجبه
// عن صاحبه بـ409 للأبد) — سجلّه يبقى كما هو، والفهرس ينتقل إلى من أثبت.
async function verifiedHolderOf(emailKey, exceptKey) {
  try {
    // الفهرس وحساب Google معًا لا تتابعًا (يمرّ هنا تنبيه «أكّد إيميلك» عند كلّ فتح — v-unverified-email)؛ الفهرس يسبق كما كان.
    const [idx, g] = await Promise.all([kvGetJSON('db/email-index/' + emailKey), googleAccountFor(emailKey)]);
    const uname = idx && idx.username ? String(idx.username).trim().toLowerCase() : '';
    if (uname) {
      const { key: liveKey, user } = await liveAccount(uname, 1); // v-audit-auth (srv-auth-5): الفهرس على اسم تغيّر
      if (liveKey !== exceptKey && user && user.email === emailKey && emailVerifiedFor(liveKey, user)) return liveKey;
    }
    if (g && g.key !== exceptKey && (g.key !== 'g_' + emailKey || g.user.googleAuth === true)) return g.key;
  } catch (e) { logError('auth:email-holder', e); }
  return null;
}

// بريد ثبت للتوّ لصاحبه: مدخل VIP بهذا البريد خامًا (أضافه المالك قبل أن يُعرف صاحبه) يصير اسم حسابه. _vip.js يُستبدل في
// بعض الاختبارات بـ{ isVip } وحدها، فالفحص بـtypeof. لا يرمي: الدخول لا يفشل بسبب القائمة.
// v-unverified-email (مراجعة النقض): الترقية قراءة القائمة ثمّ كتابتها — الجرد يختم ٢٥ حسابًا معًا فتتسابق وتضيع إحداها للأبد
// (علامة «رُقّي» تُكتب قبل القائمة). سلسلة واحدة في العمليّة تجعلها واحدة بعد واحدة — وكلّ حلقة تُحرَّر بعد ٥ ثوانٍ على الأكثر:
// طلب KV عالق (fetch بلا مهلة ≈ ٣٠٠ ث) لا يحبس تسجيلات وتأكيدات الآخرين خلفه (المراجعة الثانية).
let vipPromoteChain = Promise.resolve();
function promoteVip(emailKey, key) {
  const run = vipPromoteChain.then(async () => {
    try {
      const vip = require('./_vip.js');
      if (typeof vip.promoteVerifiedEmail === 'function') await vip.promoteVerifiedEmail(emailKey, key);
    } catch (e) { logError('auth:vip-promote', e); }
  });
  vipPromoteChain = Promise.race([run.catch(() => {}), new Promise((r) => { const t = setTimeout(r, 5000); if (t && t.unref) t.unref(); })]);
  return run;
}

/* v-unverified-email (أمر المالك ١٨ أكتوبر: «الدخول واسترجاع الحساب بالإيميل يشتغلون بس على إيميل متأكَّد… أي حساب إيميله غير
   متأكَّد، أول ما يدخل يطلع له تنبيه «أكّد إيميلك»… بعد ٣٠ يوم، الإيميل اللي ما تأكّد ينشال من الحساب تلقائيًا، والحساب نفسه يبقى»).
   سجلّات ما قبل v-signup-no-email تحمل بريدًا وفهرسه بلا ختم: كان الدخول بكلمة المرور أو بالرمز، ورابط الاسترجاع، يصل صاحبَ البريد
   حسابَ من زرعه. الآن كلّها على emailProven، والرفض برسالة المالك (code: 'email_unverified') تعرضها الواجهة بلغتها الـ١٤. */
const UNVERIFIED_EMAIL_AR = 'هذا الإيميل غير مؤكَّد، ادخل باسم المستخدم وأكّده من حسابي';
const UNVERIFIED_EMAIL_EN = 'This email is not confirmed — sign in with your username and confirm it in My account';
const UNVERIFIED_EMAIL_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

// سجلّات أُثبت بريدها قبل الختم (١٨ أكتوبر) تُختم مرّة بدليل من السجلّ نفسه — لا تُعامَل كالمزروعة، ولا تُقفل عن أصحابها:
// • حساب Google غيّر اسمه: googleAuth (لا يضعه إلّا الكولباك) ومفتاحه الأوّل g_<البريد> في prevUsernames (منذ ٥ أكتوبر) أو شاهده يقود إليه.
// • هويّة Google دمجها المالك فيه (db/alias/g_<البريد> ← هذا الحساب): كلّ دخول Google بهذا البريد يصله.
// • حساب أنشأه رمز البريد (otpOnly، بلا كلمة مرور يعرفها صاحبه): اسم الإنشاء <مقدّمة البريد>_<٦ ست عشريّة>، وفهرس البريد له كُتب في
//   الطلب نفسه (٠–١٠ ثوانٍ بعد createdAt؛ setEmail القديم كتبه وقت التغيير)، فإن غيّر اسمه بعدها فشاهد اسم الإنشاء يقود إليه.
function otpNamePrefix(email) { return String(email).split('@')[0].replace(/[^a-z0-9]/gi, '').slice(0, 12).toLowerCase() || 'user'; }
async function leadsHere(fromKey, key) {
  try { return await tombstoneLeadsTo(await getUser(fromKey, 1), key); } catch (e) { logError('auth:legacy-chain', e); return false; }
}
async function emailProven(key, user) {
  if (emailVerifiedFor(key, user)) return true;
  if (!user || user.deleted || !user.email) return false;
  if (user.googleAuth === true && ((Array.isArray(user.prevUsernames) && user.prevUsernames.indexOf('g_' + user.email) !== -1)
      || await leadsHere('g_' + user.email, key))) return stampLegacyEmail(key, user);
  try {
    const alias = await kvGetJSON('db/alias/g_' + user.email);
    if (alias && alias.primary && String(alias.primary).trim().toLowerCase() === key) return stampLegacyEmail(key, user);
  } catch (e) { logError('auth:legacy-alias', e); }
  if (user.otpOnly !== true) return false;
  let idx = null;
  try { idx = await kvGetJSON('db/email-index/' + user.email); } catch (e) { logError('auth:otp-legacy-index', e); return false; }
  const origin = idx ? String(idx.username || '').trim().toLowerCase() : '';
  const named = new RegExp('^' + otpNamePrefix(user.email) + '_[0-9a-f]{6}$').test(origin) || /^user_[0-9a-f]{12}$/.test(origin);
  const gap = Number(idx && idx.at) - Number(user.createdAt);
  if (!origin || !named || !(gap >= 0 && gap <= 10 * 1000)) return false;
  if (origin !== key && !(await leadsHere(origin, key))) return false;
  return stampLegacyEmail(key, user);
}
// الختم على نسخة تُقرأ الآن لا على ما بيد المستدعي (بين قراءته وهنا كلمة مرور وscrypt): تأكيد أو تغيير اسم في الفجوة لا يُمحى ولا يُبعث.
async function stampLegacyEmail(key, user) {
  let fresh = null;
  try { fresh = await getUser(key, 1); } catch (e) { logError('auth:legacy-email-read', e); }
  if (fresh && (fresh.deleted || fresh.email !== user.email)) return false;
  user.verifiedEmail = user.email;
  delete user.emailUnverified;
  if (!fresh) return true; // قراءة عابرة فارغة: الدليل من نسخة المستدعي — لا ختم ولا ترقية الآن، ولا «غير مؤكَّد» لصاحبه
  fresh.verifiedEmail = fresh.email;
  delete fresh.emailUnverified;
  try { await putUser(key, fresh); } catch (e) { logError('auth:legacy-email-stamp', e); }
  await promoteVip(user.email, key);
  return true;
}

// عدّاد الثلاثين يومًا يبدأ أوّل ما يُرى البريد غير المؤكَّد (الدخول، أو الجرد اليوميّ) — لا من تاريخ قديم، فلا يُشال شيء يوم النشر.
// بعده يُشال البريد (email=null) وفهرسه إن كان يشير لهذا الحساب (لا فهرس من أكّده بعده)، والحساب وكلّ ما فيه باقٍ. السجلّ يُقرأ من
// جديد قبل الكتابة فتضيق نافذة تأكيد متزامن إلى رحلة واحدة (لا قفل؛ ككلّ كاتب آخر للسجلّ). الحالات: none · verified · pending · removed · changed.
async function settleUnverifiedEmail(key, user, now) {
  now = now || Date.now();
  if (!user || user.deleted || !user.email) return { state: 'none' };
  if (await emailProven(key, user)) return { state: 'verified' };
  const email = user.email;
  const mark = user.emailUnverified;
  const since = (mark && mark.email === email && Number(mark.since) > 0) ? Number(mark.since) : 0;
  if (since && now - since < UNVERIFIED_EMAIL_GRACE_MS) return { state: 'pending', email, removeAt: since + UNVERIFIED_EMAIL_GRACE_MS };
  const fresh = await getUser(key, 1);
  if (!fresh || fresh.deleted || fresh.email !== email || emailVerifiedFor(key, fresh)) return { state: 'changed' };
  if (!since) {
    fresh.emailUnverified = { email, since: now };
    await putUser(key, fresh);
    return { state: 'pending', email, removeAt: now + UNVERIFIED_EMAIL_GRACE_MS };
  }
  fresh.email = null;
  delete fresh.emailUnverified;
  await putUser(key, fresh);
  try {
    const idx = await kvGetJSON('db/email-index/' + email);
    if (idx && String(idx.username || '').trim().toLowerCase() === key) await require('./kv.js').kvDel('db/email-index/' + email);
  } catch (e) { logError('auth:unverified-index', e); }
  return { state: 'removed', email };
}

// الحساب الذي يصل إليه الدخول بالرمز (فهرس البريد، وبريده هو نفسه) إن لم يكن البريد مؤكَّدًا عليه — بمعيار email-otp-verify نفسه.
async function unverifiedHolderOf(emailKey) {
  try {
    const own = await indexOwner(emailKey, 1); // v-audit-auth (srv-auth-4): بمعيار email-otp-verify نفسه — والفهرس على اسم تغيّر يتبع شاهده
    if (own && !(await emailProven(own.key, own.user))) return own.key;
  } catch (e) { logError('auth:email-unverified-holder', e); }
  return null;
}

// «أكّد إيميلك» بعد الدخول والتحقّق عند الإقلاع: البريد إن بقي غير مؤكَّد بعد التسوية، وإلّا null. عطبٌ هنا لا يُفشل الدخول.
async function emailToConfirmFor(key, user) {
  try {
    // حساب آخر أثبته (برمز أو Google): زرّ «أرسل الكود» يعود ٤٠٩ دائمًا — لا تنبيه، والعدّاد يمضي فيُشال. يُسأل مع التسوية لا بعدها،
    // وللبريد غير المختوم وحده (المؤكَّد لا يدفع شيئًا). verifiedHolderOf لا يرمي.
    const held = (user && user.email && !emailVerifiedFor(key, user)) ? verifiedHolderOf(user.email, key) : null;
    const r = await settleUnverifiedEmail(key, user);
    if (r.state !== 'pending') return null;
    if (held && (await held)) return null;
    return r.email;
  } catch (e) { logError('auth:email-confirm-hint', e); return null; }
}

// الجرد اليوميّ (email-sweep.js ← Vercel Cron): كلّ حساب ببريد يمرّ على settleUnverifiedEmail — يُختم القديم المُنشأ بالرمز، ويبدأ
// عدّاد غير المؤكَّد، ويُشال ما تجاوز ثلاثين يومًا. لا يحذف حسابًا. دفعات من ٢٥ كجرد VIP، ويقف قبل حدّ الدالّة (partial في سجلّه).
async function sweepUnverifiedEmails(now, budgetMs) {
  const started = Date.now();
  const { kvList } = require('./kv.js');
  const names = (await kvList('db/users/'))
    .map((k) => { try { return decodeURIComponent(String(k).replace(/^db\/users\//, '').replace(/\.json$/, '')).trim().toLowerCase(); } catch (e) { return ''; } })
    .filter(Boolean);
  const tally = { users: names.length, verified: 0, pending: 0, removed: 0, failed: 0, partial: false };
  for (let i = 0; i < names.length; i += 25) {
    if (Date.now() - started > (budgetMs || 240000)) { tally.partial = true; break; }
    await Promise.all(names.slice(i, i + 25).map(async (key) => {
      try {
        const r = await settleUnverifiedEmail(key, await getUserOnce(key), now);
        if (r.state in tally) tally[r.state]++;
      } catch (e) { tally.failed++; logError('auth:email-sweep', e, { key: key.slice(0, 40) }); }
    }));
  }
  return tally;
}
/* v-auth-throttle (الدفعة A، أمان): عدّادات المحاولات ذرّيّة. كانت rateWait وقفل الدخول وعدّاد رموز البريد قراءةً ثمّ كتابة،
   فالطلبات المتوازية تقرأ العدد نفسه وتمرّ كلّها (المسبار: ٢٠٠ كلمة مرور خاطئة متوازية = ٢٠٠ تقييم، والقفل لم يقع).
   الآن INCR ذرّيّ، والعمر يُضبط مع إنشاء المفتاح (SET NX EX) فلا مفتاح أبديّ، والنافذة تبدأ من أوّل محاولة كما كانت
   (‎<المفتاح>/t يحفظ بدايتها لحساب الدقائق). المفاتيح ‎/n و‎/t جديدة: القديمة نصوص JSON بلا عمر، وINCR عليها يرمي. */
async function hitCounter(key, ttlSec) {
  const kv = require('./kv.js');
  let created = await kv.kvSetIfAbsent(key, '0', ttlSec);
  let n;
  try { n = Number(await kv.kvIncr(key)); } catch (e) {
    /* v-rate-ns (مراجعة الدفعة A): قيمة غير عدديّة في مفتاح العدّاد (سجلّ JSON قديم بلا عمر) كانت ترمي INCR، والرمية تُفهم
       «اسمح» — فيسقط الحدّ للأبد. تُمسح القيمة ويُعاد العدّ مرّة واحدة؛ أيّ عطب آخر يبقى كما كان. */
    if (!/not an integer/i.test(String(e && e.message))) throw e;
    await kv.kvDel(key);
    created = await kv.kvSetIfAbsent(key, '0', ttlSec);
    n = Number(await kv.kvIncr(key));
  }
  if (n === 1 && !created) await kv.kvExpire(key, ttlSec); // انقضى بين الخطوتين فأنشأه INCR بلا عمر
  return { n, created };
}
async function windowHit(base, windowMs) {
  const ttl = Math.max(1, Math.ceil(windowMs / 1000));
  const { n, created } = await hitCounter(base + '/n', ttl);
  if (created || n === 1) {
    try { await require('./kv.js').kvSetRaw(base + '/t', String(Date.now()), ttl); } catch (e) { logError('auth:window-start', e); }
  }
  return n;
}
async function windowMinutes(base, windowMs) {
  let start = NaN;
  try { start = Number(await require('./kv.js').kvGetRaw(base + '/t')); } catch (e) { logError('auth:window-read', e); }
  const left = start > 0 ? start + windowMs - Date.now() : windowMs;
  return Math.max(1, Math.ceil(left / 60000));
}
async function windowBack(base) {
  try { await require('./kv.js').kvDecrBy(base + '/n', 1); } catch (e) { logError('auth:window-back', e); }
}

/* v-account-email: نافذة محاولات في KV — يرجع دقائق الانتظار، أو ٠ إن سُمح. عطب KV = يُسمح (لا يُقفل الجميع بعطل).
   v-rate-ns (مراجعة الدفعة A): العدّاد في مساحة db/rl/ لم يكتبها الكود القديم قطّ، وقيمة المستخدم مرمَّزة — كان ‎<قاعدة قديمة>/n
   والبريد خامًا، فبريد «V/n» عند كود قديم يكتب JSON بلا عمر في مفتاح عدّاد V نفسه فيسقط حدّه للأبد. */
async function rateWait(kind, value, limit, windowMs) {
  const rateKey = 'db/rl/' + kind + '/' + encodeURIComponent(String(value));
  try {
    if ((await windowHit(rateKey, windowMs)) > limit) return await windowMinutes(rateKey, windowMs);
  } catch (e) { logError('auth:rate', e); }
  return 0;
}

/* v-known-net (مراجعة الدفعة A): «شبكة معروفة» يكتبها كلّ نجاح موثَّق لا الدخول بكلمة المرور وحده — التسجيل، والتحقّق المنزلق
   (المالك نادرًا ما يدخل بكلمته)، ورمز البريد، والاسترجاع، وGoogle. وإلّا فرشّ ٥٠ كلمة خاطئة من شبكات متفرّقة كلّ ربع ساعة يقفل
   صاحب الحساب حتّى من بيته. SET NX واحد (لا كتابة كلّ مرّة)، وعطب KV لا يُفشل الدخول. */
function knownNetKey(key, net) {
  return 'db/login-ok/' + encodeURIComponent(key) + '/' + encodeURIComponent(net || '-');
}
async function markKnownNet(key, req) {
  try {
    const { clientIp, giftNet } = require('./welcome-gift.js');
    const net = giftNet(clientIp(req));
    if (key && net) await require('./kv.js').kvSetIfAbsent(knownNetKey(String(key).trim().toLowerCase(), net), '1', LOGIN_KNOWN_NET_SEC);
  } catch (e) { logError('auth:known-net', e); }
}

/* v-auth-throttle: قفل الدخول لا يُستعمل سلاحًا. كان عدّادًا في سجلّ الحساب نفسه: ست محاولات خاطئة من أيّ شبكة تقفل صاحبه
   ربع ساعة (المسبار: كلمة المالك الصحيحة بعد ستّ محاولات غرباء = ٤٢٩)، والسباق يتجاوزه. الآن ثلاثة عدّادات ذرّيّة في ١٥ دقيقة:
   (١) الحساب من شبكة واحدة (giftNet: IPv4 كما هو وIPv6 بشبكته /64) — يُقفل بعد ٦؛ غريب على شبكة أخرى لا يقفلك.
   (٢) الحساب كلّه — حدّ ليّن ٥٠: فوقه لا تُقيَّم كلمة مرور إلّا من شبكة دخل منها الحساب بنجاح في آخر ٣٠ يومًا (db/login-ok)،
       فهجوم موزَّع من آلاف العناوين يقف عند ٥٠ تخمينًا وصاحب الحساب من بيته أو مكتبه يدخل؛ ومن شبكة جديدة أثناء الهجوم
       ينتظر النافذة أو يدخل برمز البريد.
   (٣) الشبكة عبر كلّ الحسابات — ١٠٠ (حشو بيانات الاعتماد)؛ مكتب بعشرين موظّفًا خلف عنوان واحد بعيد عنها بأخطاء الكتابة.
   الزيادة قبل تقييم كلمة المرور، فالمتوازي لا يتجاوز الحدّ؛ والمحاولة المحجوبة تُرَدّ فلا يُحسب إلّا ما قُيِّم؛ والدخول الناجح
   يُرجع زيادته ويمسح عدّاد زوجه ويحفظ شبكته. لا شيء يُكتب في السجلّ (failedLoginCount/lockUntil القديمان لا يُقرآن).
   عطب KV = يُسمح. */
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_PAIR_MAX = 6;
const LOGIN_ACCOUNT_SOFT = 50;
const LOGIN_NET_MAX = 100;
const LOGIN_KNOWN_NET_SEC = 30 * 86400;
async function loginGate(key, req) {
  const acct = 'db/login-fail/' + encodeURIComponent(key);
  let net = '';
  let netBase = null;
  const taken = [];
  const giveBack = async () => { for (const b of taken.splice(0)) await windowBack(b); };
  const pairOf = () => acct + '/' + encodeURIComponent(net || '-');
  const knownKey = () => knownNetKey(key, net);
  try {
    const { clientIp, giftNet } = require('./welcome-gift.js');
    net = giftNet(clientIp(req));
    if (net) netBase = 'db/login-fail-net/' + encodeURIComponent(net);
    const a = await windowHit(acct, LOGIN_WINDOW_MS); taken.push(acct);
    if (a > LOGIN_ACCOUNT_SOFT && !(await require('./kv.js').kvGetRaw(knownKey()))) {
      await giveBack();
      return { wait: await windowMinutes(acct, LOGIN_WINDOW_MS) };
    }
    const p = await windowHit(pairOf(), LOGIN_WINDOW_MS);
    if (p > LOGIN_PAIR_MAX) { await giveBack(); return { wait: await windowMinutes(pairOf(), LOGIN_WINDOW_MS) }; }
    taken.push(pairOf());
    if (netBase) {
      const n = await windowHit(netBase, LOGIN_WINDOW_MS); taken.push(netBase);
      if (n > LOGIN_NET_MAX) { await giveBack(); return { wait: await windowMinutes(netBase, LOGIN_WINDOW_MS) }; }
    }
  } catch (e) {
    logError('auth:login-gate', e);
    await giveBack();
    return { wait: 0, passed: async () => {} };
  }
  return {
    wait: 0,
    passed: async () => {
      await windowBack(acct);
      if (netBase) await windowBack(netBase);
      try {
        const kv = require('./kv.js');
        await kv.kvDel(pairOf() + '/n'); await kv.kvDel(pairOf() + '/t');
        await kv.kvSetRaw(knownKey(), '1', LOGIN_KNOWN_NET_SEC);
      } catch (e) { logError('auth:login-clear', e); }
    },
  };
}

async function sendMail(toEmail, subject, html) {
  if (!RESEND_API_KEY) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: MAIL_FROM, reply_to: String(process.env.OWNER_NOTIFY_EMAIL || '').trim() || undefined, to: [toEmail], subject, html }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) logError('auth:mail', new Error('resend_' + r.status), { status: r.status });
    return r.ok;
  } catch (e) {
    logError('auth:mail', e);
    return false;
  }
}

/* v-audit-auth (srv-auth-9): رسائل المصادقة بلا حساب (رمز الدخول، الاسترجاع، إرشاد Google، رمز «حسابي») لم يكن لها سقف عامّ —
   سكربت يطلب رموزًا لآلاف العناوين يستنفد حصّة البريد فتتوقّف رموز الدخول وروابط الاسترجاع للجميع ويتضرّر صيت النطاق.
   الآن سقف يوميّ (UTC) عامّ AUTH_MAIL_DAY_CAP (الافتراضيّ ١٠٠٠، يُقرأ عند النداء) يُحجز قبل الإرسال؛ فوقه لا رسالة (المسار القائم
   «تعذّر الإرسال»)، ويُسجَّل الخطأ ويصل المالك إشعار واحد في اليوم. عطب KV = يُسمح (لا يُقفل الجميع بعطل). إشعارات المالك (sendMail) خارجه. */
const AUTH_MAIL_DAY_CAP_DEFAULT = 1000;
async function authMailAllowed() {
  const cap = Math.max(1, Math.floor(Number(process.env.AUTH_MAIL_DAY_CAP) || AUTH_MAIL_DAY_CAP_DEFAULT));
  const day = new Date().toISOString().slice(0, 10);
  try {
    if ((await hitCounter('db/rl/auth-mail-day/' + day + '/n', 2 * 86400)).n <= cap) return true;
    logError('auth:mail-cap', new Error('auth mail daily cap reached'), { cap });
    if (await require('./kv.js').kvSetIfAbsent('db/alerts/auth-mail-cap/' + day, '1', 2 * 86400)) {
      try {
        await require('./_owner-alert.js').pushToOwners({ title: '⚠️ سقف رسائل الدخول اليوميّ', body: 'بلغت رسائل رموز الدخول والاسترجاع ' + cap + ' اليوم — توقّف الإرسال حتّى الغد. راجع سجلّ الأخطاء.', url: '/' });
      } catch (e) { logError('auth:mail-cap-alert', e); }
    }
    return false;
  } catch (e) { logError('auth:mail-budget', e); return true; }
}
async function sendAuthMail(toEmail, subject, html) {
  if (!RESEND_API_KEY) return false; // لا مفتاح = لا رسالة ولا حجز
  if (!(await authMailAllowed())) return false;
  return sendMail(toEmail, subject, html);
}

async function sendResetEmail(toEmail, username, resetToken, isEn) {
  const link = siteUrl() + '/?resetToken=' + encodeURIComponent(resetToken) + '&ru=' + encodeURIComponent(username);
  const name = escapeHtml(username);
  const subject = isEn ? 'Reset your password — om ai' : 'إعادة تعيين كلمة المرور — om ai';
  const html = isEn
    ? `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2>Reset your password</h2>
        <p>Hi ${name}, click the button below to set a new password. This link expires in 30 minutes.</p>
        <p><a href="${link}" style="background:#00c896;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">Reset Password</a></p>
        <p style="color:#888;font-size:13px">If you didn't request this, ignore this email.</p>
       </div>`
    : `<div dir="rtl" style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2>إعادة تعيين كلمة المرور</h2>
        <p>مرحبًا ${name}، اضغط الزر بالأسفل لتعيين كلمة مرور جديدة. الرابط صالح لمدة 30 دقيقة.</p>
        <p><a href="${link}" style="background:#00c896;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">إعادة تعيين كلمة المرور</a></p>
        <p style="color:#888;font-size:13px">إذا لم تطلب هذا، تجاهل هذا الإيميل.</p>
       </div>`;
  return sendAuthMail(toEmail, subject, html); // v-audit-auth (srv-auth-9)
}

// v-google-login-help: بريد «نسيت كلمة المرور» لحساب أُنشئ بزرّ Google — لا رابط إعادة (لا كلمة مرور له أصلًا) بل الطريق الصحيح للدخول.
async function sendGoogleHintEmail(toEmail, username, isEn) {
  const name = escapeHtml(username);
  const link = siteUrl() + '/';
  const subject = isEn ? 'How to sign in — om ai' : 'طريقة دخولك — om ai';
  const html = isEn
    ? `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2>Your account signs in with Google</h2>
        <p>Hi ${name}, your account was created with Google, so it has no password of its own. Open the app, tap <b>Continue with Google</b> and choose this email.</p>
        <p><a href="${link}" style="background:#00c896;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">Open the app</a></p>
        <p style="color:#888;font-size:13px">If you didn't request this, ignore this email.</p>
       </div>`
    : `<div dir="rtl" style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2>حسابك يدخل بزرّ Google</h2>
        <p>مرحبًا ${name}، حسابك أُنشئ بحساب Google فلا كلمة مرور خاصّة له. افتح التطبيق واضغط <b>المتابعة عبر Google</b> واختر هذا البريد.</p>
        <p><a href="${link}" style="background:#00c896;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">افتح التطبيق</a></p>
        <p style="color:#888;font-size:13px">إذا لم تطلب هذا، تجاهل هذا الإيميل.</p>
       </div>`;
  return sendAuthMail(toEmail, subject, html); // v-audit-auth (srv-auth-9)
}

function genNumericOtp() {
  // crypto.randomInt is rejection-free and avoids modulo bias.
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

async function sendOtpEmail(toEmail, otpCode, isEn) {
  const subject = isEn ? 'Verification Code — om ai' : 'رمز التحقق — om ai';
  const html = isEn
    ? `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;text-align:center">
        <h2 style="margin-bottom:4px">Your verification code</h2>
        <p style="color:#888;font-size:13px;margin-top:0">Enter this code to sign in. It expires in 5 minutes.</p>
        <div style="font-size:36px;font-weight:bold;letter-spacing:10px;background:#f4f4f5;color:#111;padding:18px 10px;border-radius:12px;margin:20px 0">${otpCode}</div>
        <p style="color:#888;font-size:13px">If you didn't request this, ignore this email.</p>
       </div>`
    : `<div dir="rtl" style="font-family:sans-serif;max-width:480px;margin:0 auto;text-align:center">
        <h2 style="margin-bottom:4px">رمز التحقق الخاص بك</h2>
        <p style="color:#888;font-size:13px;margin-top:0">أدخل هذا الرمز لتسجيل الدخول. صالح لمدة 5 دقائق.</p>
        <div style="font-size:36px;font-weight:bold;letter-spacing:10px;background:#f4f4f5;color:#111;padding:18px 10px;border-radius:12px;margin:20px 0">${otpCode}</div>
        <p style="color:#888;font-size:13px">إذا لم تطلب هذا، تجاهل هذا الإيميل.</p>
       </div>`;
  return sendAuthMail(toEmail, subject, html); // v-audit-auth (srv-auth-9)
}

// v-vip-verified: رسالة رمز التغيير بصياغتها (لا «لتسجيل الدخول» — من يطلب تغيير بريده ثمّ يرى «دخول» يُخدع أو يرتبك).
async function sendEmailChangeOtp(toEmail, otpCode, lang) {
  const isEn = !!lang && lang !== 'ar';
  const subject = isEn ? 'Confirm your email — om ai' : 'تأكيد الإيميل — om ai';
  const html = isEn
    ? `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;text-align:center">
        <h2 style="margin-bottom:4px">Confirm this email for your account</h2>
        <p style="color:#888;font-size:13px;margin-top:0">Enter this code in My account to link this email. It expires in 10 minutes.</p>
        <div style="font-size:36px;font-weight:bold;letter-spacing:10px;background:#f4f4f5;color:#111;padding:18px 10px;border-radius:12px;margin:20px 0">${otpCode}</div>
        <p style="color:#888;font-size:13px">If you didn't request this, ignore this email — nothing changes.</p>
       </div>`
    : `<div dir="rtl" style="font-family:sans-serif;max-width:480px;margin:0 auto;text-align:center">
        <h2 style="margin-bottom:4px">تأكيد هذا الإيميل لحسابك</h2>
        <p style="color:#888;font-size:13px;margin-top:0">اكتب هذا الرمز في «حسابي» لربط الإيميل بحسابك. صالح لمدة 10 دقائق.</p>
        <div style="font-size:36px;font-weight:bold;letter-spacing:10px;background:#f4f4f5;color:#111;padding:18px 10px;border-radius:12px;margin:20px 0">${otpCode}</div>
        <p style="color:#888;font-size:13px">إذا لم تطلب هذا، تجاهل هذا الإيميل — لا شيء يتغيّر.</p>
       </div>`;
  return sendAuthMail(toEmail, subject, html); // v-audit-auth (srv-auth-9)
}

/* v-vip-verified: تغيير الإيميل في «حسابي» بخطوتين — email-otp-request ثمّ email-otp-verify بـpurpose:'change' ورمز الجلسة.
   الرمز مربوط بالحساب والبريد الجديد معًا (db/otp-change/<الاسم>)، وفي مفتاح وحدود غير رمز الدخول (db/otp/<البريد>): رمز الدخول
   لا يؤكّد تغييرًا، ورمز التغيير لا يُدخل ولا يُنشئ حسابًا، ومن يطلب رموز دخول لبريدٍ لا يُتلف رمز تغييره. الحفظ بعد الرمز وحده،
   ومعه الختم والفهرس ومدخل VIP. الأخطاء برمز code تعرضه الواجهة بلغتها الـ١٤. */
const EMAIL_CHANGE_TTL_MS = 10 * 60 * 1000;
const EMAIL_CHANGE_MAX_TRIES = 5;
const EMAIL_CHANGE_NET_MAX = 30;
const EMAIL_CHANGE_NET_WINDOW_MS = 15 * 60 * 1000;
function emailChangeKey(u) { return 'db/otp-change/' + encodeURIComponent(u); }

async function emailChangeRequest(req, res, body, m) {
  const u = verifyToken(body.token);
  if (!u) { res.status(401).json({ error: m('الجلسة منتهية، سجل الدخول من جديد', 'Session expired, please log in again'), code: 'session' }); return; }
  if (!body.email || !isValidEmail(body.email)) { res.status(400).json({ error: m('صيغة الإيميل غير صحيحة', 'Invalid email format'), code: 'bad_email' }); return; }
  const key = String(body.email).trim().toLowerCase();
  const user = await getUser(u);
  if (!user || user.deleted) { res.status(404).json({ error: m('تعذر العثور على الحساب', 'Could not find the account'), code: 'not_found' }); return; }
  // v-audit-auth (srv-auth-8): رمز أقدم من آخر تغيير لكلمة المرور لا يربط بريدًا (ثمّ يستعيد به الحساب)
  if (!sessionCurrent(user, body.token)) { res.status(401).json({ error: m('الجلسة منتهية، سجل الدخول من جديد', 'Session expired, please log in again'), code: 'session' }); return; }
  if (user.banned) { res.status(403).json({ error: m('تم إيقاف هذا الحساب من قبل الإدارة', 'This account has been suspended by admin'), banned: true, code: 'banned' }); return; }
  if (user.email === key && emailVerifiedFor(u, user)) { res.status(200).json({ ok: true, verified: true, email: key }); return; }
  // الحدود قبل فحص «مرتبط بحساب آخر» (كان قبلها سؤالًا بلا حدّ: هل لهذا البريد حساب؟ — مراجعة النقض). حدّ البريد لكلّ زوج (حساب، بريد)
  // فغريبٌ لا يستنفد حصّة صاحب البريد؛ وسقف أوسع للبريد من كلّ الحسابات يمنع إغراق صندوقه.
  // الحساب الذي يحمل هذا البريد محفوظًا (من يؤكّد بريده القائم) خارج السقف العامّ: غرباء يستنفدونه لا يقفلونه عنه (مراجعة النقض).
  const mins = (await rateWait('mail-change-acct', u, 5, 15 * 60 * 1000))
    || (await rateWait('mail-change-to', u + '|' + key, 3, 15 * 60 * 1000))
    || (user.email === key ? 0 : await rateWait('mail-change-all', key, 10, 60 * 60 * 1000));
  if (mins) { res.status(429).json({ error: m('محاولات كثيرة، حاول بعد ' + mins + ' دقيقة', 'Too many attempts, try again in ' + mins + ' min'), code: 'too_many', minutes: mins }); return; }
  if (await verifiedHolderOf(key, u)) { res.status(409).json({ error: m('هذا الإيميل مرتبط بحساب آخر.', 'This email is already linked to another account.'), code: 'email_taken' }); return; }
  if (!RESEND_API_KEY) { res.status(500).json({ error: m('خدمة البريد غير مهيأة — أبلغ مسؤول التطبيق', 'Mail service is not configured — contact the app admin'), code: 'mail_off' }); return; }
  const otpCode = genNumericOtp();
  await kvPutJSON(emailChangeKey(u), { email: key, otp: otpCode, exp: Date.now() + EMAIL_CHANGE_TTL_MS });
  if (!(await sendEmailChangeOtp(key, otpCode, body.lang))) {
    res.status(500).json({ error: m('تعذر إرسال الإيميل، حاول لاحقًا', 'Could not send the email, try again later'), code: 'mail_failed' });
    return;
  }
  res.status(200).json({ ok: true, sent: true });
}

async function emailChangeVerify(req, res, body, m) {
  const bad = () => res.status(401).json({ error: m('رمز غير صحيح أو منتهي', 'Invalid or expired code'), code: 'bad_otp' });
  const u = verifyToken(body.token);
  if (!u) { res.status(401).json({ error: m('الجلسة منتهية، سجل الدخول من جديد', 'Session expired, please log in again'), code: 'session' }); return; }
  if (!body.email || !isValidEmail(body.email) || !body.otp) { bad(); return; }
  const key = String(body.email).trim().toLowerCase();
  // حدّ الشبكة كرمز الدخول (v-otp-cap): ٣٠ محاولة فاشلة في ربع ساعة، والناجحة تُرَدّ.
  let netBase = null;
  try {
    const { clientIp, giftNet } = require('./welcome-gift.js');
    const net = giftNet(clientIp(req));
    if (net) netBase = 'db/otp-verify-net/' + encodeURIComponent(net);
    if (netBase && (await windowHit(netBase, EMAIL_CHANGE_NET_WINDOW_MS)) > EMAIL_CHANGE_NET_MAX) {
      const mins = await windowMinutes(netBase, EMAIL_CHANGE_NET_WINDOW_MS);
      res.status(429).json({ error: m('محاولات كثيرة، حاول بعد ' + mins + ' دقيقة', 'Too many attempts, try again in ' + mins + ' min'), code: 'too_many', minutes: mins });
      return;
    }
  } catch (e) { logError('auth:change-net', e); netBase = null; }
  let record = null;
  try { record = await kvGetJSON(emailChangeKey(u)); } catch (e) { logError('auth:change-read', e); record = null; }
  if (!record || record.email !== key || typeof record.otp !== 'string' || !record.exp || record.exp < Date.now()) { bad(); return; }
  const burn = async () => { try { await kvPutJSON(emailChangeKey(u), { otp: null, exp: 0 }); } catch (e) { logError('auth:change-burn', e); } };
  let tries = 0;
  try {
    const ttl = Math.max(1, Math.ceil((Number(record.exp) - Date.now()) / 1000)) || 600;
    tries = (await hitCounter('db/otp-change-fail/' + encodeURIComponent(u) + '/' + Number(record.exp), ttl)).n;
  } catch (e) { logError('auth:change-tries', e); }
  if (tries > EMAIL_CHANGE_MAX_TRIES) { await burn(); bad(); return; }
  const submitted = String(body.otp).trim();
  const known = Buffer.from(record.otp);
  const given = Buffer.from(submitted.padEnd(known.length, '\0'));
  const matches = submitted.length === record.otp.length && given.length === known.length && crypto.timingSafeEqual(given, known);
  if (!matches) {
    if (tries >= EMAIL_CHANGE_MAX_TRIES) await burn();
    bad();
    return;
  }
  if (netBase) await windowBack(netBase);
  await burn();
  const user = await getUser(u);
  if (!user || user.deleted) { res.status(404).json({ error: m('تعذر العثور على الحساب', 'Could not find the account'), code: 'not_found' }); return; }
  if (!sessionCurrent(user, body.token)) { res.status(401).json({ error: m('الجلسة منتهية، سجل الدخول من جديد', 'Session expired, please log in again'), code: 'session' }); return; } // v-audit-auth (srv-auth-8)
  // سباق: أثبته حساب آخر بين الطلب والتأكيد.
  if (await verifiedHolderOf(key, u)) { res.status(409).json({ error: m('هذا الإيميل مرتبط بحساب آخر.', 'This email is already linked to another account.'), code: 'email_taken' }); return; }
  const prevEmail = String(user.email || '').trim().toLowerCase();
  user.email = key;
  user.verifiedEmail = key;
  delete user.emailUnverified; // v-unverified-email: عدّاد الثلاثين يومًا انتهى بالتأكيد
  await putUser(u, user);
  try { await kvPutJSON('db/email-index/' + key, { username: u, at: Date.now() }); } catch (e) { logError('auth:email-index', e); }
  // v-audit-auth (srv-auth-4): فهرس البريد القديم كان يبقى على الحساب فلا يصل بعدها حسابًا حيًّا به — فكلّ دخول برمز البريد القديم ينشئ
  // حسابًا آخر. يُحذف إن كان يشير إلى هذا الحساب وحده (كحذف الحساب).
  if (prevEmail && prevEmail !== key) {
    try {
      const old = await kvGetJSON('db/email-index/' + prevEmail);
      if (old && String(old.username || '').trim().toLowerCase() === u) await require('./kv.js').kvDel('db/email-index/' + prevEmail);
    } catch (e) { logError('auth:email-index-old', e); }
  }
  await promoteVip(key, u);
  res.status(200).json({ ok: true, email: key, verified: true });
}

// ---------------------------------------------------------------------------

module.exports = async (req, res) => {
  // CORS يُركّبه الموجّه account.js عبر installCors — ولا يُكتب هنا يدويًّا.
  // كتابة Access-Control-Allow-Origin:* هنا كانت تلتفّ على _lib/cors.js، وهو
  // الحارس الذي يعترض setHeader تحديدًا لمنع هذا. على نقطة المصادقة بالذات،
  // wildcard يعني أنّ أيّ موقع يستطيع نداء تسجيل الدخول والتسجيل.
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!process.env.UPSTASH_REDIS_REST_URL) {
    res.status(500).json({ error: 'Server is missing UPSTASH_REDIS_REST_URL' });
    return;
  }

  try {
    let body = req.body;
    if (!body || typeof body === 'string') body = JSON.parse(body || '{}');
    // ⚠️ otp كان ناقصًا من هذا التفكيك بينما يُقرأ في email-otp-verify.
    // قراءة متغيّر غير معرَّف ترمي ReferenceError، فكان كلّ تحقّق برمز ينتهي
    // بخطأ 500 — الميزة كانت معطّلة بالكامل.
    const {
      action, username, password, token, newPassword,
      newUsername, currentPassword, avatarDataUrl, lang,
      email, resetToken, otp, purpose,
    } = body;

    /* v-audit-auth (srv-auth-13): كلّ ما ليس en كان يُعامَل عربيًّا — الفرنسيّ والأورديّ يريان العربيّة. الآن الاحتياط إنجليزيّ لأيّ لغة
       غير العربيّة (وبلا lang عربيّ كما كان)، وكلّ خطأ يحمل code ثابتًا تترجمه الواجهة بلغتها الـ١٤ (axAuthL10n). */
    const isEn = !!lang && !/^ar(-|$)/i.test(String(lang));
    // Small helper to return the message matching the caller's UI language
    // (client always sends its current language along with every request).
    const m = (ar, en) => (isEn ? en : ar);

    // Hardening: cap input lengths to block scrypt CPU-exhaustion and junk-data attacks.
    const tooLong = [username, newUsername].some(v => v && String(v).length > 64) ||
      [password, newPassword, currentPassword].some(v => v && String(v).length > 128) ||
      (otp && String(otp).length > 16) ||
      (resetToken && String(resetToken).length > 256) ||
      (email && String(email).length > 254);
    if (tooLong) {
      res.status(400).json({ error: m('المدخلات طويلة جدًا', 'Input too long'), code: 'too_long' });
      return;
    }

    if (action === 'signup') {
      if (!username || !password || String(username).length < 3 || String(password).length < MIN_PASSWORD) {
        res.status(400).json({ error: m('اسم المستخدم 3 أحرف على الأقل وكلمة المرور ' + MIN_PASSWORD + ' أحرف على الأقل', 'Username must be at least 3 characters and password at least ' + MIN_PASSWORD + ' characters'), code: 'signup_short', min: MIN_PASSWORD });
        return;
      }
      const key = String(username).trim().toLowerCase();
      if (RESERVED_USERNAMES.has(key) || isGoogleKey(key)) {
        res.status(409).json({ error: m('اسم المستخدم محجوز', 'Username is reserved'), code: 'name_reserved' });
        return;
      }
      if (key.includes('@')) { // v-name-no-at
        res.status(400).json({ error: m(NAME_AT_AR, NAME_AT_EN), code: 'name_at' });
        return;
      }
      if (nameHasBadChars(key)) { // v-sec-name-chars
        res.status(400).json({ error: m(NAME_BAD_AR, NAME_BAD_EN), code: 'name_bad' });
        return;
      }
      const existing = await getUser(key);
      if (existing) { // v-name-reuse: والمحذوف أيضًا — الاسم لا يُعاد لغير صاحبه
        res.status(409).json({ error: m('اسم المستخدم مستخدم من قبل', 'Username already taken'), code: 'name_taken' });
        return;
      }
      /* v-signup-no-email (أمر المالك ١٨ أكتوبر: «التسجيل ما يحفظ إيميل أبدًا، والإيميل ينضاف بس من «حسابي» بالكود»): كان التسجيل
         من الـAPI يقبل email بلا تحقّق (الواجهة بلا خانة منذ v-simple-login) ويكتب فهرسه — فيزرع أحدٌ إيميل صديق المالك عند تسجيله،
         فيصل صاحب البريد حسابَ الزارع بالاسترجاع أو برمز البريد ويؤكّده هناك (v-vip-verified، مراجعة النقض). الحقل يُتجاهل كلّه:
         لا تحقّق صيغة، ولا «مرتبط بحساب آخر» (سؤال عن وجود الحساب)، ولا حفظ، ولا فهرس. يُضاف من «حسابي» برمز يصل البريد (purpose:'change'). */
      // v-welcome-cap: الهديّة تُحجز بعد كلّ رفض (محاولة فاشلة لا تأكل حصّة)، وفوق السقف حساب برصيد 0 لا رفض.
      const giftOut = {}; // v-farm-gate: capped = سقف الشبكة رفض الهديّة (free-tier.js)
      const gift = await takeWelcomeGift(req, { out: giftOut });
      const { salt, hash } = hashPassword(password);
      const user = {
        username: String(username).trim(), salt, hash,
        email: null, // v-signup-no-email
        avatar: null,
        createdAt: Date.now(),
        // 🎁 هدية الترحيب: 70 نقطة عند التسجيل = فيديو واحد (60) + صورة واحدة (10).
        // ‏0 رقمًا لا غيابًا: سجلّ بلا points يمنحه readPoints (points.js) ٧٠ عند أوّل قراءة.
        points: gift ? 70 : 0,
        welcomeGift: gift,
        giftCapped: giftOut.capped === true,
      };
      await putUser(key, user); // v-signup-no-email: ولا فهرس بريد — يكتبه تأكيد «حسابي» وحده
      await notifyNewAccount({ key, user, method: 'password', req }); // v-signup-notify: بعد الكتابة الناجحة وحدها — في الخلفيّة
      await markKnownNet(key, req);
      res.status(200).json({ ok: true, token: makeToken(key), username: user.username, avatar: null });
      return;
    }

    if (action === 'changeUsername') {
      const u = verifyToken(token);
      if (!u) {
        res.status(401).json({ error: m('الجلسة منتهية، سجل الدخول من جديد', 'Session expired, please log in again'), code: 'session' });
        return;
      }
      if (!newUsername || String(newUsername).trim().length < 3) {
        res.status(400).json({ error: m('اسم المستخدم يجب أن يكون 3 أحرف على الأقل', 'Username must be at least 3 characters'), code: 'name_short' });
        return;
      }
      const oldKey = u;
      const newKey = String(newUsername).trim().toLowerCase();
      if (newKey === oldKey) {
        res.status(200).json({ ok: true, token, username: String(newUsername).trim() });
        return;
      }
      // نفس الحجز المطبَّق في signup: بدونه يُلتفّ عليه من هنا.
      if (RESERVED_USERNAMES.has(newKey) && newKey !== oldKey) {
        res.status(409).json({ error: m('اسم المستخدم محجوز', 'Username is reserved'), code: 'name_reserved' });
        return;
      }
      if (nameHasBadChars(newKey)) { // v-sec-name-chars: لا رموز أنماط/تحكّم في الاسم الجديد
        res.status(400).json({ error: m(NAME_BAD_AR, NAME_BAD_EN), code: 'name_bad' });
        return;
      }
      // المراجعة العدائيّة: قفل لكلّ حساب طوال التغيير. بلا قفل يقرأ طلبان متوازيان السجلّ الحيّ نفسه فيصير الحساب اسمين حيّين
      // (والرصيد منسوخ في كلٍّ منهما من مرآة السجلّ)، ويتجاوزان حدّ التغييرات معًا. المشغول = ٤٢٩ القائم.
      const { kvSetIfAbsent, kvDel } = require('./kv.js');
      const lockKey = 'db/rename-lock/' + encodeURIComponent(oldKey);
      if (!(await kvSetIfAbsent(lockKey, '1', 30))) {
        res.status(429).json({ error: m('محاولات كثيرة، حاول بعد ' + 1 + ' دقيقة', 'Too many attempts, try again in ' + 1 + ' min'), code: 'too_many', minutes: 1 });
        return;
      }
      try {
        // v-name-reuse: رمز اسم ميّت (غيّره صاحبه أو حذفه المالك) لا ينقل شيئًا.
        const user = await getUser(oldKey);
        if (!user || user.deleted) {
          res.status(404).json({ error: m('تعذر العثور على الحساب', 'Could not find the account'), code: 'not_found' });
          return;
        }
        if (!sessionCurrent(user, token)) { // v-audit-auth (srv-auth-8): رمز أقدم من آخر تغيير لكلمة المرور لا ينقل الحساب
          res.status(401).json({ error: m('الجلسة منتهية، سجل الدخول من جديد', 'Session expired, please log in again'), code: 'session' });
          return;
        }
        const clash = await getUser(newKey);
        const ownPrev = Boolean(clash && await tombstoneLeadsTo(clash, oldKey));
        // مفتاح Google لصاحبه وحده: حسابه (googleAuth) ببريده نفسه، راجعًا إلى مفتاحه بسلسلة شواهده.
        const ownGoogleKey = ownPrev && user.googleAuth === true && newKey === 'g_' + String(user.email || '').trim().toLowerCase();
        if (isGoogleKey(newKey) && !ownGoogleKey) {
          res.status(409).json({ error: m('اسم المستخدم محجوز', 'Username is reserved'), code: 'name_reserved' });
          return;
        }
        if (clash && !ownPrev) {
          res.status(409).json({ error: m('اسم المستخدم مستخدم من قبل', 'Username already taken'), code: 'name_taken' });
          return;
        }
        // v-name-no-at: الاسم الجديد وحده — الاسم القائم (newKey === oldKey أعلاه) والعودة إلى اسمك القديم بسلسلة شواهده (ownPrev) لا يُمسّان.
        // مساحة Google (g_…) على ردّها أعلاه.
        if (newKey.includes('@') && !isGoogleKey(newKey) && !ownPrev) {
          res.status(400).json({ error: m(NAME_AT_AR, NAME_AT_EN), code: 'name_at' });
          return;
        }
        // المراجعة العدائيّة (img422-1، farm-6، INT-1): التغيير بالرمز وحده وبلا حدّ كان يصفّر في حلقةٍ كلَّ ما يُعدّ بالاسم ولم يُنقل.
        // حدّان في ٢٤ ساعة متحرّكة لكلّ حساب، في السجلّ نفسه (renameLog — النسخ أدناه ينقله مع الحساب)؛ الثالث ٤٢٩ القائم والسجلّ
        // لا يُمسّ. المالك معفى.
        const now = Date.now();
        const renameLog = (Array.isArray(user.renameLog) ? user.renameLog : []).map(Number).filter((t) => Number.isFinite(t) && now - t < RENAME_WINDOW_MS);
        if (renameLog.length >= RENAME_MAX && !require('./_owner.js').isOwnerName(oldKey)) {
          const mins = Math.max(1, Math.ceil((Math.min(...renameLog) + RENAME_WINDOW_MS - now) / 60000));
          res.status(429).json({ error: m('محاولات كثيرة، حاول بعد ' + mins + ' دقيقة', 'Too many attempts, try again in ' + mins + ' min'), code: 'too_many', minutes: mins });
          return;
        }
        const movedUser = Object.assign({}, user, { username: String(newUsername).trim() });
        // v-rename-move: الأسماء السابقة — اشتراك أو جلسة دفع بدأت بالاسم القديم تُعرف لصاحبها بعد التغيير.
        movedUser.prevUsernames = (Array.isArray(user.prevUsernames) ? user.prevUsernames : []).filter((x) => x !== newKey).concat([oldKey]).slice(-10);
        movedUser.renameLog = renameLog.concat([now]);
        await putUser(newKey, movedUser);
        // Free up the old key so it can't be logged into or re-claimed while pointing here.
        await putUser(oldKey, { deleted: true, movedTo: newKey });
        try { await moveLiveCounters(oldKey, newKey, movedUser); } catch (e) { logError('auth:rename-move', e, { from: String(oldKey).slice(0, 40) }); }
        _banMemo.delete(oldKey); _banMemo.delete(newKey); // الشاهد جلسة ميّتة الآن (isBanned) — لا ينتظر ذاكرة الخمس ثوانٍ
        res.status(200).json({ ok: true, token: makeToken(newKey, movedUser.sv), username: movedUser.username, avatar: movedUser.avatar || null });
      } finally {
        try { await kvDel(lockKey); } catch (e) { logError('auth:rename-unlock', e); }
      }
      return;
    }

    // v-acct-delete (الدفعة ٢، أمر المالك): صاحب الحساب يحذفه من «حسابي» — التفاصيل في account-delete.js
    if (action === 'deleteAccount') {
      const u = verifyToken(token);
      if (!u) { res.status(401).json({ ok: false, code: 'auth', error: m('الجلسة منتهية، سجل الدخول من جديد', 'Session expired, please log in again') }); return; }
      const cur = await getUser(u, 1); // v-audit-auth (srv-auth-8): رمز أقدم من آخر تغيير لكلمة المرور لا يحذف الحساب
      if (cur && !cur.deleted && !sessionCurrent(cur, token)) { res.status(401).json({ ok: false, code: 'auth', error: m('الجلسة منتهية، سجل الدخول من جديد', 'Session expired, please log in again') }); return; }
      const r = await require('./account-delete.js').deleteAccount({ username: u, token, confirmUsername: String(body.confirmUsername || '').slice(0, 64), password });
      if (r.status === 200) _banMemo.delete(u); // الشاهد جلسة ميّتة الآن (isBanned) كما في تغيير الاسم
      res.status(r.status).json(r.body);
      return;
    }

    if (action === 'changePassword') {
      const u = verifyToken(token);
      if (!u) {
        res.status(401).json({ error: m('الجلسة منتهية، سجل الدخول من جديد', 'Session expired, please log in again'), code: 'session' });
        return;
      }
      if (!currentPassword || !newPassword || String(newPassword).length < MIN_PASSWORD) {
        res.status(400).json({ error: m('أدخل كلمة المرور الحالية وكلمة مرور جديدة (' + MIN_PASSWORD + ' أحرف على الأقل)', 'Enter your current password and a new password (at least ' + MIN_PASSWORD + ' characters)'), code: 'pw_short', min: MIN_PASSWORD });
        return;
      }
      const user = await getUser(u);
      if (user && !user.deleted && !sessionCurrent(user, token)) { // v-audit-auth (srv-auth-8)
        res.status(401).json({ error: m('الجلسة منتهية، سجل الدخول من جديد', 'Session expired, please log in again'), code: 'session' });
        return;
      }
      if (!user || user.deleted || !verifyPassword(currentPassword, user.salt, user.hash)) {
        res.status(401).json({ error: m('كلمة المرور الحالية غير صحيحة', 'Current password is incorrect'), code: 'pw_wrong' });
        return;
      }
      const { salt, hash } = hashPassword(newPassword);
      user.salt = salt;
      user.hash = hash;
      user.sv = sessionVersion(user) + 1; // v-audit-auth (srv-auth-8): كلّ جلسة سابقة تموت — وهذا الجهاز يأخذ رمزه الجديد
      await putUser(u, user);
      res.status(200).json({ ok: true, token: makeToken(u, user.sv) });
      return;
    }

    if (action === 'setAvatar') {
      const u = verifyToken(token);
      if (!u) {
        res.status(401).json({ error: m('الجلسة منتهية، سجل الدخول من جديد', 'Session expired, please log in again'), code: 'session' });
        return;
      }
      if (!avatarDataUrl || typeof avatarDataUrl !== 'string' || avatarDataUrl.length > 300000) {
        res.status(400).json({ error: m('الصورة غير صالحة أو كبيرة جدًا', 'Image is invalid or too large'), code: 'avatar_bad' });
        return;
      }
      const user = await getUser(u);
      if (!user || user.deleted) {
        res.status(404).json({ error: m('تعذر العثور على الحساب', 'Could not find the account'), code: 'not_found' });
        return;
      }
      if (!sessionCurrent(user, token)) { res.status(401).json({ error: m('الجلسة منتهية، سجل الدخول من جديد', 'Session expired, please log in again'), code: 'session' }); return; } // v-audit-auth (srv-auth-8)
      user.avatar = avatarDataUrl;
      await putUser(u, user);
      res.status(200).json({ ok: true, avatar: avatarDataUrl });
      return;
    }

    if (action === 'getProfile') {
      const u = verifyToken(token);
      if (!u) {
        res.status(401).json({ error: m('الجلسة منتهية، سجل الدخول من جديد', 'Session expired, please log in again'), code: 'session' });
        return;
      }
      const user = await getUser(u);
      if (!user || user.deleted) {
        res.status(404).json({ error: m('تعذر العثور على الحساب', 'Could not find the account'), code: 'not_found' });
        return;
      }
      if (!sessionCurrent(user, token)) { res.status(401).json({ error: m('الجلسة منتهية، سجل الدخول من جديد', 'Session expired, please log in again'), code: 'session' }); return; } // v-audit-auth (srv-auth-8): لا بريد ولا هاتف لرمز قديم
      // v-vip-verified: «حسابي» يعرف إن كان الإيميل مؤكَّدًا — المحفوظ قبل اليوم غير مؤكَّد، وحفظه بالقيمة نفسها يطلب رمزه.
      res.status(200).json({ ok: true, email: user.email || null, emailVerified: await emailProven(u, user), phone: user.phone || null }); // v-phone-link · v-unverified-email: وحساب الرمز القديم
      return;
    }

    if (action === 'setEmail') {
      // v-vip-verified: لا حفظ بلا رمز — «حسابي» يطلب الرمز (email-otp-request) ويؤكّده (email-otp-verify) بـpurpose:'change'.
      // كان يحفظ أيّ بريد بلا أيّ تحقّق، فيضع أحدٌ إيميل صديق للمالك في حسابه قبل أن يضيفه المالك إلى VIP فيأخذها هو.
      // نسخة قديمة مخزَّنة من التطبيق ما زالت تنادي هذا: رسالة واضحة لا حفظًا.
      res.status(400).json({ error: m('تغيير الإيميل صار برمز يصلك عليه — حدّث التطبيق وجرّب من «حسابي»', 'Changing your email now needs a code sent to it — update the app and try again from My account'), code: 'email_code_required' });
      return;
    }

    if (action === 'forgotPassword') {
      /* v-account-email: من كتب بريدًا يأخذ ردًّا واحدًا وُجد الحساب أم لا — كان «الحساب غير موجود» يكشف أيّ بريد مسجَّل —
         وثلاث محاولات لكلّ بريد في ربع ساعة. الاسم يبقى كما كان (الاسم يُكشف أصلًا عند التسجيل «مستخدم من قبل»). */
      /* v-audit-auth (srv-auth-7): فرع الاسم كان بلا أيّ حدّ — نداء في حلقة يرسل للضحيّة رسالة كلّ مرّة ويستبدل resetTokenHash فيُبطل
         رابطها السابق. الآن حدّ لكلّ شبكة عبر الفرعين (FORGOT_NET_MAX في ربع ساعة)، وحدّ المستلِم نفسه (٣ في ربع ساعة) يتشاركه الفرعان
         بالبريد الذي تذهب إليه الرسالة. */
      const FORGOT_NET_MAX = 30;
      try {
        const { clientIp, giftNet } = require('./welcome-gift.js');
        const fnet = giftNet(clientIp(req));
        const w = fnet ? await rateWait('forgot-net', fnet, FORGOT_NET_MAX, 15 * 60 * 1000) : 0;
        if (w) { res.status(429).json({ error: m('محاولات كثيرة، حاول بعد ' + w + ' دقيقة', 'Too many attempts, try again in ' + w + ' min'), code: 'too_many', minutes: w }); return; }
      } catch (e) { logError('auth:forgot-net', e); }
      const byEmail = email || (username && isValidEmail(String(username).trim()) ? username : null);
      if (byEmail) {
        const emailKey = String(byEmail).trim().toLowerCase();
        if (!isValidEmail(emailKey)) {
          res.status(400).json({ error: m('صيغة الإيميل غير صحيحة', 'Invalid email format'), code: 'bad_email' });
          return;
        }
        if (!RESEND_API_KEY) {
          res.status(500).json({ error: m('خدمة البريد غير مهيأة — أبلغ مسؤول التطبيق', 'Mail service is not configured — contact the app admin'), code: 'mail_off' });
          return;
        }
        const wait = await rateWait('forgot-rate', emailKey, 3, 15 * 60 * 1000);
        if (wait) {
          res.status(429).json({ error: m('محاولات كثيرة، حاول بعد ' + wait + ' دقيقة', 'Too many attempts, try again in ' + wait + ' min'), code: 'too_many', minutes: wait });
          return;
        }
        const found = await resolveLoginUser(emailKey);
        const owner = (found.user && !found.user.deleted && found.user.email) ? found : null;
        // v-unverified-email: رابط الاسترجاع لبريد مؤكَّد على حسابه وحده — وإلّا رسالة المالك ولا رابط ولا بريد.
        if (found.emailUnverified || (owner && !(await emailProven(owner.key, owner.user)))) {
          res.status(403).json({ error: m(UNVERIFIED_EMAIL_AR, UNVERIFIED_EMAIL_EN), code: 'email_unverified' });
          return;
        }
        if (owner) {
          const rt = crypto.randomBytes(24).toString('hex');
          owner.user.resetTokenHash = crypto.createHash('sha256').update(rt).digest('hex');
          owner.user.resetTokenExpiry = Date.now() + 1000 * 60 * 30;
          await putUser(owner.key, owner.user);
          const sent = await sendResetEmail(owner.user.email, owner.user.username, rt, isEn);
          if (!sent) logError('auth:forgot-send', new Error('reset mail not sent'));
        } else {
          // v-google-login-help: حساب «المتابعة عبر Google» لا يجده البحث بالبريد ولا كلمة مرور له يعرفها صاحبه — كان يقرأ
          // «سيصلك رابط» ولا يصله شيء. الآن يصل بريده نفسه إرشاد «ادخل بزرّ Google»؛ الردّ على الشاشة واحد (v-account-email).
          const g = await googleAccountFor(emailKey);
          if (g) {
            const sent = await sendGoogleHintEmail(emailKey, g.user.username, isEn);
            if (!sent) logError('auth:forgot-google-send', new Error('google hint mail not sent'));
          }
        }
        res.status(200).json({ ok: true, message: m('إن كان هذا الإيميل مرتبطًا بحساب فسيصلك رابط إعادة التعيين خلال دقائق.', 'If this email is linked to an account, a reset link will reach you within minutes.'), code: 'forgot_sent' });
        return;
      }
      if (!username) {
        res.status(400).json({ error: m('أدخل اسم المستخدم أو الإيميل', 'Enter your username or email'), code: 'missing_fields' });
        return;
      }
      const { key, user } = await resolveLoginUser(username);
      if (!user || user.deleted) {
        res.status(404).json({ error: m('الحساب غير موجود', 'Account not found'), code: 'not_found' });
        return;
      }
      if (!user.email) {
        res.status(400).json({ error: user.phone
          ? m('لا يوجد إيميل مسجل لهذا الحساب — استرجع حسابك برقم هاتفك المربوط', 'No email is registered for this account — recover it with your linked phone number')
          : m('لا يوجد إيميل ولا رقم هاتف مرتبط بهذا الحساب، فلا يمكن استرجاعه من هنا', 'This account has no email or phone number linked, so it cannot be recovered from here'),
          code: user.phone ? 'no_email_phone' : 'no_recovery' });
        return;
      }
      if (!(await emailProven(key, user))) { // v-unverified-email: الرابط كان يذهب لبريد لم يُثبت — صندوق صاحبه لا صاحب الحساب
        res.status(403).json({ error: m(UNVERIFIED_EMAIL_AR, UNVERIFIED_EMAIL_EN), code: 'email_unverified' });
        return;
      }
      const toWait = await rateWait('forgot-rate', String(user.email).trim().toLowerCase(), 3, 15 * 60 * 1000); // v-audit-auth (srv-auth-7)
      if (toWait) {
        res.status(429).json({ error: m('محاولات كثيرة، حاول بعد ' + toWait + ' دقيقة', 'Too many attempts, try again in ' + toWait + ' min'), code: 'too_many', minutes: toWait });
        return;
      }
      const rt = crypto.randomBytes(24).toString('hex');
      const rtHash = crypto.createHash('sha256').update(rt).digest('hex');
      user.resetTokenHash = rtHash;
      user.resetTokenExpiry = Date.now() + 1000 * 60 * 30; // 30 minutes
      await putUser(key, user);
      const sent = await sendResetEmail(user.email, user.username, rt, isEn);
      if (!sent) {
        res.status(500).json({ error: m('تعذر إرسال الإيميل، حاول لاحقًا', 'Could not send the email, try again later'), code: 'mail_failed' });
        return;
      }
      const masked = user.email.replace(/^(.{2}).*(@.*)$/, '$1***$2');
      res.status(200).json({ ok: true, message: m('تم إرسال رابط إعادة التعيين إلى ' + masked, 'A reset link was sent to ' + masked), code: 'forgot_sent_to', masked });
      return;
    }

    if (action === 'resetWithToken') {
      if (!username || !resetToken || !newPassword || String(newPassword).length < MIN_PASSWORD) {
        res.status(400).json({ error: m('رابط غير صالح أو كلمة مرور قصيرة (' + MIN_PASSWORD + ' أحرف على الأقل)', 'Invalid link or password too short (at least ' + MIN_PASSWORD + ' characters)'), code: 'reset_short', min: MIN_PASSWORD });
        return;
      }
      const key = String(username).trim().toLowerCase();
      const user = await getUser(key);
      const rtHash = crypto.createHash('sha256').update(String(resetToken)).digest('hex');
      if (!user || user.deleted || !user.resetTokenHash || user.resetTokenHash !== rtHash || !user.resetTokenExpiry || user.resetTokenExpiry < Date.now()) {
        res.status(401).json({ error: m('الرابط غير صالح أو منتهي الصلاحية، اطلب رابطًا جديدًا', 'The link is invalid or expired, request a new one'), code: 'reset_bad' });
        return;
      }
      const { salt, hash } = hashPassword(newPassword);
      user.salt = salt;
      user.hash = hash;
      user.resetTokenHash = null;
      user.resetTokenExpiry = null;
      user.sv = sessionVersion(user) + 1; // v-audit-auth (srv-auth-8): الاستعادة تُبطل كلّ جلسة سابقة
      await putUser(key, user);
      await markKnownNet(key, req);
      res.status(200).json({ ok: true, token: makeToken(key, user.sv), username: user.username, avatar: user.avatar || null });
      return;
    }

    if (action === 'login') {
      if (!username || !password) {
        res.status(400).json({ error: m('أدخل اسم المستخدم أو الإيميل وكلمة المرور', 'Enter your username or email and password'), code: 'missing_fields' });
        return;
      }
      const { key, user, emailUnverified } = await resolveLoginUser(username);
      // v-auth-throttle: الحدّ قبل تقييم كلمة المرور، وبعدّادات ذرّيّة لكلّ (حساب، شبكة) — انظر loginGate.
      const gate = await loginGate(key, req);
      if (gate.wait) {
        const mins = gate.wait;
        res.status(429).json({ error: m('محاولات كثيرة فاشلة. حاول بعد ' + mins + ' دقيقة', 'Too many failed attempts. Try again in ' + mins + ' min'), code: 'too_many', minutes: mins });
        return;
      }
      if (!user || user.deleted || !verifyPassword(password, user.salt, user.hash)) {
        res.status(401).json({ error: m('اسم المستخدم أو الإيميل أو كلمة المرور غير صحيحة', 'Incorrect username, email or password'), code: 'bad_credentials' });
        return;
      }
      await gate.passed();
      // v-unverified-email: بعد كلمة المرور الصحيحة لا قبلها — من لا يعرفها يرى «غير صحيحة» كما كان، ولا يعرف أنّ البريد على حساب.
      if (emailUnverified) {
        res.status(403).json({ error: m(UNVERIFIED_EMAIL_AR, UNVERIFIED_EMAIL_EN), code: 'email_unverified' });
        return;
      }
      if (user.banned) {
        res.status(403).json({ error: m('تم إيقاف هذا الحساب من قبل الإدارة', 'This account has been suspended by admin'), banned: true, code: 'banned' });
        return;
      }
      res.status(200).json({ ok: true, token: makeToken(key, user.sv), username: user.username, avatar: user.avatar || null, emailToConfirm: await emailToConfirmFor(key, user) });
      return;
    }

    if (action === 'verify') {
      const u = verifyToken(token);
      if (!u) {
        res.status(401).json({ error: m('الجلسة منتهية، سجل الدخول من جديد', 'Session expired, please log in again'), code: 'session' });
        return;
      }
      // Trust a validly-signed, unexpired token even if the user record lookup
      // is momentarily unavailable (e.g. right after signup) — avoids forcing a
      // fresh login due to brief storage propagation delay.
      const user = await getUser(u);
      // v-audit-auth (srv-auth-8): رمز أقدم من آخر تغيير لكلمة المرور أو استعادتها لا يُجدَّد — الجلسة المسرَّبة تموت هنا
      if ((user && user.deleted) || !sessionCurrent(user, token)) {
        res.status(401).json({ error: m('الجلسة منتهية، سجل الدخول من جديد', 'Session expired, please log in again'), code: 'session' });
        return;
      }
      if (user && user.banned) {
        res.status(403).json({ error: m('تم إيقاف هذا الحساب من قبل الإدارة', 'This account has been suspended by admin'), banned: true, code: 'banned' });
        return;
      }
      let adminMessage = null;
      if (user && user.pendingMessage) {
        adminMessage = user.pendingMessage;
        // Deliver once, then clear so it doesn't repeat on the next verify.
        try {
          const updated = Object.assign({}, user, { pendingMessage: null });
          await putUser(u, updated);
        } catch (e) { logError('auth:clear-msg', e); }
      }
      // 🔄 جلسة منزلقة: توكن جديد بعمر كامل مع كل تحقق ناجح — المستخدم
      // النشط لا يُطرد أبدًا بانتهاء صلاحية الثلاثين يومًا الثابتة.
      await markKnownNet(u, req);
      // v-unverified-email: التنبيه عند كلّ فتح ما دام البريد غير مؤكَّد. نسخة بلا الرسالة المسلَّمة: ختم حساب الرمز القديم يكتبها فلا تعود.
      const emailToConfirm = user ? await emailToConfirmFor(u, adminMessage ? Object.assign({}, user, { pendingMessage: null }) : user) : null;
      res.status(200).json({ ok: true, token: makeToken(u, user ? user.sv : tokenVersion(token)), username: user ? user.username : u, avatar: user ? (user.avatar || null) : null, adminMessage, emailToConfirm });
      return;
    }

    /* v-phone-link (أمر المالك ٤ أكتوبر «ربط الهاتف بالواتساب أو تيليجرام، اللي يرسل بالمجان»): رمز يعيش ١٠ دقائق،
       والمستخدم يرسله بنفسه (واتساب) أو يشارك رقمه في البوت (تيليجرام) — لا رسالة مدفوعة. الربط لحساب مسجَّل،
       والاسترجاع لمن نسي؛ والحالة لصاحب الرمز وحده (الرمز سرّه). حدود: ٥ رموز لكلّ حساب أو عنوان في ربع ساعة. */
    if (action === 'phone-link-start' || action === 'phone-recover-start' || action === 'phone-link-status') {
      const pl = require('./phone-link.js');
      if (action === 'phone-link-status') {
        res.status(200).json(Object.assign({ ok: true }, await pl.status(body.code)));
        return;
      }
      const channel = body.channel === 'whatsapp' ? 'whatsapp' : 'telegram';
      let me = null;
      if (action === 'phone-link-start') {
        me = verifyToken(token);
        if (!me) { res.status(401).json({ error: m('الجلسة منتهية، سجل الدخول من جديد', 'Session expired, please log in again'), code: 'session' }); return; }
        // v-audit-auth (srv-auth-8): رمز أقدم من آخر تغيير لكلمة المرور لا يربط هاتفًا (ثمّ يستعيد به الحساب)
        if (!sessionCurrent(await getUser(me, 1), token)) { res.status(401).json({ error: m('الجلسة منتهية، سجل الدخول من جديد', 'Session expired, please log in again'), code: 'session' }); return; }
      }
      const ip = String((req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || '').split(',')[0].trim().slice(0, 64);
      const wait = await rateWait('phone-start-rate', me ? 'u/' + me : 'ip/' + (ip || 'none'), 5, 15 * 60 * 1000);
      if (wait) { res.status(429).json({ error: m('محاولات كثيرة، حاول بعد ' + wait + ' دقيقة', 'Too many attempts, try again in ' + wait + ' min'), code: 'too_many', minutes: wait }); return; }
      const r = await pl.start({ purpose: me ? 'link' : 'recover', channel, username: me });
      if (r.error === 'channel_unavailable') {
        res.status(503).json(channel === 'whatsapp'
          ? { error: m('الربط عبر واتساب غير مهيّأ بعد — جرّب تيليجرام', 'WhatsApp linking is not set up yet — try Telegram'), code: 'channel_off_wa' }
          : { error: m('الربط عبر تيليجرام غير مهيّأ', 'Telegram linking is not set up'), code: 'channel_off_tg' });
        return;
      }
      res.status(200).json({ ok: true, code: r.code, link: r.link, expiresIn: r.expiresIn, channel: r.channel });
      return;
    }

    // v-vip-verified: purpose:'change' = تغيير الإيميل في «حسابي» برمز الجلسة — مسار منفصل لا يمسّ الدخول بالرمز.
    if ((action === 'email-otp-request' || action === 'email-otp-verify') && purpose === 'change') {
      if (action === 'email-otp-request') await emailChangeRequest(req, res, body, m);
      else await emailChangeVerify(req, res, body, m);
      return;
    }

    if (action === 'email-otp-request') {
      if (!email || !isValidEmail(email)) {
        res.status(400).json({ error: m('صيغة الإيميل غير صحيحة', 'Invalid email format'), code: 'bad_email' });
        return;
      }
      const key = String(email).trim().toLowerCase();

      // Rate limit: max 3 OTP requests per email per 5 minutes — v-auth-throttle: ذرّيًّا (كان قراءة ثمّ كتابة).
      // v-audit-auth (srv-auth-9): وحدّ لكلّ شبكة (giftNet) عبر كلّ العناوين — كان سكربت بلا حساب يرسل لآلاف العناوين من شبكة واحدة.
      const OTP_REQ_NET_MAX = 30; // كحدّ التحقّق للشبكة: مكتب بعشرين موظّفًا خلف عنوان واحد يطلب رموزه
      const now = Date.now();
      let reqNet = '';
      try { const { clientIp, giftNet } = require('./welcome-gift.js'); reqNet = giftNet(clientIp(req)); } catch (e) { logError('auth:otp-req-net', e); }
      const mins = (reqNet ? await rateWait('otp-req-net', reqNet, OTP_REQ_NET_MAX, 15 * 60 * 1000) : 0)
        || await rateWait('otp-rate', key, 3, 5 * 60 * 1000);
      if (mins) {
        res.status(429).json({ error: m('محاولات كثيرة، حاول بعد ' + mins + ' دقيقة', 'Too many attempts, try again in ' + mins + ' min'), code: 'too_many', minutes: mins });
        return;
      }
      // v-unverified-email: بريد على حساب ولم يُؤكَّد عليه — لا رمز دخول (صاحب البريد لا يدخل حساب من زرعه). بعد الحدّ: السؤال محدود.
      if (await unverifiedHolderOf(key)) {
        res.status(403).json({ error: m(UNVERIFIED_EMAIL_AR, UNVERIFIED_EMAIL_EN), code: 'email_unverified' });
        return;
      }

      // تشخيص واضح: غياب مفتاح Resend كان يظهر كـ«تعذر الإرسال» العامة،
      // فيضيع أصل العطل (إعدادات Vercel) خلف رسالة توحي بخلل عابر.
      if (!RESEND_API_KEY) {
        res.status(500).json({ error: m('خدمة البريد غير مهيأة — أبلغ مسؤول التطبيق', 'Mail service is not configured — contact the app admin'), code: 'mail_off' });
        return;
      }

      const otpCode = genNumericOtp();
      // n: هويّة هذا الرمز لعدّاد محاولاته — exp بالملّي ثانية كان يتكرّر لرمزين صدرا في الملّي ثانية نفسها فيرث الثاني محاولات الأوّل
      await kvPutJSON('db/otp/' + key, { otp: otpCode, exp: now + 300000, n: crypto.randomBytes(6).toString('hex') });

      const sent = await sendOtpEmail(key, otpCode, isEn);
      if (!sent) {
        res.status(500).json({ error: m('تعذر إرسال الإيميل، حاول لاحقًا', 'Could not send the email, try again later'), code: 'mail_failed' });
        return;
      }
      res.status(200).json({ ok: true, message: m('تم إرسال رمز التحقق', 'Verification code sent') });
      return;
    }

    if (action === 'email-otp-verify') {
      if (!email || !isValidEmail(email) || !otp) {
        res.status(400).json({ error: m('رمز غير صحيح أو منتهي', 'Invalid or expired code'), code: 'bad_otp' });
        return;
      }
      const key = String(email).trim().toLowerCase();
      /* v-otp-cap (الدفعة A، أمان): التحقّق كان بلا عدّاد — ٣٠٠٠ تخمين خاطئ من ٢٥٠ عنوانًا ثمّ الرمز الصحيح = 200 ورمز جلسة،
         والرمز حيّ خمس دقائق؛ أي أنّ أيّ حساب مربوط ببريد يُخمَّن. الآن: (١) لكلّ رمز صادر خمس محاولات على الأكثر — العدّاد
         ذرّيّ قبل المقارنة فالمتوازي لا يتجاوزها، والخامسة الخاطئة تحرق الرمز (الردّ ٤٠١ العامّ نفسه، والمستخدم يطلب رمزًا جديدًا
         من «رجوع» القائم). (٢) لكلّ شبكة (giftNet) ٣٠ محاولة فاشلة في ربع ساعة عبر كلّ العناوين — الناجحة تُرَدّ، فمكتب بعشرين
         موظّفًا خلف عنوان واحد لا يبلغها بأخطاء الكتابة. الرسائل قائمة. */
      const OTP_MAX_TRIES = 5;
      const OTP_NET_MAX = 30;
      const OTP_NET_WINDOW_MS = 15 * 60 * 1000;
      let netBase = null;
      let otpNet = '';
      try {
        const { clientIp, giftNet } = require('./welcome-gift.js');
        const net = giftNet(clientIp(req));
        otpNet = net;
        if (net) netBase = 'db/otp-verify-net/' + encodeURIComponent(net);
        if (netBase && (await windowHit(netBase, OTP_NET_WINDOW_MS)) > OTP_NET_MAX) {
          const mins = await windowMinutes(netBase, OTP_NET_WINDOW_MS);
          res.status(429).json({ error: m('محاولات كثيرة، حاول بعد ' + mins + ' دقيقة', 'Too many attempts, try again in ' + mins + ' min'), code: 'too_many', minutes: mins });
          return;
        }
      } catch (e) { logError('auth:otp-net', e); netBase = null; }
      let record = null;
      try { record = await kvGetJSON('db/otp/' + key); } catch (e) { logError('auth:otp-read', e); record = null; }
      const submitted = String(otp).trim();
      if (!record || typeof record.otp !== 'string' || !record.exp || record.exp < Date.now()) {
        res.status(401).json({ error: m('رمز غير صحيح أو منتهي', 'Invalid or expired code'), code: 'bad_otp' });
        return;
      }
      const burnOtp = async () => { try { await kvPutJSON('db/otp/' + key, { otp: null, exp: 0 }); } catch (e) { logError('auth:otp-burn', e); } };
      let tries = 0;
      try {
        // العدّاد لهذا الرمز بعينه ويعيش عمره — الرمز الجديد يبدأ من صفر. هويّته n (رمز صدر قبلها: exp كما كان).
        const ttl = Math.max(1, Math.ceil((Number(record.exp) - Date.now()) / 1000)) || 300;
        const codeId = /^[0-9a-f]{12}$/.test(String(record.n || '')) ? record.n : String(Number(record.exp));
        tries = (await hitCounter('db/otp-fail/' + key + '/' + codeId, ttl)).n;
      } catch (e) { logError('auth:otp-tries', e); }
      if (tries > OTP_MAX_TRIES) {
        await burnOtp();
        res.status(401).json({ error: m('رمز غير صحيح أو منتهي', 'Invalid or expired code'), code: 'bad_otp' });
        return;
      }
      /* v-audit-auth (srv-auth-11): العدّاد لكلّ رمز ولكلّ شبكة لا يكفي — من يبدّل شبكته (‏/64 جديد كلّ ٣٠ محاولة) ويطلب ٣ رموز كلّ ٥ دقائق
         يجرّب آلاف التخمينات يوميًّا على بريد واحد (≈١٢٪ للاستيلاء في شهر). الآن عدّاد لكلّ بريد عبر كلّ رموزه (OTP_MAIL_SOFT في ٢٤ ساعة)،
         ذرّيّ قبل المقارنة وبعد عدّاد الرمز (فلا يُحسب إلّا ما سيُقارَن)؛ فوقه لا يُقيَّم رمز إلّا من شبكة دخل منها صاحب الحساب بنجاح (db/login-ok — حدّ loginGate الليّن نفسه)، فالحدّ
         لا يُستعمل سلاحًا على صاحبه من بيته، ومن شبكة جديدة أثناء الهجوم يدخل بكلمة المرور أو بـGoogle أو ينتظر. المحجوبة والناجحة تُرَدّان. */
      const OTP_MAIL_SOFT = 20;
      const OTP_MAIL_WINDOW_MS = 24 * 60 * 60 * 1000;
      const mailBase = 'db/otp-fail-mail/' + encodeURIComponent(key);
      let mailTaken = false;
      try {
        if ((await windowHit(mailBase, OTP_MAIL_WINDOW_MS)) > OTP_MAIL_SOFT) {
          const acct = (await indexOwner(key, 1)) || (await googleAccountFor(key));
          const knownNet = !!(acct && otpNet && (await require('./kv.js').kvGetRaw(knownNetKey(acct.key, otpNet))));
          if (!knownNet) {
            await windowBack(mailBase);
            const mins = await windowMinutes(mailBase, OTP_MAIL_WINDOW_MS);
            res.status(429).json({ error: m('محاولات كثيرة، حاول بعد ' + mins + ' دقيقة', 'Too many attempts, try again in ' + mins + ' min'), code: 'too_many', minutes: mins });
            return;
          }
        }
        mailTaken = true;
      } catch (e) { logError('auth:otp-mail', e); }
      // 6 numeric digits — a plain, constant-length string compare is fine here;
      // timingSafeEqual is used elsewhere only because those secrets vary in
      // encoded length. Both sides here are always padded to 6 bytes.
      const known = Buffer.from(record.otp);
      const given = Buffer.from(submitted.padEnd(known.length, '\0'));
      const matches = submitted.length === record.otp.length && given.length === known.length && crypto.timingSafeEqual(given, known);
      if (!matches) {
        if (tries >= OTP_MAX_TRIES) await burnOtp();
        res.status(401).json({ error: m('رمز غير صحيح أو منتهي', 'Invalid or expired code'), code: 'bad_otp' });
        return;
      }
      if (netBase) await windowBack(netBase);
      if (mailTaken) await windowBack(mailBase);
      // Invalidate immediately so the same code can't be replayed — overwrite with an already-expired record.
      await burnOtp();

      // Find an existing account linked to this email via the email index.
      let userKey = null;
      let user = null;
      let unverified = false;
      try {
        // v-audit-auth (srv-auth-4): الفهرس على اسم تغيّر يتبع شاهده إلى الحساب الحيّ (كان ينشئ حسابًا فارغًا في كلّ دخول).
        const own = await indexOwner(key);
        if (own) {
          // v-unverified-email: رمز صحيح لبريد غير مؤكَّد على هذا الحساب = صاحب البريد لا صاحب الحساب — لا دخول ولا حساب جديد.
          if (await emailProven(own.key, own.user)) {
            userKey = own.key;
            user = own.user;
          } else unverified = true;
        } else {
          // v-audit-auth (srv-auth-4): حساب «المتابعة عبر Google» بلا فهرس بريد — البريد مثبت عليه، والرمز أثبته للتوّ: هو حسابه.
          const g = await googleAccountFor(key);
          if (g && g.user.email === key && await emailProven(g.key, g.user)) {
            userKey = g.key;
            user = g.user;
          }
        }
      } catch (e) { logError('auth:otp-index', e); }
      if (unverified) {
        res.status(403).json({ error: m(UNVERIFIED_EMAIL_AR, UNVERIFIED_EMAIL_EN), code: 'email_unverified' });
        return;
      }

      let isNew = false;
      if (!user) {
        // Auto-create an account: random username derived from the email
        // prefix, an unusable random password (this account only ever logs in
        // via OTP), the email set, and the standard welcome gift.
        //
        // ⚠️ كانت مزرعة نقاط: كلّ بريد جديد = 70 نقطة، وعدد العناوين لا نهائيّ.
        // v-welcome-cap: الهديّة الآن من حصّة العنوان واليوم (welcome-gift.js)، وفوقها رصيد 0.
        const OTP_SIGNUP_GIFT = Math.max(0, Number(process.env.OTP_SIGNUP_GIFT || 70));
        const prefix = key.split('@')[0].replace(/[^a-z0-9]/gi, '').slice(0, 12).toLowerCase() || 'user';
        let candidateKey = '';
        for (let i = 0; i < 8; i++) {
          const suffix = crypto.randomBytes(3).toString('hex');
          candidateKey = (prefix + '_' + suffix).slice(0, 40);
          if (RESERVED_USERNAMES.has(candidateKey)) { candidateKey = ''; continue; }
          const clash = await getUser(candidateKey);
          if (!clash) break; // v-name-reuse: المحذوف ليس حرًّا
          candidateKey = '';
        }
        if (!candidateKey) candidateKey = 'user_' + crypto.randomBytes(6).toString('hex');
        const giftOut = {}; // v-farm-gate: capped = سقف الشبكة رفض الهديّة (free-tier.js)
        const gift = OTP_SIGNUP_GIFT > 0 && await takeWelcomeGift(req, { out: giftOut });
        const { salt, hash } = hashPassword(crypto.randomBytes(32).toString('hex'));
        user = {
          username: candidateKey, salt, hash,
          email: key,
          verifiedEmail: key, // v-vip-verified: الرمز وصل هذا البريد وأنشأ له الحساب — لا مالك آخر له
          avatar: null,
          createdAt: Date.now(),
          points: gift ? OTP_SIGNUP_GIFT : 0,
          welcomeGift: !!gift,
          giftCapped: giftOut.capped === true,
          otpOnly: true,
        };
        userKey = candidateKey;
        await putUser(userKey, user);
        try {
          // v-audit-auth (srv-auth-4): يُكتب فوق أيّ مدخل لا يصل إلى حساب حيّ بهذا البريد (كان يُكتب حين يغيب وحده، فالمدخل القديم
          // بعد تغيير البريد يبقى، وكلّ دخول لاحق ينشئ حسابًا آخر). عطب القراءة يرمي فلا كتابة فوق فهرس صحيح.
          if (!(await indexOwner(key))) {
            await kvPutJSON('db/email-index/' + key, { username: userKey, at: Date.now() });
          }
        } catch (e) { logError('auth:email-index', e); }
        await promoteVip(key, userKey);
        isNew = true;
        await notifyNewAccount({ key: userKey, user, method: 'email-otp', req }); // v-signup-notify
      }

      if (user.banned) {
        res.status(403).json({ error: m('تم إيقاف هذا الحساب من قبل الإدارة', 'This account has been suspended by admin'), banned: true, code: 'banned' });
        return;
      }

      await markKnownNet(userKey, req);
      res.status(200).json({ ok: true, token: makeToken(userKey, user.sv), username: user.username, avatar: user.avatar || null, isNew });
      return;
    }

    res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    // رسالة الاستثناء لا تصل العميل: كانت تكشف داخل الخادم لأيّ أحد
    // (وهي التي كانت تعرض "otp is not defined" للمستخدم).
    logError('auth:handler', e);
    res.status(500).json({ error: 'Auth error', code: 'server' });
  }
};

module.exports.getUser = getUser;
module.exports.getUserOnce = getUserOnce;
module.exports._timing = _timing; // v-time-seam: للاختبارات وحدها
module.exports.putUser = putUser;
module.exports.hashPassword = hashPassword;
module.exports.makeToken = makeToken;
module.exports.markKnownNet = markKnownNet; // v-known-net: والكولباك (auth-google-callback.js)
module.exports.liveAccount = liveAccount; // v-audit-auth (srv-auth-2): الكولباك يتبع شاهد تغيير الاسم
module.exports.verifyToken = verifyToken;
module.exports.encryptUserBlob = encryptUserBlob;
module.exports.decryptUserBlob = decryptUserBlob;
module.exports.UndecryptableUserRecord = UndecryptableUserRecord;
module.exports.userPath = userPath;
module.exports.RESERVED_USERNAMES = RESERVED_USERNAMES;
module.exports.sendMail = sendMail;     // v-signup-notify
module.exports.escapeHtml = escapeHtml; // v-signup-notify

// A ban set from the admin panel only ever guarded the *login* endpoint.
// Any session token minted before the ban stayed valid for its full 30 days,
// so a banned account kept spending the server's AI keys, points, minutes and
// video quota untouched. Every metered path now asks here first.
//
// Two deliberate choices:
//   * fails OPEN — a Redis hiccup must never lock out the whole user base;
//     a handful of banned accounts slipping through beats a total outage.
//   * 5s memo — one request can hit several gates (quota then points), and
//     re-reading the same record each time would double Redis traffic on the
//     hot path. A banned user waits at most 5 seconds longer.
const _banMemo = new Map();
async function isBanned(username) {
  if (!username) return false;
  const now = Date.now();
  const hit = _banMemo.get(username);
  if (hit && hit.exp > now) return hit.v;
  let v = false;
  try {
    // getUserOnce, NOT getUser: the latter retries 4x with a growing sleep
    // (~1.8s total) when a record is missing. That is fine on a login form and
    // ruinous on a path every single chat message walks through.
    const user = await getUserOnce(username);
    // المراجعة العدائيّة (farm-1، img422-2): الشاهد (تغيير الاسم {deleted, movedTo} أو حذف المالك) جلسة ميّتة كالحظر —
    // رمز ما قبل التغيير يبقى صالحًا ٣٠ يومًا وحصصه تبدأ من صفر (moveToday يحذف عدّادات القديم)، فكلّ تغيير اسم كان يهب
    // يومًا جديدًا من الصور المدفوعة، والمسقوف (حدّ 0) معه. الاسم الحيّ لحساب غيّر اسمه ليس شاهدًا أبدًا.
    v = !!(user && (user.banned || user.deleted));
  } catch (e) {
    v = false; // fail open — see note above
  }
  if (_banMemo.size > 500) _banMemo.clear();
  _banMemo.set(username, { v, exp: now + 5000 });
  return v;
}
module.exports.isBanned = isBanned;
module.exports.emailVerifiedFor = emailVerifiedFor; // v-vip-verified: vip.js يحوّل الإيميل إلى حساب أثبته وحده
module.exports.emailProven = emailProven; // v-unverified-email: والكولباك (الربط التلقائيّ بالبريد)
module.exports.settleUnverifiedEmail = settleUnverifiedEmail;
module.exports.sweepUnverifiedEmails = sweepUnverifiedEmails; // email-sweep.js
module.exports.UNVERIFIED_EMAIL_GRACE_MS = UNVERIFIED_EMAIL_GRACE_MS;
