// The building kit every world shares: blocks the player takes from the bag (painted blocks, half blocks,
// lamps, gold, diamond, glass, water, fire, beds) with their materials, names, icons and small behaviours.
//
// A world joins in with a few lines:
//   Object.assign(BLOCKS, KIT_BLOCKS)                         before meshing
//   materialFor: (tile) => kitMaterial(tile) || ownMaterial(tile)
//   const kit = createKit({ scene, world, terrain })
//   createPlay({ heightOf: kit.heightOf, isLiquid: (id) => own(id) || kit.isLiquid(id), ... })
//   onPlace -> kit.placed(x, y, z, id, yaw);  onBreak -> kit.broke(h);  onFrame -> kit.update(pos, dt, time)
//
// Ids 100 and up belong to the kit and mean the same block in every world.

import * as THREE from 'three';
import { canvasTexture } from './stage.js';

const COLORS = [
  ['white', 'أبيض', '#eceeed'], ['silver', 'رمادي فاتح', '#b7bcc3'], ['grey', 'رمادي', '#777d86'], ['black', 'أسود', '#25282d'],
  ['red', 'أحمر', '#c33d2e'], ['orange', 'برتقالي', '#dd7c2a'], ['yellow', 'أصفر', '#e3c038'], ['lime', 'أخضر فاتح', '#89c13e'],
  ['green', 'أخضر', '#3c8a47'], ['cyan', 'سماوي', '#2cabb3'], ['sky', 'أزرق فاتح', '#55a0e0'], ['blue', 'أزرق', '#2d5abf'],
  ['purple', 'بنفسجي', '#7747bb'], ['pink', 'وردي', '#d9649f'], ['brown', 'بنّي', '#775033'], ['sand', 'بيج', '#d3be96'],
];
const SLABS = ['white', 'grey', 'black', 'brown', 'sand', 'red'];
const LAMPS = [['warm', 'ليت دافئ', '#ffc27a'], ['white', 'ليت أبيض', '#eaf4ff'], ['cyan', 'ليت سماوي', '#5ff0ff'], ['pink', 'ليت وردي', '#ff6ad0']];
const BEDS = [['red', 'سرير أحمر', '#b8392f'], ['blue', 'سرير أزرق', '#2f58b4'], ['green', 'سرير أخضر', '#3b8748'], ['white', 'سرير أبيض', '#e4e6e4']];
const hexOf = Object.fromEntries(COLORS.map(([k, , h]) => [k, h]));
const nameOfColor = Object.fromEntries(COLORS.map(([k, n]) => [k, n]));

/** Block ids of the kit. */
export const K = { GOLD: 140, DIAMOND: 141, GLASS: 142, WATER: 150, FIRE: 151, CHEST: 170, TABLE: 171, TORCH: 172, DOOR: 173, DOOR_TOP: 174, DOOR_OPEN: 175, DOOR_OPEN_TOP: 176, ROCK_COAL: 177, ROCK_GOLD: 178, ROCK_DIAMOND: 179, MEAT: 200, FUR: 201, FEATHER: 202, CHICKEN: 203, FISH: 204, SHRIMP: 205, COAL: 206, PEARL: 207, SEAWEED: 208, SEEDS: 209, FURCOAT: 228, ORE: 230, GEM: 231, DATES: 232, WOOL: 233, WHEAT: 234, BREAD: 235, EMERALD: 236, RUBY: 237, AMETHYST: 238,
  CROP0: 180, CROP1: 181, CROP2: 182, CROP3: 183, ROCK_EMERALD: 184, ROCK_RUBY: 185, ROCK_AMETHYST: 186, EMERALD_BLOCK: 187, RUBY_BLOCK: 188, AMETHYST_BLOCK: 189, LUCKY: 190, PORTAL_FRAME: 191, PORTAL: 192, FARMLAND: 193, CARROT0: 194, POTATO0: 143, FURNACE: 147,
  IRON: 260, APPLE: 276, STEAK: 277, GOLDEN_APPLE: 278, CARROT: 279, POTATO: 280, BAKED_POTATO: 281, COOKED_FISH: 282, BUCKET: 283, BUCKET_WATER: 284, BUCKET_MILK: 285,
  SHEARS: 286, LEAD: 287, SADDLE: 288, COMPASS: 289, CLOCK: 290, BOW: 291, ARROW: 292, PEARL_JUMP: 293, FLINT: 294, BOOK: 295, NAME_TAG: 296, SPYGLASS: 297, SHIELD: 274, WINGS: 275, CAR_ROVER: 298, CAR_BUGGY: 299, CAR_JEEP: 300, CAR_DINO: 301, CAR_GHOST: 302, CAR_SPORT: 303,
  ROD: 247, CAN: 248, BOAT: 249, HAMOUR: 250, SAFI: 251, KANAD: 252, SHERI: 253, GOLDFISH: 254, SHELL: 255 };
/** Block definitions, in the same shape the worlds use (see voxel.js). Blocks live under 200 (the world stores a byte); 200 and up are carried things. */
export const KIT_BLOCKS = {};
const INFO = {};                                 // id -> { name, key, group, icon }
const GROUP_NAMES = { cars: 'سيارات', food: 'أكل وأشياء من الحيوانات', farm: 'زراعة وصيد وبحر', gear: 'سلاح وعدّة ولبس', gadget: 'أجهزة', home: 'بيت وتخزين', paint: 'مكعبات ملوّنة', slab: 'أنصاف مكعبات', light: 'إضاءة', gem: 'ذهب وجواهر', nature: 'ماء ونار', bed: 'أسرّة' };
function add(id, def, info) { KIT_BLOCKS[id] = def; INFO[id] = { id, ...info }; }

COLORS.forEach(([key, name, hex], i) => add(100 + i, { tiles: 'x:paint:' + hex }, { key: 'paint-' + key, name: 'مكعب ' + name, group: 'paint', icon: ['cube', hex] }));
SLABS.forEach((key, i) => add(120 + i, { tiles: 'x:paint:' + hexOf[key], kind: 'slab', height: 0.5 }, { key: 'slab-' + key, name: 'نصف مكعب ' + nameOfColor[key], group: 'slab', icon: ['slab', hexOf[key]] }));
LAMPS.forEach(([key, name, hex], i) => add(130 + i, { tiles: 'x:lamp:' + hex, light: hex }, { key: 'lamp-' + key, name, group: 'light', icon: ['lamp', hex] }));
add(K.GOLD, { tiles: 'x:gold' }, { key: 'gold', name: 'مكعب ذهب', group: 'gem', icon: ['cube', '#f0bd3f', 'shine'] });
add(K.DIAMOND, { tiles: 'x:diamond' }, { key: 'diamond', name: 'مكعب ألماس', group: 'gem', icon: ['cube', '#7fe6f5', 'shine'] });
add(K.GLASS, { tiles: 'x:glass', kind: 'translucent' }, { key: 'glass', name: 'زجاج', group: 'gem', icon: ['glass', '#cfeefa'] });
add(K.WATER, { tiles: 'x:water', kind: 'liquid' }, { key: 'water', name: 'ماء', group: 'nature', icon: ['drop', '#3f97dc'] });
add(K.FIRE, { tiles: 'x:fire', kind: 'cross', height: 0.96, light: '#ff9a3c', flicker: true }, { key: 'fire', name: 'نار', group: 'nature', icon: ['flame', '#ff8a2a'] });
BEDS.forEach(([key, name, hex], i) => {
  const head = 160 + i * 2, foot = head + 1, side = 'x:bedside:' + hex;
  add(head, { tiles: { top: 'x:pillow', side, bottom: 'x:wood' }, kind: 'slab', height: 0.5625, mate: foot }, { key: 'bed-' + key, name, group: 'bed', icon: ['bed', hex] });
  KIT_BLOCKS[foot] = { tiles: { top: 'x:quilt:' + hex, side, bottom: 'x:wood' }, kind: 'slab', height: 0.5625, mate: head, part: true };
  INFO[foot] = { id: foot, key: 'bed-' + key + '-foot', name, group: null };
});

