// Block ids and definitions for "barari" (desert, forest, snow and the sea). Own ids stay below 100;
// 100 and up belong to the shared building kit.
export const B = {
  GRASS: 1, DIRT: 2, SAND: 3, SANDSTONE: 4, STONE: 5, DEEPROCK: 6, SNOW: 7, SNOWBLOCK: 8, ICE: 9, WATER: 10,
  SEABED: 11, GRAVEL: 12, OAK: 13, OAK_LEAVES: 14, PINE: 15, PINE_NEEDLES: 16, PINE_SNOWY: 17, PALM: 18,
  PALM_FROND: 19, PLANKS: 20, TUFT: 21, FLOWER_R: 22, FLOWER_Y: 23, FLOWER_B: 24, SHRUB: 25, REED: 26, SNOWROCK: 27,
};

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

/** How long a block takes to dig (the kit answers for its own blocks first). */
export function hardnessOf(id, kind) {
  if (kind === 'cross') return 0.08;
  if (id === B.OAK_LEAVES || id === B.PINE_NEEDLES || id === B.PINE_SNOWY || id === B.PALM_FROND) return 0.15;
  if (id === B.SAND || id === B.DIRT || id === B.GRASS || id === B.SNOW || id === B.SNOWBLOCK || id === B.SEABED || id === B.GRAVEL) return 0.3;
  if (id === B.ICE) return 0.35;
  if (id === B.OAK || id === B.PINE || id === B.PALM || id === B.PLANKS) return 0.5;
  if (id === B.DEEPROCK) return 0.9;
  return 0.7;
}
