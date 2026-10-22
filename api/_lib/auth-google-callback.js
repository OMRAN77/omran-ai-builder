const crypto = require('crypto');
const { getUser, putUser, makeToken, markKnownNet, emailProven } = require('./auth.js'); // داخل _lib
const { takeWelcomeGift, giftNet, clientIp } = require('./welcome-gift.js'); // v-welcome-cap · v-oauth-bind
const { notifyNewAccount } = require('./signup-notify.js'); // v-signup-notify

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// موضع واحد للعنوان القانونيّ يتشاركه هذا المعالِج ومعالِج البدء، فلا يمكن
// أن يفترق ما يرسله المتصفّح عمّا يرسله الخادم. (انظر _site.js)
const { siteUrl, googleRedirectUri } = require('./_site.js');

function randomPasswordHash() {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(crypto.randomBytes(32).toString('hex'), salt, 64).toString('hex');
  return { salt, hash };
}

module.exports = async (req, res) => {
  // v-google-app-fail: فشل دخول بدأ من غلاف الآيفون («-app») كان يهبط في سفاري على
  // نسخة الموقع كضيف — شاشة دخول فارغة بلا سبب — والتطبيق ينتظر عشر دقائق بصمت.
  // الآن: يُودَع السبب تحت state فيعرضه التطبيق عند العودة، وسفاري يهبط على صفحة
  // «ارجع للتطبيق وحاول مجدّدًا». لا يُكتب فوق جلسة ناجحة مودعة (نداء مكرّر للعودة).
  const st0 = (req.query || {}).state;
  const appSt = typeof st0 === 'string' ? /^([0-9a-f]{16,64})-app$/i.exec(st0) : null;
  const failRedirect = async (reason) => {
    reason = String(reason).slice(0, 64);
    if (appSt) {
      let done = false;
      try {
        const { kvGetJSON, kvPutJSON, kvExpire } = require('./kv.js');
        const key = 'db/oauth-claim/' + appSt[1].toLowerCase();
        const prev = await kvGetJSON(key);
        done = !!(prev && prev.token);
        if (!done) {
          await kvPutJSON(key, { error: reason, ts: Date.now() });
          await kvExpire(key, 600);
        }
      } catch (e) { console.warn('[oauth] fail store failed:', e && e.message); }
      res.writeHead(302, { Location: siteUrl() + '/login-done.html' + (done ? '' : '?gerror=' + encodeURIComponent(reason)) });
      res.end();
      return;
    }
    res.writeHead(302, { Location: siteUrl() + '/?gerror=' + encodeURIComponent(reason) });
    res.end();
  };

  try {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      await failRedirect('google_not_configured');
      return;
    }
    const { code, error, state } = req.query || {};
    if (error) {
      await failRedirect(String(error));
      return;
    }
    if (!code) {
      await failRedirect('missing_code');
      return;
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(code),
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: googleRedirectUri(),
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(10000),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('[Google OAuth]', tokenData && tokenData.error, tokenData && tokenData.error_description);
      await failRedirect('token_exchange_failed');
      return;
    }

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: 'Bearer ' + tokenData.access_token },
      signal: AbortSignal.timeout(10000),
    });
    const profile = await profileRes.json();
    if (!profileRes.ok || !profile.email) {
      await failRedirect('profile_fetch_failed');
      return;
    }

    if (profile.email_verified !== true) {
      await failRedirect('email_not_verified');
      return;
    }

    const email = String(profile.email).trim().toLowerCase();
    let key = 'g_' + email;

    try {
      const { kvGetJSON } = require('./kv.js'); // داخل _lib
      const alias = await kvGetJSON('db/alias/' + key);
      if (alias && alias.primary) {
        key = String(alias.primary);
      } else if ((process.env.ALLOW_EMAIL_AUTOLINK || '').trim() === '1') {
        const idx = await kvGetJSON('db/email-index/' + email);
        if (idx && idx.username) {
          const candidate = await getUser(String(idx.username));
          // v-unverified-email: الربط إلى حساب بريده مؤكَّد عليه وحده — وإلّا حساب g_<البريد> الخاصّ (كما دون الربط).
          if (candidate && !candidate.deleted && String(candidate.email || '').toLowerCase() === email
              && await emailProven(String(idx.username).trim().toLowerCase(), candidate)) {
            key = String(idx.username);
          } else {
            console.warn('[auth] stale email-index entry ignored for ' + email);
          }
        }
      }
    } catch (e) {
      console.warn('[auth] account unification lookup failed:', e && e.message);
    }

    let user = null, reclaimed = false;
    try { user = await getUser(key); }
    catch (e) {
      if (e && e.code === 'USER_RECORD_UNDECRYPTABLE') {
        reclaimed = true; // v-signup-notify: الشخص نفسه يستعيد حسابه — ليس حسابًا جديدًا
        // السجلّ القديم مقفل بسرّ ضاع — وجوجل أثبتت للتوّ ملكيّة البريد نفسه.
        // فالاسترداد هنا مشروع: يُنشأ السجلّ من جديد فوق المقفل، ويعود صاحب
        // البريد إلى حسابه بدل server_error أبديّة. (بخلاف signup بالاسم وحده،
        // حيث يبقى الرمي قائمًا: لا إثبات ملكيّة هناك، والكتابة فوقه استيلاء.)
        console.warn('[auth] sealed record reclaimed via verified Google email: ' + key);
        user = null;
      } else { throw e; }
    }

    // v-name-reuse: مفتاح g_<البريد> لم يكن محجوزًا قبل ٨ أكتوبر، فقد يحمل حسابًا سجّله غير صاحب البريد بكلمة مرور
    // يعرفها — دخول صاحب البريد إليه يجعله يكتب ويشتري في حساب يقرؤه غيره. حساب الكولباك وحده يحمل googleAuth (منذ أوّل نسخة).
    if (user && !user.deleted && key === 'g_' + email && user.googleAuth !== true) {
      console.warn('[auth] g_ key held by a non-Google account — refused: ' + key);
      await failRedirect('account_conflict');
      return;
    }

    if (!user || user.deleted) {
      const wasDeleted = !!(user && user.deleted);
      // v-welcome-cap: كان السجلّ بلا points فيمنحه readPoints ٧٠ بلا أيّ حدّ — الآن من حصّة العنوان واليوم، و0 رقمًا فوقها.
      // دخول حساب قائم لا يمرّ هنا فلا يمسّ العدّادات.
      const giftOut = {}; // v-farm-gate: capped = سقف الشبكة رفض الهديّة (free-tier.js)
      const gift = await takeWelcomeGift(req, { out: giftOut });
      const { salt, hash } = randomPasswordHash();
      user = {
        username: profile.name || email.split('@')[0],
        salt, hash,
        email,
        verifiedEmail: email, // v-vip-verified: Google أثبتته (email_verified أعلاه)
        avatar: profile.picture || null,
        googleAuth: true,
        createdAt: Date.now(),
        points: gift ? 70 : 0,
        welcomeGift: gift,
        giftCapped: giftOut.capped === true,
      };
      await putUser(key, user);
      if (!reclaimed) await notifyNewAccount({ key, user, method: 'google', req, note: wasDeleted ? 'over-deleted' : undefined }); // v-signup-notify
    }

    // v-vip-verified: Google أثبتت البريد للتوّ — حساب مفتاحه g_<البريد> نفسه يُختم به (لا الاسم المستعار ولا الربط التلقائيّ:
    // صاحب ذلك الحساب قد لا يكون صاحب البريد)، ومدخل VIP بهذا البريد خامًا يصير اسم الحساب. عطبٌ هنا لا يُفشل الدخول.
    if (key === 'g_' + email && user.googleAuth === true) {
      if (user.email === email && user.verifiedEmail !== email) {
        user.verifiedEmail = email;
        try { await putUser(key, user); } catch (e) { console.warn('[auth] verified-email mark failed:', e && e.message); }
      }
      try {
        const vip = require('./_vip.js');
        if (typeof vip.promoteVerifiedEmail === 'function') await vip.promoteVerifiedEmail(email, key);
      } catch (e) { console.warn('[auth] vip promote failed:', e && e.message); }
    }

    const token = makeToken(key);
    await markKnownNet(key, req); // v-known-net: دخول Google نجاح موثَّق — شبكته معروفة لحدّ الدخول الليّن
    // v-ios-bridge: على آيفون المثبَّت تهبط هذه العودة في ورقة متصفّح منفصلة
    // عن التطبيق (تخزينهما منفصل) فيضيع الدخول. نودع الجلسة تحت state
    // (عشوائي ولّده التطبيق نفسه) عشر دقائق، والتطبيق يستلمها عند العودة
    // إليه عبر oauth-claim — استلام واحد ثم تُحذف.
    // v-login-done: لاحقة «-app» تعني أن الدخول بدأ من غلاف الآيفون —
    // الإيداع يتم تحت الجزء السداسي وحده (هو ما يطالب به التطبيق)،
    // وسفاري يُوجَّه لصفحة «✅ ارجع للتطبيق» بدل نسخة كاملة من الموقع
    // (التي كانت ترفض gtoken أصلًا لغياب state جلستها — ارتباك بلا فائدة).
    // v-oauth-bind: state يختارها البادئ — قد يكون مهاجمًا أرسل الرابط للضحيّة، و«-app» يضعها هو أيضًا. فالإيداع
    // (للويب و«-app»: تطبيق الشاشة الرئيسيّة في الآيفون ومعاينات Vercel يحتاجانه) يحمل شبكة من أكمل الدخول، و
    // oauth-claim لا يسلّمه إلّا لطلب من الشبكة نفسها — مهاجم من شبكة أخرى لا يستلم شيئًا.
    const stM = typeof state === 'string' ? /^([0-9a-f]{16,64})(-app)?$/i.exec(state) : null;
    if (stM) {
      try {
        const { kvPutJSON, kvExpire } = require('./kv.js');
        await kvPutJSON('db/oauth-claim/' + stM[1].toLowerCase(), {
          token, user: user.username, avatar: user.avatar || '', ts: Date.now(), net: giftNet(clientIp(req)),
        });
        await kvExpire('db/oauth-claim/' + stM[1].toLowerCase(), 600);
      } catch (e) { console.warn('[oauth] claim store failed:', e && e.message); }
    }
    if (stM && stM[2]) {
      res.writeHead(302, { Location: siteUrl() + '/login-done.html' });
      res.end();
      return;
    }
    const params = new URLSearchParams({
      gtoken: token,
      guser: user.username,
      gavatar: user.avatar || '',
      state: typeof state === 'string' ? state : '',
    });
    res.writeHead(302, { Location: siteUrl() + '/?' + params.toString() });
    res.end();
  } catch (e) {
    await failRedirect('server_error');
  }
};
