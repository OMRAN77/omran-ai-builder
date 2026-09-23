// tests/tv-sports.test.cjs — v-tv-sports-clean + v-tv-sports-fresh + v-tv-matches
// (المالك ٢٣ سبتمبر: «أكثر القنوات الرياضيّة ما تشتغل… اريد القنوات الرياضية… جدول مثل ياسين» — بلا قرصنة).
// يثبت: (١) بناء قائمة الرياضة الطازجة من الفهرس يستبعد المدفوع والمحظور والمغلق وhttp وما يحتاج Referer،
// والعربيّ أوّلًا؛ (٢) قراءة جدول ESPN ونافذته؛ (٣) فلتر العميل: التفاؤل الجغرافيّ للعربيّ وحده في شاشة
// الرياضة، وأسباب الفحص العميق تُخفي الميت؛ (٤) شاشة المباريات بلا innerHTML لأسماء خارجيّة وبلا زرّ
// تشغيل لمدفوع؛ (٥) المفاتيح في الـ14 لغة؛ (٦) الفاحص يكتب sports وmatches.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const lib = () => import(path.join(root, 'scripts/tv-lib.mjs'));

test('١. buildSports: رياضة فقط، بلا مدفوع/محظور/مغلق/http/Referer، والعربيّ أوّلًا', async () => {
  const { buildSports } = await lib();
  const ch = (id, name, country, extra) => Object.assign({ id, name, country, categories: ['sports'] }, extra || {});
  const channels = [
    ch('us1', 'Alpha Sports', 'US'),
    ch('ae1', 'Sharjah Sports', 'AE'),
    ch('qa1', 'beIN Sports 1', 'QA'),
    ch('sa1', 'SSC 1', 'SA'),
    ch('bl1', 'Blocked TV', 'US'),
    ch('cl1', 'Closed TV', 'US', { closed: '2024-01-01' }),
    ch('nw1', 'News TV', 'US', { categories: ['news'] }),
    ch('kw1', 'KTV Sport', 'KW'),
  ];
  const streams = [
    { channel: 'us1', url: 'https://a.example/us1.m3u8' },
    { channel: 'us1', url: 'https://a.example/us1.m3u8' },
    { channel: 'us1', url: 'http://a.example/insecure.m3u8' },
    { channel: 'ae1', url: 'https://s.example/shj.m3u8' },
    { channel: 'qa1', url: 'https://b.example/bein.m3u8' },
    { channel: 'sa1', url: 'https://b.example/ssc.m3u8' },
    { channel: 'bl1', url: 'https://b.example/bl.m3u8' },
    { channel: 'cl1', url: 'https://b.example/cl.m3u8' },
    { channel: 'nw1', url: 'https://b.example/news.m3u8' },
    { channel: 'kw1', url: 'https://k.example/ktv.m3u8', referrer: 'https://ktv.example/' },
    { channel: 'kw1', url: 'https://k.example/ktv2.m3u8' },
    { channel: null, url: 'https://orphan.example/x.m3u8' },
  ];
  const out = buildSports(channels, streams, [{ channel: 'bl1', reason: 'dmca' }]);
  assert.deepEqual(out.map((e) => e.n), ['Sharjah Sports', 'KTV Sport', 'Alpha Sports'], 'العربيّ أوّلًا بترتيب الخليج، ثمّ البقيّة');
  assert.deepEqual(out[0], { n: 'Sharjah Sports', c: 'ae', m: ['https://s.example/shj.m3u8'] });
  assert.deepEqual(out[1].m, ['https://k.example/ktv2.m3u8'], 'رابط يحتاج Referer لا يدخل');
  assert.deepEqual(out[2].m, ['https://a.example/us1.m3u8'], 'بلا تكرار وبلا http');
});

