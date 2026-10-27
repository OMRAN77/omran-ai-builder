/* v-read-panel (المالك ١٣ أكتوبر، بعد نموذجين في المحادثة: «لوحة الكود + الأرقام»): ما يقرؤه المزوّد أو الوكيل من GitHub يظهر
   في تبويب ثالث للوحة الجانبيّة («الكود المقروء») بأسطره المرقّمة كما قُرئت، وكلّ `مسار:سطر` في الردّ يصير رقمًا صغيرًا يفتح
   ذلك السطر مظلّلًا. الخادم يرسل المقطع مع سطر الأثر (code: {p,a,b,n,l} من github-read.fileExcerpt) — للمالك وحده.
   - live(x): مقطع وصل أثناء البثّ. أوّل مقطع في الدور يفرّغ اللوحة من الدور السابق، وعلى الحاسوب يفتحها مرّة على الكود المقروء.
   - pack(parts, reply): قبل الحفظ في الرسالة (m._agParts): بسقف حجم، وما زاد يُقصّ إلى نوافذ الأسطر المذكورة في الردّ.
   - linkify(el, parts): بعد رسم الردّ — المواضع التي قُرئت أسطرها فعلًا وحدها تصير أرقامًا؛ الباقي نصّ كما هو.
   الجوّال: لا فتح تلقائيّ ولا تغيير تخطيط — الرقم يفتح درج اللوحة القائم نفسه. */
