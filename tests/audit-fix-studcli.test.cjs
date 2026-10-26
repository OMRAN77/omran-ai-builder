'use strict';
/* tests/audit-fix-studcli.test.cjs — v-audit-studcli: إصلاحات فحص الاستوديوهات في الواجهة (المجموعة studcli).
   cli-studios-1  محرّر المخطّطات: الكتابة في الاسم/العرض/الطول لا تعيد بناء اللوحة (المؤشّر كان يقفز لأوّل الحقل).
   cli-studios-2  «دمج صورتين» و«ستايل العائلة»: الصور الإضافيّة تُصغَّر بـ__compressImg(…, 1024) و«حوّلها» ينتظر اكتمالها.
   cli-studios-3  معرض أفكار الديكور: detail المزوّدين (tavily:429 · google:off…) للمالك وحده.
   cli-studios-4  الاستوديوهات: نصّ خطأ الخادم الخامّ لا يظهر — رمز معروف بنصّه المترجم، وما سواه رسالة عامّة مترجمة، والخامّ للمالك.
   cli-studios-5  «توقيعي»: كلّ النصوص بمفاتيح t() بالـ١٤ لغة، والاتّجاه RTL للعربيّة والأرديّة وحدهما.
   cli-studios-6  «عدّل شيئًا محددًا» بعد اختيار نتيجة من المقارنة يعدّل المختارة لا السابقة.
   x-runtime-ui-3 بطاقات «ابدأ من هنا» في المقاولات تتبع لغة الواجهة عند كلّ تطبيق للغة. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const tick = (ms) => new Promise((r) => setTimeout(r, ms || 15));
const AR_RE = /[؀-ۿ]/;

/* ───────────────────────── cli-studios-1: محرّر المخطّطات ───────────────────────── */

const FP_SRC = read('js/app-15-floorplan.js');

function editorClient() {
  const end = FP_SRC.indexOf('/* ───────── الواجهة من نفس المواصفات');
  assert.ok(end > 0, 'نهاية كتلة المحرّر');
  const ctx = { window: {}, localStorage: { getItem: () => 'ar' }, console };
  vm.runInNewContext(FP_SRC.slice(0, end), ctx);
  const html = ctx.window.omranFloorplan.renderPlan({ title: 'بيت', plotWidth: 15, floors: [{ name: 'الطابق الأرضي', rooms: [{ name: 'مجلس', w: 6, h: 5 }, { name: 'صالة', w: 5, h: 5 }] }] });
  const a = html.indexOf('<script>/* عميل المحرّر');
  const b = html.indexOf('</script>', a);
  assert.ok(a > 0 && b > a, 'سكربت المحرّر داخل الصفحة');
  const spec = JSON.parse(html.slice(html.indexOf('window.__omranSpec=') + 19, html.indexOf(';window.__omranL10n=')));
  return { code: html.slice(a + 8, b), spec };
}

/* DOM وهميّ: لوحة الحقول تُبنى من innerHTML (عقد جديدة في كلّ مرّة كما في المتصفّح)،
   ولوحة مفاتيح تكتب في الحقل المركَّز عند موضع المؤشّر. focus() على حقل غير مركَّز يضع المؤشّر أوّله. */
function editorEnv() {
  const { code, spec } = editorClient();
  const byId = {};
  const kb = { active: null };
  const winL = {};
  function mk(tag, id) {
    const ls = {};
    let html = '';
    const el = {
      tagName: String(tag || 'div').toUpperCase(), id: id || '', className: '', style: { cssText: '' }, dataset: {}, children: [], textContent: '', value: '', listeners: ls,
      addEventListener(t, f) { (ls[t] = ls[t] || []).push(f); },
      appendChild(c) { el.children.push(c); c.parentNode = el; return c; },
      closest(sel) { return sel === '.room' && /\broom\b/.test(el.className) ? el : null; },
      setPointerCapture() {},
      focus() { if (kb.active !== el) { kb.active = el; el.selStart = el.selEnd = 0; } },
    };
    Object.defineProperty(el, 'innerHTML', {
      get() { return html; },
      set(v) {
        html = String(v); el.children = [];
        const rx = /<(input|button|b|div)\b([^>]*)>([^<]*)/g;
        let m;
        while ((m = rx.exec(html))) {
          const idm = /\bid="([^"]+)"/.exec(m[2]);
          if (!idm) continue;
          const c = mk(m[1], idm[1]);
          const vm2 = /\bvalue="([^"]*)"/.exec(m[2]);
          if (vm2) c.value = vm2[1].replace(/&quot;/g, '"');
          c.textContent = m[3];
          byId[idm[1]] = c;
        }
      },
    });
    if (id) byId[id] = el;
    return el;
  }
  ['grand', 'tabs', 'pw', 'depth', 'total', 'stage', 'addRoom', 'addFloor', 'panel', 'views'].forEach((id) => mk('div', id));
  const ctx = {
    console, Math, Number, String, JSON, isFinite, parseFloat,
    document: { readyState: 'complete', body: { clientWidth: 900 }, getElementById: (id) => byId[id] || null, createElement: (t) => mk(t), querySelectorAll: () => [], addEventListener() {} },
    addEventListener(t, f) { (winL[t] = winL[t] || []).push(f); },
    removeEventListener() {},
    parent: { postMessage() {} },
  };
  ctx.window = ctx;
  ctx.__omranSpec = spec;
  ctx.__omranL10n = null;
  vm.runInNewContext(code, ctx);
  const room = () => ctx.__omranSpec.floors[0].rooms[0];
  const select = (i) => {
    const el = byId.stage.children[i];
    byId.stage.listeners.pointerdown[0]({ target: el, clientX: 0, clientY: 0, pointerId: 1, preventDefault() {} });
    (winL.pointerup || []).forEach((f) => f({}));
  };
  const clickEnd = (el) => { kb.active = el; el.selStart = el.selEnd = el.value.length; };
  const selectAll = (el) => { kb.active = el; el.selStart = 0; el.selEnd = el.value.length; };
  const edit = (fn) => { const el = kb.active; fn(el); if (el.oninput) el.oninput({}); };
  const type = (s) => { for (const ch of s) edit((el) => { const a = el.selStart, b = el.selEnd; el.value = el.value.slice(0, a) + ch + el.value.slice(b); el.selStart = el.selEnd = a + 1; }); };
  const backspace = () => edit((el) => { let a = el.selStart; const b = el.selEnd; if (a === b) a = Math.max(0, a - 1); el.value = el.value.slice(0, a) + el.value.slice(b); el.selStart = el.selEnd = a; });
  const blur = () => { const el = kb.active; kb.active = null; if (el && el.onchange) el.onchange({}); };
  return { byId, kb, room, select, clickEnd, selectAll, type, backspace, blur, spec: () => ctx.__omranSpec };
}

