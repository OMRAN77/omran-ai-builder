/* scripts/tv-lib.mjs — دوالّ نقيّة لفاحص القنوات (tv-check.mjs) تُختبر بلا شبكة.
 * v-tv-sports-fresh (المالك ٢٣ سبتمبر: «اريد القنوات الرياضية» — بلا قرصنة): قائمة الرياضة تُبنى يوميًّا
 * من فهرس iptv-org العامّ (نفس مصدر tv-streams.json) بدل نسخة ٢ سبتمبر الثابتة، والعربيّ أوّلًا.
 * v-tv-matches: جدول المباريات لقطة يوميّة من لوحة نتائج ESPN العامّة (بلا مفتاح). */

export const ARAB_CC = ['sa', 'ae', 'qa', 'kw', 'bh', 'om', 'jo', 'eg', 'iq', 'sy', 'lb', 'ps', 'ye', 'ly', 'tn', 'dz', 'ma', 'sd', 'mr'];

/* قنوات مدفوعة/حقوق محميّة: لا نعرضها ولو ظهر لها رابط — لا بديل «ياسين/الأسطورة». */
export const PAID_RE = /\b(bein|ssc|osn|dazn|sky ?sports?|starzplay|thmanyah|shahid|premier sports|eleven sports|espn|movistar|canal\+|rmc sport|sportv)\b/i;

const rank = (e) => { const i = ARAB_CC.indexOf(e.c); return i < 0 ? 99 : i; };

export function buildSports(channels, streams, blocklist, max = 700) {
  const blocked = new Set((blocklist || []).map((b) => b && b.channel));
  const byId = new Map();
  for (const c of channels || []) {
    if (!c || !Array.isArray(c.categories) || !c.categories.includes('sports')) continue;
    if (c.is_nsfw || c.closed || blocked.has(c.id) || PAID_RE.test(c.name || '')) continue;
    byId.set(c.id, c);
  }
  const out = new Map();
  for (const s of streams || []) {
    const c = s && byId.get(s.channel);
    if (!c || s.referrer || s.user_agent) continue; // المتصفّح لا يرسل Referer/UA مخصّصًا
    const u = String(s.url || '');
    if (!/^https:\/\//i.test(u)) continue;          // http يمنعه المتصفّح داخل صفحة https
    const e = out.get(c.id) || { n: String(c.name || '').slice(0, 60), c: String(c.country || '').toLowerCase(), m: [] };
    if (!e.m.includes(u)) e.m.push(u);
    out.set(c.id, e);
  }
  return [...out.values()]
    .sort((a, b) => rank(a) - rank(b) || (a.n < b.n ? -1 : a.n > b.n ? 1 : 0))
    .slice(0, max);
}

/* المنتخبات أيضًا: في فترة التوقّف الدوليّ (٢٣ سبتمبر ٢٠٢٦) كلّ دوريّات الأندية صفر أسبوعًا كاملًا. egy.1 ردّ 400 دائمًا. */
export const MATCH_LEAGUES = ['uefa.champions', 'uefa.europa', 'eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1', 'ksa.1', 'afc.champions', 'uefa.nations', 'fifa.friendly'];
export const MATCH_DAYS = 14;

const teamName = (x) => String((x && x.team && (x.team.displayName || x.team.shortDisplayName || x.team.name)) || '').slice(0, 60);

export function parseEspn(j, lg) {
  const L = j && Array.isArray(j.leagues) && j.leagues[0];
  const ln = String((L && (L.name || L.abbreviation)) || lg).slice(0, 60);
  const out = [];
  for (const ev of (j && j.events) || []) {
    const comp = ev && Array.isArray(ev.competitions) ? ev.competitions[0] : null;
    const cs = (comp && comp.competitors) || [];
    const home = cs.find((x) => x && x.homeAway === 'home');
    const away = cs.find((x) => x && x.homeAway === 'away');
    const t = Date.parse((ev && ev.date) || (comp && comp.date) || '');
    if (!home || !away || !Number.isFinite(t) || !teamName(home) || !teamName(away)) continue;
    out.push({ id: String(ev.id || ''), t: new Date(t).toISOString(), lg, ln, h: teamName(home), a: teamName(away) });
  }
  return out;
}

/* نافذة الجدول: من ٣ ساعات مضت (مباراة جارية) إلى ١٤ يومًا قادمة، بلا تكرار، مرتّبة بالوقت. */
export function windowMatches(list, now, cap = 200, aheadMs = MATCH_DAYS * 864e5) {
  const seen = new Set();
  return (list || [])
    .filter((m) => {
      const t = Date.parse(m.t);
      const k = m.lg + '|' + (m.id || m.h + m.a + m.t);
      if (seen.has(k) || !(t >= now - 3 * 36e5 && t <= now + aheadMs)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t))
    .slice(0, cap);
}

export function ymd(ms) {
  const d = new Date(ms);
  return d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, '0') + String(d.getUTCDate()).padStart(2, '0');
}
