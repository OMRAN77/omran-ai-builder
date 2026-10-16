// v-social-bot: بوت التسويق — سلسلة «تحدّي 30 موقع» حلقة كلّ يومين: الفكرة من الترند (وإلّا القائمة)،
// رقم الحلقة من سجلّ النشر، والنصّ صادق بالزمن الفعليّ.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const ideas = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'social-bot-ideas.json'), 'utf8'));
const src = fs.readFileSync(path.join(ROOT, 'scripts', 'social-bot.mjs'), 'utf8');
const load = () => import(path.join(ROOT, 'scripts', 'social-bot.mjs'));

test('١) قائمة الأفكار سليمة: اسم + طلب قصير يُكتب على الشاشة + وسوم', () => {
  assert.ok(ideas.length >= 20);
  const names = new Set();
  for (const i of ideas) {
    assert.ok(i.name && i.prompt && Array.isArray(i.tags));
    assert.ok(i.prompt.length <= 100, 'الطلب يُكتب حيًّا في الفيديو فيبقى قصيرًا: ' + i.name);
    assert.ok(i.tags.every((t) => t.startsWith('#') && !/\s/.test(t)));
    assert.ok(!names.has(i.name)); names.add(i.name);
  }
});

test('٢) الفكرة تدور برقم التشغيل، وIDEA_INDEX يغلبه، وتلتفّ بلا خروج عن القائمة', async () => {
  const { pickIdea } = await load();
  assert.equal(pickIdea(ideas, '', '5', 0).idx, 5);
  assert.equal(pickIdea(ideas, '2', '5', 0).idx, 2);
  assert.equal(pickIdea(ideas, undefined, undefined, ideas.length + 3).idx, 3);
  assert.equal(pickIdea(ideas, '-1', '', 0).idx, ideas.length - 1);
});

