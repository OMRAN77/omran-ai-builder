// api/_lib/welcome-gift.js — v-welcome-cap (ثغرات الفلوس، موافقة المالك «كلهم»): سقف هديّة الترحيب، لا التسجيل.
// كلّ حساب جديد (كلمة مرور، رمز البريد، Google) كان يأخذ ٧٠ نقطة بلا أيّ حدّ: سكربت فتح خمسين حسابًا من عنوان واحد
// فأخذ ٣٥٠٠ نقطة تُصرف وسائط ندفع ثمنها فعلًا. الآن الهديّة من حصّة يوميّة (يوم UTC): لكلّ عنوان — وIPv6 بشبكته /64
// كاملة، فالعميل يملك 2^64 عنوانًا فيها ويدوّرها — وللتطبيق كلّه. التسجيل نفسه لا يُرفض أبدًا: فوق السقف حساب عاديّ
// برصيد 0 صريح (رقم لا غياب — points.readPoints يمنح ٧٠ لكلّ سجلّ بلا points).
// الحجز ذرّيّ (INCR ثمّ مقارنة، وفوق السقف يُردّ ما زيد) فالمتزامن لا يتجاوز السقف. عطب KV = بلا هديّة (fail-closed):
// الهديّة مال، والحساب يُنشأ كما هو.
// البيئة تُقرأ داخل الدالّة (قاعدة الإقلاع البارد): WELCOME_GIFT_PER_IP_DAILY (٥٠) وWELCOME_GIFT_DAILY (٥٠٠)؛ و0 يوقف الهديّة.
const { logError } = require('./log-error.js');

const DAY_TTL_SEC = 172800; // يومان: عدّاد اليوم يبقى حتّى ينتهي يومه في كلّ منطقة زمنيّة ثمّ يسقط وحده

function envInt(name, def) {
  const raw = String(process.env[name] == null ? '' : process.env[name]).trim();
  const n = raw === '' ? NaN : Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : def;
}

// عنوان العميل كما يكتبه Vercel (أوّل x-forwarded-for، ثمّ x-real-ip) — نداء Google يمرّ بلا headers أحيانًا.
function clientIp(req) {
  const h = (req && req.headers) || {};
  const fwd = h['x-forwarded-for'] || h['x-real-ip'] || '';
  const ip = String(fwd).split(',')[0].trim() || String((req && req.socket && req.socket.remoteAddress) || '');
  return ip.slice(0, 64);
}

// الشبكة التي يُحسب عليها السقف: IPv4 كما هو (بلا ::ffff: ولا منفذ)، وIPv6 بأوّل أربع مجموعات (/64).
function giftNet(ip) {
  const s = String(ip || '').trim().toLowerCase().replace(/^\[|\](:\d+)?$/g, '').replace(/%.*$/, '');
  if (!s) return '';
  const v4 = /^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/.exec(s);
  if (v4) return v4[1];
  if (!s.includes(':')) return s.slice(0, 64);
  const halves = s.split('::');
  if (halves.length > 2) return s.slice(0, 64);
  const groups = (x) => (x ? x.split(':') : []);
  const width = (a) => a.reduce((n, g) => n + (g.includes('.') ? 2 : 1), 0); // ذيل IPv4 مدمج = مجموعتان
  const head = groups(halves[0]);
  const tail = halves.length === 2 ? groups(halves[1]) : [];
  const full = halves.length === 2 ? head.concat(Array(Math.max(0, 8 - width(head) - width(tail))).fill('0'), tail) : head;
  const pre = full.slice(0, 4);
  if (pre.length < 4 || pre.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return s.slice(0, 64);
  return pre.map((g) => parseInt(g, 16).toString(16)).join(':') + '::/64';
}

async function giveBack(kv, keys) {
  for (const k of keys) {
    try { await kv.kvDecrBy(k, 1); } catch (e) { logError('auth:welcome-cap-rollback', e); }
  }
}

/** يحجز هديّة ترحيب لهذا الطلب: true = تُمنح، false = حساب برصيد 0. لا ترمي أبدًا.
    v-farm-gate: o.out.capped = true حين رفضها سقف **الشبكة** وحده — لا السقف العامّ (استنزافه من مزرعة لا يحرم الأمين على شبكة
    أخرى أدواته المجّانيّة)، ولا البيئة 0، ولا عطب KV. المسارات الثلاثة تكتبه giftCapped في السجلّ (free-tier.js). وسقف الشبكة
    على تسجيلاتها في اليوم، بهديّة أو بلا هديّة (المراجعة farm-2). */
async function takeWelcomeGift(req, o) {
  const opt = o || {};
  // v-sec-gift-cap: الافتراضيّ كان ٥٠ لكلّ شبكة/يوم — شبكة واحدة تجمع ٣٥٠٠ نقطة يوميًّا تُنفَق على
  // وسائط مدفوعة. خُفِّض إلى ٣ (يُرفع بمتغيّر البيئة عند الحاجة). السقف العامّ اليوميّ كما كان.
  const perIp = envInt('WELCOME_GIFT_PER_IP_DAILY', 3);
  const all = envInt('WELCOME_GIFT_DAILY', 500);
  if (perIp === 0 || all === 0) return false;
  const day = new Date().toISOString().slice(0, 10);
  const net = giftNet(clientIp(req));
  // بلا عنوان (تشغيل محلّيّ) = القاطع العامّ وحده.
  const steps = [];
  if (net) steps.push(['db/welcome-gift/ip/' + encodeURIComponent(net) + '/' + day, perIp, true]);
  steps.push(['db/welcome-gift/all/' + day, all, false]);
  let kv = null;
  const taken = [];
  try {
    kv = opt.kv || require('./kv.js');
    for (const [key, cap, perNet] of steps) {
      await kv.kvSetIfAbsent(key, 0, DAY_TTL_SEC);
      const n = Number(await kv.kvIncr(key));
      taken.push(key);
      if (!(n >= 1) || n > cap) {
        if (perNet && n > cap && opt.out) opt.out.capped = true;
        // المراجعة (farm-2): رفض السقف العامّ يُبقي زيادة الشبكة — عدّاد الشبكة يعدّ تسجيلاتها لا هداياها. كان يُردّ معه، فبعد
        // استنزاف السقف العامّ لا تبلغ شبكةٌ سقفها أبدًا ولا يُسقف أحد بقيّة اليوم. ورفض الشبكة نفسها يردّ زيادتها كما كان.
        await giveBack(kv, perNet ? taken : [key]);
        return false;
      }
    }
    return true;
  } catch (e) {
    logError('auth:welcome-cap', e);
    if (kv) await giveBack(kv, taken);
    return false;
  }
}

// clientIp يُصدَّر لربط إيداع دخول Google وتذكرة ربط Gmail بشبكة من أكملهما (v-oauth-bind) — المحلّل نفسه لا نسخة ثانية.
module.exports = { takeWelcomeGift, giftNet, clientIp, DAY_TTL_SEC };
