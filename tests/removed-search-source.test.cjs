const fs = require('node:fs');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const search = fs.readFileSync('api/_lib/search.js', 'utf8');
const maha = fs.readFileSync('js/app-08-maha.js', 'utf8');
const bundle = fs.readFileSync('js/app.bundle.js', 'utf8');

function sliceBetween(source, startText, endText) {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start + startText.length);
  assert.ok(start >= 0 && end > start, `تعذّر استخراج ${startText}`);
  return source.slice(start, end);
}

const serverGuard = vm.runInNewContext(`(() => {
  ${sliceBetween(search, 'const REMOVED_SOURCE_HOST', '/**')}
  return { isRemovedSearchSource, withoutRemovedSearchSources, withoutRemovedSourceMentions };
})()`, { URL });
const clientGuard = vm.runInNewContext(`(() => {
  ${sliceBetween(maha, 'const REMOVED_SEARCH_SOURCE_HOST', 'async function fetchSearchNoteOnce')}
  return { isAllowedSearchSource, withoutRemovedSearchSourceMentions };
})()`, { URL });

const removed = { url: 'https://news.google.com/articles/example' };
const removedSubdomain = { url: 'https://ar.news.google.com/example' };
const allowed = { url: 'https://example.com/article' };
assert.equal(serverGuard.isRemovedSearchSource(removed), true);
assert.equal(serverGuard.isRemovedSearchSource(removedSubdomain), true);
assert.deepEqual(serverGuard.withoutRemovedSearchSources([removed, allowed]).map(x => x.url), [allowed.url]);
assert.equal(clientGuard.isAllowedSearchSource(removed), false);
assert.equal(clientGuard.isAllowedSearchSource(removedSubdomain), false);
assert.equal(clientGuard.isAllowedSearchSource(allowed), true);
assert.equal(serverGuard.withoutRemovedSourceMentions('المصدر https://news.google.com/articles/x الآن'), 'المصدر الآن');
assert.equal(clientGuard.withoutRemovedSearchSourceMentions('افتح news.google.com للمزيد'), 'افتح للمزيد');
assert.ok(search.includes('mergedResults = withoutRemovedSearchSources(mergedResults)'), 'البحث الموسّع يطبّق الحظر');
assert.ok(search.includes('data.results = withoutRemovedSearchSources(data.results)'), 'البحث العادي يطبّق الحظر');
assert.ok(maha.includes('data.sources.filter(isAllowedSearchSource)'), 'بطاقات الواجهة تطبّق الحظر');

assert.ok(!search.includes('https://news.google.com/rss/'), 'أزيل نداء المزوّد المباشر');
assert.ok(!search.includes('newsItems') && !search.includes('newsResp'), 'أزيل جمع المزوّد وإرجاعه');
assert.ok(!maha.includes('data.news'), 'الواجهة لا تقرأ المصدر المحذوف');
assert.ok(!bundle.includes('[Google News]') && !bundle.includes('(Google News)'), 'الحزمة بلا تسمية ظاهرة للمصدر');

console.log('✅ المصدر المحذوف غائب من المزود والنتائج والواجهة');
