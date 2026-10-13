/* v-work-log (المالك ١٣ أكتوبر، لقطة من واجهة Claude وهو يعمل: «سولي نفس هذي بالضبط»): عمل المزوّد في المحادثة صندوق واحد فوق الردّ.
   رأسه: شرارة + ما يفعله الآن + الوقت المنقضي + سهم. داخله إطار، وكلّ عنصر سطر عنوان ينفتح: التفكير أسطرًا قصيرة (جملة في
   السطر، وعنوانه آخر جملة)، والأداة «الطلب» ثمّ «النتيجة» في صندوقي كود. حيًّا: التفكير مفتوح إلى أوّل أداة؛ بعد الأداة يُطوى
   ولا يُضاف كلام تفكير جديد (v-edit-no-talk — المالك ١٣ أكتوبر: «اذا تعدل داخل التعديل يتكلم المزود» في صندوق التفكير).
   أحدث أداة وحدها مفتوحة وما قبلها يُطوى، والوقت يعدّ كلّ ثانية. محفوظًا (m._agParts وأوّله {t:'meta', ms}): مطويّ في سطر «عمل لمدّة …». سجلّ الوكيل القديم (بلا meta) يرسمه __agLogRender كما كان.
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
    body.appendChild(p.out ? pre(p.out, !!p.err) : mk('div', 'cwNone', tr('agNoOutput', 'No output')));
    var d = item(clip(p.title || p.name || ''), body, open);
    d.classList.add('cwTool');
    if(p.err) d.classList.add('cwFail');
    return d;
  }
  function textEl(p){ return mk('div', 'cwItem cwPlain', clip(p.s)); }
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
      var b = shell(true);
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
          var hasTool = false;
          Array.prototype.forEach.call(b.list.children, function(c){
            if(c.classList && c.classList.contains('cwTool')) hasTool = true;
          });
          /* v-edit-no-talk: بعد أوّل أداة كلام التفكير يملأ الصندوق — لا نضيفه ولا نطوي الأداة */
          if(p && p.t === 'think' && hasTool) return;
          Array.prototype.forEach.call(b.list.children, function(c){
            if(c.classList && c.classList.contains('cwTool')) c.open = false;
          });
          if(p && p.t === 'tool'){
            Array.prototype.forEach.call(b.list.children, function(c){ if(c.classList && c.classList.contains('cwThinkItem')) c.open = false; });
          }
          var el = partEl(p, true);
          if(el) b.list.appendChild(el);
        },
      };
    },
    /** السجلّ المحفوظ: صندوق مطويّ «عمل لمدّة …» وعناصره مطويّة بترتيبها. */
    render: function(parts){
      var b = shell(false);
      var meta = parts[0] || {};
      b.lb.textContent = tr('cwWorked', 'Worked for {t}').replace('{t}', dur(meta.ms));
      var sawTool = false;
      for(var i = 1; i < parts.length; i++){
        var p = parts[i];
        if(p && p.t === 'think' && sawTool) continue; /* v-edit-no-talk */
        if(p && p.t === 'tool') sawTool = true;
        var el = partEl(p, false); if(el) b.list.appendChild(el);
      }
      return b.d;
    },
    _lines: lines, _dur: dur, // للاختبار
  };
})();
