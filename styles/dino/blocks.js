// The own blocks of the world of the dinosaurs: hot jungle, fern plains, swamps, volcanic highlands and amber in
// the rock. Ids come from B in styles/barari/blocks.js (28 and up); they are defined only in this mode.
// lava: a hot glowing block (its own material, styles/dino/tiles.js) that burns whoever stands on it or in it
// (styles/barari/main.js), and is not dug. amber and the nest give themselves back.
export function dinoBlocks(B) {
  const BLOCKS = {
    [B.JUNGLE_GRASS]: { tiles: { top: 'jungleTop', side: 'jungleSide', bottom: 'dirt' } },
    [B.FERN_GRASS]: { tiles: { top: 'fernTop', side: 'fernSide', bottom: 'dirt' } },
    [B.MUD]: { tiles: { top: 'mudTop', side: 'mud', bottom: 'mud' } },
    [B.SWAMPWATER]: { tiles: 'swampWater', kind: 'liquid' },
    [B.BASALT]: { tiles: { top: 'basaltTop', side: 'basalt', bottom: 'basaltTop' } },
    [B.ASH]: { tiles: 'ash' },
    [B.LAVA]: { tiles: 'lava' },
    [B.RED_ROCK]: { tiles: { top: 'redRockTop', side: 'redRock', bottom: 'redRockTop' } },
    [B.JUNGLE_LOG]: { tiles: { top: 'jungleRing', side: 'jungleBark', bottom: 'jungleRing' } },
    [B.JUNGLE_LEAVES]: { tiles: 'jungleLeaves', kind: 'cutout' },
    [B.FERN_TRUNK]: { tiles: { top: 'fernRing', side: 'fernBark', bottom: 'fernRing' } },
    [B.FERN_FROND]: { tiles: 'fernFrond', kind: 'cutout' },
    [B.VINE]: { tiles: 'vine', kind: 'cross', height: 1 },
    [B.FERN]: { tiles: 'fern', kind: 'cross', height: 0.9 },
    [B.BIGLEAF]: { tiles: 'bigLeaf', kind: 'cross', height: 1 },
    [B.AMBER]: { tiles: 'amber' },
    [B.NEST]: { tiles: 'nest', kind: 'cross', height: 0.6 },
    [B.HORSETAIL]: { tiles: 'horsetail', kind: 'cross', height: 1.3 },
  };
  const NAMES = {
    [B.JUNGLE_GRASS]: 'أرض الغابة الحارة', [B.FERN_GRASS]: 'أرض السرخس', [B.MUD]: 'طين', [B.SWAMPWATER]: 'ماي المستنقع', [B.BASALT]: 'صخر بركاني',
    [B.ASH]: 'رماد', [B.LAVA]: 'حمم', [B.RED_ROCK]: 'صخر أحمر', [B.JUNGLE_LOG]: 'جذع شجرة الغابة', [B.JUNGLE_LEAVES]: 'ورق الغابة',
    [B.FERN_TRUNK]: 'جذع سرخس عملاق', [B.FERN_FROND]: 'سعف السرخس', [B.VINE]: 'لبلاب', [B.FERN]: 'سرخس', [B.BIGLEAF]: 'ورق عريض',
    [B.AMBER]: 'كهرمان', [B.NEST]: 'عش بيض', [B.HORSETAIL]: 'ذيل الحصان',
  };
  const DROP = {
    [B.JUNGLE_GRASS]: B.DIRT, [B.FERN_GRASS]: B.DIRT, [B.MUD]: B.MUD, [B.BASALT]: B.BASALT, [B.ASH]: B.ASH, [B.LAVA]: 0, [B.RED_ROCK]: B.RED_ROCK,
    [B.JUNGLE_LOG]: B.JUNGLE_LOG, [B.JUNGLE_LEAVES]: 0, [B.FERN_TRUNK]: B.FERN_TRUNK, [B.FERN_FROND]: 0, [B.AMBER]: B.AMBER, [B.NEST]: B.NEST,
  };
  return { BLOCKS, NAMES, DROP };
}
