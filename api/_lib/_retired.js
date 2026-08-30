// api/_lib/_retired.js — نقاط النهاية المتقاعدة.
//
// إخفاء الزر من الواجهة لا يغلق النقطة: المسار يبقى حيًّا ويصرف مفاتيح API
// لمن يعرف عنوانه. وبلا واجهة تصير المشكلة أسوأ لا أهون — لا شكوى مستخدم
// ولا أثر في التطبيق، فقط فاتورة تكتشفها متأخرًا.
//
// أخطرها `docask`: بوابة مفتوحة على Claude بلا أي فحص هوية أو حد.
//
// ملاحظة: المقاولات (construction-*) أُعيدت للعمل بقرار المالك — غير متقاعدة.
const RETIRED = {
  'car-tools': 'أدوات السيارات',
  docqa: 'مساعد المستندات',
  docask: 'أسئلة المستندات',
  gov: 'المعاملات الحكومية',
};

function isRetired(action) {
  return Object.prototype.hasOwnProperty.call(RETIRED, String(action || ''));
}

/**
 * 410 Gone — لا 404. الفرق مقصود: 404 يعني «لم يوجد قط» فيغري بالمحاولة
 * بصيغة أخرى، و410 يعني «كان ولم يعد» فيوقف البحث. ولا يُصرف أي مفتاح.
 */
function retiredResponse(res, action) {
  const label = RETIRED[action] || 'هذه الميزة';
  console.warn('[retired] blocked call to: ' + action);
  res.status(410).json({
    error: 'retired',
    action: action,
    message_ar: label + ' لم تعد متاحة في التطبيق.',
    message_en: 'This feature has been retired.',
  });
}

module.exports = { RETIRED, isRetired, retiredResponse };
