// Returns the Runway credit balance (max across configured keys) so the
// frontend can verify there is enough credit BEFORE starting any generation.
// This prevents charging the owner for partial films that fail midway.
//
// v-video-open-lock: كان يكشف رصيد المالك عند المزوّد وعدد مفاتيحه لأيّ زائر، والواجهة تعرض لكلّ مستخدم سطرًا باسم
// المزوّد وموقعه للشحن. الآن للمالك وحده (رمز جلسته أو مفتاح المراقبة — _owner.js)، وغيره 403 بلا أيّ نداء للمزوّد.
//
// v-balance-enough (المراجعة المعاكسة): فصار الفحص المسبق لغير المالك «يكفي دائمًا» في الواجهة — فيبدأ فيلمًا ينكسر في منتصفه.
// الآن جلسة حقيقيّة مع ?needed= تسأل «هل يكفي؟» فقط: الجواب { enough } وحده بلا رصيد ولا عدد مفاتيح ولا اسم مزوّد،
// والرصيد لغير المالك من ذاكرة ٦٠ ثانية داخل العمليّة (لا نداءات للمزوّد بمفاتيح المالك مع كلّ طلب).
const { getKeys, RUNWAY_API_BASE } = require('./runway-keys.js');

const ENOUGH_CACHE_MS = 60 * 1000;
// v-balance-unknown-cache (المراجعة الثالثة): «لم يُجب أحد» يُخزَّن ٣٠ ثانية أيضًا — بلا تخزين كان كلّ طلب ?needed= من أيّ
// جلسة يعيد النداء لكلّ مفاتيح المالك، فمفتاح مقيَّد بالمعدّل (429) يبقيه أيّ مسجَّل مقيَّدًا وهي مفاتيح التوليد نفسها.
const UNKNOWN_CACHE_MS = 30 * 1000;
let cached = null; // { at, best, keys }

module.exports = async (req, res) => {
  const owner = require('./_owner.js').isOwner(req);
  const needed = Number((req.query && req.query.needed) || 0);
  if (!owner) {
    const session = require('./_session.js');
    if (!session.sessionUser(session.tokenOf(req)) || !Number.isFinite(needed) || needed <= 0) {
      res.status(403).json({ error: 'owner_only' });
      return;
    }
    if (cached && Date.now() - cached.at < (cached.unknown ? UNKNOWN_CACHE_MS : ENOUGH_CACHE_MS)) { res.status(200).json({ enough: cached.unknown ? true : cached.best >= needed }); return; }
  }
  try {
    const keys = getKeys();
    if (!keys.length) { cached = { at: Date.now(), best: 0, keys: 0 }; return owner ? res.status(200).json({ credits: 0, keys: 0 }) : res.status(200).json({ enough: false }); }
    let best = 0;
    let answered = false; // v-balance-unknown: هل أجاب أيّ مفتاح ok؟
    for (const key of keys) {
      try {
        const r = await fetch(RUNWAY_API_BASE + '/v1/organization', {
          headers: {
            Authorization: 'Bearer ' + key,
            'X-Runway-Version': '2024-11-06',
          },
        });
        if (!r.ok) continue;
        const data = await r.json();
        answered = true;
        const c = Number(data && data.creditBalance) || 0;
        if (c > best) best = c;
      } catch (e) { /* try next key */ }
    }
    // v-balance-unknown (المراجعة الثانية): لم يُجب أيّ مفتاح (429/5xx/شبكة) — الصفر هنا جهل لا رصيد: كان يُخزَّن رصيدًا ستّين ثانية
    // فيأخذ كلّ غير مالك {enough:false} ويفشل كلّ فيلم. الآن يُخزَّن «مجهولًا» ٣٠ ثانية، وغير المالك يمرّ (أفضل جهد)، والمالك credits:-1.
    if (!answered) {
      cached = { at: Date.now(), unknown: true, best: 0, keys: keys.length };
      if (!owner) { res.status(200).json({ enough: true }); return; }
      res.status(200).json({ credits: -1, keys: keys.length });
      return;
    }
    cached = { at: Date.now(), best, keys: keys.length };
    if (!owner) { res.status(200).json({ enough: best >= needed }); return; }
    res.status(200).json({ credits: best, keys: keys.length });
  } catch (e) {
    if (!owner) { res.status(200).json({ enough: true }); return; } // أفضل جهد كمسار المالك: تعذّر القراءة لا يمنع
    res.status(200).json({ credits: -1, error: String(e && e.message || e) });
  }
};
