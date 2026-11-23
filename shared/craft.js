// Crafting: a list of recipes. What a recipe needs is counted over everything the player carries (hotbar and
// backpack); making it takes the stuff away and gives the thing. The simple ones are made by hand, the rest
// need a workbench within a few steps.
//
// A need is [what, how many]: 'wood' | 'stone' | 'ore' are this world's own stuff (each world says which of
// its blocks count: mats = { wood: { ids, name }, ... }), a number is the id of a kit block.

import { K, kitItem, kitName } from './kit.js';

const GOLD = K.GOLD, DIAMOND = K.DIAMOND;
export const RECIPES = [
  { out: K.TABLE, n: 1, needs: [['wood', 4]] },
  { out: K.TORCH, n: 4, needs: [['wood', 2]] },
  { out: 212, n: 1, needs: [['wood', 1], ['stone', 2]] },            // stone sword
  { out: 214, n: 1, needs: [['wood', 2], ['stone', 3]] },            // stone axe
  { out: 216, n: 1, needs: [['wood', 2], ['stone', 3]] },            // stone pick
  { out: K.CHEST, n: 1, needs: [['wood', 6]], table: true },
  { out: K.DOOR, n: 1, needs: [['wood', 4]], table: true },
  { out: GOLD, n: 1, needs: [['ore', 6]], table: true },
  { out: DIAMOND, n: 1, needs: [[GOLD, 3]], table: true },
  { out: 213, n: 1, needs: [['wood', 1], [GOLD, 2]], table: true },   // gold sword
  { out: 210, n: 1, needs: [['wood', 1], [DIAMOND, 2]], table: true },
  { out: 215, n: 1, needs: [['wood', 2], [DIAMOND, 3]], table: true },
  { out: 217, n: 1, needs: [['wood', 2], [DIAMOND, 3]], table: true },
  { out: 240, n: 1, needs: [['wood', 2], [GOLD, 2]], table: true },                 // treasure detector
  { out: 242, n: 1, needs: [['wood', 4], [GOLD, 1]], table: true },                 // the magic map
  { out: 243, n: 1, needs: [['wood', 6], [K.MEAT, 2]], table: true },               // an extra pouch
  { out: 241, n: 1, needs: [[GOLD, 1], [K.GLASS, 1]], table: true },                // camera
  { out: 244, n: 1, needs: [[GOLD, 2], [K.GEM, 1]], table: true },                  // the trader's caller
  { out: 245, n: 1, needs: [[K.GEM, 2]], table: true },                             // the place crystal
  { out: 220, n: 1, also: [211, 222, 223], name: 'طقم لبس الألماس (4 قطع)', needs: [[K.GEM, 4]], table: true },     // four gems from the cave dress the player in diamond
  { out: DIAMOND, n: 1, needs: [[K.GEM, 2]], table: true },
  ...[[224, 220, 3], [225, 211, 5], [226, 222, 4], [227, 223, 2]].flatMap(([gold, dia, n]) => [
    { out: gold, n: 1, needs: [[GOLD, n]], table: true }, { out: dia, n: 1, needs: [[DIAMOND, n]], table: true },
  ]),
  { out: K.TORCH, n: 8, needs: [['wood', 1], [K.COAL, 1]] },           // coal from the cave burns longer: more torches from less wood
  { out: K.FURCOAT, n: 1, needs: [[K.FUR, 4]] },
  { out: 160, n: 1, needs: [[K.WOOL, 3], ['wood', 3]], table: true },           // a bed from wool off the sheep
  { out: K.FURCOAT, n: 1, needs: [[K.WOOL, 5]] },                       // four hides make a warm coat
  { out: K.GLASS, n: 4, needs: [[K.COAL, 1], ['ore', 2]], table: true },
  { out: K.ROD, n: 1, needs: [['wood', 3], [K.FEATHER, 1]] },                    // a rod: sticks and a feather for the float
  { out: K.ROD, n: 1, needs: [['wood', 4]] },
  { out: K.CAN, n: 1, needs: [['stone', 3]] },
  { out: K.BOAT, n: 1, needs: [['wood', 6]], table: true },
  { out: K.BREAD, n: 1, needs: [[K.WHEAT, 3]] },
  { out: K.EMERALD_BLOCK, n: 1, needs: [[K.EMERALD, 4]], table: true },
  { out: K.RUBY_BLOCK, n: 1, needs: [[K.RUBY, 4]], table: true },
  { out: K.AMETHYST_BLOCK, n: 1, needs: [[K.AMETHYST, 4]], table: true },
  { out: K.LUCKY, n: 1, needs: [[K.GOLD, 1], [K.EMERALD, 1]], table: true },          // a lucky box: gold and an emerald, and what it holds is luck
  // the furnace: built from stone; it smelts ore into iron and cooks food (fuel: coal or wood)
  { out: K.FURNACE, n: 1, needs: [['stone', 8]], table: true },
  { out: K.IRON, n: 1, needs: [['ore', 1], ['fuel', 1]], furnace: true },
  { out: K.STEAK, n: 1, needs: [[K.MEAT, 1], ['fuel', 1]], furnace: true },
  { out: K.BAKED_POTATO, n: 1, needs: [[K.POTATO, 1], ['fuel', 1]], furnace: true },
  { out: K.COOKED_FISH, n: 1, needs: [[[K.FISH, K.HAMOUR, K.SAFI, K.KANAD, K.SHERI], 1], ['fuel', 1]], furnace: true },
  // iron things
  { out: 261, n: 1, needs: [['wood', 1], [K.IRON, 2]], table: true },
  { out: 262, n: 1, needs: [['wood', 2], [K.IRON, 3]], table: true },
  { out: 263, n: 1, needs: [['wood', 2], [K.IRON, 3]], table: true },
  { out: 270, n: 1, needs: [[K.IRON, 5]], table: true }, { out: 271, n: 1, needs: [[K.IRON, 8]], table: true }, { out: 272, n: 1, needs: [[K.IRON, 7]], table: true }, { out: 273, n: 1, needs: [[K.IRON, 4]], table: true },
  // shovels and hoes
  { out: 264, n: 1, needs: [['wood', 2], ['stone', 1]] }, { out: 265, n: 1, needs: [['wood', 2], [K.IRON, 1]], table: true }, { out: 266, n: 1, needs: [['wood', 2], [K.DIAMOND, 1]], table: true },
  { out: 267, n: 1, needs: [['wood', 2], ['stone', 2]] }, { out: 268, n: 1, needs: [['wood', 2], [K.IRON, 2]], table: true }, { out: 269, n: 1, needs: [['wood', 2], [K.DIAMOND, 2]], table: true },
  // protection, food, and the other things
  { out: K.SHIELD, n: 1, needs: [['wood', 6], [K.IRON, 1]], table: true },
  { out: K.WINGS, n: 1, needs: [[K.FEATHER, 8], [K.AMETHYST, 2]], table: true },
  { out: K.GOLDEN_APPLE, n: 1, needs: [[K.APPLE, 1], [K.GOLD, 2]], table: true },
  { out: K.BUCKET, n: 1, needs: [[K.IRON, 3]], table: true },
  { out: K.SHEARS, n: 1, needs: [[K.IRON, 2]] },
  { out: K.LEAD, n: 1, needs: [[K.FUR, 2]] },
  { out: K.SADDLE, n: 1, needs: [[K.FUR, 4], [K.IRON, 1]], table: true },
  { out: K.COMPASS, n: 1, needs: [[K.IRON, 4], [K.COAL, 1]], table: true },
  { out: K.CLOCK, n: 1, needs: [[K.GOLD, 1], [K.COAL, 1]], table: true },
  { out: K.BOW, n: 1, needs: [['wood', 3], [K.FUR, 1]], table: true },
  { out: K.ARROW, n: 4, needs: [['wood', 1], [K.FEATHER, 1], ['stone', 1]] },
  { out: K.PEARL_JUMP, n: 2, needs: [[K.PEARL, 1], [K.AMETHYST, 1]], table: true },
  { out: K.FLINT, n: 1, needs: [[K.IRON, 1], ['stone', 1]] },
  { out: K.BOOK, n: 1, needs: [[K.FUR, 1], [K.WHEAT, 3]] },
  { out: K.NAME_TAG, n: 1, needs: [[K.FUR, 1], [K.IRON, 1]] },
  { out: K.SPYGLASS, n: 1, needs: [[K.GLASS, 1], [K.IRON, 2]], table: true },
];

