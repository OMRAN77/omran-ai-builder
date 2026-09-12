/* ===== app-27-codescore — تحليل الكود وتقييمه (v-code-score) =====
   «يقرأ الأكواد ويحلّل كلّ شيء ويعطي الأفضل»: ملفّات نصّية أو أرشيف zip أو
   كود المشروع الحالي أو لصق مباشر → /api/tools?action=code-analyze (بثّ SSE)
   → تقرير مُهيكل: درجة من ١٠٠ وحرف تقدير، ستّ فئات، نقاط القوّة، المشاكل
   بخطورتها وملفّها وسطرها وإصلاحها، توصيات مرتّبة من الأعلى قيمة، وترتيب
   الملفّات من الأفضل، وقياسات محلّية. زرّ «أصلح أهمّ المشاكل» يسلّم الملفّ
   الواحد إلى وحدة الرقع (app-24-codefix) بطلب مبنيّ من أعلى المشاكل.
   الواجهة كمبيوتر أوّلًا (قرار ثابت: الجوّال مُتجاهَل عمدًا). */
(function () {
  'use strict';

  var API = '/api/tools?action=code-analyze';
  var MAX_TEXT = 400000;          /* حدّ الملفّ النصّي الواحد */
  var MAX_ZIP = 3 * 1024 * 1024;  /* جسم دالة Vercel ~4.5 م.ب وbase64 يزيد الثلث */
  var MAX_FILES = 40;
  var ACCEPT = '.js,.mjs,.cjs,.jsx,.ts,.tsx,.py,.html,.htm,.css,.scss,.json,.md,.php,.java,.kt,.swift,.go,.rs,.c,.h,.cpp,.hpp,.cs,.rb,.sh,.sql,.yml,.yaml,.xml,.vue,.svelte,.dart,.toml,.txt,.zip';

  var S = { files: [], zip: null, busy: false, report: null, t0: 0, timer: null };

  function $id(x) { return document.getElementById(x); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return c === '&' ? '&amp;' : (c === '<' ? '&lt;' : (c === '>' ? '&gt;' : '&quot;'));
    });
  }
  function L() { return (typeof lang !== 'undefined' && lang) ? String(lang) : 'ar'; }
  function ar() { var l = L(); return l === 'ar' || l === 'ur'; }
  function authTok() {
    try { return sessionStorage.getItem('aiapp_auth_token') || localStorage.getItem('aiapp_auth_token') || ''; }
    catch (e) { return ''; }
  }
  function guestId() {
    try { return localStorage.getItem('aiapp_guest_id') || localStorage.getItem('aiapp_guestId') || ''; }
    catch (e) { return ''; }
  }

  var TXT = {
    ar: {
      title: 'تحليل الكود وتقييمه', menu: 'تحليل', menuTitle: 'تحليل الكود وتقييمه بالذكاء الاصطناعي',
      pickFiles: 'اختر ملفّات أو zip', current: 'كود المشروع الحالي', paste: 'الصق كودًا', add: 'أضف',
      pasteName: 'اسم الملفّ (مثال app.js)', pastePh: 'الصق الكود هنا…', ask: 'ركّز على شيء معيّن؟ (اختياري)',
      askPh: 'مثال: الأمان فقط، أو الأداء في دالة الحفظ، أو هل يصلح للإنتاج؟', go: 'حلّل وقيّم كلّ شيء',
      note: 'يُقرأ كلّ ملفّ سطرًا سطرًا ويُحلَّل من ستّ زوايا (الصحّة، الأمان، الأداء، الوضوح، الصيانة، أفضل الممارسات) ثمّ يُقيَّم من ١٠٠ مع أفضل خطوة تالية. الطلب يُحسب رسالةً واحدة من رصيدك اليوميّ.',
      noFiles: 'اختر ملفًّا أو الصق كودًا أوّلًا', tooBig: 'أكبر من الحدّ — تُخطّي: ', zipBig: 'الأرشيف أكبر من ٣ ميجابايت',
      noProject: 'لا يوجد كود في المشروع الحالي', reading: 'يقرأ الملفّات…', sec: 'ث', files: 'ملفّ', lines: 'سطر',
      score: 'الدرجة', verdict: 'الحكم', strengths: 'نقاط القوّة', issues: 'المشاكل', recs: 'أفضل ما تفعله الآن',
      ranking: 'ترتيب الملفّات — الأفضل أوّلًا', metrics: 'قياسات آليّة', noIssues: 'لا مشاكل مؤثّرة — الكود نظيف.',
      best: '★ الأفضل', fix: 'الإصلاح', fixBtn: 'أصلح أهمّ المشاكل', download: 'تنزيل التقرير', copy: 'نسخ', copied: 'نُسخ',
      again: 'تحليل جديد', enginePro: 'المحرّك الاحترافيّ', engineFree: 'ردّ مجاني', fail: 'تعذّر التحليل: ',
      unparsed: 'لم يصل تقرير مُهيكل — هذا نصّ النموذج كما هو:', skipped: 'تُخطّيت', rank: '#',
      upgrade: 'اشترك للنسخة الاحترافية', signup: 'سجّل مجانًا', commentRatio: 'نسبة التعليقات', truncated: 'مقتطع',
      deep: 'التحليل التفصيليّ — ملفًّا ملفًّا ودالّةً دالّة', freeNote: 'هذا تقرير الوضع المجانيّ. النسخة الاحترافيّة تحلّل بعمق أكبر وبملفّات أكبر.',
      sev: { critical: 'حرِج', high: 'عالٍ', medium: 'متوسّط', low: 'منخفض', info: 'ملاحظة' },
      cat: { correctness: 'الصحّة', security: 'الأمان', performance: 'الأداء', readability: 'الوضوح', maintainability: 'الصيانة', best_practices: 'أفضل الممارسات' },
    },
    en: {
      title: 'Code analysis & rating', menu: 'Analyze', menuTitle: 'AI code analysis and rating',
      pickFiles: 'Pick files or zip', current: 'Current project code', paste: 'Paste code', add: 'Add',
      pasteName: 'File name (e.g. app.js)', pastePh: 'Paste code here…', ask: 'Focus on something? (optional)',
      askPh: 'e.g. security only, performance of the save function, or is it production-ready?', go: 'Analyze & rate everything',
      note: 'Every file is read line by line and reviewed from six angles (correctness, security, performance, readability, maintainability, best practices), then scored out of 100 with the best next step. Counts as one message of your daily quota.',
      noFiles: 'Pick a file or paste code first', tooBig: 'Over the size limit — skipped: ', zipBig: 'Archive is larger than 3 MB',
      noProject: 'The current project has no code', reading: 'Reading files…', sec: 's', files: 'files', lines: 'lines',
      score: 'Score', verdict: 'Verdict', strengths: 'Strengths', issues: 'Issues', recs: 'Best things to do now',
      ranking: 'File ranking — best first', metrics: 'Automatic metrics', noIssues: 'No significant issues — clean code.',
      best: '★ Best', fix: 'Fix', fixBtn: 'Fix the top issues', download: 'Download report', copy: 'Copy', copied: 'Copied',
      again: 'New analysis', enginePro: 'Pro engine', engineFree: 'Free reply', fail: 'Analysis failed: ',
      unparsed: 'No structured report arrived — raw model text:', skipped: 'skipped', rank: '#',
      upgrade: 'Upgrade to Pro', signup: 'Sign up free', commentRatio: 'comment ratio', truncated: 'truncated',
      deep: 'Detailed analysis — file by file, function by function', freeNote: 'This is the free-tier report. The Pro engine analyzes deeper and accepts larger files.',
      sev: { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', info: 'Info' },
      cat: { correctness: 'Correctness', security: 'Security', performance: 'Performance', readability: 'Readability', maintainability: 'Maintainability', best_practices: 'Best practices' },
    },
  };
  function t(k) { var d = ar() ? TXT.ar : TXT.en; return d[k] != null ? d[k] : (TXT.ar[k] != null ? TXT.ar[k] : k); }
  function sevName(s) { return t('sev')[s] || s; }
  function catName(c) { return t('cat')[c] || c; }

  var SEV_COLOR = { critical: '#ff5f5f', high: '#e88', medium: '#e8b45a', low: '#b5d16a', info: '#8ab4f8' };
  function scoreColor(n) { return n == null ? '#98a0b3' : (n >= 85 ? '#7ac07a' : (n >= 70 ? '#b5d16a' : (n >= 55 ? '#e8b45a' : '#e88'))); }

  /* ---------- قراءة الملفّات ---------- */
  function readText(f) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(String(fr.result || '')); };
      fr.onerror = function () { rej(new Error('read failed')); };
      fr.readAsText(f);
    });
  }
  function readB64(f) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(String(fr.result || '').split(',')[1] || ''); };
      fr.onerror = function () { rej(new Error('read failed')); };
      fr.readAsDataURL(f);
    });
  }
  function addFile(name, content) {
    if (S.files.length >= MAX_FILES) return false;
    for (var i = 0; i < S.files.length; i++) if (S.files[i].name === name) { S.files[i].content = content; return true; }
    S.files.push({ name: name, content: content });
    return true;
  }

  /* ---------- الواجهة ---------- */
  function close() { var o = $id('csOverlay'); if (o) o.remove(); if (S.timer) { clearInterval(S.timer); S.timer = null; } }
  function render(v) { var b = $id('csBody'); if (b) b.innerHTML = v; }
  function setStatus(s) { var el = $id('csStatus'); if (el) el.textContent = s || ''; }
  var BTN = 'padding:8px 14px;';
  var MUTED = 'color:var(--muted,#98a0b3);';
  var CARD = 'border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:10px 12px;margin-bottom:8px;';

  function open() {
    close();
    var ov = document.createElement('div');
    ov.id = 'csOverlay';
    ov.dir = ar() ? 'rtl' : 'ltr';
    ov.style.cssText = 'position:fixed;inset:0;z-index:99000;background:rgba(0,0,0,.78);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:16px;';
    var box = document.createElement('div');
    box.style.cssText = 'width:100%;max-width:860px;max-height:90vh;display:flex;flex-direction:column;background:var(--panel,#12151d);border:1px solid rgba(255,255,255,.12);border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.55);overflow:hidden;color:var(--text,#e8eaf1);';
    box.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.08);">'
      + '<span style="font-weight:700;font-size:14px;">' + esc(t('title')) + '</span>'
      + '<span id="csStatus" style="flex:1;font-size:12px;' + MUTED + 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>'
      + '<button type="button" id="csX" aria-label="close" style="background:none;border:0;' + MUTED + 'cursor:pointer;font-size:16px;padding:4px 8px;">✕</button>'
      + '</div><div id="csBody" style="padding:14px 16px;overflow:auto;flex:1;font-size:13px;"></div>';
    ov.appendChild(box);
    document.body.appendChild(ov);
    $id('csX').onclick = close;
    ov.addEventListener('click', function (e) { if (e.target === ov && !S.busy) close(); });
    viewPick();
  }

  function renderList() {
    var el = $id('csList');
    if (!el) return;
    var h = '';
    if (S.zip) h += chip('📦 ' + S.zip.name + ' · ' + Math.round(S.zip.file.size / 1024) + 'KB', 'zip');
    for (var i = 0; i < S.files.length; i++) h += chip(S.files[i].name + ' · ' + S.files[i].content.split('\n').length + ' ' + t('lines'), String(i));
    el.innerHTML = h;
    var xs = el.querySelectorAll('[data-rm]');
    for (var k = 0; k < xs.length; k++) {
      xs[k].onclick = function () {
        var v = this.getAttribute('data-rm');
        if (v === 'zip') S.zip = null; else S.files.splice(+v, 1);
        renderList();
      };
    }
  }
  function chip(label, key) {
    return '<span style="display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:3px 10px;margin:0 4px 6px 0;font-size:12px;">'
      + esc(label) + '<button type="button" data-rm="' + key + '" style="background:none;border:0;' + MUTED + 'cursor:pointer;padding:0;font-size:13px;">✕</button></span>';
  }

  function viewPick() {
    render(
      '<div style="display:flex;flex-direction:column;gap:12px;">'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">'
      + '<button type="button" id="csFilesBtn" class="btn" style="' + BTN + '">' + esc(t('pickFiles')) + '</button>'
      + '<button type="button" id="csCurBtn" class="btn" style="' + BTN + '">' + esc(t('current')) + '</button>'
      + '<button type="button" id="csPasteBtn" class="btn" style="' + BTN + '">' + esc(t('paste')) + '</button>'
      + '</div>'
      + '<input type="file" id="csFile" multiple accept="' + ACCEPT + '" style="display:none;">'
      + '<div id="csList"></div>'
      + '<div id="csPasteWrap" style="display:none;flex-direction:column;gap:6px;">'
      + '<input id="csPasteName" placeholder="' + esc(t('pasteName')) + '" style="width:100%;box-sizing:border-box;background:var(--panel2,#0d0f14);color:inherit;border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:8px 10px;font:13px inherit;">'
      + '<textarea id="csPaste" rows="8" spellcheck="false" placeholder="' + esc(t('pastePh')) + '" style="width:100%;box-sizing:border-box;background:var(--panel2,#0d0f14);color:inherit;border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:10px;font:12px/1.6 ui-monospace,Menlo,Consolas,monospace;direction:ltr;text-align:left;resize:vertical;"></textarea>'
      + '<div><button type="button" id="csPasteAdd" class="btn" style="' + BTN + '">' + esc(t('add')) + '</button></div>'
      + '</div>'
      + '<label style="' + MUTED + '">' + esc(t('ask')) + '</label>'
      + '<input id="csAsk" placeholder="' + esc(t('askPh')) + '" style="width:100%;box-sizing:border-box;background:var(--panel2,#0d0f14);color:inherit;border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:10px;font:13px inherit;">'
      + '<button type="button" id="csGo" class="btn" style="padding:10px 16px;font-weight:700;">' + esc(t('go')) + '</button>'
      + '<div style="' + MUTED + 'font-size:11.5px;line-height:1.8;">' + esc(t('note')) + '</div>'
      + '</div>');
    renderList();
    $id('csFilesBtn').onclick = function () { $id('csFile').click(); };
    $id('csFile').onchange = function (e) {
      var list = Array.prototype.slice.call(e.target.files || []);
      var skippedBig = [];
      var chain = Promise.resolve();
      list.forEach(function (f) {
        chain = chain.then(function () {
          if (/\.zip$/i.test(f.name)) {
            if (f.size > MAX_ZIP) { setStatus(t('zipBig')); return; }
            S.zip = { name: f.name, file: f };
            return;
          }
          if (f.size > MAX_TEXT) { skippedBig.push(f.name); return; }
          return readText(f).then(function (txt) { addFile(f.name, txt); });
        });
      });
      chain.then(function () {
        renderList();
        if (skippedBig.length) setStatus(t('tooBig') + skippedBig.join(', '));
        e.target.value = '';
      });
    };
    $id('csCurBtn').onclick = function () {
      var cur = (typeof getCurrent === 'function') ? getCurrent() : null;
      if (!cur || !cur.code) { setStatus(t('noProject')); return; }
      addFile(cur.codeType === 'python' ? 'project.py' : 'project.html', String(cur.code));
      renderList(); setStatus('');
    };
    $id('csPasteBtn').onclick = function () { var w = $id('csPasteWrap'); w.style.display = w.style.display === 'none' ? 'flex' : 'none'; };
    $id('csPasteAdd').onclick = function () {
      var code = ($id('csPaste').value || '');
      if (!code.trim()) return;
      var nm = ($id('csPasteName').value || '').trim() || ('snippet-' + (S.files.length + 1) + '.txt');
      addFile(nm, code); $id('csPaste').value = ''; renderList();
    };
    $id('csGo').onclick = run;
  }

  function viewProgress() {
    render('<div style="' + MUTED + 'line-height:2;"><div id="csProg">' + esc(t('reading')) + '</div><div id="csElapsed" style="font-size:11.5px;"></div></div>');
    S.t0 = Date.now();
    if (S.timer) clearInterval(S.timer);
    S.timer = setInterval(function () {
      var el = $id('csElapsed');
      if (!el) { clearInterval(S.timer); S.timer = null; return; }
      el.textContent = Math.round((Date.now() - S.t0) / 1000) + ' ' + t('sec');
    }, 1000);
  }

  /* ---------- النداء (SSE) ---------- */
  function callApi(payload, onStatus) {
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(function (r) {
      if (!r.ok || !r.body) throw new Error('HTTP ' + r.status);
      var reader = r.body.getReader(), dec = new TextDecoder(), buf = '';
      var out = { report: null, error: null, tier: null };
      function pump() {
        return reader.read().then(function (res) {
          if (res.done) return out;
          buf += dec.decode(res.value, { stream: true });
          var lines = buf.split('\n');
          buf = lines.pop();
          for (var i = 0; i < lines.length; i++) {
            if (lines[i].indexOf('data: ') !== 0) continue;
            var ev;
            try { ev = JSON.parse(lines[i].slice(6)); } catch (e) { continue; }
            if (ev.status) onStatus(ev.status);
            if (typeof ev.tier === 'string') out.tier = ev.tier;
            if (ev.error) out.error = ev.error;
            if (ev.report) out.report = ev.report;
          }
          return pump();
        });
      }
      return pump();
    });
  }

  function run() {
    if (!S.files.length && !S.zip) { setStatus(t('noFiles')); return; }
    var ask = ($id('csAsk') && $id('csAsk').value || '').trim();
    S.busy = true; S.report = null; setStatus('');
    viewProgress();
    var payload = {
      files: S.files.map(function (f) { return { name: f.name, content: f.content }; }),
      ask: ask, lang: L(), token: authTok(), guestId: guestId(),
      tz: (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return ''; } })(),
    };
    var prep = S.zip ? readB64(S.zip.file).then(function (b64) { payload.fileBase64 = b64; payload.filename = S.zip.name; }) : Promise.resolve();
    prep.then(function () {
      return callApi(payload, function (st) { var p = $id('csProg'); if (p) p.textContent = st; });
    }).then(function (out) {
      S.busy = false;
      if (S.timer) { clearInterval(S.timer); S.timer = null; }
      if (out.report) { S.report = out.report; S.report.ask = ask; viewReport(out.report); return; }
      viewError(out.error || 'empty', out.tier);
    }).catch(function (e) {
      S.busy = false;
      if (S.timer) { clearInterval(S.timer); S.timer = null; }
      viewError(String((e && e.message) || e), null);
    });
  }

  function viewError(msg, tier) {
    var limit = tier === 'free-limit' || tier === 'guest-limit';
    var h = '<div style="line-height:1.9;"><div style="color:#e88;">' + (limit ? '' : esc(t('fail'))) + esc(msg) + '</div>';
    if (limit) {
      h += '<button type="button" id="csTier" class="btn" style="' + BTN + 'margin-top:10px;font-weight:700;">' + esc(tier === 'guest-limit' ? t('signup') : t('upgrade')) + '</button>';
    }
    h += '<div><button type="button" id="csBack" class="btn" style="' + BTN + 'margin-top:12px;">' + esc(t('again')) + '</button></div></div>';
    render(h);
    $id('csBack').onclick = viewPick;
    var tb = $id('csTier');
    if (tb) tb.onclick = function () {
      close();
      try {
        if (tier === 'guest-limit') { var tog = $id('btnAuthToggle'); if (tog) tog.click(); }
        else if (typeof openCheckout === 'function') openCheckout('pro');
      } catch (e) { if (window.__swallow) window.__swallow(e, 'codescore:tier'); }
    };
  }

  /* ---------- التقرير ---------- */
  function bar(label, val) {
    var v = val == null ? 0 : val;
    return '<div style="display:flex;align-items:center;gap:8px;margin:3px 0;font-size:12px;">'
      + '<span style="width:120px;flex:none;">' + esc(label) + '</span>'
      + '<span style="flex:1;height:8px;border-radius:6px;background:rgba(255,255,255,.08);overflow:hidden;"><span style="display:block;height:100%;width:' + v + '%;background:' + scoreColor(val) + ';"></span></span>'
      + '<span style="width:34px;text-align:center;' + MUTED + '">' + (val == null ? '—' : val) + '</span></div>';
  }
  function sevChip(s) {
    return '<span style="display:inline-block;padding:1px 8px;border-radius:999px;font-size:11px;font-weight:700;color:#111;background:' + (SEV_COLOR[s] || '#98a0b3') + ';">' + esc(sevName(s)) + '</span>';
  }
  function pre(s) {
    return '<pre style="margin:6px 0 0;white-space:pre-wrap;word-break:break-word;background:var(--panel2,#0d0f14);border-radius:8px;padding:8px;font:11.5px/1.6 ui-monospace,Menlo,Consolas,monospace;direction:ltr;text-align:left;max-height:220px;overflow:auto;">' + esc(s) + '</pre>';
  }
  /* Markdown مصغّر للتحليل الحرّ: أسوار كود، عناوين، نقاط، غامق، كود سطريّ. كلّ شيء يُهرَّب أوّلًا. */
  function mdLite(md) {
    var parts = String(md || '').split(/```[a-zA-Z0-9_-]*\n?/);
    var out = '';
    for (var i = 0; i < parts.length; i++) {
      if (i % 2 === 1) { out += pre(parts[i].replace(/\n$/, '')); continue; }
      var lines = parts[i].split('\n'), inList = false;
      for (var k = 0; k < lines.length; k++) {
        var ln = lines[k], m;
        var inl = esc(ln).replace(/`([^`]+)`/g, '<code style="direction:ltr;unicode-bidi:embed;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11.5px;">$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
        if ((m = /^\s*([-*•]|\d+[.)])\s+(.*)$/.exec(inl))) { if (!inList) { out += '<ul style="margin:4px 0;padding-inline-start:20px;">'; inList = true; } out += '<li>' + m[2] + '</li>'; continue; }
        if (inList) { out += '</ul>'; inList = false; }
        if ((m = /^\s*(#{1,4})\s+(.*)$/.exec(inl))) { out += '<div style="font-weight:700;margin:10px 0 2px;font-size:' + (m[1].length <= 2 ? '13.5' : '12.5') + 'px;">' + m[2] + '</div>'; continue; }
        if (!ln.trim()) continue;
        out += '<div>' + inl + '</div>';
      }
      if (inList) out += '</ul>';
    }
    return out;
  }

  function viewReport(r) {
    var h = '';
    var hasScore = r.score != null;
    h += '<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;' + CARD + '">'
      + '<div style="width:92px;height:92px;flex:none;border-radius:50%;border:6px solid ' + scoreColor(r.score) + ';display:flex;flex-direction:column;align-items:center;justify-content:center;">'
      + '<span style="font-size:28px;font-weight:800;line-height:1;">' + (hasScore ? r.score : '—') + '</span><span style="font-size:10px;' + MUTED + '">/100</span></div>'
      + '<div style="flex:1;min-width:220px;line-height:1.8;">'
      + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">'
      + (r.grade ? '<span style="font-size:20px;font-weight:800;color:' + scoreColor(r.score) + ';">' + esc(r.grade) + '</span>' : '')
      + (r.language ? '<span style="' + MUTED + '">' + esc(r.language) + '</span>' : '')
      + '<span style="font-size:11px;border:1px solid rgba(255,255,255,.16);border-radius:999px;padding:1px 8px;' + MUTED + '">' + esc(r.engine === 'pro' ? t('enginePro') : t('engineFree')) + '</span>'
      + '</div>'
      + (r.summary ? '<div>' + (r.parsed ? esc(r.summary) : '<span style="color:#e8b45a;">' + esc(t('unparsed')) + '</span>' + pre(r.summary)) + '</div>' : '')
      + (r.verdict ? '<div style="margin-top:6px;"><b>' + esc(t('verdict')) + ':</b> ' + esc(r.verdict) + '</div>' : '')
      + '</div></div>';

    if (r.engine === 'free') {
      h += '<div style="' + CARD + 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:12px;"><span style="' + MUTED + 'flex:1;">' + esc(t('freeNote')) + '</span>'
        + '<button type="button" id="csUp" class="btn" style="padding:6px 12px;">' + esc(t('upgrade')) + '</button></div>';
    }

    /* v-code-depth: التحليل التفصيليّ الحرّ — النموذج يمرّ على كلّ ملفّ ودالّة قبل الحكم */
    if (r.deep) {
      h += '<details style="' + CARD + '"><summary style="cursor:pointer;font-weight:700;">' + esc(t('deep')) + '</summary>'
        + '<div style="margin-top:8px;line-height:1.85;font-size:12.5px;">' + mdLite(r.deep) + '</div></details>';
    }

    if (r.parsed) {
      h += '<div style="' + CARD + '">';
      var cats = r.categories || {};
      var keys = ['correctness', 'security', 'performance', 'readability', 'maintainability', 'best_practices'];
      for (var c = 0; c < keys.length; c++) h += bar(catName(keys[c]), cats[keys[c]]);
      h += '</div>';
    }

    if (r.recommendations && r.recommendations.length) {
      h += '<div style="' + CARD + '"><b>' + esc(t('recs')) + '</b><ol style="margin:6px 0 0;padding-inline-start:22px;line-height:1.8;">';
      for (var i = 0; i < r.recommendations.length; i++) {
        h += '<li>' + (i === 0 ? '<span style="color:#e8b45a;font-weight:700;">' + esc(t('best')) + '</span> ' : '') + esc(r.recommendations[i]) + '</li>';
      }
      h += '</ol></div>';
    }

    if (r.files && r.files.length > 1) {
      h += '<div style="' + CARD + '"><b>' + esc(t('ranking')) + '</b><table style="width:100%;border-collapse:collapse;margin-top:6px;font-size:12px;">';
      for (var f = 0; f < r.files.length; f++) {
        var fl = r.files[f];
        h += '<tr style="border-top:1px solid rgba(255,255,255,.06);"><td style="padding:5px 4px;width:28px;' + MUTED + '">' + (f + 1) + '</td>'
          + '<td style="padding:5px 4px;direction:ltr;text-align:left;font-family:ui-monospace,Menlo,Consolas,monospace;">' + esc(fl.name) + '</td>'
          + '<td style="padding:5px 4px;width:44px;text-align:center;font-weight:700;color:' + scoreColor(fl.score) + ';">' + (fl.score == null ? '—' : fl.score) + '</td>'
          + '<td style="padding:5px 4px;' + MUTED + '">' + esc(fl.note) + '</td></tr>';
      }
      h += '</table></div>';
    }

    if (r.strengths && r.strengths.length) {
      h += '<div style="' + CARD + '"><b>' + esc(t('strengths')) + '</b><ul style="margin:6px 0 0;padding-inline-start:20px;line-height:1.8;">';
      for (var s = 0; s < r.strengths.length; s++) h += '<li>' + esc(r.strengths[s]) + '</li>';
      h += '</ul></div>';
    }

    var issues = r.issues || [];
    h += '<div style="' + CARD + '"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;"><b>' + esc(t('issues')) + ' (' + issues.length + ')</b>';
    var cnt = r.counts || {};
    var sevs = ['critical', 'high', 'medium', 'low', 'info'];
    for (var q = 0; q < sevs.length; q++) if (cnt[sevs[q]]) h += sevChip(sevs[q]) + '<span style="font-size:11px;' + MUTED + 'margin-inline-end:6px;">' + cnt[sevs[q]] + '</span>';
    h += '</div>';
    if (!issues.length) h += '<div style="margin-top:6px;color:#7ac07a;">' + esc(r.parsed ? t('noIssues') : '') + '</div>';
    for (var n = 0; n < issues.length; n++) {
      var it = issues[n];
      h += '<div style="border-top:1px solid rgba(255,255,255,.06);padding:8px 0;line-height:1.7;">'
        + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' + sevChip(it.severity)
        + '<b>' + esc(it.title || catName(it.category)) + '</b>'
        + '<span style="font-size:11px;' + MUTED + '">' + esc(catName(it.category)) + (it.file ? ' · <span style="direction:ltr;unicode-bidi:embed;font-family:ui-monospace,Menlo,Consolas,monospace;">' + esc(it.file) + (it.line ? ':' + it.line : '') + '</span>' : '') + '</span></div>'
        + (it.detail ? '<div>' + esc(it.detail) + '</div>' : '')
        + (it.fix ? '<div style="margin-top:4px;"><b style="font-size:12px;">' + esc(t('fix')) + ':</b>' + (/\n|[{};()=]/.test(it.fix) ? pre(it.fix) : ' ' + esc(it.fix)) + '</div>' : '')
        + '</div>';
    }
    h += '</div>';

    var m = r.metrics;
    if (m && m.totals) {
      var tt = m.totals;
      h += '<div style="' + CARD + 'font-size:12px;"><b>' + esc(t('metrics')) + '</b><div style="' + MUTED + 'margin-top:4px;">'
        + tt.files + ' ' + esc(t('files')) + ' · ' + tt.lines + ' ' + esc(t('lines')) + ' · ' + esc(t('commentRatio')) + ' ' + (tt.lines ? Math.round(100 * tt.comments / tt.lines) : 0) + '%'
        + (tt.languages && tt.languages.length ? ' · ' + esc(tt.languages.join(', ')) : '') + '</div>';
      for (var mf = 0; mf < m.files.length; mf++) {
        var pf = m.files[mf];
        if (!pf.flags.length && !pf.truncated) continue;
        h += '<div style="margin-top:6px;"><span style="direction:ltr;unicode-bidi:embed;font-family:ui-monospace,Menlo,Consolas,monospace;">' + esc(pf.name) + '</span>' + (pf.truncated ? ' <span style="color:#e8b45a;">(' + esc(t('truncated')) + ')</span>' : '');
        for (var g = 0; g < pf.flags.length; g++) {
          var fg = pf.flags[g];
          h += '<div style="' + MUTED + 'padding-inline-start:12px;">• ' + esc(fg.label) + ': ' + fg.count + (fg.lines && fg.lines.length ? ' <span style="direction:ltr;unicode-bidi:embed;">(L' + fg.lines.join(', L') + ')</span>' : '') + '</div>';
        }
        h += '</div>';
      }
      if (r.skipped && r.skipped.length) h += '<div style="' + MUTED + 'margin-top:6px;">' + esc(t('skipped')) + ': ' + esc(r.skipped.map(function (x) { return x.name; }).join(', ')) + '</div>';
      h += '</div>';
    }

    var canFix = S.files.length === 1 && !S.zip && typeof window.omranCodeFixOpenWith === 'function' && issues.length;
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;">'
      + (canFix ? '<button type="button" id="csFix" class="btn" style="' + BTN + 'font-weight:700;">' + esc(t('fixBtn')) + '</button>' : '')
      + '<button type="button" id="csDl" class="btn" style="' + BTN + '">' + esc(t('download')) + '</button>'
      + '<button type="button" id="csCopy" class="btn" style="' + BTN + '">' + esc(t('copy')) + '</button>'
      + '<button type="button" id="csAgain" class="btn" style="' + BTN + '">' + esc(t('again')) + '</button>'
      + '</div>';
    render(h);
    var b = $id('csBody'); if (b) b.scrollTop = 0;

    $id('csAgain').onclick = viewPick;
    var up = $id('csUp');
    if (up) up.onclick = function () { close(); try { if (typeof openCheckout === 'function') openCheckout('pro'); } catch (e) { if (window.__swallow) window.__swallow(e, 'codescore:upgrade'); } };
    $id('csDl').onclick = function () {
      var blob = new Blob([toMarkdown(r)], { type: 'text/markdown;charset=utf-8' });
      var nm = 'code-report-' + (S.files[0] ? S.files[0].name.replace(/[^\w.-]+/g, '_') : (S.zip ? S.zip.name.replace(/\.zip$/i, '') : 'project')) + '.md';
      if (typeof omranSaveBlob === 'function') { omranSaveBlob(blob, nm); return; }
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = nm;
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    };
    $id('csCopy').onclick = function () {
      try { navigator.clipboard.writeText(toMarkdown(r)).then(function () { setStatus(t('copied')); }, function () { setStatus(''); }); }
      catch (e) { setStatus(''); }
    };
    var fx = $id('csFix');
    if (fx) fx.onclick = function () {
      var top = issues.filter(function (x) { return x.severity !== 'info'; }).slice(0, 8);
      var ask = (ar() ? 'أصلح هذه المشاكل التي كشفها التحليل:\n' : 'Fix these issues found by the analysis:\n')
        + top.map(function (x, i) { return (i + 1) + ') ' + (x.title || catName(x.category)) + (x.line ? ' (L' + x.line + ')' : '') + (x.fix ? ' — ' + x.fix.slice(0, 300) : ''); }).join('\n');
      var f0 = S.files[0];
      close();
      window.omranCodeFixOpenWith(f0.name, f0.content, ask);
    };
  }

  function toMarkdown(r) {
    var o = [];
    o.push('# ' + t('title') + ' — ' + (r.score == null ? '—' : r.score + '/100') + (r.grade ? ' (' + r.grade + ')' : ''));
    if (r.language) o.push(r.language);
    if (r.summary) o.push('', r.summary);
    if (r.verdict) o.push('', '## ' + t('verdict'), r.verdict);
    if (r.deep) o.push('', '## ' + t('deep'), '', r.deep);
    if (r.parsed && r.categories) {
      o.push('', '## ' + t('score'));
      for (var k in r.categories) if (Object.prototype.hasOwnProperty.call(r.categories, k)) o.push('- ' + catName(k) + ': ' + (r.categories[k] == null ? '—' : r.categories[k]));
    }
    if (r.recommendations && r.recommendations.length) { o.push('', '## ' + t('recs')); r.recommendations.forEach(function (x, i) { o.push((i + 1) + '. ' + x); }); }
    if (r.files && r.files.length > 1) { o.push('', '## ' + t('ranking')); r.files.forEach(function (f, i) { o.push((i + 1) + '. `' + f.name + '` — ' + (f.score == null ? '—' : f.score) + (f.note ? ' — ' + f.note : '')); }); }
    if (r.strengths && r.strengths.length) { o.push('', '## ' + t('strengths')); r.strengths.forEach(function (x) { o.push('- ' + x); }); }
    o.push('', '## ' + t('issues') + ' (' + (r.issues || []).length + ')');
    (r.issues || []).forEach(function (it) {
      o.push('', '### [' + sevName(it.severity) + '] ' + (it.title || catName(it.category)) + (it.file ? ' — `' + it.file + (it.line ? ':' + it.line : '') + '`' : ''));
      if (it.detail) o.push(it.detail);
      if (it.fix) o.push('', t('fix') + ':', '```', it.fix, '```');
    });
    if (r.metrics && r.metrics.totals) {
      var tt = r.metrics.totals;
      o.push('', '## ' + t('metrics'), '- ' + tt.files + ' ' + t('files') + ' · ' + tt.lines + ' ' + t('lines'));
      r.metrics.files.forEach(function (pf) { pf.flags.forEach(function (fg) { o.push('- `' + pf.name + '`: ' + fg.label + ' × ' + fg.count + (fg.lines.length ? ' (L' + fg.lines.join(', L') + ')' : '')); }); });
    }
    return o.join('\n') + '\n';
  }

  /* ---------- الزرّ: قائمة ⋮ في شريط التبويبات ---------- */
  function mount() {
    var dd = document.getElementById('tabsMenuDropdown');
    if (!dd || document.getElementById('btnCodeScore')) return true;
    var b = document.createElement('button');
    b.className = 'btn';
    b.id = 'btnCodeScore';
    b.type = 'button';
    b.title = t('menuTitle');
    b.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<path d="M12 20V10"></path><path d="M18 20V4"></path><path d="M6 20v-4"></path></svg> <span class="btnLabel">' + esc(t('menu')) + '</span>';
    b.onclick = function (e) { e.stopPropagation(); open(); };
    dd.appendChild(b);
    return true;
  }

  window.omranCodeScoreOpen = open;

  if (!mount()) {
    var n = 0;
    var tm = setInterval(function () { if (mount() || ++n > 40) clearInterval(tm); }, 300);
  }
})();
