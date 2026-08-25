// v-chat-ref — الحارس السلوكي لعلّة «country is not defined»:
// tavilySearch كان يقرأ country/city كمتغيّرين حرّين لا وجود لهما خارج معالج
// الطلب، فأيّ بحث لا تختصره بطاقات الأماكن كان يرمي ReferenceError ويقتل
// البثّ كلّه. الاختبار يستدعي الدالّة الحقيقيّة بلا مفاتيح بيئة: يجب أن تعود
// بجملة «تعذّر البحث» لا أن ترمي.
const assert = require('node:assert');

// chat.js يجرّ memory.js الذي يشترط AUTH_SECRET عند التحميل — قيمة اختبار تكفي.
process.env.AUTH_SECRET = 't'.repeat(64);

// بيئة نظيفة: لا مفاتيح بحث، فكلّ مزوّد يرجع null والسلسلة تنتهي بسلام.
delete process.env.TAVILY_API_KEY;
delete process.env.PERPLEXITY_API_KEY;
delete process.env.GOOGLE_SEARCH_API_KEY;
delete process.env.GOOGLE_SEARCH_CX;
delete process.env.GOOGLE_PLACES_API_KEY;

const { __vsearch } = require('../api/_lib/chat.js');
assert.ok(__vsearch && typeof __vsearch.tavilySearch === 'function', 'tavilySearch مُصدَّرة للاختبار');

(async () => {
  // سؤال حيّ عاديّ لا تلتقطه بطاقات الأماكن ولا مسارا اللوحات والعقار.
  let out;
  try {
    out = await __vsearch.tavilySearch('توقيت الصلاة في عجمان', null, false, 'AE', 'Ajman');
  } catch (e) {
    assert.fail('tavilySearch رمت بدل أن تعود بنتيجة: ' + (e && e.message));
  }
  assert.ok(typeof out === 'string' && out.length > 0, 'تعود دائمًا بنصّ');
  console.log('  ✓ بحث بلا مفاتيح يعود بنصّ لا برمية: ' + out.slice(0, 60));

  // الوسيطان الجديدان اختياريّان — استدعاء قديم بلا دولة/مدينة لا يرمي أيضًا.
  try {
    out = await __vsearch.tavilySearch('سؤال عامّ آخر', null, false);
  } catch (e) {
    assert.fail('الاستدعاء بلا country/city رمى: ' + (e && e.message));
  }
  console.log('  ✓ الاستدعاء بلا country/city آمن');

  // 📚 ويكيبيديا العربية: نجاحها يعيد خلاصة بعنوان ورابط، وفشلها null صامت.
  const realFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    text: async () => JSON.stringify({ query: { pages: { 123: {
      title: 'عجمان', extract: 'عجمان إحدى إمارات دولة الإمارات العربية المتحدة السبع.',
      fullurl: 'https://ar.wikipedia.org/wiki/عجمان',
    } } } }),
  });
  const wiki = await __vsearch.arWikiLookup('عجمان');
  assert.ok(wiki && wiki.includes('من ويكيبيديا العربية — عجمان') && wiki.includes('ar.wikipedia.org'), 'خلاصة ويكيبيديا بعنوانها ورابطها');
  console.log('  ✓ ويكيبيديا العربية تُجلب: ' + wiki.split('\n')[0]);
  global.fetch = async () => { throw new Error('down'); };
  assert.equal(await __vsearch.arWikiLookup('أي شيء'), null, 'فشل ويكيبيديا صامت null');
  console.log('  ✓ فشل ويكيبيديا صامت لا يعطّل السلسلة');
  global.fetch = realFetch;

  console.log('chat search ref tests passed');
})();
