// يوم ٢ — الخيط عند إعادة التحميل: يربط دفتر الرحلة بالمشروع ويسأل عنه عند الفتح.
// الاستخدام: bun patch-day2.ts   (يعمل على /tmp/vc/src بعد pull-src.ts)
const SRC = '/tmp/vc/src';
let changed = 0;

async function patch(rel: string, edits: [string, string][]) {
  const p = `${SRC}/${rel}`;
  let s = await Bun.file(p).text();
  for (const [find, rep] of edits) {
    const n = s.split(find).length - 1;
    if (n !== 1) { console.log(`✗ ${rel}: المرساة غير فريدة (${n}) → ${find.slice(0, 60)}`); process.exit(1); }
    s = s.replace(find, rep);
    changed++;
  }
  await Bun.write(p, s);
  console.log(`✓ ${rel}`);
}

// ── ① الخادم: الدفتر يعرف مشروعه ──────────────────────────────────────────
await patch('api/_lib/agent.js', [
  [
    `const { messages, token, guestId, currentCode } = body;`,
    `const { messages, token, guestId, currentCode, projId } = body;`,
  ],
  [
    `    status: 'running', ask: String((messages[messages.length - 1] || {}).content || '').slice(0, 200), text: '' };`,
    `    status: 'running', ask: String((messages[messages.length - 1] || {}).content || '').slice(0, 200), text: '',
    // الدفتر كان لصاحبه لا لمشروعه: يعرف أن عملًا اكتمل، ولا يعرف أين يُوضع بعد
    // إعادة التحميل. معرّف المشروع يجعل الاستئناف ممكنًا بلا تخمين.
    projId: String(projId || '').slice(0, 64) };`,
  ],
]);

