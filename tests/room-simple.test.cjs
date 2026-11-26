'use strict';
// v-talk-room-simple (المالك ٢٦ نوفمبر: «الي يدخل الصفحه يضيع… عطني فكره سهله» ثمّ «اذا الشخص سوى اشتراك يكون فيه جهة الاتصال ويشبك على طول»):
//   ١) «غرفة الربع» شاشتها الأولى: ربعك الجاهزون، زرّ «افتح غرفة»، وما بقي من الإعداد («خل ربعك يلقونك») — والباقي (الاشتراك، الكود، إدارة
//      الجهات) تحت «أكثر»؛ الاشتراك يطلع وحده عند الحدّ فقط.
//   ٢) حساب جديد على جوّال يرى في التطبيق شريطًا واحدًا يأخذه لـ/room?welcome=1 (اسمح بجهاتك، اربط رقمك).
// الدوالّ الحقيقيّة من room.html وjs/app-01-boot-auth.js (طريقة fnSrc)، والخادم الحقيقيّ لاستلام دخول Google.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const html = read('room.html');
function fnSrc(src, head) {
  const a = src.indexOf(head);
  assert.ok(a >= 0, head);
  let d = 0, i = src.indexOf('{', a);
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) break; } }
  return src.slice(a, i + 1);
}
const fns = (src, ...heads) => heads.map((h) => fnSrc(src, h)).join('\n');
const count = (s, re) => (s.match(re) || []).length;

const T = { callBtn: 'Call', friendsTitle: 'FRIENDS', open: 'OPEN', openHint: 'HINT', needLogin: 'LOGIN', more: 'MORE', welTitle: 'FINDME', linkOpenBtn: 'LINKNUM', welDone: 'CONTINUE',
  joinCode: 'JOINCODE', name: 'Name', join: 'JOIN' };
function page(over) {
  const ctx = Object.assign({
    T, token: 'tok', book: null, contacts: [], myPhone: '+971•••••01', myName: 'Omran', linkVia: ['telegram'], linkedNow: false, plink: null,
    bridge: false, androidUA: false, syncAsk: false, syncBusy: '', syncGo: '', installNote: false, syncHome: true,
    welcome: false, linkOpen: false, moreOpen: false, plan: { plan: 'free', left: 3600 }, timeUp: false, capHit: false, noPoints: false, quote: null, planBusy: false, planUp: false,
    manualPhones() { const m = {}; (ctx.contacts || []).forEach((c) => { m[c.phone] = 1; }); return m; },
    ringCard: () => '[RING]', syncBox: () => '[SYNC]', phoneBox: () => '[PHONE]', planCard: () => '[PLAN]', contactsCard: () => '[CONTACTS]',
  }, over || {});
  vm.runInNewContext(fns(html, 'function friendsCard(', 'function needSync(', 'function needPhone(', 'function setupCard(', 'function planNeed(', 'function homeView(', 'var esc = function'), ctx);
  return ctx;
}

test('الشاشة الأولى لمن كلّ شي عنده جاهز: زرّ «افتح غرفة» وشرحه و«أكثر» مطويّة — لا اشتراك ولا كود ولا إدارة جهات', () => {
  const h = page({ syncHome: false }).homeView();
  assert.ok(h.startsWith('[RING]<div class="card"><button'), 'المكالمة الواردة أوّلًا');
  assert.match(h, /<button type="button" data-host="1">OPEN<\/button><p class="note" style="margin:0">HINT<\/p>/);
  assert.match(h, /data-more="1" aria-expanded="false"[^>]*>MORE ▾</);
  for (const gone of ['[PLAN]', 'JOINCODE', '[CONTACTS]', '[SYNC]', '[PHONE]', 'FINDME', 'FRIENDS']) assert.ok(!h.includes(gone), gone + ' لا يظهر');
  assert.equal(count(h, /<button/g), 2, 'زرّان فقط');
});

test('«أكثر» مفتوحة: الاشتراك، الدخول بكود، وإدارة الجهات — والاشتراك مرّة واحدة', () => {
  const p = page({ moreOpen: true });
  let h = p.homeView();
  assert.match(h, /aria-expanded="true"[^>]*>MORE ▴</);
  assert.ok(h.indexOf('[PLAN]') > h.indexOf('MORE') && h.indexOf('JOINCODE') > h.indexOf('[PLAN]') && h.indexOf('[CONTACTS]') > h.indexOf('JOINCODE'));
  assert.match(h, /<input class="c" id="cd"[^>]*><input id="nm"[^>]*value="Omran"><button type="button" data-join="1">JOIN</);
  p.timeUp = true; h = p.homeView();
  assert.equal(count(h, /\[PLAN\]/g), 1, 'عند الحدّ و«أكثر» مفتوحة: لا تتكرّر');
});

