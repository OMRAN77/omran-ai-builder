// scripts/serp-probe.mjs — v-serp-cards: مجسّ حيّ لبديل بحث جوجل قبل أيّ اشتراك مدفوع. يشغّله المالك على جهازه بمفتاح التجربة المجّانيّة
// (Serper: ٢٥٠٠ رصيد بلا بطاقة) ليرى بالأرقام: هل تطلع أسعار بالدرهم؟ هل روابط التسوّق إلى المتاجر لا إلى جوجل؟ كم بطاقة بصورة؟
// يمرّ بالمسار الحقيقيّ نفسه (cards-search.searchCards مع قراءة صفحات المتاجر)، ولا يطبع المفتاح. كلّ طلب ≈ ١–٣ أرصدة.
//   PowerShell:  $env:SERPER_API_KEY="…"; $env:CARDS_SHOPPING="on"; node scripts/serp-probe.mjs
//   طلبات أخرى:  node scripts/serp-probe.mjs "iPhone 17 Pro" "ثياب مخوّر"
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const S = require('../api/_lib/serp-search.js');
const CS = require('../api/_lib/cards-search.js');

const provider = S.providerOf(process.env);
if (!provider) { console.error('لا مفتاح: ضع SERPER_API_KEY أو SEARCHAPI_API_KEY أو SERPAPI_API_KEY في البيئة أوّلًا.'); process.exit(2); }
const asks = process.argv.slice(2).length ? process.argv.slice(2) : ['iPhone 17 Pro', 'ثياب مخوّر', 'جوال للتصوير'];

/* عدّاد النداءات لكلّ نقطة (التقدير بالأرصدة: عضويّ ١، تسوّق ٢)، وروابط التسوّق الخام لسؤال «متجر أم جوجل؟» */
const calls = { organic: 0, shopping: 0, pages: 0 };
const rawShopHosts = [];
const realFetch = globalThis.fetch;
const fetchCounted = async (url, init) => {
  const u = String(url);
  const r = await realFetch(url, init);
  if (/serper\.dev\/shopping/.test(u)) {
    calls.shopping++;
    try { const d = await r.clone().json(); for (const x of d.shopping || []) { try { rawShopHosts.push(new URL(x.link).hostname); } catch (e) { rawShopHosts.push('(بلا رابط)'); } } } catch (e) { rawShopHosts.push('(ردّ غير JSON)'); }
  } else if (/serper\.dev\/search|searchapi\.io|serpapi\.com/.test(u)) calls.organic++;
  else calls.pages++;
  return r;
};

console.log('المزوّد: ' + provider + ' · التسوّق: ' + (S.shoppingOn(process.env) ? 'مفعّل' : 'مطفأ') + ' · الدولة: AE\n');
let total = 0, aed = 0, googleLinks = 0;
for (const ask of asks) {
  const t0 = Date.now();
  const r = await CS.searchCards(ask, { ask, country: 'AE', enrich: true, kind: 'product', fetch: fetchCounted });
  console.log('▸ «' + ask + '» — ' + r.items.length + ' بطاقة في ' + ((Date.now() - t0) / 1000).toFixed(1) + ' ث');
  for (const c of r.items) {
    total++;
    if (/AED|د\.?\s?إ|درهم/i.test(c.price)) aed++;
    if (/(^|\.)google\./i.test(c.site)) googleLinks++;
    console.log('   ' + (c.price || 'السعر في الموقع').padEnd(14) + ' · ' + c.site.padEnd(24) + ' · صورة: ' + (c.image ? new URL(c.image).hostname : 'لا') + ' · ' + c.title.slice(0, 50));
  }
}
console.log('\nالخلاصة: ' + total + ' بطاقة، ' + aed + ' بسعر بالدرهم، ' + googleLinks + ' برابط جوجل (يجب ٠).');
console.log('النداءات: عضويّ ' + calls.organic + ' · تسوّق ' + calls.shopping + ' (≈ ' + (calls.organic + 2 * calls.shopping) + ' رصيد) · صفحات متاجر ' + calls.pages);
if (rawShopHosts.length) {
  const g = rawShopHosts.filter((h) => /(^|\.)google\./i.test(h)).length;
  console.log('روابط التسوّق الخام: ' + rawShopHosts.length + '، منها ' + g + ' إلى جوجل — ' + (g === rawShopHosts.length ? 'التسوّق لا يعطي روابط متاجر: اتركه مطفأ.' : 'أغلبها متاجر: التسوّق صالح.'));
}
