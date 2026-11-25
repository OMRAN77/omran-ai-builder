// Block ids and definitions for "barari" (desert, forest, snow and the sea). Own ids stay below 100;
// 100 and up belong to the shared building kit. The world of the dinosaurs (mode 'dino') adds its own from 28 up.
import { DINO } from './mode.js';

export const B = {
  GRASS: 1, DIRT: 2, SAND: 3, SANDSTONE: 4, STONE: 5, DEEPROCK: 6, SNOW: 7, SNOWBLOCK: 8, ICE: 9, WATER: 10,
  SEABED: 11, GRAVEL: 12, OAK: 13, OAK_LEAVES: 14, PINE: 15, PINE_NEEDLES: 16, PINE_SNOWY: 17, PALM: 18,
  PALM_FROND: 19, PLANKS: 20, TUFT: 21, FLOWER_R: 22, FLOWER_Y: 23, FLOWER_B: 24, SHRUB: 25, REED: 26, SNOWROCK: 27,
  // the world of the dinosaurs (defined only in that mode: styles/dino/blocks.js)
  JUNGLE_GRASS: 28, FERN_GRASS: 29, MUD: 30, SWAMPWATER: 31, BASALT: 32, ASH: 33, LAVA: 34, RED_ROCK: 35, JUNGLE_LOG: 36,
  JUNGLE_LEAVES: 37, FERN_TRUNK: 38, FERN_FROND: 39, VINE: 40, FERN: 41, BIGLEAF: 42, AMBER: 43, NEST: 44, HORSETAIL: 45,
  // barari's wonders (ideas.js): the lighthouse and its tide stone, the sunken houses, the cloud islands and their vents, the totem
  LH_WHITE: 46, LH_RED: 47, TIDE_STONE: 48, CORAL_BRICK: 49, CLOUD: 50, SKY_FLOWER: 51, SKY_BERRY: 52, VENT: 53, TOTEM: 54, TOTEM_TOP: 55,
  // the dinosaur world's wonders (styles/dino/ideas.js): the resonance towers, the warm nests and their eggs, amber bridges, fossils
  RESO_STONE: 60, RESO_CARVED: 61, RESO_CRYSTAL: 62, RESO_BELL: 63, WARM_NEST: 64, EGG_NEST: 65, /* 65..68: an egg of each colour in a warm nest */
  AMBER_PATH: 69, FOSSIL: 70,
};
/** Things carried that are not blocks (no definition, so they are never placed): eggs of four colours, resin, the balloon. */
export const ITEM = { EGG: 90, /* 90..93 */ RESIN: 94, BALLOON: 95 };

export const BLOCKS = {
  [B.GRASS]: { tiles: { top: 'grassTop', side: 'grassSide', bottom: 'dirt' } },
  [B.DIRT]: { tiles: 'dirt' },
  [B.SAND]: { tiles: 'sand' },
  [B.SANDSTONE]: { tiles: { top: 'sandstoneTop', side: 'sandstone', bottom: 'sandstoneTop' } },
  [B.STONE]: { tiles: 'stone' },
  [B.DEEPROCK]: { tiles: 'deeprock' },
  [B.SNOW]: { tiles: { top: 'snowTop', side: 'snowSide', bottom: 'dirt' } },
  [B.SNOWBLOCK]: { tiles: 'snowTop' },
  [B.ICE]: { tiles: 'ice', kind: 'translucent' },
  [B.WATER]: { tiles: 'water', kind: 'liquid' },
  [B.SEABED]: { tiles: 'seabed' },
  [B.GRAVEL]: { tiles: 'gravel' },
  [B.OAK]: { tiles: { top: 'oakRing', side: 'oakBark', bottom: 'oakRing' } },
  [B.OAK_LEAVES]: { tiles: 'oakLeaves', kind: 'cutout' },
  [B.PINE]: { tiles: { top: 'pineRing', side: 'pineBark', bottom: 'pineRing' } },
  [B.PINE_NEEDLES]: { tiles: 'pineNeedles', kind: 'cutout' },
  [B.PINE_SNOWY]: { tiles: { top: 'pineSnowTop', side: 'pineSnowSide', bottom: 'pineNeedles' }, kind: 'cutout' },
  [B.PALM]: { tiles: { top: 'palmRing', side: 'palmBark', bottom: 'palmRing' } },
  [B.PALM_FROND]: { tiles: 'palmFrond', kind: 'cutout' },
  [B.PLANKS]: { tiles: 'planks' },
  [B.TUFT]: { tiles: 'tuft', kind: 'cross', height: 0.8 },
  [B.FLOWER_R]: { tiles: 'flowerR', kind: 'cross', height: 0.75 },
  [B.FLOWER_Y]: { tiles: 'flowerY', kind: 'cross', height: 0.7 },
  [B.FLOWER_B]: { tiles: 'flowerB', kind: 'cross', height: 0.72 },
  [B.SHRUB]: { tiles: 'shrub', kind: 'cross', height: 0.85 },
  [B.REED]: { tiles: 'reed', kind: 'cross', height: 1.5 },
  [B.SNOWROCK]: { tiles: { top: 'snowTop', side: 'snowRockSide', bottom: 'stone' } },
};

