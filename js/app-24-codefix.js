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
  };

  function $id(x) { return document.getElementById(x); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>]/g, function (c) {
      return c === '&' ? '&amp;' : (c === '<' ? '&lt;' : '&gt;');
    });
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
  function askModel(instruction, fileBlock, onStatus, onGrow) {
    var payload = {
      messages: [
        { role: 'system', content: fileBlock },
        { role: 'user', content: instruction },
      ],
      provider: 'claude',
      token: authTok(),
      guestId: guestId(),
      tz: (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return ''; } })(),
    };
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
            if (ev.error) throw new Error(ev.error);
            if (typeof ev.delta === 'string') { out += ev.delta; onGrow(out.length); }
            else if (typeof ev.patch === 'string') out = ev.patch; /* الخادم يستبدل النصّ */
            else if (ev.status) onStatus(ev.status);
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

  /* ---------- فحص الصياغة قبل الحفظ ---------- */
  function syntaxCheck(name, code) {
    var n = String(name || '').toLowerCase();
    try {
      if (/\.(mjs|cjs|jsx?|ts x?)$/.test(n) || /\.js$/.test(n)) {
        /* eslint-disable no-new-func */
        new Function(code);
        return { ok: true, msg: 'الصياغة سليمة' };
      }
      if (/\.json$/.test(n)) { JSON.parse(code); return { ok: true, msg: 'JSON سليم' }; }
      if (/\.html?$/.test(n)) {
        var o = (code.match(/<script\b/gi) || []).length;
        var c = (code.match(/<\/script>/gi) || []).length;
        if (o !== c) return { ok: false, msg: 'وسوم script غير متوازنة: ' + o + ' مفتوحة و' + c + ' مغلقة' };
        return { ok: true, msg: 'الوسوم متوازنة' };
      }
    } catch (e) {
      return { ok: false, msg: String((e && e.message) || e).slice(0, 200) };
    }
    return { ok: true, msg: 'لا فحص لهذه الصيغة' };
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
      + '<span style="font-weight:700;font-size:14px;">مراجعة الكود</span>'
      + '<span id="cfxStatus" style="flex:1;font-size:12px;color:var(--muted,#98a0b3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>'
      + '<button type="button" id="cfxX" aria-label="إغلاق" style="background:none;border:0;color:var(--muted,#98a0b3);cursor:pointer;font-size:16px;padding:4px 8px;">✕</button>'
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
      + '<button type="button" id="cfxFileBtn" class="btn" style="padding:8px 14px;">اختر ملفًّا</button>'
      + '<button type="button" id="cfxCurBtn" class="btn" style="padding:8px 14px;">كود المشروع الحالي</button>'
      + '<span id="cfxFileName" style="color:var(--muted,#98a0b3);"></span>'
      + '</div>'
      + '<input type="file" id="cfxFile" style="display:none;">'
      + '<label style="color:var(--muted,#98a0b3);">ما الذي تريد تغييره؟</label>'
      + '<textarea id="cfxAsk" rows="5" spellcheck="false" placeholder="مثال: احذف التعريف المكرّر للدالّة، وانقل أزرار الشريط إلى tabs، واجعل التلميحات تتبع اللغة."'
      + ' style="width:100%;box-sizing:border-box;background:var(--panel2,#0d0f14);color:inherit;'
      + 'border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:10px;font:13px/1.7 inherit;resize:vertical;"></textarea>'
      + '<button type="button" id="cfxGo" class="btn" style="padding:10px 16px;font-weight:700;">حلّل واقترح التعديلات</button>'
      + '<div style="color:var(--muted,#98a0b3);font-size:11.5px;line-height:1.8;">'
      + 'الملفّ يُرسَل كاملًا في كلّ طلب، فطوله يُحسب من رصيدك. النموذج يعيد تعديلات مفصولة لا الملفّ كاملًا،'
      + ' وكلّ تعديل يُرفض تلقائيًّا إن لم يطابق نصّه موضعًا واحدًا في ملفّك.'
      + '</div>'
      + '</div>');

    $id('cfxFileBtn').onclick = function () { $id('cfxFile').click(); };
    $id('cfxFile').onchange = function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      if (f.size > MAX_BYTES) { setStatus('الملفّ أكبر من ' + Math.round(MAX_BYTES / 1024) + ' ك.ب — قسّمه أوّلًا'); return; }
      var fr = new FileReader();
      fr.onload = function () {
        S.name = f.name; S.text = String(fr.result || ''); S.original = null;
        $id('cfxFileName').textContent = f.name + ' · ' + S.text.split('\n').length + ' سطر';
        setStatus('');
      };
      fr.readAsText(f);
    };
    $id('cfxCurBtn').onclick = function () {
      var cur = (typeof getCurrent === 'function') ? getCurrent() : null;
      if (!cur || !cur.code) { setStatus('لا يوجد كود في المشروع الحالي'); return; }
      S.name = (cur.codeType === 'python') ? 'project.py' : 'project.html';
      S.text = String(cur.code); S.original = null;
      $id('cfxFileName').textContent = S.name + ' · ' + S.text.split('\n').length + ' سطر';
      setStatus('');
    };
    $id('cfxGo').onclick = run;
    /* v-code-score: ملفّ سُلِّم من وحدة التحليل (omranCodeFixOpenWith) يظهر اسمه فورًا */
    if (S.name && S.text) $id('cfxFileName').textContent = S.name + ' · ' + S.text.split('\n').length + ' سطر';
  }

  function run() {
    var ask = ($id('cfxAsk').value || '').trim();
    if (!S.text) { setStatus('اختر ملفًّا أوّلًا'); return; }
    if (!ask) { setStatus('اكتب ما تريد تغييره'); return; }
    S.busy = true;
    render('<div style="font-size:13px;color:var(--muted,#98a0b3);line-height:2;">'
      + '<div id="cfxProg">يقرأ الملفّ…</div></div>');
    setStatus('');

    var fileBlock = '[الملفّ تحت المراجعة — ' + S.name + ']\n'
      + '<<<<<<FILE\n' + S.text + '\nFILE>>>>>>';
    var instruction = buildInstruction(ask, S.name, S.text.length);

    askModel(instruction, fileBlock,
      function (st) { var p = $id('cfxProg'); if (p) p.textContent = st; },
      function (n) { var p = $id('cfxProg'); if (p) p.textContent = 'يكتب التعديلات… ' + n + ' حرفًا'; }
    ).then(function (raw) {
      S.busy = false;
      var r = parsePatches(raw);
      if (r.none || !r.list.length) {
        render('<div style="font-size:13px;line-height:1.9;">لم يقترح النموذج أيّ تعديل.'
          + '<pre style="white-space:pre-wrap;color:var(--muted,#98a0b3);font-size:12px;margin-top:10px;">'
          + esc(String(raw).split(CS).join('://').slice(0, 1200)) + '</pre></div>');
        return;
      }
      S.patches = scorePatches(S.text, r.list);
      viewPatches();
    }).catch(function (e) {
      S.busy = false;
      render('<div style="font-size:13px;color:#e88;">تعذّر التحليل: ' + esc(String((e && e.message) || e)) + '</div>');
    });
  }

  function viewPatches() {
    var okN = 0, badN = 0, h = '';
    for (var i = 0; i < S.patches.length; i++) {
      var p = S.patches[i];
      var good = p.hits === 1;
      if (good) okN++; else badN++;
      var tag = good ? '<span style="color:#7ac07a;">مطابقة واحدة</span>'
        : (p.hits === 0
          ? '<span style="color:#e88;">لم يُعثر على النصّ القديم — مرفوضة</span>'
          : '<span style="color:#e8b45a;">' + p.hits + ' مواضع — غامضة، مرفوضة</span>');
      h += '<div style="border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:10px;margin-bottom:8px;">'
        + '<label style="display:flex;gap:8px;align-items:flex-start;cursor:' + (good ? 'pointer' : 'default') + ';">'
        + '<input type="checkbox" data-i="' + i + '" class="cfxChk"' + (good ? ' checked' : ' disabled') + '>'
        + '<span style="flex:1;"><b style="font-size:12.5px;">' + esc(p.why || 'تعديل') + '</b><br>'
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
      + okN + ' تعديلًا صالحًا' + (badN ? ' · ' + badN + ' مرفوضة' : '') + '</div>'
      + h
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;">'
      + '<button type="button" id="cfxApply" class="btn" style="padding:9px 16px;font-weight:700;">طبّق المحدّد</button>'
      + '<button type="button" id="cfxBack" class="btn" style="padding:9px 16px;">رجوع</button>'
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
    var chk = syntaxCheck(S.name, text);
    if (!chk.ok) {
      render('<div style="font-size:13px;line-height:1.9;">'
        + '<div style="color:#e88;font-weight:700;">لم أحفظ شيئًا — الملفّ الناتج لا يُصرَّف.</div>'
        + '<div style="color:var(--muted,#98a0b3);margin-top:6px;">' + esc(chk.msg) + '</div>'
        + '<button type="button" id="cfxBack2" class="btn" style="margin-top:12px;padding:9px 16px;">رجوع للتعديلات</button>'
        + '</div>');
      $id('cfxBack2').onclick = viewPatches;
      return;
    }
    S.original = before;
    S.text = text;
    var lines = text.split('\n').length;
    render('<div style="font-size:13px;line-height:1.9;">'
      + '<div style="color:#7ac07a;font-weight:700;">طُبّق ' + done + ' تعديلًا'
      + (skipped ? ' · تُخطّي ' + skipped + ' لتغيّر موضعها' : '') + '</div>'
      + '<div style="color:var(--muted,#98a0b3);">' + esc(chk.msg) + ' · ' + lines + ' سطرًا</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">'
      + '<button type="button" id="cfxDl" class="btn" style="padding:9px 16px;font-weight:700;">تنزيل الملفّ</button>'
      + '<button type="button" id="cfxToProj" class="btn" style="padding:9px 16px;">ضعه في كود المشروع</button>'
      + '<button type="button" id="cfxUndo" class="btn" style="padding:9px 16px;">تراجع</button>'
      + '</div></div>');

    $id('cfxDl').onclick = function () {
      var blob = new Blob([S.text], { type: 'text/plain;charset=utf-8' });
      if (typeof omranSaveBlob === 'function') { omranSaveBlob(blob, S.name); return; }
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = S.name;
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    };
    $id('cfxToProj').onclick = function () {
      try {
        var cur = (typeof getCurrent === 'function') ? getCurrent() : null;
        if (!cur) { setStatus('لا يوجد مشروع مفتوح'); return; }
        cur.code = S.text;
        if (typeof codeEl !== 'undefined' && codeEl) codeEl.value = S.text;
        if (typeof saveState === 'function') saveState();
        if (typeof renderCodeAndPreview === 'function') renderCodeAndPreview();
        setStatus('نُقل إلى كود المشروع');
      } catch (e) { setStatus('تعذّر النقل'); }
    };
    $id('cfxUndo').onclick = function () {
      if (S.original == null) return;
      S.text = S.original; S.original = null;
      S.patches = scorePatches(S.text, S.patches);
      viewPatches();
    };
  }

  /* ---------- الزرّ: يُضاف إلى قائمة ⋮ في شريط التبويبات ---------- */
  function mount() {
    var dd = document.getElementById('tabsMenuDropdown');
    if (!dd || document.getElementById('btnCodeFix')) return true;
    var b = document.createElement('button');
    b.className = 'btn';
    b.id = 'btnCodeFix';
    b.type = 'button';
    b.title = 'مراجعة الكود بالذكاء الاصطناعي';
    b.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"'
      + ' fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"'
      + ' stroke-linejoin="round" aria-hidden="true"><polyline points="16 18 22 12 16 6"></polyline>'
      + '<polyline points="8 6 2 12 8 18"></polyline></svg> <span class="btnLabel">مراجعة</span>';
    b.onclick = function (e) { e.stopPropagation(); open(); };
    dd.appendChild(b);
    return true;
  }

  window.omranCodeFixOpen = open;
  /* v-code-score: وحدة «تحليل الكود وتقييمه» (app-27) تسلّم الملفّ الواحد وطلب الإصلاح
     المبنيّ من أعلى المشاكل، فيبدأ المستخدم من شاشة الرقع مباشرةً. */
  window.omranCodeFixOpenWith = function (name, text, ask) {
    S.name = String(name || 'file.txt'); S.text = String(text || ''); S.original = null; S.patches = [];
    open();
    var a = $id('cfxAsk');
    if (a && ask) a.value = String(ask);
  };

  if (!mount()) {
    var n = 0;
    var t = setInterval(function () { if (mount() || ++n > 40) clearInterval(t); }, 300);
  }
})();
