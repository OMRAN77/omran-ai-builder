/* js/app-16-snapbuild.js — 📸 «ورّني وأبنيه».
 *
 * صوّر قائمة مطعم → موقع طلبات شغّال. صوّر شاشة تطبيق → نسخة تعمل.
 * صوّر ورقة تصميم → صفحة حقيقية.
 *
 * لماذا مرحلتان لا واحدة:
 * الطلب المباشر «حوّل هذه الصورة إلى موقع» يجعل النموذج يقرأ ويصمّم ويكتب
 * الكود في خطوة واحدة — فيهمل القراءة لصالح الكتابة، وتضيع أسعار وأصناف.
 * فنفصل: قراءة دقيقة أولًا (JSON)، ثم بناء من المقروء. والقراءة تظهر
 * للمستخدم قبل البناء ليصحّحها — فالكاميرا تخطئ، والخط الرديء يُقرأ خطأً.
 *
 * وهذا نفس درس محرّر المخططات: النموذج يعطي البداية، والمستخدم يضبط.
 */
(function () {
  'use strict';

  var READ_PROMPT = [
    'انظر إلى الصورة/الصور المرفقة واستخرج محتواها بدقة تامة بصيغة JSON فقط،',
    'بلا أي نص خارجها وبلا أسوار كود.',
    '',
    '{"kind":"menu|app|design|form|list|other",',
    ' "title":"اسم واضح مستخرج من الصورة",',
    ' "lang":"ar|en",',
    ' "notes":"ملاحظة قصيرة عن الشكل والألوان الظاهرة",',
    ' "sections":[{"name":"اسم القسم","items":[{"name":"الصنف","price":"السعر كما هو مكتوب","desc":"وصف إن وُجد"}]}],',
    ' "screens":[{"name":"اسم الشاشة","elements":["زر: ...","حقل: ...","قائمة: ..."]}]}',
    '',
    'قواعد:',
    '- انقل النصوص والأسعار **حرفيًا كما هي مكتوبة** — ممنوع تقريب سعر أو تعديل اسم أو ترجمة.',
    '- إن كان النص غير واضح، اكتبه كما تراه وضع "?" في آخره بدل التخمين.',
    '- استخدم sections لقوائم الطعام والمنتجات، وscreens لواجهات التطبيقات.',
    '- اذكر في notes الألوان الغالبة والطابع (فخم، شعبي، بسيط) لتُستخدم في التصميم.',
    '- ممنوع اختراع أي صنف أو سعر غير موجود في الصورة.',
  ].join('\n');

  function buildPrompt(data) {
    var kind = String(data && data.kind || 'other');
    var lines = [];
    lines.push('ابنِ صفحة ويب واحدة كاملة (HTML+CSS+JS في ملف واحد) من البيانات التالية المستخرجة من صورة صوّرها المستخدم.');
    lines.push('');
    lines.push('البيانات:');
    lines.push(JSON.stringify(data, null, 1).slice(0, 6000));
    lines.push('');
    lines.push('قواعد إلزامية:');
    // البيانات مقروءة من صورة المستخدم — تغييرها يجعل الناتج شيئًا آخر
    lines.push('- استخدم **كل** الأصناف والأسعار كما وردت حرفيًا. ممنوع الحذف أو الإضافة أو التقريب.');
    lines.push('- التصميم متجاوب للجوال أولًا، وعربي RTL إن كانت البيانات عربية.');
    lines.push('- استوحِ الألوان والطابع من حقل notes.');

    if (kind === 'menu') {
      lines.push('- اجعلها صفحة طلبات تعمل فعلًا: زر إضافة لكل صنف، سلة تحسب المجموع لحظيًا،');
      lines.push('  وزر «إرسال الطلب واتساب» يفتح wa.me برسالة تحوي الطلب والمجموع.');
      lines.push('- ضع رقم واتساب كمتغيّر في أعلى السكربت ليغيّره صاحب المطعم بسهولة.');
    } else if (kind === 'app') {
      lines.push('- ابنِ الشاشات المذكورة بعناصر تفاعلية حقيقية (أزرار تعمل، حقول تُدخل، قوائم تُحدَّث).');
    } else if (kind === 'form') {
      lines.push('- ابنِ النموذج بحقول تعمل وتحقّق من المدخلات، وزر إرسال يعرض ملخّص ما أُدخل.');
    }
    lines.push('- كل زر يجب أن يعمل. ممنوع script type=module. الدوال معرّفة globally.');
    lines.push('- أعد الملف كاملًا داخل كتلة ```html واحدة، مع سطرين بالعربي قبلها تشرح ما بنيته.');
    return lines.join('\n');
  }

  function extract(text) {
    var s = String(text || '');
    var m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    var raw = m ? m[1] : s;
    var a = raw.indexOf('{'), b = raw.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    try { return JSON.parse(raw.slice(a, b + 1)); } catch (e) { return null; }
  }

  /** ملخّص عربي لما قُرئ — يراه المستخدم قبل البناء ليصحّحه. */
  function summarize(d) {
    if (!d) return '';
    var out = [];
    var kinds = { menu: 'قائمة طعام', app: 'واجهة تطبيق', design: 'تصميم', form: 'نموذج', list: 'قائمة' };
    out.push('📸 قرأتُ من الصورة: **' + (kinds[d.kind] || 'محتوى') + '**' + (d.title ? ' — ' + d.title : ''));
    var n = 0;
    (d.sections || []).forEach(function (s) { n += (s.items || []).length; });
    if (n) out.push('• ' + (d.sections || []).length + ' قسم · ' + n + ' صنف');
    if ((d.screens || []).length) out.push('• ' + d.screens.length + ' شاشة');
    var unsure = JSON.stringify(d).split('?"').length - 1;
    if (unsure) out.push('⚠️ ' + unsure + ' عنصر غير واضح في الصورة — راجعه بعد البناء.');
    return out.join('\n');
  }

  var SNAP_RE = /(ورني|ورّني|حوّل\s*(هذي|هذه|الصورة)|حول\s*الصورة|من\s*الصورة|سو[يّ]?\s*لي\s*(منه|منها)|اعمل\s*لي\s*(منه|منها)|ابن[يِ]?\s*(هذا|هذه|منها|منه)|build\s*(this|from\s*(this|the)\s*(photo|image)))/i;

  window.omranSnap = {
    READ_PROMPT: READ_PROMPT,
    buildPrompt: buildPrompt,
    extract: extract,
    summarize: summarize,
    looksLikeSnapBuild: function (text, hasImages) {
      if (!hasImages) return false;
      var t = String(text || '').trim();
      // صورة بلا نص = النية واضحة في سياق زر «ورّني وأبنيه»
      if (!t) return false;
      return SNAP_RE.test(t);
    },
  };
})();