// Things that are carried and used, not placed (no block definition): the world gives or uses them.
INFO[200] = { id: 200, key: 'meat', name: 'لحم', group: null, icon: ['meat', '#b5523d'], item: { use: 'eat' } };   // n comes from the hunt
// what the animals leave, and what feeds them. `eat`: how much hunger it takes away (meat is the full 40). `feed`: who takes it from the hand
const good = (id, key, name, icon, hex, item) => { INFO[id] = { id, key, name, group: 'food', icon: [icon, hex], item: item || {} }; };
INFO[200].group = 'food'; INFO[200].item.feed = 'meat';
good(K.CHICKEN, 'chicken', 'لحم دجاج', 'drum', '#d9a066', { use: 'eat', eat: 30, feed: 'meat' });
good(K.FISH, 'fish', 'سمكة', 'fish', '#6fa8c9', { use: 'eat', eat: 28, feed: 'meat' });
good(K.SHRIMP, 'shrimp', 'ربيان', 'shrimp', '#f08a6c', { use: 'eat', eat: 18, feed: 'meat' });
good(K.SEAWEED, 'seaweed', 'طحالب', 'weed', '#3f9a5c', { use: 'eat', eat: 10, feed: 'plants' });
good(K.DATES, 'dates', 'تمر', 'dates', '#7a3f1d', { use: 'eat', eat: 20, feed: 'plants' });
good(K.SEEDS, 'seeds', 'حبوب', 'seeds', '#d8b660', { feed: 'plants' });
INFO[K.SEEDS].group = 'farm';
good(K.FUR, 'fur', 'فروة', 'fur', '#b08a62');
good(K.FEATHER, 'feather', 'ريش', 'feather', '#eef0f2');
good(K.WOOL, 'wool', 'صوف', 'fur', '#f1ede4');
good(K.COAL, 'coal', 'فحم', 'ore', '#17181b');
good(K.PEARL, 'pearl', 'لؤلؤة', 'pearl', '#f3ecf7');
// the catch of the rod: each fish its own colour and worth
// food, more: from the trees, the furnace and the field
good(K.APPLE, 'apple', 'تفاحة', 'apple', '#d8333a', { use: 'eat', eat: 18, feed: 'plants' });
good(K.STEAK, 'steak', 'لحم مشوي', 'meat', '#7a3a1e', { use: 'eat', eat: 60, feed: 'meat' });
good(K.GOLDEN_APPLE, 'golden-apple', 'تفاحة ذهبية', 'apple', '#f0bd3f', { use: 'eat', eat: 50, heal: 100 });
good(K.CARROT, 'carrot', 'جزرة', 'carrot', '#ee8a2a', { use: 'eat', eat: 15, feed: 'plants', plant: K.CARROT0 });
good(K.POTATO, 'potato', 'بطاطس', 'potato', '#c9a060', { use: 'eat', eat: 8, plant: K.POTATO0 });
good(K.BAKED_POTATO, 'baked-potato', 'بطاطس مشوية', 'potato', '#a8702a', { use: 'eat', eat: 40 });
good(K.COOKED_FISH, 'cooked-fish', 'سمك مشوي', 'fish', '#a8602a', { use: 'eat', eat: 45 });
good(K.IRON, 'iron', 'سبيكة حديد', 'ingot', '#c9ced6');
good(K.ARROW, 'arrow', 'سهم', 'arrow', '#8a5a30');
good(K.HAMOUR, 'hamour', 'هامور', 'fish', '#a0603a', { use: 'eat', eat: 34, feed: 'meat' });
good(K.SAFI, 'safi', 'صافي', 'fish', '#8a9a6a', { use: 'eat', eat: 26, feed: 'meat' });
good(K.KANAD, 'kanad', 'كنعد', 'fish', '#6a8aa8', { use: 'eat', eat: 32, feed: 'meat' });
good(K.SHERI, 'sheri', 'شعري', 'fish', '#c98a6a', { use: 'eat', eat: 24, feed: 'meat' });
good(K.GOLDFISH, 'goldfish', 'سمكة ذهبية', 'fish', '#f0bd3f', {});
good(K.SHELL, 'shell', 'محارة', 'pearl', '#e8c9b0');
// the farm: wheat from the field, bread from the wheat
good(K.WHEAT, 'wheat', 'قمح', 'wheat', '#e3c058', { feed: 'plants' });
good(K.BREAD, 'bread', 'خبز', 'bread', '#c98a3a', { use: 'eat', eat: 45 });
// the rare stones deep in the caves
good(K.EMERALD, 'emerald', 'زمرّد', 'gem', '#3fd07a');
good(K.RUBY, 'ruby', 'ياقوت', 'gem', '#e0344a');
good(K.AMETHYST, 'amethyst', 'جمشت', 'gem', '#a86ae8');
INFO[K.ORE] = { id: K.ORE, key: 'ore', name: 'خام معدن', group: 'gem', icon: ['ore', '#b9a27a'], item: {} };
INFO[K.GEM] = { id: K.GEM, key: 'gem', name: 'ألماسة', group: 'gem', icon: ['gem', '#7fe6f5'], item: {} };
// the cave's rock: a vein of gold gives a block of gold, a vein of diamond gives one gem
add(K.ROCK_GOLD, { tiles: 'x:rock:#f0bd3f', drop: K.GOLD, hard: 0.9 }, { key: 'rock-gold', name: 'صخر فيه ذهب', group: 'gem', icon: ['ore', '#f0bd3f'] });
add(K.ROCK_DIAMOND, { tiles: 'x:rock:#7fe6f5', drop: K.GEM, hard: 1.1 }, { key: 'rock-diamond', name: 'صخر فيه ألماس', group: 'gem', icon: ['ore', '#7fe6f5'] });
add(K.ROCK_EMERALD, { tiles: 'x:rock:#3fd07a', drop: K.EMERALD, hard: 1.2 }, { key: 'rock-emerald', name: 'صخر فيه زمرّد', group: 'gem', icon: ['ore', '#3fd07a'] });
add(K.ROCK_RUBY, { tiles: 'x:rock:#e0344a', drop: K.RUBY, hard: 1.2 }, { key: 'rock-ruby', name: 'صخر فيه ياقوت', group: 'gem', icon: ['ore', '#e0344a'] });
add(K.ROCK_AMETHYST, { tiles: 'x:rock:#a86ae8', drop: K.AMETHYST, hard: 1.0, light: '#a86ae8' }, { key: 'rock-amethyst', name: 'صخر فيه جمشت', group: 'gem', icon: ['ore', '#a86ae8'] });
add(K.EMERALD_BLOCK, { tiles: 'x:gem:#3fd07a' }, { key: 'emerald-block', name: 'مكعب زمرّد', group: 'gem', icon: ['cube', '#3fd07a', 'shine'] });
add(K.RUBY_BLOCK, { tiles: 'x:gem:#e0344a' }, { key: 'ruby-block', name: 'مكعب ياقوت', group: 'gem', icon: ['cube', '#e0344a', 'shine'] });
add(K.AMETHYST_BLOCK, { tiles: 'x:gem:#a86ae8', light: '#a86ae8' }, { key: 'amethyst-block', name: 'مكعب جمشت', group: 'gem', icon: ['cube', '#a86ae8', 'shine'] });
// the farm, more: tilled soil, carrots and potatoes in four steps, and a furnace that smelts and cooks
add(K.FARMLAND, { tiles: { top: 'x:farmland', side: 'x:soil', bottom: 'x:soil' }, kind: 'slab', height: 0.9375, hard: 0.3 }, { key: 'farmland', name: 'أرض محروثة', group: 'farm', icon: ['slab', '#6a4a2a'] });
for (let i = 0; i < 4; i++) {
  KIT_BLOCKS[K.CARROT0 + i] = { tiles: 'x:veg:c' + i, kind: 'cross', height: 0.3 + i * 0.16, drop: i === 3 ? K.CARROT : K.CARROT, crop: i, veg: 'carrot' }; INFO[K.CARROT0 + i] = { id: K.CARROT0 + i, key: 'carrot-crop-' + i, name: i === 3 ? 'جزر ناضج' : 'زرع جزر', group: null };
  KIT_BLOCKS[K.POTATO0 + i] = { tiles: 'x:veg:p' + i, kind: 'cross', height: 0.3 + i * 0.16, drop: K.POTATO, crop: i, veg: 'potato' }; INFO[K.POTATO0 + i] = { id: K.POTATO0 + i, key: 'potato-crop-' + i, name: i === 3 ? 'بطاطس ناضجة' : 'زرع بطاطس', group: null };
}
add(K.FURNACE, { tiles: { top: 'x:furnace:top', side: 'x:furnace:side', bottom: 'x:furnace:top' }, light: '#ff8a3a' }, { key: 'furnace', name: 'فرن', group: 'home', icon: ['furnace', '#7a7a80'] });
// wonders: a lucky box (opened, it gives one rare thing), and the frame and light of a portal to another world
add(K.LUCKY, { tiles: { top: 'x:lucky:top', side: 'x:lucky:side', bottom: 'x:wood' }, light: '#ffd76a' }, { key: 'lucky', name: 'صندوق الحظ', group: 'home', icon: ['lucky', '#7a3fc0'] });
add(K.PORTAL_FRAME, { tiles: 'x:rock:#2fe0c0', hard: 2.5 }, { key: 'portal-frame', name: 'حجر البوابة', group: 'gem', icon: ['ore', '#2fe0c0'] });
KIT_BLOCKS[K.PORTAL] = { tiles: 'x:portal', kind: 'translucent', solid: false, pick: true, light: '#2fe0c0' }; INFO[K.PORTAL] = { id: K.PORTAL, key: 'portal', name: 'بوابة', group: null };
// the field: a crop grows in four steps; the last is ripe wheat
for (let i = 0; i < 4; i++) { KIT_BLOCKS[K.CROP0 + i] = { tiles: 'x:crop:' + i, kind: 'cross', height: 0.3 + i * 0.22, drop: i === 3 ? K.WHEAT : K.SEEDS, crop: i }; INFO[K.CROP0 + i] = { id: K.CROP0 + i, key: 'crop-' + i, name: i === 3 ? 'قمح ناضج' : 'زرع', group: null }; }
add(K.ROCK_COAL, { tiles: 'x:rock:#1b1c20', drop: K.COAL, hard: 0.7 }, { key: 'rock-coal', name: 'صخر فيه فحم', group: 'gem', icon: ['ore', '#17181b'] });
const STONE = '#9aa0a6', GOLD = '#f0bd3f', DIAM = '#7fe6f5';
const gear = (id, key, name, icon, hex, item) => { INFO[id] = { id, key, name, group: 'gear', icon: [icon, hex], item: { n: 1, tool: true, ...item } }; };
// weapon: what one blow takes from a creature. speed: how much faster the tool digs. tier: the colour of its model in the hand
gear(212, 'sword-stone', 'سيف حجر', 'sword', STONE, { weapon: 4.5, model: 'sword', tier: STONE });
gear(213, 'sword-gold', 'سيف ذهب', 'sword', GOLD, { weapon: 5.5, model: 'sword', tier: GOLD });
gear(210, 'sword', 'سيف ألماس', 'sword', DIAM, { weapon: 7, model: 'sword', tier: DIAM });
gear(214, 'axe-stone', 'فأس حجر', 'axe', STONE, { weapon: 4, speed: 1.3, dig: 'wood', model: 'axe', tier: STONE });
gear(215, 'axe-diamond', 'فأس ألماس', 'axe', DIAM, { weapon: 6, speed: 2.2, dig: 'wood', model: 'axe', tier: DIAM });
gear(216, 'pick-stone', 'معول حجر', 'pick', STONE, { speed: 1.6, dig: 'stone', model: 'pick', tier: STONE });
gear(217, 'pick-diamond', 'معول ألماس', 'pick', DIAM, { speed: 2.6, dig: 'stone', model: 'pick', tier: DIAM });
// clothing: `wear` is the place on the body, `prot` the share of every blow it takes away (the four pieces add up)
[['head', 'خوذة', 'helmet', 0.16], ['chest', 'صدرية', 'armor', 0.4], ['legs', 'سروال', 'legs', 0.28], ['feet', 'حذاء', 'boots', 0.16]].forEach(([wear, name, icon, share], i) => {
  gear(224 + i, 'gold-' + wear, name + ' ذهب', icon, GOLD, { use: 'wear', wear, prot: +(share * 0.3).toFixed(3) });
  gear(i === 1 ? 211 : 220 + i, 'diamond-' + wear, name + ' ألماس', icon, DIAM, { use: 'wear', wear, prot: +(share * 0.5).toFixed(3) });
});
gear(K.FURCOAT, 'fur-coat', 'معطف فرو', 'armor', '#b08a62', { use: 'wear', wear: 'chest', prot: 0.07, warm: true });
const gadget = (id, key, name, icon, hex, item) => { INFO[id] = { id, key, name, group: (id >= 247 && id <= 249) || (id >= 283 && id <= 288) ? 'farm' : id === 291 || id === 293 ? 'gear' : 'gadget', icon: [icon, hex], item: { n: 1, tool: true, ...item } }; };
// the rod, the watering can and the boat: the farm and the sea
gadget(K.ROD, 'rod', 'سنارة', 'rod', '#8a5a30', { use: 'fish' });
gadget(K.CAN, 'can', 'مرشّة ماء', 'can', '#5a8ab0', { use: 'water', water: 0 });
gadget(K.BOAT, 'boat', 'قارب', 'boat', '#8a5a30', { use: 'boat' });
// more things to carry: each does its own job with the place button
gadget(K.BUCKET, 'bucket', 'دلو', 'bucket', '#9aa0a8', { use: 'bucket', model: 'bucket', tier: '#9aa0a8' });
gadget(K.BUCKET_WATER, 'bucket-water', 'دلو ماي', 'bucket', '#3f97dc', { use: 'bucket', model: 'bucket', tier: '#3f97dc' });
gadget(K.BUCKET_MILK, 'bucket-milk', 'دلو حليب', 'bucket', '#f4f4f0', { use: 'eat', eat: 20, milk: true, model: 'bucket', tier: '#f4f4f0' });
gadget(K.SHEARS, 'shears', 'مقص', 'shears', '#c9ced6', { use: 'shears' });
gadget(K.LEAD, 'lead', 'حبل قيادة', 'lead', '#c9a35a', { use: 'lead' });
gadget(K.SADDLE, 'saddle', 'سرج', 'saddle', '#7a3f1e', { use: 'saddle' });
gadget(K.COMPASS, 'compass', 'بوصلة', 'compass', '#c33d2e', { gadget: 'compass' });
gadget(K.CLOCK, 'clock', 'ساعة', 'clock', '#f0bd3f', { gadget: 'clock' });
gadget(K.BOW, 'bow', 'قوس', 'bow', '#8a5a30', { use: 'bow', model: 'bow', tier: '#8a5a30' });
gadget(K.PEARL_JUMP, 'jump-pearl', 'لؤلؤة القفزة', 'pearl', '#3fd0b0', { use: 'pearl', tool: false, n: 4 });
gadget(K.FLINT, 'flint', 'قدّاحة', 'flint', '#5a5a60', { use: 'flint' });
gadget(K.BOOK, 'book', 'دفتر', 'book', '#7a3f2a', { use: 'book' });
gadget(K.NAME_TAG, 'name-tag', 'بطاقة اسم', 'tag', '#e8d8b0', { use: 'name' });
// the vehicles: one for each world, and the sports car for whoever has done every quest
const car = (id, key, name, hex, world) => { INFO[id] = { id, key, name, group: 'cars', icon: ['car', hex], item: { n: 1, tool: true, use: 'drive', car: key, world } }; };
car(K.CAR_ROVER, 'rover', 'الروفر الكريستالي', '#5ff0ff', 'kawkab');
car(K.CAR_BUGGY, 'buggy', 'عربة الصحراء', '#d8c08a', 'waha');
car(K.CAR_JEEP, 'jeep', 'جيب المغامرات', '#3f7a3a', 'barari');
car(K.CAR_DINO, 'dino', 'متتبع الديناصورات', '#8a7a5a', 'dino');
car(K.CAR_GHOST, 'ghost', 'عربة الأشباح القوطية', '#2a2030', 'dhalam');
car(K.CAR_SPORT, 'sport', 'لمسة ذهبية', '#f0bd3f', null);
gadget(K.SPYGLASS, 'spyglass', 'منظار', 'spyglass', '#c9a35a', { use: 'zoom', model: 'spyglass', tier: '#c9a35a' });
// the iron tier and the tools that were missing: each tool digs fast only what it is for (dig: what kind of block)
const IRONC = '#c9ced6';
gear(261, 'sword-iron', 'سيف حديد', 'sword', IRONC, { weapon: 6, model: 'sword', tier: IRONC });
gear(262, 'pick-iron', 'معول حديد', 'pick', IRONC, { speed: 2, dig: 'stone', model: 'pick', tier: IRONC });
gear(263, 'axe-iron', 'فأس حديد', 'axe', IRONC, { weapon: 5, speed: 1.6, dig: 'wood', model: 'axe', tier: IRONC });
gear(264, 'shovel-stone', 'مجرفة حجر', 'shovel', STONE, { speed: 1.8, dig: 'soft', model: 'shovel', tier: STONE });
gear(265, 'shovel-iron', 'مجرفة حديد', 'shovel', IRONC, { speed: 2.4, dig: 'soft', model: 'shovel', tier: IRONC });
gear(266, 'shovel-diamond', 'مجرفة ألماس', 'shovel', DIAM, { speed: 3.2, dig: 'soft', model: 'shovel', tier: DIAM });
gear(267, 'hoe-stone', 'معزقة حجر', 'hoe', STONE, { use: 'till', model: 'hoe', tier: STONE });
gear(268, 'hoe-iron', 'معزقة حديد', 'hoe', IRONC, { use: 'till', model: 'hoe', tier: IRONC });
gear(269, 'hoe-diamond', 'معزقة ألماس', 'hoe', DIAM, { use: 'till', model: 'hoe', tier: DIAM });
[['head', 'خوذة', 'helmet', 0.16], ['chest', 'صدرية', 'armor', 0.4], ['legs', 'سروال', 'legs', 0.28], ['feet', 'حذاء', 'boots', 0.16]].forEach(([wear, name, icon, share], i) => gear(270 + i, 'iron-' + wear, name + ' حديد', icon, IRONC, { use: 'wear', wear, prot: +(share * 0.4).toFixed(3) }));
gear(K.SHIELD, 'shield', 'درع يد', 'shield', '#8a5a30', { use: 'wear', wear: 'off', prot: 0.2, model: 'shield', tier: IRONC });
gear(K.WINGS, 'wings', 'أجنحة', 'wings', '#b8c8e8', { use: 'wear', wear: 'chest', prot: 0.04, glide: true });
// gadgets: carried things that do something. `gadget` works while the thing is in the hand (or the other hand); `use` works on the place button
gadget(240, 'detector', 'كاشف الكنوز', 'detector', '#e3c038', { gadget: 'detector' });
gadget(241, 'camera', 'كاميرا', 'camera', '#3a3f4a', { use: 'camera' });
gadget(242, 'magicmap', 'الخريطة السحرية', 'map', '#d3be96', { gadget: 'map' });
gadget(243, 'pouch', 'شنطة إضافية', 'pouch', '#8a5a30', { use: 'pouch' });
gadget(244, 'phone', 'جهاز التاجر', 'phone', '#2f6b5a', { use: 'phone' });
gadget(245, 'recall', 'بلورة المكان', 'gem', '#c06af5', { use: 'recall' });
gadget(246, 'egg', 'بيضة تنين', 'egg', '#4fae6a', { use: 'egg' });
// the home: a chest that keeps things, a workbench, a torch, and a door two cells tall (drawn as a model, not meshed)
add(K.CHEST, { tiles: { top: 'x:chesttop', side: 'x:chest', bottom: 'x:wood' } }, { key: 'chest', name: 'صندوق', group: 'home', icon: ['chest', '#8a5a30'] });
add(K.TABLE, { tiles: { top: 'x:tabletop', side: 'x:tableside', bottom: 'x:wood' } }, { key: 'table', name: 'طاولة تصنيع', group: 'home', icon: ['table', '#8a5a30'] });
add(K.TORCH, { tiles: 'x:torch', kind: 'cross', height: 0.9, light: '#ffb45e', flicker: true }, { key: 'torch', name: 'مشعل', group: 'home', icon: ['torch', '#ff9a3c'] });
add(K.DOOR, { tiles: 'x:door', kind: 'none', solid: true, pick: true, tall: true, door: 1, heldScale: [0.62, 1.15, 0.14] }, { key: 'door', name: 'باب', group: 'home', icon: ['door', '#8a5a30'] });
KIT_BLOCKS[K.DOOR_TOP] = { tiles: 'x:door', kind: 'none', solid: true, pick: true, door: 2, drop: K.DOOR };
KIT_BLOCKS[K.DOOR_OPEN] = { tiles: 'x:door', kind: 'none', solid: false, pick: true, door: 1, open: true, drop: K.DOOR };
KIT_BLOCKS[K.DOOR_OPEN_TOP] = { tiles: 'x:door', kind: 'none', solid: false, pick: true, door: 2, open: true, drop: K.DOOR };
for (const id of [K.DOOR_TOP, K.DOOR_OPEN, K.DOOR_OPEN_TOP]) INFO[id] = { id, key: 'door-' + id, name: 'باب', group: null };

