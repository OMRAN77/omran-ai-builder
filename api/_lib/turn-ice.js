'use strict';
/* v-talk-room-turn (المالك ٢٣ نوفمبر: «كل شي شغال لكن الي اريده اقوى من هذا» بعد شرح أنّ بعض الشبكات تمنع الاتّصال المباشر):
   خوادم ترحيل (TURN) لـ«غرفة الربع» من Cloudflare — باقة مجّانيّة ١٠٠٠ غيغا في الشهر (developers.cloudflare.com/realtime/sfu/platform/pricing).
   المتصفّح يجرّب الاتّصال المباشر أوّلًا كما كان، ولا يمرّ بالترحيل إلّا حين تمنعه الشبكة — فأغلب الغرف لا تستهلك شيئًا.
   مفتاح TURN سرّ طويل في Vercel لا يصل المتصفّح: الخادم يصنع منه بيانات دخول قصيرة العمر (٤ ساعات) لكلّ غرفة.
   حدّ يوميّ لعدد البيانات المصنوعة (TURN_DAILY_CAP، بديله ٤٠٠) حماية من الاستعمال فوق المجّانيّ؛ بعده STUN وحده كما كان.
   بلا المتغيّرين: STUN وحده (السلوك القديم) بلا خطأ. الأسرار تُقرأ داخل النداء لا عند تحميل الملفّ. */
const STUN = [{ urls: 'stun:stun.l.google.com:19302' }];
const TTL = 4 * 3600;

/** ICE servers for one room: Cloudflare TURN when configured and under today's cap, else STUN only. Never throws.
    ttlSec اختياريّ (v-talk-room-plan): عمر أقصر للبيانات — غرفة مجّانيّة تعطي ما بقي من ساعة يومها؛ لا يتجاوز TTL. */
async function iceServers(K, ttlSec) {
  const ttl = Number.isFinite(ttlSec) && ttlSec > 0 ? Math.max(60, Math.min(TTL, Math.trunc(ttlSec))) : TTL;
  const keyId = String(process.env.CLOUDFLARE_TURN_KEY_ID || '').trim(), token = String(process.env.CLOUDFLARE_TURN_API_TOKEN || '').trim();
  if (!keyId || !token || !/^[A-Za-z0-9_-]{8,80}$/.test(keyId)) return { iceServers: STUN, relay: false };
  try {
    const cap = Math.max(0, Math.trunc(Number(process.env.TURN_DAILY_CAP) || 400));
    const dayKey = 'talk/turn/' + new Date().toISOString().slice(0, 10);
    const n = Number(await K.kvIncr(dayKey));
    if (n === 1) await K.kvExpire(dayKey, 2 * 86400);
    if (n > cap) return { iceServers: STUN, relay: false, capped: true };
    const r = await fetch('https://rtc.live.cloudflare.com/v1/turn/keys/' + keyId + '/credentials/generate-ice-servers', {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ ttl }),
    });
    if (!r.ok) return { iceServers: STUN, relay: false };
    const j = await r.json().catch(() => null);
    const list = Array.isArray(j && j.iceServers) ? j.iceServers : (j && j.iceServers ? [j.iceServers] : []);
    const clean = [];
    for (const s of list) {
      if (!s || !s.urls) continue;
      // المنفذ ٥٣ محجوب في المتصفّحات (وثائق Cloudflare) — يُسقط
      const urls = (Array.isArray(s.urls) ? s.urls : [s.urls]).map(String).filter((u) => /^(stun|turns?):/.test(u) && !/:53(\?|$)/.test(u));
      if (!urls.length) continue;
      clean.push(s.username ? { urls, username: String(s.username), credential: String(s.credential || '') } : { urls });
    }
    return clean.length ? { iceServers: STUN.concat(clean), relay: clean.some((s) => s.username) } : { iceServers: STUN, relay: false };
  } catch (e) {
    require('./_swallow.js').swallow(e, 'turn-ice');
    return { iceServers: STUN, relay: false };
  }
}
module.exports = { iceServers, STUN, TTL };