test('بلا حساب: الزرّ معطّل مع «سجّل دخولك»، و«أكثر» تبدأ مفتوحة (الدخول بكود هو كلّ ما عنده)', () => {
  const h = page({ token: '', moreOpen: true, contacts: null, plan: null }).homeView();
  assert.match(h, /data-host="1" disabled style="opacity:\.5">OPEN<\/button><p class="note" style="margin:0">LOGIN</);
  assert.match(h, /data-join="1"/);
  assert.ok(!h.includes('FINDME') && !h.includes('FRIENDS'));
  assert.match(html, /var moreOpen = !token, linkOpen = false, capHit = false, planUp = false, syncHome = !book;/);
});

test('ربعك الجاهزون فوق بزرّ اتصل: من جهات الهاتف (بالرمز) ومن المحفوظين على التطبيق — والأسماء مهرَّبة', () => {
  const h64 = 'a'.repeat(64);
  const p = page({ book: { list: [{ n: '<b>سالم</b>', p: '+971500000002', h: h64, t: 'tok1' }, { n: 'مو على التطبيق', p: '+971500000003', h: 'b'.repeat(64) },
    { n: 'محفوظ يدويًّا', p: '+971500000004', h: 'c'.repeat(64), t: 'tok2' }] },
    contacts: [{ phone: '+971500000004', name: 'فاطمة"', onApp: true }, { phone: '+971500000005', name: 'علي', onApp: false }] });
  const f = p.friendsCard();
  assert.match(f, /<h2>FRIENDS<\/h2>/);
  assert.match(f, new RegExp('<li><span>&lt;b&gt;سالم&lt;/b&gt;</span><button type="button" data-ringt="' + h64 + '">Call</button></li>'));
  assert.match(f, /<li><span>فاطمة&quot;<\/span><button type="button" data-ring="\+971500000004">Call<\/button><\/li>/);
  assert.equal(count(f, /<li>/g), 2, 'غير الجاهز لا يظهر، والمحفوظ يدويًّا لا يتكرّر');
  const home = p.homeView();
  assert.ok(home.includes('<h2>FRIENDS</h2>') && home.includes('data-ringt="' + h64 + '"'), 'في الشاشة الأولى');
  assert.ok(home.indexOf('FRIENDS') < home.indexOf('data-host'), 'قبل زرّ الغرفة');
  assert.equal(page({ token: '' }).friendsCard(), '');
  assert.equal(page().friendsCard(), '', 'لا أحد: لا بطاقة');
});

