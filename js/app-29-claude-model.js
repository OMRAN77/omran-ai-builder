/* ===== app-29-claude-model — اختيار نموذج كلود (v-claude-models) =====
   v-models-two (أمر عمران ١٤ سبتمبر): القائمة محصورة في Opus 5 + Sonnet 5، والاختيار
   انتقل من الإعدادات إلى قائمة «+» للمالك (modes.js). الاختيار يُحفظ محلّيًّا ويُرسَل مع
   كلّ رسالة على مسار كلود فقط (app-18). الخادم يقبل القائمة نفسها حصرًا وللمالك وحده،
   وإن رفض المفتاح النموذج (404/400 نموذج) رجع للافتراضيّ وأخبر المستخدم في سطر الحالة. */
(function () {
  'use strict';

  var KEY = 'aiapp_claude_model';
  /* v-models-family (أمر عمران ١٥ سبتمبر): عائلة كلود ٥ كاملة — الاختيار من منتقي السهم للمالك. */
  /* v-models-latest (٢٥ سبتمبر): Opus 5 ← Opus 5.5، والاختيار المحفوظ القديم يُرقّى تلقائيًّا. */
  var IDS = ['claude-opus-5-5', 'claude-sonnet-5', 'claude-haiku-4-5', 'claude-fable-5-1'];
  var UPGRADES = { 'claude-opus-5': 'claude-opus-5-5' };
  /* v-owner-claude-all (أمر عمران ١٠ أكتوبر «كل الانثروبك خلها لي المالك اختار»): للمالك كلّ نماذج كلود النشطة بترتيب منتقي
     التطبيق الرسميّ، وOpus 5 اختيار مستقلّ (لا يُرقّى). غير المالك على قائمته القديمة وترقيتها حرفيًّا — طلبه لا يتغيّر بايتًا. */
  var OWNER_IDS = ['claude-opus-5-5', 'claude-fable-5-1', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-haiku-4-5', 'claude-sonnet-5', 'claude-opus-5', 'claude-fable-5', 'claude-opus-4-8', 'claude-opus-4-7', 'claude-opus-4-6', 'claude-sonnet-4-6'];
  /* الجهد (لقطة «Effort»: Low · Medium · High · Extra · Max) — للمالك وحده؛ '' = تلقائيّ (التحيّة فوريّة والباقي بافتراضيّ الموديل، v-owner-auto).
     Haiku 4.5 بلا جهد، وOpus 4.6 وSonnet 4.6 بلا Extra (xhigh) — الخادم يتحقّق ويصحّح أيضًا (owner-think.claudeEffortFields). */
  var EFFORT_KEY = 'aiapp_claude_effort';
  var EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
  function owner() { try { return typeof omranOwnerUi === 'function' && !!omranOwnerUi(); } catch (e) { return false; } }
  function ids() { return owner() ? OWNER_IDS : IDS; }
  function isAr() { try { return (localStorage.getItem('aiapp_lang') || 'ar') !== 'en'; } catch (e) { return true; } }
  var HINTS = {
    '': ['الافتراضيّ: Haiku 4.5 — الاقتصاديّ والأسرع للمحادثة اليوميّة.', 'Default: Haiku 4.5 — economical and fastest for everyday chat.'],
    'claude-opus-5-5': ['أدقّ من Sonnet 5 في المهامّ الصعبة، وأبطأ منه.', 'More precise than Sonnet 5 on hard tasks, slower.'],
    'claude-sonnet-5': ['توازن السرعة والدقّة.', 'Balanced speed and quality.'],
    'claude-haiku-4-5': ['الاقتصاديّ والأسرع — هو الافتراضيّ.', 'Economical and fastest — the default.'],
    'claude-fable-5-1': ['للكتابة الإبداعيّة والحوار الطبيعيّ.', 'For creative writing and natural dialogue.'],
  };

  function get() {
    try { var own = owner(), v = localStorage.getItem(KEY) || ''; if (!own && UPGRADES[v]) { v = UPGRADES[v]; localStorage.setItem(KEY, v); } return ids().indexOf(v) === -1 ? '' : v; } catch (e) { return ''; }
  }
  function set(v) {
    v = ids().indexOf(v) === -1 ? '' : v;
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

  /** الجهد المحفوظ إن كان صالحًا للنموذج الحاليّ؛ '' = تلقائيّ (لا يُرسَل حقل). غير المالك دائمًا ''. */
  function effortFor(model, v) {
    if (!v || EFFORTS.indexOf(v) === -1 || model === 'claude-haiku-4-5') return '';
    return (v === 'xhigh' && /^claude-(?:opus-4-6|sonnet-4-6)$/.test(model)) ? 'high' : v;
  }
  function effortGet() {
    if (!owner()) return '';
    try { return effortFor(get() || 'claude-opus-5-5', localStorage.getItem(EFFORT_KEY) || ''); } catch (e) { return ''; }
  }
  function effortSet(v) {
    v = EFFORTS.indexOf(v) === -1 ? '' : v;
    try { if (v) localStorage.setItem(EFFORT_KEY, v); else localStorage.removeItem(EFFORT_KEY); } catch (e) { /* guard-ok — التخزين المحلّيّ قد يكون مقفلًا */ }
    return v;
  }
  function effortSaved() { try { var v = localStorage.getItem(EFFORT_KEY) || ''; return EFFORTS.indexOf(v) === -1 ? '' : v; } catch (e) { return ''; } }

  window.claudeModelGet = get;
  window.claudeModelSync = sync;
  window.CLAUDE_MODEL_IDS = IDS.slice();
  window.CLAUDE_OWNER_MODEL_IDS = OWNER_IDS.slice();
  window.claudeEffortGet = effortGet;
  window.claudeEffortSet = effortSet;
  window.claudeEffortSaved = effortSaved;
  window.claudeEffortFor = effortFor;
})();