test('٣) العدد بصيغة عربيّة صحيحة والنصّ يحمل الزمن الفعليّ والرابط', async () => {
  const { secWord, buildCaption } = await load();
  assert.equal(secWord(2), 'ثانيتين');
  assert.equal(secWord(7), '7 ثواني');
  assert.equal(secWord(45), '45 ثانية');
  const c = buildCaption(ideas[0], 45);
  assert.match(c.ig, /45 ثانية/);
  assert.match(c.ig, /الرابط في البايو/);
  assert.match(c.fb, /https:\/\/omran-ai-builder\.vercel\.app\/\?ref=fb/);
  assert.ok(c.ig.includes('#OMAi'));
  assert.ok((c.ig.match(/#/g) || []).length <= 30, 'إنستقرام يقبل 30 وسمًا كحدّ أقصى');
});

test('٤) الزمن في الفيديو هو الزمن المقيس، ولا نشر لموقع هزيل', () => {
  assert.match(src, /m\.secs = Math\.max\(1, Math\.round\(doneAt - m\.send\)\)/);
  assert.match(src, /quality gate/);
  assert.match(src, /DRY_RUN/);
});

test('٥) المونتاج ضمن مدّة الريلز (15–30 ث)', async () => {
  const { timeline } = await load();
  const m = { a0: 0, send: 5 };
  for (const siteH of [1500, 6000]) {
    const tl = timeline(m, siteH);
    assert.ok(tl.total >= 15 && tl.total <= 30, String(tl.total));
  }
});

test('٦) رقم الحلقة من سجلّ النشر: آخر external_id ناجح + 1، والموسم كلّ 30 حلقة', async () => {
  const { seriesFromHistory, epLabel } = await load();
  const st = seriesFromHistory([
    { external_id: 'omai-ep-3', success: true, upload_timestamp: '2026-10-20T16:05:00Z', post_title: '🎬 x\nسوّيت موقع مقهى «رذاذ» كامل في 40 ثانية بس 🤯' },
    { external_id: 'omai-ep-3', success: true, upload_timestamp: '2026-10-20T16:04:00Z', platform: 'facebook' },
    { external_id: 'omai-ep-9', success: false, upload_timestamp: '2026-10-22T16:00:00Z' },
    { external_id: 'other', success: true, upload_timestamp: '2026-10-23T16:00:00Z' },
    { external_id: 'omai-ep-2', success: true, upload_timestamp: '2026-10-18T16:00:00Z' },
  ]);
  assert.equal(st.last, 3);
  assert.equal(st.lastAt, Date.parse('2026-10-20T16:05:00Z'));
  assert.deepEqual(st.names, ['مقهى «رذاذ»']);
  assert.equal(seriesFromHistory([]).last, 0);
  assert.equal(epLabel(1).short, 'الحلقة 1');
  assert.equal(epLabel(30).short, 'الحلقة 30');
  assert.equal(epLabel(31).short, 'الحلقة 1 · الموسم 2');
});

test('٧) كلّ يومين: الجدول يوميّ والحلقة تنزل بعد 36 ساعة من السابقة', async () => {
  const { dueNow } = await load();
  const h = 36e5, last = Date.parse('2026-10-20T16:05:00Z');
  assert.equal(dueNow(0, last), true, 'أوّل حلقة');
  assert.equal(dueNow(last, last + 23.9 * h), false, 'بكرة: لا');
  assert.equal(dueNow(last, last + 47.5 * h), true, 'بعد يومين ولو تأخّر جدول GitHub');
  assert.equal(dueNow(last, last + 70 * h), true, 'فاتت حلقة: تنزل اليوم');
});

test('٨) الترند: عربيّ/إنجليزيّ فقط، والفكرة تُرفض إذا مسّت السياسة/الأشخاص أو خالفت الشكل', async () => {
  const { parseTrendsRss, validTrendIdea, trendAsk } = await load();
  const xml = '<rss><channel><title>Daily Search Trends</title>'
    + '<item><title>الطقس</title><ht:approx_traffic>2000+</ht:approx_traffic><ht:news_item_title>أمطار &amp; رياح</ht:news_item_title></item>'
    + '<item><title>भारतीय टीम</title><ht:approx_traffic>500+</ht:approx_traffic></item>'
    + '<item><title>apple store</title><ht:approx_traffic>1000+</ht:approx_traffic></item></channel></rss>';
  const t = parseTrendsRss(xml);
  assert.deepEqual(t.map((x) => x.title), ['الطقس', 'apple store']);
  assert.equal(t[0].traffic, 2000);
  assert.equal(t[0].news, 'أمطار & رياح');
  const good = { trend: 'الطقس', label: 'أجواء شتوية', name: 'مقهى «رذاذ»', prompt: 'سوّ لي موقع لمقهى «رذاذ» فيه المنيو الشتوي وجلسات خارجية مع حجز وواتساب', tags: ['#شتاء', '#مقهى', 'bad tag'] };
  const v = validTrendIdea(good);
  assert.equal(v.name, 'مقهى «رذاذ»');
  assert.deepEqual(v.tags, ['#شتاء', '#مقهى']);
  assert.equal(v.src, 'trend');
  assert.ok(v.prompt.length <= 100, 'الطلب يُكتب حيًّا في الفيديو');
  assert.equal(validTrendIdea({ ...good, trend: 'strait of hormuz', label: 'مضيق هرمز' }), null);
  assert.equal(validTrendIdea({ ...good, name: 'مقهى رذاذ' }), null, 'الاسم بين «»');
  assert.equal(validTrendIdea({ ...good, prompt: 'موقع مقهى' }), null);
  assert.equal(validTrendIdea({ ...good, prompt: 'سوّ لي موقع لمقهى «غيم» فيه المنيو الشتوي وجلسات خارجية مع حجز وواتساب' }), null, 'الطلب فيه نفس الاسم');
  assert.equal(validTrendIdea(null), null);
  const ask = trendAsk(t, ['مقهى «رذاذ»'], 'الجمعة');
  assert.match(ask, /الطقس \| 2000\+ بحث/);
  assert.match(ask, /لا تكرّر.*مقهى «رذاذ»/);
  assert.match(ask, /السياسة/);
});

test('٩) النصّ يحمل رقم الحلقة والترند وموعد الحلقة الجاية، والنشر يوسم الحلقة', async () => {
  const { buildCaption } = await load();
  const c = buildCaption({ name: 'مقهى «رذاذ»', tags: ['#شتاء'], label: 'أجواء شتوية' }, 40, 5);
  assert.match(c.ig, /^🎬 الحلقة 5 من تحدّي 30 موقع بالذكاء الاصطناعي/);
  assert.match(c.ig, /سوّيت موقع مقهى «رذاذ» كامل في 40 ثانية/);
  assert.match(c.ig, /🔥 الفكرة من ترند اليوم: أجواء شتوية/);
  assert.match(c.ig, /الحلقة 6 بعد يومين/);
  assert.ok(c.ig.includes('#تحدي_30_موقع'));
  assert.ok((c.ig.match(/#/g) || []).length <= 30);
  assert.match(src, /fd\.append\('external_id', EP_ID\(epN\)\)/);
  assert.match(src, /process\.argv\.includes\('--gate'\)/);
});

test('١٠) آخر الفيديو فيه باركود حقيقيّ لرابط المالك (/app?ref=omran) بشعار في الوسط', async () => {
  const { qrSVG, studioHTML } = await load();
  const svg = qrSVG('https://omran-ai-builder.vercel.app/app?ref=omran');
  assert.match(svg, /^<svg[^>]+viewBox="0 0 \d+ \d+"/);
  assert.ok((svg.match(/h1v1h-1z/g) || []).length > 300, 'وحدات الباركود مرسومة');
  const html = studioHTML({ name: 'مقهى «رذاذ»' }, 40, 1);
  assert.match(html, /<div class="qr"><svg/);
  assert.match(html, /الحلقة 2 بعد يومين/);
});
