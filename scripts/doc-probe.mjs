// مجس أدوات المستندات: يختبر التحليل الفعلي بعد الرفع على الإنتاج للأدوات الثلاث
// التي شكا المالك من توقّف تحليلها: التعليم (process) والمصاريف (expense)
// ومساعد المستندات (docqa). نصّ + PDF حقيقي صغير، ونطبع الحالة والزمن والخطأ.
const BASE = process.env.PROBE_BASE || 'https://omran-ai-builder.vercel.app';

// PDF صغير صالح فيه نصّ قابل للاستخراج (فاتورة/محاضرة) — مولّد محليًا.
const PDF_B64 = 'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA1IDAgUiA+PiA+PiAvQ29udGVudHMgNCAwIFIgPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCAzMjEgPj4Kc3RyZWFtCkJUIC9GMSAxNCBUZiA1MCA3NDAgVGQgMTggVEwKKElOVk9JQ0UgLyBMRUNUVVJFIFRFU1QgRE9DVU1FTlQpIFRqIFQqCihUb3RhbCBBbW91bnQ6IDUwMCBBRUQpIFRqIFQqCihSZXN0YXVyYW50IHNwZW5kaW5nOiAyMDAgQUVEKSBUaiBUKgooRnVlbCBhbmQgdHJhbnNwb3J0OiAxNTAgQUVEKSBUaiBUKgooU2hvcHBpbmc6IDE1MCBBRUQpIFRqIFQqCihUb3BpYzogUGhvdG9zeW50aGVzaXMgY29udmVydHMgbGlnaHQgaW50byBjaGVtaWNhbCBlbmVyZ3kuKSBUaiBUKgooQ2hsb3JvcGh5bGwgYWJzb3JicyBsaWdodCBpbiB0aGUgY2hsb3JvcGxhc3QuKSBUaiBUKgpFVAplbmRzdHJlYW0KZW5kb2JqCjUgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCjAwMDAwMDAyNDEgMDAwMDAgbiAKMDAwMDAwMDYxMyAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDYgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjY4MwolJUVPRg==';

const LECTURE_TEXT = 'موضوع المحاضرة: التركيب الضوئي. تحوّل النباتات الخضراء ضوء الشمس إلى طاقة كيميائية داخل البلاستيدات الخضراء بمساعدة صبغة الكلوروفيل. المدخلات: ماء وثاني أكسيد الكربون وضوء. المخرجات: جلوكوز وأكسجين. تتم المرحلة الضوئية في الأغشية الثايلاكويدية ودورة كالفن في الستروما.';
const EXPENSE_TEXT = 'كشف حساب: مطعم 200 درهم، بنزين 150 درهم، تسوّق 150 درهم، فاتورة كهرباء 300 درهم، اشتراك نتفليكس 45 درهم، صيدلية 80 درهم. الإجمالي 925 درهم لشهر يناير.';

async function call(label, body) {
  const t0 = Date.now();
  try {
    const r = await fetch(BASE + '/api/edu', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    const ms = Date.now() - t0;
    let ok = '❌';
    if (body.action === 'process' || body.action === 'explain') ok = (j.ok && j.lesson && j.lesson.summary) ? '✅' : '❌';
    else if (body.action === 'expense') ok = (j.ok && j.report && Array.isArray(j.report.categories)) ? '✅' : '❌';
    else if (body.action === 'docqa') ok = (j.ok && j.doc && j.doc.summary) ? '✅' : '❌';
    const detail = j.error ? ' error="' + String(j.error).slice(0, 90) + '"'
      : (j.lesson ? ' summary=' + String(j.lesson.summary || '').length + 'c flashcards=' + (j.lesson.flashcards || []).length + ' quiz=' + (j.lesson.quiz || []).length
        : (j.report ? ' total=' + j.report.total + ' cats=' + (j.report.categories || []).length
          : (j.doc ? ' type="' + (j.doc.docType || '') + '" fields=' + (j.doc.fields || []).length + ' summary=' + String(j.doc.summary || '').length + 'c' : '')));
    console.log(ok + ' ' + label + ': status=' + r.status + ' ' + ms + 'ms' + detail);
    return { status: r.status, j };
  } catch (e) { console.log('❌ ' + label + ': FAIL ' + String(e.message).slice(0, 90)); return { status: 0, j: {} }; }
}

console.log('BASE=' + BASE + ' @ ' + new Date().toISOString() + '\n=== الأدوات الثلاث بعد نشر الكوميتات (docqa يفترض ✅ الآن) ===');
await call('التعليم / نصّ', { action: 'process', text: LECTURE_TEXT, lang: 'ar' });
await call('التعليم / PDF', { action: 'process', fileBase64: PDF_B64, mime: 'application/pdf', lang: 'ar' });
await call('المصاريف / نصّ', { action: 'expense', text: EXPENSE_TEXT, lang: 'ar' });
await call('المصاريف / PDF', { action: 'expense', fileBase64: PDF_B64, mime: 'application/pdf', lang: 'ar' });
await call('مساعد المستندات / نصّ', { action: 'docqa', text: LECTURE_TEXT, lang: 'ar' });
await call('مساعد المستندات / PDF', { action: 'docqa', fileBase64: PDF_B64, mime: 'application/pdf', lang: 'ar' });
console.log('PROBE DONE');
