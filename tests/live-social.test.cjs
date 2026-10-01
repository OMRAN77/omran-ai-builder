// tests/live-social.test.cjs — v-live-social (طلب المالك أوّل أكتوبر: «معلومات… من الجوجل و… من التواصل الاجتماعي…
// عن كل شي… اريده ai فعلن وليس كلام فقط»، وقراره: «ليس للمجاني فقط المشتركين وانا بلا حد»).
// يثبّت: بحث التواصل (سلسلة المزوّدين بقيد المنصّات، وإسقاط ما ليس اجتماعيًّا)، والدمج بقسمين مع تنبيه الأمانة،
// وسقف المشترك ١٠٠ والمالك بلا حدّ، والتوصيل في chat.js (بالتوازي، والمسارات المخصّصة بلا تواصل، والمجّانيّ بلا أداة)،
// وقاعدة «ابحث في كلّ سؤال معلومة» في وصف الأداة ودور الأدوات وحده.
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'synthetic-test-secret-' + 'x'.repeat(40);
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const CHAT = fs.readFileSync(path.join(root, 'api/_lib/chat.js'), 'utf8');
const ls = require('../api/_lib/live-social.js');

function resp(obj, ok) { const body = JSON.stringify(obj); return { ok: ok !== false, status: ok === false ? 500 : 200, text: async () => body }; }
function withKeys(keys, fn) {
  const saved = {};
  for (const k of ['TAVILY_API_KEY', 'PERPLEXITY_API_KEY', 'GOOGLE_SEARCH_API_KEY', 'GOOGLE_SEARCH_CX']) { saved[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, keys);
  return Promise.resolve().then(fn).finally(() => { for (const k in saved) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });
}

test('١. المنصّات: عشر منصّات عامّة، واسم المنصّة من الرابط', () => {
  assert.equal(ls.SOCIAL_DOMAINS.length, 10, 'حدّ مرشّح النطاقات عند المزوّد');
  for (const d of ['youtube.com', 'reddit.com', 'instagram.com', 'tiktok.com', 'x.com', 'facebook.com']) assert.ok(ls.SOCIAL_DOMAINS.includes(d), d);
  assert.equal(ls.platformOf('https://www.youtube.com/watch?v=1'), 'YouTube');
  assert.equal(ls.platformOf('https://youtu.be/abc'), 'YouTube');
  assert.equal(ls.platformOf('https://twitter.com/a/status/1'), 'X');
  assert.equal(ls.platformOf('https://m.facebook.com/p/1'), 'Facebook');
  assert.equal(ls.platformOf('https://example.com/x'), '');
  assert.equal(ls.platformOf('ليس رابطًا'), '');
});

test('٢. السلسلة: Tavily أوّلًا بقيد المنصّات وأرخص عمق، وما ليس اجتماعيًّا يُسقط', () => withKeys({ TAVILY_API_KEY: 'k' }, async () => {
  let sent = null;
  const out = await ls.socialSearch('ant heart rate', { fetchImpl: async (url, init) => {
    sent = { url, body: JSON.parse(init.body) };
    return resp({ results: [
      { url: 'https://www.reddit.com/r/ants/1', title: 'Ant heartbeat thread', content: 'about 0.5 Hz' },
      { url: 'https://some-blog.com/x', title: 'blog', content: 'not social' },
      { url: 'https://www.youtube.com/watch?v=2', title: 'Ant anatomy', content: 'video' },
    ] });
  } });
  assert.match(sent.url, /api\.tavily\.com\/search/);
  assert.deepEqual(sent.body.include_domains, ls.SOCIAL_DOMAINS);
  assert.equal(sent.body.search_depth, 'basic', 'القسم الاجتماعيّ مكمّل: أرخص عمق');
  assert.match(out, /1\. \[Reddit\] Ant heartbeat thread/);
  assert.match(out, /2\. \[YouTube\] Ant anatomy/);
  assert.ok(!/some-blog/.test(out), 'نتيجة غير اجتماعيّة تُسقط حتّى لو أرجعها المزوّد');
}));

test('٣. السقوط: Tavily فارغ ← Perplexity بمرشّح النطاقات ← Google بـsite:، والكلّ فاشل = null', () => withKeys({ TAVILY_API_KEY: 'k', PERPLEXITY_API_KEY: 'p', GOOGLE_SEARCH_API_KEY: 'g', GOOGLE_SEARCH_CX: 'c' }, async () => {
  const calls = [];
  const out = await ls.socialSearch('best clinic', { fetchImpl: async (url, init) => {
    calls.push(url);
    if (/tavily/.test(url)) return resp({ results: [] });
    if (/perplexity/.test(url)) {
      const b = JSON.parse(init.body);
      assert.deepEqual(b.search_domain_filter, ls.SOCIAL_DOMAINS);
      assert.equal(b.model, 'sonar');
      // ملخّص بلا رابط اجتماعيّ واحد = لا دليل أنّه من التواصل → يسقط للتالي
      return resp({ choices: [{ message: { content: 'summary' } }], search_results: [{ url: 'https://news.com/a', title: 'n' }] });
    }
    assert.match(decodeURIComponent(url), /site:youtube\.com OR site:reddit\.com/);
    return resp({ items: [{ link: 'https://www.tiktok.com/@a/video/1', title: 'clinic review', snippet: 'went there' }] });
  } });
  assert.equal(calls.length, 3);
  assert.match(out, /\[TikTok\] clinic review/);

  const none = await ls.socialSearch('x', { fetchImpl: async () => resp({}, false) });
  assert.equal(none, null);
}));

test('٤. بلا مفاتيح: لا نداء شبكة ولا انفجار', () => withKeys({}, async () => {
  let n = 0;
  assert.equal(await ls.socialSearch('x', { fetchImpl: async () => { n++; return resp({}); } }), null);
  assert.equal(n, 0);
}));

test('٥. الدمج: بلا تواصل = الويب كما هو حرفيًّا؛ ومعه قسمان وتنبيه الأمانة', () => {
  assert.equal(ls.mergeWebSocial('1. web\nhttps://a.com', null), '1. web\nhttps://a.com');
  const m = ls.mergeWebSocial('1. web\nhttps://a.com', '1. [Reddit] t\nhttps://reddit.com/x');
  assert.ok(m.startsWith('🌐 من الويب:\n1. web'));
  assert.match(m, /📱 من التواصل الاجتماعي \(منشورات عامّة\):\n1\. \[Reddit\]/);
  assert.match(m, /تجارب وآراء أفراد لا حقائق موثّقة/);
  assert.match(m, /الصحّة والدواء والمال والقانون/);
  assert.ok(m.indexOf('🌐') < m.indexOf('📱'), 'الويب أوّلًا');
  assert.ok(ls.mergeWebSocial('', 'S').startsWith('📱'), 'ويب فارغ = التواصل وحده');
  assert.ok(!/gemini|claude|gpt|perplexity|tavily/i.test(m), 'لا اسم مزوّد في النصّ المدموج');
});

test('٦. السقف: المشترك ١٠٠ يوميًّا، والرفض نصّ صادق، وعطب العدّاد سماح', async () => {
  assert.equal(ls.SEARCH_DAILY_SUB, 100);
  assert.equal(ls.QUOTA_BUCKET, 'chat-search');
  let seen = null;
  const ok = await ls.searchQuota('tok', '1.2.3.4', { check: async (t, g, ip, bucket, lim) => { seen = { t, g, ip, bucket, lim }; return { allowed: true, remaining: 99 }; } });
  assert.deepEqual(seen, { t: 'tok', g: null, ip: '1.2.3.4', bucket: 'chat-search', lim: 100 });
  assert.deepEqual(ok, { ok: true, left: 99 });
  assert.deepEqual(await ls.searchQuota('tok', 'ip', { check: async () => ({ allowed: false, reason: 'limit' }) }), { ok: false, reason: 'limit' });
  const down = await ls.searchQuota('tok', 'ip', { check: async () => { throw new Error('kv down'); } });
  assert.deepEqual([down.ok, down.degraded], [true, true]);
  assert.match(ls.QUOTA_TEXT, /100 بحث/);
  assert.match(ls.QUOTA_TEXT, /بلا بحث حيّ/, 'يقول للمستخدم إنّ الجواب بلا بحث');
  // المالك وVIP بلا حدّ: العدّاد القائم نفسه يعفيهما قبل أيّ عدّ
  const usage = fs.readFileSync(path.join(root, 'api/_lib/_usage.js'), 'utf8');
  const i = usage.indexOf('async function checkAndConsumeCustom');
  assert.match(usage.slice(i, i + 600), /if \(isOwnerUsername\(username\) \|\| await isVip\(username\)\) \{\n\s+return \{ allowed: true, username, remaining: Infinity \};/);
});

test('٧. التوصيل في chat.js: السقف أوّلًا، ثمّ الويب والتواصل بالتوازي، والمسارات المخصّصة بلا تواصل', () => {
  const i = CHAT.indexOf("const __quota = await __ls.searchQuota(token, clientIp(req));");
  const j = CHAT.indexOf('await Promise.all([\n                  tavilySearch(_q, reC, __plateAsk, country, city),');
  assert.ok(i > 0 && j > i, 'السقف قبل البحث');
  assert.match(CHAT, /if \(!__quota\.ok\) result = __ls\.QUOTA_TEXT;/);
  assert.match(CHAT, /isCuratedSearch\(_q, reC, __plateAsk\) \? Promise\.resolve\(null\) : __ls\.socialSearch\(_q\)/);
  assert.match(CHAT, /result = filterDuplicateUrls\(__ls\.mergeWebSocial\(__web, __social\)\);/);
  // السقف بعد فرعي «سؤال عن التطبيق» و«سقف البحثين» فلا يُعدّ ما لم يُبحث فيه
  assert.ok(CHAT.indexOf('} else if (mySearchNo > 2) {') < i);
  // حارس واحد: الوحدة تُستدعى في حلقة الأدوات وحدها
  assert.equal(CHAT.split("require('./live-social.js')").length - 1, 1);
});

test('٨. المسارات المخصّصة: الأرقام وعقار الإمارات والفنادق بلا تواصل، والأجنبيّ منها يأخذه', () => {
  const s = CHAT.indexOf('function isCuratedSearch(query, reC, plateAsk) {');
  const e = CHAT.indexOf('\n}\n', s);
  const ctx = {
    isForeignAsk: (q) => /london|لندن/i.test(q),
    NUM_ASK_RE: /رقم مميز/,
    isRealEstateAsk: (q) => /عقار|شقة|فيلا للبيع/.test(q),
    HOTEL_ASK_RE: /فندق|hotel/i,
  };
  vm.runInNewContext(CHAT.slice(s, e + 2) + '\nthis.f = isCuratedSearch;', ctx);
  assert.equal(ctx.f('رقم مميز للبيع', null, false), true);
  assert.equal(ctx.f('عقار في دبي', null, false), true);
  assert.equal(ctx.f('عقار في لندن', null, false), false, 'الأجنبيّ يمرّ بالبحث العامّ فيأخذ التواصل');
  assert.equal(ctx.f('المزيد', { layer: 1 }, false), true, 'متابعة سياق العقار');
  assert.equal(ctx.f('فندق في لندن', null, false), true, 'الفنادق مسارها المخصّص في كلّ مكان');
  assert.equal(ctx.f('دقات قلب النملة', null, false), false, 'سؤال المعرفة العامّة يأخذ التواصل');
  assert.equal(ctx.f('x', null, true), true, 'سؤال الأرقام من سياق المحادثة');
});

test('٩. القاعدة: «ابحث في كلّ سؤال معلومة» في وصف الأداة ودور الأدوات وحده؛ والمجّانيّ والمالك كما قرّر', () => {
  const d = CHAT.slice(CHAT.indexOf("name: 'web_search',"), CHAT.indexOf("name: 'fetch_page',"));
  assert.match(d, /ابحث الآن في الإنترنت وفي التواصل الاجتماعي معًا/);
  assert.match(d, /حتّى لو ظننت أنّك تعرف الجواب/);
  assert.match(d, /لا تبحث للتحيّة والمجاملة والكتابة الإبداعيّة/);
  assert.match(d, /إجباري لأي سعر أو خبر/, 'القواعد السابقة باقية');
  // القاعدة في نظام دور الأدوات وحده — لا في الدور الاجتماعيّ القصير ولا في دور بلا أدوات
  const sys = CHAT.slice(CHAT.indexOf('    const system = quietSocialTurn\n'), CHAT.indexOf('    // v-owner-raw2: ما يُرسل فعلًا'));
  assert.equal((sys.match(/SEARCH_RULE_NOTE/g) || []).length, 1);
  assert.match(sys, /\+ ownerKnowledge \+ SEARCH_RULE_NOTE \+ IMAGE_TURN_NOTE/);
  assert.match(sys, /: PERSONA_NOTE \+ '\\n' \+ baseSystem \+ IMAGE_TURN_NOTE \+ VISUAL_GUIDE_NOTE \+ IMAGE_READ;/, 'فرع بلا أدوات بلا القاعدة');
  // سطر الشخصيّة يصل المجّانيّ (بلا أدوات): لا يدفعه إلى «البحث» بعد الآن
  assert.ok(!CHAT.includes('web_search للمعلومات الحية (بحثان كحد أقصى في الرد)'));
  assert.ok(CHAT.includes('web_search (متى وكيف: في وصف الأداة؛ بحثان كحد أقصى في الرد)'));
  // المجّانيّ بلا أدوات كما كان، والمالك خام كما كان
  assert.match(CHAT, /v-tiers: الطبقة المجانية تُبثّ من السلسلة المجانية بلا أدوات/);
  assert.match(CHAT, /const __sysRaw = __rawOwner \? \(siteGuideTurn \? SITE_GUIDE_NOTE\.trim\(\) : ''\) : system;/);
});
