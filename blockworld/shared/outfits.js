// Outfits: the look of the player's figure. The first one is everyone's; the rest are rewards for quests,
// for secrets found, for treasure, and one is sold by the trader. Earned outfits are kept in this browser.

export const OUTFITS = [
  { key: 'explorer', name: 'المستكشف', how: 'لبس البداية', c: { hat: '#3a3f4a', skin: '#e0b088', shirt: '#3f7ab8', pants: '#3a4152', shoes: '#2a2c33' } },
  { key: 'worker', name: 'العامل', how: 'مهمة: اصنع أداة', c: { hat: '#e0a52e', skin: '#e0b088', shirt: '#c96a2b', pants: '#4a4f5c', shoes: '#3b2a1c', brim: true } },
  { key: 'miner', name: 'المنقّب', how: 'مهمة: اجمع 4 ألماسات من الكهف', c: { hat: '#e3c038', skin: '#e0b088', shirt: '#5a6a7a', pants: '#3b4250', shoes: '#22252c', brim: true } },
  { key: 'hunter', name: 'الصيّاد', how: 'مهمة: صيد حيوانين', c: { hat: '#4d5a2c', skin: '#d6a57c', shirt: '#5f7036', pants: '#5a4630', shoes: '#33261a', brim: true } },
  { key: 'builder', name: 'البنّاء', how: 'مهمة: ابنِ بيتك', c: { hat: '#d8d2c0', skin: '#e0b088', shirt: '#9a6a3f', pants: '#6a6f78', shoes: '#2a2c33' } },
  { key: 'guard', name: 'الحارس', how: 'مهمة: اقضِ على 3 وحوش', c: { hat: '#7a2f2a', skin: '#d6a57c', shirt: '#9c3a32', pants: '#2f3340', shoes: '#1c1d22', cape: '#5e1f1c' } },
  { key: 'knight', name: 'الفارس', how: 'مهمة: البس درع كامل', c: { hat: '#aeb6c2', skin: '#e0b088', shirt: '#c9ced6', pants: '#7d8794', shoes: '#4a505a', cape: '#2d5abf' } },
  { key: 'hero', name: 'البطل', how: 'مهمة: وصّل المستوى 5', c: { hat: '#f0bd3f', skin: '#e0b088', shirt: '#f4f1e6', pants: '#2d5abf', shoes: '#c33d2e', cape: '#c33d2e' } },
  { key: 'pilot', name: 'الطيّار', how: 'سرّي', rare: true, c: { hat: '#5b4632', skin: '#e0b088', shirt: '#7c5a3a', pants: '#3b4658', shoes: '#241c14', brim: true } },
  { key: 'sleeper', name: 'بيجامة النوم', how: 'سرّي', rare: true, c: { hat: '#9fb7e8', skin: '#e0b088', shirt: '#b9cdf4', pants: '#b9cdf4', shoes: '#f1f4f8' } },
  { key: 'shadow', name: 'ظلّ الليل', how: 'سرّي', rare: true, c: { hat: '#15171d', skin: '#b98e6c', shirt: '#1d2029', pants: '#15171d', shoes: '#0c0d11', cape: '#3b1f5e' } },
  { key: 'pirate', name: 'صيّاد الكنوز', how: 'سرّي', rare: true, c: { hat: '#1d1a17', skin: '#d6a57c', shirt: '#f1ece0', pants: '#7a2f2a', shoes: '#2b1d12', brim: true, cape: '#1d1a17' } },
  { key: 'golden', name: 'الذهبي', how: 'سرّي', rare: true, c: { hat: '#f6d572', skin: '#e0b088', shirt: '#f0bd3f', pants: '#d79a22', shoes: '#a8730f', cape: '#fff3c4' } },
  { key: 'merchant', name: 'عباءة التاجر', how: 'يبيعها التاجر', rare: true, c: { hat: '#6b2f7a', skin: '#d6a57c', shirt: '#8a3fa0', pants: '#3a2a4a', shoes: '#241a2e', cape: '#e3c038' } },
];
export const TRADER_LOOK = { hat: '#2f6b5a', skin: '#c99870', shirt: '#3f8a72', pants: '#5a4630', shoes: '#33261a', brim: true, cape: '#e3c038' };

const HEX = /^#[0-9a-fA-F]{6}$/;
/** Colours someone else sent, made safe to use: only the known parts, only plain colours. */
export function cleanLook(c) {
  if (!c || typeof c !== 'object') return null;
  const out = {};
  for (const k of ['hat', 'skin', 'shirt', 'pants', 'shoes', 'cape']) if (typeof c[k] === 'string' && HEX.test(c[k])) out[k] = c[k];
  if (c.brim) out.brim = true;
  return out.shirt && out.pants ? out : null;
}
const CUSTOM0 = { hat: '#c33d2e', skin: '#e0b088', shirt: '#2cabb3', pants: '#2d5abf', shoes: '#25282d' };

export function createWardrobe({ play }) {
  const owned = new Set(['explorer', 'custom']);
  let custom = { ...CUSTOM0 };
  try { const c = cleanLook(JSON.parse(window.localStorage.getItem('bw-custom') || 'null')); if (c) custom = c; } catch (e) { /* storage may be closed or hold something else */ }
  const entry = () => ({ key: 'custom', name: 'تصميمي', how: 'صمّمه بنفسك', c: custom });
  let current = 'explorer';
  try { for (const k of JSON.parse(window.localStorage.getItem('bw-outfits') || '[]')) if (OUTFITS.some((o) => o.key === k)) owned.add(k); const c0 = window.localStorage.getItem('bw-outfit'); if (owned.has(c0)) current = c0; } catch (e) { /* storage may be closed or hold something else */ }
  const keep = () => { try { window.localStorage.setItem('bw-outfits', JSON.stringify([...owned])); window.localStorage.setItem('bw-outfit', current); } catch (e) { /* not kept */ } };
  const api = {
    owned,
    get current() { return current; },
    get look() { return current === 'custom' ? custom : OUTFITS.find((o) => o.key === current).c; },
    get custom() { return custom; },
    list: () => [entry(), ...OUTFITS].map((o) => ({ ...o, owned: owned.has(o.key), on: o.key === current })),
    /** Change one part of the player's own design: a colour for a part, or true / false for the cape and the brim. */
    design(part, value) {
      if (part === 'brim') { if (value) custom.brim = true; else delete custom.brim; }
      else if (part === 'cape' && (value === false || value === '')) delete custom.cape;
      else if (['hat', 'skin', 'shirt', 'pants', 'shoes', 'cape'].includes(part) && HEX.test(String(value))) custom[part] = String(value);
      else return false;
      current = 'custom'; keep();
      try { window.localStorage.setItem('bw-custom', JSON.stringify(custom)); } catch (e) { /* not kept */ }
      return true;
    },
    wear(key) { if (!owned.has(key)) return false; current = key; keep(); return true; },
    /** A new outfit is earned: it is put on at once, and the player is told. */
    grant(key) {
      const o = OUTFITS.find((q) => q.key === key);
      if (!o || owned.has(key)) return false;
      owned.add(key); current = key; keep();
      play.notice((o.rare ? 'لبس نادر جديد: ' : 'لبس جديد: ') + o.name + '. اضغط V تشوف شكلك.', false, 5200);
      return true;
    },
  };
  window.__GAME_WARDROBE = api;
  return api;
}
