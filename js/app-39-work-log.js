/* v-work-log (المالك ١٣ أكتوبر، لقطة من واجهة Claude وهو يعمل: «سولي نفس هذي بالضبط»): عمل المزوّد في المحادثة صندوق واحد فوق الردّ.
   رأسه: شرارة + ما يفعله الآن + الوقت المنقضي + سهم. داخله إطار، وكلّ عنصر سطر عنوان ينفتح: التفكير أسطرًا قصيرة (جملة في
   السطر، وعنوانه آخر جملة)، والأداة «الطلب» ثمّ «النتيجة» في صندوقي كود. حيًّا: التفكير مسكّر حتّى يفتحه من يريد (v-think-closed)،
   والتفكير بين الأدوات يظهر مطويًّا (v-interleave). قراءة الصفحة/الملفّ مطويّة ولو كانت الأحدث (v-read-fold)، وغير القراءة الأحدث وحدها مفتوحة.
   الصندوق الحيّ نفسه يبدأ مطويًّا (v-live-fold): رأسه يقول ما يجري والوقت، ومن يريد التفاصيل يفتحه — كـClaude. ما يصل بعدها لا يفتحه ولا يطويه.
   محفوظًا (m._agParts وأوّله {t:'meta', ms}): مطويّ في سطر «عمل لمدّة …». سجلّ الوكيل القديم (بلا meta) يرسمه __agLogRender كما كان.
   النصوص: cwWorked وcwRequest وcwResponse وcwTimeM وcwTimeS وcwWorking (١٤ لغة). */