test('cli-studios-1 الاسم: «مجلس» + XY = «مجلسXY» والحقل نفسه (لا إعادة بناء أثناء الكتابة)، والمسح لا يُلصق «غرفة» أوّل الحرف التالي', () => {
  const E = editorEnv();
  E.select(0);
  const field = E.byId.fName;
  assert.ok(field, 'لوحة الحقول مبنيّة');
  assert.equal(field.value, 'مجلس');
  E.clickEnd(field);
  E.type('XY');
  assert.equal(E.room().name, 'مجلسXY', 'الاسم في النموذج');
  assert.equal(E.byId.fName, field, 'الحقل نفسه لم يُستبدل');
  assert.equal(field.value, 'مجلسXY');
  assert.match(E.byId.stage.children[0].innerHTML, /مجلسXY/, 'الاسم على الغرفة يتحدّث لحظيًّا');
  // المسح الكامل: الحقل يبقى فارغًا (لا «غرفة» تُكتب فيه أثناء الكتابة) والحرف التالي يبدأ اسمًا جديدًا
  E.selectAll(field); E.backspace();
  assert.equal(field.value, '', 'الحقل لا يُعاد ملؤه أثناء الكتابة');
  assert.ok(E.room().name, 'الغرفة لا تبقى بلا اسم في الرسم');
  E.type('Z');
  assert.equal(E.room().name, 'Z');
  assert.equal(field.value, 'Z');
  // عند الخروج من حقل فارغ تُطبَّق «غرفة» الافتراضيّة
  E.selectAll(field); E.backspace(); E.blur();
  assert.equal(field.value, 'غرفة');
  assert.equal(E.room().name, 'غرفة');
});

test('cli-studios-1 العرض: تحديد الكلّ وكتابة 3.5 = 3.5 (لا 50.3)، والقيمة تُقيَّد بعرض الأرض عند الخروج من الحقل', () => {
  const E = editorEnv();
  E.select(0);
  const fw = E.byId.fW;
  E.selectAll(fw); E.type('3.5');
  assert.equal(E.room().w, 3.5, 'العرض المكتوب');
  assert.equal(fw.value, '3.5');
  assert.equal(E.byId.fW, fw, 'الحقل نفسه');
  assert.match(E.byId.fArea ? E.byId.fArea.textContent : E.byId.panel.innerHTML, /17\.5/, 'المساحة في اللوحة = 3.5×5');
  const fh = E.byId.fH;
  E.selectAll(fh); E.type('4.25');
  assert.equal(E.room().h, 4.25);
  // أعرض من الأرض (15 م): الغرفة لا تخرج عن الإطار
  E.selectAll(fw); E.type('50');
  assert.ok(E.room().w <= 15, 'العرض ≤ عرض الأرض: ' + E.room().w);
  assert.ok(E.room().x + E.room().w <= 15 + 1e-9, 'الغرفة داخل الأرض');
  E.blur();
  assert.equal(fw.value, '15', 'الحقل يُسوّى بالقيد عند الخروج');
  // قيمة غير صالحة لا تُفسد النموذج، والخروج يعيد الحقل لقيمته
  E.selectAll(fw); E.backspace();
  assert.equal(E.room().w, 15);
  E.blur();
  assert.equal(fw.value, '15');
});

/* ───────────────────────── مساعدات الاستوديوهات (app-12) ───────────────────────── */

const ST = read('js/app-12-studios.js');
const HELPERS = ST.slice(0, ST.indexOf('/* ---------- 🏠 AI Interior Design'));