test('«خل ربعك يلقونك»: فقط ما بقي — جهات الأندرويد التي لم تُقرأ، ورقم غير مربوط (مطويّ خلف زرّ) — وتختفي حين يتمّان', () => {
  let p = page({ androidUA: true });
  let h = p.setupCard();
  assert.match(h, /border-color:var\(--gold\)"><h2>FINDME<\/h2>\[SYNC\]<\/div>$/, 'أندرويد لم يقرأ جهاته: خطوة الجهات وحدها');
  p.book = { list: [] }; assert.match(p.setupCard(), /\[SYNC\]/, 'قرأها في هذه الزيارة: نتيجتها تبقى ظاهرة');
  p = page({ bridge: true, book: { list: [] }, syncHome: false, syncBusy: 'x', syncAsk: true });
  assert.equal(p.setupCard(), '', 'قُرئت قبل فتح الصفحة: التحديث يبقى تحت «أكثر» حيث ضُغط — لا يقفز لفوق');
  assert.equal(page({ book: null }).setupCard(), '', 'آيفون/حاسوب: الجهات تحت «أكثر» (طريق الملفّ)');

  p = page({ myPhone: null });
  h = p.setupCard();
  assert.match(h, /<button type="button" class="soft" data-plopen="1">LINKNUM<\/button>/); assert.ok(!h.includes('[PHONE]'));
  p.linkOpen = true; assert.match(p.setupCard(), /\[PHONE\]/);
  p.linkOpen = false; p.plink = { code: 'PLX' }; assert.match(p.setupCard(), /\[PHONE\]/, 'ربط جارٍ: الصندوق ظاهر');
  p = page({ myPhone: '+971•••••01', linkedNow: true }); assert.match(p.setupCard(), /\[PHONE\]/, '«انربط رقمك» يبقى ظاهرًا');
  assert.match(page({ myPhone: null, linkVia: [] }).setupCard(), /<h2>FINDME<\/h2>\[PHONE\]<\/div>$/, 'لا قناة ربط: التنبيه نفسه ظاهر (لا يُطوى تحت «أكثر»)');
  assert.equal(page({ myPhone: null, contacts: null }).setupCard(), '', 'قبل أن تصل بيانات الحساب: لا شيء');

  p = page({ androidUA: true, myPhone: null });
  h = p.setupCard();
  assert.ok(h.indexOf('[SYNC]') < h.indexOf('data-plopen'), 'الجهات ثمّ الرقم');
  assert.ok(!h.includes('CONTINUE'));
});

test('بعد التسجيل (?welcome=1): الخطوتان مفتوحتان، وزرّ «كمّل للتطبيق»؛ وإن لم يبق شيء فالشرح والزرّ', () => {
  let p = page({ welcome: true, androidUA: true, myPhone: null, linkOpen: true });
  let h = p.setupCard();
  assert.match(h, /\[SYNC\]\[PHONE\]<button type="button" class="soft" data-wdone="1">CONTINUE<\/button><\/div>$/);
  p = page({ welcome: true });
  assert.match(p.setupCard(), /<h2>FINDME<\/h2><p class="note"[^>]*>HINT<\/p><button type="button" data-wdone="1">CONTINUE<\/button><\/div>$/);
  assert.match(html, /lsSet\('room-welcome', JSON\.stringify\(\{ u: bookUser\(\), at: Date\.now\(\) \}\)\);/, 'تُحفظ للحساب نفسه');
  assert.match(html, /welcome = !!\(wk && typeof wk === 'object' && wk\.u === bookUser\(\) && Date\.now\(\) - Number\(wk\.at\) < 900000\);/, '١٥ دقيقة، ولا تظهر لحساب آخر على الجوّال نفسه');
  const strip = (q) => q.replace(/([?&])welcome=1(&|$)/, (m, a, b) => (b ? a : ''));
  assert.match(html, /search\.replace\(\/\(\[\?&\]\)welcome=1\(&\|\$\)\/, function \(m, a, b\) \{ return b \? a : ''; \}\)/, 'العلامة تخرج من العنوان فورًا');
  assert.deepEqual(['?welcome=1', '?welcome=1&lang=ar', '?lang=ar&welcome=1', '?c=1234&welcome=1&lang=en'].map(strip), ['', '?lang=ar', '?lang=ar', '?c=1234&lang=en']);
  assert.match(html, /if \(welcome\) \{ linkOpen = true; if \(\(bridge \|\| androidUA\) && !book && !syncOk\(\)\) syncAsk = true; \}\n  loadContacts\(\);/, 'الإفصاح أوّلًا كما هو — لا قراءة قبل «اسمح»');
  assert.match(html, /else if \(d\.wdone\) \{ lsDel\('room-welcome'\); location\.href = '\/'; \}/);
});

test('الاشتراك يطلع وحده عند الحدّ فقط — ويبقى لهذه الزيارة (من دفع يرى ما أخذ)', () => {
  let p = page();
  assert.equal(p.planNeed(), false);
  assert.ok(!p.homeView().includes('[PLAN]'));
  for (const hit of [{ timeUp: true }, { capHit: true }, { noPoints: true }, { quote: { cost: 37 } }, { planBusy: true }, { plan: { plan: 'free', left: 0 } }]) {
    p = page(hit);
    assert.equal(p.planNeed(), true, JSON.stringify(hit));
    const h = p.homeView();
    assert.ok(h.indexOf('[PLAN]') > h.indexOf('data-host') && h.indexOf('[PLAN]') < h.indexOf('data-more'), 'بين الزرّ و«أكثر»');
  }
  p = page({ timeUp: true }); p.planNeed();
  p.timeUp = false; p.plan = { plan: 'sub' };
  assert.equal(p.planNeed(), true, 'اشترك للتوّ: البطاقة باقية');
  assert.equal(page({ plan: { plan: 'sub' }, capHit: true }).planNeed(), false, 'مشترك من قبل: لا شيء');
  assert.equal(page({ plan: { plan: 'own' } }).planNeed(), false);
  assert.equal(page({ plan: null, timeUp: true }).planNeed(), false, 'الخطّة لم تصل بعد');
  assert.match(fnSrc(html, 'function admit('), /error = fullText\(\); if \(roomPlan === 'free'\) capHit = true; draw\(\); return; \}/, 'غرفة مجّانيّة امتلأت');
});

