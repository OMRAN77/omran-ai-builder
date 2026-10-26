/* ===== app-24-codefix — تحليل الكود وتعديله بالذكاء الاصطناعي =====
   القرار المعماري: النموذج لا يعيد الملفّ كاملًا أبدًا. حدّ الإخراج (16000
   توكن) أصغر بكثير من حدّ الإدخال، فملفّ ١٤٠٠ سطر يُقطع وهو خارج — وهذا
   بعينه سبب «الكود يصل ٨٦٧ سطرًا». النموذج يعيد «رقعًا» ({قديم، جديد})
   ونطبّقها هنا، بحارس يرفض أي رقعة لا يوجد نصّها القديم مرّة واحدة بالضبط.

   ثلاثة قيود في api/_lib/chat.js حكمت التصميم:
   (١) compactConversation تقصّ كلّ رسالة عند 12000 حرف — فالملفّ يُرسَل
       كرسالة role:'system'، وهذه تُستخرج قبل القصّ ولا تُمسّ.
   (٢) stripMemoryUrls تحذف كلّ رابط لا يظهر في ناتج أداة، وبلا أدوات
       يكون toolCorpus فارغًا فتُمسح كلّ الروابط — بما فيها
       xmlns="http://www.w3.org/2000/svg" داخل الرقع. لذلك يكتب النموذج
       CS_SENTINEL بدل '://' ونعيدها هنا بعد الاستلام.
   (٣) __analyzeDoc يطفئ الأدوات للنصّ الطويل — مفيد لنا: لا بحث ولا رسم
       أثناء التحليل. لذا تُتجنّب في التعليمة كلمات البحث (سعر، أخبار،
       طقس، فندق، مطعم، search, news, weather, price) كي لا تُشعل الأدوات. */
