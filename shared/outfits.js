// Outfits: the look of the player's figure. The first one is everyone's; the rest are rewards for quests,
// for secrets found, for treasure, and one is sold by the trader. Earned outfits are kept in this browser.

export const OUTFITS = [
  { key: 'explorer', name: 'المستكشف', how: 'لبس البداية', c: { hat: '#3a3f4a', skin: '#e0b088', shirt: '#3f7ab8', pants: '#3a4152', shoes: '#2a2c33' } },
  // characters anyone may wear from the start
  { key: 'rose', name: 'بنت الورد', how: 'متاحة من البداية', free: true, c: { hat: '#f2a7c3', skin: '#f0c7a4', shirt: '#f7e3ef', pants: '#f0c7a4', shoes: '#f4f1f6', long: true, skirt: '#c9b6f2', flowers: '#ff6f9c' } },
  { key: 'trail', name: 'المستكشفة', how: 'متاحة من البداية', free: true, c: { hat: '#6b4428', skin: '#e0b088', shirt: '#f4efe4', pants: '#4a78b8', shoes: '#7a4a2a', long: true } },
  { key: 'dune', name: 'بنت البر', how: 'متاحة من البداية', free: true, c: { hat: '#1d1a1a', skin: '#d6a57c', shirt: '#7a2f3a', pants: '#3b2a2a', shoes: '#2a1c18', long: true, skirt: '#5a1f2a' } },
  { key: 'frost', name: 'بنت الثلج', how: 'متاحة من البداية', free: true, c: { hat: '#e9eef6', skin: '#f0d0b8', shirt: '#9fc8f0', pants: '#dfeaf6', shoes: '#f4f8fc', long: true, skirt: '#6fa8e0', flowers: '#ffffff' } },
  { key: 'cap', name: 'ولد الكاب', how: 'متاح من البداية', free: true, c: { hat: '#c33d2e', skin: '#e0b088', shirt: '#2d5abf', pants: '#7a5a3a', shoes: '#25282d', brim: true } },
  { key: 'robo', name: 'الآلي', how: 'متاح من البداية', free: true, c: { hat: '#5a6068', skin: '#9aa0a8', shirt: '#6c737c', pants: '#4a5058', shoes: '#2a2e34' } },
  { key: 'space', name: 'رائدة الفضاء', how: 'متاحة من البداية', free: true, c: { hat: '#f4f4f2', skin: '#e0b088', shirt: '#f1f1ee', pants: '#e6e6e2', shoes: '#c33d2e', cape: '#e86a2a' } },
  // the space crew and the adventurers, from the owner's pictures (our own figures, our own names)
  { key: 'heartbot', pic: 'heartbot', name: 'القلب الآلي', how: 'متاح من البداية', free: true, c: { holds: 'sword', heldGlow: '#7fe6f5', hat: '#5a6068', skin: '#7a8088', shirt: '#4a5058', pants: '#3a3f46', shoes: '#22252a', face: 'heart', pads: '#6c737c' } },
  { key: 'sage', pic: 'sage', name: 'حكيم المجرّة', how: 'متاح من البداية', free: true, c: { holds: 'book', heldCol: '#5a2f9a', heldGlow: '#c08aff', hat: '#8a5ad6', skin: '#9a6ae0', shirt: '#5a2f9a', pants: '#4a2580', shoes: '#2a1a4a', face: 'alien', tentacles: '#9a6ae0', skirt: '#5a2f9a', cape: '#d8b04a' } },
  { key: 'ranger', pic: 'ranger', name: 'جندي البر', how: 'متاح من البداية', free: true, c: { hat: '#7a6a3a', skin: '#c99870', shirt: '#8a7440', pants: '#5a5030', shoes: '#3a2e1c', face: 'mask', maskCol: '#6a5a2a', pads: '#a08a4a', pack: '#5a4a2a' } },
  { key: 'astro', pic: 'astro', name: 'رائد الفضاء', how: 'متاح من البداية', free: true, c: { holds: 'tablet', heldGlow: '#7fd0ff', hat: '#5a3a24', skin: '#e0b088', shirt: '#f1f1ee', pants: '#e6e6e2', shoes: '#c33d2e', face: 'bubble', pack: '#d8dde4' } },
  { key: 'mech', pic: 'mech', name: 'قائد العملاق', how: 'متاح من البداية', free: true, c: { holds: 'cannon', heldCol: '#e8e8e4', heldGlow: '#5ff0ff', hat: '#f1f1ee', skin: '#e0b088', shirt: '#e8e8e4', pants: '#8a9098', shoes: '#e86a2a', face: 'visor', glow: '#5ff0ff', pads: '#e86a2a' } },
  { key: 'fairy', pic: 'fairy', name: 'جنّية الغابة', how: 'متاحة من البداية', free: true, c: { holds: 'jar', heldGlow: '#5fe07a', hat: '#4a9a4a', skin: '#7ac06a', shirt: '#3f8a3f', pants: '#2f6a2f', shoes: '#2a4a2a', face: 'alien', wings: '#bff5d6' } },
  { key: 'nightsuit', pic: 'nightsuit', name: 'الظلّ البنفسجي', how: 'متاح من البداية', free: true, c: { holds: 'blade', heldGlow: '#d06aff', hat: '#2a2050', skin: '#3a2a6a', shirt: '#3a2a7a', pants: '#2a2058', shoes: '#18143a', face: 'visor', glow: '#b06aff' } },
  { key: 'iceknight', pic: 'iceknight', name: 'فارس الجليد', how: 'متاح من البداية', free: true, c: { holds: 'cannon', heldCol: '#bcd8ec', heldGlow: '#dff6ff', hat: '#bcd8ec', skin: '#e0b088', shirt: '#9cc4e4', pants: '#7aa4c8', shoes: '#5a84a8', face: 'visor', glow: '#dff6ff', pads: '#cfe6f6' } },
  { key: 'scout', pic: 'scout', name: 'صيّاد القفار', how: 'متاح من البداية', free: true, c: { holds: 'cannon', heldCol: '#9a6a2a', heldGlow: '#ff6a3a', hat: '#5a3a24', skin: '#e0b088', shirt: '#9a2f2a', pants: '#6a4a2a', shoes: '#3a2a1a', pads: '#c9a070', pack: '#7a5a3a' } },
  { key: 'backpacker', name: 'المغامرة', how: 'متاحة من البداية', free: true, c: { hat: '#7a4a2a', skin: '#e8b890', shirt: '#9a3a2a', pants: '#f1ece0', shoes: '#4a3020', long: true, pack: '#3f6a8a' } },
  // the galaxy heroes, from the owner's second picture (our own figures and names)
  { key: 'chrono', pic: 'chrono', name: 'صيّاد الزمن', how: 'متاح من البداية', free: true, c: { holds: 'blade', heldGlow: '#ff3048', hat: '#4a4f58', skin: '#6c727c', shirt: '#4a4f58', pants: '#2f333a', shoes: '#1c1e22', face: 'screen', glow: '#ff3048', pads: '#7a808a' } },
  { key: 'nebula', pic: 'nebula', name: 'حارسة السديم', how: 'متاحة من البداية', free: true, c: { holds: 'blade', heldGlow: '#c08aff', hat: '#f0d080', skin: '#c9a0e8', shirt: '#7a3fc0', pants: '#5a2a9a', shoes: '#d8b04a', long: true, crystals: '#c08aff', pads: '#d8b04a' } },
  { key: 'oracle', pic: 'oracle', name: 'عرّافة الشبكة', how: 'متاحة من البداية', free: true, c: { hat: '#1f6a4a', skin: '#e0b088', shirt: '#e8f0ea', pants: '#2f8a5a', shoes: '#1f4a34', face: 'goggles', glow: '#5fffb0', hood: '#2f8a5a', skirt: '#e8f0ea' } },
  { key: 'envoy', pic: 'envoy', name: 'سفير المجرّة', how: 'متاح من البداية', free: true, c: { holds: 'tablet', heldGlow: '#5fffd0', hat: '#6a4ab0', skin: '#8a6ad0', shirt: '#4a2a8a', pants: '#3a2070', shoes: '#22143e', face: 'alien', tentacles: '#6ad8ff', skirt: '#4a2a8a', core: '#5fffd0' } },
  { key: 'titan', pic: 'titan', name: 'قائدة العملاق', how: 'متاحة من البداية', free: true, c: { hat: '#5a3a24', skin: '#d6a57c', shirt: '#f1f1ee', pants: '#e8e8e4', shoes: '#c33d2e', face: 'helm', helm: '#f1f1ee', pads: '#c33d2e', glow: '#ff6a5a' } },
  { key: 'weaver', pic: 'weaver', name: 'نسّاج الضوء', how: 'متاح من البداية', free: true, c: { hat: '#9fe6ff', skin: '#9fe6ff', shirt: '#7fd0ff', pants: '#6fc0f6', shoes: '#5fb0ee', face: 'bot', glow: '#ffffff', ghost: '#5fd0ff', core: '#ffffff' } },
  { key: 'biologist', pic: 'biologist', name: 'عالم الكائنات', how: 'متاح من البداية', free: true, c: { holds: 'jar', heldGlow: '#5fe07a', hat: '#a08a5a', skin: '#b8a070', shirt: '#2f6a5a', pants: '#3a4a44', shoes: '#22282a', face: 'alien', coat: '#f1f1ee' } },
  { key: 'prospector', pic: 'prospector', name: 'منقّب الكويكبات', how: 'متاح من البداية', free: true, c: { holds: 'drill', hat: '#e86a2a', skin: '#e0b088', shirt: '#e86a2a', pants: '#c9581e', shoes: '#3a3f46', face: 'helm', helm: '#e86a2a', visor: '#3a2a10', pack: '#5a6068', pads: '#4a4f58' } },
  { key: 'scavenger', pic: 'scavenger', name: 'كاسح القفار', how: 'متاح من البداية', free: true, c: { hat: '#8a6a2a', skin: '#9a7a3a', shirt: '#9a7a32', pants: '#6a5424', shoes: '#3a2e14', face: 'mask', maskCol: '#7a5a1a', pads: '#b08a3a', glow: '#5fe07a' } },
  { key: 'aicore', pic: 'aicore', name: 'الآلي الفضّي', how: 'متاح من البداية', free: true, c: { hat: '#c9ced6', skin: '#d8dde4', shirt: '#b8bec8', pants: '#a8aeb8', shoes: '#7a808a', face: 'bot', glow: '#5fd0ff', core: '#5fd0ff' } },
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
  { key: 'architect', name: 'المهندس', how: 'فز في مسابقة بناء', rare: true, c: { hat: '#f4f1e6', skin: '#e0b088', shirt: '#2d5abf', pants: '#d8d2c0', shoes: '#3b2a1c', brim: true } },
  { key: 'stranger', name: 'عباءة الغريب', how: 'سرّي', rare: true, c: { hat: '#1a1524', skin: '#d6a57c', shirt: '#2a2038', pants: '#191422', shoes: '#0e0b14', cape: '#3b1f5e' } },
  { key: 'runner', name: 'عدّاء المتاهة', how: 'سرّي', rare: true, c: { hat: '#c06af5', skin: '#e0b088', shirt: '#f4f1e6', pants: '#7747bb', shoes: '#e3c038' } },
  { key: 'merchant', name: 'عباءة التاجر', how: 'يبيعها التاجر', rare: true, c: { hat: '#6b2f7a', skin: '#d6a57c', shirt: '#8a3fa0', pants: '#3a2a4a', shoes: '#241a2e', cape: '#e3c038' } },
];
export const TRADER_LOOK = { hat: '#2f6b5a', skin: '#c99870', shirt: '#3f8a72', pants: '#5a4630', shoes: '#33261a', brim: true, cape: '#e3c038' };

