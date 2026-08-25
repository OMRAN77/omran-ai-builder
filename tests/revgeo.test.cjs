// 📍 اختبار الترميز الجغرافي العكسي وأسلاك أداة get_location.
// يشغّل المعالج الحقيقي بشبكة مزيّفة: نجاح المزوّد الأوّل، السقوط للثاني،
// فشل الاثنين، ومدخلات فاسدة — ثم يتأكد أن الأسلاك موصولة في الخادم والعميل.
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const handler = require('../api/_lib/revgeo.js');

function mockRes() {
  const r = { code: 0, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}
const req = (body, method) => ({ method: method || 'POST', body });

const realFetch = global.fetch;
function stubFetch(impl) { global.fetch = impl; }

(async () => {
  // ① v-geo-osm-first: حين ينجح الاثنان يفوز Nominatim (أدقّ حدودًا — قِيس أن
  //   BigDataCloud لصق نقطة قرب الحدود بأم القيوين وصاحبها في عجمان).
  stubFetch(async (url) => ({
    ok: true,
    json: async () => (String(url).includes('bigdatacloud')
      ? { locality: 'أم القيوين', city: 'أم القيوين', principalSubdivision: 'أم القيوين', countryName: 'الإمارات' }
      : { address: { suburb: 'الراشدية', city: 'عجمان', state: 'عجمان', country: 'الإمارات' } }),
  }));
  let res = mockRes();
  await handler(req({ lat: 25.4052, lon: 55.5136 }), res);
  assert.equal(res.code, 200);
  assert.ok(res.body.src === 'nominatim' && res.body.label.includes('الراشدية'), 'OSM يفوز عند نجاح الاثنين');
  console.log('  ✓ OSM أولًا (الأدق حدودًا): ' + res.body.label);

  // ② سقوط Nominatim ← BigDataCloud احتياطًا.
  stubFetch(async (url) => {
    if (String(url).includes('nominatim')) return { ok: false };
    return { ok: true, json: async () => ({ locality: 'النعيمية', city: 'عجمان', principalSubdivision: 'عجمان', countryName: 'الإمارات العربية المتحدة' }) };
  });
  res = mockRes();
  await handler(req({ lat: 25.4, lon: 55.5 }), res);
  assert.equal(res.code, 200);
  assert.ok(res.body.label.includes('النعيمية') && res.body.src === 'bigdatacloud');
  console.log('  ✓ السقوط إلى الاحتياط يعمل');

  // ③ الاثنان يسقطان ← 502 واضحة لا رمية ولا صمت.
  stubFetch(async () => { throw new Error('network down'); });
  res = mockRes();
  await handler(req({ lat: 25.4, lon: 55.5 }), res);
  assert.equal(res.code, 502);
  assert.equal(res.body.error, 'revgeo_unavailable');
  console.log('  ✓ سقوط المزوّدين معًا يرجع 502 مسمّاة');

  // ④ مدخلات فاسدة ← 400 قبل أي نداء شبكة.
  let called = false;
  stubFetch(async () => { called = true; return { ok: false }; });
  for (const bad of [{ lat: 'x', lon: 55 }, { lat: 95, lon: 55 }, { lat: 25, lon: 181 }, {}]) {
    res = mockRes();
    await handler(req(bad), res);
    assert.equal(res.code, 400, 'رفض ' + JSON.stringify(bad));
  }
  assert.equal(called, false, 'لا نداء شبكة لمدخلات فاسدة');
  console.log('  ✓ الإحداثيات الفاسدة تُرفض 400 بلا نداء شبكة');

  // ⑤ غير POST ← 405.
  res = mockRes();
  await handler(req(null, 'GET'), res);
  assert.equal(res.code, 405);
  console.log('  ✓ غير POST يُرفض 405');

  global.fetch = realFetch;

  // ⑥ الأسلاك: المسار مسجّل، والأداة معرّفة في الخادم، والعميل ينفّذها بلا حفظ إحداثيات.
  const sys = fs.readFileSync(path.join(__dirname, '../api/system.js'), 'utf8');
  const chat = fs.readFileSync(path.join(__dirname, '../api/_lib/chat.js'), 'utf8');
  const agent = fs.readFileSync(path.join(__dirname, '../js/app-17-agent-tools.js'), 'utf8');
  assert.ok(sys.includes("case 'revgeo': return require('./_lib/revgeo.js');"), 'revgeo على مسار system');
  assert.ok(chat.includes("name: 'get_location'"), 'أداة get_location معرّفة للنموذج');
  assert.ok(chat.includes("runInClient(send, 'get_location'"), 'الأداة تُنفَّذ في متصفّح المستخدم');
  assert.ok(agent.includes("if (name === 'get_location')"), 'العميل ينفّذ get_location');
  assert.ok(agent.includes('getCurrentPosition'), 'التحديد عبر geolocation المتصفّح لا الخادم');
  assert.ok(agent.includes('رفض المستخدم إذن الموقع'), 'رسالة واضحة عند رفض الإذن');
  assert.ok(agent.includes('تقريبيّ فقط') && agent.includes('gacc > 3000'), 'الدقة الخشنة تُعلَن تقريبية لا يقينًا زائفًا');
  assert.ok(agent.includes('gacc > 200') && agent.includes('عبر الشبكة لا عبر GPS'), 'تحديد الشبكة (كمبيوتر بلا GPS) يُعلَن كذلك ولو ادّعى دقة جيدة');
  assert.ok(agent.includes('function geoTrail') && agent.includes("geoTrail('رفض-الإذن')"), 'كل استدعاء موقع يترك أثرًا في سلسلة التشخيص');
  assert.ok(!/geoTrail\([^)]*(glat|glon|latitude|longitude)/.test(agent), 'أثر التشخيص لا يحمل إحداثيات أبدًا');
  assert.ok(chat.includes('اذكر التعارض صراحةً'), 'تناقض موقع الأداة مع دولة الشبكة يُعلَن (VPN) لا يُجزَم به');
  const chatSrc = chat;
  assert.ok(chatSrc.includes('فممنوع الجواب منها؛ استدعِ get_location'), 'سؤال «وين أنا» لا يُجاب من مدينة الشبكة أبدًا');
  const geoBlock = agent.slice(agent.indexOf("if (name === 'get_location')"), agent.indexOf('أداة غير معروفة'));
  assert.ok(!/localStorage|sessionStorage/.test(geoBlock), 'لا حفظ للإحداثيات في أي مخزن دائم');
  console.log('  ✓ الأسلاك موصولة: خادم + نموذج + متصفّح، بلا تخزين');

  console.log('revgeo tests passed');
})().catch((e) => { global.fetch = realFetch; console.error(e); process.exit(1); });