(function () {
  'use strict';

  var CS = '@@CS@@';                 /* بديل '://' — راجع القيد (٢) أعلاه */
  var MAX_BYTES = 400000;            /* فوقه نرفض: السياق والمهلة لا يتّسعان */
  var API = '/api/ai?action=chat';   /* نفس مسار المحادثة الذي يستهلكه app-18-chat-tools — لا يوجد /api/chat */

  var S = {
    name: '',
    text: '',
    original: null,   /* نسخة التراجع الوحيدة */
    patches: [],
    busy: false,
    ask: '',          /* v-code-review-limit: الطلب يبقى بعد النتيجة وإعادة الفتح */
    crlf: false,      /* v-audit-chatcli: الملفّ رُفع بأسطر ويندوز — يُنزَّل بها */
  };

  function $id(x) { return document.getElementById(x); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>]/g, function (c) {
      return c === '&' ? '&amp;' : (c === '<' ? '&lt;' : '&gt;');
    });
  }
  /* v-code-review-i18n (تدقيق ١٨ أكتوبر: النافذة كلّها عربيّة في الإنجليزيّ): نصوص الواجهة من t() بالـ١٤ لغة (مفاتيح cfx*)،
     و{n}/{msg}… تُملأ هنا. تعليمة النموذج (buildInstruction) ورأس كتلة الملفّ يبقيان عربيّين — ليسا واجهة. */
  function tx(k, vars) {
    var s = (typeof t === 'function') ? String(t(k)) : k;
    if (vars) Object.keys(vars).forEach(function (n) { s = s.split('{' + n + '}').join(String(vars[n])); });
    return s;
  }
  function ar() {
    var l = (typeof lang !== 'undefined' && lang) ? lang : 'ar';
    return l === 'ar' || l === 'ur';
  }
  function authTok() {
    try {
      return sessionStorage.getItem('aiapp_auth_token') || localStorage.getItem('aiapp_auth_token') || '';
    } catch (e) { return ''; }
  }
  function guestId() {
    try { return localStorage.getItem('aiapp_guest_id') || localStorage.getItem('aiapp_guestId') || ''; }
    catch (e) { return ''; }
  }

  /* ---------- التعليمة ----------
     مكتوبة طويلة عمدًا: تجاوز ٦٠٠ حرف يشغّل __analyzeDoc في الخادم فتُطفأ
     الأدوات، فيبدأ النموذج الكتابة فورًا بلا بحث ولا رسم. */
  function buildInstruction(userAsk, fileName, fileLen) {
    return [
      'أنت مراجع كود. أمامك ملفّ كامل في رسالة النظام باسم «' + fileName + '» وطوله ' + fileLen + ' حرفًا.',
      '',
      'المطلوب من المستخدم:',
      userAsk,
      '',
      '[قواعد الإخراج — إلزامية مطلقة]',
      '١) ممنوع منعًا باتًا إعادة الملفّ كاملًا أو أي جزء كبير منه. أعد رقعًا فقط.',
      '٢) شكل كلّ رقعة حرفيًّا، بلا أيّ علامات تنسيق أو أسوار كود حولها:',
      '@@PATCH',
      '@@WHY سبب التعديل في سطر واحد',
      '@@OLD',
      '(النصّ القديم كما هو في الملفّ حرفًا بحرف، بمسافاته وأسطره)',
      '@@NEW',
      '(النصّ الجديد بديلًا عنه)',
      '@@END',
      '٣) النصّ في @@OLD يجب أن يوجد في الملفّ مرّة واحدة بالضبط. وسّعه بأسطر',
      '   مجاورة حتى يصير فريدًا. رقعة لا يُعثر على قديمها مرّة واحدة تُرفض تلقائيًّا.',
      '٤) انسخ @@OLD من الملفّ نسخًا حرفيًّا — لا تُعِد كتابته من ذاكرتك ولا تُصلح',
      '   مسافاته ولا تُغيّر حرفًا واحدًا فيه، وإلّا لن يطابق.',
      '٥) لحذف نصّ: اترك ما بعد @@NEW فارغًا.',
      '٦) في ردّك كلّه اكتب ' + CS + ' بدل الرمز نقطتين فمائلتين (الذي يأتي بعد https).',
      '   هذا إلزاميّ في @@OLD و@@NEW والشرح معًا، وإلّا ضاعت الروابط من الرقعة.',
      '٧) عشرون رقعة كحدّ أقصى. رتّبها من الأهمّ.',
      '٨) لا تشرح خارج @@WHY، ولا تكتب مقدّمة ولا خاتمة ولا تلخيصًا.',
      '٩) إن لم تجد ما تعدّله فاكتب سطرًا واحدًا فقط: @@NONE ثمّ سبب ذلك.',
    ].join('\n');
  }

  /* ---------- النداء ---------- */
  /* v-owner-solo-all (المالك: «كل واحد بروحه»): النافذة كانت على كلود دائمًا (Opus عند المالك) مهما اختار. للمالك الآن مزوّده المختار
     بموديله، بلا أدوات (body.noTools — للمالك وحده في الخادم) فيبقى عقد الرقع @@ كما هو. غيره كما كان. */
  function ownerRoute() {
    try {
      if (!(typeof omranOwnerUi === 'function' && omranOwnerUi())) return null;
      var sel = localStorage.getItem('aiapp_provider') || (typeof omranDefaultProv === 'function' ? omranDefaultProv() : 'openai');
      var prov = (typeof TOOL_PROVIDERS !== 'undefined' && TOOL_PROVIDERS.indexOf(sel) !== -1) ? sel : 'claude';
      var model = prov === 'claude' ? (window.claudeModelGet ? window.claudeModelGet() : '') : (window.omranModelFor ? window.omranModelFor(prov) : '');
      return { provider: prov, model: model || '' };
    } catch (e) { return null; } // guard-ok — بلا تخزين = كلود كما كان
  }

  function askModel(instruction, fileBlock, onStatus, onGrow) {
    var own = ownerRoute();
    var payload = {
      messages: [
        { role: 'system', content: fileBlock },
        { role: 'user', content: instruction },
      ],
      provider: own ? own.provider : 'claude',
      token: authTok(),
      guestId: guestId(),
      tz: (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return ''; } })(),
    };
    if (own) { payload.noTools = true; if (own.model) payload.model = own.model; }
    return fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(function (r) {
      if (!r.ok || !r.body) throw new Error('HTTP ' + r.status);
      var reader = r.body.getReader();
      var dec = new TextDecoder();
      var buf = '', out = '';
      function pump() {
        return reader.read().then(function (res) {
          if (res.done) return out;
          buf += dec.decode(res.value, { stream: true });
          var lines = buf.split('\n');
          buf = lines.pop();
          for (var i = 0; i < lines.length; i++) {
            var ln = lines[i];
            if (ln.indexOf('data: ') !== 0) continue;   /* ': ka' نبضة إبقاء */
            var ev;
            try { ev = JSON.parse(ln.slice(6)); } catch (e) { continue; }
            /* v-code-review-limit: نفاد المجّانيّ/التجربة يصل {tier:'free-limit'|'guest-limit'} ثمّ نصّ الحدّ delta، وحدّ الباقة
               {error, limit:true} (api/_lib/chat.js). كان النصّ يُعامَل ناتجًا فتقول النافذة «لم يقترح…» — الآن خطأ يحمل الطبقة. */
            if ((typeof ev.tier === 'string' && /-limit$/.test(ev.tier)) || (ev.error && ev.limit === true)) {
              var le = new Error(String(ev.error || ev.tier));
              le.planLimit = true;
              le.tier = (typeof ev.tier === 'string' && /-limit$/.test(ev.tier)) ? ev.tier : 'plan';
              throw le;
            }
            if (ev.error) throw new Error(ev.error);
            if (typeof ev.delta === 'string') { out += ev.delta; onGrow(out.length); }
            else if (typeof ev.patch === 'string') out = ev.patch; /* الخادم يستبدل النصّ */
            else if (ev.status) onStatus((typeof tStatus === 'function') ? tStatus(ev) : ev.status); /* v656: مفتاح k بلغة الواجهة */
          }
          return pump();
        });
      }
      return pump();
    });
  }

  /* ---------- التحليل النصّي ----------
     صيغة محدِّدات لا JSON عمدًا: هروب الأسطر والاقتباسات داخل JSON يكسر
     الكود الطويل باستمرار، والمحدِّدات تمرّ الكود خامًّا كما هو. */
  function parsePatches(raw) {
    var txt = String(raw || '').split(CS).join('://');
    if (/@@NONE/.test(txt) && txt.indexOf('@@PATCH') === -1) return { none: true, list: [] };
    var out = [];
    var parts = txt.split('@@PATCH');
    for (var i = 1; i < parts.length; i++) {
      var b = parts[i];
      var iOld = b.indexOf('@@OLD');
      var iNew = b.indexOf('@@NEW');
      var iEnd = b.indexOf('@@END');
      if (iOld < 0 || iNew < 0 || iNew < iOld) continue;
      if (iEnd < 0) iEnd = b.length;
      var why = (b.slice(0, iOld).match(/@@WHY[ \t]*([^\n]*)/) || [, ''])[1].trim();
      var oldS = b.slice(iOld + 5, iNew).replace(/^[ \t]*\r?\n/, '').replace(/\r?\n[ \t]*$/, '');
      var newS = b.slice(iNew + 5, iEnd).replace(/^[ \t]*\r?\n/, '').replace(/\r?\n[ \t]*$/, '');
      if (!oldS) continue;
      out.push({ why: why, old: oldS, neu: newS, hits: 0, on: true });
    }
    return { none: false, list: out };
  }

  /* ---------- الحارس ----------
     هذا هو الفرق بين أداة وبين إفساد صامت للملفّ: لا تُطبَّق رقعة إلّا إذا
     وُجد نصّها القديم مرّة واحدة بالضبط. صفر = هلوسة، أكثر من واحدة = غموض. */
  function countHits(hay, needle) {
    if (!needle) return 0;
    var n = 0, i = 0;
    while (true) {
      var k = hay.indexOf(needle, i);
      if (k === -1) break;
      n++; i = k + needle.length;
      if (n > 9) break;
    }
    return n;
  }
  function scorePatches(text, list) {
    for (var i = 0; i < list.length; i++) {
      list[i].hits = countHits(text, list[i].old);
      if (list[i].hits !== 1) list[i].on = false;
    }
    return list;
  }

  /* v-audit-chatcli (cli-chat-rest-3): ملفّ ويندوز (CRLF) — النموذج يكتب @@OLD بفواصل \n فلا تطابق رقعةٌ من سطرين أبدًا. النصّ يُوحَّد
     بـ\n عند القراءة (الجهاز، والتسليم من «تحليل الكود»، والمشروع)، ويُعاد CRLF عند التنزيل كما رُفع. */
  function setText(name, raw) {
    var s = String(raw || '');
    S.crlf = /\r\n/.test(s);
    S.name = name; S.text = s.replace(/\r\n?/g, '\n'); S.original = null;
  }

  /* ---------- فحص الصياغة قبل الحفظ ----------
     v-audit-chatcli (cli-chat-rest-2): new Function يفهم السكربت العاديّ وحده — ES Module (‎.mjs، أو import/export، أو import.meta)
     وJSX وTS ترمي فيه دائمًا، فكانت كلّ رقعة عليها «لم يُحفظ». هذه لا تُفحص هنا (cfxNoCheck)، وسطر #! يُحذف قبل الفحص، وملفّ لا يجتاز
     الفحص قبل الرقع (JSX داخل ‎.js مثلًا) لا يُحكم عليه بعدها. رقعة تكسر سكربتًا سليمًا تُرفض كما كانت. */
  function jsErr(code) {
    try { new Function(String(code).replace(/^#![^\n]*/, '')); return null; } // eslint-disable-line no-new-func
    catch (e) { return e; }
  }
  function syntaxCheck(name, code, before) {
    var n = String(name || '').toLowerCase();
    try {
      if (/\.(mjs|jsx|tsx?)$/.test(n)) return { ok: true, msg: tx('cfxNoCheck') };
      if (/\.c?js$/.test(n)) {
        if (/^[ \t]*(?:import\b[ \t]*[\w{*'"$]|export\b)|\bimport\.meta\b/m.test(code)) return { ok: true, msg: tx('cfxNoCheck') };
        var err = jsErr(code);
        if (!err) return { ok: true, msg: tx('cfxSyntaxOk') };
        if (before != null && jsErr(before)) return { ok: true, msg: tx('cfxNoCheck') };
        throw err;
      }
      if (/\.json$/.test(n)) { JSON.parse(code); return { ok: true, msg: tx('cfxJsonOk') }; }
      if (/\.html?$/.test(n)) {
        var o = (code.match(/<script\b/gi) || []).length;
        var c = (code.match(/<\/script>/gi) || []).length;
        if (o !== c) return { ok: false, msg: tx('cfxTagsBad', { o: o, c: c }) };
        return { ok: true, msg: tx('cfxTagsOk') };
      }
    } catch (e) {
      return { ok: false, msg: String((e && e.message) || e).slice(0, 200) };
    }
    return { ok: true, msg: tx('cfxNoCheck') };
  }

  /* ---------- الواجهة ---------- */
  function close() { var o = $id('cfxOverlay'); if (o) o.remove(); }

  function render(view) {
    var b = $id('cfxBody');
    if (b) b.innerHTML = view;
  }

  function setStatus(s) {
    var el = $id('cfxStatus');
    if (el) el.textContent = s || '';
  }

  function open() {
    close();
    var ov = document.createElement('div');
    ov.id = 'cfxOverlay';
    ov.dir = ar() ? 'rtl' : 'ltr';
    ov.style.cssText = 'position:fixed;inset:0;z-index:99000;background:rgba(0,0,0,.78);'
      + 'backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:16px;';
    var box = document.createElement('div');
    box.style.cssText = 'width:100%;max-width:760px;max-height:88vh;display:flex;flex-direction:column;'
      + 'background:var(--panel,#12151d);border:1px solid rgba(255,255,255,.12);border-radius:16px;'
      + 'box-shadow:0 20px 60px rgba(0,0,0,.55);overflow:hidden;color:var(--text,#e8eaf1);';
    box.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.08);">'
      + '<span style="font-weight:700;font-size:14px;">' + esc(tx('cfxTitle')) + '</span>'
      + '<span id="cfxStatus" style="flex:1;font-size:12px;color:var(--muted,#98a0b3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>'
      + '<button type="button" id="cfxX" aria-label="' + esc(tx('closeTitle')) + '" style="background:none;border:0;color:var(--muted,#98a0b3);cursor:pointer;font-size:16px;padding:4px 8px;">✕</button>'
      + '</div>'
      + '<div id="cfxBody" style="padding:14px 16px;overflow:auto;flex:1;"></div>';
    ov.appendChild(box);
    document.body.appendChild(ov);
    $id('cfxX').onclick = close;
    ov.addEventListener('click', function (e) { if (e.target === ov && !S.busy) close(); });
    viewPick();
  }

  function viewPick() {
    render(
      '<div style="display:flex;flex-direction:column;gap:12px;font-size:13px;">'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">'
      + '<button type="button" id="cfxFileBtn" class="btn" style="padding:8px 14px;">' + esc(tx('cfxPickFile')) + '</button>'
      + '<button type="button" id="cfxCurBtn" class="btn" style="padding:8px 14px;">' + esc(tx('cfxCurCode')) + '</button>'
      + '<span id="cfxFileName" style="color:var(--muted,#98a0b3);"></span>'
      + '</div>'
      + '<input type="file" id="cfxFile" style="display:none;">'
      + '<label style="color:var(--muted,#98a0b3);">' + esc(tx('cfxAskLabel')) + '</label>'
      + '<textarea id="cfxAsk" rows="5" spellcheck="false" placeholder="' + esc(tx('cfxAskPh')) + '"'
      + ' style="width:100%;box-sizing:border-box;background:var(--panel2,#0d0f14);color:inherit;'
      /* v-code-review-limit: الاختزال القديم (الحجم/السطر ثمّ inherit عائلةً) غير صالح فيُسقَط كلّه، وتأخذ الخانة خطّ المتصفّح
         أحاديّ المسافة فتتفرّق الحروف العربيّة. */
      + 'border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:10px;font:inherit;font-size:13px;line-height:1.7;resize:vertical;"></textarea>'
      + '<button type="button" id="cfxGo" class="btn" style="padding:10px 16px;font-weight:700;">' + esc(tx('cfxGo')) + '</button>'
      + '<div style="color:var(--muted,#98a0b3);font-size:11.5px;line-height:1.8;">'
      + esc(tx('cfxDisclaimer'))
      + '</div>'
      + '</div>');

    $id('cfxFileBtn').onclick = function () { $id('cfxFile').click(); };
    $id('cfxFile').onchange = function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      if (f.size > MAX_BYTES) { setStatus(tx('cfxTooBig', { n: Math.round(MAX_BYTES / 1024) })); return; }
      var fr = new FileReader();
      fr.onload = function () {
        setText(f.name, fr.result);
        $id('cfxFileName').textContent = f.name + ' · ' + tx('cfxLines', { n: S.text.split('\n').length });
        setStatus('');
      };
      fr.readAsText(f);
    };
    $id('cfxCurBtn').onclick = function () {
      var cur = (typeof getCurrent === 'function') ? getCurrent() : null;
      if (!cur || !cur.code) { setStatus(tx('cfxNoCode')); return; }
      setText((cur.codeType === 'python') ? 'project.py' : 'project.html', cur.code);
      $id('cfxFileName').textContent = S.name + ' · ' + tx('cfxLines', { n: S.text.split('\n').length });
      setStatus('');
    };
    $id('cfxGo').onclick = run;
    /* v-code-review-limit: الطلب السابق يعود (بعد «رجوع» أو إعادة فتح النافذة)، وما يُكتب يُحفظ أوّلًا بأوّل. */
    var askEl = $id('cfxAsk');
    askEl.value = S.ask || '';
    askEl.oninput = function () { S.ask = askEl.value; };
    /* v-code-score: ملفّ سُلِّم من وحدة التحليل (omranCodeFixOpenWith) يظهر اسمه فورًا */
    if (S.name && S.text) $id('cfxFileName').textContent = S.name + ' · ' + tx('cfxLines', { n: S.text.split('\n').length });
  }

  /* v-code-review-limit: «رجوع» إلى شاشة الاختيار بطلبها — بعد «لا تعديل» والخطأ والحدّ (كانت ✕ وحدها). */
  function backBtn() {
    return '<button type="button" id="cfxBack" class="btn" style="padding:9px 16px;">' + esc(tx('back')) + '</button>';
  }
  function wireBack() { var b = $id('cfxBack'); if (b) b.onclick = viewPick; }

  /* v-code-review-limit: الحدّ سطر مترجَم وزرّ — الباقات للمسجَّل، والتسجيل للضيف (omranOpenPlans تفرّق بينهما) — كالمحادثة. */
  function viewLimit(tier) {
    var guest = tier === 'guest-limit', free = tier === 'free-limit';
    render('<div style="font-size:13px;line-height:1.9;">'
      + '<div>' + esc(tx(guest ? 'chatGuestLimitMsg' : (free ? 'chatFreeLimitMsg' : 'plansWhyLimit'))) + '</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">'
      + '<button type="button" id="cfxPlans" class="btn" style="padding:9px 16px;font-weight:700;">'
      + esc(tx(guest ? 'tierSignupBtn' : (free ? 'tierUpgradeBtn' : 'pricingSectionTitle'))) + '</button>'
      + backBtn()
      + '</div></div>');
    $id('cfxPlans').onclick = function () {
      close();
      try {
        if (typeof window.omranOpenPlans === 'function') window.omranOpenPlans('limit', 'chat');
        else if (guest) { var tog = $id('btnAuthToggle'); if (tog) tog.click(); }
      } catch (e) { if (window.__swallow) window.__swallow(e, 'codefix:plans'); }
    };
    wireBack();
  }

  function run() {
    var ask = ($id('cfxAsk').value || '').trim();
    if (!S.text) { setStatus(tx('cfxNeedFile')); return; }
    if (!ask) { setStatus(tx('cfxNeedAsk')); return; }
    S.ask = ask;
    S.busy = true;
    render('<div style="font-size:13px;color:var(--muted,#98a0b3);line-height:2;">'
      + '<div id="cfxProg">' + esc(tx('cfxReading')) + '</div></div>');
    setStatus('');

    var fileBlock = '[الملفّ تحت المراجعة — ' + S.name + ']\n'
      + '<<<<<<FILE\n' + S.text + '\nFILE>>>>>>';
    var instruction = buildInstruction(ask, S.name, S.text.length);

    askModel(instruction, fileBlock,
      function (st) { var p = $id('cfxProg'); if (p) p.textContent = st; },
      function (n) { var p = $id('cfxProg'); if (p) p.textContent = tx('cfxWriting', { n: n }); }
    ).then(function (raw) {
      S.busy = false;
      var r = parsePatches(raw);
      if (r.none || !r.list.length) {
        render('<div style="font-size:13px;line-height:1.9;">' + esc(tx('cfxNoPatch'))
          + '<pre style="white-space:pre-wrap;color:var(--muted,#98a0b3);font-size:12px;margin-top:10px;">'
          + esc(String(raw).split(CS).join('://').slice(0, 1200)) + '</pre>'
          + '<div style="margin-top:12px;">' + backBtn() + '</div></div>');
        wireBack();
        return;
      }
      S.patches = scorePatches(S.text, r.list);
      viewPatches();
    }).catch(function (e) {
      S.busy = false;
      if (e && e.planLimit) { viewLimit(e.tier); return; }
      render('<div style="font-size:13px;line-height:1.9;">'
        + '<div style="color:#e88;">' + esc(tx('cfxError', { msg: String((e && e.message) || e) })) + '</div>'
        + '<div style="margin-top:12px;">' + backBtn() + '</div></div>');
      wireBack();
    });
  }

  function viewPatches() {
    var okN = 0, badN = 0, h = '';
    for (var i = 0; i < S.patches.length; i++) {
      var p = S.patches[i];
      var good = p.hits === 1;
      if (good) okN++; else badN++;
      var tag = good ? '<span style="color:#7ac07a;">' + esc(tx('cfxMatchOne')) + '</span>'
        : (p.hits === 0
          ? '<span style="color:#e88;">' + esc(tx('cfxMatchNone')) + '</span>'
          : '<span style="color:#e8b45a;">' + esc(tx('cfxMatchMany', { n: p.hits })) + '</span>');
      h += '<div style="border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:10px;margin-bottom:8px;">'
        + '<label style="display:flex;gap:8px;align-items:flex-start;cursor:' + (good ? 'pointer' : 'default') + ';">'
        + '<input type="checkbox" data-i="' + i + '" class="cfxChk"' + (good ? ' checked' : ' disabled') + '>'
        + '<span style="flex:1;"><b style="font-size:12.5px;">' + esc(p.why || tx('cfxPatch')) + '</b><br>'
        + '<span style="font-size:11.5px;">' + tag + '</span></span></label>'
        + '<pre style="margin:8px 0 0;max-height:150px;overflow:auto;background:var(--panel2,#0d0f14);'
        + 'border-radius:8px;padding:8px;font:11.5px/1.6 ui-monospace,Menlo,Consolas,monospace;'
        + 'direction:ltr;text-align:left;white-space:pre;">'
        + '<span style="color:#e08a8a;">- ' + esc(p.old.slice(0, 600)).split('\n').join('\n- ') + '</span>\n'
        + '<span style="color:#7ac07a;">+ ' + esc(p.neu.slice(0, 600)).split('\n').join('\n+ ') + '</span>'
        + '</pre></div>';
    }
    render('<div style="font-size:13px;">'
      + '<div style="margin-bottom:10px;color:var(--muted,#98a0b3);">'
      + esc(tx('cfxValidN', { n: okN })) + (badN ? ' · ' + esc(tx('cfxRejectedN', { n: badN })) : '') + '</div>'
      + h
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;">'
      + '<button type="button" id="cfxApply" class="btn" style="padding:9px 16px;font-weight:700;">' + esc(tx('cfxApply')) + '</button>'
      + backBtn()
      + '</div></div>');
    $id('cfxBack').onclick = viewPick;
    $id('cfxApply').onclick = apply;
    var chks = document.querySelectorAll('.cfxChk');
    for (var k = 0; k < chks.length; k++) {
      chks[k].onchange = function () { S.patches[+this.getAttribute('data-i')].on = this.checked; };
    }
  }

  function apply() {
    var before = S.text;
    var text = S.text, done = 0, skipped = 0;
    for (var i = 0; i < S.patches.length; i++) {
      var p = S.patches[i];
      if (!p.on) continue;
      /* يُعاد العدّ لحظة التطبيق: رقعة سابقة قد تكون غيّرت الموضع. */
      if (countHits(text, p.old) !== 1) { skipped++; continue; }
      text = text.replace(p.old, function () { return p.neu; });
      done++;
    }
    var chk = syntaxCheck(S.name, text, before);
    if (!chk.ok) {
      render('<div style="font-size:13px;line-height:1.9;">'
        + '<div style="color:#e88;font-weight:700;">' + esc(tx('cfxNotSaved')) + '</div>'
        + '<div style="color:var(--muted,#98a0b3);margin-top:6px;">' + esc(chk.msg) + '</div>'
        + '<button type="button" id="cfxBack2" class="btn" style="margin-top:12px;padding:9px 16px;">' + esc(tx('cfxBackToEdits')) + '</button>'
        + '</div>');
      $id('cfxBack2').onclick = viewPatches;
      return;
    }
    S.original = before;
    S.text = text;
    var lines = text.split('\n').length;
    render('<div style="font-size:13px;line-height:1.9;">'
      + '<div style="color:#7ac07a;font-weight:700;">' + esc(tx('cfxAppliedN', { n: done }))
      + (skipped ? ' · ' + esc(tx('cfxSkippedN', { n: skipped })) : '') + '</div>'
      + '<div style="color:var(--muted,#98a0b3);">' + esc(chk.msg) + ' · ' + esc(tx('cfxLines', { n: lines })) + '</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">'
      + '<button type="button" id="cfxDl" class="btn" style="padding:9px 16px;font-weight:700;">' + esc(tx('cfxDownload')) + '</button>'
      + '<button type="button" id="cfxToProj" class="btn" style="padding:9px 16px;">' + esc(tx('cfxToProject')) + '</button>'
      + '<button type="button" id="cfxUndo" class="btn" style="padding:9px 16px;">' + esc(tx('cfxUndo')) + '</button>'
      + '</div></div>');

    $id('cfxDl').onclick = function () {
      var blob = new Blob([S.crlf ? S.text.replace(/\n/g, '\r\n') : S.text], { type: 'text/plain;charset=utf-8' }); /* v-audit-chatcli */
      if (typeof omranSaveBlob === 'function') { omranSaveBlob(blob, S.name); return; }
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = S.name;
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    };
    $id('cfxToProj').onclick = function () {
      try {
        var cur = (typeof getCurrent === 'function') ? getCurrent() : null;
        if (!cur) { setStatus(tx('cfxNoProject')); return; }
        cur.code = S.text;
        if (typeof codeEl !== 'undefined' && codeEl) codeEl.value = S.text;
        if (typeof saveState === 'function') saveState();
        if (typeof renderCodeAndPreview === 'function') renderCodeAndPreview();
        setStatus(tx('cfxMoved'));
      } catch (e) { setStatus(tx('cfxMoveFail')); }
    };
    $id('cfxUndo').onclick = function () {
      if (S.original == null) return;
      S.text = S.original; S.original = null;
      S.patches = scorePatches(S.text, S.patches);
      viewPatches();
    };
  }

  /* v-review-menu-close (تدقيق ١٨ أكتوبر: ⋮ تبقى مفتوحة فوق النافذة وتغطّي «اختر ملفًّا» في الجوّال): الزرّ يوقف انتشار النقرة
     فلا يصل مستمع الإغلاق على القائمة (app-10). نغلقها هنا قبل فتح النافذة — بإغلاق app-10 نفسه (يعيدها لمكانها ويطفئ ⋮)،
     واحتياطًا بإزالة show. */
  function closeTabsMenu() {
    try {
      if (typeof window.omranCloseTabsMenu === 'function') { window.omranCloseTabsMenu(); return; }
      var d = $id('tabsMenuDropdown');
      if (d) d.classList.remove('show');
    } catch (e) { if (window.__swallow) window.__swallow(e, 'codefix:menu-close'); }
  }

  /* ---------- الزرّ: يُضاف إلى قائمة ⋮ في شريط التبويبات ---------- */
  function mount() {
    var dd = document.getElementById('tabsMenuDropdown');
    if (!dd || document.getElementById('btnCodeFix')) return true;
    var b = document.createElement('button');
    b.className = 'btn';
    b.id = 'btnCodeFix';
    b.type = 'button';
    /* v-code-review-i18n: الوسم وتلميحه بلغة الواجهة، وdata-i18n يحدّثهما applyLanguage عند تبديل اللغة. */
    b.title = tx('codeReviewTip');
    b.setAttribute('data-i18n-title', 'codeReviewTip');
    b.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"'
      + ' fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"'
      + ' stroke-linejoin="round" aria-hidden="true"><polyline points="16 18 22 12 16 6"></polyline>'
      + '<polyline points="8 6 2 12 8 18"></polyline></svg> <span class="btnLabel" data-i18n="codeReviewMenu">'
      + esc(tx('codeReviewMenu')) + '</span>';
    b.onclick = function (e) { e.stopPropagation(); closeTabsMenu(); open(); };
    dd.appendChild(b);
    return true;
  }

  window.omranCodeFixOpen = open;
  /* v-code-score: وحدة «تحليل الكود وتقييمه» (app-27) تسلّم الملفّ الواحد وطلب الإصلاح
     المبنيّ من أعلى المشاكل، فيبدأ المستخدم من شاشة الرقع مباشرةً. */
  window.omranCodeFixOpenWith = function (name, text, ask) {
    setText(String(name || 'file.txt'), text); S.patches = [];
    S.ask = String(ask || '');
    open();
    var a = $id('cfxAsk');
    if (a && ask) a.value = String(ask);
  };

  /* المؤقّت tm لا t: «var t» في هذه الدالّة كان يحجب t() العامّة (رفع var) فتنكسر كلّ ترجمة هنا. */
  if (!mount()) {
    var n = 0;
    var tm = setInterval(function () { if (mount() || ++n > 40) clearInterval(tm); }, 300);
  }
})();