/* ───────── تكامل v405: زر «📸 ورّني وأبنيه» → قراءة دقيقة → بناء → معاينة ─────────
 * الحزمة الأصلية عرّفت الأدوات (window.omranSnap) بلا أي نقطة دخول — هذا الجزء
 * يكمل الدائرة: الزر يفتح الكاميرا، القراءة تمر على Claude vision، والناتج
 * يفتح مشروعًا جديدًا في المعاينة بنفس مسار محرّر المخططات. */
(function () {
  'use strict';
  function boot() {
    var btn = document.getElementById('btnSnapBuild');
    var input = document.getElementById('snapInput');
    var S = window.omranSnap;
    if (!btn || !input || !S) return;

    /* شريط حالة عائم خاص بالمسار — يبدأ من صندوق الكتابة لا من نافذة قسم،
       فلا يوجد عنصر حالة جاهز نكتب فيه. */
    function statusMsg(txt) {
      var el = document.getElementById('snapBuildStatus');
      if (!el) {
        el = document.createElement('div');
        el.id = 'snapBuildStatus';
        el.style.cssText = 'position:fixed;bottom:84px;left:50%;transform:translateX(-50%);z-index:2000;' +
          'background:rgba(20,20,28,.92);color:#fff;padding:10px 16px;border-radius:12px;font-size:13.5px;' +
          'max-width:88vw;text-align:center;box-shadow:0 4px 18px rgba(0,0,0,.35);display:none;';
        document.body.appendChild(el);
      }
      el.style.display = txt ? 'block' : 'none';
      el.textContent = txt || '';
    }

    btn.addEventListener('click', function () {
      try { var p = document.getElementById('plusToolsPopup'); if (p) { p.classList.remove('open'); p.style.display = 'none'; } } catch (e) { __swallow(e, 'snap:popup'); }
      input.value = '';
      input.click();
    });

    function fileToBlock(f) {
      return new Promise(function (resolve, reject) {
        var r = new FileReader();
        r.onload = function () {
          var m = String(r.result || '').match(/^data:([^;]+);base64,(.*)$/);
          if (!m) return reject(new Error('صورة غير مقروءة'));
          resolve({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
        };
        r.onerror = function () { reject(new Error('فشل قراءة الصورة')); };
        r.readAsDataURL(f);
      });
    }

    function textFrom(data) {
      if (data && Array.isArray(data.content)) {
        return data.content.map(function (c) { return (c && c.text) || ''; }).join('');
      }
      return '';
    }

    function extractHtml(text) {
      var s = String(text || '');
      var m = s.match(/```html\s*([\s\S]*?)```/i) || s.match(/```\s*([\s\S]*?)```/);
      if (m && m[1] && m[1].trim()) return m[1].trim();
      if (/^\s*<!DOCTYPE|^\s*<html/i.test(s)) return s.trim();
      return null;
    }

    input.addEventListener('change', function () {
      var files = Array.prototype.slice.call(input.files || []).slice(0, 4);
      if (!files.length) return;
      statusMsg('📸 يقرأ الصورة بدقة (الأسعار والنصوص حرفيًا)…');

      Promise.all(files.map(fileToBlock)).then(function (blocks) {
        var content = blocks.concat([{ type: 'text', text: 'اقرأ الصورة/الصور حسب تعليمات النظام وأعد JSON فقط.' }]);
        return claudeProxyRequest('claude-sonnet-4-20250514', { content: S.READ_PROMPT }, [{ role: 'user', content: content }], false)
          .then(function (res) { return res.json().catch(function () { return {}; }); });
      }).then(function (data) {
        var parsed = S.extract(textFrom(data));
        if (!parsed) throw new Error((data && data.error && (data.error.message || data.error)) || 'لم أستطع قراءة الصورة — صوّرها بإضاءة أوضح وحاول ثانية');
        var summary = S.summarize(parsed);
        statusMsg('🏗️ يبني من المقروء…');
        return claudeProxyRequest('claude-sonnet-4-20250514', null, [{ role: 'user', content: S.buildPrompt(parsed) }], false)
          .then(function (res) { return res.json().catch(function () { return {}; }); })
          .then(function (b) {
            var code = extractHtml(textFrom(b));
            if (!code) throw new Error('لم يصل كود صالح — حاول مرة ثانية');
            var cur = {
              id: Date.now().toString(),
              title: String((parsed && parsed.title) || 'من الصورة 📸'),
              code: code, codeType: 'html',
              messages: [{ role: 'assistant', content: summary + '\n\n✅ بنيته لك — افتح المعاينة، وراجع الأسعار والنصوص، وقل لي أي تعديل.' }],
            };
            state.projects.push(cur);
            state.currentId = cur.id;
            saveState();
            renderHistory();
            renderMessages();
            renderCodeAndPreview();
            switchWorkTab('preview');
            try { if (window.waAutoExpand) window.waAutoExpand(); } catch (e2) { __swallow(e2, 'snap:waExpand'); }
            try {
              if (window.matchMedia('(max-width:860px)').matches && !workareaEl.classList.contains('open')) openDrawer(workareaEl);
            } catch (e3) { __swallow(e3, 'snap:drawer'); }
            statusMsg('');
          });
      }).catch(function (err) {
        statusMsg('⚠️ ' + String((err && err.message) || err));
        setTimeout(function () { statusMsg(''); }, 6000);
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

/* ───────── v405: نبض التذكيرات ─────────
 * خطة Hobby لا تسمح بكرون كل دقيقة، فكل تطبيق مفتوح ينبض — وقفل Redis
 * في السيرفر يضمن دورة واحدة بالدقيقة مهما كثر النابضون. */
(function () {
  'use strict';
  function tick() {
    try { fetch('/api/check-reminders?tick=1').catch(function () { /* صامت */ }); } catch (e) { /* صامت */ }
  }
  setTimeout(tick, 15000);
  setInterval(tick, 60000);
})();
