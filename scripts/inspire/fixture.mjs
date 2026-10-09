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
  // ما يأتي من الخرائط الحقيقيّة ولا تمثّله الشبكة (يُلحق بعد المباني فلا يغيّر المدينة السابقة):
  // وصلة طريق سريع (*_link)، ومبنى بفناء علاقةً multipolygon (قطعتان خارجيّتان + حلقة داخليّة) خارج الشبكة،
  // وخطّ ساحل باتّجاه الشرق قرب الحافّة الجنوبيّة (الماء يمينه = جنوبًا) من قطعتين.
  way({ highway: 'motorway_link' }, [[R * 0.5, R * 0.86], [R * 0.5, R * 0.72]]);
  const rel = (tags, members) => els.push({ type: 'relation', id: id++, tags, members: members.map(([role, pts]) => ({ type: 'way', ref: id++, role, geometry: pts.map(([x, z]) => ll(x, z)) })) });
  const X0 = R + 40, X1 = R + 160, Z0 = -60, Z1 = 60;
  rel({ type: 'multipolygon', building: 'retail', name: 'المجمّع', 'building:levels': '4' }, [
    ['outer', [[X0, Z0], [X1, Z0], [X1, Z1]]], ['outer', [[X0, Z0], [X0, Z1], [X1, Z1]]],
    ['inner', [[X0 + 30, Z0 + 30], [X1 - 30, Z0 + 30], [X1 - 30, Z1 - 30], [X0 + 30, Z1 - 30], [X0 + 30, Z0 + 30]]],
  ]);
  way({ natural: 'coastline' }, [[-R * 1.5, R * 0.97], [0, R * 0.97]]);
  way({ natural: 'coastline' }, [[0, R * 0.97], [R * 1.5, R * 0.97]]);
  return { version: 0.6, generator: 'omran-fixture', elements: els };
}

// بلاطة «جوّيّة» اصطناعيّة (٢٥٦×٢٥٦ PNG) لاختبار الصور الجوّيّة بلا شبكة: أرض رمليّة بكتل داكنة وأشرطة فاتحة، وحدّ أحمر رفيع حول البلاطة
// ليُرى مكان كلّ بلاطة وتوافقها (اتّجاه الشمال/الشرق) في اللقطة. الألوان تعتمد على (x,y) فتتميّز الجارات.
export function makeTilePng(PNG, z, x, y) {
  const png = new PNG({ width: 256, height: 256 });
  let a = ((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) >>> 0;
  const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const base = [196 + ((x * 7) % 24), 174 + ((y * 5) % 20), 138 + (((x + y) * 3) % 16)];
  const set = (px, py, c) => { if (px < 0 || py < 0 || px > 255 || py > 255) return; const i = (py * 256 + px) * 4; png.data[i] = c[0]; png.data[i + 1] = c[1]; png.data[i + 2] = c[2]; png.data[i + 3] = 255; };
  for (let py = 0; py < 256; py++) for (let px = 0; px < 256; px++) { const n = (rnd() - 0.5) * 18; set(px, py, [base[0] + n, base[1] + n, base[2] + n]); }
  for (let k = 0; k < 40; k++) { const bw = 10 + Math.floor(rnd() * 26), bh = 10 + Math.floor(rnd() * 26), bx = Math.floor(rnd() * (256 - bw)), by = Math.floor(rnd() * (256 - bh)), g = 210 + Math.floor(rnd() * 40), dk = rnd() < 0.5;
    for (let py = by; py < by + bh; py++) for (let px = bx; px < bx + bw; px++) set(px, py, dk ? [96, 92, 88] : [g, g - 8, g - 20]); }
  for (let t = 0; t < 256; t++) { set(t, 0, [255, 40, 40]); set(t, 255, [255, 40, 40]); set(0, t, [255, 40, 40]); set(255, t, [255, 40, 40]); }
  return PNG.sync.write(png);
}
