// tests/live-fresh.test.cjs — v-live-fresh (المالك أوّل أكتوبر ٢٠٢٦: «اريد المعلومات التواريخ الجديدة… ما اريد انا ابحث
// اليوم ويعطيني تاريخ قديم»، و«نعم ضيفها» للتواصل في المسارات المخصّصة).
// يثبّت: نافذة البحث (أخبار أسبوع، عروض شهر، والباقي سنة، وبلا قيد إن سأل المستخدم عن الماضي)، وحذف سنة ذاكرة النموذج
// من الاستعلام، وسطر الحداثة بتاريخ اليوم، وتمرير النافذة لكلّ مزوّد بلغته، وتاريخ كلّ منشور، ودمج المسار المخصّص.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const lf = require('../api/_lib/live-fresh.js');
const ls = require('../api/_lib/live-social.js');
const CHAT = fs.readFileSync(path.join(root, 'api/_lib/chat.js'), 'utf8');
const NOW = new Date('2026-10-01T09:00:00Z');

function resp(obj) { const body = JSON.stringify(obj); return { ok: true, status: 200, text: async () => body }; }
function withKeys(keys, fn) {
  const saved = {};
  for (const k of ['TAVILY_API_KEY', 'PERPLEXITY_API_KEY', 'GOOGLE_SEARCH_API_KEY', 'GOOGLE_SEARCH_CX']) { saved[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, keys);
  return Promise.resolve().then(fn).finally(() => { for (const k in saved) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });
}

test('١. السنوات: الأرقام العربيّة والفارسيّة واللاتينيّة سواء', () => {
  assert.deepEqual(lf.yearsIn('كأس ٢٠٢٢ و۲۰۱۸ و2010 و12345'), [2022, 2018, 2010]);
  assert.equal(lf.normDigits('٢٠٢٦'), '2026');
});

test('٢. النافذة: أخبار أسبوع، عروض شهر، والباقي سنة؛ وسؤال الماضي بلا قيد', () => {
  assert.equal(lf.searchWindow({ userText: 'كم دقة قلب النملة', now: NOW }), 'year');
  assert.equal(lf.searchWindow({ fresh: true, userText: 'آخر الأخبار', now: NOW }), 'week');
  assert.equal(lf.searchWindow({ deals: true, userText: 'عروض جوالات', now: NOW }), 'month');
  assert.equal(lf.searchWindow({ userText: 'من فاز بكأس العالم ٢٠٢٢', now: NOW }), '', 'سنة قديمة في كلام المستخدم');
  assert.equal(lf.searchWindow({ deals: true, userText: 'عروض العام الماضي', now: NOW }), '', 'كلمة ماضٍ صريحة');
  assert.equal(lf.searchWindow({ userText: 'أغاني زمان', now: NOW }), '');
  assert.equal(lf.searchWindow({ userText: 'خطة 2026', now: NOW }), 'year', 'سنة اليوم ليست ماضيًا');
  assert.equal(lf.searchWindow({ fresh: true, userText: 'أخبار 2024', now: NOW }), 'week', 'الأخبار تبقى أسبوعًا كما كانت');
});

test('٣. سنة ذاكرة النموذج: تُحذف إن لم يذكرها المستخدم، وتبقى إن ذكرها أو كانت تاريخًا بعيدًا', () => {
  assert.equal(lf.stripStaleYears('gold price Dubai 2024', 'كم سعر الذهب', NOW), 'gold price Dubai');
  assert.equal(lf.stripStaleYears('best phones in 2025', 'افضل جوال', NOW), 'best phones');
  assert.equal(lf.stripStaleYears('أفضل الجوالات لعام 2025', 'افضل جوال', NOW), 'أفضل الجوالات');
  assert.equal(lf.stripStaleYears('World Cup 2022 winner', 'من فاز بكأس العالم ٢٠٢٢', NOW), 'World Cup 2022 winner');
  assert.equal(lf.stripStaleYears('Apple founded 1976', 'متى تأسست ابل', NOW), 'Apple founded 1976');
  assert.equal(lf.stripStaleYears('plan 2026', 'خطة', NOW), 'plan 2026', 'سنة اليوم تبقى');
  assert.equal(lf.stripStaleYears('2024', 'x', NOW), '2024', 'لا استعلام فارغ');
});

test('٤. سطر الحداثة: تاريخ اليوم بمنطقة جهاز المستخدم، والنافذة، ولا قديم كأنّه جديد', () => {
  const late = new Date('2026-09-30T21:30:00Z');
  assert.equal(lf.todayIn('Asia/Dubai', late), '2026-10-01', 'دبي تجاوزت منتصف الليل');
  assert.equal(lf.todayIn('America/New_York', late), '2026-09-30');
  assert.equal(lf.todayIn('not a zone', late), '2026-09-30', 'منطقة غير صالحة = UTC');
  const n = lf.freshNote('year', 'Asia/Dubai', late);
  assert.match(n, /^\n\n\[الحداثة — إلزاميّ\]: اليوم 2026-10-01، والبحث مقيّد بـآخر سنة\./);
  assert.match(n, /لا تقدّم معلومة قديمة كأنّها جديدة/);
  assert.match(lf.freshNote('week', '', NOW), /آخر أسبوع/);
  assert.match(lf.freshNote('', '', NOW), /^\n\n\[التاريخ\]: اليوم 2026-10-01\. اذكر تاريخ كلّ معلومة/);
  assert.ok(!/gemini|claude|gpt|perplexity|tavily|google/i.test(n + lf.freshNote('', '', NOW)), 'لا اسم مزوّد');
});

test('٥. نصّ المستخدم: آخر ثلاث رسائل له وحده، نصًّا أو كتلًا', () => {
  const m = [{ role: 'user', content: 'a' }, { role: 'user', content: 'b' }, { role: 'assistant', content: '2024' },
    { role: 'user', content: [{ type: 'text', text: 'c' }, { type: 'image' }] }, { role: 'user', content: 'd' }];
  assert.equal(lf.userTextOf(m, 3), 'b\nc\nd');
  assert.equal(lf.userTextOf(null, 3), '');
});

test('٦. التواصل: النافذة تصل كلّ مزوّد بلغته، وتاريخ كلّ منشور بجانبه', () => withKeys({ TAVILY_API_KEY: 't', PERPLEXITY_API_KEY: 'p', GOOGLE_SEARCH_API_KEY: 'g', GOOGLE_SEARCH_CX: 'c' }, async () => {
  const seen = {};
  const out = await ls.socialSearch('gold', { recency: 'year', fetchImpl: async (url, init) => {
    if (/tavily/.test(url)) { seen.tavily = JSON.parse(init.body); return resp({ results: [] }); }
    if (/perplexity/.test(url)) { seen.pplx = JSON.parse(init.body); return resp({ choices: [{ message: { content: 's' } }], search_results: [{ url: 'https://news.com/a' }] }); }
    seen.google = decodeURIComponent(url);
    return resp({ items: [{ link: 'https://www.instagram.com/p/1', title: 'gold shop', snippet: 'x', pagemap: { metatags: [{ 'article:published_time': '2026-09-28T10:00:00Z' }] } }] });
  } });
  assert.equal(seen.tavily.time_range, 'year');
  assert.equal(seen.pplx.search_recency_filter, 'year');
  assert.match(seen.google, /&dateRestrict=y1/);
  assert.match(out, /\[Instagram\] gold shop \(2026-09-28\)/);
  // بلا نافذة (سؤال الماضي): لا قيد عند أيّ مزوّد
  const bare = {};
  await ls.socialSearch('gold', { fetchImpl: async (url, init) => {
    if (/tavily/.test(url)) { bare.tavily = JSON.parse(init.body); return resp({ results: [] }); }
    if (/perplexity/.test(url)) { bare.pplx = JSON.parse(init.body); return resp({}); }
    bare.google = decodeURIComponent(url); return resp({});
  } });
  assert.equal(bare.tavily.time_range, undefined);
  assert.equal(bare.pplx.search_recency_filter, undefined);
  assert.ok(!/dateRestrict/.test(bare.google));
  // تاريخ غير صالح لا يُخمَّن
  const t = await ls.socialSearch('x', { chain: [async () => null, ls.viaTavily], fetchImpl: async () => resp({ results: [{ url: 'https://www.tiktok.com/@a/video/1', title: 'v', published_date: 'not a date' }] }) });
  assert.match(t, /\[TikTok\] v\nhttps/);
}));

test('٧. دمج المسار المخصّص: قائمته كما هي حرفيًّا أوّلًا، ثمّ قسم التواصل بأمر عرضه', () => {
  const list = '1. إكس بليت — سوق\nhttps://www.xplate.com/\n\nالمصدر: … ولا تذكر أي موقع آخر';
  const m = ls.mergeWebSocial(list, '1. [Instagram] plate 777\nhttps://www.instagram.com/p/1', { curated: true });
  assert.ok(m.startsWith(list + '\n\n📱 من التواصل الاجتماعي (منشورات عامّة):\n1. [Instagram]'), 'القائمة حرفيًّا وبلا عنوان «من الويب»');
  assert.match(m, /تخصّ القائمة أعلاه ولا تمنع هذا القسم/);
  assert.match(m, /ألّا يُدفع مال لصاحب منشور قبل التحقّق/);
  assert.equal(ls.mergeWebSocial(list, null, { curated: true }), list, 'بلا تواصل = القائمة وحدها');
});

test('٨. chat.js: النافذة تصل محرّكات الويب الثلاثة ومسار العروض، والأخبار كما كانت', () => {
  assert.match(CHAT, /function winOf\(query, win\) \{ return win === undefined \? \(FRESH_RE\.test\(String\(query \|\| ''\)\) \? 'week' : ''\) : win; \}/);
  assert.match(CHAT, /async function pplxSearch\(query, win\)/);
  assert.match(CHAT, /'اليوم ' \+ new Date\(\)\.toISOString\(\)\.slice\(0, 10\) \+ ': قدّم أحدث معلومة متاحة بتاريخها/);
  assert.match(CHAT, /async function gcseSearch\(query, win\)/);
  assert.match(CHAT, /winOf\(query, win\) === 'week' \? '&dateRestrict=m1&sort=date'/);
  assert.match(CHAT, /async function tavilyRaw\(query, foreign, win\)/);
  assert.match(CHAT, /fresh \? \{ topic: 'news', days: 7 \} : \(w \? \{ time_range: w \} : \{\}\),/);
  assert.match(CHAT, /include_answer:true, country: dealsCountry \}, win \? \{ time_range: win \} : \{\}\)\)/);
  assert.match(CHAT, /\['perplexity', function\(\)\{ return pplxSearch\(query, win\); \}\]/);
  assert.match(CHAT, /\['tavily', function\(\)\{ return tavilyRaw\(query, foreign, win\); \}\]/);
  assert.match(CHAT, /const live = await liveSearch\(query, foreign, country, city, win\);/);
  // حلقة الأدوات: الاستعلام المنظَّف والنافذة لكلا البحثين، وسطر الحداثة لغير المخصّص
  assert.match(CHAT, /const __sq = __lf\.stripStaleYears\(_q, __said\);/);
  assert.match(CHAT, /tavilySearch\(__sq, reC, __plateAsk, country, city, __win, [^\n]+\),\n\s+__ls\.socialSearch\(__sq, \{ recency: __win \}\),/); // v-loc-offers: + طلب الموقع
  assert.match(CHAT, /\+ \(__curated \? '' : __lf\.freshNote\(__win, body && body\.tz\)\);/);
  // بطاقات الأماكن قائمة مخصّصة تُعرف بعلامتها
  assert.match(CHAT, /return cards \+ '\\n\\n' \+ PLACES_MARK \+ ': اختر/);
});