test('٢. parseEspn + windowMatches: مباراة صالحة فقط، ونافذة ٣ ساعات مضت إلى ١٤ يومًا قادمة بلا تكرار', async () => {
  const { parseEspn, windowMatches, ymd } = await lib();
  const now = Date.parse('2026-09-23T10:00:00Z');
  const ev = (id, date, home, away) => ({ id, date, competitions: [{ competitors: [{ homeAway: 'home', team: { displayName: home } }, { homeAway: 'away', team: { displayName: away } }] }] });
  const j = { leagues: [{ name: 'English Premier League' }], events: [
    ev('1', '2026-09-23T19:00Z', 'Arsenal', 'Chelsea'),
    ev('2', 'not-a-date', 'X', 'Y'),
    { id: '3', date: '2026-09-23T19:00Z', competitions: [{ competitors: [{ homeAway: 'home', team: { displayName: 'Solo' } }] }] },
    ev('4', '2026-09-23T08:00Z', 'Early', 'Kick'),
    ev('5', '2026-09-25T19:00Z', 'Far', 'Future'),
    ev('6', '2026-10-12T19:00Z', 'Too', 'Late'),
    ev('7', '2026-10-04T19:00Z', 'After', 'Break'),
  ] };
  const got = parseEspn(j, 'eng.1');
  assert.deepEqual(got.map((m) => m.id), ['1', '4', '5', '6', '7'], 'تاريخ تالف أو خصم ناقص = يُسقط');
  assert.deepEqual(got[0], { id: '1', t: '2026-09-23T19:00:00.000Z', lg: 'eng.1', ln: 'English Premier League', h: 'Arsenal', a: 'Chelsea' });
  assert.equal(parseEspn({}, 'x.1').length, 0);
  const w = windowMatches(got.concat(got), now);
  assert.deepEqual(w.map((m) => m.id), ['4', '1', '5', '7'], 'جارية قبل ساعتين تبقى، وبعد ١٤ يومًا تسقط، والتكرار يسقط');
  assert.equal(ymd(Date.parse('2026-01-05T23:30:00Z')), '20260105');
});

function clientStreamUsable(ss, native) {
  const src = read('js/app-25-tv.js');
  const grab = (re) => { const m = src.match(re); assert.ok(m, String(re)); return m[0]; };
  const consts = grab(/var TV_DEEP_DEAD = [^\n]+\n\s+var TV_DEEP_NOCORS = [^\n]+\n\s+var TV_ARAB_CC = [^\n]+/);
  const start = src.indexOf('function streamUsable(u, strict, cc){');
  assert.ok(start > 0);
  let depth = 0, end = start;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) { end = i + 1; break; }
  }
  const ctx = { window: { __tvStreamsStatus: ss }, TV_M3U_BAD: {}, TV_STATUS: null, TV_NATIVE_HLS: native, Date };
  vm.runInNewContext(consts + '\n' + src.slice(start, end) + '\nthis.f = streamUsable;', ctx);
  return ctx.f;
}

test('٣. فلتر العميل: الجغرافيّ للعربيّ وحده في شاشة الرياضة، وأسباب الفحص العميق تُخفي الميت', () => {
  const ss = {
    geo: { ok: false, cors: false, geo: true, code: 403 },
    ok: { ok: true, cors: true, deep: { why: 'ok' } },
    segDead: { ok: true, cors: true, deep: { why: 'seg-dead' } },
    ended: { ok: true, cors: true, deep: { why: 'ended' } },
    segNoCors: { ok: true, cors: true, deep: { why: 'seg-nocors' } },
    timeout: { ok: true, cors: true, deep: { why: 'timeout' } },
    old: { ok: true, cors: true },
    dead: { ok: false, cors: false, code: 404 },
  };
  const f = clientStreamUsable(ss, false);
  assert.equal(f('geo', true, 'it'), false, 'Rai/Sky/NBA TV في شاشة الرياضة تُخفى');
  assert.equal(f('geo', true, 'qa'), true, 'الكأس/الشارقة تبقى متفائلة');
  assert.equal(f('geo', false, 'it'), true, 'خارج شاشة الرياضة السلوك القديم كما هو');
  assert.equal(f('ok', true, 'us'), true);
  assert.equal(f('segDead', false, 'us'), false, 'مقطع ميت = لا يشتغل عند أحد');
  assert.equal(f('ended', false, 'us'), false);
  assert.equal(f('segNoCors', false, 'us'), false, 'hls.js يحتاج CORS على المقطع');
  assert.equal(f('timeout', false, 'us'), true, 'البطء اللحظيّ لا يُخفي');
  assert.equal(f('old', false, 'us'), true, 'بلا deep (فحص قديم) = السلوك القديم');
  assert.equal(f('dead', false, 'us'), false);
  assert.equal(f('unknown', true, 'us'), true, 'بلا بيانات فحص نتفاءل');
  const nat = clientStreamUsable(ss, true);
  assert.equal(nat('segNoCors', false, 'us'), true, 'المشغّل الأصيل لا يحتاج CORS');
  assert.equal(nat('segDead', false, 'us'), false);
});

