// مِجسّ المحادثة: يرسل سؤالًا حيًّا إلى /api/ai?action=chat على الإنتاج ويقيس
// المسار الحقيقي: هل بحث؟ متى وصلت أول كلمة؟ كم استغرق الردّ كاملًا؟ وما نصّه؟
// يكشف ما لا تراه الواجهة: ردّ بلا بحث = النموذج تجاهل الأداة أو المسار سقط
// إلى المزوّد القديم بلا أدوات.
//
// USAGE: node scripts/chat-probe.mjs [base] ["السؤال"]
const base = (process.argv[2] || 'https://omran-ai-builder.vercel.app').replace(/\/+$/, '');
const q = process.argv[3] || 'توقيت الصلاة في عجمان';

const t0 = Date.now();
const el = () => String(Date.now() - t0).padStart(6, ' ') + 'ms';

const res = await fetch(base + '/api/ai?action=chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: [{ role: 'user', content: q }],
    provider: 'claude',
    guestId: 'probe-' + Math.random().toString(36).slice(2, 10),
  }),
});
console.log(el(), 'HTTP', res.status, res.headers.get('content-type') || '');
if (!res.ok || !res.body) {
  console.log('جسم الخطأ:', (await res.text()).slice(0, 300));
  process.exit(1);
}

const reader = res.body.getReader();
const dec = new TextDecoder();
let buf = '', full = '', firstDelta = 0, statuses = [], searched = false;
for (;;) {
  const c = await reader.read();
  if (c.done) break;
  buf += dec.decode(c.value, { stream: true });
  const lines = buf.split('\n');
  buf = lines.pop();
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    let ev; try { ev = JSON.parse(line.slice(6)); } catch (e) { continue; }
    if (ev.status) {
      statuses.push(ev.status);
      if (/يبحث|بحثتُ/.test(ev.status)) searched = true;
      console.log(el(), 'status:', String(ev.status).slice(0, 90));
    }
    if (ev.delta) {
      if (!firstDelta) { firstDelta = Date.now() - t0; console.log(el(), '⚡ أوّل كلمة'); }
      full += ev.delta;
    }
    if (ev.patch) { console.log(el(), 'patch (تنقية) بطول', ev.patch.length); full = ev.patch; }
    if (ev.error) console.log(el(), '✗ error:', ev.error);
    if (ev.done) console.log(el(), 'done');
  }
}
console.log('\n─── القياس ───');
console.log('أوّل كلمة بعد:', firstDelta, 'ms');
console.log('الردّ كاملًا بعد:', Date.now() - t0, 'ms');
console.log('استخدم البحث:', searched ? '✅ نعم' : '❌ لا');
console.log('طول الردّ:', full.length, 'حرفًا');
console.log('\n─── نصّ الردّ (أول ٧٠٠ حرف) ───\n' + full.slice(0, 700));
if (!searched && /مواقيت|صلاة|سعر|طقس/.test(q)) {
  console.log('\n⚠️ سؤال حيّ أُجيب بلا بحث — هذا هو الخلل المبلَّغ.');
  process.exitCode = 2;
}

// 🖼️ فحص بحث الصور على الإنتاج — الشكوى المقيسة: «صور هواتف هواوي» صفر صور.
try {
  const si = await fetch(base + '/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'هواتف هواوي', images: true, lang: 'ar', guestId: 'probe-img-' + Math.random().toString(36).slice(2, 8) }),
  });
  const sj = si.ok ? await si.json() : null;
  const n = sj && Array.isArray(sj.images) ? sj.images.length : -1;
  console.log('\n🖼️ بحث الصور («هواتف هواوي»): ' + (n > 0 ? ('✅ ' + n + ' صور') : ('✗ ' + (n === 0 ? 'صفر صور' : 'HTTP ' + si.status))));
  if (n === 0) process.exitCode = process.exitCode || 4;
} catch (e) { console.log('\n🖼️ بحث الصور: ✗ ' + e.message); }

// 📍 فحص الترميز الجغرافي العكسي على الإنتاج (إحداثيات عجمان الثابتة —
// ليست موقع أحد، فلا خصوصية تُمسّ).
try {
  const rg = await fetch(base + '/api/system?action=revgeo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat: 25.4052, lon: 55.5136 }),
  });
  const j = rg.ok ? await rg.json() : null;
  if (j && j.label) console.log('\n📍 revgeo: ✅ ' + j.label + ' (' + j.src + ')');
  else { console.log('\n📍 revgeo: ✗ HTTP ' + rg.status); process.exitCode = process.exitCode || 3; }
} catch (e) { console.log('\n📍 revgeo: ✗ ' + e.message); process.exitCode = process.exitCode || 3; }