(function(){
  var SAVE_MAX = 60000;   // حروف المقاطع المحفوظة في رسالة واحدة
  var CTX = 12;           // أسطر حول الموضع المذكور حين يُقصّ المقطع للحفظ
  var CITE_RE = /`?((?:[\w.\-]+\/)*[\w.\-]+\.[A-Za-z0-9]{1,8}):(\d{1,6})(?:[-–](\d{1,6}))?`?/g;
  var CITE_ANY = new RegExp(CITE_RE.source); // فحص بلا حالة lastIndex
  var files = [], cur = null, hl = null, fresh = true;

  function isMobile(){ return document.documentElement.classList.contains('mobile-ui'); }
  function tr(k, fb){ try{ var v = (typeof t === 'function') ? t(k) : ''; return (v && v !== k) ? v : fb; }catch(e){ __swallow(e, 'read:tr'); return fb; } }
  function base(p){ var s = String(p || ''); return s.slice(s.lastIndexOf('/') + 1); }

  /* مقاطع → ملفّات: الأسطر تُدمج بأرقامها، فقراءتان لملفّ واحد (from=) تصيران ملفًّا واحدًا. */
  function build(reads){
    var out = [];
    (reads || []).forEach(function(x){ merge(out, x); });
    return out;
  }
  function merge(list, x){
    if(!x || !x.p || !Array.isArray(x.l) || !(x.a >= 1)) return null;
    var f = null;
    for(var i = 0; i < list.length; i++) if(list[i].p === x.p){ f = list[i]; break; }
    if(!f){ f = { p: String(x.p), n: 0, rows: {} }; list.push(f); }
    if(x.n > f.n) f.n = x.n;
    for(var j = 0; j < x.l.length; j++) f.rows[x.a + j] = String(x.l[j]);
    return f;
  }
  /* المسار كما كتبه المزوّد ← الملفّ المقروء: مطابق، ثمّ لاحقة مسار، ثمّ اسم الملفّ إن لم يتكرّر. */
  function find(list, p){
    var q = String(p || '').replace(/^\.?\//, '');
    if(!q) return null;
    for(var i = 0; i < list.length; i++) if(list[i].p === q) return list[i];
    var suf = list.filter(function(f){ return f.p.slice(-q.length - 1) === '/' + q || q.slice(-f.p.length - 1) === '/' + f.p; });
    if(suf.length) return suf.length === 1 ? suf[0] : null; // لاحقة تطابق ملفّين = لا تخمين
    var bn = list.filter(function(f){ return base(f.p) === base(q); });
    return bn.length === 1 ? bn[0] : null;
  }
  function readsOf(parts){
    var r = [];
    (parts || []).forEach(function(p){ if(p && p.t === 'tool' && p.code && Array.isArray(p.code.l)) r.push(p.code); });
    return r;
  }
  function cites(text){
    var out = [], m, re = new RegExp(CITE_RE.source, 'g');
    while((m = re.exec(String(text || '')))){
      var a = Number(m[2]), b = Number(m[3] || m[2]);
      if(b < a){ var s = a; a = b; b = s; }
      out.push({ p: m[1], a: a, b: b, raw: m[0], i: m.index });
    }
    return out;
  }

  /* نصّ ← مقاطع: نصوص عاديّة، و{p,a,b,raw,n} لكلّ موضع قُرئ سطره الأوّل فعلًا (ما لم يُقرأ يبقى نصًّا كما هو).
     seq يرقّم المواضع بترتيب ظهورها في الردّ كلّه، والموضع المكرّر يأخذ رقمه الأوّل. null = لا موضع مقروء. */
  function segs(txt, list, seq){
    var out = [], last = 0;
    cites(txt).forEach(function(c){
      var f = find(list, c.p);
      if(!f || f.rows[c.a] === undefined) return;
      var k = f.p + ':' + c.a + '-' + c.b;
      if(!seq[k]) seq[k] = ++seq.n;
      if(c.i > last) out.push(txt.slice(last, c.i));
      out.push({ p: f.p, a: c.a, b: c.b, raw: c.raw, n: seq[k] });
      last = c.i + c.raw.length;
    });
    if(!last) return null;
    if(last < txt.length) out.push(txt.slice(last));
    return out;
  }

  /* ---------- اللوحة ---------- */
  function host(){ return document.getElementById('panel-read'); }
  function tab(){ return document.getElementById('tabRead'); }
  function render(at){
    var h = host(); if(!h) return;
    h.innerHTML = '';
    var tb = tab(); if(tb) tb.style.display = files.length ? '' : 'none';
    if(!files.length || !cur) return;
    var wrap = document.createElement('div'); wrap.className = 'rdWrap'; wrap.dir = 'ltr';
    wrap.setAttribute('data-keep-emoji', ''); // الكود كما قُرئ: منظّف الواجهة (v-clean-ui) كان يحذف إيموجي السطر ويقصّ مسافات بدايته
    var bar = document.createElement('div'); bar.className = 'rdFiles';
    files.forEach(function(f){
      var b = document.createElement('button'); b.type = 'button'; b.className = 'rdFile' + (f === cur ? ' on' : '');
      b.textContent = base(f.p); b.title = f.p;
      b.onclick = function(){ cur = f; hl = null; render(); };
      bar.appendChild(b);
    });
    wrap.appendChild(bar);
    var nums = Object.keys(cur.rows).map(Number).sort(function(x, y){ return x - y; });
    var head = document.createElement('div'); head.className = 'rdHead';
    var path = document.createElement('span'); path.className = 'rdPath'; path.textContent = cur.p;
    var meta = document.createElement('span'); meta.className = 'rdMeta';
    meta.textContent = 'L' + nums[0] + '–' + nums[nums.length - 1] + (cur.n ? ' / ' + cur.n : '');
    head.appendChild(path); head.appendChild(meta); wrap.appendChild(head);
    var code = document.createElement('div'); code.className = 'rdCode';
    var frag = document.createDocumentFragment(), first = null;
    for(var i = 0; i < nums.length; i++){
      var n = nums[i];
      if(i && n !== nums[i - 1] + 1){ var g = document.createElement('div'); g.className = 'rdGap'; g.textContent = '⋯'; frag.appendChild(g); }
      var row = document.createElement('div'); row.className = 'rdLn'; row.setAttribute('data-n', String(n));
      var no = document.createElement('span'); no.className = 'rdNo'; no.textContent = String(n);
      var tx = document.createElement('span'); tx.className = 'rdTx'; tx.textContent = cur.rows[n];
      row.appendChild(no); row.appendChild(tx);
      if(hl && n >= hl[0] && n <= hl[1]){ row.className += ' rdHl'; if(!first) first = row; }
      else if(!hl && at && n === at && !first) first = row;
      frag.appendChild(row);
    }
    code.appendChild(frag); wrap.appendChild(code); h.appendChild(wrap);
    /* تمرير داخل صندوق الكود وحده (rdCode موضعه نسبيّ) — scrollIntoView كان سيحرّك المحادثة معه على الجوّال */
    if(first) code.scrollTop = Math.max(0, first.offsetTop - code.clientHeight / 3);
  }
  function reveal(){
    try{
      if(typeof switchWorkTab === 'function') switchWorkTab('read');
      if(isMobile()){
        if(typeof workareaEl !== 'undefined' && workareaEl && !workareaEl.classList.contains('open') && typeof openDrawer === 'function') openDrawer(workareaEl);
      } else if(typeof window.waAutoExpand === 'function') window.waAutoExpand();
    }catch(e){ __swallow(e, 'read:reveal'); }
  }

  window.omranReadPanel = {
    /** بداية دور جديد: أوّل مقطع يصل بعدها يبدأ لوحة جديدة (ما قُرئ في الدور السابق يبقى حتّى ذلك). */
    begin: function(){ fresh = true; },
    live: function(x){
      try{
        if(fresh){ files = []; cur = null; hl = null; }
        var f = merge(files, x); if(!f) return;
        var first = fresh; fresh = false;
        var p = host(), shown = p && p.classList.contains('active');
        var follow = first || shown || !cur;
        if(follow) cur = f;
        /* v-read-fold (المالك ١٤ أكتوبر «يقرى الصفحة اريدها مطوية نفس نظام كلاود»): لا فتح تلقائيّ — التبويب يظهر والمستخدم يفتح كـRead في Claude Code. الرقم في الردّ ما زال يفتح السطر (open). */
        render(follow ? x.a : 0); // اللوحة تتبع آخر ما قُرئ إن كانت ظاهرة: ملفّه وأوّل سطر فيه
      }catch(e){ __swallow(e, 'read:live'); }
    },
    open: function(reads, p, a, b){
      try{
        files = build(reads);
        var f = find(files, p); if(!f) return false;
        cur = f; hl = [a, b || a]; fresh = true;
        reveal(); render();
        return true;
      }catch(e){ __swallow(e, 'read:open'); return false; }
    },
    pack: function(parts, reply){
      var withCode = (parts || []).filter(function(p){ return p && p.code && Array.isArray(p.code.l); });
      var size = function(){ return withCode.reduce(function(s, p){ return s + (p.code ? p.code.l.join('\n').length : 0); }, 0); };
      if(!withCode.length || size() <= SAVE_MAX) return parts;
      var cs = cites(reply);
      withCode.forEach(function(p){
        var c = p.code, lo = Infinity, hi = -Infinity, one = [{ p: c.p }];
        cs.forEach(function(x){ if(find(one, x.p) && x.b >= c.a && x.a <= c.b){ lo = Math.min(lo, x.a - CTX); hi = Math.max(hi, x.b + CTX); } });
        if(lo === Infinity){ delete p.code; return; }
        lo = Math.max(lo, c.a); hi = Math.min(hi, c.b);
        p.code = { p: c.p, r: c.r, a: lo, b: hi, n: c.n, l: c.l.slice(lo - c.a, hi - c.a + 1) };
      });
      withCode = withCode.filter(function(p){ return !!p.code; }).sort(function(x, y){ return y.code.l.length - x.code.l.length; });
      while(withCode.length && size() > SAVE_MAX){ delete withCode[0].code; withCode.shift(); }
      return parts;
    },
    linkify: function(el, parts){
      var reads = readsOf(parts);
      if(!el || !reads.length) return 0;
      var list = build(reads), seq = { n: 0 };
      var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: function(nd){
        for(var a = nd.parentNode; a && a !== el; a = a.parentNode){
          if(a.nodeType === 1 && (a.tagName === 'A' || a.tagName === 'BUTTON' || /\bchat-codeblock\b/.test(a.className || ''))) return NodeFilter.FILTER_REJECT;
        }
        return CITE_ANY.test(nd.nodeValue || '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      } });
      var nodes = [], nd;
      while((nd = walker.nextNode())) nodes.push(nd);
      nodes.forEach(function(node){
        var sg = segs(node.nodeValue, list, seq);
        if(!sg) return;
        var frag = document.createDocumentFragment();
        sg.forEach(function(x){
          if(typeof x === 'string'){ frag.appendChild(document.createTextNode(x)); return; }
          var b = document.createElement('button'); b.type = 'button'; b.className = 'rdCite'; b.dir = 'ltr';
          b.title = tr('readCite', 'Open in code panel') + ' — ' + x.p + ':' + x.a + (x.b !== x.a ? '–' + x.b : '');
          var cd = document.createElement('code'); cd.textContent = x.raw.replace(/`/g, '');
          var no = document.createElement('span'); no.className = 'rdCiteN'; no.textContent = String(x.n);
          b.appendChild(cd); b.appendChild(no);
          b.onclick = function(ev){ ev.stopPropagation(); window.omranReadPanel.open(reads, x.p, x.a, x.b); };
          frag.appendChild(b);
        });
        node.parentNode.replaceChild(frag, node);
      });
      return seq.n;
    },
    _segs: function(text, reads){ return segs(text, build(reads), { n: 0 }); }, // للاختبار
    _state: function(){ return { files: files, cur: cur, hl: hl }; }, // للاختبار
  };
})();