const HEX = /^#[0-9a-fA-F]{6}$/;
/** Colours someone else sent, made safe to use: only the known parts, only plain colours. */
export function cleanLook(c) {
  if (!c || typeof c !== 'object') return null;
  const out = {};
  for (const k of ['hat', 'skin', 'shirt', 'pants', 'shoes', 'cape', 'skirt', 'flowers', 'tentacles', 'wings', 'pack', 'pads', 'glow', 'maskCol', 'crystals', 'hood', 'coat', 'core', 'helm', 'visor', 'ghost', 'heldGlow', 'heldCol']) if (typeof c[k] === 'string' && HEX.test(c[k])) out[k] = c[k];
  if (['heart', 'visor', 'alien', 'mask', 'bubble', 'screen', 'goggles', 'helm', 'bot'].includes(c.face)) out.face = c.face;
  if (['sword', 'blade', 'cannon', 'book', 'tablet', 'jar', 'drill'].includes(c.holds)) out.holds = c.holds;
  if (c.brim) out.brim = true;
  if (c.long) out.long = true;
  return out.shirt && out.pants ? out : null;
}
const CUSTOM0 = { hat: '#c33d2e', skin: '#e0b088', shirt: '#2cabb3', pants: '#2d5abf', shoes: '#25282d' };

export function createWardrobe({ play }) {
  const owned = new Set(['explorer', 'custom', ...OUTFITS.filter((o) => o.free).map((o) => o.key)]);
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
      if (part === 'brim' || part === 'long') { if (value) custom[part] = true; else delete custom[part]; }
      else if ((part === 'cape' || part === 'skirt' || part === 'flowers') && (value === false || value === '')) delete custom[part];
      else if (['hat', 'skin', 'shirt', 'pants', 'shoes', 'cape', 'skirt', 'flowers'].includes(part) && HEX.test(String(value))) custom[part] = String(value);
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
