// tests/play-invite.test.cjs — v-play-invite (المالك ٣٠ أكتوبر: «ماعندي احد… حطّ الدعوة في التطبيق»): Google Play يشترط ١٢ مختبِرًا
// ١٤ يومًا قبل النشر للعموم. بطاقة دعوة فوق صندوق الكتابة لمتصفّح أندرويد العاديّ وحده، بخطوتين (مجموعة Google ثمّ رابط الاشتراك)،
// بالـ١٤ لغة. تشغيل الكتلة نفسها من js/app-10-features.js بمستند وهميّ ومؤقّتات ومراقبين يدويّين.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const LINKS = { group: 'https://groups.google.com/g/om-ai-testers', optIn: 'https://play.google.com/apps/testing/com.example.app' };

function block(links) {
  const src = read('js/app-10-features.js');
  const m = /\/\* v-play-invite[\s\S]*?\n\(function\(\)\{[\s\S]*?\n\}\)\(\);/.exec(src);
  assert.ok(m, 'كتلة دعوة المختبرين موجودة');
  const b = m[0].slice(m[0].indexOf('(function(){'));
  assert.match(b, /const PLAY_TEST = \{[^}]*\};/, 'الرابطان في ثابت واحد داخل الكتلة');
  return links ? b.replace(/const PLAY_TEST = \{[^}]*\};/, 'const PLAY_TEST = ' + JSON.stringify(links) + ';') : b;
}

function run(o = {}) {
  const els = {};
  const timers = [];
  const store = (init) => { const m = Object.assign({}, init); return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, _m: m }; };
  const local = store(o.local), session = store(o.session);
  const env = { composer: o.noComposer ? null : { bottom: 120, left: 10, width: 340, cx: 180 }, cardTop: 300, health: null };
  function el(tag) {
    const e = { tag, style: {}, children: [], attrs: {}, listeners: {}, removed: false, isConnected: false, textContent: '', className: '' };
    e.setAttribute = (k, v) => { e.attrs[k] = String(v); };
    e.appendChild = (c) => { e.children.push(c); };
    e.append = (...cs) => { e.children.push(...cs); };
    e.addEventListener = (ev, fn) => { (e.listeners[ev] = e.listeners[ev] || []).push(fn); };
    e.remove = () => { e.removed = true; e.isConnected = false; if (e.id && els[e.id] === e) delete els[e.id]; };
    e.getBoundingClientRect = () => (e.id === 'playInvite' ? { top: env.cardTop, height: 180 } : e.id === 'ownerHealthBar' && env.health ? env.health : { top: 0, height: 0 });
    return e;
  }
  for (const id of o.present || []) { els[id] = el('div'); els[id].id = id; }
  const prompt = el('textarea');
  els.prompt = prompt;
  if (!o.noComposer) { els.composerBox = el('div'); els.composerBox.id = 'composerBox'; }
  const bodyCls = new Set(o.bodyClass || []);
  const watchers = { resize: [], ro: [], mo: [] };
  const doc = {
    readyState: 'complete',
    visibilityState: 'visible',
    activeElement: null,
    documentElement: { classList: { contains: (c) => !!o.storeSafe && c === 'store-safe' } },
    getElementById: (id) => els[id] || null,
    querySelector: (sel) => (o.selectorHit && sel.includes(o.selectorHit) ? {} : null),
    createElement: el,
    addEventListener: () => {},
    body: { classList: { contains: (c) => bodyCls.has(c) }, appendChild: (c) => { c.isConnected = true; if (c.id) els[c.id] = c; } },
    head: { appendChild: (c) => { if (c.id) els[c.id] = c; } },
  };
  const ctx = {
    I18N: { en: { playTestTitle: 'T-en', playTestHint: 'H-en', playTestStep1: 'S1-en', playTestStep2: 'S2-en', closeTitle: 'Close' } },
    navigator: { userAgent: o.ua == null ? ANDROID : o.ua },
    localStorage: local, sessionStorage: session,
    isStandalone: () => !!o.standalone,
    omranLikelyApp: () => !!o.likelyApp,
    __swallow: (e) => { throw e; },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); },
    document: doc,
  };
  ctx.window = {
    curT: () => ({ playTestTitle: 'عنوان', playTestHint: 'تلميح', playTestStep1: 'خطوة١', playTestStep2: 'خطوة٢', closeTitle: 'إغلاق' }),
    __omranAboveComposer: () => env.composer,
    matchMedia: (q) => ({ matches: !!(o.media && o.media.includes(q)) }),
    innerHeight: 740,
    addEventListener: (ev, fn) => { if (ev === 'resize') watchers.resize.push(fn); },
    removeEventListener: (ev, fn) => { if (ev === 'resize') watchers.resize = watchers.resize.filter((f) => f !== fn); },
    ResizeObserver: function (fn) { const w = { fn, on: false }; watchers.ro.push(w); this.observe = () => { w.on = true; }; this.disconnect = () => { w.on = false; }; },
    MutationObserver: function (fn) { const w = { fn, on: false, targets: [] }; watchers.mo.push(w); this.observe = (t, opt) => { w.on = true; w.targets.push([t, opt]); }; this.disconnect = () => { w.on = false; }; },
  };
  vm.runInNewContext(block(o.links === undefined ? LINKS : o.links), ctx);
  const tick = () => { const t = timers.shift(); if (t) t.fn(); return t; };
  const fire = (kind) => { (kind === 'resize' ? watchers.resize.map((fn) => ({ fn, on: true })) : watchers[kind]).filter((w) => w.on).forEach((w) => w.fn([])); };
  return { els, timers, tick, local, session, doc, prompt, env, bodyCls, watchers, fire };
}

