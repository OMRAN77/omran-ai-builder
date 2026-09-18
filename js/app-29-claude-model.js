/* ===== app-29-claude-model — اختيار نموذج كلود (v-claude-models) =====
   v-models-two (أمر عمران ١٤ سبتمبر): القائمة محصورة في Opus 5 + Sonnet 5، والاختيار
   انتقل من الإعدادات إلى قائمة «+» للمالك (modes.js). الاختيار يُحفظ محلّيًّا ويُرسَل مع
   كلّ رسالة على مسار كلود فقط (app-18). الخادم يقبل القائمة نفسها حصرًا وللمالك وحده،
   وإن رفض المفتاح النموذج (404/400 نموذج) رجع للافتراضيّ وأخبر المستخدم في سطر الحالة. */
(function () {
  'use strict';

  var KEY = 'aiapp_claude_model';
  /* v-models-family (أمر عمران ١٥ سبتمبر): عائلة كلود ٥ كاملة — الاختيار من منتقي السهم للمالك. */
  var IDS = ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5', 'claude-fable-5-1'];
  function isAr() { try { return (localStorage.getItem('aiapp_lang') || 'ar') !== 'en'; } catch (e) { return true; } }
  var HINTS = {
    '': ['الافتراضيّ: Sonnet 5 — الأسرع للمحادثة اليوميّة.', 'Default: Sonnet 5 — fastest for everyday chat.'],
    'claude-opus-5': ['أدقّ من Sonnet 5 في المهامّ الصعبة، وأبطأ منه.', 'More precise than Sonnet 5 on hard tasks, slower.'],
    'claude-sonnet-5': ['توازن السرعة والدقّة — هو الافتراضيّ.', 'Balanced speed and quality — the default.'],
    'claude-haiku-4-5': ['الأسرع والأخفّ — للردود القصيرة السريعة.', 'Fastest and lightest — for quick short replies.'],
    'claude-fable-5-1': ['للكتابة الإبداعيّة والحوار الطبيعيّ.', 'For creative writing and natural dialogue.'],
  };

  function get() {
    try { var v = localStorage.getItem(KEY) || ''; return IDS.indexOf(v) === -1 ? '' : v; } catch (e) { return ''; }
  }
  function set(v) {
    v = IDS.indexOf(v) === -1 ? '' : v;
    try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch (e) { /* guard-ok — التخزين المحلّيّ قد يكون مقفلًا */ }
    return v;
  }
  function hint() {
    var box = document.getElementById('claudeModelHint');
    if (!box) return;
    var h = HINTS[get()] || HINTS[''];
    box.textContent = isAr() ? h[0] : h[1];
  }
  function sync() {
    var sel = document.getElementById('claudeModel');
    if (sel) sel.value = get();
    hint();
  }

  document.addEventListener('change', function (e) {
    var el = e && e.target;
    if (!el || el.id !== 'claudeModel') return;
    el.value = set(el.value);
    hint();
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync); else sync();

  window.claudeModelGet = get;
  window.claudeModelSync = sync;
  window.CLAUDE_MODEL_IDS = IDS.slice();
})();