test('موصولة: الرسم، الأزرار، الجهات والرقم في مكان واحد، وصاحب الغرفة: الواتساب أوّلًا', () => {
  const d = fnSrc(html, 'function draw(');
  assert.match(d, /\} else h \+= homeView\(\);/);
  assert.match(html, /else if \(d\.more\) \{ moreOpen = !moreOpen; draw\(\); \}/);
  assert.match(html, /else if \(d\.plopen\) \{ linkOpen = true; draw\(\); \}/);
  assert.match(fnSrc(html, 'function contactsCard('), /\(needPhone\(\) \? '' : phoneBox\(\)\) \+ \(needSync\(\) \? '' : syncBox\(\)\)/, 'لا خانتان بالمعرّف نفسه في الصفحة');
  assert.match(fnSrc(html, 'function handleSyncHash('), /syncHome = true;/, 'الرجوع من التطبيق: النتيجة في الشاشة الأولى');
  assert.match(fnSrc(html, 'function peek('), /linkCode = ''; moreOpen = true; \}/, 'رابط غرفة ميّت: خانة الكود تنفتح');
  assert.match(fnSrc(html, 'function syncDone('), /if \(msg && msg === T\.syncDenied\) moreOpen = true;/, '«أضف الأرقام بيدك» تفتح مكانها');
  assert.match(d, /<div class="row"><button type="button" data-wa="1">' \+ T\.wa \+ '<\/button><button type="button" class="soft" data-share="1">' \+ T\.share/);
  for (const [k, ar] of [['more', 'أكثر'], ['friendsTitle', 'ربعك على التطبيق'], ['welTitle', 'خل ربعك يلقونك'], ['linkOpenBtn', 'اربط رقمك'], ['welDone', 'كمّل للتطبيق']]) {
    assert.ok(html.includes(k + ': "' + ar + '"'), k);
    assert.equal(count(html, new RegExp('"' + k + '":"', 'g')), 12, k + ' في اللغات الاثنتي عشرة');
  }
});

// ---- the app: one bar after a new account on a phone
const boot = read('js/app-01-boot-auth.js');
function appCtx(over) {
  const made = [], body = [];
  const el = () => { const e = { style: {}, attrs: {}, kids: [], setAttribute(k, v) { e.attrs[k] = v; }, append(...k) { e.kids.push(...k); }, remove() { e.removed = true; } }; made.push(e); return e; };
  const ctx = Object.assign({
    present: {}, token: 'tok',
    $: (sel) => ctx.present[sel] || null, authGet: () => ctx.token, curT: () => ({ friendsHintTitle: 'TITLE', friendsHintGo: 'GO' }), __swallow() {},
    navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile' },
    document: { querySelector: () => null, createElement: el, body: { appendChild: (e) => body.push(e) } },
    Math,
  }, over || {});
  ctx.window = { location: { href: '/' } };
  vm.runInNewContext(fnSrc(boot, 'function friendsAlert('), ctx);
  return { ctx, made, body };
}