function mkEl(tag, id) {
  const ls = {};
  const cls = new Set();
  let html = '';
  const q = {};
  const el = {
    tagName: String(tag || 'div').toUpperCase(), id: id || '', style: { cssText: '' }, dataset: {}, children: [], parentElement: null, parentNode: null,
    value: '', textContent: '', className: '', disabled: false, checked: false, files: null, options: [], attrs: {}, listeners: ls,
    classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c), toggle: (c, on) => { const v = on === undefined ? !cls.has(c) : !!on; if (v) cls.add(c); else cls.delete(c); return v; } },
    addEventListener(t, f) { (ls[t] = ls[t] || []).push(f); },
    removeEventListener() {},
    dispatchEvent(ev) { (ls[ev.type] || []).slice().forEach((f) => f.call(el, ev)); return true; },
    appendChild(c) { c.parentElement = el; c.parentNode = el; el.children.push(c); return c; },
    insertBefore(c) { return el.appendChild(c); },
    insertAdjacentElement(pos, c) { if (el.parentElement && pos === 'afterend') el.parentElement.appendChild(c); return c; },
    remove() { el.removed = true; },
    setAttribute(k, v) { el.attrs[k] = String(v); }, getAttribute(k) { return k in el.attrs ? el.attrs[k] : null; },
    removeAttribute(k) { delete el.attrs[k]; }, hasAttribute(k) { return k in el.attrs; },
    querySelector(sel) {
      if (q[sel]) return q[sel];
      const m = /^\.([\w-]+)$/.exec(sel);
      if (m) {
        const byClass = (function find(e) { for (const c of e.children) { if (String(c.className || '').split(/\s+/).includes(m[1])) return c; const r = find(c); if (r) return r; } return null; })(el);
        if (byClass) return byClass;
        const tm = new RegExp('<(\\w+)[^>]*class="[^"]*\\b' + m[1] + '\\b[^"]*"[^>]*>([^<]*)<').exec(html);
        if (tm) { const c = mkEl(tm[1]); c.textContent = tm[2]; c.className = m[1]; c.parentElement = el; q[sel] = c; return c; }
      }
      for (const ch of el.children) { const r = ch.querySelector && ch.querySelector(sel); if (r) return r; }
      return null;
    },
    querySelectorAll(sel) {
      if (sel === ':scope > div') return el.children.filter((c) => c.tagName === 'DIV');
      const out = [];
      const match = (c) => (sel === '.fashionCompareCheck:checked' ? (c.className === 'fashionCompareCheck' && c.checked) : String(c.className || '').split(/\s+/).includes(sel.replace(/^\./, '')));
      const walk = (e) => { for (const c of e.children) { if (match(c)) out.push(c); walk(c); } };
      walk(el);
      return out;
    },
    closest() { return null; }, scrollIntoView() {}, focus() { el.focused = true; }, setPointerCapture() {},
    getBoundingClientRect() { return { width: 0, height: 0, left: 0, top: 0 }; },
    click() { if (typeof el.onclick === 'function') return el.onclick({ preventDefault() {}, stopPropagation() {} }); },
  };
  Object.defineProperty(el, 'innerHTML', { get() { return html; }, set(v) { html = String(v); el.children = []; Object.keys(q).forEach((k) => delete q[k]); } });
  return el;
}
const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200 });
const T_MOCK = (k) => '[' + k + ']';

/* ───────────────────────── cli-studios-2 + 4: أنماط الصور (portrait-style) ───────────────────────── */

