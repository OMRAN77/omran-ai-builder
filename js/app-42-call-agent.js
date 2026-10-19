/* ───────── v-call-agent: بطاقة «اتّصل بالنيابة عنّي» ومكالمتها (أمر المالك ١٧ أكتوبر: الوكيل يتّصل بالعيادة أو الصالون أو
 * المطعم ويحجز عنه — المالك مجّانًا، والمشترك بباقة سارية بالنقاط: v-call-agent-paid) ─────────
 * الخادم (أداة المالك) يبثّ حدث cards بنوع call فيُحفظ في رسالة المساعد (m.cards.call) ويُرسم هنا بدل شبكة البطاقات — سطر
 * واحد أوّل window.omranRenderCards في app-37. زرّان:
 *  «🎧 جرّب عليّ» — جلسة صوت حيّة مستقلّة في المتصفّح (call-session): المساعد «يتّصل» بالمالك وهو يمثّل الجهة.
 *    حالتها ونافذتها خاصّتان (لا شاشة مكالمة مها ولا متغيّرات جلستها الحيّة)، بلا إعادة اتّصال تلقائيّ (الجلسة الجديدة تنسى
 *    المكالمة — انقطاعها يُسجَّل «انقطعت» بما قيل)، وفحص إلغاء بعد كلّ await (فخّ سباق الإعداد)، ولا تبدأ ومكالمة مها
 *    جارية — وmahaStartCall يسأل window.callAgentBusy() فلا تُفتح مها فوقها. المالك يتكلّم أوّلًا («ألو»)، وإن سكت
 *    ٣ ثوانٍ بعد الجاهزيّة يبادر المساعد بجملة التعريف. سقف العميل maxMin دقائق.
 *  «📞 اتّصل فعليًّا» — call-start ثمّ call-status كلّ ثانيتين حتّى ended (حدّ ١٠ دقائق) وإلغاء بـcall-cancel. يُخفى إن
 *    لم يكن الرقم جاهزًا (phoneReady).
 * الحالة الحيّة تُكتب في m.cards.call (state/callId/transport/outcome/transcript) ثمّ saveState() — والنتيجة رسالة مساعد
 * واحدة في المحادثة نفسها. DOM فقط: نصّ الخادم يدخل textContent ولا يُفسَّر HTML أبدًا. لا اسم مزوّد ولا خدمة اتّصال في أيّ نصّ ظاهر (١٤ لغة).
 * v-call-agent-r2 (المراجعة): البطاقة تُحدَّث في مكانها لا بـrenderAll (حارس الرسم يتخطّاه ما لم تتغيّر الرسائل)، تدفّق واحد لكلّ
 * بطاقة، تجربة قُطعت بإغلاق الصفحة تُحسم في التحميل التالي، أسطر النصّ تُلحق إلحاقًا، والعقد v2: اسم المحلّ من الخرائط والمتّصَل
 * باسمه والتفاصيل على البطاقة وفي التأكيد.
 * v-call-agent-cut (المالك: «الصوت يقطع لكن المحادثة الي هي الكتابة موجوده»): نصّ الجملة يصل كاملًا قبل صوتها، فإن قاطعها كلام
 * الطرف الآخر (المقاطعة في الخادم تمسح ما لم يُسمع) بقيت كاملة على الشاشة والصوت مقطوع. الآن سطر الردّ المقطوع يُعلَّم « …»
 * (بمعرّف الردّ، في أيّ ترتيب وصل النصّ والقطع)، و«قل ألو» لا يظهر قبل أن يُفتح المايك، وكلّ تجربة بدأت ترسل عند نهايتها أثرًا
 * واحدًا بلا نصّ (diag:call-trial) يفرّق بين مقاطعة وصدى وشبكة.
 * v-call-agent-paid (المالك ١٨ أكتوبر: «الاتصال الالي مايشتغل لي المستخدمين» ← المشتركين بباقة، والتجربة بنفس السعر): لغير
 * المالك سعر الدقيقة وسطر الحجز على البطاقة، وتأكيد بلغته فيه السعر قبل التجربة والاتّصال الفعليّ (الطلب يحمل confirmed فلا يظهر
 * تأكيد الخادم العربيّ ٤٢٨)، والتجربة ترسل نهايتها call-trial-end (keepalive، ويُعاد إرسالها حتّى يقبلها الخادم) ليُرجع ما زاد عن
 * الدقائق المبدوءة. plan_required وpoints_insufficient برسالتين بالـ١٤ لغة. المراجعة: معرّف التجربة يولّده العميل ويحفظه في الكرت قبل
 * الطلب (c.trialEnds لكلّ تجربة على حدة)، والتحميل يمرّ على كلّ الكروت (sweep) لنهايات معلّقة ومكالمات لم تُحسم تسويتها، والاستطلاع
 * يكمل بعد «انتهت» ما دامت التسوية لم تُحسم (billing: null). */