/** Player-visible names (short Gulf Arabic). */
export const NAMES = {
  [B.GRASS]: 'عشب', [B.DIRT]: 'تراب', [B.SAND]: 'رمل', [B.SANDSTONE]: 'حجر رملي', [B.STONE]: 'صخر', [B.DEEPROCK]: 'صخر غامق',
  [B.SNOW]: 'أرض عليها ثلج', [B.SNOWBLOCK]: 'ثلج', [B.ICE]: 'جليد', [B.WATER]: 'ماي', [B.SEABED]: 'رمل البحر', [B.GRAVEL]: 'حصى',
  [B.OAK]: 'جذع شجرة', [B.OAK_LEAVES]: 'ورق شجر', [B.PINE]: 'جذع صنوبر', [B.PINE_NEEDLES]: 'إبر صنوبر', [B.PINE_SNOWY]: 'صنوبر عليه ثلج',
  [B.PALM]: 'جذع نخلة', [B.PALM_FROND]: 'سعف', [B.PLANKS]: 'ألواح خشب', [B.TUFT]: 'حشيش', [B.FLOWER_R]: 'وردة حمرا', [B.FLOWER_Y]: 'وردة صفرا',
  [B.FLOWER_B]: 'وردة زرقا', [B.SHRUB]: 'شجيرة يابسة', [B.REED]: 'قصب', [B.SNOWROCK]: 'صخر عليه ثلج',
};

/** What digging a block gives back (0: nothing). */
export const DROP = {
  [B.GRASS]: B.DIRT, [B.DIRT]: B.DIRT, [B.SAND]: B.SAND, [B.SANDSTONE]: B.SANDSTONE, [B.STONE]: B.STONE, [B.DEEPROCK]: B.STONE, [B.SNOWROCK]: B.STONE,
  [B.SNOW]: B.DIRT, [B.SNOWBLOCK]: B.SNOWBLOCK, [B.ICE]: B.ICE, [B.SEABED]: B.SAND, [B.GRAVEL]: B.GRAVEL,
  [B.OAK]: B.OAK, [B.PINE]: B.PINE, [B.PALM]: B.PALM, [B.PLANKS]: B.PLANKS,
  [B.OAK_LEAVES]: 0, [B.PINE_NEEDLES]: 0, [B.PINE_SNOWY]: 0, [B.PALM_FROND]: 0,
};

if (!DINO) {
  Object.assign(BLOCKS, {
    [B.LH_WHITE]: { tiles: 'lhWhite' }, [B.LH_RED]: { tiles: 'lhRed' }, [B.TIDE_STONE]: { tiles: { top: 'tideStone', side: 'tideStone', bottom: 'stone' } },
    [B.CORAL_BRICK]: { tiles: 'coralBrick' }, [B.CLOUD]: { tiles: 'cloud' }, [B.VENT]: { tiles: { top: 'vent', side: 'stone', bottom: 'stone' } },
    [B.SKY_FLOWER]: { tiles: 'skyFlower', kind: 'cross', height: 0.8 }, [B.SKY_BERRY]: { tiles: 'skyBerry', kind: 'cross', height: 0.85 },
    [B.TOTEM]: { tiles: { top: 'totemCap', side: 'totemFace', bottom: 'totemCap' } }, [B.TOTEM_TOP]: { tiles: { top: 'totemCap', side: 'totemHead', bottom: 'totemCap' } },
  });
  Object.assign(NAMES, {
    [B.LH_WHITE]: 'حجر المنارة الأبيض', [B.LH_RED]: 'حجر المنارة الأحمر', [B.TIDE_STONE]: 'حجر المد', [B.CORAL_BRICK]: 'طابوق مرجاني', [B.CLOUD]: 'غيمة',
    [B.SKY_FLOWER]: 'زهرة السحاب', [B.SKY_BERRY]: 'توت السما', [B.VENT]: 'فتحة الهوا الدافي', [B.TOTEM]: 'جذع طوطم', [B.TOTEM_TOP]: 'طوطم خشبي',
  });
  Object.assign(DROP, { [B.LH_WHITE]: B.LH_WHITE, [B.LH_RED]: B.LH_RED, [B.TIDE_STONE]: 0, [B.CORAL_BRICK]: B.CORAL_BRICK, [B.CLOUD]: B.CLOUD, [B.VENT]: 0, [B.TOTEM]: B.OAK, [B.TOTEM_TOP]: B.OAK });
}
if (DINO) {
  const d = (await import('../dino/blocks.js')).dinoBlocks(B);
  Object.assign(BLOCKS, d.BLOCKS); Object.assign(NAMES, d.NAMES); Object.assign(DROP, d.DROP);
}

/** How long a block takes to dig (the kit answers for its own blocks first). */
export function hardnessOf(id, kind) {
  if (kind === 'cross') return 0.08;
  if (id >= B.LH_WHITE && id <= B.TOTEM_TOP) return id === B.CLOUD ? 0.25 : id === B.TOTEM || id === B.TOTEM_TOP ? 0.5 : 0.8;      // barari's wonders
  if (id >= B.RESO_STONE && id <= B.FOSSIL) return id === B.AMBER_PATH || id === B.FOSSIL ? 0.9 : 1.2;
  if (id >= B.JUNGLE_GRASS && id < 100) {                                  // the dinosaur world's own
    if (id === B.JUNGLE_LEAVES || id === B.FERN_FROND) return 0.15;
    if (id === B.MUD || id === B.ASH || id === B.JUNGLE_GRASS || id === B.FERN_GRASS) return 0.3;
    if (id === B.JUNGLE_LOG || id === B.FERN_TRUNK) return 0.5;
    if (id === B.BASALT || id === B.AMBER) return 0.95;
    return 0.7;
  }
  if (id === B.OAK_LEAVES || id === B.PINE_NEEDLES || id === B.PINE_SNOWY || id === B.PALM_FROND) return 0.15;
  if (id === B.SAND || id === B.DIRT || id === B.GRASS || id === B.SNOW || id === B.SNOWBLOCK || id === B.SEABED || id === B.GRAVEL) return 0.3;
  if (id === B.ICE) return 0.35;
  if (id === B.OAK || id === B.PINE || id === B.PALM || id === B.PLANKS) return 0.5;
  if (id === B.DEEPROCK) return 0.9;
  return 0.7;
}
