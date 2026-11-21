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
  ...[[224, 220, 3], [225, 211, 5], [226, 222, 4], [227, 223, 2]].flatMap(([gold, dia, n]) => [
    { out: gold, n: 1, needs: [[GOLD, n]], table: true }, { out: dia, n: 1, needs: [[DIAMOND, n]], table: true },
  ]),
];

export function createCraft({ play, kit, mats }) {
  const st = play.state;
  const idsOf = (what) => (typeof what === 'number' ? [what] : [...((mats[what] && mats[what].ids) || []), ...(what === 'ore' ? [K.ORE] : [])]);
  const nameOf = (what) => (typeof what === 'number' ? kitName(what) : (mats[what] && mats[what].name) || what);
  const piles = (ids) => [...st.pack, ...st.slots].filter((q) => q && !q.tool && ids.includes(q.id) && q.n > 0);
  const count = (what) => piles(idsOf(what)).reduce((s, q) => s + q.n, 0);
  const tableNear = () => !!(kit && kit.tableNear && kit.tableNear(st.pos));
  function take(what, n) { for (const q of piles(idsOf(what))) { const k = Math.min(q.n, n); q.n -= k; n -= k; if (!n) break; } for (let i = 0; i < st.pack.length; i++) if (st.pack[i] && !st.pack[i].tool && !(st.pack[i].n > 0)) st.pack[i] = null; }
  return {
    tableNear, count, mats, idsOf,
    /** Every recipe with what it needs, what is at hand, and whether it can be made now. */
    list() {
      const near = tableNear();
      return RECIPES.map((r) => {
        const needs = r.needs.map(([what, n]) => ({ what, n, name: nameOf(what), have: count(what) }));
        return { out: r.out, n: r.n, table: !!r.table, item: kitItem(r.out, r.n), needs, can: needs.every((q) => q.have >= q.n) && (!r.table || near) };
      });
    },
    /** Make recipe i. Returns true, or the reason it cannot be made (Arabic, for the player). */
    make(i) {
      const r = RECIPES[i];
      if (!r) return 'ما في وصفة.';
      if (r.table && !tableNear()) return 'هذي تبي طاولة تصنيع قريبة منك.';
      for (const [what, n] of r.needs) if (count(what) < n) return 'ناقصك ' + nameOf(what) + '.';
      for (const [what, n] of r.needs) take(what, n);
      const item = kitItem(r.out, r.n);
      if (!play.give(item)) { play.notice('حقيبتك مليانة.', false, 2600); }
      st.crafted++;
      if (play.sound) (play.sound.level || play.sound.ui)();
      play.changed();
      return true;
    },
  };
}
