// v-trend-backdrops (طلب المالك ٣٠ سبتمبر: «إذا اختار مثلًا شخصيّة تغنّي في التراث فقط شكل واحد، ما فيه
// عدّة خلفيّات… كلّ مرّة أسوّي فيديو تكون الخلفيّة ثانية، على الأقلّ بين ١٠٠ خلفيّة»): مكتبتا خلفيّات
// (تراثيّة وعامّة) مركّبتان من مكان × جوّ، فكلّ فيديو يأخذ خلفيّة غير السابقة. بيانات صرف.
'use strict';
const cross = (A, B) => { const out = []; for (const a of A) for (const b of B) out.push(a + ', ' + b); return out; };

const HERITAGE_PLACES = [
  'an old Arabian souq with lanterns and hanging fabrics', 'the courtyard of a mud-brick heritage fort', 'a wooden dhow harbour at the creek',
  'a Bedouin desert camp with a campfire and carpets', 'a traditional majlis with cushions and a coffee dallah', 'a date-palm oasis with a falaj water channel',
  'a pearl-diving beach with old dhows pulled up on the sand', 'a wind-tower (barjeel) alley in an old quarter', 'a heritage village square with palm-frond huts',
  'a camel race track in the desert', 'a falconry field at the edge of the dunes', 'a spice market with sacks of colourful spices',
  'a gold souq with glittering shop windows', 'an old coral-stone house courtyard with a carved wooden door', 'a mountain village terrace like Misfat al Abriyeen',
  'the gates of an old walled city', 'a traditional wedding tent decorated with lights', 'a heritage festival stage with drummers',
  'a henna-night courtyard with green and gold decorations', 'a sand-dune ridge at the edge of the Empty Quarter', 'a fishing village jetty with nets drying',
  'a carpet-weaving workshop with looms', 'an old mosque courtyard with arches', 'a date-harvest farm with baskets of dates', 'a museum hall of Gulf heritage artefacts',
];
const HERITAGE_MOODS = ['in warm golden-hour light', 'at blue hour with glowing lanterns', 'at night under strings of festive lights', 'in soft morning haze'];

const GENERAL_PLACES = [
  'a neon-lit city street at night', 'a rooftop terrace overlooking a skyline', 'a sunny beach promenade', 'a lush botanical garden', 'a modern glass atrium',
  'a snowy mountain village', 'a cosy café with warm lamps', 'a luxury hotel lobby with marble floors', 'a desert highway with dunes', 'a colourful graffiti alley',
  'a grand library with tall shelves', 'a futuristic sci-fi corridor', 'an open field of wildflowers', 'a harbour with yachts', 'a stadium under floodlights',
  'a waterfall in a green canyon', 'a busy night market with food stalls', 'a minimalist white studio with coloured lights', 'a palace hall with chandeliers', 'a forest path with sun rays',
  'a lakeside pier at dusk', 'a rain-soaked boulevard with reflections', 'a theatre stage with velvet curtains', 'a mountain summit above the clouds', 'a vintage train station',
];
const GENERAL_MOODS = ['in bright daylight', 'at golden-hour sunset', 'at night with glowing lights', 'with soft cinematic haze'];

const POOLS = { heritage: cross(HERITAGE_PLACES, HERITAGE_MOODS), general: cross(GENERAL_PLACES, GENERAL_MOODS) };

/* الترندات التي مكانها مرن (شخص يؤدّي شيئًا) — والمكان جزء جوهر غيرها (منتج، عقار، صورة قديمة…) فلا يُمسّ */
const TREND_POOL = {
  heritagesing: 'heritage', eidgreeting: 'heritage', ramadan: 'heritage', nationalday: 'heritage', wedding: 'heritage',
  dance: 'general', actionhero: 'general', catwalk: 'general', superhero: 'general', birthdaybash: 'general', graduation: 'general',
  testimonial: 'general', podcastclip: 'general', timecapsule: 'general', hugyounger: 'general', neonnight: 'general', talkingpet: 'general',
};
const MIX = 7919; /* الأطوال ١٠٠ = ٢²×٥² — ٧٩١٩ أوّليّ نسبيّ معها: المتتاليان متباعدان والدورة كاملة */

function backdropFor(trendKey, n) {
  const pool = POOLS[TREND_POOL[trendKey]];
  if (!pool) return null;
  const k = Math.abs(Math.floor(Number(n) || 0));
  return pool[(k * MIX) % pool.length];
}
module.exports = { POOLS, TREND_POOL, backdropFor };