// ── ② العميل ──────────────────────────────────────────────────────────────
await patch('js/app.bundle.js', [
  // (أ) استخراج تطبيق الناتج من ذيل runOmranAgent ليُستدعى من المسارين
  [
    `  const parsed = extractReply(full);`,
    `  await __agentApplyResult(cur, full);
  try{ localStorage.removeItem('aiapp_agent_live'); }catch(e){ /* العلامة ترفٌ */ }
}
// 🕯️ الدوام٢: تركيب ناتج الوكيل في المشروع (كود + رسالة + إصلاح ذاتي). كان
// محبوسًا في ذيل runOmranAgent، فمسارُ الاستئناف لم يملك طريقًا لتطبيق عملٍ
// اكتمل على الخادم. استُخرج كما هو — بلا تغيير سلوك — ليخدم المسارين.
async function __agentApplyResult(cur, full){
  const parsed = extractReply(full);`,
  ],

  // (ب) علامة «تشغيل قائم» + معرّف المشروع مع الطلب
  [
    `  const res = await fetch('/api/ai?action=agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: genAbortController ? genAbortController.signal : undefined,`,
    `  // العلامة تُكتب قبل الطلب لا بعده: لو أُعيد التحميل في الثانية الأولى وجب أن
  // نعرف أن هناك دفترًا يُنتظر. localStorage لأنها تنجو من إغلاق التبويب وتُكتب
  // فورًا — IndexedDB غير متزامنة فقد لا تصل قبل موت الصفحة. والضيف بلا دفتر.
  try{ if(authGet('aiapp_auth_token')) localStorage.setItem('aiapp_agent_live', JSON.stringify({ p: cur.id, t: Date.now() })); }catch(e){ __swallow(e, 'misc:agentlive'); }
  const res = await fetch('/api/ai?action=agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: genAbortController ? genAbortController.signal : undefined,`,
  ],
  // (ج) معرّف المشروع مع الطلب + رفضٌ قبل بدء التشغيل لا يخلّف علامة تنتظر دفترًا لا وجود له
  [
    `    body: JSON.stringify({ messages: history, token: authGet('aiapp_auth_token'), guestId: window.getGuestId(), currentCode: cur.code || '' }),
  });
  if(!res.ok){
    const errText = await res.text();`,
    `    body: JSON.stringify({ messages: history, token: authGet('aiapp_auth_token'), guestId: window.getGuestId(), currentCode: cur.code || '', projId: cur.id }),
  });
  if(!res.ok){
    try{ localStorage.removeItem('aiapp_agent_live'); }catch(e){ /* لم يبدأ تشغيل */ }
    const errText = await res.text();`,
  ],
  // (د) إلغاء المستخدم يمحو العلامة — الإيقاف يعني الإيقاف، لا استعادةً لاحقة
  [
    `if(e && e.name === 'AbortError'){ if(full) break; throw e; }`,
    `if(e && e.name === 'AbortError'){ try{ localStorage.removeItem('aiapp_agent_live'); }catch(_){} if(full) break; throw e; }`,
  ],

  // (هـ) قارئ الدفتر عند فتح الصفحة
  [
    `async function runOmranAgent(cur, apiText, thinkingDiv){`,
    `// 🕯️ الدوام٢: إعادة تحميل الصفحة كانت تقطع الخيط. الخادم يكمل ويكتب دفتره،
// لكن لا أحد يسأل عنه عند الفتح — فعملٌ اكتمل فعلًا كان يُرمى. هنا نسأل مرة
// واحدة: إن نجا تشغيل هذا المشروع، نعيده إلى مكانه.
async function __agentResumeOnLoad(){
  let mark = null;
  try{ mark = JSON.parse(localStorage.getItem('aiapp_agent_live') || 'null'); }catch(e){ mark = null; }
  const drop = () => { try{ localStorage.removeItem('aiapp_agent_live'); }catch(e){} };
  if(!mark || !mark.p) return;                                        // لا تشغيل كان قائمًا
  if(Date.now() - (mark.t || 0) > 3540000){ drop(); return; }          // انتهى عمر الدفتر (ساعة)
  if(!window.authGet || !window.authGet('aiapp_auth_token')) return;   // جلسة غائبة → لا دفتر يُقرأ، ولا نمحو العلامة
  const cur = (state.projects || []).find(p => p.id === mark.p);
  if(!cur){ drop(); return; }                                         // المشروع حُذف بين الجلستين
  let run = null;
  try{
    const r = await fetch('/api/ai?action=agent', { method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ runState: true, token: window.authGet('aiapp_auth_token') }) });
    if(r.ok) run = (await r.json()).run;
  }catch(e){ return; }                                                // شبكة ساقطة → نحاول في فتحة قادمة
  // دفتر لمشروع آخر أو لتشغيل أقدم من علامتنا = ليس عملنا. لا نلصقه بمكان لا يخصّه.
  if(!run || run.projId !== mark.p || (run.startedAt || 0) < (mark.t || 0) - 5000){ drop(); return; }
  state.currentId = cur.id;
  const note = { role:'assistant', content: '🕯️ ' + (lang === 'ar' ? 'وكيل عمران كان يعمل قبل إعادة التحميل — أتحقّق من عمله…' : 'Omran Agent was working before the reload — checking on its work…'), _loading: true };
  cur.messages.push(note);
  renderAll();
  let text = String(run.text || ''), finished = (run.status !== 'running');
  if(!finished){
    const later = await __agentRecoverRun(function(n){
      note.content = '🔌 ' + (lang === 'ar' ? ('الوكيل يكمل على الخادم (خطوة ' + n + ')…') : ('Agent still working on the server (step ' + n + ')…'));
      renderMessages(true);
    });
    if(later){ finished = true; if(later.length > text.length) text = later; }
  }
  const i = cur.messages.indexOf(note);
  if(i >= 0) cur.messages.splice(i, 1);                               // الفقاعة المؤقتة لا تُحفظ أبدًا
  if(finished && text){
    await __agentApplyResult(cur, text);
    const last = cur.messages[cur.messages.length - 1];
    if(last) last.content = '🕯️ ' + (lang === 'ar' ? 'اكتمل على الخادم بعد إعادة التحميل.' : 'Completed on the server after the reload.') + '\\n' + last.content;
    drop();
  } else if(!finished){
    // ما زال يعمل بعد ١٥٠ ثانية: نُبقي العلامة — الفتحة القادمة تسأل من جديد.
    cur.messages.push({ role:'assistant', content: '🕯️ ' + (lang === 'ar' ? 'الوكيل ما زال يعمل على الخادم — أعد تحميل الصفحة بعد قليل ليظهر عمله.' : 'The agent is still working on the server — reload in a moment to see its work.') });
  } else {
    cur.messages.push({ role:'assistant', content: '🕯️ ' + (lang === 'ar' ? ('التشغيل السابق لم يكمل — الحالة: ' + (run.status || 'غير معروفة') + '. اكتب طلبك من جديد.') : ('The previous run did not finish — status: ' + (run.status || 'unknown') + '. Please ask again.')) });
    drop();
  }
  saveState();
  renderAll();
}
async function runOmranAgent(cur, apiText, thinkingDiv){`,
  ],

  // (و) الوصل: بعد تحميل المشاريع من IndexedDB — قبلها لا مكان نعيد إليه العمل
  [
    `  }catch(e){
    console.error('IDB init/migration failed`,
    `    // 🕯️ الدوام٢: المشاريع صارت في اليد → اسأل الدفتر إن كان تشغيل قد نجا.
    try{ await __agentResumeOnLoad(); }catch(e){ console.warn('[agent] resume on load failed', e); }
  }catch(e){
    console.error('IDB init/migration failed`,
  ],
]);

console.log(`\n✅ ${changed} مرساة مُطبَّقة`);