(function(){
  var TITLE_MAX = 120;
  function tr(k, fb){ try{ var v = (typeof t === 'function') ? t(k) : ''; return (v && v !== k) ? v : fb; }catch(e){ __swallow(e, 'work:tr'); return fb; } }
  function mk(tag, cls, txt){ var e = document.createElement(tag); if(cls) e.className = cls; if(txt !== undefined) e.textContent = txt; return e; }
  function dur(ms){
    var all = Math.max(1, Math.round((Number(ms) || 0) / 1000)), m = Math.floor(all / 60), s = all % 60;
    return m ? tr('cwTimeM', '{m}m {s}s').replace('{m}', String(m)).replace('{s}', String(s)) : tr('cwTimeS', '{s}s').replace('{s}', String(s));
  }
  /* ملخّص التفكير ← أسطر: سطر لكلّ جملة، بلا علامات العريض. */
  function lines(s){
    return String(s || '').replace(/\*\*/g, '').replace(/([.!?؟])\s+(?=\S)/g, '$1\n').split(/\n+/).map(function(x){ return x.trim(); }).filter(Boolean);
  }
  function clip(s){ s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > TITLE_MAX ? s.slice(0, TITLE_MAX - 1) + '…' : s; }
  function item(title, body, open){
    var d = mk('details', 'cwItem'); if(open) d.open = true;
    var s = mk('summary', 'cwSum'); s.appendChild(mk('span', 'cwTitle', title)); d.appendChild(s);
    d.appendChild(body);
    return d;
  }
  function thinkEl(p, open){
    var ls = lines(p.s);
    if(!ls.length) return mk('div', 'cwItem cwPlain', tr('agThought', '{n}s').replace('{n}', String(Math.max(1, Math.round((Number(p.ms) || 0) / 1000)))));
    var body = mk('div', 'cwThink');
    ls.forEach(function(l){ body.appendChild(mk('div', 'cwLine', l)); });
    var d = item(clip(ls[ls.length - 1]), body, open);
    d.classList.add('cwThinkItem');
    return d;
  }
  function pre(txt, err){ var p = mk('pre', 'cwPre' + (err ? ' cwErr' : ''), txt); p.dir = 'ltr'; return p; }
  function toolEl(p, open){
    var body = mk('div', 'cwTool');
    if(p.cmd){ body.appendChild(mk('div', 'cwLbl', tr('cwRequest', 'Request'))); body.appendChild(pre(p.cmd, false)); }
    body.appendChild(mk('div', 'cwLbl', tr('cwResponse', 'Response')));
    body.appendChild(p.out ? pre(p.out, !!p.err) : mk('div', 'cwNone', p.run ? '…' : tr('agNoOutput', 'No output'))); // v-interleave-fix: الجارية «…» لا «بلا ناتج»
    var d = item(clip(p.title || p.name || ''), body, open);
    d.classList.add('cwTool');
    if(p.err) d.classList.add('cwFail');
    return d;
  }
  function textEl(p){
    var s = String(p.s || '').trim();
    if(s.length <= TITLE_MAX) return mk('div', 'cwItem cwPlain', clip(s));
    /* v-interleave-fix: كلام الوكيل المحفوظ كان يُقصّ عند ١٢٠ حرفًا بلا فتح — الطويل سطر عنوانه أوّله وينفتح على كامله */
    var body = mk('div', 'cwThink'); s.split(/\n+/).forEach(function(l){ if(l.trim()) body.appendChild(mk('div', 'cwLine', l.trim())); });
    return item(clip(s.split(/\n/)[0]), body, false);
  }
  /* v-interleave: أدوات متتالية من النوع نفسه سطر واحد «آخر عنوان · +N ›» (كـ«git, 2+» في Claude Code)، ينفتح على خطواتها */
  function groupTitle(g){ var n = g.__items.length; return clip(g.__items[n - 1].title || g.__items[n - 1].name || '') + (n > 1 ? '  · +' + (n - 1) : ''); }
  function groupEl(items){
    var body = mk('div', 'cwGroupList');
    var d = item('', body, false); d.classList.add('cwTool'); d.classList.add('cwGroup'); d.__items = [];
    items.forEach(function(p){ groupAdd(d, p); });
    return d;
  }
  function groupAdd(g, p){
    g.__items.push(p);
    var el = toolEl(p, false); g.lastChild.appendChild(el);
    g.querySelector('.cwTitle').textContent = groupTitle(g);
    if(p.err) g.classList.add('cwFail');
    return el;
  }
  function sameKind(a, b){ return !!(a && b && a.t === 'tool' && b.t === 'tool' && a.name && a.name === b.name); }
  /* v-read-fold (المالك ١٤ أكتوبر «يقرى الصفحة اريدها مطوية نفس نظام كلاود»): قراءة الصفحة/الملفّ سطر مطويّ كـRead في Claude Code — لا تُفتح ولو كانت الأحدث. */
  function isRead(p){
    if(!p || p.t !== 'tool') return false;
    if(p.code) return true;
    return /^(?:trFetch|stFetchPage|trFetchFail|fetch_page|read_github|Read)$/i.test(String(p.name || ''));
  }
  function partEl(p, open){
    if(!p) return null;
    if(p.t === 'think') return thinkEl(p, open);
    if(p.t === 'tool') return toolEl(p, open);
    if(p.t === 'text' && String(p.s || '').trim()) return textEl(p);
    return null;
  }
  function shell(open){
    var d = mk('details', 'cwBox'); d.open = !!open;
    var s = mk('summary', 'cwHead');
    var ic = mk('span', 'cwIc', '✦'), lb = mk('span', 'cwLabel'), tm = mk('span', 'cwTime');
    s.appendChild(ic); s.appendChild(lb); s.appendChild(tm); d.appendChild(s);
    var list = mk('div', 'cwList'); d.appendChild(list);
    return { d: d, ic: ic, lb: lb, tm: tm, list: list };
  }

  window.omranWorkLog = {
    /** الصندوق الحيّ قبل الفقاعة المؤقّتة: head(نصّ) لما يفعله الآن، add(جزء) لتفكير أو خطوة وصلت. */
    live: function(anchor, t0, head){
      var b = shell(false); // v-live-fold (المالك ١٥ أكتوبر «اريد انطواء الصفحة عندما يبدا»): يبدأ مطويًّا كـClaude، والرأس يكفي
      b.d.classList.add('cwLive'); b.ic.classList.add('chat-status-spark');
      b.lb.textContent = head || tr('cwWorking', 'Working…');
      if(anchor && anchor.parentNode) anchor.parentNode.insertBefore(b.d, anchor);
      if(anchor && anchor.classList) anchor.classList.add('cwOn'); // شريط الحالة القديم يختفي: الرأس يقول ما يحدث
      var start = Number(t0) || Date.now();
      var tick = function(){ b.tm.textContent = dur(Date.now() - start); };
      tick();
      var iv = setInterval(function(){ if(!b.d.isConnected){ clearInterval(iv); return; } tick(); }, 1000);
      return {
        el: b.d,
        head: function(txt){ if(txt) b.lb.textContent = txt; },
        add: function(p){
          /* v-interleave: كلام التفكير بين الأدوات يظهر (كان v-edit-no-talk يحجبه) — مطويًّا، والأداة الأحدث وحدها مفتوحة */
          var last = b.list.lastElementChild;
          if(p && p.t === 'tool' && last && last.__last && sameKind(last.__last, p)){
            var g = last.classList.contains('cwGroup') ? last : null;
            if(!g){ g = groupEl([last.__last]); b.list.replaceChild(g, last); }
            groupAdd(g, p); g.__last = p;
            return;
          }
          Array.prototype.forEach.call(b.list.children, function(c){
            if(c.classList && c.classList.contains('cwTool')) c.open = false;
          });
          if(p && p.t === 'tool'){
            Array.prototype.forEach.call(b.list.children, function(c){ if(c.classList && c.classList.contains('cwThinkItem')) c.open = false; });
          }
          /* v-think-closed: التفكير مطويّ. v-read-fold: قراءة الصفحة مطويّة كـClaude؛ غيرها الأحدث تُفتح */
          var el = partEl(p, p && p.t === 'tool' && !isRead(p));
          if(el){ el.__last = p; b.list.appendChild(el); }
        },
      };
    },
    /** السجلّ المحفوظ: صندوق مطويّ «عمل لمدّة …» وعناصره مطويّة بترتيبها. */
    render: function(parts){
      var b = shell(false);
      var meta = parts[0] || {};
      b.lb.textContent = tr('cwWorked', 'Worked for {t}').replace('{t}', dur(meta.ms));
      for(var i = 1; i < parts.length; i++){
        var p = parts[i];
        if(p && p.t === 'tool' && sameKind(p, parts[i + 1])){ // v-interleave: المتتالية من النوع نفسه سطر واحد
          var run = [p]; while(sameKind(p, parts[i + 1])){ run.push(parts[++i]); }
          b.list.appendChild(groupEl(run)); continue;
        }
        var el = partEl(p, false); if(el) b.list.appendChild(el);
      }
      return b.d;
    },
    thinkEl: thinkEl, toolEl: toolEl, groupEl: groupEl, groupAdd: groupAdd, isRead: isRead, // v-interleave · v-read-fold
    _lines: lines, _dur: dur, // للاختبار
  };
})();
