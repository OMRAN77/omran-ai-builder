// scripts/inspire/fixture.mjs — مدينة اختبار بصيغة Overpass JSON نفسها (out geom)، حتميّة، حول أيّ إحداثيّة.
// بيئة الإصلاح محجوبة عن خدمات الخرائط، فالتجارب تُختبر على هذه البيانات: شبكة طرق بأنواعها، أبراج ومبانٍ متوسّطة وفلل،
// قناة مائيّة (مارينا) وحديقة — بالحقول التي يقرؤها core.js (height / building:levels / highway / natural / leisure).
export function makeFixture(lat0, lon0, radius = 600) {
  let seed = 1234567;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const mPerLat = 110540, mPerLon = Math.cos(lat0 * Math.PI / 180) * 111320;
  const ll = (x, z) => ({ lat: +(lat0 - z / mPerLat).toFixed(7), lon: +(lon0 + x / mPerLon).toFixed(7) });
  const els = []; let id = 1000;
  const way = (tags, pts) => els.push({ type: 'way', id: id++, tags, geometry: pts.map(([x, z]) => ll(x, z)) });
  const R = radius;
  // طرق: شبكة كتل ١٢٠م، رئيسيّ كلّ ثالث، وممشى على القناة
  for (let g = -R; g <= R; g += 120) {
    const kind = (Math.round(g / 120) % 3 === 0) ? 'primary' : (Math.round(g / 120) % 3 === 1 ? 'secondary' : 'residential');
    way({ highway: kind, name: 'شارع ' + (Math.round(g / 120) + 10) }, [[-R, g], [R, g]]);
    way({ highway: kind === 'primary' ? 'trunk' : 'tertiary' }, [[g, -R], [g, R]]);
  }
  way({ highway: 'motorway', name: 'الطريق السريع' }, [[-R, R * 0.92], [R, R * 0.85]]);
  way({ highway: 'footway' }, [[-R * 0.9, -40], [R * 0.9, -40]]);
  // قناة مائيّة وحديقة
  way({ natural: 'water' }, [[-R, -95], [R, -95], [R, -55], [-R, -55], [-R, -95]]);
  way({ leisure: 'park', name: 'حديقة الحيّ' }, [[250, 20], [370, 20], [370, 110], [250, 110], [250, 20]]);
  // مبانٍ داخل كلّ كتلة
  for (let bx = -R; bx < R; bx += 120) for (let bz = -R; bz < R; bz += 120) {
    if (bz <= -55 && bz + 120 >= -95) continue; // القناة
    if (bx >= 240 && bx <= 360 && bz >= 0 && bz <= 120) continue; // الحديقة
    const d = Math.hypot(bx + 60, bz + 60);
    const n = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const w = 18 + rnd() * 30, dpt = 18 + rnd() * 30;
      const x = bx + 12 + rnd() * (120 - 24 - w), z = bz + 12 + rnd() * (120 - 24 - dpt);
      const tall = d < 300 && rnd() < 0.45;
      const villa = d > 450 && rnd() < 0.6;
      const tags = { building: villa ? 'house' : (tall ? 'apartments' : 'commercial') };
      if (tall) tags.height = String(Math.round(80 + rnd() * 170));
      else if (!villa) tags['building:levels'] = String(3 + Math.floor(rnd() * 8));
      if (rnd() < 0.08) tags.name = 'برج ' + (id % 97);
      way(tags, [[x, z], [x + w, z], [x + w, z + dpt], [x, z + dpt], [x, z]]);
    }
  }
  return { version: 0.6, generator: 'omran-fixture', elements: els };
}
