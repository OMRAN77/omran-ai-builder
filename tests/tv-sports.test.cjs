// tests/tv-sports.test.cjs — v-tv-sports-clean + v-tv-sports-fresh + v-tv-matches
// (المالك ٢٣ سبتمبر: «أكثر القنوات الرياضيّة ما تشتغل… اريد القنوات الرياضية… جدول مثل ياسين» — بلا قرصنة).
// يثبت: (١) بناء قائمة الرياضة الطازجة من الفهرس يستبعد المدفوع والمحظور والمغلق وhttp وما يحتاج Referer،
// والعربيّ أوّلًا؛ (٢) قراءة جدول ESPN ونافذته؛ (٣) فلتر العميل: التفاؤل الجغرافيّ للعربيّ وحده في شاشة
// الرياضة، وأسباب الفحص العميق تُخفي الميت؛ (٤) شاشة المباريات بلا innerHTML لأسماء خارجيّة وبلا زرّ
// تشغيل لمدفوع؛ (٥) المفاتيح في الـ14 لغة؛ (٦) الفاحص يكتب sports وmatches؛ (٧) لا يوتيوب إطلاقًا؛
// (٨) تبويب الإمارات؛ (٩–١٠) الفحص من جهاز المستخدم يغلب فحص أمريكا.
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

function clientStreamUsable(ss, native, dev) {
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
  const ctx = { window: { __tvStreamsStatus: ss }, TV_M3U_BAD: {}, TV_STATUS: null, TV_NATIVE_HLS: native, Date, devVerdict: (u) => (dev && u in dev ? dev[u] : null) };
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
  assert.ok(read('js/app-04-i18n-state.js').includes(".js?v=683'"), 'وسم ملفّات اللغات');
});

test('٦. الفاحص يبني الطازجة ويفحص روابطها ويكتب sports وmatches', () => {
  const s = read('scripts/tv-check.mjs');
  assert.ok(s.includes("import { buildSports, parseEspn, windowMatches, ymd, MATCH_LEAGUES, MATCH_DAYS } from './tv-lib.mjs';"));
  assert.ok(s.includes("freshSports.forEach((e) => e.m.forEach((u) => urls.add(u)));"), 'روابط الطازجة تُفحص مع البقيّة');
  assert.ok(s.includes('  sports: sportsOut,\n  matches,\n'), 'تُكتب في tv-status.json');
  assert.ok(s.includes('st.deep = await deepProbe(body, r.url || u);'), 'الفحص العميق حتّى أوّل مقطع');
  assert.ok(s.includes("const days = [''].concat(Array.from({ length: MATCH_DAYS }, (_, i) => ymd(now + i * 864e5)));"), 'الجولة الحاليّة + ١٤ يومًا يومًا يومًا');
});

