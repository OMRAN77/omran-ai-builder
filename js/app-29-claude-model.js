/* ===== app-29-claude-model — اختيار نموذج كلود (v-claude-models) =====
   طلب المالك ١٣ سبتمبر (لقطة قائمة نماذج Claude Code): «ممكن تضيف هذيل كلهم».
   قائمة في الإعدادات (تحت مزوّد الخدمة) بنماذج كلود التسعة؛ الاختيار يُحفظ محلّيًّا
   ويُرسَل مع كلّ رسالة على مسار كلود فقط (app-18). الخادم يقبل القائمة نفسها حصرًا،
   وإن رفض المفتاح النموذج (404/400 نموذج) رجع للافتراضيّ وأخبر المستخدم في سطر الحالة. */
(function () {
  'use strict';

  var KEY = 'aiapp_claude_model';
  var IDS = ['claude-fable-5-1', 'claude-fable-5', 'claude-opus-5', 'claude-opus-4-8', 'claude-opus-4-7', 'claude-opus-4-6', 'claude-sonnet-5', 'claude-sonnet-4-6', 'claude-haiku-4-5'];
  function isAr() { try { return (localStorage.getItem('aiapp_lang') || 'ar') !== 'en'; } catch (e) { return true; } }
  var HINTS = {
    '': ['الافتراضيّ: Sonnet 5 — الأسرع للمحادثة اليوميّة.', 'Default: Sonnet 5 — fastest for everyday chat.'],
    'claude-fable-5-1': ['الأقوى على الإطلاق؛ أبطأ وأغلى، ويحتاج رصيد API في حساب Anthropic.', 'Most capable; slower and pricier, needs API credits on the Anthropic account.'],
    'claude-fable-5': ['قويّ جدًّا؛ أبطأ وأغلى، ويحتاج رصيد API في حساب Anthropic.', 'Very capable; slower and pricier, needs API credits on the Anthropic account.'],
    'claude-opus-5': ['أدقّ من Sonnet 5 في المهامّ الصعبة، وأبطأ منه.', 'More precise than Sonnet 5 on hard tasks, slower.'],
    'claude-opus-4-8': ['الجيل السابق من Opus؛ متين وأبطأ.', 'Previous-generation Opus; solid, slower.'],
    'claude-opus-4-7': ['الجيل السابق من Opus.', 'Previous-generation Opus.'],
    'claude-opus-4-6': ['الجيل السابق من Opus.', 'Previous-generation Opus.'],
    'claude-sonnet-5': ['توازن السرعة والدقّة — هو الافتراضيّ.', 'Balanced speed and quality — the default.'],
    'claude-sonnet-4-6': ['الجيل السابق من Sonnet.', 'Previous-generation Sonnet.'],
    'claude-haiku-4-5': ['الأسرع والأرخص؛ للأسئلة القصيرة.', 'Fastest and cheapest; for short questions.'],
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
