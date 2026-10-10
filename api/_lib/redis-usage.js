// v-redis-capacity (المالك ٤ أكتوبر: «التطبيق نظيف مافيه أي شي — شوف المشكلة» والقاعدة ٢٧٤٫٦ م.ب فوق حدّ ٢٥٦ MiB):
// «ما الذي يملأ القاعدة؟» — قراءة فقط (SCAN ثمّ STRLEN)، لا DEL ولا SET ولا قراءة محتوى. للمالك وحده (البوّابة في health.js).
// يجمع المفاتيح بعائلتها: «db/chats» (الخطّ المائل: أوّل مقطعين)، «studio» (النقطتان: أوّل مقطع). النتيجة أرقام وأسماء عائلات
// وأكبر المفاتيح — حتّى يُعرف الجاني بالقياس لا بالتخمين قبل أيّ حذف.
'use strict';
const BATCH = 200;
const MAX_KEYS = 30000; // سقف الفحص: كلّ STRLEN أمر يُحسب من حدّ الأوامر اليوميّ

function groupOf(key) {
  const k = String(key);
  const iSlash = k.indexOf('/'), iColon = k.indexOf(':');
  if (iSlash >= 0 && (iColon < 0 || iSlash < iColon)) return k.split('/').slice(0, 2).map((s) => s.split(':')[0]).join('/');
  if (iColon >= 0) return k.slice(0, iColon);
  return k.replace(/\.json$/, '');
}

async function redisUsage(kv, opts) {
  const max = (opts && opts.maxKeys) || MAX_KEYS;
  const all = await kv.kvList('');
  const keys = all.slice(0, max);
  const groups = new Map();
  let totalBytes = 0;
  const biggest = [];
  for (let i = 0; i < keys.length; i += BATCH) {
    const part = keys.slice(i, i + BATCH);
    const lens = await kv.kvPipeline(part.map((k) => ['STRLEN', k]));
    part.forEach((k, j) => {
      const n = Number(lens[j]) || 0; // غير النصّيّ (WRONGTYPE) يُعدّ مفتاحًا بلا بايتات
      const g = groupOf(k);
      const e = groups.get(g) || { prefix: g, keys: 0, bytes: 0 };
      e.keys++; e.bytes += n; groups.set(g, e);
      totalBytes += n;
      if (n > 0 && (biggest.length < 5 || n > biggest[biggest.length - 1].bytes)) {
        biggest.push({ key: String(k).slice(0, 70), bytes: n });
        biggest.sort((a, b) => b.bytes - a.bytes);
        if (biggest.length > 5) biggest.pop();
      }
    });
  }
  return {
    totalKeys: all.length, scanned: keys.length, truncated: all.length > keys.length, totalBytes,
    groups: Array.from(groups.values()).sort((a, b) => b.bytes - a.bytes).slice(0, 15),
    biggest,
  };
}

module.exports = { redisUsage, groupOf, MAX_KEYS };