// v-tv-no-youtube (المالك: «مااريد شي اسمه يوتيوب — اريد شغل مباشر»): لا زرّ ولا إطار ولا اسم ولا نصّ يوتيوب،
// والفاحص لا يطلب youtube.com أصلًا — البثّ المباشر داخل التطبيق وحده.
test('٧. لا يوتيوب: المشغّل والأسماء والـ14 لغة والفاحص', () => {
  const tv = read('js/app-25-tv.js');
  assert.ok(!/id="tvExt"|id="tvFrame"|#tvExt|#tvFrame|tvYoutube/.test(tv), 'لا زرّ يوتيوب ولا إطار تضمين');
  assert.ok(!/n: '[^']*يوتيوب/.test(tv), 'لا قناة اسمها يحمل «يوتيوب»');
  assert.ok(tv.includes('<video id="tvVideo"'), 'المشغّل المباشر باقٍ');
  const langs = ['js/app-03-i18n-data.js'].concat(['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh'].map((l) => 'i18n/' + l + '.js'));
  langs.forEach((f) => assert.ok(!read(f).includes('tvYoutube'), f));
  const chk = read('scripts/tv-check.mjs');
  assert.ok(!/youtube\.com|liveInfo|bySearch|byHandle\(/.test(chk), 'الفاحص بلا يوتيوب');
  assert.ok(!chk.includes('  channels,\n'), 'لا قسم قنوات يوتيوب في tv-status.json');
});

// v-tv-uae (المالك: «قنوات الإمارات الرياضية والعادية الي اريدها رتبها»): القنوات الرسميّة الإماراتيّة التي لها
// رابط عامّ في الفهرس موجودة بروابطها وأسمائها الإنجليزيّة، وتبويب الإمارات مرتّب بالتصنيف (الرياضة أوّلًا).
test('٨. تبويب الإمارات: الوسطى وكلباء وبرامج العربية والعربية Business بروابط، وترتيب بالتصنيف', () => {
  const tv = read('js/app-25-tv.js');
  const bh = JSON.parse(read('tv-streams.json')).byHandle;
  [['الوسطى', 'alWoustaTV', 'Al Wousta TV'], ['الشرقية من كلباء', 'kalbaTV', 'Al Sharqiya from Kalba'], ['برامج العربية', 'alArabiyaPrograms', 'Al Arabiya Programs']].forEach(([ar, h, en]) => {
    assert.ok(tv.includes("{ n: '" + ar + "', c: 'ae', g: 'general', h: '" + h + "' }"), ar);
    assert.ok(Array.isArray(bh[h]) && bh[h].length && bh[h].every((u) => u.startsWith('https://')), h + ' رابط https');
    assert.ok(tv.includes('"' + ar + '": "' + en + '"'), en);
  });
  assert.ok(tv.includes("{ n: 'العربية Business', h: 'AlArabiyaBusiness', c: 'ae', g: 'biz' }"), 'العربية Business مع الإمارات');
  assert.ok(tv.includes("var byCat = !q && S.country === 'ae' && S.cat === 'all';") && tv.includes('return byCat ? tvCatRank(a) - tvCatRank(b) : 0;'));
  assert.ok(tv.includes('var TV_CAT_RANK = { sports: 0, general: 1,'), 'الرياضة ثمّ العامّة');
});

// v-tv-device-check (المالك: «بعضها يشتغل وأغلبها لا»): الفاحص من أمريكا، والقنوات الأمريكيّة المجانيّة محجوبة
// خارجها — حكم جهاز المستخدم (فحص بطلبات hls.js نفسها أو تشغيل فعليّ) يغلب فحص أمريكا في الاتّجاهين.
test('٩. حكم الجهاز يغلب فحص أمريكا: ميت هناك ويشتغل هنا يظهر، وشغّال هناك ومحجوب هنا يختفي', () => {
  const ss = { usDead: { ok: false, cors: false, code: 404 }, usOk: { ok: true, cors: true, deep: { why: 'ok' } }, geoAr: { ok: false, geo: true, code: 403 } };
  const f = clientStreamUsable(ss, false, { usDead: true, usOk: false, geoAr: false });
  assert.equal(f('usDead', true, 'us'), true, 'يشتغل من جهاز المستخدم');
  assert.equal(f('usOk', true, 'us'), false, 'Amagi/Wurl المحجوبة خارج أمريكا تختفي');
  assert.equal(f('geoAr', true, 'ae'), false, 'التفاؤل الجغرافيّ يحسمه الجهاز');
  const tv = read('js/app-25-tv.js');
  assert.ok(tv.includes('    var dv = devVerdict(u);') && tv.indexOf('var dv = devVerdict(u);') < tv.indexOf('if(ss[u].geo)'), 'قبل قرارات فحص أمريكا');
  assert.ok(tv.includes('devResult(url, false);') && tv.includes('v.onplaying = function(){ __vRetry = 0; ready(); devResult(url, true); };'), 'التشغيل الفعليّ يسجّل');
  assert.ok(tv.includes("'⚙︎ TV-13 · '"), 'رقم النسخة الظاهر رُفع ليعرف المالك أنّ التحديث وصله');
  assert.ok(tv.includes('if(TV_NATIVE_HLS || typeof fetch !== \'function\') return;'), 'سفاري لا يُفحص مسبقًا (لا يحتاج CORS)');
});

function devKit(fetchImpl, store) {
  const src = read('js/app-25-tv.js');
  const from = src.indexOf("  var TV_DEV_KEY = 'tvDevCheck1';");
  const to = src.indexOf('  var devRerender = null;');
  assert.ok(from > 0 && to > from);
  const ls = { data: store || {}, getItem(k) { return this.data[k] || null; }, setItem(k, v) { this.data[k] = v; } };
  const ctx = { localStorage: ls, fetch: fetchImpl, AbortController, setTimeout, clearTimeout, URL, Promise, JSON, Date, Object, String, __swallow() {} };
  vm.runInNewContext(src.slice(from, to) + '\nthis.k = { devProbe, devMark, devVerdict, devResult, TV_DEV, TV_DEV_BUSY };', ctx);
  return { ...ctx.k, ls };
}

test('١٠. devProbe: قائمة ← جودة ← أوّل مقطع من الجهاز؛ أيّ خطوة تفشل أو يمنعها المتصفّح = فشل؛ والحكم يُحفظ ويتقادم', async () => {
  const R = (status, body) => ({ ok: status >= 200 && status < 300, status, url: '', text: async () => body || '' });
  const routes = {
    'https://a.test/m.m3u8': () => R(200, '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nv/low.m3u8\n'),
    'https://a.test/v/low.m3u8': () => R(200, '#EXTM3U\n#EXTINF:6,\nseg1.ts\n'),
    'https://a.test/v/seg1.ts': () => R(200),
    'https://b.test/m.m3u8': () => R(200, '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nv.m3u8\n'),
    'https://b.test/v.m3u8': () => R(403),
    'https://c.test/m.m3u8': () => { throw new TypeError('CORS'); },
    'https://d.test/m.m3u8': () => R(200, '#EXTM3U\n#EXTINF:6,\nx.ts\n'),
    'https://d.test/x.ts': () => R(403),
    'https://e.test/m.m3u8': () => R(200, '<html>geo</html>'),
  };
  const seen = [];
  const k = devKit(async (u) => { seen.push(u); const f = routes[u]; if (!f) throw new TypeError('net'); return f(); });
  assert.equal(await k.devProbe('https://a.test/m.m3u8'), true, 'السلسلة كاملة تنجح');
  assert.deepEqual(seen.slice(0, 3), ['https://a.test/m.m3u8', 'https://a.test/v/low.m3u8', 'https://a.test/v/seg1.ts'], 'مسارات نسبيّة تُحلّ على الرابط');
  assert.equal(await k.devProbe('https://b.test/m.m3u8'), false, 'قائمة الجودة 403');
  assert.equal(await k.devProbe('https://c.test/m.m3u8'), false, 'منع المتصفّح (CORS) = لا يشتغل على hls.js');
  assert.equal(await k.devProbe('https://d.test/m.m3u8'), false, 'المقطع محجوب');
  assert.equal(await k.devProbe('https://e.test/m.m3u8'), false, 'صفحة حجب بدل قائمة');
  k.devMark('https://a.test/m.m3u8', true);
  k.devMark('https://b.test/m.m3u8', false);
  assert.equal(k.devVerdict('https://a.test/m.m3u8'), true);
  assert.equal(k.devVerdict('https://b.test/m.m3u8'), false);
  assert.equal(k.devVerdict('https://none.test/'), null);
  assert.ok(JSON.parse(k.ls.data.tvDevCheck1)['https://a.test/m.m3u8'].ok, 'يُحفظ في الجهاز');
  const old = { 'https://a.test/m.m3u8': { ok: true, at: Date.now() - 13 * 36e5 }, 'https://b.test/m.m3u8': { ok: false, at: Date.now() - 7 * 36e5 } };
  const k2 = devKit(async () => R(404), { tvDevCheck1: JSON.stringify(old) });
  assert.equal(k2.devVerdict('https://a.test/m.m3u8'), null, 'النجاح يتقادم بعد ١٢ ساعة');
  assert.equal(k2.devVerdict('https://b.test/m.m3u8'), null, 'الفشل يتقادم بعد ٦ ساعات');
});

test('١١. مفتاح «يفحص من جهازك» في الـ14 لغة', () => {
  const core = read('js/app-03-i18n-data.js');
  assert.equal((core.match(/\btvDevChecking:/g) || []).length, 2);
  ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh'].forEach((lg) => assert.ok(read('i18n/' + lg + '.js').includes('"tvDevChecking":'), lg));
});

test('١٢. حارس الشبكة: فشل قبل أوّل نجاح لا يُحفظ (انقطاع لا حجب)، وأوّل نجاح يحفظ المعلَّق فشلًا حقيقيًّا', () => {
  const k = devKit(async () => { throw new TypeError('offline'); });
  k.devResult('https://x.test/1', false);
  k.devResult('https://x.test/2', false);
  assert.equal(k.devVerdict('https://x.test/1'), null, 'جهاز بلا شبكة لا يُخفي القائمة');
  assert.equal(k.ls.data.tvDevCheck1, undefined, 'لا شيء محفوظ');
  assert.ok(k.TV_DEV_BUSY['https://x.test/1'], 'لا يُعاد فحصه في الجلسة نفسها');
  k.devResult('https://x.test/ok', true);
  assert.equal(k.devVerdict('https://x.test/ok'), true);
  assert.equal(k.devVerdict('https://x.test/1'), false, 'بعد إثبات الشبكة: المعلَّق فشل حقيقيّ');
  assert.equal(k.devVerdict('https://x.test/2'), false);
  k.devResult('https://x.test/3', false);
  assert.equal(k.devVerdict('https://x.test/3'), false, 'وبعدها يُحفظ الفشل مباشرة');
});