function portraitEnv(replies, opts) {
  const o = opts || {};
  const a = ST.indexOf('  let extraImagesB64 = [];');
  const b = ST.indexOf('\n})();\n\n/* ---------- 👗 AI Fashion Design');
  assert.ok(a > 0 && b > a, 'كتلة الصور الإضافيّة وزرّ «حوّلها»');
  const els = {};
  const byId = (id) => els[id] || (els[id] = mkEl('div', id));
  const style = byId('portraitStyleSelect');
  style.value = o.style || 'familystyle';
  const shown = [];
  const fetched = [];
  const compressed = [];
  const ctx = {
    console, Promise, JSON, Math, Array, Object, String, Number, Error, Date, RegExp, setTimeout, clearTimeout, Response, Uint8Array, atob,
    $: (s) => byId(String(s).replace(/^#/, '')),
    document: { getElementById: (id) => byId(id), createElement: (t) => mkEl(t), documentElement: mkEl('html') },
    window: { addEventListener() {}, t: o.noT ? undefined : T_MOCK },
    localStorage: { getItem: (k) => (k === 'aiapp_lang' ? (o.lang || 'ar') : null), setItem() {} },
    __swallow() {}, authGet: () => 'tok', omranOwnerUi: () => !!o.owner,
    styleEl: style, btnGenerate: byId('portraitStyleGenerateBtn'), statusEl: byId('portraitStyleStatus'), resultEl: byId('portraitStyleResult'),
    downloadEl: byId('portraitStyleDownloadLink'), compareWrap: null, compareBefore: null, shareBtn2: null, backdropEl: null,
    beautifySkinEl: null, beautifyLightEl: null, beautifyTeethEl: null, setComparePct() {},
    selectedBase64: 'TUFJTg==', selectedMime: 'image/jpeg',
    setStatus: (x) => shown.push(x), t: (k) => T_MOCK(k), bT: (ar, en) => (o.lang === 'en' ? en : ar),
    /* القراءة الخامّ القديمة: نتيجتها صورة الكاميرا كاملة */
    FileReader: class { readAsDataURL(f) { setTimeout(() => { this.result = 'data:image/jpeg;base64,' + f.__raw; if (this.onload) this.onload(); }, 3); } },
    fetch: async (u, init) => {
      const body = init && init.body ? JSON.parse(init.body) : null;
      fetched.push({ u: String(u), body });
      const r = replies && replies(String(u), body);
      return r || json({ imageBase64: 'UkVT', mimeType: 'image/png' });
    },
  };
  vm.createContext(ctx);
  vm.runInContext(HELPERS + '\n' + ST.slice(a, b), ctx);
  ctx.__compressImg = (file, cb, max) => { compressed.push({ name: file.name, max }); setTimeout(() => cb(file.__bad ? '' : 'data:image/jpeg;base64,U01BTEw' + file.name), 20); };
  return { ctx, els, byId, shown, fetched, compressed };
}

test('cli-studios-2 «ستايل العائلة»: الصور الإضافيّة تمرّ بـ__compressImg(…, 1024)، و«حوّلها» قبل اكتمالها ينتظرها فتُرسل كلّها مصغّرة', async () => {
  const E = portraitEnv();
  const input = E.byId('portraitMultiFileInput');
  const big = 'A'.repeat(4 * 1024 * 1024); // صورة كاميرا ~٣ م.ب بترميز base64
  input.files = [{ name: 'a.jpg', type: 'image/jpeg', __raw: big }, { name: 'b.heic', type: 'image/heic', __raw: big }, { name: 'c.jpg', type: 'image/jpeg', __raw: big }];
  input.onchange();
  await E.byId('portraitStyleGenerateBtn').onclick(); // الضغط فورًا — قبل انتهاء التصغير
  assert.deepEqual(E.compressed.map((c) => c.name + '@' + c.max), ['a.jpg@1024', 'b.heic@1024', 'c.jpg@1024'], 'كلّ صورة إضافيّة عبر __compressImg بحدّ 1024');
  const sent = E.fetched.find((f) => f.u === '/api/portrait-style');
  assert.ok(sent, 'أُرسل الطلب');
  assert.deepEqual(sent.body.extraImages, ['U01BTEwa.jpg', 'U01BTEwb.heic', 'U01BTEwc.jpg'], 'الثلاث مصغّرة وبترتيبها — لا ناقصة ولا خامّ');
  assert.ok(JSON.stringify(sent.body).length < 64 * 1024, 'الجسم صغير');
  // «دمج صورتين»: صورة واحدة فقط، وصورة لم تُقرأ (HEIC فشل تحويله) لا تُرسل فارغة
  const M = portraitEnv(null, { style: 'merge2' });
  const mi = M.byId('portraitMultiFileInput');
  mi.files = [{ name: 'x.jpg', type: 'image/jpeg', __raw: big }, { name: 'y.jpg', type: 'image/jpeg', __raw: big }];
  mi.onchange();
  await M.byId('portraitStyleGenerateBtn').onclick();
  assert.deepEqual(M.fetched[0].body.extraImages, ['U01BTEwx.jpg']);
  const B = portraitEnv();
  const bi = B.byId('portraitMultiFileInput');
  bi.files = [{ name: 'bad.heic', type: 'image/heic', __bad: true }, { name: 'ok.jpg', type: 'image/jpeg' }];
  bi.onchange();
  await B.byId('portraitStyleGenerateBtn').onclick();
  assert.deepEqual(B.fetched[0].body.extraImages, ['U01BTEwok.jpg']);
});

test('cli-studios-2 اختيار صور جديدة أثناء التصغير يلغي القديمة (لا خلط بين دفعتين)', async () => {
  const E = portraitEnv();
  const input = E.byId('portraitMultiFileInput');
  input.files = [{ name: 'old.jpg', type: 'image/jpeg' }];
  input.onchange();
  input.files = [{ name: 'new1.jpg', type: 'image/jpeg' }, { name: 'new2.jpg', type: 'image/jpeg' }];
  input.onchange();
  await E.byId('portraitStyleGenerateBtn').onclick();
  assert.deepEqual(E.fetched[0].body.extraImages, ['U01BTEwnew1.jpg', 'U01BTEwnew2.jpg']);
  await tick(40);
  assert.equal(E.byId('portraitMultiPreviewWrap').children.length, 2, 'المعاينات للدفعة الأخيرة وحدها');
});

test('cli-studios-4 أنماط الصور: ٥٠٢ بجملة عربيّة من الخادم ← رسالة مترجمة لا النصّ الخامّ، و٤١٣ ← «الصورة كبيرة جدًّا»، والخامّ للمالك', async () => {
  const fail = (body, s) => (u) => (u === '/api/portrait-style' ? json(body, s) : null);
  const E = portraitEnv(fail({ error: 'تعذّر إنشاء الصورة الآن. جرّب مرة أخرى.' }, 502), { lang: 'fr' });
  await E.byId('portraitStyleGenerateBtn').onclick();
  const last = E.shown[E.shown.length - 1];
  assert.equal(last, '❌ [voiceImageFailed]');
  assert.ok(!AR_RE.test(last), 'لا عربيّة في واجهة فرنسيّة: ' + last);
  // ٤١٣ من الاستضافة: __safeJson يحوّل النصّ إلى error
  const E2 = portraitEnv(() => new Response('Request Entity Too Large\n\nFUNCTION_PAYLOAD_TOO_LARGE', { status: 413 }), { lang: 'en' });
  await E2.byId('portraitStyleGenerateBtn').onclick();
  assert.equal(E2.shown[E2.shown.length - 1], '❌ [acctAvatarTooBig]');
  // المالك يرى السبب الخامّ بجانب الرسالة
  const E3 = portraitEnv(fail({ error: 'Proxy error: aborted' }, 500), { owner: true });
  await E3.byId('portraitStyleGenerateBtn').onclick();
  assert.equal(E3.shown[E3.shown.length - 1], '❌ [voiceImageFailed] (Proxy error: aborted)');
});

test('cli-studios-4 مساعد الخطأ: رموز معروفة بنصّها، وأسماء المزوّدين والمتغيّرات لا تصل غير المالك، وبلا مترجم عربيّ/إنجليزيّ', () => {
  const run = (msg, o) => {
    const ctx = { window: { t: (o && o.noT) ? undefined : T_MOCK, __bT: (o && o.bT) || undefined }, omranOwnerUi: () => !!(o && o.owner), localStorage: { getItem: () => null }, console };
    vm.runInNewContext(HELPERS + '\nthis.out = __studioErrMsg(' + JSON.stringify(msg === null ? null : { message: msg }) + (o && o.fb ? ', ' + JSON.stringify(o.fb) : '') + ');', ctx);
    return ctx.out;
  };
  assert.equal(run('Server is missing GEMINI_API_KEY'), '❌ [voiceImageFailed]');
  assert.equal(run('Proxy error: The operation was aborted due to timeout'), '❌ [voiceImageFailed]');
  assert.equal(run('Unknown place'), '❌ [voiceImageFailed]');
  assert.equal(run('Failed to fetch'), '❌ [voiceImageFailed]');
  assert.equal(run('unavailable'), '❌ [svcPaused]');
  assert.equal(run('daily_limit_reached'), '❌ [portraitLimitReached]');
  assert.equal(run('HTTP 413'), '❌ [acctAvatarTooBig]');
  assert.equal(run('failed', { fb: 'designAiSuggestError' }), '❌ [designAiSuggestError]');
  assert.equal(run('Server is missing GEMINI_API_KEY', { owner: true }), '❌ [voiceImageFailed] (Server is missing GEMINI_API_KEY)');
  // بلا مترجم (لا يحدث في التطبيق): عربيّ أو إنجليزيّ من __bT، لا النصّ الخامّ
  const noT = run('Proxy error: x', { noT: true, bT: (ar, en) => en });
  assert.ok(!/Proxy|GEMINI/.test(noT) && /image/i.test(noT), noT);
  // لم يبقَ موضع في الاستوديوهات يلصق e.message بعد «❌ خطأ:»
  assert.ok(!/bT\('❌ خطأ: ','❌ Error: '\)\) \+ \(e && e\.message/.test(ST), 'لا «❌ خطأ: <نصّ الخادم>»');
  // ٤١٣ من الاستضافة بنصّ __safeJson، والرسالة المترجمة التي تبدأ بـ❌ أصلًا لا تتكرّر علامتها
  assert.equal(run('Request Entity Too Large\n\nFUNCTION_PAYLOAD_TOO_LARGE'), '❌ [acctAvatarTooBig]');
  const ctxX = { window: { t: (k) => '❌ Could not ' + k }, omranOwnerUi: () => false, localStorage: { getItem: () => null }, console };
  vm.runInNewContext(HELPERS + '\nthis.out = __studioErrMsg({ message: "x" }, "designAiSuggestError");', ctxX);
  assert.equal(ctxX.out, '❌ Could not designAiSuggestError');
});

/* ───────────────────────── cli-studios-3: معرض أفكار الديكور ───────────────────────── */

async function ideasRun(owner, reply) {
  const a = ST.indexOf("  const ideaStatusEl = document.getElementById('designAiIdeaStatus');");
  const b = ST.indexOf("  if(ideaChips) Array.prototype.forEach.call(ideaChips.querySelectorAll('button[data-place]')", a);
  assert.ok(a > 0 && b > a, 'كتلة معرض الأفكار');
  const els = {};
  const byId = (id) => els[id] || (els[id] = mkEl('div', id));
  const ctx = {
    console, JSON, Object, Array, String, Promise, Response,
    document: { getElementById: (id) => byId(id), createElement: (t) => mkEl(t) },
    window: {}, styleEl: { value: 'modern' }, authGet: () => 'tok', omranOwnerUi: () => owner,
    bT: (ar) => ar, t: T_MOCK, __safeJson: async (r) => r.json(),
    fetch: async () => reply,
  };
  vm.runInNewContext(ST.slice(a, b) + '\nthis.loadIdeas = loadIdeas;', ctx);
  await ctx.loadIdeas({ place: 'majlis' });
  return byId('designAiIdeaStatus').textContent;
}

test('cli-studios-3 معرض الأفكار: «مصدر الصور متوقف» بلا أسماء مزوّدين ولا حالة مفاتيح لغير المالك، والمالك يراها', async () => {
  const reply = () => json({ images: [], error: 'provider', detail: { tavily: '429', google: 'off', pexels: 'ok', unsplash: 'off', openverse: 'net', paid: 0 } });
  const user = await ideasRun(false, reply());
  assert.match(user, /مصدر الصور متوقف مؤقتًا/);
  assert.ok(!/tavily|google|pexels|unsplash|openverse|paid|429|off/i.test(user), 'لا مزوّد ولا حالة: ' + user);
  const own = await ideasRun(true, reply());
  assert.match(own, /tavily:429 · google:off/, 'المالك يرى السبب');
});

/* ───────────────────────── cli-studios-4 + 6: الأزياء ───────────────────────── */

const FX = ST.slice(ST.indexOf("(function(){\n  const modal = $('#fashionAiModal');"), ST.indexOf('/* ---------- 🕌 Religious Insights'));
const WOMEN = (ST.match(/women: \[([^\]]*)\]/) || [])[1].split(',').map((s) => s.trim().replace(/'/g, ''));

function fxEnv(lang, replies) {
  const els = {};
  const byId = (id) => els[id] || (els[id] = mkEl('div', id));
  const created = [];
  const fetched = [];
  const style = byId('fashionAiStyle');
  style.options = WOMEN.map((v) => ({ value: v, textContent: v, hasAttribute: () => false, getAttribute: () => null }));
  style.value = 'evening';
  byId('fashionAiTabImage').classList.add('primary');
  const store = { aiapp_lang: lang };
  const ctx = {
    console, Promise, JSON, Math, Array, Object, String, Number, Error, Date, RegExp, setTimeout, clearTimeout, Response,
    $: (s) => byId(String(s).replace(/^#/, '')),
    document: { getElementById: (id) => byId(id), createElement: (t) => { const e = mkEl(t); created.push(e); return e; }, documentElement: mkEl('html') },
    window: { addEventListener() {}, innerHeight: 900, t: T_MOCK },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    ResizeObserver: class { observe() {} disconnect() {} },
    Event: class { constructor(type, o) { this.type = type; this.bubbles = !!(o && o.bubbles); } },
    __swallow() {}, authGet: () => 'tok', closeHeaderMenu() {}, omranOwnerUi: () => false,
    fetch: async (u, o) => {
      const body = o && o.body ? JSON.parse(o.body) : null;
      fetched.push({ u: String(u), body });
      const r = replies && replies(String(u), body);
      return r || json({ error: 'x' }, 500);
    },
  };
  vm.createContext(ctx);
  vm.runInContext(HELPERS + '\n' + FX, ctx);
  ctx.__compressImg = (file, cb) => cb('data:image/jpeg;base64,UEhPVE8=');
  const upload = () => { const fi = byId('fashionAiFileInput'); fi.files = [{ name: 'me.jpg', type: 'image/jpeg' }]; fi.onchange(); };
  const byNewId = (id) => created.find((e) => e.id === id);
  return { ctx, els, byId, created, fetched, upload, byNewId };
}

test('cli-studios-4 الأزياء: التوليد والتعديل والاقتراح والمقارنة لا تعرض نصّ الخادم الخامّ', async () => {
  const AR_MSG = 'تعذّر إنشاء الصورة الآن. جرّب مرة أخرى.';
  // التوليد
  const E = fxEnv('fr', (u) => (u === '/api/fashion-create' ? json({ error: AR_MSG }, 502) : null));
  E.upload();
  await E.byId('fashionAiGenerateBtn').onclick();
  const st = E.byId('fashionAiStatus').textContent;
  assert.equal(st, '❌ [voiceImageFailed]');
  // التعديل بعد نتيجة ناجحة
  let n = 0;
  const R = fxEnv('fr', (u) => (u === '/api/fashion-create' ? (++n === 1 ? json({ imageBase64: 'UkVT', mimeType: 'image/png' }) : json({ error: AR_MSG }, 502)) : null));
  R.upload();
  await R.byId('fashionAiGenerateBtn').onclick();
  R.byNewId('fashionRefineInput').value = 'bleu';
  await R.byNewId('fashionRefineBtn').onclick();
  assert.equal(R.byId('fashionAiStatus').textContent, '❌ [voiceImageFailed]');
  // الاقتراح: رمز غير معروف ← رسالة الاقتراح العامّة
  const S = fxEnv('fr', (u) => (u === '/api/fashion-suggest' ? json({ error: 'Server is missing GEMINI_API_KEY' }, 500) : null));
  S.upload();
  await S.byId('fashionAiSuggestBtn').onclick();
  assert.equal(S.byId('fashionAiStatus').textContent, '❌ [designAiSuggestError]');
  for (const x of [st, S.byId('fashionAiStatus').textContent]) assert.ok(!AR_RE.test(x) && !/GEMINI/.test(x), x);
});

test('cli-studios-6 المقارنة ← اختيار «ب» ← «عدّل شيئًا محددًا»: يُرسل صورة «ب» لا التوليد السابق', async () => {
  let cmp = 0;
  const E = fxEnv('en', (u, body) => {
    if (u !== '/api/fashion-create') return null;
    if (body.mode === 'refine') return json({ imageBase64: 'UkVGSU5FRA==', mimeType: 'image/png' });
    if (body.fairness) { cmp++; return json({ imageBase64: 'Q01QJ' + cmp, mimeType: 'image/webp' }); }
    return json({ imageBase64: 'Rk1SU1Q=', mimeType: 'image/png' });
  });
  E.upload();
  await E.byId('fashionAiGenerateBtn').onclick();
  assert.ok(E.byNewId('fashionRefineRow'), 'صفّ التعديل تحت التوليد الأوّل');
  const wraps = E.byId('fashionAiCompareChecks').children;
  wraps[0].onclick(); wraps[1].onclick();
  await E.byId('fashionAiCompareBtn').onclick();
  const cells = E.byId('fashionAiCompareResults').children;
  assert.equal(cells.length, 2);
  E.byNewId('fashionRefineInput').value = 'leftover';
  cells[1].onclick();
  assert.equal(E.byId('fashionAiResult').src, 'data:image/webp;base64,Q01QJ2', 'المختارة هي النتيجة الظاهرة');
  assert.equal(E.byNewId('fashionRefineInput').value, '', 'خانة التعديل تبدأ فارغة للمختارة');
  assert.equal(E.byNewId('fashionRefineRow').style.display, 'flex', 'صفّ التعديل ظاهر');
  E.byNewId('fashionRefineInput').value = 'make the dress blue';
  await E.byNewId('fashionRefineBtn').onclick();
  const ref = E.fetched.filter((f) => f.body && f.body.mode === 'refine');
  assert.equal(ref.length, 1);
  assert.equal(ref[0].body.imageBase64, 'Q01QJ2', 'مصدر التعديل = «ب»');
  assert.equal(ref[0].body.mimeType, 'image/webp');
  // صفّ التعديل غير مبنيّ بعد (المقارنة قبل أيّ توليد): الاختيار يبنيه
  const F = fxEnv('en', (u, body) => (u === '/api/fashion-create' ? json({ imageBase64: 'Qw' + (body.style || ''), mimeType: 'image/png' }) : null));
  F.upload();
  const w2 = F.byId('fashionAiCompareChecks').children;
  w2[0].onclick(); w2[1].onclick();
  await F.byId('fashionAiCompareBtn').onclick();
  F.byId('fashionAiCompareResults').children[0].onclick();
  assert.ok(F.byNewId('fashionRefineRow'), 'الصفّ بُني عند الاختيار');
  F.byNewId('fashionRefineInput').value = 'x';
  await F.byNewId('fashionRefineBtn').onclick();
  assert.equal(F.fetched.find((f) => f.body && f.body.mode === 'refine').body.imageBase64, 'Qw' + WOMEN[0]);
});

/* ───────────────────────── cli-studios-5: «توقيعي» ───────────────────────── */

function sigEnv(lg, tFn) {
  const all = [];
  let ov = null;
  const mk = (tag) => {
    const ls = {};
    let html = '';
    const el = {
      tagName: String(tag).toUpperCase(), id: '', style: { cssText: '' }, children: [], attrs: {}, textContent: '', title: '', placeholder: '', value: '', dir: '', listeners: ls,
      setAttribute(k, v) { el.attrs[k] = String(v); }, getAttribute(k) { return k in el.attrs ? el.attrs[k] : null; },
      appendChild(c) { el.children.push(c); c.parentNode = el; if (c.id === 'sigOverlay') ov = c; return c; },
      insertBefore(c) { return el.appendChild(c); },
      addEventListener(t, f) { (ls[t] = ls[t] || []).push(f); },
      remove() { if (ov === el) ov = null; },
      querySelector(sel) { return sel === '.btnLabel' ? { set textContent(v) { el.__label = v; }, get textContent() { return el.__label; } } : null; },
      querySelectorAll(sel) {
        const out = [];
        const m = /^\.(.+)$/.exec(sel), a = /^\[([\w-]+)\]$/.exec(sel);
        const walk = (e) => { for (const c of e.children) { if ((m && c.className === m[1]) || (a && a[1] in c.attrs)) out.push(c); walk(c); } };
        walk(el);
        return out;
      },
      focus() {},
      getContext() { return el.__ctx || (el.__ctx = { measureText: () => ({ width: 120, actualBoundingBoxDescent: 10 }), clearRect() {}, scale() {}, transform() {}, translate() {}, fillText(s) { el.__drawn = s; }, beginPath() {}, moveTo() {}, quadraticCurveTo() {}, stroke() {} }); },
    };
    Object.defineProperty(el, 'innerHTML', { get() { return html; }, set(v) { html = String(v); const lm = /<span class="btnLabel">([^<]*)<\/span>/.exec(html); if (lm) el.__label = lm[1]; } });
    all.push(el);
    return el;
  };
  const dd = mk('div'); dd.id = 'headerMenuDropdown';
  const docEl = { lang: lg };
  const document = {
    readyState: 'complete', documentElement: docEl,
    getElementById: (id) => (id === 'headerMenuDropdown' ? dd : (id === 'sigOverlay' ? ov : all.find((e) => e.id === id && e !== dd) || null)),
    createElement: mk, head: { appendChild() {} }, body: { appendChild: (c) => { if (c.id === 'sigOverlay') ov = c; return c; } },
    addEventListener() {}, removeEventListener() {},
  };
  let observer = null;
  const ctx = {
    console, Promise, setTimeout, document, Math, JSON, String, Number, Object,
    window: { t: tFn },
    localStorage: { getItem: () => null, setItem() {} },
    MutationObserver: class { constructor(f) { observer = f; } observe() {} },
    navigator: {},
  };
  vm.runInNewContext(read('js/app-20-signature.js'), ctx);
  const texts = (root0) => {
    const out = [];
    const walk = (e) => { for (const v of [e.textContent, e.title, e.placeholder, e.attrs && e.attrs['aria-label'], String(e.innerHTML || '').replace(/<[^>]*>/g, ' ')]) if (v && String(v).trim()) out.push(String(v).trim()); (e.children || []).forEach(walk); };
    walk(root0);
    return out;
  };
  return { ctx, dd, docEl, overlay: () => ov, texts, btn: () => dd.children[0], fireLang: () => observer && observer(), canvas: () => all.find((e) => e.tagName === 'CANVAS' && e.__drawn !== undefined && e.style.width) };
}

test('cli-studios-5 «توقيعي» بواجهة فرنسيّة: الزرّ والنافذة كلّها من t() — لا عربيّة، واللوحة LTR، و«اسمك» على اللوحة بالفرنسيّة', () => {
  const FR = (k) => '«' + k + '»';
  const E = sigEnv('fr', FR);
  const b = E.btn();
  assert.equal(b.__label, '«axStudcliSigTitle»');
  assert.equal(b.title, '«axStudcliSigMenuTitle»');
  E.ctx.window.Omran.signature.open();
  const ov = E.overlay();
  assert.ok(ov, 'النافذة مفتوحة');
  assert.equal(ov.dir, 'ltr');
  const tx = E.texts(ov);
  for (const s of tx) assert.ok(!AR_RE.test(s), 'نصّ عربيّ في واجهة فرنسيّة: ' + s);
  for (const k of ['axStudcliSigTitle', 'axStudcliSigPh', 'axStudcliSigSize', 'axStudcliSigSlant', 'axStudcliSigInk', 'axStudcliSigFlourish', 'axStudcliSigDownload', 'axStudcliSigNote', 'axStudcliSigName', 'shareMsgTitle', 'closeTitle', 'fxColWhite', 'axStudcliSigFontThuluth', 'axStudcliSigFontFarsi']) {
    assert.ok(tx.some((s) => s.includes('«' + k + '»')), 'المفتاح مستعمل: ' + k);
  }
  const cv = E.canvas();
  assert.ok(cv, 'اللوحة رُسمت');
  assert.equal(cv.__drawn, '«axStudcliSigYourName»', '«اسمك» بلغة الواجهة على اللوحة الفارغة');
});

test('cli-studios-5 «توقيعي» بالأرديّة RTL وبلا عربيّة، وبالعربيّة كما كانت، وتبديل اللغة يحدّث الزرّ', () => {
  const UR = { axStudcliSigTitle: 'میرا دستخط', axStudcliSigMenuTitle: 'میرا دستخط — اپنا دستخط بنائیں اور شیئر کریں' };
  const U = sigEnv('ur', (k) => UR[k] || k);
  U.ctx.window.Omran.signature.open();
  assert.equal(U.overlay().dir, 'rtl');
  assert.equal(U.btn().__label, 'میرا دستخط');
  // مفتاح بلا ترجمة (المترجم يرجع المفتاح): الاحتياط إنجليزيّ للأرديّة لا عربيّ
  for (const s of U.texts(U.overlay())) assert.ok(!/[ء-ي]{2,}/.test(s.replace(/میرا دستخط/g, '')) || /[ٹڈڑںھہےۓ]/.test(s), 'عربيّ للأرديّة: ' + s);
  assert.ok(U.texts(U.overlay()).includes('Type your name…') || U.texts(U.overlay()).some((s) => s === 'Type your name…'), 'احتياط إنجليزيّ');
  const A = sigEnv('ar', (k) => k);
  A.ctx.window.Omran.signature.open();
  assert.equal(A.overlay().dir, 'rtl');
  assert.equal(A.btn().__label, 'توقيعي');
  assert.ok(A.texts(A.overlay()).includes('اكتب اسمك…'));
  // تبديل اللغة يعيد كتابة الزرّ بالمترجم
  const L = sigEnv('ar', (k) => k);
  L.docEl.lang = 'fr';
  L.ctx.window.t = (k) => '«' + k + '»';
  L.fireLang();
  assert.equal(L.btn().__label, '«axStudcliSigTitle»');
});

/* ───────────────────────── x-runtime-ui-3: بطاقات «ابدأ من هنا» ───────────────────────── */

test('x-runtime-ui-3 بطاقات المقاولات تُعاد كتابتها من خيارات #constructionType عند كلّ تطبيق للغة', () => {
  const CX = read('js/app-15-cx-simple.js');
  const reg = [];
  const mk = (tag) => {
    let html = '';
    const el = {
      tagName: String(tag).toUpperCase(), id: '', style: { cssText: '' }, children: [], attrs: {}, textContent: '', className: '', parentElement: null,
      setAttribute(k, v) { el.attrs[k] = String(v); }, getAttribute(k) { return k in el.attrs ? el.attrs[k] : null; },
      appendChild(c) { el.children.push(c); c.parentElement = el; return c; },
      insertAdjacentElement(p, c) { return c; },
      addEventListener() {}, remove() {}, contains: () => true, scrollIntoView() {},
      querySelectorAll: (sel) => (sel === '.cx-sec' ? secs : []),
    };
    Object.defineProperty(el, 'innerHTML', { get() { return html; }, set(v) { html = String(v); const rx = /<(\w+)\b[^>]*\bid="([^"]+)"/g; let m; while ((m = rx.exec(html))) { const c = mk(m[1]); c.id = m[2]; } } });
    reg.push(el);
    return el;
  };
  const secs = [mk('div'), mk('div'), mk('div')];
  const modal = mk('div'); modal.id = 'constructionModal';
  const brief = mk('div'); brief.id = 'cxBrief';
  const opts = [['villa', '🏡 Residential villa'], ['rest', '🌴 Rest house'], ['annexhome', '🏠 Annex'], ['apartment', '🏢 Apartment building'], ['shop', '🏪 Shop'], ['mosque', '🕌 Mosque']].map(([value, text]) => ({ value, text }));
  const type = mk('select'); type.id = 'constructionType'; type.options = opts; type.selectedIndex = 0;
  const row = mk('div'); const cell = mk('div'); cell.parentElement = row;
  const fl = mk('input'); fl.id = 'constructionFloors'; fl.parentElement = cell;
  const ar = mk('input'); ar.id = 'constructionArea';
  let observer = null;
  const ctx = {
    console, lang: 'fr', localStorage: { getItem: () => null }, Event: function () {}, RegExp, Array, String,
    document: {
      readyState: 'complete',
      getElementById: (id) => { for (let i = reg.length - 1; i >= 0; i--) if (reg[i].id === id) return reg[i]; return null; },
      createElement: mk, querySelectorAll: () => [], documentElement: {}, addEventListener() {},
    },
    MutationObserver: class { constructor(f) { observer = f; } observe() {} },
    requestAnimationFrame: (f) => f(), setTimeout: () => 0,
  };
  vm.runInNewContext(CX, ctx);
  const cards = ctx.document.getElementById('cxStartCards');
  assert.ok(cards && cards.children.length === 6, 'ستّ بطاقات');
  const names = () => cards.children.map((b) => b.children[1].textContent);
  assert.equal(names()[0], 'Residential villa', 'لغة لحظة الإقلاع (الاحتياط الإنجليزيّ قبل ملفّ اللغة)');
  // وصل ملفّ اللغة الكسول: applyLanguage يترجم الخيارات ثمّ يكتب html.lang
  const FR = { villa: '🏡 Villa résidentielle', rest: '🌴 Maison de repos', annexhome: '🏠 Annexe', apartment: '🏢 Immeuble', shop: '🏪 Boutique', mosque: '🕌 Mosquée' };
  opts.forEach((o) => { o.text = FR[o.value]; });
  observer();
  assert.deepEqual(names(), ['Villa résidentielle', 'Maison de repos', 'Annexe', 'Immeuble', 'Boutique', 'Mosquée']);
  assert.equal(cards.children[0].children[0].textContent, '🏡', 'الإيموجي منفصل كما كان');
  // ثمّ تحويل إلى العربيّة
  opts[0].text = '🏡 فيلا سكنية';
  observer();
  assert.equal(names()[0], 'فيلا سكنية');
  assert.equal(cards.children.length, 6, 'لا بطاقات مكرّرة');
});