test('٤. شاشة الرياضة والمباريات: الطازجة مدموجة، والمباريات بلا innerHTML لأسماء خارجيّة وبلا تشغيل لمدفوع', () => {
  const src = read('js/app-25-tv.js');
  assert.ok(src.includes("TV_SPORTS_FRESH.concat((TV_M3U && TV_M3U.sports) || [])"), 'الطازجة أوّلًا ثمّ الثابتة');
  assert.ok(src.includes('mOf(ch, true)') && src.includes('streamUsable(u, true, s.c)'), 'شاشة الرياضة صارمة');
  assert.ok(src.includes("S.country = '__matches'") && src.includes("if(!q && S.country === '__matches'){ renderMatches(grid, el); return; }"));
  const i = src.indexOf('function renderMatches(grid, el){');
  const body = src.slice(i, src.indexOf('function renderGrid(){', i));
  assert.ok(body.length > 0 && !body.includes('innerHTML'), 'أسماء الفرق خارجيّة — textContent فقط');
  assert.ok(!/playChannel|onclick/.test(body), 'لا زرّ تشغيل في الجدول');
  assert.match(src, /var TV_MATCH_PAID = \{ 'eng\.1': 'beIN SPORTS', 'uefa\.champions': 'beIN SPORTS', 'uefa\.europa': 'beIN SPORTS' \};/);
});

test('٥. مفاتيح الجدول في الـ14 لغة ووسم اللغات رُفع', () => {
  const K = ['tvMatches', 'tvMatchLive', 'tvMatchPaid', 'tvNoMatches', 'tvMatchesNote'];
  const core = read('js/app-03-i18n-data.js');
  K.forEach((k) => assert.equal((core.match(new RegExp('\\b' + k + ':', 'g')) || []).length, 2, k + ' عربيّ + إنجليزيّ'));
  ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh'].forEach((lg) => {
    const s = read('i18n/' + lg + '.js');
    K.forEach((k) => assert.ok(s.includes('"' + k + '":'), lg + ': ' + k));
  });
  assert.ok(read('js/app-04-i18n-state.js').includes(".js?v=681'"), 'وسم ملفّات اللغات');
});

test('٦. الفاحص يبني الطازجة ويفحص روابطها ويكتب sports وmatches', () => {
  const s = read('scripts/tv-check.mjs');
  assert.ok(s.includes("import { buildSports, parseEspn, windowMatches, ymd, MATCH_LEAGUES, MATCH_DAYS } from './tv-lib.mjs';"));
  assert.ok(s.includes("freshSports.forEach((e) => e.m.forEach((u) => urls.add(u)));"), 'روابط الطازجة تُفحص مع البقيّة');
  assert.ok(s.includes('  sports: sportsOut,\n  matches,\n'), 'تُكتب في tv-status.json');
  assert.ok(s.includes('st.deep = await deepProbe(body, r.url || u);'), 'الفحص العميق حتّى أوّل مقطع');
  assert.ok(s.includes("const days = [''].concat(Array.from({ length: MATCH_DAYS }, (_, i) => ymd(now + i * 864e5)));"), 'الجولة الحاليّة + ١٤ يومًا يومًا يومًا');
});
