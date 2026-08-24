/* js/app-22-screen-guide-ui.js — المرشد البصري: مشاركة مباشرة من الهاتف فقط
 *
 * الربط الأساسي صار في مسار الإرسال العادي (app-09-attach.js):
 *   ترفق صورة + تسأل = يرشدك بدون أي زر إضافي.
 *
 * هنا فقط: Share Target — المستخدم يضغط "مشاركة" على لقطة شاشة من هاتفه
 * فتُستقبَل في عمران AI مباشرة عبر sw.js وتُحقن في المحادثة.
 */
(function () {
  'use strict';

  window.addEventListener('sg:shared-screenshot', function (ev) {
    var file = ev.detail && ev.detail.file;
    if (!file) return;

    // حقن الصورة في pendingAttachments تمامًا كما لو رفعها المستخدم بنفسه
    var reader = new FileReader();
    reader.onload = function (e) {
      var dataUrl = e.target.result;
      if (!dataUrl) return;
      if (typeof pendingAttachments !== 'undefined' && typeof renderAttachStrip === 'function') {
        pendingAttachments.push({ name: 'shared-screenshot.jpg', isImage: true, mime: file.type || 'image/jpeg', dataUrl: dataUrl });
        renderAttachStrip();
        // ركّز على خانة الكتابة ليكتب هدفه مباشرة
        try { document.getElementById('prompt').focus(); } catch (_) { /* guard-ok: التركيز على خانة الكتابة تحسين اختياري */ }
      }
    };
    reader.readAsDataURL(file);
  });

})();