test('١. متصفّح أندرويد: البطاقة تظهر بعد ٨ ثوانٍ فوق صندوق الكتابة بخطوتين ونصوص data-i18n', () => {
  const r = run();
  assert.equal(r.timers.length, 1);
  assert.equal(r.timers[0].ms, 8000, 'تنتظر ٨ ثوانٍ: بعد جولة التعريف وتنبيه الجلسة');
  assert.ok(!r.els.playInvite, 'لا شيء قبل المؤقّت');
  r.tick();
  const card = r.els.playInvite;
  assert.ok(card, 'ظهرت');
  assert.equal(card.style.bottom, '120px', 'فوق الصندوق المقيس');
  assert.equal(card.style.left, '180px');
  assert.equal(card.style.width, '340px');
  assert.match(card.style.cssText, /z-index:50;/, 'تحت الدُّرج والأدوات والنوافذ');
  assert.doesNotMatch(card.style.cssText, /background|color:/, 'لا لون inline — قواعد الوضع تتبع تبديله وهي ظاهرة');
  const css = (r.els.playInviteCss || {}).textContent || '';
  assert.match(css, /#playInvite\{background:var\(--panel2[^}]*color:var\(--text/, 'ألوان الثيم في الفاتح والثيمات');
  assert.match(css, /html:not\(\[data-mode="light"\]\):not\(\.skin\):not\(\.skin-wood\) #playInvite, html\.bgimg:not\(\[data-mode="light"\]\) #playInvite\{background:#101013; --text:#eef0f6; --muted:#9a9a9e;\}/,
    'الوضع الأسود ومعه أيّ صورة خلفيّة: لون صندوق الكتابة — --panel2 هناك أسود صافٍ فكانت أسود على أسود');
  assert.match(css, /html\.bgimg\[data-mode="light"\] #playInvite\{background:#fbf5e9; --text:#1d1a16; --muted:#5f574c;\}/,
    'الفاتح مع صورة خلفيّة: سطح معتم بكتابة داكنة — كتابة الصورة على html كانت ١٫١:١');
  const [head, hint, row] = card.children;
  const [title, x] = head.children;
  assert.equal(title.attrs['data-i18n'], 'playTestTitle');
  assert.equal(title.textContent, 'عنوان', 'بلغة الواجهة');
  assert.equal(hint.attrs['data-i18n'], 'playTestHint');
  assert.equal(x.attrs['data-i18n'], '[aria-label]closeTitle');
  const [join, install] = row.children;
  assert.equal(join.href, LINKS.group);
  assert.equal(install.href, LINKS.optIn);
  assert.equal(join.target, '_blank');
  assert.equal(join.rel, 'noopener');
  assert.equal(join.className, 'btn primary', 'الخطوتان زرّان ظاهران — .btn العاديّ في الوضع الأسود نصّ بلا صندوق');
  assert.equal(install.className, 'btn primary');
  assert.equal(join.children[0].attrs['data-i18n'], 'playTestStep1');
  assert.equal(install.children[0].attrs['data-i18n'], 'playTestStep2');
  assert.equal(r.session._m.aiapp_play_invite_s, '1', 'مرّة في الجلسة');
});

test('٢. لا بطاقة: رابط فارغ، آيفون، حاسوب، هواوي، WebView، store-safe، تطبيق مثبّت أو غلاف، أو أُغلقت سابقًا', () => {
  const none = (o, why) => { const r = run(o); while (r.tick()); assert.ok(!r.els.playInvite, why); };
  none({ links: { group: '', optIn: LINKS.optIn } }, 'بلا رابط المجموعة');
  none({ links: { group: LINKS.group, optIn: '' } }, 'بلا رابط الاشتراك');
  none({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1' }, 'آيفون');
  none({ ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36' }, 'حاسوب');
  none({ ua: 'Mozilla/5.0 (Linux; Android 12; NOH-NX9; HMSCore 6.13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0 HuaweiBrowser/15.0 Mobile Safari/537.36' }, 'متصفّح هواوي');
  none({ ua: 'Mozilla/5.0 (Linux; Android 12; NOH-NX9; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/114.0 Mobile Safari/537.36' }, 'WebView');
  none({ storeSafe: true }, 'حزمة هواوي (store-safe)');
  none({ standalone: true }, 'التطبيق المثبّت');
  none({ likelyApp: true }, 'غلاف/TWA/علم متجر');
  none({ media: ['(display-mode: fullscreen)'] }, 'ملء الشاشة');
  none({ local: { aiapp_play_invite_x: '1' } }, 'أُغلقت سابقًا على هذا الجهاز');
  none({ session: { aiapp_play_invite_s: '1' } }, 'ظهرت في هذه الجلسة');
});

test('٣. تنتظر ما دامت نافذة أخرى ظاهرة (الخصوصيّة، تلميح أوّل زيارة، مكالمة مها، الدُّرج، الكتابة) ثمّ تظهر', () => {
  const r = run({ present: ['privacyConsent'] });
  r.tick();
  assert.ok(!r.els.playInvite, 'تحت بطاقة الخصوصيّة: لا');
  assert.equal(r.timers[0].ms, 1000, 'تعيد المحاولة كلّ ثانية');
  delete r.els.privacyConsent;
  r.tick();
  assert.ok(r.els.playInvite, 'بعد الموافقة تظهر');
  const tip = run({ present: ['askAllHintTip'] }); tip.tick();
  assert.ok(!tip.els.playInvite, 'تلميح أوّل زيارة فوق الصندوق: كانت تغطّيه فيُحفظ «مُشاهَدًا» بعد ٢٥ ثانية');
  const call = run({ bodyClass: ['maha-band-on'] }); call.tick();
  assert.ok(!call.els.playInvite, 'مكالمة مها');
  const callB = run({ present: ['mahaCallScreen'] }); callB.els.mahaCallScreen.style.display = 'flex'; callB.tick();
  assert.ok(!callB.els.playInvite, 'مكالمة الوكيل الصوتيّ (بلا شريط ذهبيّ)');
  const d = run({ selectorHit: '#sidebar.open' }); d.tick();
  assert.ok(!d.els.playInvite, 'الدُّرج مفتوح');
  const w = run(); w.doc.activeElement = w.prompt; w.tick();
  assert.ok(!w.els.playInvite, 'المستخدم يكتب');
  const h = run(); h.doc.visibilityState = 'hidden'; h.tick();
  assert.ok(!h.els.playInvite, 'التبويب مخفيّ');
  const g = run({ present: ['installPill'] }); for (let i = 0; i < 400 && g.tick(); i++);
  assert.ok(!g.els.playInvite && g.timers.length === 0, 'تستسلم بعد خمس دقائق بلا مؤقّت معلّق');
});

test('٤. ✕ أو الخطوة الثانية = لا تعود؛ الخطوة الأولى تبقيها؛ الكتابة تخفيها بلا حفظ', () => {
  const a = run(); a.tick();
  a.els.playInvite.children[0].children[1].onclick();
  assert.ok(!a.els.playInvite);
  assert.equal(a.local._m.aiapp_play_invite_x, '1', '✕ يُحفظ');
  assert.ok(a.watchers.ro.every((w) => !w.on) && a.watchers.mo.every((w) => !w.on) && a.watchers.resize.length === 0, 'الإغلاق يفكّ المراقبين');
  const b = run(); b.tick();
  const card = b.els.playInvite;
  const [join, install] = card.children[2].children;
  assert.ok(!join.listeners.click, 'الانضمام للمجموعة لا يغلقها — الخطوة الثانية بعده');
  install.listeners.click.forEach((fn) => fn());
  assert.ok(card.removed);
  assert.equal(b.local._m.aiapp_play_invite_x, '1', 'من فعّل الاختبار لا تُعرض عليه ثانية');
  const c = run(); c.tick();
  c.prompt.listeners.focus.forEach((fn) => fn());
  assert.ok(!c.els.playInvite, 'لوحة المفاتيح تحرّك الصندوق: تُخفى');
  assert.equal(c.local._m.aiapp_play_invite_x, undefined, 'بلا حفظ — تعود في جلسة لاحقة');
  const n = run({ noComposer: true }); n.tick();
  assert.match(n.els.playInvite.style.bottom, /^calc\(76px/, 'بلا صندوق ظاهر: احتياط فوق الشريط السفليّ');
});

test('٥. تتبع الصندوق والشاشة: المرفقات والتدوير وشريط المالك؛ ومكالمة مها وشريط الإشعارات يخفيانها بلا حفظ', () => {
  const r = run(); r.tick();
  const card = r.els.playInvite;
  assert.ok(r.watchers.ro.some((w) => w.on), 'تراقب حجم صندوق الكتابة');
  assert.ok(r.watchers.resize.length === 1, 'وتغيّر حجم الشاشة');
  r.env.composer = { bottom: 198, left: 10, width: 340, cx: 180 }; // مرفق كبّر الصندوق ٧٨ بكسل
  r.fire('ro');
  assert.equal(card.style.bottom, '198px', 'ترتفع مع الصندوق فلا تغطّي المرفق وزرّ حذفه');
  r.env.composer = { bottom: 90, left: 90, width: 560, cx: 370 }; // الجوّال المطويّ فُتح
  r.fire('resize');
  assert.equal(card.style.left, '370px');
  assert.equal(card.style.width, '440px', 'بسقف ٤٤٠');
  r.els.ownerHealthBar = { id: 'ownerHealthBar', getBoundingClientRect: () => ({ top: 500, height: 40 }) }; // شريط ملاحظات المالك (z أعلى)
  r.fire('mo');
  assert.equal(card.style.bottom, '250px', 'فوق شريط المالك لا تحته');
  delete r.els.ownerHealthBar;
  r.env.cardTop = -44; // تدوير أفقيّ لا يتّسع لها
  r.fire('resize');
  assert.ok(!r.els.playInvite, 'لا مكان: تُخفى بدل أن يخرج عنوانها و✕ عن الشاشة');
  assert.equal(r.local._m.aiapp_play_invite_x, undefined);
  const m = run(); m.tick();
  m.bodyCls.add('maha-band-on'); m.fire('mo');
  assert.ok(!m.els.playInvite, 'مكالمة مها بدأت وهي ظاهرة');
  assert.equal(m.local._m.aiapp_play_invite_x, undefined, 'بلا حفظ');
  const mo = m.watchers.mo[0];
  assert.ok(mo.targets.some(([t, opt]) => t === m.doc.body && opt.childList), 'تراقب أبناء الصفحة (شريط الإشعارات)');
  const n = run(); n.tick();
  n.els.mediaNotifAskBar = { id: 'mediaNotifAskBar' }; n.fire('mo');
  assert.ok(!n.els.playInvite, 'شريط الإشعارات يأخذ الموضع نفسه بـz أعلى: تُخفى');
});

test('٦. النصوص الأربعة بالـ١٤ لغة: مترجمة لا إنجليزيّة، بلا < أو &، مرّة واحدة في كلّ قاموس', () => {
  const KEYS = ['playTestTitle', 'playTestHint', 'playTestStep1', 'playTestStep2'];
  const pick = (src, re) => { const m = re.exec(src); assert.ok(m, re.source); return JSON.parse(m[1]); };
  const a3 = read('js/app-03-i18n-data.js');
  const ar = pick(a3, /\nObject\.assign\(I18N\.ar, (\{"playTestTitle"[^\n]*\})\);/);
  const en = pick(a3, /\nObject\.assign\(I18N\.en, (\{"playTestTitle"[^\n]*\})\);/);
  const dicts = { ar, en };
  for (const l of ['fr', 'es', 'tr', 'ru', 'hi', 'ur', 'bn', 'ne', 'fil', 'id', 'zh', 'ml']) {
    const src = read('i18n/' + l + '.js');
    dicts[l] = pick(src, new RegExp('v-play-invite[^\\n]*Object\\.assign\\(I18N\\["' + l + '"\\], (\\{[^\\n]*\\})\\);'));
    for (const k of KEYS) assert.equal(src.split('"' + k + '"').length, 2, l + ': ' + k + ' مرّة واحدة');
  }
  for (const k of KEYS) assert.equal(a3.split('"' + k + '"').length, 3, 'app-03: ' + k + ' للعربيّة والإنجليزيّة');
  assert.equal(Object.keys(dicts).length, 14);
  for (const [l, d] of Object.entries(dicts)) {
    assert.deepEqual(Object.keys(d), KEYS, l);
    for (const k of KEYS) {
      assert.ok(typeof d[k] === 'string' && d[k].trim().length > 3, l + ' ' + k);
      assert.doesNotMatch(d[k], /[<&]/, l + ' ' + k + ': innerHTML');
      assert.doesNotMatch(d[k], /Gemini|Claude|GPT|OpenAI|Groq|جيمناي|كلود/i, l + ' ' + k + ': بلا مزوّد');
      if (l !== 'en') assert.notEqual(d[k], en[k], l + ' ' + k + ': مترجمة');
    }
    assert.match(d.playTestHint, /14|١٤/, l + ': المدّة ١٤ يومًا');
  }
  assert.match(dicts.zh.playTestHint, /Google 账号/, 'zh: 账号 كبقيّة zh.js (لا 帐号)');
});

test('٧. وسم ملفّات اللغة مرفوع لـv-play-invite (يُقرأ لا يُثبَّت)', () => {
  const line = read('js/app-04-i18n-state.js').split('\n').find((l) => l.includes("sc.src = 'i18n/' + lg + '.js?v="));
  const m = /\.js\?v=(\d+)';[^\n]*v-play-invite \((\d+)\): /.exec(line || '');
  assert.ok(m, 'السبب ملحق في تعليق الوسم');
  assert.ok(Number(m[1]) >= Number(m[2]) && Number(m[2]) >= 780, 'الوسم ' + (m && m[1]));
});
