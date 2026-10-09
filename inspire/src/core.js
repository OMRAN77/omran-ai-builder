/* CityKit — نواة «مدينتك الحقيقيّة» (v-inspire). تُلصق داخل كلّ تجربة فتبقى كلّ تجربة ملفّ HTML واحدًا مستقلًّا.
   البحث عن المكان (Nominatim ثمّ Photon) ← مباني وطرق وماء وحدائق من OpenStreetMap (Overpass بمرايا احتياطيّة) ←
   أمتار محلّيّة ← مشهد three.js (المباني دفعة واحدة) + خطّ رؤية سريع على شبكة + تحكّم بالكاميرا للفأرة واللمس.
   تحتاج THREE العامّ (three@0.160.0/build/three.min.js) قبلها. */
(function () {
  'use strict';
  const CK = {};
  // اللغة من وسم الصفحة (التطبيق يكتبه بلغة المستخدم عند الفتح)، ثمّ لغة المتصفّح: العربيّة لمن لغته عربيّة، والإنجليزيّة لغيره.
  const AR = /^ar/i.test(document.documentElement.lang || navigator.language || 'ar');
  const T = (ar, en) => (AR ? ar : en);
  CK.T = T; CK.AR = AR;
  CK.PRESETS = [
    { ar: 'دبي — المارينا', en: 'Dubai Marina', lat: 25.0805, lon: 55.1403 },
    { ar: 'الرياض — العليا', en: 'Riyadh Olaya', lat: 24.6990, lon: 46.6850 },
    { ar: 'الكويت — شرق', en: 'Kuwait Sharq', lat: 29.3780, lon: 47.9900 },
    { ar: 'الدوحة — الخليج الغربيّ', en: 'Doha West Bay', lat: 25.3215, lon: 51.5280 },
    { ar: 'أبوظبي — الكورنيش', en: 'Abu Dhabi Corniche', lat: 24.4760, lon: 54.3550 },
    { ar: 'المنامة', en: 'Manama', lat: 26.2350, lon: 50.5770 },
    { ar: 'جدّة — الكورنيش', en: 'Jeddah Corniche', lat: 21.5430, lon: 39.1730 },
    { ar: 'مسقط — القرم', en: 'Muscat Qurum', lat: 23.5880, lon: 58.4080 },
  ];
  CK.OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];

  // ── البيانات ──
  function timed(url, init, ms) {
    const ac = typeof AbortController === 'function' ? new AbortController() : null;
    const t = ac ? setTimeout(() => ac.abort(), ms) : null;
    return fetch(url, Object.assign({}, init, ac ? { signal: ac.signal } : {})).finally(() => t && clearTimeout(t));
  }
  CK.geocode = async function (q) {
    q = String(q || '').trim(); if (!q) throw new Error('empty');
    const m = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,،]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (m) return { lat: +m[1], lon: +m[2], name: q };
    try {
      const r = await timed('https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=' + (AR ? 'ar' : 'en') + '&q=' + encodeURIComponent(q), {}, 12000);
      const j = await r.json();
      if (j && j[0]) return { lat: +j[0].lat, lon: +j[0].lon, name: j[0].display_name || q };
    } catch (e) { /* المرآة التالية */ }
    const r2 = await timed('https://photon.komoot.io/api/?limit=1&q=' + encodeURIComponent(q), {}, 12000);
    const j2 = await r2.json();
    const f = j2 && j2.features && j2.features[0];
    if (!f) throw new Error('notfound');
    return { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], name: (f.properties && f.properties.name) || q };
  };
  CK.query = function (lat, lon, r) {
    const a = '(around:' + Math.round(r) + ',' + lat.toFixed(6) + ',' + lon.toFixed(6) + ')';
    const c = '(around:' + Math.round(r * 2) + ',' + lat.toFixed(6) + ',' + lon.toFixed(6) + ')';
    // العلاقات: مبانٍ بفناء داخليّ (أسواق، جوامع، جامعات) وبحيرات وحدائق كبيرة لا تُرسم في OSM إلّا علاقات.
    // خطّ الساحل: البحر في OSM ليس مضلّعًا — يُستنتج من جهة الماء (يمين اتّجاه الخطّ).
    return '[out:json][timeout:25];(way["building"]' + a + ';relation["building"]' + a + ';way["highway"]' + a + ';way["natural"="water"]' + a + ';way["water"]' + a +
      ';relation["type"="multipolygon"]["natural"="water"]' + a + ';way["leisure"~"park|garden"]' + a + ';relation["type"="multipolygon"]["leisure"~"park|garden"]' + a +
      ';way["landuse"="grass"]' + a + ';way["natural"="coastline"]' + c + ';);out geom;';
  };
  // كاش المناطق: التجربة تعمل داخل معاينة التطبيق بنفس الأصل، فـlocalStorage مشترك مع مشاريع المستخدم (aiapp_projects) —
  // منطقة واحدة قد تبلغ ١٫٥ مليون حرف فتملأ حصّته بعد ٢–٣ مناطق ويفشل حفظ التطبيق. لذلك: ذاكرة الصفحة + Cache API في مخزن
  // خاصّ (حصّة القرص لا حصّة localStorage) بآخر KEEP مناطق فقط، ومسح أيّ «ck1:» قديم من localStorage.
  const AREA_CACHE = 'ck-osm-1', KEEP = 6, MEM = new Map();
  try { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.indexOf('ck1:') === 0) localStorage.removeItem(k); } } catch (e) { /* بلا تخزين */ }
  async function areaGet(key) {
    if (MEM.has(key)) return MEM.get(key);
    try { if (!window.caches) return null; const r = await (await caches.open(AREA_CACHE)).match(key); return r ? await r.json() : null; } catch (e) { return null; }
  }
  async function areaPut(key, j) {
    MEM.set(key, j); while (MEM.size > 3) MEM.delete(MEM.keys().next().value);
    try {
      if (!window.caches) return;
      const c = await caches.open(AREA_CACHE);
      await c.put(key, new Response(JSON.stringify(j), { headers: { 'Content-Type': 'application/json' } }));
      const ks = await c.keys(); for (let i = 0; i < ks.length - KEEP; i++) await c.delete(ks[i]);
    } catch (e) { /* بلا كاش: نكمل من الشبكة */ }
  }
  CK.fetchArea = async function (lat, lon, r) {
    const key = 'https://citykit.cache/' + lat.toFixed(4) + ',' + lon.toFixed(4) + ',' + Math.round(r);
    const hit = await areaGet(key); if (hit) return hit;
    let last = null;
    for (const url of CK.OVERPASS) {
      try {
        const res = await timed(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(CK.query(lat, lon, r)) }, 30000);
        if (!res.ok) { last = new Error('HTTP ' + res.status); continue; }
        const j = await res.json();
        if (!j || !Array.isArray(j.elements) || (j.remark && /error|timed out|out of memory|runtime/i.test(String(j.remark)))) { last = new Error('overpass: ' + String((j && j.remark) || 'bad reply').slice(0, 80)); continue; }
        if (j.elements.length) await areaPut(key, j); // منطقة فارغة (بحر/صحراء) لا تُحفظ — قد تكون ردًّا ناقصًا
        return j;
      } catch (e) { last = e; }
    }
    throw last || new Error('overpass');
  };
  const ROAD_W = { motorway: 16, trunk: 14, primary: 12, secondary: 10, tertiary: 8, residential: 6, unclassified: 6, road: 6, busway: 6, living_street: 5, service: 4, track: 3.5, pedestrian: 4, footway: 2.5, path: 2.5, cycleway: 2.5, corridor: 2, steps: 2 };
  function heightOf(tags, id) {
    const h = parseFloat(String(tags.height || '').replace(',', '.'));
    if (h > 0 && h < 1000) return h;
    const lv = parseFloat(tags['building:levels']);
    if (lv > 0 && lv < 250) return lv * 3.2 + 1;
    const b = tags.building;
    if (/^(roof|carport)$/.test(b)) return 4; // مظلّة مواقف/محطّة وقود
    const j = ((id * 2654435761) % 1000) / 1000; // ثابت لكلّ مبنى
    if (/house|detached|villa|bungalow|semidetached/.test(b)) return 6 + j * 3;
    if (/apartments|residential|dormitory/.test(b)) return 12 + j * 12;
    if (/commercial|office|hotel|retail/.test(b)) return 14 + j * 16;
    if (/industrial|warehouse|garage|shed/.test(b)) return 7 + j * 5;
    if (/mosque|church/.test(b)) return 12;
    return 8 + j * 6;
  }
  CK.parse = function (osm, lat0, lon0) {
    const mx = Math.cos(lat0 * Math.PI / 180) * 111320, mz = 110540;
    const P = (g) => { let d = g.lon - lon0; if (d > 180) d -= 360; else if (d < -180) d += 360; return [d * mx, -(g.lat - lat0) * mz]; }; // الالتفاف عند خطّ ١٨٠
    const out = { buildings: [], roads: [], water: [], parks: [], lat: lat0, lon: lon0, sea: false };
    const isClosed = (pts) => pts.length > 3 && Math.abs(pts[0][0] - pts[pts.length - 1][0]) < 0.01 && Math.abs(pts[0][1] - pts[pts.length - 1][1]) < 0.01;
    const addBuilding = (id, poly, t) => {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const [x, z] of poly) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
      out.buildings.push({ id, poly, h: heightOf(t, id), kind: t.building, name: t.name || '', box: [x0, z0, x1, z1] });
    };
    const coast = [];
    for (const e of (osm && osm.elements) || []) {
      const t = e.tags || {};
      if (e.type === 'relation') { // العلاقة: الحلقات الخارجيّة تُخاط من أعضائها (الفناء الداخليّ يُملأ — أقرب من غيابه)
        const outer = CK.stitch((e.members || []).filter((m) => m.type === 'way' && m.role !== 'inner' && m.geometry && m.geometry.length > 1).map((m) => m.geometry.map(P)));
        if (t.building) outer.forEach((ring, i) => addBuilding(e.id * 16 + i, ring, t));
        else if (t.natural === 'water' || t.water) out.water.push(...outer);
        else if (t.leisure || t.landuse) out.parks.push(...outer);
        continue;
      }
      if (e.type !== 'way' || !e.geometry || e.geometry.length < 2) continue;
      const pts = e.geometry.map(P);
      const closed = isClosed(pts);
      const hk = t.highway ? String(t.highway).replace(/_link$/, '') : ''; // الوصلات (منحدرات، مخارج، دوّارات) بنوع أصلها وعرض أضيق
      if (t.natural === 'coastline') coast.push(pts);
      else if (t.building && closed) addBuilding(e.id, pts.slice(0, -1), t);
      else if (hk && ROAD_W[hk]) {
        const link = hk !== t.highway;
        out.roads.push({ id: e.id, pts, kind: hk, w: ROAD_W[hk] * (link ? 0.7 : 1), name: t.name || '', link });
      } else if ((t.natural === 'water' || t.water) && closed) out.water.push(pts.slice(0, -1));
      else if ((t.leisure || t.landuse) && closed) out.parks.push(pts.slice(0, -1));
    }
    const sea = CK.seaPolys(coast, 1200, 25); // حتّى ٢R حول المركز (خطّ الساحل يُجلب حتّى ٢R)
    if (sea.length) { out.water.push(...sea); out.sea = true; }
    out.buildings.sort((a, b) => b.h - a.h);
    return out;
  };
  // خياطة خطوط إلى حلقات مغلقة (أعضاء العلاقة تأتي قطعًا متتالية بأيّ اتّجاه)
  CK.stitch = function (lines) {
    const near = (a, b) => Math.abs(a[0] - b[0]) < 0.5 && Math.abs(a[1] - b[1]) < 0.5;
    const pool = lines.map((l) => l.slice()), out = [];
    while (pool.length) {
      let cur = pool.shift(), guard = 0;
      while (!near(cur[0], cur[cur.length - 1]) && guard++ < 2000) {
        const end = cur[cur.length - 1]; let k = -1, rev = false;
        for (let i = 0; i < pool.length; i++) { const l = pool[i]; if (near(l[0], end)) { k = i; break; } if (near(l[l.length - 1], end)) { k = i; rev = true; break; } }
        if (k < 0) break;
        const l = pool.splice(k, 1)[0]; if (rev) l.reverse(); cur = cur.concat(l.slice(1));
      }
      if (cur.length > 3 && near(cur[0], cur[cur.length - 1])) out.push(cur.slice(0, -1));
    }
    return out;
  };
  // البحر من خطّ الساحل: الماء يمين اتّجاه الخطّ (OSM). شبكة خلايا H×2 بعرض C — كلّ خليّة تأخذ جهة أقرب قطعة ساحل إليها
  // (عند رأس مشترك: متوسّط عموديّي القطعتين)، ثمّ تُدمج الخلايا البحريّة مستطيلات (صفوف ثمّ أعمدة) تُضاف إلى الماء.
  CK.seaPolys = function (coast, H, C) {
    C = C || 20; if (!coast || !coast.length) return [];
    const segs = [];
    for (const l of coast) for (let i = 0; i < l.length - 1; i++) {
      const a = l[i], b = l[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
      if (L < 0.01) continue;
      // في إحداثيّاتنا z جنوبًا: يمين الاتّجاه (شمالًا للأعلى) = (-dz, dx)/L بعد قلب z مرّتين ← (−dz, dx) في (x,z)
      segs.push({ a, b, dx, dz, L, nx: -dz / L, nz: dx / L });
    }
    if (!segs.length) return [];
    const N = Math.ceil(H / C), grid = [];
    for (let j = -N; j < N; j++) {
      const row = [];
      for (let i = -N; i < N; i++) {
        const x = (i + 0.5) * C, z = (j + 0.5) * C;
        let best = Infinity, qx = 0, qz = 0, sx = 0, sz = 0;
        for (const s of segs) {
          let t = ((x - s.a[0]) * s.dx + (z - s.a[1]) * s.dz) / (s.L * s.L); t = t < 0 ? 0 : t > 1 ? 1 : t;
          const px = s.a[0] + s.dx * t, pz = s.a[1] + s.dz * t, d = (x - px) * (x - px) + (z - pz) * (z - pz);
          if (d < best - 1e-3) { best = d; qx = px; qz = pz; sx = s.nx; sz = s.nz; }
          else if (d < best + 1e-3) { sx += s.nx; sz += s.nz; } // رأس مشترك بين قطعتين: متوسّط عموديّيهما
        }
        row.push(best > 1e-3 && (x - qx) * sx + (z - qz) * sz > 0);
      }
      grid.push(row);
    }
    // دمج: لكلّ صفّ مقاطع متّصلة، ثمّ يمتدّ المقطع نفسه رأسيًّا ما دام مطابقًا
    const out = [], open = new Map();
    const flush = (key, j1) => { const o = open.get(key); open.delete(key); const x0 = (o.i0 - N) * C, x1 = (o.i1 + 1 - N) * C, z0 = (o.j0 - N) * C, z1 = (j1 - N) * C; out.push([[x0, z0], [x1, z0], [x1, z1], [x0, z1]]); };
    for (let j = 0; j <= grid.length; j++) {
      const runs = new Set();
      if (j < grid.length) { const r = grid[j]; for (let i = 0; i < r.length; i++) if (r[i]) { let k = i; while (k + 1 < r.length && r[k + 1]) k++; runs.add(i + ',' + k); i = k; } }
      for (const key of [...open.keys()]) if (!runs.has(key)) flush(key, j);
      for (const key of runs) if (!open.has(key)) { const [i0, i1] = key.split(',').map(Number); open.set(key, { i0, i1, j0: j }); }
    }
    return out;
  };

  // ── الهندسة والفهرس ──
  CK.inPoly = function (x, z, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
      if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) c = !c;
    }
    return c;
  };
  CK.index = function (data, cell) {
    cell = cell || 24; const grid = new Map();
    const k = (i, j) => i + ',' + j;
    for (const b of data.buildings) {
      for (let i = Math.floor(b.box[0] / cell); i <= Math.floor(b.box[2] / cell); i++)
        for (let j = Math.floor(b.box[1] / cell); j <= Math.floor(b.box[3] / cell); j++) {
          const kk = k(i, j); if (!grid.has(kk)) grid.set(kk, []); grid.get(kk).push(b);
        }
    }
    const near = (x, z) => grid.get(k(Math.floor(x / cell), Math.floor(z / cell))) || [];
    const at = (x, z) => { for (const b of near(x, z)) if (x >= b.box[0] && x <= b.box[2] && z >= b.box[1] && z <= b.box[3] && CK.inPoly(x, z, b.poly)) return b; return null; };
    const heightAt = (x, z) => { const b = at(x, z); return b ? b.h : 0; };
    // خطّ رؤية: يمشي على القطعة بخطوة ثابتة ويسأل هل نقطة منها داخل مبنى أعلى منها
    const los = (a, b, step) => {
      step = step || 3;
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L = Math.hypot(dx, dz);
      const n = Math.max(1, Math.ceil(L / step));
      for (let s = 1; s < n; s++) {
        const t = s / n, x = a.x + dx * t, z = a.z + dz * t, y = a.y + dy * t;
        const hb = at(x, z); if (hb && hb.h > y) return false;
      }
      return true;
    };
    return { at, heightAt, los, near, cell };
  };

  function buildingGeometry(THREE, data) {
    const pos = [], nor = [], col = [];
    const cA = new THREE.Color(), cLow = new THREE.Color(0xd9cdb8), cMid = new THREE.Color(0xb9c4cc), cHigh = new THREE.Color(0x7fa6bd);
    for (const b of data.buildings) {
      const ring = b.poly; const n = ring.length; if (n < 3) continue;
      const t = Math.min(1, b.h / 180); cA.copy(t < 0.25 ? cLow : cMid).lerp(t < 0.25 ? cMid : cHigh, t < 0.25 ? t / 0.25 : (t - 0.25) / 0.75);
      let area = 0; for (let i = 0; i < n; i++) { const p = ring[i], q = ring[(i + 1) % n]; area += p[0] * q[1] - q[0] * p[1]; }
      const ccw = area > 0;
      for (let i = 0; i < n; i++) {
        const p = ring[i], q = ring[(i + 1) % n];
        const ex = q[0] - p[0], ez = q[1] - p[1], L = Math.hypot(ex, ez) || 1;
        let nx = ez / L, nz = -ex / L; if (!ccw) { nx = -nx; nz = -nz; }
        const v = [[p[0], 0, p[1]], [q[0], 0, q[1]], [q[0], b.h, q[1]], [p[0], 0, p[1]], [q[0], b.h, q[1]], [p[0], b.h, p[1]]];
        const order = ccw ? [0, 2, 1, 3, 5, 4] : [0, 1, 2, 3, 4, 5];
        for (const o of order) { pos.push(v[o][0], v[o][1], v[o][2]); nor.push(nx, 0, nz); col.push(cA.r * 0.92, cA.g * 0.92, cA.b * 0.92); }
      }
      const tri = THREE.ShapeUtils.triangulateShape(ring.map((p) => new THREE.Vector2(p[0], p[1])), []);
      for (const f of tri) {
        const idx = ccw ? [f[0], f[2], f[1]] : [f[0], f[1], f[2]];
        for (const k of idx) { pos.push(ring[k][0], b.h, ring[k][1]); nor.push(0, 1, 0); col.push(cA.r, cA.g, cA.b); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeBoundingSphere();
    return g;
  }
  function ribbonGeometry(THREE, roads, y) {
    const pos = [];
    for (const r of roads) {
      const hw = r.w / 2;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const p = r.pts[i], q = r.pts[i + 1];
        const dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz) || 1, nx = -dz / L * hw, nz = dx / L * hw;
        pos.push(p[0] + nx, y, p[1] + nz, q[0] - nx, y, q[1] - nz, q[0] + nx, y, q[1] + nz,
          p[0] + nx, y, p[1] + nz, p[0] - nx, y, p[1] - nz, q[0] - nx, y, q[1] - nz);
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    return g;
  }
  // كلّ المضلّعات المسطّحة (ماء أو حدائق) في هندسة واحدة: مدينة مرسومة جيّدًا فيها مئات المسطّحات الخضراء، وشبكة لكلّ واحد
  // تعني مئات نداءات الرسم في كلّ إطار. تبقى داخل Group كما كانت (تجارب تقرأ cityGroup.children وتبحث عن Group).
  function polysMesh(THREE, polys, y, color) {
    const grp = new THREE.Group(), pos = [];
    for (const poly of polys) {
      if (!poly || poly.length < 3) continue;
      let tri; try { tri = THREE.ShapeUtils.triangulateShape(poly.map((p) => new THREE.Vector2(p[0], p[1])), []); } catch (e) { continue; } // مضلّع متقاطع ذاتيًّا: يُتخطّى
      for (const f of tri) for (const k of f) pos.push(poly[k][0], y, poly[k][1]);
    }
    if (pos.length) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
      // إزاحة العمق: سنتيمترات فوق الأرض لا تكفي من بعيد فيتقاطع السطحان خطوطًا (z-fighting)
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      m.receiveShadow = false; grp.add(m); // الظلّ على المسطّحات الرقيقة يرسم خطوطًا متكسّرة
    }
    return grp;
  }

  // ── تحكّم الكاميرا (بلا OrbitControls: البناء العامّ لـthree لا يحويه) ──
  CK.orbit = function (camera, dom, o) {
    const s = { target: new CK.THREE.Vector3(0, 0, 0), dist: 900, theta: 0.6, phi: 0.9, min: 30, max: 3000, enabled: true };
    Object.assign(s, o || {});
    const apply = () => {
      s.phi = Math.max(0.12, Math.min(1.5, s.phi)); s.dist = Math.max(s.min, Math.min(s.max, s.dist));
      camera.position.set(s.target.x + s.dist * Math.sin(s.phi) * Math.sin(s.theta), s.target.y + s.dist * Math.cos(s.phi), s.target.z + s.dist * Math.sin(s.phi) * Math.cos(s.theta));
      camera.lookAt(s.target);
    };
    const ptrs = new Map(); let last = null, pinch = 0;
    dom.style.touchAction = 'none';
    dom.addEventListener('pointerdown', (e) => { if (!s.enabled) return; dom.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); last = [e.clientX, e.clientY, e.button === 2 || e.shiftKey]; });
    dom.addEventListener('pointermove', (e) => {
      if (!s.enabled || !ptrs.has(e.pointerId)) return;
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch) s.dist *= pinch / d; pinch = d; apply(); return;
      }
      const dx = e.clientX - last[0], dy = e.clientY - last[1]; last[0] = e.clientX; last[1] = e.clientY;
      if (last[2]) {
        const k = s.dist / 800, c = Math.cos(s.theta), sn = Math.sin(s.theta);
        s.target.x -= (dx * c + dy * sn) * k; s.target.z -= (-dx * sn + dy * c) * k;
      } else { s.theta -= dx * 0.006; s.phi -= dy * 0.005; }
      apply();
    });
    const up = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = 0; };
    dom.addEventListener('pointerup', up); dom.addEventListener('pointercancel', up);
    dom.addEventListener('wheel', (e) => { if (!s.enabled) return; e.preventDefault(); s.dist *= Math.exp(e.deltaY * 0.0012); apply(); }, { passive: false });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    s.apply = apply; apply();
    return s;
  };

  // ── الواجهة ──
  const CSS = `
  .ck-ui{position:fixed;top:12px;right:12px;left:auto;z-index:5;box-sizing:border-box;width:min(360px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;
    background:rgba(12,22,28,.86);color:#e8f1f3;border:1px solid rgba(120,200,210,.25);border-radius:14px;padding:12px 14px;
    font:14px/1.6 "IBM Plex Sans Arabic",Tahoma,system-ui,sans-serif;direction:${AR ? 'rtl' : 'ltr'};backdrop-filter:blur(8px);box-shadow:0 8px 30px rgba(0,0,0,.35)}
  .ck-ui h1{font-size:17px;margin:0 0 2px;font-weight:700}.ck-ui .sub{margin:0 0 8px;color:#a9c1c7;font-size:13px}
  .ck-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:6px 0}
  .ck-ui input,.ck-ui select{font:inherit;flex:1 1 140px;min-width:0;background:#0d1a20;color:#e8f1f3;border:1px solid #2b4650;border-radius:9px;padding:6px 9px}
  .ck-ui button{font:inherit;background:#1f8a93;color:#fff;border:0;border-radius:9px;padding:6px 12px;cursor:pointer}
  .ck-ui button.ghost{background:transparent;border:1px solid #2b4650;color:#cfe3e7}
  .ck-ui button:disabled{opacity:.5;cursor:default}
  .ck-ui label{display:block;font-size:13px;color:#a9c1c7;margin-top:6px}
  .ck-ui input[type=range]{width:100%;flex-basis:100%}
  .ck-status{font-size:12.5px;color:#9fd8de;min-height:1.4em}
  .ck-stat{display:grid;grid-template-columns:1fr auto;gap:2px 10px;font-variant-numeric:tabular-nums;margin-top:6px}
  .ck-stat b{color:#fff}
  .ck-attr{margin-top:8px;font-size:11px;color:#8fb0b8}.ck-attr a{color:inherit;text-decoration:none}.ck-attr a:hover{text-decoration:underline}
  /* لوحة التجربة نافذة منبثقة على الحاسوب: زرّ ثابت أعلى الزاوية، واللوحة تنزل تحته وتُطوى بالزرّ (وبنقرة الشاشة في ألعاب القيادة).
     الجوّال كما كان: اللوحة في مكانها بلا زرّ ولا طيّ. */
  .ck-toggle{display:none;position:fixed;top:12px;right:12px;z-index:6;width:38px;height:38px;padding:0;align-items:center;justify-content:center;border-radius:50%;
    border:1px solid rgba(120,200,210,.35);background:rgba(12,22,28,.86);color:#e8f1f3;cursor:pointer;backdrop-filter:blur(8px);box-shadow:0 4px 16px rgba(0,0,0,.35)}
  .ck-toggle[aria-expanded=true]{background:#1f8a93;border-color:#1f8a93}
  .ck-toggle svg{width:20px;height:20px;display:block}
  @media (min-width:641px){
    .ck-toggle{display:flex}
    .ck-ui{top:58px;max-height:calc(100vh - 70px);transition:opacity .16s ease,transform .16s ease,visibility 0s linear 0s}
    .ck-ui.ck-off{opacity:0;transform:translateY(-10px);visibility:hidden;pointer-events:none;transition:opacity .16s ease,transform .16s ease,visibility 0s linear .16s}
  }
  @media (max-width:640px){.ck-ui{top:auto;bottom:10px;right:10px;left:10px;width:auto;max-height:46vh}}
  .ck-hud{position:fixed;left:12px;top:12px;z-index:4;font:600 15px/1.4 "IBM Plex Sans Arabic",Tahoma,sans-serif;color:#fff;text-shadow:0 1px 3px #000;direction:${AR ? 'rtl' : 'ltr'};pointer-events:none}
  `;
  CK.ui = function (title, sub) {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const box = document.createElement('div'); box.className = 'ck-ui';
    box.innerHTML = '<h1></h1><p class="sub"></p><div class="ck-row"><input id="ckq" type="search"><button id="ckgo"></button></div>' +
      '<div class="ck-row"><select id="ckpre"></select><button class="ghost" id="ckme"></button></div><div class="ck-status" id="ckst"></div><div id="ckpanel"></div>' +
      '<div class="ck-attr"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener"></a></div>';
    box.querySelector('h1').textContent = title; box.querySelector('.sub').textContent = sub || '';
    box.querySelector('#ckq').placeholder = T('اكتب اسم حيّك أو مدينتك', 'Type your neighbourhood or city');
    box.querySelector('#ckgo').textContent = T('ابنِ', 'Build');
    box.querySelector('#ckme').textContent = T('موقعي', 'My location');
    box.querySelector('.ck-attr a').textContent = T('بيانات الخريطة © مساهمو OpenStreetMap', 'Map data © OpenStreetMap contributors');
    const sel = box.querySelector('#ckpre');
    sel.innerHTML = '<option value="">' + T('أو اختر مدينة…', 'or pick a city…') + '</option>' + CK.PRESETS.map((p, i) => '<option value="' + i + '">' + (AR ? p.ar : p.en) + '</option>').join('');
    document.body.appendChild(box);
    const hud = document.createElement('div'); hud.className = 'ck-hud'; document.body.appendChild(hud);
    // زرّ اللوحة: يفتحها ويطويها (الحاسوب فقط؛ CSS يخفيه على الجوّال). تبدأ مفتوحة ليختار المستخدم المكان.
    box.id = 'ckbox';
    const tg = document.createElement('button'); tg.type = 'button'; tg.className = 'ck-toggle'; tg.setAttribute('aria-controls', 'ckbox');
    const lbl = T('لوحة التجربة', 'Experience panel'); tg.title = lbl; tg.setAttribute('aria-label', lbl);
    tg.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>';
    document.body.appendChild(tg);
    let open = true;
    const set = (v) => { open = !!v; box.classList.toggle('ck-off', !open); tg.setAttribute('aria-expanded', String(open)); };
    tg.addEventListener('click', () => set(!open));
    set(true);
    return { box, toggle: tg, show: () => set(true), hide: () => set(false), isOpen: () => open, panel: box.querySelector('#ckpanel'), status: (s) => { box.querySelector('#ckst').textContent = s || ''; }, hud: (s) => { hud.innerHTML = s || ''; } };
  };
  CK.el = function (html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };

  // ── التشغيل ──
  CK.start = function (opt) {
    const THREE = window.THREE; CK.THREE = THREE;
    const R = opt.radius || 600;
    document.documentElement.dir = AR ? 'rtl' : 'ltr';
    document.body.style.cssText = 'margin:0;overflow:hidden;background:#0b1419';
    const ui = CK.ui(opt.title, opt.sub);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: !!opt.keepBuffer });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = !!opt.shadows; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);
    if (opt.autoHide) { // ألعاب القيادة: نقرة على الشاشة (لا سحب) تطوي اللوحة فيبقى المشهد وحده
      let dn = null; const cv = renderer.domElement;
      cv.addEventListener('pointerdown', (e) => { dn = { x: e.clientX, y: e.clientY, t: performance.now() }; });
      cv.addEventListener('pointerup', (e) => { if (dn && Math.hypot(e.clientX - dn.x, e.clientY - dn.y) < 6 && performance.now() - dn.t < 500) ui.hide(); dn = null; });
    }
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0xbfd9e6); scene.fog = new THREE.Fog(0xbfd9e6, R * 1.4, R * 4);
    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, R * 8);
    const hemi = new THREE.HemisphereLight(0xeaf6ff, 0x8a7a5c, 0.85); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.1); sun.position.set(-R * 0.6, R * 1.2, R * 0.4); scene.add(sun); scene.add(sun.target);
    if (opt.shadows) { sun.castShadow = true; const sc = sun.shadow.camera; sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 1; sc.far = R * 4; sc.updateProjectionMatrix(); sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; }
    const orbit = CK.orbit(camera, renderer.domElement, { dist: R * 1.5, max: R * 5 });
    const frames = [];
    let city = null, cityGroup = null, busy = false;
    const ctx = { THREE, scene, camera, renderer, orbit, sun, hemi, ui, R, T, AR, frames, onFrame: (f) => frames.push(f) };
    window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });
    let prev = performance.now();
    renderer.setAnimationLoop(() => {
      const now = performance.now(), dt = Math.min(0.05, (now - prev) / 1000); prev = now;
      for (const f of frames) { try { f(dt, now); } catch (e) { console.error(e); } }
      renderer.render(scene, camera);
    });
    async function load(lat, lon, name) {
      if (busy) return; busy = true;
      ui.status(T('أجلب مباني وشوارع ', 'Fetching buildings and streets of ') + (name || '') + '…');
      try {
        const osm = await CK.fetchArea(lat, lon, R);
        const data = CK.parse(osm, lat, lon);
        if (!data.buildings.length && !data.roads.length) { ui.status(T('ما لقيت مباني هنا — جرّب مكانًا داخل المدينة.', 'No buildings here — try a spot inside the city.')); busy = false; return; }
        if (cityGroup) { scene.remove(cityGroup); cityGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
        frames.length = 0;
        cityGroup = new THREE.Group(); scene.add(cityGroup);
        const ground = new THREE.Mesh(new THREE.CircleGeometry(R * 3, 64), new THREE.MeshLambertMaterial({ color: 0xd8ccb4 }));
        ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; cityGroup.add(ground);
        cityGroup.add(polysMesh(THREE, data.water, 0.03, 0x3d8fb6));
        cityGroup.add(polysMesh(THREE, data.parks, 0.04, 0x8fb87a));
        const roads = new THREE.Mesh(ribbonGeometry(THREE, data.roads, 0.06), new THREE.MeshLambertMaterial({ color: 0x5f6b72, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
        roads.receiveShadow = true; cityGroup.add(roads);
        const bm = new THREE.Mesh(buildingGeometry(THREE, data), new THREE.MeshLambertMaterial({ vertexColors: true }));
        bm.castShadow = true; bm.receiveShadow = true; cityGroup.add(bm);
        const idx = CK.index(data);
        const group = new THREE.Group(); cityGroup.add(group);
        city = Object.assign({}, data, { idx, buildingsMesh: bm, roadsMesh: roads, ground, group, name: name || '' });
        ctx.city = city;
        orbit.target.set(0, 0, 0); orbit.dist = R * 1.5; orbit.apply();
        ui.status(T('جاهز: ', 'Ready: ') + data.buildings.length + T(' مبنى · ', ' buildings · ') + data.roads.length + T(' طريق', ' roads'));
        await new Promise((r) => setTimeout(r, 16)); // إطار يُرسم فيه المشهد قبل حسابات التجربة (لا تجمّد الصفحة دفعة واحدة)
        if (opt.onCity) await opt.onCity(ctx, city);
        window.__ck_ready = (window.__ck_ready || 0) + 1;
      } catch (e) {
        console.warn('[citykit]', e);
        ui.status(T('تعذّر جلب الخريطة الحين — حاول بعد قليل أو اختر مدينة أخرى.', 'Could not load the map now — try again or pick another city.'));
        window.__ck_error = String(e && e.message || e);
      }
      busy = false;
    }
    ctx.load = load; window.__ck_ctx = ctx; // للاختبار: تبديل المدينة من داخل الصفحة
    const q = ui.box.querySelector('#ckq');
    const go = async () => { try { ui.status(T('أبحث…', 'Searching…')); const g = await CK.geocode(q.value); await load(g.lat, g.lon, q.value); } catch (e) { ui.status(T('ما لقيت المكان — اكتبه بطريقة ثانية.', 'Place not found — try another spelling.')); } };
    ui.box.querySelector('#ckgo').addEventListener('click', go);
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    ui.box.querySelector('#ckpre').addEventListener('change', (e) => { const p = CK.PRESETS[+e.target.value]; if (p) load(p.lat, p.lon, AR ? p.ar : p.en); });
    ui.box.querySelector('#ckme').addEventListener('click', () => {
      if (!navigator.geolocation) return ui.status(T('الموقع غير متاح هنا.', 'Location is not available here.'));
      navigator.geolocation.getCurrentPosition((p) => load(p.coords.latitude, p.coords.longitude, T('موقعك', 'your location')), () => ui.status(T('ما سمح المتصفّح بالموقع — اكتب اسم الحيّ.', 'Location blocked — type the neighbourhood.')), { timeout: 10000 });
    });
    if (opt.panel) opt.panel(ctx);
    const p0 = CK.PRESETS[0];
    load(p0.lat, p0.lon, AR ? p0.ar : p0.en);
    return ctx;
  };
  // أدوات مشتركة صغيرة
  CK.sunDir = function (lat, lon, date) { // اتّجاه الشمس (ارتفاع + سمت) من التاريخ والوقت — تقريب NOAA
    const rad = Math.PI / 180, d = (date - Date.UTC(2000, 0, 1, 12)) / 86400000;
    const g = (357.529 + 0.98560028 * d) * rad, q = 280.459 + 0.98564736 * d;
    const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad, e = (23.439 - 0.00000036 * d) * rad;
    const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(e) * Math.sin(L));
    const gmst = (18.697374558 + 24.06570982441908 * d) % 24, lst = (gmst * 15 + lon) * rad;
    const H = lst - ra, la = lat * rad;
    const alt = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(H));
    const az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(la) - Math.sin(la) * Math.cos(H)); // من الشمال باتّجاه الشرق
    return { alt, az, x: Math.cos(alt) * Math.sin(az), y: Math.sin(alt), z: -Math.cos(alt) * Math.cos(az) };
  };
  window.CityKit = CK;
})();