test('التطبيق: شريط «خل ربعك يلقونك» — على الجوّال فقط، مرّة، ولا فوق شريط آخر؛ الضغطة تأخذ لـ/room?welcome=1', () => {
  let a = appCtx(); a.ctx.friendsAlert();
  assert.equal(a.body.length, 1);
  const bar = a.body[0];
  assert.equal(bar.id, 'friendsHintBar'); assert.equal(bar.attrs.role, 'alert'); assert.equal(bar.kids.length, 3);
  assert.equal(bar.kids[0].textContent, 'TITLE'); assert.equal(bar.kids[0].attrs['data-i18n'], 'friendsHintTitle');
  assert.equal(bar.kids[1].textContent, 'GO'); assert.equal(bar.kids[1].attrs['data-i18n'], 'friendsHintGo');
  bar.kids[1].onclick();
  assert.equal(a.ctx.window.location.href, '/room?welcome=1'); assert.equal(bar.removed, true);
  a = appCtx(); a.ctx.friendsAlert(); a.body[0].kids[2].onclick();
  assert.equal(a.body[0].removed, true); assert.equal(a.ctx.window.location.href, '/', '✕ يقفل فقط');

  a = appCtx({ navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131' } }); a.ctx.friendsAlert();
  assert.equal(a.body.length, 0, 'الحاسوب: لا شريط');
  a = appCtx({ navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X)' } }); a.ctx.friendsAlert();
  assert.equal(a.body.length, 1, 'الآيفون: يظهر (ربط الرقم ورابط الواتساب)');
  for (const other of ['#emailConfirmBar', '#recoveryHintBar']) { a = appCtx(); a.ctx.present[other] = {}; a.ctx.friendsAlert(); assert.equal(a.body.length, 0, other); }
  a = appCtx({ token: '' }); a.ctx.friendsAlert(); assert.equal(a.body.length, 0, 'بلا جلسة');
  a = appCtx(); a.ctx.present['#friendsHintBar'] = { remove() { this.gone = true; } }; a.ctx.friendsAlert();
  assert.equal(a.ctx.present['#friendsHintBar'].gone, true, 'القديم يُزال قبل الجديد');
});

test('التطبيق: يُعرض للحساب الجديد وحده (كلمة مرور، Google، رمز البريد) — لا لمن سجّل ليدفع، ولا تحويل تلقائيّ', () => {
  assert.match(boot, /const freshAcct = mode === 'signup' && !window\.__pendingCheckoutPlan;[^\n]*\n      authSet\('aiapp_auth_token', data\.token\);/, 'تُقرأ قبل onAuthed (التي تصفّر الخطّة المعلّقة)');
  assert.match(boot, /recoveryAlert\(data\.addRecovery\);[^\n]*\n      if\(freshAcct\) friendsAlert\(\);/);
  assert.match(boot, /noteSession\('[^']*'\);\n            if\(d\.isNew === true && typeof freshHint === 'function'\) freshHint\(\);[^\n]*\n            onAuthed\(d\.user, d\.avatar \|\| null\);/, 'Google: قبل onAuthed');
  {
    const timers = []; let shown = 0;
    const ctx = { window: {}, setTimeout: (f, ms) => timers.push([f, ms]), friendsAlert: () => { shown++; } };
    vm.runInNewContext(fnSrc(boot, 'function freshHint('), ctx);
    ctx.window.__pendingCheckoutPlan = { id: 'pro' }; ctx.freshHint(); assert.equal(timers.length, 0, 'سجّل ليدفع: لا شريط');
    ctx.window.__pendingCheckoutPlan = null; ctx.freshHint(); assert.equal(timers.length, 1); assert.equal(timers[0][1], 0);
    timers[0][0](); assert.equal(shown, 1, 'بعد أن تنتهي onAuthed');
  }
  assert.match(boot, /const freshAcct = d\.isNew === true && !window\.__pendingCheckoutPlan;[^\n]*\n          window\.onAuthed\(d\.username, d\.avatar \|\| null\);\n          if\(freshAcct && window\.friendsAlert\) window\.friendsAlert\(\);/);
  assert.match(boot, /\n  window\.friendsAlert = friendsAlert;\n/, 'فرع رمز البريد يناديها من window');
  assert.match(fnSrc(boot, 'function doLogout('), /const fb = \$\('#friendsHintBar'\); if\(fb\) fb\.remove\(\);/, 'لا يبقى بعد الخروج');
  assert.equal(count(boot, /friendsAlert\(\)/g), 3, 'التعريف ونداءان مباشران (والثالث عبر freshHint)');
  assert.equal(count(boot, /\/room\?welcome=1/g), 2, 'في الشريط وتعليقه — لا تحويل في غيره');
  assert.ok(!/friendsAlert/.test(fnSrc(boot, 'function onAuthed(')), 'ليس في onAuthed: يمرّ بها كلّ فتح للتطبيق');
  assert.equal(read('js/app.bundle.js').includes("bar.id = 'friendsHintBar';"), true, 'الحزمة مبنيّة');
});

test('التطبيق: نصّا الشريط بالـ١٤ لغة، وملفّات اللغات برقمها الجديد', () => {
  const ctx = { $: () => null, document: { getElementById: () => null, querySelector: () => null, documentElement: {} }, console, localStorage: { getItem: () => null } };
  ctx.window = ctx; vm.createContext(ctx);
  const src = read('js/app-03-i18n-data.js');
  const a = src.indexOf('const I18N = {'), b = src.indexOf('};window.I18N = I18N;') + 2;
  vm.runInContext('var I18N=' + src.slice(a + 'const I18N = '.length, b) + ';', ctx);
  const LANGS = ['fr', 'es', 'tr', 'ru', 'zh', 'hi', 'ur', 'bn', 'ne', 'ml', 'id', 'fil'];
  for (const L of LANGS) vm.runInContext(read('i18n/' + L + '.js'), ctx);
  assert.equal(ctx.I18N.ar.friendsHintTitle, 'خل ربعك يلقونك ويتصلون فيك في غرفة الربع'); assert.equal(ctx.I18N.ar.friendsHintGo, 'يلا');
  const seen = new Set();
  for (const L of ['ar', 'en', ...LANGS]) {
    for (const k of ['friendsHintTitle', 'friendsHintGo']) {
      const v = ctx.I18N[L] && ctx.I18N[L][k];
      assert.equal(typeof v, 'string', L + '.' + k); assert.ok(v.trim() && !/[<>]/.test(v), L + '.' + k);
      if (L !== 'ar' && L !== 'ur') assert.ok(!/[؀-ۿ]/.test(v), L + '.' + k + ': بلا عربيّ');
    }
    seen.add(ctx.I18N[L].friendsHintTitle);
  }
  assert.equal(seen.size, 14, 'كلّ لغة بترجمتها');
  const tagLine = read('js/app-04-i18n-state.js').split('\n').find((l) => l.includes("sc.src = 'i18n/' + lg + '.js?v=")) || '';
  const tm = /\.js\?v=(\d+)';/.exec(tagLine);
  assert.ok(tm && Number(tm[1]) >= 810 && tagLine.includes('v-talk-room-simple (810)'), 'وسم اللغات مرفوع وسببه في تعليقه');
});

test('الخادم: دخول Google يقول إنّ الحساب جديد (isNew) كما يفعل رمز البريد — والقديم false', async () => {
  const cbSrc = read('api/_lib/auth-google-callback.js');
  assert.match(cbSrc, /let user = null, reclaimed = false, isNew = false;/);
  assert.match(cbSrc, /await putUser\(key, user\);\n      isNew = !reclaimed;\n      if \(!reclaimed\) await notifyNewAccount\(/, 'عند الإنشاء فقط، لا عند استرداد سجلّ مقفل');
  assert.match(cbSrc, /net: giftNet\(clientIp\(req\)\), isNew,/);
  const store = new Map();
  const kvPath = require.resolve('../api/_lib/kv.js');
  const keep = require.cache[kvPath];
  require.cache[kvPath] = { id: kvPath, filename: kvPath, loaded: true, exports: {
    kvGetJSON: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null), kvPutJSON: async (k, v) => { store.set(k, JSON.stringify(v)); }, kvDel: async (k) => { store.delete(k); }, kvExpire: async () => {},
  } };
  const claimPath = require.resolve('../api/_lib/oauth-claim.js');
  delete require.cache[claimPath];
  try {
    const claim = require('../api/_lib/oauth-claim.js');
    const mkRes = () => { const r = { code: 0, j: null }; r.status = (c) => { r.code = c; return r; }; r.json = (j) => { r.j = j; return r; }; r.setHeader = () => {}; r.end = () => {}; return r; };
    const ST = 'cd'.repeat(16), ip = '198.51.100.9';
    for (const [rec, want] of [[{ isNew: true }, true], [{ isNew: false }, false], [{}, false], [{ isNew: 'yes' }, false]]) {
      store.set('db/oauth-claim/' + ST, JSON.stringify(Object.assign({ token: 'tok', user: 'u', ts: Date.now(), net: ip }, rec)));
      const c = mkRes();
      await claim({ method: 'POST', body: { state: ST }, headers: { 'x-forwarded-for': ip } }, c);
      assert.equal(c.j.token, 'tok'); assert.equal(c.j.isNew, want, JSON.stringify(rec));
    }
  } finally {
    delete require.cache[claimPath];
    if (keep) require.cache[kvPath] = keep; else delete require.cache[kvPath];
  }
});
