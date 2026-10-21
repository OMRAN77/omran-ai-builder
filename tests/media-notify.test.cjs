'use strict';
/* v-media-notify (طلب المالك ٤ أكتوبر: «إذا طلعت من التطبيق وأنا أسوي صورة يعطيني تنبيه أنها جاهزة»):
   وحدة js/media-notify.js المستقلّة — التفاف fetch يرصد اكتمال التوليد من كلّ المسارات، إشعار نظام
   للخارج من التطبيق، شريط سؤال عند أوّل توليد، وقسم «التنبيهات» يُحقن في الإعدادات. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

// ── دوم مصغّر ────────────────────────────────────────────────────────────────────────────────
function fakeEl(tag) {
  const e = { tag, children: [], style: { cssText: '' }, attrs: {}, _t: '', disabled: false, checked: false, id: '', type: '', onclick: null, parentNode: null };
  Object.defineProperty(e, 'textContent', { get() { return e._t; }, set(v) { e._t = v; if (v === '') e.children = []; } });
  e.appendChild = (c) => { c.parentNode = e; e.children.push(c); return c; };
  e.setAttribute = (k, v) => { e.attrs[k] = v; };
  e.getAttribute = (k) => e.attrs[k];
  e.remove = () => { e.removed = true; };
  e.querySelector = () => null;
  e.querySelectorAll = () => [];
  e.insertAdjacentHTML = (pos, html) => { e._html = (e._html || '') + html; };
  return e;
}
function boot(opts) {
  const o = Object.assign({ hidden: true, perm: 'granted', supported: true, pref: null, never: null, lang: 'ar', withMemory: true }, opts || {});
  const src = read('js/media-notify.js');
  const els = { mediaNotifToggle: fakeEl('input'), mediaNotifStatus: fakeEl('div') };
  els.mediaNotifToggle.id = 'mediaNotifToggle';
  els.mediaNotifStatus.id = 'mediaNotifStatus';
  const mem = o.withMemory ? fakeEl('div') : null;
  if (mem) mem.id = 'memorySection';
  const body = fakeEl('body');
  const listeners = {};
  const document = {
    documentElement: { lang: o.lang }, hidden: o.hidden, body, readyState: 'complete',
    getElementById: (id) => {
      if (els[id]) return els[id];
      if (id === 'memorySection') return mem;
      const c = body.children.find((x) => x.id === id);
      return (c && !c.removed) ? c : null;
    },
    createElement: fakeEl,
    addEventListener: (type, fn) => { listeners[type] = fn; },
  };
  const ls = new Map();
  if (o.pref !== null) ls.set('aiapp_media_notify', o.pref);
  if (o.never !== null) ls.set('aiapp_media_notify_never', o.never);
  const localStorage = { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) };
  const made = [];
  const perms = [];
  function NotificationFake(t, o2) { this.title = t; this.opts = o2; made.push(this); }
  Object.defineProperty(NotificationFake, 'permission', { get: () => o.perm });
  NotificationFake.requestPermission = () => { perms.push(1); return Promise.resolve(o.perm); };
  const responses = o.responses || {};
  const origFetch = (url, init) => {
    const r = responses[url] || { ok: true, json: async () => ({}) };
    return Promise.resolve({ ok: r.ok !== false, clone: () => ({ json: async () => (r.json ? r.json() : {}) }) });
  };
  const win = Object.assign({ __swallow() {}, fetch: origFetch, focus() { win._focused = true; }, __i18nDict: () => ({}) }, o.win || {});
  const MutationObserverFake = o.MO || function (fn) { this.observe = () => {}; };
  if (o.section) els.notifSection = o.section;
  new Function('window', 'document', 'localStorage', 'sessionStorage', 'Notification', 'MutationObserver', src)
    (win, document, localStorage, localStorage, o.supported ? NotificationFake : undefined, MutationObserverFake);
  return { win, document, els, body, mem, ls, made, perms, listeners, setPerm: (p) => { o.perm = p; } };
}
const tick = () => new Promise((r) => setImmediate(r));

// ── ١. الجوهر: خارج التطبيق + إذن ممنوح = إشعار؛ داخله = لا شيء ──────────────────────────────
test('١. الإشعار يُطلَق فقط والمستخدم خارج التطبيق وبإذن ممنوح', () => {
  const out = boot({ hidden: true, perm: 'granted' });
  assert.equal(out.win.mediaReadyNotify('image', true), true);
  assert.equal(out.made.length, 1);
  assert.equal(out.made[0].opts.tag, 'maha-media-ready', 'وسم ثابت — لا تكديس إشعارات');
  assert.match(out.made[0].opts.body, /صورتك جاهزة/);
  assert.ok(String(out.made[0].opts.icon).includes('icon-192'));

  const inApp = boot({ hidden: false, perm: 'granted' });
  assert.equal(inApp.win.mediaReadyNotify('image', true), false, 'داخل التطبيق ← لا إشعار أبدًا');
  assert.equal(inApp.made.length, 0);

  for (const p of ['default', 'denied']) {
    const b = boot({ hidden: true, perm: p });
    assert.equal(b.win.mediaReadyNotify('image', true), false, p + ' ← لا إشعار');
  }
  const off = boot({ hidden: true, perm: 'granted', pref: '0' });
  assert.equal(off.win.mediaReadyNotify('image', true), false, 'مُطفأ من الإعدادات ← لا إشعار');
});

test('١ب. الفيديو نصّه الخاصّ، والضغطة تُعيد التركيز وتُغلق', () => {
  const v = boot({ hidden: true, perm: 'granted' });
  v.win.mediaReadyNotify('video', true);
  assert.match(v.made[0].opts.body, /الفيديو جاهز/);
  v.win.mediaReadyNotify('video', false);
  assert.match(v.made[1].opts.body, /تعذّر إكمال الفيديو/);
  v.made[0].onclick();
  assert.equal(v.win._focused, true, 'الضغطة تُعيد التركيز للتطبيق');
});

// ── ٢. التفاف fetch: نجاح الصورة والفيديو يُشعِر، وأوّل توليد يسأل ───────────────────────────
test('٢. الالتفاف: POST maha-image بنجاح = إشعار صورة؛ SUCCEEDED = إشعار فيديو؛ البدء يسأل', async () => {
  const b = boot({
    hidden: true, perm: 'default',
    responses: {
      '/api/media?action=maha-image': { ok: true, json: async () => ({ imageBase64: 'AAA', mimeType: 'image/png' }) },
      '/api/video-status?id=1': { ok: true, json: async () => ({ status: 'SUCCEEDED', output: ['https://v/x.mp4'] }) },
      '/api/video-status?id=2': { ok: true, json: async () => ({ status: 'FAILED', failure: 'x' }) },
      '/api/chat': { ok: true, json: async () => ({ reply: 'هلا' }) },
    },
  });
  // بداية التوليد = شريط السؤال (الإذن غير محسوم)، ولا إشعار قبل منح الإذن
  await b.win.fetch('/api/media?action=maha-image', { method: 'POST', body: '{}' });
  await tick(); await tick();
  assert.ok(b.body.children.some((c) => c.id === 'mediaNotifAskBar'), 'شريط السؤال ظهر عند أوّل توليد');
  assert.equal(b.perms.length, 0, 'لا طلب إذن قبل ضغط «فعّل»');
  assert.equal(b.made.length, 0, 'بلا إذن ← لا إشعار ولو نجح التوليد');
  b.setPerm('granted'); // منح الإذن من الشريط — التوليدات التالية تُشعِر
  await b.win.fetch('/api/media?action=maha-image', { method: 'POST', body: '{}' });
  await tick(); await tick();

  await b.win.fetch('/api/video-status?id=1');
  await tick(); await tick();
  await b.win.fetch('/api/video-status?id=2');
  await tick(); await tick();
  await b.win.fetch('/api/chat', { method: 'POST' });
  await tick(); await tick();
  const kinds = b.made.map((n) => n.opts.body);
  assert.ok(kinds.some((t) => /صورتك جاهزة/.test(t)), 'نجاح الصورة أُشعِر');
  assert.ok(kinds.some((t) => /الفيديو جاهز/.test(t)), 'نجاح الفيديو أُشعِر');
  assert.ok(kinds.some((t) => /تعذّر إكمال الفيديو/.test(t)), 'فشل الفيديو النهائيّ أُشعِر');
  assert.equal(kinds.length, 3, 'طلب /api/chat لا يُشعِر');
});

test('٢ب. الالتفاف شفّاف: الاستجابة الأصليّة تُعاد كما هي', async () => {
  const b = boot({ perm: 'granted', responses: { '/api/media?action=maha-image': { ok: true, json: async () => ({ imageBase64: 'AAA' }) } } });
  const res = await b.win.fetch('/api/media?action=maha-image', { method: 'POST' });
  assert.equal(res.ok, true, 'الاستجابة الأصليّة نفسها');
});

// ── ٣. شريط السؤال: «لا شكرًا» نهائيّة، و«فعّل» تطلب الإذن ───────────────────────────────────
test('٣. الشريط: لا تكرار وهو ظاهر، ومن رفض لا يُسأل ثانية', () => {
  const b = boot({ perm: 'default' });
  b.win.mediaNotifyMaybeAsk();
  const bar = b.body.children.find((c) => c.id === 'mediaNotifAskBar');
  assert.ok(bar, 'الشريط ظهر');
  assert.equal(bar.children.length, 3, 'نصّ + زرّان');
  b.win.mediaNotifyMaybeAsk();
  assert.equal(b.body.children.filter((c) => c.id === 'mediaNotifAskBar' && !c.removed).length, 1, 'لا شريط ثانٍ وهو ظاهر');

  bar.children[2].onclick();
  assert.ok(bar.removed, 'الشريط أُغلق');
  assert.equal(b.ls.get('aiapp_media_notify_never'), '1');
  b.win.mediaNotifyMaybeAsk();
  assert.ok(!b.body.children.some((c) => c.id === 'mediaNotifAskBar' && !c.removed), 'من قال لا شكرًا لا يُسأل ثانية');

  const yes = boot({ perm: 'default' });
  yes.win.mediaNotifyMaybeAsk();
  yes.body.children.find((c) => c.id === 'mediaNotifAskBar').children[1].onclick();
  assert.equal(yes.perms.length, 1, 'requestPermission من الشريط فقط');

  for (const p of ['granted', 'denied']) {
    const settled = boot({ perm: p });
    settled.win.mediaNotifyMaybeAsk();
    assert.ok(!settled.body.children.length, p + ': لا شريط');
  }
});

// ── ٤. مفتاح الإعدادات ────────────────────────────────────────────────────────────────────────
test('٤. المفتاح: تفعيله يطلب الإذن، وإطفاؤه يحفظ، والرافض يُفسَّر', async () => {
  const b = boot({ perm: 'default' });
  b.els.mediaNotifToggle.checked = true;
  b.listeners.change({ target: b.els.mediaNotifToggle });
  await tick(); await tick();
  assert.equal(b.perms.length, 1, 'تشغيل المفتاح طلب الإذن');
  assert.equal(b.ls.get('aiapp_media_notify'), '1');

  const off = boot({ perm: 'granted' });
  off.els.mediaNotifToggle.checked = false;
  off.listeners.change({ target: off.els.mediaNotifToggle });
  assert.equal(off.ls.get('aiapp_media_notify'), '0', 'الإطفاء حُفظ');

  const denied = boot({ perm: 'denied' });
  denied.win.mediaNotifySyncToggle();
  assert.match(denied.els.mediaNotifStatus.textContent, /رافض الإشعارات/, 'الرفض الدائم يُفسَّر بجملة');

  const granted = boot({ perm: 'granted' });
  granted.win.mediaNotifySyncToggle();
  assert.equal(granted.els.mediaNotifToggle.checked, true, 'ممنوح + مفعَّل ← مفتاح مشغَّل');
});

// ── ٥. الربط والبنية: محمّل في design-gen (يُحمَّل قبل الحزمة)، وindex.html والحزمة لم تُمسّ ──
test('٥. الربط: محمّل في js/design-gen.js قبل الحزمة، ولا تعديل على index.html ولا أجزائها', () => {
  const host = read('js/design-gen.js');
  assert.ok(host.includes("/js/media-notify.js?v=3"), 'المحمّل يجلب الوحدة المستقلّة');
  assert.ok(host.includes('data-media-notify'), 'حراسة من التحميل المكرّر');
  const html = read('index.html');
  assert.ok(!html.includes('media-notify'), 'index.html لم يُمسّ — التحقّق من الحزمة يمنع تعديله عن بُعد');
  const hostTag = html.indexOf('/js/design-gen.js');
  assert.ok(hostTag > -1, 'وسم الملفّ المضيف موجود');
  assert.ok(hostTag < html.indexOf('/js/app.bundle.js'), 'المضيف يُحمَّل قبل الحزمة — الالتفاف يسبق أوّل توليد');
  const src = read('js/media-notify.js');
  assert.ok(src.includes("window.mediaReadyNotify") && src.includes("window.mediaNotifyMaybeAsk"));
  assert.ok(!/process\.env|API_KEY|SECRET/.test(src), 'لا قراءة بيئة ولا أسرار في ملفّ العميل');
});

// ── ٦. حوافّ: بلا Notification API لا كسر ─────────────────────────────────────────────────────
test('٦. متصفّح بلا Notification: لا إشعار ولا شريط ولا كسر', async () => {
  const b = boot({ supported: false });
  assert.equal(b.win.mediaReadyNotify('image', true), false);
  b.win.mediaNotifyMaybeAsk();
  assert.ok(!b.body.children.length, 'لا شريط');
  b.win.mediaNotifySyncToggle();
  assert.equal(b.els.mediaNotifToggle.disabled, true, 'المفتاح معطَّل');
  assert.match(b.els.mediaNotifStatus.textContent, /رافض الإشعارات/, 'سبب التعطيل ظاهر');
  await b.win.fetch('/api/maha-image', { method: 'POST' }); // الالتفاف لا يرمي بلا Notification
  await tick();
});

// ── ٧. موضع شريط السؤال (تدقيق ١٨–١٩ أكتوبر، g05 media-notify-ask): فوق الصندوق المقيس، بعرض محدود ومتوسّط ──────────
function barCss(b) {
  const bar = b.body.children.find((c) => c.id === 'mediaNotifAskBar');
  const o = {};
  String(bar.style.cssText).split(';').forEach((d) => { const i = d.indexOf(':'); if (i > 0) o[d.slice(0, i).trim()] = d.slice(i + 1).trim(); });
  return o;
}
test('٧. الجوّال: الشريط فوق صندوق الكتابة (أعلاه 719 من 844) لا فوقه، وبعرض الصندوق', () => {
  const b = boot({ perm: 'default', win: { innerWidth: 390, innerHeight: 844, __omranAboveComposer: (gap) => ({ bottom: 844 - 719 + gap, left: 16, width: 358, cx: 195 }) } });
  b.win.mediaNotifyMaybeAsk();
  const c = barCss(b);
  const bottom = parseFloat(c.bottom);
  assert.ok(bottom >= 844 - 719 + 1, 'أسفل الشريط فوق أعلى الصندوق: bottom=' + c.bottom);
  assert.ok(!('inset-inline' in c), 'لا امتداد من طرف لطرف');
  assert.equal(c.left, '195px', 'متوسّط على الصندوق');
  assert.equal(c.transform, 'translateX(-50%)');
  assert.equal(c.width, '358px', 'بعرض الصندوق');
});
test('٧ب. الحاسوب: عرض الشريط ≤ 640px ومتوسّط على الصندوق، وبلا صندوق مقيس احتياط متوسّط', () => {
  const d = boot({ perm: 'default', win: { innerWidth: 1440, innerHeight: 900, __omranAboveComposer: (gap) => ({ bottom: 900 - 799 + gap, left: 448, width: 674, cx: 785 }) } });
  d.win.mediaNotifyMaybeAsk();
  const c = barCss(d);
  assert.equal(c.width, '640px');
  assert.equal(c.left, '785px');
  assert.ok(parseFloat(c.bottom) > 900 - 799, 'فوق أعلى الصندوق');
  const f = boot({ perm: 'default', win: { innerWidth: 1440, innerHeight: 900 } });
  f.win.mediaNotifyMaybeAsk();
  const g = barCss(f);
  assert.equal(g.bottom, '76px', 'الاحتياط القديم');
  assert.equal(g.left, '50%');
  assert.equal(g.width, '640px');
  const p = boot({ perm: 'default', win: { innerWidth: 360, innerHeight: 800 } });
  p.win.mediaNotifyMaybeAsk();
  assert.equal(barCss(p).width, '336px', 'شاشة ضيّقة بلا صندوق: العرض − 24');
});


// ── ٨. تبديل اللغة يعيد كتابة قسم «التنبيهات» وسطر الحالة (g13 settings-notifications) ─────────────────────────────
function sectionWithNodes() {
  const nodes = ['notifSectionLabel', 'mediaNotifLabel', 'mediaNotifHint'].map((k) => { const n = fakeEl('span'); n.attrs['data-media-notif-i18n'] = k; return n; });
  const sec = fakeEl('div'); sec.id = 'notifSection';
  sec.querySelectorAll = (q) => (q === '[data-media-notif-i18n]' ? nodes : []);
  return { sec, nodes };
}
test('٨. مراقب سمة lang: بعد التحويل en ← ar تصير العناوين وسطر الحالة (رافض) عربيّة', () => {
  const observers = [];
  const MO = function (fn) { const me = { fn, opts: null, target: null }; observers.push(me); this.observe = (t, opts) => { me.target = t; me.opts = opts; }; this.disconnect = () => {}; };
  const { sec, nodes } = sectionWithNodes();
  const b = boot({ lang: 'en', perm: 'denied', MO, section: sec });
  b.win.mediaNotifySyncToggle();
  assert.match(b.els.mediaNotifStatus.textContent, /blocked by the browser/, 'بالإنجليزيّ أوّلًا');
  const langObs = observers.find((x) => x.opts && x.opts.attributes && Array.isArray(x.opts.attributeFilter) && x.opts.attributeFilter.includes('lang'));
  assert.ok(langObs, 'مراقب على سمة lang في documentElement');
  assert.equal(langObs.target, b.document.documentElement);
  b.document.documentElement.lang = 'ar';
  langObs.fn([{ type: 'attributes', attributeName: 'lang' }]);
  assert.match(b.els.mediaNotifStatus.textContent, /رافض الإشعارات/, 'سطر الحالة تعرّب');
  assert.equal(nodes[0].textContent, '🔔 التنبيهات');
  assert.equal(nodes[1].textContent, 'تنبيه اكتمال الصور والفيديو');
  assert.match(nodes[2].textContent, /إذا طلعت من التطبيق/);
  // عنوان صفحة الإعدادات العلويّ تنسخه applyLanguage من h3 القسم قبل أن يعمل المراقب — فالعنوان يحمل مفتاح الحزمة أيضًا
  const h3 = (read('js/media-notify.js').match(/<h3 [^>]*data-media-notif-i18n="notifSectionLabel"[^>]*>/) || [''])[0];
  assert.match(h3, /data-i18n="notifSectionLabel"/, 'applyLanguage تترجم العنوان بمفتاح موجود بالـ١٤ لغة');
});

// ── ٩. القاموس المحلّيّ بالـ١٤ لغة، و«fil» لا يسقط إلى الإنجليزيّ ───────────────────────────────────────────────────
test('٩. STR: كلّ مفتاح بالـ١٤ لغة بنصّ غير فارغ، وtr تحلّ fil كاملة', () => {
  const src = read('js/media-notify.js');
  const lit = (src.match(/var STR = (\{[\s\S]*?\n  \});/) || [])[1];
  assert.ok(lit, 'القاموس المحلّيّ');
  const STR = new Function('return ' + lit)();
  const LANGS = ['ar', 'en', 'fr', 'hi', 'ur', 'bn', 'ne', 'id', 'fil', 'tr', 'zh', 'ru', 'es', 'ml'];
  const keys = Object.keys(STR.ar);
  assert.equal(keys.length, 10);
  for (const l of LANGS) {
    assert.ok(STR[l], 'لغة ' + l);
    for (const k of keys) assert.ok(typeof STR[l][k] === 'string' && STR[l][k].trim(), l + '.' + k);
    assert.deepEqual(Object.keys(STR[l]).sort(), keys.slice().sort(), l + ': المفاتيح نفسها');
  }
  const fil = boot({ lang: 'fil', perm: 'denied' });
  fil.win.mediaNotifySyncToggle();
  assert.equal(fil.els.mediaNotifStatus.textContent, STR.fil.mediaNotifDenied, 'fil (ثلاثة أحرف) لا يُقصّ إلى fi');
  const ur = boot({ lang: 'ur', perm: 'granted', hidden: true });
  ur.win.mediaReadyNotify('video', true);
  assert.equal(ur.made[0].opts.body, STR.ur.mediaNotifReadyVideo, 'الأردو بقاموسها');
});
