// بوّابة المالك للنقاط الرقابية (health · feedback · client-errors).
//
// قبل اليوم: هذه النقاط تُفتح بمفتاح واحد يُقرأ من ?key=. ولأنّ لوحات المالك
// داخل التطبيق تناديها من المتصفّح، كُتب المفتاح حرفيًّا في الحزمة العامّة —
// فصار سرًّا معروفًا. ثمّ دُوِّر المفتاح في الخادم ولم تُحدَّث الحزمة، فمات
// المفتاح المنشور: لا ثغرة، ولكن أربع أدوات للمالك عمياء بصمت.
//
// بعد اليوم: إثباتان مقبولان، وكلاهما يُفحص في الخادم وحده.
//   ١) ?key=<MONITOR_KEY>  — من خادمٍ إلى خادم (cron، مراقب خارجي). السرّ يبقى
//      في متغيّرات البيئة ولا يبلغ متصفّحًا أبدًا.
//   ٢) ?token=<جلسة>       — رمز جلسة المالك نفسه، الموقَّع الذي يتحقّق منه
//      /api/admin-stats. فتعمل لوحات المالك بلا سرٍّ في العميل.
//
// ولا سطر هنا يقرأ سجلّ مستخدم: الرمز يُتحقَّق منه بالتوقيع، ويُقارَن اسمه
// وحده. لا بيانات مستخدمين تُلمس.
const crypto = require('crypto');

function ownerUsername() {
  return (process.env.OWNER_USERNAME || 'omran').trim().toLowerCase();
}

// مقارنة ثابتة الزمن: لا تُفشي طول السرّ ولا أوّل حرفٍ يختلف.
function sameSecret(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
}

function keyIsValid(key) {
  try {
    return sameSecret(key, require('./_secrets.js').MONITOR_KEY);
  } catch (e) {
    return false; // المفتاح غائب من البيئة → الباب مغلق، لا مفتوح.
  }
}

function sessionIsOwner(token) {
  try {
    const [payload, sig] = String(token || '').split('.');
    if (!payload || !sig) return false;
    const secret = require('./_secrets.js').AUTH_SECRET;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    if (!sameSecret(sig, expected)) return false;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!data || !(data.exp > Date.now())) return false;
    return String(data.u || '').trim().toLowerCase() === ownerUsername();
  } catch (e) {
    return false;
  }
}

// true حين أثبت المنادي أنّه المالك بأحد الإثباتين.
function isOwner(req) {
  const q = (req && req.query) || {};
  const b = (req && req.body && typeof req.body === 'object') ? req.body : {};
  return keyIsValid(q.key || b.key) || sessionIsOwner(q.token || b.token);
}

module.exports = { isOwner };
