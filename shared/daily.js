// Today's challenges (the quests page shows them; adventure.js counts and rewards them). No imports, so the
// tests can run it as it is.
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

// Three a day from this list, the same three for everyone (the date picks them), counted from
// where the player's counts stood when the day began. [key, what to do, how the count is read, how many, xp]
export const DAILY = [
  ['break', 'اكسر {n} مكعب', (st) => st.broken || 0, 40, 15],
  ['place', 'حط {n} مكعب', (st) => st.placed || 0, 40, 15],
  ['walk', 'امشِ {n} مكعب', (st) => st.walked || 0, 300, 15],
  ['craft', 'اصنع {n} أشياء', (st) => st.crafted || 0, 5, 15],
  ['jump', 'انقز {n} مرة', (st) => st.jumps || 0, 50, 10],
  ['hunt', 'صيد {n} حيوانات', (st) => (st.kills && st.kills.animal) || 0, 3, 15],
  ['eat', 'كل {n} مرات', (st) => st.eaten || 0, 3, 10],
  ['swim', 'اسبح {n} مكعب', (st) => st.swumDist || 0, 60, 15],
  ['open', 'افتح {n} صناديق', (st) => st.opened || 0, 3, 15],
  ['trade', 'سوّ {n} صفقة مع التاجر', (st) => st.traded || 0, 1, 15],
];
export const DAILY_COUNT = 3, DAILY_PRIZE = 2, DAILY_BONUS_XP = 30;
/** The day's challenges: DAILY_COUNT different ones, chosen by the date alone. */
export function dailyFor(day) {
  const q = rng(hash('daily|' + day)), pool = DAILY.slice(), out = [];
  while (out.length < DAILY_COUNT && pool.length) out.push(pool.splice(Math.floor(q() * pool.length), 1)[0]);
  return out;
}