(function(){
  'use strict';
  var PTS_LAND = 50, PTS_MOB = 45;           // سعر الدقيقة لغير المالك (المالك مجّانًا) — من العقد؛ الكرت يحمل ptsPerMin من الخادم
  var POLL_MS = 2000, POLL_MAX_MS = 10 * 60 * 1000;
  var SETTLE_WAIT_MS = 15 * 60 * 1000; // أوّل billing: null يمدّ المتابعة مرّة: مطالبة تسوية عالقة تُعاد بعد ٦ دقائق عند الخادم (CLAIM_STALE_MS) — المراجعة الرابعة
  var SILENT_OPEN_MS = 3000;                  // صمت ٣ث بعد الجاهزيّة ← المساعد يبادر
  var SETUP_MAX_MS = 20000;                   // تجهيز أطول من هذا = فشل صريح لا انتظار بلا نهاية
  var END_GRACE_MS = 1200, END_MAX_MS = 8000; // end_call: ننتظر انتهاء جملة الوداع، وبحدّ أقصى
  var LINES_MAX = 40, LINE_CHARS = 400;
  var CUT_MARK = ' …', TRACE_HEAD = 30, TRACE_TAIL = 50, RTP_MS = 5000; // v-call-agent-cut: علامة السطر المقطوع، وسقف الأثر، وفترة قراءة إحصاءات الصوت الوارد
  var RT_URL = 'https://api.openai.com/v1/realtime/calls'; // تبادل SDP كمسار مها نفسه — عنوان شبكة لا نصّ ظاهر
  var ACTIVE = { mic: 1, connecting: 1, live: 1, queued: 1, ringing: 1, 'in-progress': 1 };
  var PHONE_STATES = { queued: 1, ringing: 1, 'in-progress': 1, completed: 1, busy: 1, 'no-answer': 1, failed: 1, canceled: 1 };
  var ST = { mic: 'callAgentStMic', connecting: 'callAgentStConnecting', live: 'callAgentStLive', queued: 'callAgentStQueued',
    ringing: 'callAgentStRinging', 'in-progress': 'callAgentStLive', completed: 'callAgentStCompleted', busy: 'callAgentStBusy',
    'no-answer': 'callAgentStNoAnswer', failed: 'callAgentStFailed', canceled: 'callAgentStCanceled', dropped: 'callAgentStDropped',
    timeout: 'callAgentStTimeout' };
  var OC = { booked: 'callAgentOcBooked', not_available: 'callAgentOcNotAvailable', needs_user: 'callAgentOcNeedsUser',
    declined: 'callAgentOcDeclined', no_answer: 'callAgentStNoAnswer', failed: 'callAgentOcFailed' };
  var ERR = { owner_only: 'callAgentErrOwner', proposal_not_found: 'callAgentErrExpired', no_key: 'callAgentErrNoKey',
    relay_not_configured: 'callAgentErrRelay', no_phone: 'callAgentErrNoPhone', bad_phone: 'callAgentErrBadPhone',
    busy: 'callAgentErrBusy', outside_hours: 'callAgentErrHours', plan_required: 'callAgentErrPlan', points_insufficient: 'callAgentErrPoints' };

  var trial = null;   // جلسة التجربة الحيّة الوحيدة في هذا التبويب
  var polls = {};     // callId ← متابعة الاتّصال الفعليّ
  var mounted = {};   // id ← آخر غلاف بطاقة مرسوم (السطر الحيّ يُحدَّث في مكانه بلا renderAll لكلّ سطر)
  var notes = {};     // id ← ملاحظة عابرة على البطاقة (خطأ أو رفض) — لا تُحفظ
  var starting = {};  // id ← بدء اتّصال فعليّ جارٍ (ضغطتان سريعتان = طلب واحد)
  var settling = {};  // id ← حسم تجربة معلّقة بعد إعادة التحميل مجدول (مرّة واحدة)
  var ending = {};    // معرّف التجربة ← إرسال نهايتها جارٍ (لا طلبان معًا)
  var tried = {};     // معرّف التجربة ← محاولات إرسال نهايتها في هذه الصفحة (ثانية بعد مهلة، والباقي في التحميل التالي)
  var inflight = {};  // معرّف التجربة ← وعد إرسال نهايتها الجاري (تنتظره «جرّب» قبل طلب جلسة جديدة)
  var MARK = 'omranCallTrialLive'; // id التجربة الجارية في هذا المتصفّح: التحميل التالي يعرف أنّها انقطعت هنا لا أنّها حيّة في جهاز آخر

  /* ── أدوات صغيرة ── */
  function tt(k){ try{ var v = (typeof t === 'function') ? t(k) : k; return (typeof v === 'string' && v) ? v : k; }catch(e){ return k; } }
  function fill(s, map){ s = String(s); for(var k in map) s = s.split('{' + k + '}').join(String(map[k])); return s; }
  function clip(s, n, keepNl){
    s = String(s == null ? '' : s).replace(keepNl ? /[\u0000-\u0009\u000b-\u001f\u007f]+/g : /[\u0000-\u001f\u007f]+/g, ' ')
      .replace(/[ \t]{2,}/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }
  function el(tag, cls, text){ var e = document.createElement(tag); if(cls) e.className = cls; if(text != null) e.textContent = String(text); return e; }
  function btn(cls, label, fn){
    var b = el('button', cls, label); b.type = 'button';
    b.addEventListener('click', function(ev){ try{ if(ev && ev.stopPropagation) ev.stopPropagation(); fn(); }catch(e){ __swallow(e, 'call-agent:click'); } });
    return b;
  }
  function now(){ return Date.now(); }
  function mmss(sec){ sec = Math.max(0, Math.round(Number(sec) || 0)); var m = Math.floor(sec / 60), s = sec % 60; return m + ':' + (s < 10 ? '0' : '') + s; }
  function isOwner(){ try{ return typeof omranOwnerUi === 'function' && !!omranOwnerUi(); }catch(e){ return false; } }
  function token(){ try{ return (typeof authGet === 'function' && authGet('aiapp_auth_token')) || ''; }catch(e){ return ''; } }
  /* v-call-agent-paid: سعر الدقيقة وسقف المكالمة كما يحجزهما الخادم (quote: الدقائق × السعر) */
  function perMin(c){ return Number(c.ptsPerMin) || (c.kind === 'mobile' ? PTS_MOB : PTS_LAND); }
  function capMin(c){ return Math.max(1, Math.min(10, Math.round(Number(c.maxMin) || 4))); }
  function priceLines(c){ return fill(tt('callAgentPrice'), { n: perMin(c) }) + '\n' + fill(tt('callAgentHold'), { n: perMin(c) * capMin(c) }); }
  function paidBody(b){ return isOwner() ? b : Object.assign({ confirmed: true }, b); } // العميل سأل بلغته وفيه السعر — لا تأكيد ثانٍ من الخادم
  function mahaBusy(){
    try{ return (typeof mahaCallActive !== 'undefined' && !!mahaCallActive) || (typeof mahaCallStarting !== 'undefined' && !!mahaCallStarting); }
    catch(e){ return false; }
  }
  function stopStream(st){ try{ if(st && st.getTracks) st.getTracks().forEach(function(tr){ tr.stop(); }); }catch(e){ __swallow(e, 'call-agent:stream'); } }

  /* ── الحالة في الرسالة: كلّ بطاقة بنفس المعرّف في كلّ المحادثات (المحمّل من IndexedDB قد يستبدل الكائنات) ── */
  function each(id, fn){
    if(!id) return;
    try{
      var ps = (typeof state !== 'undefined' && state && Array.isArray(state.projects)) ? state.projects : [];
      var hits = [];
      ps.forEach(function(p){
        (p && Array.isArray(p.messages) ? p.messages : []).forEach(function(m){
          var c = m && m.cards && m.cards.kind === 'call' && m.cards.call;
          if(c && c.id === id) hits.push([c, p]);
        });
      });
      hits.forEach(function(h){ fn(h[0], h[1]); });
    }catch(e){ __swallow(e, 'call-agent:find'); }
  }
  function find(id){ var out = null; each(id, function(c){ if(!out) out = c; }); return out; }
  function patch(id, obj){
    each(id, function(c, p){
      Object.assign(c, obj);
      // __saveFlush يحفظ غير المفتوحة من نسخة مخبّأة — مكالمة في محادثة أخرى تُبطل نسختها فلا يضيع تحديثها
      try{ if(typeof __projJsonCache !== 'undefined' && __projJsonCache && typeof __projJsonCache.delete === 'function') __projJsonCache.delete(p); }
      catch(e){ __swallow(e, 'call-agent:cache'); }
    });
  }
  function persist(){ try{ if(typeof saveState === 'function') saveState(); }catch(e){ __swallow(e, 'call-agent:save'); } }
  /* renderAll لا يعيد رسم البطاقة إلّا إن تغيّرت الرسائل (حارس v-render-guard: العدد ومجموع أطوال النصّ) — يُستدعى فقط بعد رسالة
   * نتيجة جديدة؛ تغيّر الحالة وحده يمرّ بـrefresh الذي يحدّث الغلاف المرسوم في مكانه */
  function rerender(){ try{ if(typeof renderAll === 'function') renderAll(true); }catch(e){ __swallow(e, 'call-agent:render'); } }
  function inCurrent(id){
    try{
      var cur = (typeof getCurrent === 'function') ? getCurrent() : null;
      return !!(cur && Array.isArray(cur.messages) && cur.messages.some(function(m){ return m && m.cards && m.cards.call && m.cards.call.id === id; }));
    }catch(e){ __swallow(e, 'call-agent:current'); return false; }
  }
  function refresh(id){
    var w = mounted[id], c = find(id);
    if(w && c && w.isConnected){ fillCard(w, c); return; }
    if(inCurrent(id)) rerender();
  }
  function cleanOutcome(o){
    if(!o || typeof o !== 'object') return null;
    var st = String(o.status || '');
    if(!OC[st]) st = 'failed';
    return { status: st, summary: clip(o.summary, 600, true), confirmed_details: clip(o.confirmed_details, 500, true), follow_up: clip(o.follow_up, 300, true) };
  }
  function cleanLines(arr){
    return (Array.isArray(arr) ? arr : []).map(function(l){
      return l && { who: l.who === 'callee' ? 'callee' : 'agent', text: clip(l.text, LINE_CHARS) };
    }).filter(function(l){ return l && l.text; }).slice(-LINES_MAX);
  }
  function stateLabel(s){ return tt(ST[s] || 'callAgentStCompleted'); }
  function ocLabel(s){ return tt(OC[s] || 'callAgentOcFailed'); }
  function resultText(c){
    var o = c.outcome ? cleanOutcome(c.outcome) : null;
    var lines = [fill(tt('callAgentResultHead'), { b: clip(c.business, 80), s: o ? ocLabel(o.status) : stateLabel(c.state) })];
    if(o){
      if(o.summary) lines.push(o.summary);
      if(o.confirmed_details) lines.push(tt('callAgentDetails') + ': ' + o.confirmed_details);
      if(o.follow_up) lines.push(tt('callAgentFollowUp') + ': ' + o.follow_up);
    } else lines.push(tt('callAgentResultNone'));
    if(c.durationSec) lines.push(tt('callAgentDuration') + ': ' + mmss(c.durationSec));
    return lines.join('\n');
  }
  /* نتيجة واحدة لكلّ مكالمة: resultPushed في البطاقة نفسها (محفوظة) — لا تتكرّر مع إعادة رسم أو استطلاع متأخّر */
  function pushResult(id){
    var first = null, done = false;
    each(id, function(c, p){ if(c.resultPushed) done = true; if(!first) first = [c, p]; });
    if(done || !first || !Array.isArray(first[1].messages)) return false;
    patch(id, { resultPushed: true });
    first[1].messages.push({ role: 'assistant', content: resultText(first[0]) });
    return true;
  }
  function marked(){ try{ return (typeof localStorage !== 'undefined' && localStorage.getItem(MARK)) || ''; }catch(e){ __swallow(e, 'call-agent:mark-get'); return ''; } }
  function mark(id){
    try{ if(typeof localStorage === 'undefined') return; if(id) localStorage.setItem(MARK, id); else localStorage.removeItem(MARK); }
    catch(e){ __swallow(e, 'call-agent:mark-set'); }
  }
  function unmark(id){ if(id && marked() === id) mark(''); }

  /* ── الأنماط: ألوان مثبّتة بـ!important كبطاقات app-37 (قواعد روابط الرسالة والثيمات أعلى تخصيصًا) ── */
  function css(){
    if(document.getElementById('omranCallCss')) return;
    var st = document.createElement('style');
    st.id = 'omranCallCss';
    st.textContent = '.omCallWrap{margin:6px 0 10px;max-width:560px;white-space:normal;}'
      + '.msg .omCall{display:flex;flex-direction:column;gap:9px;padding:12px 14px;border:1px solid var(--border,rgba(255,255,255,.12));border-radius:var(--r-3,14px);background:var(--panel2,#161c2a);color:var(--text,#eee) !important;}'
      + '.omCallHead{display:flex;align-items:center;gap:10px;min-width:0;}'
      + '.msg .omCallIco{flex:0 0 auto;width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;background:rgba(16,185,129,.14);}'
      + '.omCallHeadTxt{display:flex;flex-direction:column;gap:1px;min-width:0;}'
      + '.msg .omCallKicker{font-size:11.5px;color:var(--muted,#9aa3b2) !important;}'
      + '.msg .omCallBiz{font-size:15.5px;font-weight:800;line-height:1.35;color:var(--text,#eee) !important;overflow-wrap:anywhere;}'
      + '.msg .omCallPhone{align-self:flex-start;font-size:12.5px;color:var(--muted,#9aa3b2) !important;unicode-bidi:isolate;direction:ltr;}' /* عرض محتواه عند بداية السطر (يمين العربيّة) — الأرقام من اليسار */
      + '.msg .omCallPlace{font-size:12px;line-height:1.5;color:var(--muted,#9aa3b2) !important;overflow-wrap:anywhere;}'
      + '.msg .omCallPlace span{display:inline-block;max-width:100%;}' /* الاسم كتلة واحدة: إن لم يتّسع نزل كاملًا للسطر التالي لا مقسومًا عند الحافّة */
      + '.msg .omCallGoal,.msg .omCallWho,.msg .omCallShare{font-size:13.5px;line-height:1.6;color:var(--text,#eee) !important;overflow-wrap:anywhere;}'
      + '.msg .omCall b{font-weight:700;color:inherit;}'
      + '.omCallMeta{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;font-size:12.5px;}'
      + '.msg .omCallMeta span{color:var(--muted,#9aa3b2) !important;}'
      + '.msg .omCallMeta .omCallFree{color:#10b981 !important;font-weight:700;}'
      + '.msg .omCallMeta .omCallCost{font-weight:700;}'
      + '.msg .omCallPrice{font-size:11.5px;line-height:1.5;color:var(--muted,#9aa3b2) !important;}'
      + '.omCallState{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;}'
      + '.msg .omCallState span{color:var(--text,#eee) !important;}'
      + '.msg .omCallState .omCallDur{color:var(--muted,#9aa3b2) !important;font-weight:500;unicode-bidi:isolate;direction:ltr;}'
      + '.omCallDot{flex:0 0 auto;width:8px;height:8px;border-radius:50%;background:#9aa3b2;}'
      + '.omCallLive .omCallDot{background:#10b981;animation:omCallPulse 1.2s ease-in-out infinite;}'
      + '.omCallLines{display:flex;flex-direction:column;gap:4px;max-height:180px;overflow-y:auto;padding:8px 10px;border-radius:10px;background:rgba(127,127,127,.08);}'
      + '.msg .omCallLine{font-size:12.5px;line-height:1.55;color:var(--text,#eee) !important;}'
      + '.msg .omCallAgent b{color:#a78bfa !important;}'
      + '.msg .omCallCallee b{color:#0ea5e9 !important;}'
      + '.omCallOutcome{display:flex;flex-direction:column;gap:3px;padding:8px 10px;border-radius:10px;border:1px solid rgba(16,185,129,.4);background:rgba(16,185,129,.08);}'
      + '.omCallOc-not_available,.omCallOc-declined,.omCallOc-failed,.omCallOc-no_answer{border-color:rgba(239,68,68,.4);background:rgba(239,68,68,.07);}'
      + '.omCallOc-needs_user{border-color:rgba(245,158,11,.45);background:rgba(245,158,11,.08);}'
      + '.msg .omCallOcHead{font-size:13.5px;font-weight:800;color:var(--text,#eee) !important;}'
      + '.msg .omCallOcText{font-size:13px;line-height:1.6;white-space:pre-wrap;color:var(--text,#eee) !important;}'
      + '.msg .omCallNote{font-size:12.5px;line-height:1.5;color:#d97706 !important;}'
      + '.omCallBtns{display:flex;flex-wrap:wrap;gap:8px;}'
      + '.msg .omCallBtn{-webkit-appearance:none;appearance:none;min-height:40px;padding:9px 16px;border-radius:999px;font:inherit;font-size:13.5px;font-weight:700;cursor:pointer;border:1px solid var(--border,rgba(255,255,255,.18)) !important;background:rgba(127,127,127,.12) !important;color:var(--text,#eee) !important;box-shadow:none !important;text-decoration:none !important;}'
      + '.msg .omCallBtn:hover{border-color:#10b981 !important;}'
      + '.msg .omCallDial{background:#059669 !important;border-color:transparent !important;color:#fff !important;}'
      + '.msg .omCallStop{background:#dc2626 !important;border-color:transparent !important;color:#fff !important;}'
      + '.msg .omCallBtn:disabled{opacity:.5;cursor:default;}'
      + '.msg .omCallLegal{font-size:11px;line-height:1.5;color:var(--muted,#9aa3b2) !important;}'
      + 'html.mobile-ui .omCallWrap{max-width:100%;}'
      + 'html.mobile-ui .omCallBtns .omCallBtn{flex:1 1 auto;}'
      + 'html[data-mode="light"] .msg .omCall{background:#fff;border-color:rgba(0,0,0,.12);}'
      + 'html[data-mode="light"] .msg .omCallAgent b{color:#7c3aed !important;}'
      + 'html[data-mode="light"] .msg .omCallCallee b{color:#0369a1 !important;}'
      + 'html[data-mode="light"] .msg .omCallMeta .omCallFree{color:#047857 !important;}'
      /* نافذة التجربة: عائمة صغيرة في الحاسوب، شريط سفليّ في الجوّال — لا تغطّي المحادثة كلّها ولا تخفي شاشة الترحيب */
      + '#omranCallOverlay{position:fixed;z-index:10060;top:72px;inset-inline-end:24px;width:340px;max-width:calc(100vw - 32px);box-sizing:border-box;display:flex;flex-direction:column;gap:10px;padding:14px;border-radius:18px;border:1px solid var(--border,rgba(255,255,255,.14));background:var(--panel2,#161c2a);color:var(--text,#eee);box-shadow:0 18px 50px rgba(0,0,0,.45);font-size:14px;}'
      + 'html.mobile-ui #omranCallOverlay{top:auto;bottom:0;inset-inline:0;width:auto;max-width:none;border-radius:20px 20px 0 0;border-bottom:0;padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px));}' /* لوح سفليّ كامل: لا يطلّ شريط التنقّل من تحته */
      + 'html[data-mode="light"] #omranCallOverlay{background:#fff;border-color:rgba(0,0,0,.12);box-shadow:0 18px 50px rgba(0,0,0,.18);}'
      + '.omCallOvTop{display:flex;align-items:center;gap:10px;}'
      + '.omCallOvPulse{flex:0 0 auto;width:12px;height:12px;border-radius:50%;background:#10b981;animation:omCallPulse 1.2s ease-in-out infinite;}'
      + '.omCallOvTx{flex:1 1 auto;min-width:0;}'
      + '#omranCallOverlay .omCallOvTitle{font-size:14px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text,#eee) !important;}'
      + '#omranCallOverlay .omCallOvState,#omranCallOverlay .omCallOvTime,#omranCallOverlay .omCallOvHint{font-size:12.5px;line-height:1.5;color:var(--muted,#9aa3b2) !important;}'
      + '.omCallOvTime{font-variant-numeric:tabular-nums;unicode-bidi:isolate;direction:ltr;}'
      + '.omCallOvLines{display:flex;flex-direction:column;gap:4px;max-height:150px;overflow-y:auto;font-size:13px;line-height:1.55;}'
      + '.omCallOvLines:empty{display:none;}'
      + '.omCallOvHint:empty{display:none;}'
      + '#omranCallOverlay .omCallOvLines b{color:#a78bfa !important;}'
      + '#omranCallOverlay .omCallOvEnd{-webkit-appearance:none;appearance:none;min-height:44px;padding:11px;border:0 !important;border-radius:999px;background:#dc2626 !important;color:#fff !important;font:inherit;font-size:14px;font-weight:800;cursor:pointer;}'
      + '@keyframes omCallPulse{0%,100%{opacity:1}50%{opacity:.35}}'
      + '@media (prefers-reduced-motion:reduce){.omCallDot,.omCallOvPulse{animation:none !important;}}';
    document.head.appendChild(st);
  }

  /* ── البطاقة ── */
  function viewState(c){
    var s = String(c.state || '');
    // تجربة «جارية» محفوظة بلا جلسة حيّة في هذا التبويب (إعادة تحميل، جهاز آخر) = انقطعت — عرضًا فقط، لا كتابة أثناء الرسم
    if(c.transport === 'trial' && ACTIVE[s] && !(trial && trial.id === c.id)) return 'dropped';
    return s;
  }
  /* البطاقة تُحدَّث في مكانها: حارس الرسم (v-render-guard في renderMessages) يتخطّى renderAll ما دام عدد الرسائل ونصّها لم
   * يتغيّرا — فتغيّر m.cards.call وحده لا يعيد رسمها أبدًا (خطأ التجهيز لا يظهر، وزرّ الإنهاء يبقى عالقًا). لكلّ قسم بصمة ما
   * يعرضه ولا يُبنى من جديد إلّا إن تغيّرت؛ وأسطر النصّ تُلحق إلحاقًا — فلا يقفز صندوقها لأوّله، ولا يُستبدل زرّ الإلغاء تحت
   * الإصبع مع كلّ سطر أو استطلاع. */
  var PARTS = ['head', 'goal', 'who', 'share', 'meta', 'price', 'state', 'lines', 'outcome', 'note', 'btns', 'legal'];
  function part(v, name, sig, make){
    if(v.sig[name] === sig) return v.node[name] || null;
    var old = v.node[name] || null, nu = sig === '' ? null : make();
    v.sig[name] = sig; v.node[name] = nu;
    if(old && nu) v.box.replaceChild(nu, old);
    else if(old) v.box.removeChild(old);
    else if(nu){
      var ref = null;
      for(var i = PARTS.indexOf(name) + 1; i < PARTS.length && !ref; i++) ref = v.node[PARTS[i]] || null;
      v.box.insertBefore(nu, ref);
    }
    return nu;
  }
  function labeled(cls, label, text){
    var d = el('div', cls);
    d.appendChild(el('b', '', label + ': '));
    var sp = el('span', '', text);
    sp.setAttribute('dir', 'auto'); // اسم المحلّ من الخرائط لاتينيّ غالبًا — معزول الاتّجاه داخل سطر عربيّ
    d.appendChild(sp);
    return d;
  }
  function lineRow(cls){
    return function(l){
      var row = el('div', cls + (cls === 'omCallLine' ? (l.who === 'callee' ? ' omCallCallee' : ' omCallAgent') : ''));
      row.appendChild(el('b', '', tt(l.who === 'callee' ? 'callAgentWhoCallee' : 'callAgentWhoAgent') + ': '));
      row.appendChild(el('span', '', l.text));
      return row;
    };
  }
  /* أسطر حيّة تُلحق إلحاقًا: المرسوم يبقى، ما سقط من الأعلى (سقف الأربعين أو نافذة الستّة) يُزال، والجديد يُضاف في الأسفل؛
   * والصندوق يتبع آخر سطر إلّا إن رفعه القارئ ليقرأ */
  function syncLines(box, lines, mk){
    var keys = lines.map(function(l){ return l.who + '\u0001' + l.text; });
    var old = box.__omKeys || [], d = 0;
    // v-call-agent-cut: سطر عُلِّم «مقطوعًا» في مكانه (العدد نفسه، والفرق علامة القطع وحدها) ← يُستبدل وحده، فلا يُعاد بناء الصندوق؛
    // وإن كان الصندوق على آخره يبقى عليه (العلامة قد تلفّ سطرًا جديدًا)
    if(old.length && old.length === keys.length && box.childNodes && box.childNodes.length === old.length){
      var diff = 0, onlyMarks = true;
      for(var x = 0; x < keys.length; x++) if(old[x] !== keys[x]){ diff++; if(keys[x].slice(-CUT_MARK.length) !== CUT_MARK || old[x].slice(-CUT_MARK.length) === CUT_MARK) onlyMarks = false; }
      if(diff && onlyMarks){
        var pinned = (box.scrollHeight - box.scrollTop - box.clientHeight) < 24;
        for(var y = 0; y < keys.length; y++) if(old[y] !== keys[y]) box.replaceChild(mk(lines[y]), box.childNodes[y]);
        box.__omKeys = keys;
        if(pinned) box.scrollTop = box.scrollHeight;
        return;
      }
    }
    for(; d < old.length; d++){ // أصغر إزاحة يصير بعدها القديم بداية الجديد؛ لا تداخل = بناء كامل
      var hit = old.length - d <= keys.length;
      for(var i = d; hit && i < old.length; i++) if(old[i] !== keys[i - d]) hit = false;
      if(hit) break;
    }
    var atEnd = !old.length || (box.scrollHeight - box.scrollTop - box.clientHeight) < 24;
    for(var j = 0; j < d && box.firstChild; j++) box.removeChild(box.firstChild);
    for(var k = old.length - d; k < keys.length; k++) box.appendChild(mk(lines[k]));
    box.__omKeys = keys;
    if(!atEnd) return;
    box.scrollTop = box.scrollHeight;
    // أوّل رسم: الغلاف لم يُلحق بالصفحة بعد فلا يُمرَّر — نعيدها بعد الإلحاق
    if(!box.isConnected) setTimeout(function(){ try{ box.scrollTop = box.scrollHeight; }catch(e){ __swallow(e, 'call-agent:scroll'); } }, 0);
  }
  function fillCard(wrap, c){
    var v = wrap.__omCall;
    if(!v){
      while(wrap.firstChild) wrap.removeChild(wrap.firstChild);
      v = wrap.__omCall = { box: el('div', 'omCall'), sig: {}, node: {} };
      wrap.appendChild(v.box);
    }
    var biz = clip(c.business, 80) || '—', phone = clip(c.phoneMasked, 32), place = clip(c.placeName, 80);
    part(v, 'head', JSON.stringify([tt('callAgentTitle'), biz, phone, place, tt('callAgentPlace')]), function(){
      var head = el('div', 'omCallHead');
      head.appendChild(el('span', 'omCallIco', '📞'));
      var ht = el('div', 'omCallHeadTxt');
      ht.appendChild(el('div', 'omCallKicker', tt('callAgentTitle')));
      ht.appendChild(el('div', 'omCallBiz', biz));
      if(phone){ var ph = el('div', 'omCallPhone', phone); ph.setAttribute('dir', 'ltr'); ht.appendChild(ph); }
      if(place) ht.appendChild(labeled('omCallPlace', tt('callAgentPlace'), place)); // العقد v2: الرقم لمحلّ الخرائط هذا لا لاسم النموذج
      head.appendChild(ht);
      return head;
    });
    // العقد v2: كلّ ما قد يقوله المساعد للجهة ظاهر قبل «اتّصل فعليًّا» — الهدف، والاسم الذي يتّصل به، والتفاصيل
    [['goal', 'omCallGoal', 'callAgentGoal', clip(c.goal, 300)], ['who', 'omCallWho', 'callAgentCaller', clip(c.callerName, 40)],
      ['share', 'omCallShare', 'callAgentShare', clip(c.details, 500)]].forEach(function(f){
      part(v, f[0], f[3] ? tt(f[2]) + '\u0001' + f[3] : '', function(){ return labeled(f[1], tt(f[2]), f[3]); });
    });
    var maxMin = capMin(c);
    var owner = isOwner();
    var metaTxt = [fill(tt('callAgentMax'), { n: maxMin }),
      owner ? tt('callAgentFreeOwner') : fill(tt('callAgentPrice'), { n: perMin(c) }), owner ? 'omCallFree' : 'omCallCost'];
    part(v, 'meta', JSON.stringify(metaTxt), function(){
      var meta = el('div', 'omCallMeta');
      meta.appendChild(el('span', '', metaTxt[0]));
      meta.appendChild(el('span', metaTxt[2], metaTxt[1])); // v-call-agent-paid: سعر المشترك بلون الكرت لا أخضر «مجّانيّة»
      return meta;
    });
    var priceTxt = owner ? fill(tt('callAgentUserPrice'), { land: PTS_LAND, mob: PTS_MOB }) : fill(tt('callAgentHold'), { n: perMin(c) * maxMin });
    part(v, 'price', priceTxt, function(){ return el('div', 'omCallPrice', priceTxt); });

    var vs = viewState(c);
    var liveTrial = !!(trial && trial.id === c.id);
    var dur = (liveTrial && trial.readyAt) ? (now() - trial.readyAt) / 1000 : Number(c.durationSec) || 0;
    var stRow = vs ? [vs, stateLabel(vs), dur >= 1 ? mmss(dur) : ''] : null;
    part(v, 'state', stRow ? JSON.stringify(stRow) : '', function(){
      var sr = el('div', 'omCallState' + (ACTIVE[vs] ? ' omCallLive' : ''));
      sr.appendChild(el('span', 'omCallDot'));
      sr.appendChild(el('span', '', stRow[1]));
      if(stRow[2]) sr.appendChild(el('span', 'omCallDur', stRow[2]));
      return sr;
    });
    var lines = cleanLines(c.transcript);
    var tl = part(v, 'lines', lines.length ? 'on' : '', function(){ return el('div', 'omCallLines'); });
    if(tl) syncLines(tl, lines, lineRow('omCallLine'));
    var o = c.outcome ? cleanOutcome(c.outcome) : null;
    part(v, 'outcome', o ? JSON.stringify([o, ocLabel(o.status), tt('callAgentDetails'), tt('callAgentFollowUp')]) : '', function(){
      var ob = el('div', 'omCallOutcome omCallOc-' + o.status);
      ob.appendChild(el('div', 'omCallOcHead', ocLabel(o.status)));
      if(o.summary) ob.appendChild(el('div', 'omCallOcText', o.summary));
      if(o.confirmed_details) ob.appendChild(el('div', 'omCallOcText', tt('callAgentDetails') + ': ' + o.confirmed_details));
      if(o.follow_up) ob.appendChild(el('div', 'omCallOcText', tt('callAgentFollowUp') + ': ' + o.follow_up));
      return ob;
    });
    var nt = notes[c.id] || '';
    part(v, 'note', nt, function(){ return el('div', 'omCallNote', nt); });

    var id = c.id;
    var livePhone = c.transport === 'phone' && !!c.callId && !!ACTIVE[vs];
    var busy = !!(id && starting[id]);
    var mode = liveTrial ? 'trial' : livePhone ? 'phone' : id ? ('idle' + (c.phoneReady === true ? '+dial' : '') + (busy ? '+busy' : '')) : '';
    part(v, 'btns', mode && JSON.stringify([mode, tt('callAgentEnd'), tt('callAgentCancel'), tt('callAgentTry'), tt('callAgentDial')]), function(){
      var btns = el('div', 'omCallBtns');
      if(liveTrial) btns.appendChild(btn('omCallBtn omCallStop', tt('callAgentEnd'), function(){ if(trial && trial.id === id) finish(trial, 'canceled'); }));
      else if(livePhone) btns.appendChild(btn('omCallBtn omCallStop', tt('callAgentCancel'), function(){ cancelPhone(id); }));
      else {
        // تدفّق واحد لكلّ بطاقة: الاتّصال الفعليّ يبدأ ← الزرّان معطّلان معًا (لا تجربة فوقه)
        var tr = btn('omCallBtn omCallTry', tt('callAgentTry'), function(){ startTrial(id); });
        if(busy) tr.disabled = true;
        btns.appendChild(tr);
        if(c.phoneReady === true){
          var dl = btn('omCallBtn omCallDial', tt('callAgentDial'), function(){ startPhone(id); });
          if(busy) dl.disabled = true;
          btns.appendChild(dl);
        }
      }
      return btns;
    });
    part(v, 'legal', tt('callAgentDisclosure'), function(){ return el('div', 'omCallLegal', tt('callAgentDisclosure')); });
  }
  /* اتّصال فعليّ «جارٍ» محفوظ بلا متابعة في هذا التبويب (إعادة تحميل) ← تُستأنف المتابعة حتّى حدّها من بدء المكالمة */
  function resume(c){
    if(c.transport !== 'phone' || !c.callId || !ACTIVE[String(c.state)] || polls[c.callId] || !token()) return;
    schedulePoll(c.id, String(c.callId), (Number(c.startedAt) || now()) + POLL_MAX_MS);
  }
  /* تجربة «جارية» محفوظة بلا جلسة حيّة هنا: أُغلقت الصفحة أو أُعيد تحميلها قبل أن يصل حفظ نهايتها (pagehide لا ينتظر IndexedDB،
   * ومؤقّت saveState لا ينطلق). تُحسم بعد الرسم مرّة: «اكتملت» إن وصلت نتيجتها وإلّا «انقطعت»، ورسالة النتيجة إن كانت بدأت فعلًا —
   * فقط إن بدأت في هذا المتصفّح (العلامة) أو تجاوزت سقفها، فلا يُكتب فوق تجربة حيّة في جهاز آخر. */
  function settleTrial(c){
    var id = c.id;
    if(!id || c.transport !== 'trial' || !ACTIVE[String(c.state)] || c.resultPushed || (trial && trial.id === id) || settling[id]) return;
    var cap = (Math.max(1, Math.min(10, Math.round(Number(c.maxMin) || 4))) * 60 + 60) * 1000;
    if(marked() !== id && now() - (Number(c.startedAt) || 0) < cap) return;
    settling[id] = true;
    setTimeout(function(){ // خارج الرسم: لا كتابة أثناءه
      delete settling[id];
      var x = find(id);
      if(!x || x.transport !== 'trial' || !ACTIVE[String(x.state)] || x.resultPushed || (trial && trial.id === id)) return;
      var began = x.state === 'live' || !!x.outcome || cleanLines(x.transcript).length > 0; // التجهيز وحده = ملاحظة لا رسالة (كـfinish)
      patch(id, { state: x.outcome ? 'completed' : 'dropped', endedAt: Number(x.endedAt) || now() });
      var pushed = began && pushResult(id);
      unmark(id);
      persist(); refresh(id);
      if(pushed) rerender();
    }, 0);
  }
  window.omranCallCard = function(call, cardsObj){
    css();
    var wrap = el('div', 'omCallWrap');
    wrap.setAttribute('data-keep-emoji', '1');
    var c = (call && typeof call === 'object') ? call : { business: cardsObj && cardsObj.q };
    if(c.id) mounted[c.id] = wrap;
    fillCard(wrap, c);
    resume(c);
    settleTrial(c);
    if(c.id && c.trialEnds && Object.keys(c.trialEnds).length) setTimeout(function(){ trialEnd(c.id, true); }, 0); // v-call-agent-paid: نهايات لم يؤكّدها الخادم بعد
    return wrap;
  };

  /* ── الشبكة ── */
  async function post(action, body){
    try{
      var r = await fetch('/api/system?action=' + encodeURIComponent(action), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ token: token() }, body || {})),
      });
      var d = null;
      try{ d = await r.json(); }catch(e){ d = null; /* guard-ok: جسم غير JSON = خطأ عامّ بحالته */ }
      return { ok: !!r.ok, status: r.status, data: (d && typeof d === 'object') ? d : {} };
    }catch(e){ __swallow(e, 'call-agent:net'); return { ok: false, status: 0, data: {} }; }
  }
  function errKey(r){ var e = r && r.data && r.data.error; return ERR[e] || 'callAgentErrGeneric'; }
  function errText(r){ var k = errKey(r); return k === 'callAgentErrPoints' ? fill(tt(k), { n: Math.max(0, Math.round(Number(r.data.needed) || 0)) }) : tt(k); }
  function note(id, key){ notes[id] = key ? tt(key) : ''; refresh(id); }

  /* v-call-agent-paid: نهاية تجربة مدفوعة ← الخادم يُرجع ما زاد عن الدقائق المبدوءة. كلّ تجربة بمعرّفها في c.trialEnds ({ معرّف: ثوانٍ،
   * و-1 = لم تنتهِ بعد}) يولّده العميل ويحفظه قبل طلب الجلسة — ردّ ضائع أو تجربة ثانية على الكرت نفسه لا يُسقط نهاية أخرى (المراجعة).
   * keepalive يعبر إغلاق الصفحة، ومحاولة ثانية بعد ١٠ ث، ثمّ التحميل التالي يمرّ على كلّ الكروت (sweep). يُحذف ما أقرّه الخادم وحده. */
  var END_RETRY_MS = 10000;
  function newTrialId(){
    var hex = '';
    try{ var b = new Uint8Array(9); crypto.getRandomValues(b); for(var i = 0; i < b.length; i++) hex += (b[i] < 16 ? '0' : '') + b[i].toString(16); }
    catch(e){ __swallow(e, 'call-agent:trial-id'); hex = ''; for(var k = 0; k < 18; k++) hex += Math.floor(Math.random() * 16).toString(16); }
    return 'ct' + hex;
  }
  function trialEnd(id, freshOnly){ // freshOnly: رسم الكرت والمرور بعد التحميل يرسلان ما لم يُجرَّب في هذه الصفحة وحده — الإعادة لمؤقّتها
    var c = find(id);
    var map = (c && c.trialEnds && typeof c.trialEnds === 'object') ? c.trialEnds : null;
    if(!map || !token()) return Promise.resolve();
    var ps = [];
    Object.keys(map).forEach(function(tid){
      if(ending[tid] && inflight[tid]){ ps.push(inflight[tid]); return; }
      if(!/^ct[a-f0-9]{18}$/.test(tid) || ending[tid] || (tried[tid] || 0) >= (freshOnly ? 1 : 2)) return;
      var sec = Number(map[tid]);
      // «-1» = لم تنتهِ في الصفحة التي بدأتها — قد تكون حيّة في تبويب أو جهاز آخر (ساعته غير ساعتنا): لا تُرسل من هنا أبدًا (المراجعة
      // الثالثة: إرسالها «صفرًا» كان يردّ حجز تجربة جارية، و«بالسقف» يسبق نهايتها الحقيقيّة الأقصر). الحجز يبقى كما هو حتّى تصل نهايتها
      // من صفحتها، وقفل التجربة ينتهي بمدّته. بعد عمر سجلّ الخادم (٧ أيّام) تُمحى محلّيًّا.
      if(sec < 0){
        if(!(trial && trial.trialId === tid) && now() - (Number(c.startedAt) || 0) > 8 * 86400000){ var mm = Object.assign({}, find(id).trialEnds || {}); delete mm[tid]; patch(id, { trialEnds: mm }); }
        return;
      }
      ending[tid] = true;
      tried[tid] = (tried[tid] || 0) + 1;
      var fin; inflight[tid] = new Promise(function(r){ fin = r; }); ps.push(inflight[tid]);
      var done = function(ok, gone404){
        delete ending[tid]; delete inflight[tid]; fin();
        if(ok){ var x = find(id), m = Object.assign({}, (x && x.trialEnds) || {}); delete m[tid]; patch(id, { trialEnds: m }); persist(); }
        else if(gone404) tried[tid] = 2; // تجربة حساب آخر (متصفّح مشترك): تبقى لصاحبها، ولا إعادة في هذه الصفحة
        else if(tried[tid] < 2) setTimeout(function(){ trialEnd(id); }, END_RETRY_MS);
      };
      try{
        fetch('/api/system?action=call-trial-end', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: token(), trialId: tid, durationSec: Math.max(0, Math.round(sec) || 0) }) })
          .then(function(r){ done(!!r.ok, r.status === 404); }, function(e){ __swallow(e, 'call-agent:trial-end'); done(false); });
      }catch(e){ __swallow(e, 'call-agent:trial-end'); done(false); }
    });
    return Promise.all(ps);
  }
  /* كلّ كروت الاتّصال في كلّ المحادثات (لا المفتوحة وحدها) */
  function eachCallCard(fn){
    var ps = (typeof state !== 'undefined' && state && Array.isArray(state.projects)) ? state.projects : [];
    ps.forEach(function(p){
      (p && Array.isArray(p.messages) ? p.messages : []).forEach(function(m){
        var c = m && m.cards && m.cards.kind === 'call' && m.cards.call;
        if(c && c.id) fn(c);
      });
    });
  }

  /* ── التجربة في المتصفّح ── */
  function gone(s){ return s.ended || trial !== s; }
  function later(s, fn, ms){ var h = setTimeout(function(){ if(!s.ended) fn(); }, ms); s.timers.push(h); return h; }
  function send(s, obj){ try{ if(s.dc && s.dc.readyState === 'open') s.dc.send(JSON.stringify(obj)); }catch(e){ __swallow(e, 'call-agent:send'); } }
  function output(s, callId, obj){
    if(callId) send(s, { type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(obj) } });
  }
  function delay(s, ms){ return new Promise(function(res){ later(s, res, ms); }); }
  function setState(s, st){
    patch(s.id, { state: st }); persist(); refresh(s.id);
    if(s.ov) s.ov.state.textContent = stateLabel(st);
  }
  function ovLines(s){ if(s.ov) syncLines(s.ov.lines, s.lines.slice(-6), lineRow('omCallOvLine')); }
  function cutText(text){ return clip(text, LINE_CHARS - CUT_MARK.length).replace(/…$/, '') + CUT_MARK; }
  /* rid = معرّف الردّ: نصّ ردّ قطعته المقاطعة قبل وصوله يُعلَّم عند وصوله */
  function addLine(s, who, text, rid){
    text = clip(text, LINE_CHARS); if(!text) return;
    var l = { who: who, text: (rid && s.cutResp[rid]) ? cutText(text) : text };
    if(rid) s.byResp[rid] = l;
    s.lines.push(l);
    if(s.lines.length > LINES_MAX) s.lines.shift();
    patch(s.id, { transcript: s.lines.slice() }); persist(); refresh(s.id); ovLines(s);
  }
  /* v-call-agent-cut: صوت الردّ قُطع (مقاطعة) — النصّ المعروض وصل قبل الصوت كاملًا، فيُعلَّم « …» بدل أن يوهم أنّه قيل كلّه.
     ردّ انتهى صوته (stopped) لا يُعلَّم أبدًا؛ وكلّ ردّ يُعلَّم مرّة واحدة. */
  function cutLine(s, rid){
    rid = rid || s.lastRid;
    if(!rid || s.cutResp[rid] || s.played[rid]) return;
    s.cutResp[rid] = 1; s.cutN++;
    var l = s.byResp[rid], i = l ? s.lines.indexOf(l) : -1;
    if(i < 0) return; // النصّ لم يصل بعد (أو خرج من نافذة الأسطر)
    s.lines[i] = s.byResp[rid] = { who: l.who, text: cutText(l.text) };
    patch(s.id, { transcript: s.lines.slice() }); persist(); refresh(s.id); ovLines(s);
  }
  /* أثر التجربة (يُرسل مرّة عند النهاية): رموز قصيرة بالثانية من الجاهزيّة — بلا أيّ نصّ من المكالمة ولا سرّ */
  function code4(v){ return String(v == null ? '' : v).replace(/[^\w.\-]/g, '').slice(-4); }
  /* أوّل ٣٠ رمزًا تبقى (الافتتاح — موضع القطع الأغلب) وآخر ٥٠ تتجدّد */
  function trace(s, c){
    var x = ((now() - (s.readyAt || s.t0)) / 1000).toFixed(1) + c;
    if(s.diagHead.length < TRACE_HEAD) s.diagHead.push(x);
    else { s.diag.push(x); if(s.diag.length > TRACE_TAIL){ s.diag.shift(); s.diagCut = true; } }
  }
  function traceEv(s, ty, ev){
    var r = ev.response || {}, why = r.status_details && r.status_details.reason;
    if(ty === 'input_audio_buffer.speech_started') trace(s, 'ss');
    else if(ty === 'input_audio_buffer.speech_stopped') trace(s, 'sp');
    else if(ty === 'response.created') trace(s, 'rc:' + code4(r.id));
    else if(ty === 'output_audio_buffer.started') trace(s, 'os:' + code4(ev.response_id));
    else if(ty === 'output_audio_buffer.stopped') trace(s, 'ot:' + code4(ev.response_id));
    else if(ty === 'output_audio_buffer.cleared') trace(s, 'oc:' + code4(ev.response_id));
    else if(ty === 'response.output_audio_transcript.done' || ty === 'response.audio_transcript.done') trace(s, 'tx:' + code4(ev.response_id) + '/' + String(ev.transcript || '').length);
    else if(ty === 'conversation.item.truncated') trace(s, 'tr:' + (Math.round(Number(ev.audio_end_ms)) || 0));
    else if(ty === 'response.done') trace(s, 'rd:' + code4(r.id) + '/' + String(r.status || '').replace(/[^\w]/g, '').slice(0, 16) + (why ? '/' + String(why).replace(/[^\w]/g, '').slice(0, 24) : ''));
    else if(ty === 'error') trace(s, 'er:' + String((ev.error && (ev.error.code || ev.error.type)) || '').replace(/[^\w.\-]/g, '').slice(0, 40));
  }
  /* كلّ طلب ردّ من العميل يُسجَّل بسببه في الأثر (الحمولة كما كانت) */
  function create(s, why){ trace(s, 'cr:' + why); send(s, { type: 'response.create' }); }
  /* إحصاءات الصوت الوارد (مفقود/مُرقَّع/مستلَم/اهتزاز) — تفرّق تقطّع الشبكة عن المقاطعة */
  function rtpLoop(s){
    if(gone(s) || !s.pc || typeof s.pc.getStats !== 'function') return;
    try{
      s.pc.getStats().then(function(rep){
        if(!rep || typeof rep.forEach !== 'function') return;
        rep.forEach(function(x){
          if(x && x.type === 'inbound-rtp' && (x.kind || x.mediaType) === 'audio')
            s.rtp = [x.packetsLost | 0, x.concealedSamples | 0, x.totalSamplesReceived | 0, Math.round((Number(x.jitter) || 0) * 1000)];
        });
      }).catch(function(e){ __swallow(e, 'call-agent:rtp'); });
    }catch(e){ __swallow(e, 'call-agent:rtp'); }
    later(s, function(){ rtpLoop(s); }, RTP_MS);
  }
  function sendDiag(s, st, dur){
    if(!s.readyAt) return; // فشل التجهيز لا أثر له هنا — ملاحظة البطاقة تكفي
    var msg = 'call-trial ' + s.id + ' end=' + st + ' dur=' + dur + 's lines=' + s.lines.length + ' cut=' + s.cutN + ' clr=' + s.clr
      + (s.rtp ? ' rtp=' + s.rtp.join('/') : '');
    var stack = s.diagHead.concat(s.diagCut ? ['~'] : [], s.diag).join(' ').slice(0, 1500);
    try{ (console.info || console.log).call(console, '[call-agent] trace', msg, stack); }catch(e){ __swallow(e, 'call-agent:trace-log'); }
    try{
      fetch('/api/system?action=client-errors', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, source: 'diag:call-trial', line: 0, col: 0, stack: stack,
          url: (typeof location !== 'undefined' && location) ? String(location.pathname || '') : '',
          ua: (typeof navigator !== 'undefined' && navigator && navigator.userAgent) || '',
          build: (typeof window.__omranBuild === 'function') ? window.__omranBuild() : '' }) })
        .catch(function(e){ __swallow(e, 'call-agent:diag'); });
    }catch(e){ __swallow(e, 'call-agent:diag'); }
  }
  function overlayClose(){
    try{ var o = document.getElementById('omranCallOverlay'); if(o && o.parentNode) o.parentNode.removeChild(o); }catch(e){ __swallow(e, 'call-agent:ov-close'); }
  }
  function overlayOpen(s){
    css(); overlayClose();
    var o = el('div', 'omCallOv');
    o.id = 'omranCallOverlay';
    o.setAttribute('data-keep-emoji', '1');
    o.setAttribute('role', 'dialog');
    var top = el('div', 'omCallOvTop');
    top.appendChild(el('span', 'omCallOvPulse'));
    var tx = el('div', 'omCallOvTx');
    tx.appendChild(el('div', 'omCallOvTitle', tt('callAgentTrialTitle') + ' · ' + (clip(s.business, 60) || '—')));
    var stl = el('div', 'omCallOvState', stateLabel('mic'));
    tx.appendChild(stl);
    top.appendChild(tx);
    var tm = el('div', 'omCallOvTime', '');
    tm.setAttribute('dir', 'ltr');
    top.appendChild(tm);
    o.appendChild(top);
    var hint = el('div', 'omCallOvHint', ''); // v-call-agent-cut: «قل ألو» حين يُفتح المايك فقط — قبله تضيع الكلمة
    o.appendChild(hint);
    var lines = el('div', 'omCallOvLines');
    o.appendChild(lines);
    o.appendChild(btn('omCallOvEnd', tt('callAgentEnd'), function(){ if(trial === s) finish(s, 'canceled'); }));
    document.body.appendChild(o);
    s.ov = { root: o, state: stl, time: tm, lines: lines, hint: hint };
  }
  function tick(s){
    if(gone(s) || !s.ov) return;
    s.ov.time.textContent = mmss((now() - s.readyAt) / 1000) + ' / ' + mmss(s.maxSec);
    later(s, function(){ tick(s); }, 1000);
  }
  function clearWd(s){ if(s.wd){ clearTimeout(s.wd); s.wd = null; } }
  // الكلام انتهى ولم يبدأ ردّ خلال المهلة ← نطلبه صراحة (جلسة بلا ردّ تلقائيّ لا تجيب أبدًا)
  function armWd(s, ms){ clearWd(s); if(!s.readyAt) return; s.wd = later(s, function(){ s.wd = null; create(s, 'wd'); }, ms); }
  function armEnd(s, ms){
    if(s.endTimer) clearTimeout(s.endTimer);
    s.endTimer = later(s, function(){ s.endTimer = null; if(!s.speaking) finish(s, 'completed'); }, ms);
  }
  function onTool(s, name, callId, raw){
    if(callId){ if(s.fnSeen[callId]) return; s.fnSeen[callId] = 1; }
    var args = {};
    try{ args = (typeof raw === 'string') ? JSON.parse(raw || '{}') : (raw || {}); }catch(e){ args = {}; __swallow(e, 'call-agent:args'); }
    if(name === 'report_outcome'){
      s.outcome = cleanOutcome(args);
      patch(s.id, { outcome: s.outcome }); persist(); refresh(s.id);
      output(s, callId, { ok: true });
      create(s, 'tool');
      return;
    }
    if(name === 'end_call'){
      output(s, callId, { ok: true });
      s.endPending = true;
      later(s, function(){ finish(s, 'completed'); }, END_MAX_MS);
      if(!s.speaking) armEnd(s, END_GRACE_MS);
      return;
    }
    output(s, callId, { ok: false, error: 'unknown_tool' });
    create(s, 'unk');
  }
  function onEvent(s, e, ready){
    if(gone(s)) return;
    var ev;
    try{ ev = JSON.parse(e.data); }catch(err){ return; /* guard-ok: رسالة قناة غير JSON لا تخصّنا */ }
    var ty = ev && ev.type;
    if(ty) traceEv(s, ty, ev);
    if(ty === 'session.created' || ty === 'session.updated'){ ready(); return; }
    if(ty === 'input_audio_buffer.speech_started'){ s.heard = true; armWd(s, 20000); return; }
    if(ty === 'input_audio_buffer.speech_stopped'){ armWd(s, 1800); return; }
    if(ty === 'response.created'){ clearWd(s); if(ev.response && ev.response.id) s.lastRid = String(ev.response.id); return; }
    if(ty === 'output_audio_buffer.started' || ty === 'response.output_audio.delta' || ty === 'response.audio.delta'){
      s.speaking = true; clearWd(s);
      if(ev.response_id) s.lastRid = String(ev.response_id);
      return;
    }
    if(ty === 'output_audio_buffer.stopped' || ty === 'output_audio_buffer.cleared'){
      // v-call-agent-cut: المسح = مقاطعة قطعت صوت الردّ (لا انتهاؤه) ← سطره يُعلَّم؛ التوقّف الطبيعيّ يحمي سطره من أيّ علامة لاحقة
      if(ty === 'output_audio_buffer.cleared'){ s.clr++; cutLine(s, ev.response_id ? String(ev.response_id) : ''); }
      else if(ev.response_id) s.played[String(ev.response_id)] = 1;
      s.speaking = false; if(s.endPending) armEnd(s, 400); return;
    }
    if(ty === 'response.output_audio_transcript.done' || ty === 'response.audio_transcript.done'){ addLine(s, 'agent', ev.transcript, ev.response_id ? String(ev.response_id) : ''); return; }
    if(ty === 'response.output_item.added' || ty === 'response.output_item.done'){
      var it = ev.item;
      if(it && it.type === 'function_call' && it.call_id){
        s.fnNames[it.call_id] = it.name;
        if(ty === 'response.output_item.done' && it.arguments != null) onTool(s, it.name, it.call_id, it.arguments);
      }
      return;
    }
    if(ty === 'response.function_call_arguments.done'){ onTool(s, ev.name || s.fnNames[ev.call_id], ev.call_id, ev.arguments); return; }
    if(ty === 'response.done'){
      if(ev.response && ev.response.status === 'cancelled' && ev.response.id) cutLine(s, String(ev.response.id)); // أُلغي قبل أن يُسمع كلّه
      var out = ev.response && Array.isArray(ev.response.output) ? ev.response.output : [];
      out.forEach(function(x){ if(x && x.type === 'function_call') onTool(s, x.name, x.call_id, x.arguments); });
      if(s.endPending && !s.speaking) armEnd(s, END_GRACE_MS);
      return;
    }
    if(ty === 'error') console.warn('[call-agent] server error:', ev.error && ev.error.message);
  }
  function waitConn(s, pc, ms){
    return new Promise(function(res, rej){
      if(pc.connectionState === 'connected') return res();
      var h = later(s, function(){ rej(new Error('connection timeout')); }, ms);
      pc.addEventListener('connectionstatechange', function(){
        if(pc.connectionState === 'connected'){ clearTimeout(h); res(); }
        else if(pc.connectionState === 'failed' || pc.connectionState === 'closed'){ clearTimeout(h); rej(new Error('connection ' + pc.connectionState)); }
      });
    });
  }
  function waitChan(s, dc, ms){
    return new Promise(function(res, rej){
      if(dc.readyState === 'open') return res();
      var h = later(s, function(){ rej(new Error('channel timeout')); }, ms);
      dc.addEventListener('open', function(){ clearTimeout(h); res(); }, { once: true });
      dc.addEventListener('close', function(){ clearTimeout(h); rej(new Error('channel closed')); }, { once: true });
    });
  }
  /* لا إعادة اتّصال: الانقطاع يُنهي المكالمة «انقطعت» بما قيل — جلسة جديدة تبدأ بلا ذاكرة المكالمة */
  function watchConn(s){
    var pc = s.pc, h = null;
    pc.addEventListener('connectionstatechange', function(){
      if(gone(s) || pc !== s.pc) return;
      var cs = pc.connectionState;
      trace(s, 'cs:' + ({ connecting: 'cg', connected: 'ok', disconnected: 'dc', failed: 'fl', closed: 'cl' }[cs] || 'x'));
      if(cs === 'connected'){ if(h){ clearTimeout(h); h = null; } return; }
      if(cs === 'failed' || cs === 'closed'){ finish(s, 'dropped'); return; }
      if(cs === 'disconnected' && !h) h = later(s, function(){ h = null; if(pc.connectionState !== 'connected') finish(s, 'dropped'); }, 2500);
    });
  }
  function finish(s, st, err){
    if(s.ended) return;
    s.ended = true;
    if(s.haltRes) s.haltRes();
    s.timers.forEach(function(h){ clearTimeout(h); });
    s.timers = [];
    try{ if(s.dc) s.dc.close(); }catch(e){ __swallow(e, 'call-agent:dc-close'); }
    try{ if(s.pc) s.pc.close(); }catch(e){ __swallow(e, 'call-agent:pc-close'); }
    stopStream(s.stream); s.stream = null;
    try{ if(s.audio) s.audio.srcObject = null; }catch(e){ __swallow(e, 'call-agent:audio-off'); }
    if(trial === s) trial = null;
    overlayClose();
    var dur = s.readyAt ? Math.round((now() - s.readyAt) / 1000) : 0;
    sendDiag(s, st, dur);
    patch(s.id, { state: s.outcome ? 'completed' : st, endedAt: now(), durationSec: dur, transcript: s.lines.slice(), outcome: s.outcome });
    if(s.trialId){ var te = Object.assign({}, (find(s.id) || {}).trialEnds || {}); te[s.trialId] = dur; patch(s.id, { trialEnds: te }); trialEnd(s.id); } // v-call-agent-paid
    notes[s.id] = err ? (/^callAgent[A-Z]\w*$/.test(err) ? tt(err) : clip(err, 240)) : '';
    var pushed = s.readyAt ? pushResult(s.id) : false; // مكالمة بدأت فعلًا = رسالة نتيجة واحدة؛ فشل التجهيز ملاحظة على البطاقة فقط
    if(!s.unloading) unmark(s.id); // إغلاق الصفحة: العلامة تبقى ليُكمل التحميل التالي ما لم يصل حفظه
    persist(); refresh(s.id);
    if(pushed) rerender();
  }
  function fail(s, e){
    if(gone(s)) return;
    var n = String((e && e.name) || '');
    var msg = (/NotAllowed|NotFound|NotReadable|TrackStart|Aborted|Overconstrained|Security|Permission/.test(n) && typeof mahaMicMsg === 'function') ? mahaMicMsg(e) : 'callAgentErrGeneric';
    console.warn('[call-agent] trial failed:', e);
    finish(s, 'failed', msg);
  }
  async function runTrial(s){
    var micErr = (typeof mahaMicPreflight === 'function') ? await mahaMicPreflight() : null;
    if(gone(s)) return;
    if(micErr){ finish(s, 'failed', micErr); return; }
    if(s.pre){ await s.pre; if(gone(s)) return; } // نهايات سابقة تُقبل أوّلًا فيُفكّ قفل التجربة قبل طلب الجديدة
    setState(s, 'connecting');
    later(s, function(){ if(!s.readyAt) finish(s, 'failed', 'callAgentErrGeneric'); }, SETUP_MAX_MS);
    var r = await post('call-session', s.trialId ? paidBody({ id: s.id, trialId: s.trialId }) : paidBody({ id: s.id })); // v-call-agent-paid: المعرّف محفوظ قبل الطلب
    if(gone(s)) return; // أُلغيت أثناء التجهيز: finish سجّل نهايتها (٠ ث) وأرسلها
    if(!r.ok || !r.data.clientSecret){ finish(s, 'failed', errText(r)); return; }
    var srvMax = Number(r.data.maxSec);
    if(srvMax > 0) s.maxSec = Math.min(s.maxSec, srvMax);
    if(r.data.brief && r.data.brief.business) s.business = clip(r.data.brief.business, 80);
    var getMic = (typeof mahaGetUserMediaRetry === 'function') ? mahaGetUserMediaRetry : function(cn){ return navigator.mediaDevices.getUserMedia(cn); };
    var stream = await getMic({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    if(gone(s)){ stopStream(stream); return; }
    s.stream = stream;
    var track = stream.getAudioTracks ? stream.getAudioTracks()[0] : null;
    if(track) track.enabled = false; // لا يخرج صوت قبل جاهزيّة الجلسة (أوّل كلمة لا تضيع ولا تصل نصف جملة)
    var pc = s.pc = new RTCPeerConnection();
    pc.ontrack = function(e){
      if(s.audio && e.streams && e.streams[0]) s.audio.srcObject = e.streams[0];
      try{ if(e.receiver && 'playoutDelayHint' in e.receiver) e.receiver.playoutDelayHint = 0.25; }catch(err){ __swallow(err, 'call-agent:jitter'); }
    };
    if(track) pc.addTrack(track, stream);
    var dc = s.dc = pc.createDataChannel('oai-events');
    var ready = null, readyP = new Promise(function(res){ ready = res; });
    dc.addEventListener('message', function(e){ onEvent(s, e, ready); });
    var offer = await pc.createOffer();
    if(gone(s)) return;
    await pc.setLocalDescription(offer);
    if(gone(s)) return;
    var sdp = await fetch(RT_URL, { method: 'POST', body: offer.sdp, headers: { Authorization: 'Bearer ' + r.data.clientSecret, 'Content-Type': 'application/sdp' } });
    if(gone(s)) return;
    if(!sdp.ok) throw new Error('sdp ' + sdp.status);
    var answer = await sdp.text();
    if(gone(s)) return;
    await pc.setRemoteDescription({ type: 'answer', sdp: answer });
    if(gone(s)) return;
    // s.halt: الإنهاء أثناء الانتظار يحسمه فورًا (pc.close() لا يطلق connectionstatechange) فلا يبقى الوعد معلّقًا
    await Promise.race([Promise.all([waitConn(s, pc, 10000), waitChan(s, dc, 10000), Promise.race([readyP, delay(s, 5000)])]), s.halt]);
    if(gone(s)) return;
    if(track) track.enabled = true;
    s.readyAt = now();
    setState(s, 'live');
    if(s.ov && s.ov.hint) s.ov.hint.textContent = fill(tt('callAgentTrialHint'), { b: clip(s.business, 60) });
    watchConn(s);
    tick(s);
    later(s, function(){ rtpLoop(s); }, RTP_MS);
    // المالك يبدأ («ألو») كمن يردّ على الهاتف؛ صمت ٣ث ← المساعد يبادر بجملة التعريف من تعليمات الجلسة
    later(s, function(){ if(!s.heard && !s.speaking) create(s, 'open'); }, SILENT_OPEN_MS);
    // قبل السقف بعشرين ثانية: تذكير عنصرًا في المحادثة ثمّ ردّ عارٍ — response.instructions كانت تحلّ محلّ تعليمات الجلسة لذلك
    // الردّ (الهويّة الآليّة والحقائق ولغة الملخّص) في أهمّ لحظة: آخر report_outcome
    if(s.maxSec > 40) later(s, function(){
      send(s, { type: 'conversation.item.create', item: { type: 'message', role: 'system', content: [{ type: 'input_text',
        text: 'Time is almost up. Wrap up now in one or two short sentences: call report_outcome with what you know, say a polite goodbye, then call end_call.' }] } });
      create(s, 'nudge');
    }, (s.maxSec - 20) * 1000);
    later(s, function(){ finish(s, 'completed'); }, s.maxSec * 1000);
  }
  function startTrial(id){
    var c = find(id); if(!c) return;
    // تدفّق واحد لكلّ بطاقة: لا تجربة والاتّصال الفعليّ يبدأ أو جارٍ (ضغطة على زرّ رُسم قبل التعطيل)
    if(starting[id] || (c.transport === 'phone' && c.callId && ACTIVE[String(c.state)])) return;
    if(trial){ note(id, 'callAgentErrActive'); return; }
    if(mahaBusy()){ note(id, 'callAgentErrMaha'); return; }
    if(typeof RTCPeerConnection !== 'function' || typeof navigator === 'undefined' || !navigator.mediaDevices){ note(id, 'callAgentErrNoRtc'); return; }
    // داخل الضغطة نفسها: فتح الصوت لسياسة التشغيل التلقائيّ في الجوّال (قبل التأكيد — نافذته قد تستهلك مهلة الضغطة)، وإيقاف قراءة ردّ جارية
    try{ if(typeof mahaUnlockAudio === 'function') mahaUnlockAudio(); }catch(e){ __swallow(e, 'call-agent:unlock'); }
    var audio = null;
    try{ audio = new Audio(); audio.autoplay = true; audio.setAttribute('playsinline', ''); }catch(e){ __swallow(e, 'call-agent:audio'); }
    // v-call-agent-paid: غير المالك يرى سعر التجربة وحجزها ويوافق قبل أيّ طلب (التجربة بنفس سعر الاتّصال الفعليّ)
    if(!isOwner()){
      var okPaid = false;
      try{ okPaid = (typeof confirm === 'function') ? !!confirm(tt('callAgentTrialConfirm') + '\n\n' + priceLines(c)) : false; }
      catch(e){ okPaid = false; __swallow(e, 'call-agent:trial-confirm'); }
      if(!okPaid) return;
    }
    try{ if(typeof stopAllSpeaking === 'function') stopAllSpeaking(); }catch(e){ __swallow(e, 'call-agent:tts-stop'); }
    notes[id] = '';
    var s = trial = { id: id, business: clip(c.business, 80), ended: false, pc: null, dc: null, stream: null, audio: audio, ov: null,
      timers: [], lines: [], outcome: null, heard: false, speaking: false, endPending: false, endTimer: null, wd: null,
      readyAt: 0, t0: now(), byResp: {}, cutResp: {}, played: {}, lastRid: '', clr: 0, cutN: 0, diagHead: [], diag: [], diagCut: false, rtp: null, fnSeen: {}, fnNames: {}, maxSec: Math.max(30, Math.min(600, Math.round(Number(c.maxMin) || 4) * 60)), halt: null, haltRes: null };
    s.halt = new Promise(function(res){ s.haltRes = res; });
    patch(id, { transport: 'trial', state: 'mic', callId: '', outcome: null, transcript: [], startedAt: now(), endedAt: 0, durationSec: 0, resultPushed: false });
    if(!isOwner()){ // v-call-agent-paid: معرّف التجربة في الكرت قبل الطلب (-1 = لم تنتهِ) — persist تحت يحفظه قبل أيّ شبكة
      // نهايات سابقة لم تُقبل بعد تُعاد الآن، من كلّ الكروت لا هذا وحده (قفل «تجربة حيّة واحدة» للمستخدم كلّه — المراجعتان الثانية
      // والثالثة)، وطلب الجلسة ينتظرها حتّى ٣ ث فلا يسبقها إلى القفل
      var pend = [];
      eachCallCard(function(x){
        var te = x.trialEnds || {}, any = false;
        Object.keys(te).forEach(function(k){ if(Number(te[k]) >= 0){ any = true; if(tried[k] >= 2) tried[k] = 1; } });
        if(any) pend.push(trialEnd(x.id));
      });
      if(pend.length) s.pre = Promise.race([Promise.all(pend), new Promise(function(r){ setTimeout(r, 3000); })]);
      s.trialId = newTrialId();
      var te0 = Object.assign({}, c.trialEnds || {}); te0[s.trialId] = -1; patch(id, { trialEnds: te0 });
    }
    mark(id);
    overlayOpen(s);
    persist(); refresh(id);
    runTrial(s).catch(function(e){ fail(s, e); });
  }

  /* ── الاتّصال الفعليّ ── */
  function schedulePoll(id, callId, deadline){
    if(polls[callId]) return;
    var p = polls[callId] = { id: id, deadline: deadline, timer: null };
    p.timer = setTimeout(function(){ pollOnce(p, callId); }, POLL_MS);
  }
  function stopPoll(callId){ var p = polls[callId]; if(p){ clearTimeout(p.timer); delete polls[callId]; } }
  async function pollOnce(p, callId){
    if(polls[callId] !== p) return;
    var r = await post('call-status', { callId: callId });
    if(polls[callId] !== p) return;
    var cur = find(p.id);
    if(!cur || cur.callId !== callId){ // المراجعة الثانية: الكرت انتقل لمكالمة أو تجربة أحدث — هذه تُسوّى بصمت ولا تكتب فوقه
      var still = r.ok && r.data.ended && Object.prototype.hasOwnProperty.call(r.data, 'billing') && r.data.billing === null;
      if((r.ok && r.data.ended && !still) || r.status === 403 || r.status === 404 || now() >= p.deadline){ stopPoll(callId); return; }
      p.timer = setTimeout(function(){ pollOnce(p, callId); }, POLL_MS * 5);
      return;
    }
    if(r.ok){
      var d = r.data, c0 = find(p.id) || {}, upd = { durationSec: Math.max(0, Math.round(Number(d.durationSec) || 0)) };
      if(PHONE_STATES[d.state]) upd.state = d.state;
      if(Array.isArray(d.transcript)) upd.transcript = cleanLines(d.transcript);
      if(d.outcome) upd.outcome = cleanOutcome(d.outcome);
      // يُحفظ ما تغيّر فقط (الحالة، الأسطر، النتيجة): حفظ السجلّ كلّه كلّ ثانيتين بلا جديد يثقل الصفحة (v-perf-save-slices)؛ المدّة وحدها تُعرض بلا حفظ
      var changed = !!((upd.state && upd.state !== c0.state)
        || (upd.transcript && JSON.stringify(upd.transcript) !== JSON.stringify(cleanLines(c0.transcript)))
        || (upd.outcome && JSON.stringify(upd.outcome) !== JSON.stringify(c0.outcome ? cleanOutcome(c0.outcome) : null)));
      var shown = changed || upd.durationSec !== (Number(c0.durationSec) || 0);
      if(shown) patch(p.id, upd);
      if(d.ended){
        // v-call-agent-paid (المراجعة): billing: null = انتهت ولم تُحسم تسويتها (عطل عابر) ← النتيجة تظهر، والاستطلاع يكمل أبطأ حتّى تُحسم
        var unsettled = Object.prototype.hasOwnProperty.call(d, 'billing') && d.billing === null;
        if(!unsettled) stopPoll(callId);
        var c = find(p.id), dirty = shown;
        if(c && ACTIVE[String(c.state)]){ patch(p.id, { state: 'completed' }); dirty = true; } // انتهت ولم يصل وصف حالتها
        if(!c || !c.endedAt){ patch(p.id, { endedAt: now() }); dirty = true; }
        if(d.billing){ patch(p.id, { billed: true }); dirty = true; }
        var pushed = pushResult(p.id);
        if(dirty || pushed) persist(); // ردّ «لم تُحسم» مطابق لا يحفظ المحادثات ويزامنها كلّ ١٠ ث (المراجعة الخامسة)
        refresh(p.id);
        if(pushed) rerender();
        if(unsettled){
          if(!p.ext){ p.ext = true; p.deadline = Math.max(p.deadline, now() + SETTLE_WAIT_MS); }
          if(now() < p.deadline){ p.timer = setTimeout(function(){ pollOnce(p, callId); }, POLL_MS * 5); return; }
          stopPoll(callId);
        }
        return;
      }
      if(changed) persist();
      if(shown) refresh(p.id);
    } else if(r.status === 403 || r.status === 404){
      stopPoll(callId);
      patch(p.id, { state: 'failed', endedAt: now() });
      notes[p.id] = errText(r);
      persist(); refresh(p.id);
      return;
    }
    if(now() >= p.deadline){
      var cx = find(p.id);
      // المراجعة الخامسة: عطل عابر عند الحدّ (عودة بعد إغلاق أو تجميد التبويب، والمكالمة انتهت عند الخادم) لا يحكم «انتهت المهلة» من ردّ
      // واحد فتضيع نتيجة مكالمة مدفوعة — مهلة سماح واحدة دقيقتين
      if(!r.ok && !p.grace && !(cx && cx.endedAt)){ p.grace = true; p.deadline = now() + 2 * 60000; p.timer = setTimeout(function(){ pollOnce(p, callId); }, POLL_MS * 5); return; }
      stopPoll(callId);
      if(!(cx && cx.endedAt)) patch(p.id, { state: 'timeout' }); // انتهت وتسويتها معلّقة: لا تصير «انتهت المهلة»
      persist(); refresh(p.id);
      return;
    }
    var ce = find(p.id);
    p.timer = setTimeout(function(){ pollOnce(p, callId); }, (ce && ce.endedAt) || p.grace ? POLL_MS * 5 : POLL_MS); // انتهت وتنتظر تسويتها: عطل عابر لا يستطلع كلّ ثانيتين
  }
  /* العقد v2: التأكيد يعرض كلّ ما قد يقوله المساعد للجهة — اسم المحلّ من الخرائط، والاسم الذي يتّصل به، والهدف، والتفاصيل */
  function confirmText(c){
    var rows = [];
    if(c.placeName) rows.push(tt('callAgentPlace') + ': ' + clip(c.placeName, 80));
    if(c.callerName) rows.push(tt('callAgentCaller') + ': ' + clip(c.callerName, 40));
    if(c.goal) rows.push(tt('callAgentGoal') + ': ' + clip(c.goal, 300));
    if(c.details) rows.push(tt('callAgentShare') + ': ' + clip(c.details, 500));
    var head = fill(tt('callAgentConfirm'), { b: clip(c.business, 80) });
    if(!isOwner()) rows.push(priceLines(c)); // v-call-agent-paid: السعر والحجز في التأكيد نفسه
    return rows.length ? head + '\n\n' + rows.join('\n') : head;
  }
  async function startPhone(id){
    var c = find(id);
    // تدفّق واحد لكلّ بطاقة: لا اتّصال فعليّ وتجربتها جارية (زرّ رُسم قبلها)، ولا ثانٍ فوق جارٍ
    if(!c || starting[id] || (trial && trial.id === id) || (c.transport === 'phone' && c.callId && ACTIVE[String(c.state)])) return;
    var ok = false;
    try{ ok = (typeof confirm === 'function') ? !!confirm(confirmText(c)) : true; }
    catch(e){ ok = false; __swallow(e, 'call-agent:confirm'); }
    if(!ok) return;
    starting[id] = true; notes[id] = ''; refresh(id);
    var r;
    try{ r = await post('call-start', paidBody({ id: id })); }
    finally{ starting[id] = false; }
    if(!r.ok && r.data.callId && r.data.unsettled){ // رفض الخدمة ولم يُحسم ردّ الحجز: الكرت يحمل رقمها فيسوّيها سؤال الحالة والمرور بعد التحميل
      patch(id, { transport: 'phone', callId: clip(r.data.callId, 80), state: 'failed', outcome: null, transcript: [], startedAt: now(), endedAt: now(), durationSec: 0, resultPushed: true, billed: false });
      persist();
      settlePhone(find(id)).catch(function(e){ __swallow(e, 'call-agent:refused-settle'); });
    }
    if(!r.ok || !r.data.callId){ notes[id] = errText(r); refresh(id); return; }
    var callId = clip(r.data.callId, 80), at = now();
    patch(id, { transport: 'phone', callId: callId, state: PHONE_STATES[r.data.state] ? r.data.state : 'queued', outcome: null,
      transcript: [], startedAt: at, endedAt: 0, durationSec: 0, resultPushed: false, billed: false });
    persist(); refresh(id);
    schedulePoll(id, callId, at + POLL_MAX_MS);
  }
  async function cancelPhone(id){
    var c = find(id); if(!c || !c.callId) return;
    var r = await post('call-cancel', { callId: c.callId });
    notes[id] = r.ok ? '' : tt('callAgentErrCancel'); // الحالة النهائيّة تصل مع الاستطلاع التالي
    refresh(id);
  }

  /* v-call-agent-paid (المراجعة): بعد التحميل يُمرّ على كلّ كروت الاتّصال في كلّ المحادثات — لا المفتوحة وحدها: نهايات تجارب لم يقبلها
   * الخادم، ومكالمات حقيقيّة انتهت ولم تُحسم تسويتها (سؤال حالة واحد يسوّيها عند الخادم)، وجارية تُستأنف متابعتها. */
  async function settlePhone(c){
    var callId = c.callId, r = await post('call-status', { callId: callId });
    var cur = find(c.id);
    if(!cur || cur.callId !== callId) return; // الكرت انتقل لمكالمة أحدث أثناء السؤال — لا تُعلَّم هي مسوّاة
    if((r.ok && r.data.billing) || r.status === 404){ patch(c.id, { billed: true }); persist(); }
  }
  function sweep(){
    try{
      if(!token()) return;
      eachCallCard(function(c){
        if(c.trialEnds && Object.keys(c.trialEnds).length) trialEnd(c.id, true);
        if(c.transport !== 'phone' || !c.callId || polls[c.callId]) return;
        if(ACTIVE[String(c.state)]) resume(c);
        else if(!c.billed && !isOwner()) settlePhone(c).catch(function(e){ __swallow(e, 'call-agent:sweep-phone'); });
      });
    }catch(e){ __swallow(e, 'call-agent:sweep'); }
  }
  setTimeout(sweep, 4000); setTimeout(sweep, 30000);

  /* مها تسأل قبل أن تفتح المايك: تجربة جارية = لا مكالمة ثانية فوقها (الاتّصال الفعليّ لا يمسّ المايك) */
  window.callAgentBusy = function(){ return !!trial; };
  try{ window.addEventListener('pagehide', function(){
    if(!trial) return;
    var s = trial;
    s.unloading = true;
    finish(s, 'dropped');
    // مستمعا app-04 (__saveFlush والمرآة) سبقانا، وsaveState مؤقّت لا ينطلق أثناء الإغلاق ← حفظ فوريّ أخير (أفضل جهد؛ والتحميل التالي يُكمل)
    try{ if(typeof __saveFlush === 'function') __saveFlush(true); }catch(e){ __swallow(e, 'call-agent:flush'); }
    try{ if(typeof window.__writeChatsMirror === 'function') window.__writeChatsMirror(); }catch(e){ __swallow(e, 'call-agent:mirror'); }
  }); }catch(e){ __swallow(e, 'call-agent:pagehide'); }
})();