export function createCraft({ play, kit, mats }) {
  const st = play.state;
  const idsOf = (what) => (typeof what === 'number' ? [what] : Array.isArray(what) ? what : what === 'fuel' ? [K.COAL, ...((mats.wood && mats.wood.ids) || [])] : [...((mats[what] && mats[what].ids) || []), ...(what === 'ore' ? [K.ORE] : [])]);
  const nameOf = (what) => (typeof what === 'number' ? kitName(what) : Array.isArray(what) ? kitName(what[0]) : what === 'fuel' ? 'فحم أو خشب' : (mats[what] && mats[what].name) || what);
  const piles = (ids) => [...st.pack, ...st.slots].filter((q) => q && !q.tool && ids.includes(q.id) && q.n > 0);
  const count = (what) => piles(idsOf(what)).reduce((s, q) => s + q.n, 0);
  const tableNear = () => !!(kit && kit.tableNear && kit.tableNear(st.pos));
  /** A furnace within four blocks. */
  const furnaceNear = () => { const w = kit && kit.world; if (!w) return false; const X = Math.floor(st.pos.x), Y = Math.floor(st.pos.y), Z = Math.floor(st.pos.z); for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) for (let dy = -2; dy <= 2; dy++) if (w.get(X + dx, Y + dy, Z + dz) === K.FURNACE) return true; return false; };
  function take(what, n) { for (const q of piles(idsOf(what))) { const k = Math.min(q.n, n); q.n -= k; n -= k; if (!n) break; } for (let i = 0; i < st.pack.length; i++) if (st.pack[i] && !st.pack[i].tool && !(st.pack[i].n > 0)) st.pack[i] = null; }
  return {
    tableNear, furnaceNear, count, mats, idsOf, take, nameOf,
    /** Every recipe with what it needs, what is at hand, and whether it can be made now. */
    list() {
      const near = tableNear(), fire = furnaceNear();
      return RECIPES.map((r) => {
        const needs = r.needs.map(([what, n]) => ({ what, n, name: nameOf(what), have: count(what) }));
        const item = kitItem(r.out, r.n); if (r.name) item.name = r.name;
        return { out: r.out, n: r.n, table: !!r.table, furnace: !!r.furnace, item, needs, can: needs.every((q) => q.have >= q.n) && (!r.table || near) && (!r.furnace || fire) };
      });
    },
    /** Make recipe i. Returns true, or the reason it cannot be made (Arabic, for the player). */
    make(i) {
      const r = RECIPES[i];
      if (!r) return 'ما في وصفة.';
      if (r.table && !tableNear()) return 'هذي تبي طاولة تصنيع قريبة منك.';
      if (r.furnace && !furnaceNear()) return 'هذي تنطبخ في فرن: حط فرن قريب منك.';
      for (const [what, n] of r.needs) if (count(what) < n) return 'ناقصك ' + nameOf(what) + '.';
      for (const [what, n] of r.needs) take(what, n);
      const item = kitItem(r.out, r.n);
      if (!play.give(item)) { play.notice('حقيبتك مليانة.', false, 2600); }
      for (const id of r.also || []) { if (!play.give(kitItem(id, 1))) play.notice('حقيبتك مليانة.', false, 2600); st.made[id] = (st.made[id] || 0) + 1; }
      st.crafted++; st.made[r.out] = (st.made[r.out] || 0) + r.n;
      if (play.sound) (play.sound.level || play.sound.ui)();
      play.changed();
      return true;
    },
  };
}