// ---------------------------------------------------------------------- materials
const rnd = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const tex = {};
const T = (name, size, paint, opts) => (tex[name] ||= canvasTexture(size, paint, opts));
function grain(ctx, s, seed, n, lo, hi) { const r = rnd(seed); for (let i = 0; i < n; i++) { const v = Math.round(lo + r() * (hi - lo)); ctx.fillStyle = `rgba(${v},${v},${v},${0.05 + r() * 0.07})`; const w = 2 + r() * 7; ctx.fillRect(r() * s, r() * s, w, w * (0.4 + r())); } }
function bevel(ctx, s, depth, dark) { const g = [[0, 0, s, depth, 0, 1], [0, s - depth, s, depth, 0, -1], [0, 0, depth, s, 1, 0], [s - depth, 0, depth, s, -1, 0]]; for (const [x, y, w, h, dx, dy] of g) { const gr = dx ? ctx.createLinearGradient(dx > 0 ? x : x + w, 0, dx > 0 ? x + w : x, 0) : ctx.createLinearGradient(0, dy > 0 ? y : y + h, 0, dy > 0 ? y + h : y); gr.addColorStop(0, `rgba(0,0,0,${dark})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gr; ctx.fillRect(x, y, w, h); } }
const paintTex = () => T('paint', 128, (c, s) => { c.fillStyle = '#eeeeee'; c.fillRect(0, 0, s, s); grain(c, s, 7, 260, 120, 255); bevel(c, s, 9, 0.2); });
const lampTex = () => T('lamp', 128, (c, s) => {
  c.fillStyle = '#16181c'; c.fillRect(0, 0, s, s);
  const g = c.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s * 0.62); g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#d8d8d8'); g.addColorStop(1, '#8a8a8a');
  c.fillStyle = g; c.fillRect(12, 12, s - 24, s - 24);
  c.strokeStyle = '#16181c'; c.lineWidth = 5; c.beginPath(); c.moveTo(s / 2, 12); c.lineTo(s / 2, s - 12); c.moveTo(12, s / 2); c.lineTo(s - 12, s / 2); c.stroke();
});
const goldTex = () => T('gold', 128, (c, s) => {
  const g = c.createLinearGradient(0, 0, s, s); g.addColorStop(0, '#fff3c4'); g.addColorStop(0.35, '#f1c24a'); g.addColorStop(0.7, '#d79a22'); g.addColorStop(1, '#f6d572');
  c.fillStyle = g; c.fillRect(0, 0, s, s);
  const r = rnd(11); c.globalAlpha = 0.22; for (let i = 0; i < 70; i++) { c.fillStyle = r() > 0.5 ? '#fff8d8' : '#a8730f'; c.fillRect(0, r() * s, s, 1 + r() * 1.5); } c.globalAlpha = 1;
  c.strokeStyle = 'rgba(120,78,6,.55)'; c.lineWidth = 3; c.strokeRect(13, 13, s - 26, s - 26); bevel(c, s, 10, 0.28);
});
const diamondTex = () => T('diamond', 128, (c, s) => {
  c.fillStyle = '#8fe4f2'; c.fillRect(0, 0, s, s);
  const r = rnd(5), pts = []; for (let j = 0; j <= 4; j++) for (let i = 0; i <= 4; i++) pts.push([(i + (i % 4 ? (r() - 0.5) * 0.6 : 0)) * s / 4, (j + (j % 4 ? (r() - 0.5) * 0.6 : 0)) * s / 4]);
  const shade = ['#e8fdff', '#b9f3fb', '#74d6ea', '#4fbdd8', '#a4ecf7', '#d4f9ff'];
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const a = pts[j * 5 + i], b = pts[j * 5 + i + 1], d = pts[(j + 1) * 5 + i], e = pts[(j + 1) * 5 + i + 1]; for (const tri of [[a, b, d], [b, e, d]]) { c.fillStyle = shade[Math.floor(r() * shade.length)]; c.beginPath(); c.moveTo(tri[0][0], tri[0][1]); c.lineTo(tri[1][0], tri[1][1]); c.lineTo(tri[2][0], tri[2][1]); c.closePath(); c.fill(); } }
  bevel(c, s, 8, 0.16);
});
const glassTex = () => T('glass', 128, (c, s) => {
  c.clearRect(0, 0, s, s); c.fillStyle = 'rgba(205,236,248,.16)'; c.fillRect(0, 0, s, s);
  c.strokeStyle = 'rgba(232,248,255,.9)'; c.lineWidth = 6; c.strokeRect(3, 3, s - 6, s - 6);
  c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.moveTo(26, 62); c.lineTo(58, 26); c.moveTo(44, 78); c.lineTo(66, 54); c.stroke();
});
const woodTex = () => T('wood', 128, (c, s) => { c.fillStyle = '#6f4a2c'; c.fillRect(0, 0, s, s); const r = rnd(3); for (let i = 0; i < 46; i++) { c.fillStyle = `rgba(${r() > 0.5 ? '40,24,10' : '150,104,62'},${0.12 + r() * 0.14})`; c.fillRect(0, r() * s, s, 1 + r() * 2.5); } bevel(c, s, 8, 0.25); });
const pillowTex = () => T('pillow', 128, (c, s) => {
  c.fillStyle = '#e9e7e0'; c.fillRect(0, 0, s, s); grain(c, s, 9, 120, 170, 255); bevel(c, s, 8, 0.14);
  c.fillStyle = '#fbfaf6'; c.strokeStyle = 'rgba(120,112,98,.55)'; c.lineWidth = 2.5; const x = 18, y = 22, w = s - 36, h = s - 44, rr = 16;
  c.beginPath(); c.moveTo(x + rr, y); c.arcTo(x + w, y, x + w, y + h, rr); c.arcTo(x + w, y + h, x, y + h, rr); c.arcTo(x, y + h, x, y, rr); c.arcTo(x, y, x + w, y, rr); c.closePath(); c.fill(); c.stroke();
});
const quiltTex = () => T('quilt', 128, (c, s) => { c.fillStyle = '#ededed'; c.fillRect(0, 0, s, s); grain(c, s, 13, 140, 150, 255); c.strokeStyle = 'rgba(0,0,0,.16)'; c.lineWidth = 2; for (let i = -s; i < s * 2; i += 32) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + s, s); c.moveTo(i + s, 0); c.lineTo(i, s); c.stroke(); } bevel(c, s, 8, 0.18); });
/** Bed side: the lower part (the only part a 0.56-high side shows) is the wooden frame with the blanket hanging over it. */
const bedSideTex = (hex) => T('bedside' + hex, 128, (c, s) => {
  c.fillStyle = '#6a4629'; c.fillRect(0, 0, s, s); const r = rnd(4); for (let i = 0; i < 30; i++) { c.fillStyle = `rgba(40,24,10,${0.1 + r() * 0.14})`; c.fillRect(0, r() * s, s, 1 + r() * 2); }
  c.fillStyle = hex; c.fillRect(0, s * 0.44, s, s * 0.3);                  // canvas y grows down: this band sits in the upper half of the visible strip
  c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(0, s * 0.72, s, 3);
  c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(0, s * 0.44, s, 3);
});
const planks = (c, s, base, seed) => { c.fillStyle = base; c.fillRect(0, 0, s, s); const r = rnd(seed); for (let i = 0; i < 50; i++) { c.fillStyle = `rgba(${r() > 0.5 ? '40,24,10' : '170,120,70'},${0.1 + r() * 0.14})`; c.fillRect(0, r() * s, s, 1 + r() * 2.5); } c.fillStyle = 'rgba(30,18,8,.5)'; for (let i = 1; i < 4; i++) c.fillRect(0, i * s / 4 - 1, s, 2.5); };
const chestTex = () => T('chest', 128, (c, s) => {
  planks(c, s, '#8a5a30', 31);
  c.fillStyle = '#2f2a26'; c.fillRect(0, 0, s, 9); c.fillRect(0, s - 9, s, 9); c.fillRect(0, 0, 9, s); c.fillRect(s - 9, 0, 9, s); c.fillRect(0, s * 0.36, s, 7);     // iron bands and the line of the lid
  c.fillStyle = '#c9a35a'; c.fillRect(s / 2 - 9, s * 0.36 - 9, 18, 24); c.fillStyle = '#2f2a26'; c.fillRect(s / 2 - 3, s * 0.36 + 1, 6, 8);                         // the latch
  bevel(c, s, 6, 0.22);
});
const chestTopTex = () => T('chesttop', 128, (c, s) => { planks(c, s, '#94623a', 32); c.fillStyle = '#2f2a26'; c.fillRect(0, 0, s, 9); c.fillRect(0, s - 9, s, 9); c.fillRect(0, 0, 9, s); c.fillRect(s - 9, 0, 9, s); bevel(c, s, 6, 0.2); });
const tableTopTex = () => T('tabletop', 128, (c, s) => {
  planks(c, s, '#a47446', 33);
  c.strokeStyle = 'rgba(40,24,10,.75)'; c.lineWidth = 3; c.strokeRect(14, 14, s - 28, s - 28);
  for (let i = 1; i < 3; i++) { c.beginPath(); c.moveTo(14 + i * (s - 28) / 3, 14); c.lineTo(14 + i * (s - 28) / 3, s - 14); c.moveTo(14, 14 + i * (s - 28) / 3); c.lineTo(s - 14, 14 + i * (s - 28) / 3); c.stroke(); }
  bevel(c, s, 7, 0.22);
});
const tableSideTex = () => T('tableside', 128, (c, s) => {
  planks(c, s, '#7c5230', 34);
  c.fillStyle = '#a47446'; c.fillRect(0, 0, s, 18); c.fillStyle = 'rgba(30,18,8,.55)'; c.fillRect(0, 18, s, 3);
  c.strokeStyle = '#d7d2c8'; c.lineWidth = 6; c.lineCap = 'round'; c.beginPath(); c.moveTo(34, 104); c.lineTo(62, 50); c.stroke();                            // a hammer and a saw hang on the side
  c.fillStyle = '#5b5f66'; c.fillRect(48, 36, 30, 16);
  c.fillStyle = '#c9ced4'; c.beginPath(); c.moveTo(84, 44); c.lineTo(110, 44); c.lineTo(110, 98); c.closePath(); c.fill(); c.fillStyle = '#5a3a22'; c.fillRect(80, 34, 34, 12);
  bevel(c, s, 6, 0.22);
});
const rockTex = (hex) => T('rock' + hex, 128, (c, s) => {
  c.fillStyle = '#6f6a66'; c.fillRect(0, 0, s, s); grain(c, s, 41, 320, 40, 190);
  const r = rnd(hex.charCodeAt(1) * 7 + hex.charCodeAt(3));
  for (let i = 0; i < 9; i++) { const x = 14 + r() * (s - 28), y = 14 + r() * (s - 28), q = 5 + r() * 7; c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.moveTo(x, y - q - 2); c.lineTo(x + q + 2, y); c.lineTo(x, y + q + 2); c.lineTo(x - q - 2, y); c.closePath(); c.fill(); c.fillStyle = hex; c.beginPath(); c.moveTo(x, y - q); c.lineTo(x + q, y); c.lineTo(x, y + q); c.lineTo(x - q, y); c.closePath(); c.fill(); c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect(x - q * 0.35, y - q * 0.45, q * 0.35, q * 0.3); }
  bevel(c, s, 7, 0.22);
});
const doorTex = () => T('door', 128, (c, s) => {
  planks(c, s, '#8a5a30', 35);
  c.strokeStyle = 'rgba(30,18,8,.7)'; c.lineWidth = 4; c.strokeRect(6, 4, s - 12, s - 8);
  c.fillStyle = 'rgba(30,18,8,.28)'; c.fillRect(20, 12, s - 40, 44); c.fillRect(20, 70, s - 40, 46);                                                          // two sunk panels
  c.strokeStyle = 'rgba(255,220,170,.22)'; c.lineWidth = 2; c.strokeRect(20, 12, s - 40, 44); c.strokeRect(20, 70, s - 40, 46);
  c.fillStyle = '#c9a35a'; c.beginPath(); c.arc(s - 22, 63, 6, 0, 7); c.fill(); c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.arc(s - 21, 65, 6, 0, 7); c.fill(); c.fillStyle = '#e2c27a'; c.beginPath(); c.arc(s - 23, 62, 4.5, 0, 7); c.fill();
});
const cropTex = (stage) => T('crop' + stage, 64, (c, s) => {
  c.clearRect(0, 0, s, s);
  const r = rnd(40 + stage), h = s * (0.35 + stage * 0.2), ripe = stage === 3;
  for (let i = 0; i < 9; i++) {
    const x = 4 + i * 7 + (r() - 0.5) * 3, top = s - h * (0.75 + r() * 0.25);
    c.strokeStyle = ripe ? '#c9a03a' : stage === 2 ? '#8fb84a' : '#5fa83a'; c.lineWidth = 2.4;
    c.beginPath(); c.moveTo(x, s); c.lineTo(x + (r() - 0.5) * 4, top); c.stroke();
    if (stage >= 2) { c.fillStyle = ripe ? '#e8c45a' : '#a8c86a'; c.fillRect(x - 2.5, top - 2, 5, 9); c.fillStyle = ripe ? '#f4dc84' : '#c0dc84'; c.fillRect(x - 1, top - 1, 2, 7); }
    else { c.fillStyle = '#6fbf4a'; c.beginPath(); c.ellipse(x + 3, top + 6, 4, 1.6, -0.6, 0, 7); c.fill(); }
  }
}, { alpha: true });
const gemTex = (hex) => T('gem' + hex, 128, (c, s) => {
  c.fillStyle = hex; c.fillRect(0, 0, s, s);
  const r = rnd(hex.length * 13 + hex.charCodeAt(2));
  for (let i = 0; i < 26; i++) { c.fillStyle = r() > 0.5 ? 'rgba(255,255,255,.28)' : 'rgba(0,0,0,.2)'; const x = r() * s, y = r() * s, w = 10 + r() * 26; c.beginPath(); c.moveTo(x, y); c.lineTo(x + w, y + w * 0.4); c.lineTo(x + w * 0.4, y + w); c.closePath(); c.fill(); }
  bevel(c, s, 9, 0.22);
});
const luckyTex = (top) => T('lucky' + (top ? 't' : 's'), 128, (c, s) => {
  const g = c.createLinearGradient(0, 0, s, s); g.addColorStop(0, '#8a4fd6'); g.addColorStop(1, '#4a2290'); c.fillStyle = g; c.fillRect(0, 0, s, s);
  c.fillStyle = '#f0bd3f'; c.fillRect(0, s * 0.44, s, s * 0.12); if (top) c.fillRect(s * 0.44, 0, s * 0.12, s);       // a gold ribbon round it
  const star = (x, y, r) => { c.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); c.fill(); };
  c.fillStyle = '#fff3c4'; for (const [x, y, r] of [[0.22, 0.24, 11], [0.78, 0.26, 8], [0.24, 0.78, 8], [0.76, 0.76, 11]]) star(x * s, y * s, r);
  bevel(c, s, 8, 0.28);
});
const portalTex = () => T('portal', 128, (c, s) => {
  const g = c.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s * 0.7); g.addColorStop(0, 'rgba(220,255,250,.95)'); g.addColorStop(0.5, 'rgba(47,224,192,.75)'); g.addColorStop(1, 'rgba(40,80,160,.6)');
  c.fillStyle = g; c.fillRect(0, 0, s, s); const r = rnd(77); c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 2;
  for (let i = 0; i < 8; i++) { c.beginPath(); c.arc(s / 2, s / 2, 10 + i * 8 + r() * 4, r() * 6, r() * 6 + 2); c.stroke(); }
});
const soilTex = (top) => T('soil' + (top ? 't' : ''), 128, (c, s) => {
  c.fillStyle = '#6a4a2a'; c.fillRect(0, 0, s, s); grain(c, s, 21, 220, 30, 120);
  if (top) { c.fillStyle = 'rgba(30,18,8,.55)'; for (let i = 0; i < 4; i++) c.fillRect(0, 10 + i * 32, s, 9); c.fillStyle = 'rgba(160,120,70,.35)'; for (let i = 0; i < 4; i++) c.fillRect(0, 20 + i * 32, s, 4); }
  bevel(c, s, 6, 0.25);
});
const vegTex = (kind, stage) => T('veg' + kind + stage, 64, (c, s) => {
  c.clearRect(0, 0, s, s);
  const r = rnd(60 + stage + (kind === 'c' ? 0 : 9)), h = s * (0.25 + stage * 0.17);
  for (let i = 0; i < 7; i++) {
    const x = 6 + i * 8.5 + (r() - 0.5) * 3, top = s - h * (0.7 + r() * 0.3);
    c.strokeStyle = kind === 'c' ? '#4fa83a' : '#3f8a3a'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(x, s); c.lineTo(x, top); c.stroke();
    c.fillStyle = kind === 'c' ? '#5fbf4a' : '#4a9a3f';
    if (kind === 'c') { for (let k = 0; k < 3; k++) { c.beginPath(); c.ellipse(x + (k - 1) * 3, top + k * 3, 1.6, 4.5, (k - 1) * 0.5, 0, 7); c.fill(); } }
    else { c.beginPath(); c.ellipse(x, top + 3, 4.5, 3.2, 0, 0, 7); c.fill(); }
    if (stage === 3) { c.fillStyle = kind === 'c' ? '#ee8a2a' : '#c9a060'; if (kind === 'c') { c.beginPath(); c.moveTo(x - 2.5, s); c.lineTo(x + 2.5, s); c.lineTo(x, s - 9); c.closePath(); c.fill(); } else { c.beginPath(); c.ellipse(x, s - 3, 3.5, 2.6, 0, 0, 7); c.fill(); } }
  }
}, {});
const furnaceTex = (top) => T('furnace' + (top ? 't' : 's'), 128, (c, s) => {
  c.fillStyle = '#7a7a80'; c.fillRect(0, 0, s, s); grain(c, s, 33, 260, 60, 200);
  c.strokeStyle = 'rgba(30,30,34,.6)'; c.lineWidth = 3; for (let y = 0; y < s; y += 32) { c.beginPath(); c.moveTo(0, y); c.lineTo(s, y); c.stroke(); for (let x = (y / 32) % 2 ? 16 : 0; x < s; x += 32) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 32); c.stroke(); } }
  if (!top) { c.fillStyle = '#1e1e22'; c.fillRect(s * 0.25, s * 0.45, s * 0.5, s * 0.38); const g = c.createLinearGradient(0, s * 0.83, 0, s * 0.55); g.addColorStop(0, '#ffb84a'); g.addColorStop(1, 'rgba(255,90,30,0)'); c.fillStyle = g; c.fillRect(s * 0.28, s * 0.5, s * 0.44, s * 0.32); }
  bevel(c, s, 8, 0.3);
});
const torchTex = () => T('torchk', 128, (c, s) => {
  c.clearRect(0, 0, s, s);
  c.fillStyle = '#5a3a22'; c.fillRect(s / 2 - 7, s * 0.42, 14, s * 0.58); c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(s / 2 + 2, s * 0.42, 5, s * 0.58);
  c.fillStyle = '#2f2a26'; c.fillRect(s / 2 - 10, s * 0.38, 20, 12);
  const g = c.createLinearGradient(0, s * 0.4, 0, s * 0.02); g.addColorStop(0, '#fff6c8'); g.addColorStop(0.4, '#ffc23c'); g.addColorStop(0.8, '#ff7a1c'); g.addColorStop(1, 'rgba(255,60,10,0)');
  c.fillStyle = g; c.beginPath(); c.moveTo(s / 2 - 13, s * 0.4); c.quadraticCurveTo(s / 2 - 20, s * 0.2, s / 2 + 2, s * 0.02); c.quadraticCurveTo(s / 2 + 20, s * 0.22, s / 2 + 13, s * 0.4); c.closePath(); c.fill();
});
function flameTex(seed) {
  return T('flame' + seed, 128, (c, s) => {
    c.clearRect(0, 0, s, s); const r = rnd(seed);
    for (let i = 0; i < 5; i++) {
      const x = s * (0.2 + 0.15 * i + (r() - 0.5) * 0.06), h = s * (0.5 + r() * 0.42), w = s * (0.13 + r() * 0.06);
      const g = c.createLinearGradient(0, s, 0, s - h); g.addColorStop(0, '#fff6c8'); g.addColorStop(0.35, '#ffc23c'); g.addColorStop(0.75, '#ff7a1c'); g.addColorStop(1, 'rgba(255,60,10,0)');
      c.fillStyle = g; c.beginPath(); c.moveTo(x - w, s); c.quadraticCurveTo(x - w * 1.25, s - h * 0.5, x + (r() - 0.5) * w, s - h); c.quadraticCurveTo(x + w * 1.25, s - h * 0.5, x + w, s); c.closePath(); c.fill();
    }
  });
}

const mats = new Map();
let fireMat = null;
/** Material of a kit tile ('x:…'), or null for any other tile name. */
export function kitMaterial(tile) {
  if (typeof tile !== 'string' || tile.charCodeAt(0) !== 120 || tile[1] !== ':') return null;
  let m = mats.get(tile);
  if (m) return m;
  const [, kind, arg] = tile.split(':');
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...o });
  if (kind === 'paint') m = std({ map: paintTex(), color: arg });
  else if (kind === 'lamp') m = std({ map: lampTex(), color: 0x2a2a2a, emissive: new THREE.Color(arg), emissiveMap: lampTex(), emissiveIntensity: 1.7, roughness: 0.5 });
  else if (kind === 'gold') m = std({ map: goldTex(), color: 0xffffff, metalness: 0.85, roughness: 0.32, emissive: 0x4a3104, emissiveIntensity: 0.55 });
  else if (kind === 'diamond') m = std({ map: diamondTex(), color: 0xffffff, metalness: 0.15, roughness: 0.12, emissive: 0x1c6f80, emissiveIntensity: 0.45 });
  else if (kind === 'glass') m = std({ map: glassTex(), transparent: true, depthWrite: false, roughness: 0.08, side: THREE.DoubleSide });
  else if (kind === 'water') m = std({ color: 0x2f86c8, transparent: true, opacity: 0.66, roughness: 0.12, depthWrite: false });
  else if (kind === 'fire') m = fireMat = new THREE.MeshBasicMaterial({ map: flameTex(21), alphaTest: 0.3, toneMapped: false, fog: false, color: 0xffd9a8 });
  else if (kind === 'wood') m = std({ map: woodTex() });
  else if (kind === 'chest') m = std({ map: chestTex() });
  else if (kind === 'chesttop') m = std({ map: chestTopTex() });
  else if (kind === 'tabletop') m = std({ map: tableTopTex() });
  else if (kind === 'tableside') m = std({ map: tableSideTex() });
  else if (kind === 'door') m = std({ map: doorTex() });
  else if (kind === 'rock') m = std({ map: rockTex(arg), emissive: new THREE.Color(arg), emissiveMap: rockTex(arg), emissiveIntensity: 0.16, roughness: 0.8 });
  else if (kind === 'torch') m = new THREE.MeshBasicMaterial({ map: torchTex(), alphaTest: 0.3, toneMapped: false, fog: false, color: 0xfff0dc });
  else if (kind === 'pillow') m = std({ map: pillowTex() });
  else if (kind === 'lucky') m = std({ map: luckyTex(arg === 'top'), emissive: 0x3a1a6a, emissiveIntensity: 0.4, roughness: 0.5 });
  else if (kind === 'portal') m = new THREE.MeshBasicMaterial({ map: portalTex(), transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
  else if (kind === 'farmland') m = std({ map: soilTex(true) });
  else if (kind === 'soil') m = std({ map: soilTex(false) });
  else if (kind === 'veg') m = std({ map: vegTex(arg[0], +arg[1]), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 });
  else if (kind === 'furnace') m = std({ map: furnaceTex(arg === 'top'), emissive: arg === 'top' ? 0x000000 : 0x6a2a08, emissiveMap: arg === 'top' ? null : furnaceTex(false), emissiveIntensity: arg === 'top' ? 0 : 0.5 });
  else if (kind === 'crop') m = std({ map: cropTex(+arg), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 });
  else if (kind === 'gem') m = std({ map: gemTex(arg), color: 0xffffff, metalness: 0.2, roughness: 0.18, emissive: new THREE.Color(arg), emissiveIntensity: 0.25 });
  else if (kind === 'quilt') m = std({ map: quiltTex(), color: arg });
  else if (kind === 'bedside') m = std({ map: bedSideTex(arg) });
  else return null;
  m.name = tile;
  mats.set(tile, m);
  return m;
}

// ---------------------------------------------------------------------- icons (an <img>, so no HUD stylesheet can restyle it)
const shadeHex = (hex, k) => { const c = new THREE.Color(hex); c.multiplyScalar(k); return '#' + c.getHexString(); };
function svgIcon([shape, hex, extra]) {
  const top = shadeHex(hex, 1.12), left = shadeHex(hex, 0.78), right = shadeHex(hex, 0.6), line = 'rgba(0,0,0,.35)';
  const cube = (y0) => `<path d="M16 ${y0}l11 6-11 6-11-6z" fill="${top}" stroke="${line}" stroke-width=".7"/><path d="M5 ${y0 + 6}l11 6v${27 - y0 - 12}l-11-6z" fill="${left}" stroke="${line}" stroke-width=".7"/><path d="M27 ${y0 + 6}l-11 6v${27 - y0 - 12}l11-6z" fill="${right}" stroke="${line}" stroke-width=".7"/>`;
  let body;
  if (shape === 'slab') body = cube(12);
  else if (shape === 'lamp') body = `<circle cx="16" cy="16" r="14" fill="${hex}" opacity=".28"/>` + cube(4) + '<path d="M16 16v11M10.500 13l5.500 3 5.500-3" fill="none" stroke="rgba(0,0,0,.45)" stroke-width="1"/>';
  else if (shape === 'glass') body = `<path d="M16 4l11 6v12l-11 6-11-6V10z" fill="${hex}" fill-opacity=".28" stroke="#eaf8ff" stroke-width="1.4"/><path d="M5 10l11 6 11-6M16 16v12" fill="none" stroke="#eaf8ff" stroke-width="1"/><path d="M9 17l4-4" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>`;
  else if (shape === 'drop') body = `<path d="M16 3c5 7 9 11 9 16a9 9 0 0 1-18 0c0-5 4-9 9-16z" fill="${hex}" stroke="${line}" stroke-width=".8"/><path d="M11.500 19a4.500 4.500 0 0 0 3 4.300" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.6" stroke-linecap="round"/>`;
  else if (shape === 'flame') body = `<path d="M16 3c1 6 8 8 8 16a8 8 0 0 1-16 0c0-4 2-6 3-9 1 3 2 4 3 4 0-4 0-7 2-11z" fill="${hex}" stroke="${line}" stroke-width=".8"/><path d="M16 15c.500 3 4 4 4 7a4 4 0 0 1-8 0c0-2 1-3 1.500-4.500.500 1.500 1 2 1.500 2 0-2 0-3 1-4.500z" fill="#ffe28a"/>`;
  else if (shape === 'bed') body = `<path d="M3 21l9-5 17 9-9 5z" fill="${top}" stroke="${line}" stroke-width=".7"/><path d="M3 21v3l17 9v-3z" fill="${left}" stroke="${line}" stroke-width=".7"/><path d="M29 25v3l-9 5v-3z" fill="${right}" stroke="${line}" stroke-width=".7"/><path d="M4.500 20l6-3.300 5 2.600-6 3.300z" fill="#f6f4ee" stroke="${line}" stroke-width=".7"/><path d="M3 21v-6l9-5v6" fill="#6a4629" stroke="${line}" stroke-width=".7"/>`;
  else if (shape === 'meat') body = `<path d="M9 8c5-4 13-2 15 4s-2 12-8 13-10-3-10-8 1-7 3-9z" fill="${hex}" stroke="${line}" stroke-width=".8"/><path d="M13 12c3-2 7-1 8 2s-1 6-4 7" fill="none" stroke="#e9b9a6" stroke-width="1.6" stroke-linecap="round"/><path d="M8 22l-4 4M6.500 20.500l-3.500 1M9.500 23.500l-1 3.500" stroke="#efe7d8" stroke-width="2.4" stroke-linecap="round"/>`;
  else if (shape === 'drum') body = `<path d="M19 5c5 0 8 4 8 8s-4 8-9 8c-2 0-3 0-4.500 1.500l-3 3-3-3 3-3C12 18 12 17 12 14c0-5 3-9 7-9z" fill="${hex}" stroke="${line}" stroke-width=".8"/><path d="M9 23l-3.500 3.500M5 23.500l2 2 2.500 0 0-2.500-2-2z" fill="#f4eee0" stroke="#f4eee0" stroke-width="2.200" stroke-linecap="round"/><path d="M17 9c3-1 5 1 5.500 3" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1.400" stroke-linecap="round"/>`;
  else if (shape === 'fish') body = `<path d="M4 16c4-7 13-8 19-1l5-4v10l-5-4c-6 7-15 6-19-1z" fill="${hex}" stroke="${line}" stroke-width=".8"/><circle cx="9.500" cy="14.500" r="1.400" fill="#10151c"/><path d="M14 12c1.500 2.500 1.500 5.500 0 8M18 13c1 2 1 4 0 6" fill="none" stroke="rgba(0,0,0,.28)" stroke-width="1"/><path d="M8 19c3 2 7 2 10 0" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.200"/>`;
  else if (shape === 'shrimp') body = `<path d="M8 9c8-5 17 0 17 8 0 6-5 10-11 9l1-4c4 0 6-2 6-5 0-4-5-6-10-4z" fill="${hex}" stroke="${line}" stroke-width=".8"/><path d="M13 10l-1 5M17 10l0 5M21 13l-3 3M22 18l-4 0" stroke="rgba(0,0,0,.25)" stroke-width="1"/><path d="M8 9L4 5M8 9L3 9" stroke="${hex}" stroke-width="1.200" stroke-linecap="round"/><circle cx="9.500" cy="10.500" r="1" fill="#10151c"/><path d="M14 26l-3 2M15 24l-4 0" stroke="${hex}" stroke-width="1.600" stroke-linecap="round"/>`;
  else if (shape === 'weed') body = `<path d="M11 29c-3-6 3-9 0-15s2-8 1-11M17 29c3-7-2-10 1-16s-1-7 0-9M22 29c2-5-2-7 0-12" fill="none" stroke="${hex}" stroke-width="3.200" stroke-linecap="round"/><path d="M11 29c-3-6 3-9 0-15M17 29c3-7-2-10 1-16" fill="none" stroke="#bfe9c8" stroke-opacity=".5" stroke-width="1"/>`;
  else if (shape === 'dates') body = `<path d="M16 4v9M16 8l-6 6M16 8l6 6" fill="none" stroke="#8a6a3a" stroke-width="1.600" stroke-linecap="round"/>` + [[10, 16], [16, 15], [22, 16], [13, 22], [19, 22], [16, 27]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="3" ry="4" fill="${hex}" stroke="${line}" stroke-width=".7"/><path d="M${x - 1} ${y - 2}v3" stroke="#d89a5a" stroke-width="1" stroke-linecap="round"/>`).join('');
  else if (shape === 'seeds') body = [[9, 12, 20], [16, 9, -15], [23, 13, 40], [12, 20, -30], [20, 21, 10], [15, 26, 60]].map(([x, y, a]) => `<ellipse cx="${x}" cy="${y}" rx="2.300" ry="3.600" transform="rotate(${a} ${x} ${y})" fill="${hex}" stroke="${line}" stroke-width=".7"/>`).join('');
  else if (shape === 'fur') body = `<path d="M7 6l4 2 5-2 5 2 4-2 1 6-2 3 2 4-1 7-5-2-4 3-4-3-5 2-1-7 2-4-2-3z" fill="${hex}" stroke="${line}" stroke-width=".8"/><path d="M11 12l1 3M16 11l0 4M21 12l-1 3M12 19l1 3M19 19l-1 3M16 20l0 3" stroke="rgba(0,0,0,.28)" stroke-width="1.200" stroke-linecap="round"/>`;
  else if (shape === 'feather') body = `<path d="M26 4c-10 1-17 8-18 19l3 1c9-2 16-9 15-20z" fill="${hex}" stroke="rgba(0,0,0,.45)" stroke-width=".9"/><path d="M5 28L24 7" stroke="#8d949c" stroke-width="1.400" stroke-linecap="round"/><path d="M12 20l-3-3M16 16l-4-3M20 12l-4-2M13 20l5 1M17 16l5 0" stroke="rgba(0,0,0,.2)" stroke-width="1"/>`;
  else if (shape === 'pearl') body = `<circle cx="16" cy="16" r="10" fill="${hex}" stroke="rgba(0,0,0,.4)" stroke-width=".9"/><path d="M10 14a7 7 0 0 1 5-5" fill="none" stroke="#fff" stroke-width="2.200" stroke-linecap="round"/><circle cx="20" cy="20" r="3" fill="#d9c8ea" opacity=".6"/>`;
  else if (shape === 'lucky') body = cube(6) + '<path d="M5 15l11 6 11-6M16 21v8" fill="none" stroke="#f0bd3f" stroke-width="2"/><path d="M16 4l1.400 3 3.200.400-2.300 2.200.600 3.200L16 11.300l-2.900 1.500.600-3.200-2.300-2.200 3.200-.400z" fill="#fff3c4"/>';
  else if (shape === 'car') body = `<path d="M3 20h26v5H3z" fill="${hex}" stroke="${line}" stroke-width=".8"/><path d="M7 20l3-7h12l4 7z" fill="${shadeHex(hex, 1.15)}" stroke="${line}" stroke-width=".8"/><path d="M11 14h4v5h-6zM17 14h4l3 5h-7z" fill="#bfeaff" opacity=".85"/><circle cx="9" cy="26" r="3.200" fill="#1e1e22" stroke="#888" stroke-width="1"/><circle cx="23" cy="26" r="3.200" fill="#1e1e22" stroke="#888" stroke-width="1"/><path d="M27 21h2" stroke="#ffe28a" stroke-width="1.600"/>`;
  else if (shape === 'shovel') body = `<path d="M8 28L22 9" stroke="#6a4629" stroke-width="2.800" stroke-linecap="round"/><path d="M19 4l9 5-4 5c-3 1-6-1-7-4z" fill="${hex}" stroke="${line}" stroke-width=".8"/>`;
  else if (shape === 'hoe') body = `<path d="M8 28L22 8" stroke="#6a4629" stroke-width="2.800" stroke-linecap="round"/><path d="M15 6h11v4l-3 1-1-2h-7z" fill="${hex}" stroke="${line}" stroke-width=".8"/>`;
  else if (shape === 'shield') body = `<path d="M16 3l11 4v8c0 7-5 11-11 14C10 26 5 22 5 15V7z" fill="${hex}" stroke="${line}" stroke-width=".9"/><path d="M16 5.500l9 3.300v6.500c0 5.500-4 9-9 11.500-5-2.500-9-6-9-11.500V8.800z" fill="none" stroke="#c9ced6" stroke-width="1.600"/><circle cx="16" cy="15" r="3.200" fill="#c9ced6" stroke="rgba(0,0,0,.35)" stroke-width=".7"/>`;
  else if (shape === 'wings') body = `<path d="M15 8C9 6 4 9 3 15c4-2 7-1 9 1-3 0-6 2-7 5 4-2 7-1 10 1z" fill="${hex}" stroke="${line}" stroke-width=".8"/><path d="M17 8c6-2 11 1 12 7-4-2-7-1-9 1 3 0 6 2 7 5-4-2-7-1-10 1z" fill="${hex}" stroke="${line}" stroke-width=".8"/>`;
  else if (shape === 'apple') body = `<path d="M16 10c-5-4-12 0-11 7s6 11 11 9c5 2 10-2 11-9s-6-11-11-7z" fill="${hex}" stroke="${line}" stroke-width=".8"/><path d="M16 10c0-3 1-5 3-6" stroke="#6a4629" stroke-width="1.600" fill="none"/><path d="M18 7c2-2 5-2 6 0-2 2-4 2-6 0z" fill="#4fa83a"/><path d="M10 15c0-2 1-3 2-3" stroke="#fff" stroke-opacity=".6" stroke-width="1.400" fill="none"/>`;
  else if (shape === 'carrot') body = `<path d="M7 26l14-14 3 3-14 14z" fill="${hex}" stroke="${line}" stroke-width=".8"/><path d="M21 12l3-7M22 13l7-2M23 11l4-5" stroke="#4fa83a" stroke-width="2" stroke-linecap="round"/>`;
  else if (shape === 'potato') body = `<ellipse cx="16" cy="17" rx="11" ry="8" fill="${hex}" stroke="${line}" stroke-width=".8"/><circle cx="11" cy="15" r="1" fill="#6a4a2a"/><circle cx="18" cy="13" r="1" fill="#6a4a2a"/><circle cx="20" cy="20" r="1" fill="#6a4a2a"/>`;
  else if (shape === 'ingot') body = `<path d="M4 20l6-8h16l2 8z" fill="${hex}" stroke="${line}" stroke-width=".8"/><path d="M4 20h24v4H4z" fill="${shadeHex(hex, 0.7)}" stroke="${line}" stroke-width=".8"/><path d="M11 14h12" stroke="#fff" stroke-opacity=".7" stroke-width="1.400"/>`;
  else if (shape === 'arrow') body = `<path d="M5 27L25 7" stroke="${hex}" stroke-width="2"/><path d="M25 7l-6 1 5 5z" fill="#c9ced6" stroke="${line}" stroke-width=".7"/><path d="M5 27l1-6M5 27l6-1M8 24l1-5M8 24l5-1" stroke="#eef0f2" stroke-width="1.600"/>`;
  else if (shape === 'bow') body = `<path d="M8 4c12 4 16 12 20 24" fill="none" stroke="${hex}" stroke-width="3" stroke-linecap="round"/><path d="M8 4l20 24" stroke="#e8e0d0" stroke-width="1"/>`;
  else if (shape === 'bucket') body = `<path d="M7 11h18l-3 16H10z" fill="#9aa0a8" stroke="${line}" stroke-width=".8"/><path d="M8 11h16v3H8z" fill="${hex}"/><path d="M7 11c0-6 18-6 18 0" fill="none" stroke="${line}" stroke-width="1.400"/>`;
  else if (shape === 'shears') body = `<path d="M9 23l13-15M23 23L10 8" stroke="${hex}" stroke-width="2.600" stroke-linecap="round"/><circle cx="8" cy="25" r="3.200" fill="none" stroke="#c33d2e" stroke-width="2"/><circle cx="24" cy="25" r="3.200" fill="none" stroke="#c33d2e" stroke-width="2"/>`;
  else if (shape === 'lead') body = `<path d="M6 26c4-10 2-16 10-18s12 6 8 12-12 2-9-4" fill="none" stroke="${hex}" stroke-width="2.400" stroke-linecap="round"/><circle cx="6" cy="26" r="2.500" fill="#8a5a30"/>`;
  else if (shape === 'saddle') body = `<path d="M5 14c4-4 18-4 22 0l-2 8H7z" fill="${hex}" stroke="${line}" stroke-width=".8"/><path d="M10 22v6M22 22v6" stroke="#2a2016" stroke-width="2"/><path d="M8 13c3-2 13-2 16 0" stroke="#c9a35a" stroke-width="1.400" fill="none"/>`;
  else if (shape === 'compass') body = `<circle cx="16" cy="16" r="12" fill="#c9ced6" stroke="${line}" stroke-width=".9"/><circle cx="16" cy="16" r="9.500" fill="#f4f1e6"/><path d="M16 7l3 9h-6z" fill="${hex}"/><path d="M16 25l3-9h-6z" fill="#3a3f46"/>`;
  else if (shape === 'clock') body = `<circle cx="16" cy="16" r="12" fill="${hex}" stroke="${line}" stroke-width=".9"/><circle cx="16" cy="16" r="9" fill="#2a3a6a"/><path d="M7 16a9 9 0 0 1 18 0z" fill="#8fd0ff"/><circle cx="12" cy="12" r="2.400" fill="#ffd76a"/><path d="M16 16V9M16 16l5 3" stroke="#fff" stroke-width="1.400" stroke-linecap="round"/>`;
  else if (shape === 'flint') body = `<path d="M6 22l8-12 6 3-6 12z" fill="#3a3a40" stroke="${line}" stroke-width=".8"/><path d="M18 8c4 0 8 3 8 7h-3c0-2-2-4-5-4z" fill="#c9ced6" stroke="${line}" stroke-width=".8"/><path d="M22 20l3 3M24 18l4 1M20 22l1 4" stroke="#ffb84a" stroke-width="1.600" stroke-linecap="round"/>`;
  else if (shape === 'book') body = `<path d="M6 6h18v20H6z" fill="${hex}" stroke="${line}" stroke-width=".8"/><path d="M8 6v20" stroke="rgba(0,0,0,.35)" stroke-width="1.600"/><path d="M24 8h2v18h-18v-2" fill="#f4efe0" stroke="${line}" stroke-width=".6"/><path d="M12 12h8M12 15h8" stroke="#f0bd3f" stroke-width="1.400"/>`;
  else if (shape === 'tag') body = `<path d="M5 12h16l6 5-6 5H5z" fill="${hex}" stroke="${line}" stroke-width=".8"/><circle cx="22" cy="17" r="1.600" fill="#6a4629"/><path d="M9 15h8M9 19h6" stroke="#8a7a5a" stroke-width="1.200"/>`;
  else if (shape === 'spyglass') body = `<path d="M5 22l16-10 3 4-16 10z" fill="${hex}" stroke="${line}" stroke-width=".8"/><path d="M19 11l7-4 3 5-7 4z" fill="#8a5a30" stroke="${line}" stroke-width=".8"/><circle cx="27.500" cy="9.500" r="2" fill="#8fd0ff"/>`;
  else if (shape === 'furnace') body = cube(4) + '<path d="M9 18l6 3v6l-6-3z" fill="#1e1e22"/><path d="M10 22l4 2v2l-4-2z" fill="#ffb84a"/>';
  else if (shape === 'wheat') body = [9, 15, 21].map((x) => `<path d="M${x + 1} 29V12" stroke="#a08a3a" stroke-width="1.4"/><ellipse cx="${x + 1}" cy="9" rx="2.600" ry="5" fill="${hex}" stroke="${line}" stroke-width=".7"/>`).join('');
  else if (shape === 'bread') body = `<path d="M5 20c0-6 5-10 11-10s11 4 11 10v4H5z" fill="${hex}" stroke="${line}" stroke-width=".8"/><path d="M10 14l2 4M16 12v5M22 14l-2 4" stroke="#f4dca0" stroke-width="1.6" stroke-linecap="round"/>`;
  else if (shape === 'rod') body = `<path d="M5 28L25 4" stroke="${hex}" stroke-width="2.400" stroke-linecap="round"/><path d="M25 4c3 6 3 12 1 18" fill="none" stroke="#d8d8d8" stroke-width=".8"/><circle cx="26" cy="23" r="2.200" fill="#e0344a" stroke="#fff" stroke-width=".7"/><circle cx="9" cy="23" r="2.600" fill="#3a3f46"/>`;
  else if (shape === 'can') body = `<path d="M7 12h14v14H7z" fill="${hex}" stroke="${line}" stroke-width=".8"/><path d="M21 15l7-5v3l-6 5" fill="${hex}" stroke="${line}" stroke-width=".8"/><path d="M9 12c0-4 10-4 10 0" fill="none" stroke="${line}" stroke-width="1.6"/><path d="M28 13l2 2M28 16l2 1M27 18l2 2" stroke="#8fd0ff" stroke-width="1.200" stroke-linecap="round"/>`;
  else if (shape === 'boat') body = `<path d="M3 17h26l-4 8H7z" fill="${hex}" stroke="${line}" stroke-width=".8"/><path d="M3 17h26" stroke="#c9905a" stroke-width="1.6"/><path d="M15 17V4l8 10h-8" fill="#f1ece0" stroke="${line}" stroke-width=".7"/><path d="M2 27c4 2 8-2 14 0s10-2 14 0" fill="none" stroke="#5ab0e8" stroke-width="1.400"/>`;
  else if (shape === 'sword') body = `<path d="M25.500 3.500l3 3-13.500 13.500-4.500 1.500 1.500-4.500z" fill="${hex}" stroke="${line}" stroke-width=".8"/><path d="M24 5l3 3" stroke="#fff" stroke-opacity=".7" stroke-width="1.2"/><path d="M8.500 15.500l8 8" stroke="#c9a35a" stroke-width="2.600" stroke-linecap="round"/><path d="M10.500 21.500l-5 5" stroke="#6a4629" stroke-width="3" stroke-linecap="round"/>`;
  else if (shape === 'armor') body = `<path d="M10 5l6 3 6-3 5 4-3 5-2-1.500V27H10V12.500L8 14 5 9z" fill="${hex}" stroke="${line}" stroke-width=".8"/><path d="M16 8v19M11 16h10" stroke="rgba(0,0,0,.25)" stroke-width="1"/><path d="M12 10.500l3 1.500" stroke="#fff" stroke-opacity=".8" stroke-width="1.400" stroke-linecap="round"/>`;
  else if (shape === 'axe') body = `<path d="M9 27L23 9" stroke="#6a4629" stroke-width="3" stroke-linecap="round"/><path d="M17 6c4-3 9-2 11 2l-6 7c-1-3-4-5-8-5z" fill="${hex}" stroke="${line}" stroke-width=".8"/><path d="M20 7c2-1 4-.500 5.500 1" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.200" stroke-linecap="round"/>`;
  else if (shape === 'pick') body = `<path d="M8 27L22 10" stroke="#6a4629" stroke-width="3" stroke-linecap="round"/><path d="M8 9c7-5 15-4 20 3l-2.500 2c-4-4-10-5-15-2.500z" fill="${hex}" stroke="${line}" stroke-width=".8"/><path d="M12 8.500c4-2 8-2 11.500 0" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.200" stroke-linecap="round"/>`;
  else if (shape === 'helmet') body = `<path d="M6 21v-5a10 10 0 0 1 20 0v5h-5v-5h-10v5z" fill="${hex}" stroke="${line}" stroke-width=".8"/><path d="M14.500 16v8h3v-8" fill="${left}" stroke="${line}" stroke-width=".8"/><path d="M10 12a7 7 0 0 1 6-4" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="1.400" stroke-linecap="round"/>`;
  else if (shape === 'legs') body = `<path d="M9 5h14l1 22h-6l-2-13-2 13H8z" fill="${hex}" stroke="${line}" stroke-width=".8"/><path d="M9 9h14" stroke="rgba(0,0,0,.3)" stroke-width="1.200"/><path d="M11.500 12v9" stroke="#fff" stroke-opacity=".7" stroke-width="1.400" stroke-linecap="round"/>`;
  else if (shape === 'boots') body = `<path d="M5 9h7v11l5 3v4H5z" fill="${hex}" stroke="${line}" stroke-width=".8"/><path d="M17 9h7v11l4 3v4H17z" fill="${left}" stroke="${line}" stroke-width=".8"/><path d="M5 24h12M17 24h11" stroke="rgba(0,0,0,.3)" stroke-width="1.200"/>`;
  else if (shape === 'chest') body = cube(6) + '<path d="M5 17l11 6 11-6" fill="none" stroke="rgba(30,18,8,.8)" stroke-width="1.600"/><path d="M14.500 21.500h3v4.500h-3z" fill="#e2c27a" stroke="rgba(0,0,0,.4)" stroke-width=".6"/>';
  else if (shape === 'table') body = cube(6) + '<path d="M10 9.500l6 3.300 6-3.300M13 8l6 3.300M19 8l-6 3.300" fill="none" stroke="rgba(30,18,8,.6)" stroke-width="1"/><path d="M8 19l5 2.700" stroke="#d7d2c8" stroke-width="1.800" stroke-linecap="round"/>';
  else if (shape === 'door') body = `<path d="M9 3h14v26H9z" fill="${hex}" stroke="${line}" stroke-width=".9"/><path d="M11.500 6h9v9h-9zM11.500 17.500h9v9h-9z" fill="${left}" stroke="rgba(0,0,0,.3)" stroke-width=".7"/><circle cx="20" cy="16.300" r="1.500" fill="#e2c27a"/>`;
  else if (shape === 'torch') body = `<path d="M16 15v13" stroke="#6a4629" stroke-width="3.400" stroke-linecap="round"/><path d="M16 3c1 4 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-5 .500 1.500 1 2 1.500 2 0-2 .500-4 1.500-6z" fill="${hex}" stroke="${line}" stroke-width=".7"/><path d="M16 9c.500 1.500 2 2 2 3.500a2 2 0 0 1-4 0c0-1.500 1.500-2 2-3.500z" fill="#ffe28a"/>`;
  else if (shape === 'egg') body = `<path d="M16 4c5 0 9 8 9 14a9 9 0 0 1-18 0c0-6 4-14 9-14z" fill="${hex}" stroke="${line}" stroke-width=".8"/><path d="M11 15l3-2 2 2 3-2 2 2" fill="none" stroke="#e9d98a" stroke-width="1.600"/><circle cx="12" cy="21" r="1.500" fill="#7747bb"/><circle cx="19" cy="22" r="1.200" fill="#7747bb"/>`;
  else if (shape === 'detector') body = `<path d="M9 5l14 14" stroke="#6a4629" stroke-width="3" stroke-linecap="round"/><circle cx="23" cy="22" r="6" fill="none" stroke="${hex}" stroke-width="3"/><circle cx="23" cy="22" r="1.800" fill="${hex}"/><path d="M5 9l5-5" stroke="#2f2a26" stroke-width="4" stroke-linecap="round"/>`;
  else if (shape === 'camera') body = `<path d="M4 10h6l2-3h8l2 3h6v15H4z" fill="${hex}" stroke="${line}" stroke-width=".8"/><circle cx="16" cy="17" r="5.500" fill="#9fd4f5" stroke="#e8f6ff" stroke-width="1.400"/><circle cx="14.300" cy="15.300" r="1.400" fill="#fff"/><rect x="23" y="12" width="3" height="2" fill="#ffd76a"/>`;
  else if (shape === 'map') body = `<path d="M4 7l8-2 8 2 8-2v20l-8 2-8-2-8 2z" fill="${hex}" stroke="${line}" stroke-width=".8"/><path d="M12 5v20M20 7v20" stroke="rgba(0,0,0,.25)" stroke-width=".8"/><path d="M8 12l3 3M11 12l-3 3" stroke="#b3121b" stroke-width="1.600" stroke-linecap="round"/><path d="M14 19c2-3 4 1 6-2s2-3 4-2" fill="none" stroke="#2d5abf" stroke-width="1.300" stroke-dasharray="2 1.500"/>`;
  else if (shape === 'pouch') body = `<path d="M9 11c-4 4-5 10-3 14 1 2 3 3 10 3s9-1 10-3c2-4 1-10-3-14z" fill="${hex}" stroke="${line}" stroke-width=".8"/><path d="M9 11c2-3 3-5 3-7h8c0 2 1 4 3 7z" fill="${left}" stroke="${line}" stroke-width=".8"/><path d="M10 11h12" stroke="#e2c27a" stroke-width="2" stroke-linecap="round"/>`;
  else if (shape === 'phone') body = `<rect x="10" y="6" width="12" height="22" rx="2" fill="${hex}" stroke="${line}" stroke-width=".8"/><rect x="12" y="9" width="8" height="9" fill="#bfeaff"/><path d="M13 22h6M13 25h6" stroke="#e2c27a" stroke-width="1.400" stroke-linecap="round"/><path d="M19 6V2" stroke="#2f2a26" stroke-width="1.600" stroke-linecap="round"/>`;
  else if (shape === 'gem') body = `<path d="M16 4l9 8-9 16-9-16z" fill="${hex}" stroke="${line}" stroke-width=".8"/><path d="M7 12h18M16 4l-4 8 4 16 4-16z" fill="none" stroke="rgba(0,0,0,.28)" stroke-width=".8"/><path d="M11 11l3-4" stroke="#fff" stroke-opacity=".85" stroke-width="1.400" stroke-linecap="round"/>`;
  else if (shape === 'ore') body = `<path d="M6 20l3-9 7-4 8 3 3 8-5 7H10z" fill="#77706a" stroke="${line}" stroke-width=".8"/><path d="M12 13l2.500-1.500L17 13l-2.500 1.500zM18 19l2-1.300 2 1.300-2 1.300zM10.500 19.500l1.500-1 1.500 1-1.500 1z" fill="${hex}" stroke="rgba(0,0,0,.3)" stroke-width=".5"/>`;
  else body = cube(4);
  if (extra === 'shine') body += '<path d="M9 13.500l5-2.700M8.500 16.500l2.500-1.300" stroke="#fff" stroke-opacity=".8" stroke-width="1.5" stroke-linecap="round"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${body}</svg>`;
}
const iconCache = new Map();
/** <img> markup for a kit block's icon; className is added to the image. */
export function kitIcon(id, className = 'ic') {
  let url = iconCache.get(id);
  if (!url) { const info = INFO[id]; if (!info || !info.icon) return ''; url = 'data:image/svg+xml,' + encodeURIComponent(svgIcon(info.icon)); iconCache.set(id, url); }
  return `<img class="${className} xi" src="${url}" alt="" draggable="false">`;
}

/** The bag's contents: [{ title, items: [{ id, key, name, n, kit: true }] }]. A slot holding one of these is a kit slot. */
export const KIT_GROUPS = Object.entries(GROUP_NAMES).map(([g, title]) => ({
  title, items: Object.values(INFO).filter((i) => i.group === g).map((i) => ({ id: i.id, key: i.key, name: i.name, n: 64, kit: true, ...(i.item || {}) })),
}));
export const isKit = (id) => id >= 100 && !!KIT_BLOCKS[id];
export const kitName = (id) => (INFO[id] ? INFO[id].name : '');
/** { model: 'sword' | 'axe' | 'pick', tier: colour } for a kit tool that has a model for the hand, else null. */
export const kitTool = (id) => (INFO[id] && INFO[id].item && INFO[id].item.model ? INFO[id].item : null);
/** A fresh item object for a kit id (as the bag hands it out), with its own count. */
export function kitItem(id, n) { const i = INFO[id]; if (!i) return null; const it = { id: i.id, key: i.key, name: i.name, n: 64, kit: true, ...(i.item || {}) }; if (n != null) it.n = n; return it; }

// ---------------------------------------------------------------------- behaviour in a running world
/**
 * scene: lights are added here. world / terrain: as given to createPlay (terrain.setBlock edits).
 * Returns the hooks the world wires into createPlay.
 */
export function createKit({ scene, world, terrain, lights = 2 }) {
  const glow = new Map();                          // "x,y,z" -> block id, for every placed block that gives light
  const pool = [];
  for (let i = 0; i < lights; i++) { const l = new THREE.PointLight(0xffffff, 0, 15, 1.8); l.visible = true; scene.add(l); pool.push(l); }   // always in the scene: the light count never changes after the first frame
  const flameB = flameTex(22);
  let since = 1, flick = 0, frame = 0;
  const key = (x, y, z) => x + ',' + y + ',' + z;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  // the light of a torch or a lamp carried in the hand (or in the other hand): one more real light, always in the scene
  const carry = new THREE.PointLight(0xffffff, 0, 13, 1.8);
  scene.add(carry);
  let play = null;
  // doors: the two cells hold door ids (closed ones are solid, open ones are not); the door itself is this model
  const doors = new Map();                         // key of the lower cell -> { group, x, y, z, open }
  const doorGeo = new THREE.BoxGeometry(1, 2, 0.13);
  { const c = new Float32Array(doorGeo.attributes.position.count * 3).fill(1); doorGeo.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
  function hang(x, y, z, yaw, open) {
    // the panel stands across the way the player faces, flush with the near side of the cell, hinged at one end
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), alongX = Math.abs(fx) <= Math.abs(fz);        // the panel runs along x when the player looks along z
    const group = new THREE.Group(), leaf = new THREE.Mesh(doorGeo, kitMaterial('x:door'));
    leaf.position.set(0.5, 1, 0); leaf.castShadow = false; leaf.receiveShadow = true;
    group.add(leaf);
    const near = alongX ? -Math.sign(fz || 1) : -Math.sign(fx || 1);                               // the side of the cell the player stands on
    if (alongX) { group.position.set(x, y, z + 0.5 + near * 0.43); group.userData.shut = 0; group.userData.swing = near > 0 ? Math.PI / 2 : -Math.PI / 2; }
    else { group.position.set(x + 0.5 + near * 0.43, y, z + 1); group.userData.shut = Math.PI / 2; group.userData.swing = near > 0 ? Math.PI / 2 : -Math.PI / 2; }
    group.rotation.y = group.userData.shut + (open ? group.userData.swing : 0);
    scene.add(group);
    doors.set(key(x, y, z), { group, x, y, z, open: !!open });
  }
  function unhang(k) { const d = doors.get(k); if (!d) return; scene.remove(d.group); doors.delete(k); }
  /** The lower cell of the door that (x, y, z) belongs to. */
  const doorBase = (x, y, z, id) => (KIT_BLOCKS[id].door === 2 ? y - 1 : y);
  function toggleDoor(x, y, z, id, remote) {
    const by = doorBase(x, y, z, id), d = doors.get(key(x, by, z)), open = !KIT_BLOCKS[id].open;
    if (!open && play) {      // never shut a door on the player standing in it
      const p = play.state.pos, hw = play.tuning.hw;
      if (x + 1 > p.x - hw && x < p.x + hw && z + 1 > p.z - hw && z < p.z + hw && by + 2 > p.y && by < p.y + play.tuning.height) return false;
    }
    terrain.setBlock(x, by, z, open ? K.DOOR_OPEN : K.DOOR);
    terrain.setBlock(x, by + 1, z, open ? K.DOOR_OPEN_TOP : K.DOOR_TOP);
    if (d) { d.open = open; d.group.rotation.y = d.group.userData.shut + (open ? d.group.userData.swing : 0); }
    if (play && play.sound && !remote) play.sound.place();
    if (!remote && api.onDoor) api.onDoor(x, by, z);
    return true;
  }
  // chests: what each one holds
  const chests = new Map();                        // key -> Array(27) of items
  const chestAt = (x, y, z) => { const k = key(x, y, z); let c = chests.get(k); if (!c) { c = new Array(27).fill(null); chests.set(k, c); } return c; };
  const api = {
    /** The controller, once it exists: the carried light and the doors ask it where the player is. */
    attach(p) { play = p; },
    scene, world, setBlock: (x, y, z, id) => terrain.setBlock(x, y, z, id),
    /** Open or shut the door at a cell because another player did (no sound of its own beyond the click). */
    remoteDoor(x, y, z) { const id = world.get(x, y, z); if (KIT_BLOCKS[id] && KIT_BLOCKS[id].door) toggleDoor(x, y, z, id, true); },
    onDoor: null,
    doors, chests, chestAt, carry,
    /** A block that gives light was put in the world by something other than the player (the cave's torches). */
    lit(x, y, z, id) { glow.set(key(x, y, z), id); since = 1; },
    /**
     * The place button on a block that does something. Returns null for any other block, 'door' when a door
     * was opened or shut, or { chest: Array(27) } / { table: true } for the bag to open.
     */
    interact(h) {
      const d = h && KIT_BLOCKS[h.id];
      if (!d) return null;
      if (d.door) { toggleDoor(h.x, h.y, h.z, h.id); return 'door'; }
      if (h.id === K.CHEST) return { chest: chestAt(h.x, h.y, h.z) };
      if (h.id === K.TABLE) return { table: true };
      if (d.mate) return { bed: true };
      return null;
    },
    /** Is a workbench within reach of the player? */
    tableNear(pos, r = 4) {
      const x0 = Math.floor(pos.x), y0 = Math.floor(pos.y), z0 = Math.floor(pos.z);
      for (let y = y0 - 2; y <= y0 + 3; y++) for (let z = z0 - r; z <= z0 + r; z++) for (let x = x0 - r; x <= x0 + r; x++) if (world.inb(x, y, z) && world.get(x, y, z) === K.TABLE) return true;
      return false;
    },
    heightOf: (id) => (KIT_BLOCKS[id] && KIT_BLOCKS[id].height) || 1,
    isLiquid: (id) => id === K.WATER,
    nameOf: kitName,
    hardness: (id) => (id === K.FIRE ? 0.05 : id === K.GOLD || id === K.DIAMOND ? 0.8 : KIT_BLOCKS[id] ? KIT_BLOCKS[id].hard || 0.35 : null),
    /** What breaking a kit block gives back (the foot of a bed counts as its head). */
    dropOf: (id) => { const d = KIT_BLOCKS[id]; return d ? (d.drop || (d.part ? d.mate : id)) : 0; },
    /** Call after the player placed block id at (x, y, z); yaw is the player's heading. */
    placed(x, y, z, id, yaw = 0) {
      const d = KIT_BLOCKS[id];
      if (!d) return;
      if (d.light) glow.set(key(x, y, z), id);
      if (id === K.DOOR) { terrain.setBlock(x, y + 1, z, K.DOOR_TOP); hang(x, y, z, yaw, false); }
      if (d.mate && !d.part) {
        // the bed is two cells long: lay the foot away from the player if that cell is free, else any free side
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw), ahead = Math.abs(fx) > Math.abs(fz) ? [Math.sign(fx), 0] : [0, Math.sign(fz)];
        for (const [dx, dz] of [ahead, ...DIRS]) {
          const nx = x + dx, nz = z + dz;
          if (world.inb(nx, y, nz) && world.get(nx, y, nz) === 0 && world.get(nx, y - 1, nz) !== 0) { terrain.setBlock(nx, y, nz, d.mate); break; }
        }
      }
      since = 1;
    },
    /** Call after the player broke the block described by h ({ x, y, z, id }). */
    broke(h) {
      const d = KIT_BLOCKS[h.id];
      if (!d) return;
      glow.delete(key(h.x, h.y, h.z));
      if (d.door) { const by = doorBase(h.x, h.y, h.z, h.id), oy = by === h.y ? by + 1 : by, o = world.get(h.x, oy, h.z); if (KIT_BLOCKS[o] && KIT_BLOCKS[o].door) terrain.setBlock(h.x, oy, h.z, 0); unhang(key(h.x, by, h.z)); }
      if (h.id === K.CHEST) {      // what was in it goes to the player, as far as there is room
        const k = key(h.x, h.y, h.z), c = chests.get(k);
        if (c && play) for (const it of c) if (it) play.give(it);
        chests.delete(k);
      }
      if (d.mate) for (const [dx, dz] of DIRS) if (world.get(h.x + dx, h.y, h.z + dz) === d.mate) { terrain.setBlock(h.x + dx, h.y, h.z + dz, 0); break; }
      since = 1;
    },
    /** Every frame: the nearest lamps and fires get the real lights; flames flicker. */
    update(pos, dt, time) {
      since += dt; flick += dt;
      // the carried light: a torch, a lamp or a flame in the other hand, or in the chosen square
      if (play) {
        const st = play.state, a = st.gear && st.gear.off, b = st.slots[st.sel];
        const src = (a && KIT_BLOCKS[a.id] && KIT_BLOCKS[a.id].light && a) || (b && KIT_BLOCKS[b.id] && KIT_BLOCKS[b.id].light && (b.n > 0) && b) || null;
        if (src) { const d = KIT_BLOCKS[src.id]; carry.color.set(d.light); carry.position.set(pos.x, pos.y + 1.5, pos.z); carry.intensity = d.flicker ? 13 * (0.86 + 0.14 * Math.sin(time * 15)) : 15; }
        else carry.intensity = 0;
      }
      if (fireMat && flick > 0.13) { flick = 0; frame ^= 1; fireMat.map = frame ? flameB : flameTex(21); }
      if (since < 0.3) { for (const l of pool) if (l.userData.flicker) l.intensity = l.userData.base * (0.82 + 0.18 * Math.sin(time * 17 + l.position.x)); return; }
      since = 0;
      for (const [k, d] of doors) { const id = world.get(d.x, d.y, d.z); if (id !== K.DOOR && id !== K.DOOR_OPEN) unhang(k); }       // a door whose cells were taken away some other way
      const near = [];
      for (const [k, id] of glow) {
        const [x, y, z] = k.split(',').map(Number);
        if (world.get(x, y, z) !== id) { glow.delete(k); continue; }       // gone without a word (a flame on a dug block, a block set into it)
        const d2 = (x + 0.5 - pos.x) ** 2 + (y + 0.5 - pos.y) ** 2 + (z + 0.5 - pos.z) ** 2; if (d2 < 30 * 30) near.push([d2, x, y, z, id]);
      }
      near.sort((a, b) => a[0] - b[0]);
      pool.forEach((l, i) => {
        const n = near[i];
        if (!n) { l.intensity = 0; l.userData.base = 0; l.userData.flicker = false; return; }
        const d = KIT_BLOCKS[n[4]];
        l.color.set(d.light); l.position.set(n[1] + 0.5, n[2] + 0.75, n[3] + 0.5);
        l.userData.base = d.flicker ? 16 : 22; l.userData.flicker = !!d.flicker; l.intensity = l.userData.base;
      });
    },
    lights: pool, glow,
  };
  return api;
}
