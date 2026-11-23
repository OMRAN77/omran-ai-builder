// What makes the endless engine of "barari" the world of the dinosaurs, beside its ground (gen.js), blocks and
// tiles: the warm hazy times of day, the words on the screen, what the bag holds, and what counts as wood and stone.
// styles/barari/main.js reads this in mode 'dino'.
export { createSmoke } from './smoke.js';

export const KEY = 'dino';
export const TITLE = 'عالم الديناصورات';
export const TAGLINE = 'غابة حارة وسهول سرخس ومستنقعات وبراكين وبحر فيه جزر، ما لها آخر. ديناصورات تاكل العشب، وصيّادين بالليل والنهار. اقطع الشجر وابنِ بيتك.';
export const NOTE = 'نسخة تجريبية: الوقت والمطر والوحوش تختارها من لوحة Q (وعلى الجوال من زر داخل الحقيبة). أكّل العملاق أبو رقبة حبوب ويصير ربعك، وابعد عن الحمم.';
/** The lands as this world names them on the screen (gen.zoneOf). */
export const ZONES = { jungle: 'الغابة الحارة', ferns: 'سهل السرخس', swamp: 'المستنقع', ash: 'أرض الرماد', black: 'الأرض السودا', volcano: 'البركان', beach: 'السيف', island: 'جزيرة', sea: 'البحر' };

/** Warm, hazy days; a sunset of fire; a night with a red glow low on the horizon. */
export function moods(dirFrom) {
  return {
    morning: {
      top: '#4d8fc8', horizon: '#f0dcb4', below: '#d8c8a4', sunCol: '#fff0c4', sunDir: dirFrom(118, 34), sunSize: 0.05, cloud: 0.42, stars: 0, haze: 1.8,
      cloudCol: '#fff6e8', cloudShade: '#c9b9a4', fog: '#e2d4b4', fogNear: 100, fogFar: 1050,
      hemiSky: '#ffeccc', hemiGround: '#6a5a3a', hemi: 1.5, sun: '#ffe8c0', sunI: 2.8, light: dirFrom(118, 40), exposure: 1.0, rainDim: 0.46,
    },
    sunset: {
      top: '#46549a', horizon: '#ff9a5a', below: '#b8705a', sunCol: '#ff8a4a', sunDir: dirFrom(262, 5), sunSize: 0.07, cloud: 0.55, stars: 0.05, haze: 2.6,
      cloudCol: '#ffc49a', cloudShade: '#8a5a72', fog: '#e09a76', fogNear: 70, fogFar: 820,
      hemiSky: '#ffc8a0', hemiGround: '#5a4040', hemi: 1.05, sun: '#ffa26a', sunI: 2.1, light: dirFrom(262, 14), exposure: 1.0, rainDim: 0.5,
    },
    night: {
      top: '#0c1228', horizon: '#3a2a40', below: '#140e1a', sunCol: '#8a6a9a', sunDir: dirFrom(262, -30), sunSize: 0.04, cloud: 0.3, stars: 1, haze: 0,
      cloudCol: '#3a3450', cloudShade: '#1c1828', fog: '#1c1826', fogNear: 25, fogFar: 170,
      hemiSky: '#6a6aa8', hemiGround: '#24181c', hemi: 0.6, sun: '#b0a8e8', sunI: 0.55, light: dirFrom(200, 42), exposure: 1.0,
    },
  };
}

/** The own blocks the bag offers. */
export const catalogue = (B) => [B.JUNGLE_LOG, B.FERN_TRUNK, B.PLANKS, B.JUNGLE_LEAVES, B.FERN_FROND, B.JUNGLE_GRASS, B.FERN_GRASS, B.DIRT, B.MUD, B.SAND, B.SANDSTONE,
  B.STONE, B.DEEPROCK, B.GRAVEL, B.BASALT, B.ASH, B.RED_ROCK, B.AMBER, B.NEST, B.FERN, B.BIGLEAF, B.VINE, B.HORSETAIL, B.REED, B.TUFT];
/** What the workbench counts as wood and as stone. */
export const mats = (B) => ({ wood: { ids: [B.JUNGLE_LOG, B.FERN_TRUNK, B.PLANKS], name: 'خشب' }, stone: { ids: [B.STONE, B.SANDSTONE, B.DEEPROCK, B.BASALT, B.RED_ROCK], name: 'صخر' }, ore: { ids: [], name: 'خام معدن' } });
