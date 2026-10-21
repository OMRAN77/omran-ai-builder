'use strict';
/* v-nav-cards-menus (تدقيق ١٨–١٩ أكتوبر، g02/g03/g06/g08/g11): بطاقات الأدوات والقوائم الصغيرة.
   (أ) اسم البطاقة فوق الصورة سطران لا سطر مقصوص («Construction &…»)، وشارة القبلة/الأسهم الحيّة في أعلى الصورة لا تحت الاسم.
   (ب) زرّ إعادة فتح القائمة بمفتاح ترجمة لا بنصّ عربيّ ثابت.
   (ج) قائمة ⋮ في شريط اللوحة على الجوّال العربيّ لا تخرج عن يسار الشاشة.
   (د) حروف الإطار الذهبيّة لا تنتثر على أزرار المعاينة/الكود.
   (هـ) مساعد المستندات باتّجاه لغة الواجهة، وخطأ «ارفع ملفًّا أو الصق نصًّا» يزول بالكتابة.
   (و) سهم الإرسال يشير لجهة القراءة في العربيّ، و⚠️ لا يركب أوّل حرف من «نقاط مهمة».
   (ز) ختم الإصدار التشخيصيّ في ورقة مشاركة الردّ للمالك وحده.
   (ح) ورقة الصورة لا تكتب «link unavailable · Failed to fetch» بالإنجليزيّ. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ── محرّك تتالٍ صغير: قواعد الملفّ بترتيبها (مع @media بالعرض)، مطابقة المحدِّد على مسار عناصر، والفائز بـ!important ثمّ الأولويّة ثمّ الترتيب ── */
function rulesOf(css, media, out) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i); if (open < 0) break;
    const prelude = css.slice(i, open).trim();
    let d = 1, j = open + 1;
    while (j < css.length && d) { if (css[j] === '{') d++; else if (css[j] === '}') d--; j++; }
    const body = css.slice(open + 1, j - 1);
    if (prelude.startsWith('@media')) rulesOf(body, media.concat(prelude.slice(6).trim()), out);
    else if (!prelude.startsWith('@')) out.push({ media, sel: prelude, body, order: out.length });
    i = j;
  }
  return out;
}
const splitTop = (s, sep) => { const out = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(' || ch === '[') d++; if (ch === ')' || ch === ']') d--; if (ch === sep && !d) { out.push(cur.trim()); cur = ''; } else cur += ch; } if (cur.trim()) out.push(cur.trim()); return out; };
function mediaOk(list, vw) {
  return list.every((q) => q.split(/\s*,\s*/).some((alt) => alt.split(/\s+and\s+/).every((f) => {
    f = f.trim(); const m = f.match(/^\((min|max)-width:\s*(\d+)px\)$/);
    if (m) return m[1] === 'min' ? vw >= +m[2] : vw <= +m[2];
    return false; // hover/reduced-motion… لا تخصّ هذه الخصائص
  })));
}
function compounds(sel) {
  const parts = []; let cur = '', d = 0, comb = ' ';
  for (const ch of sel) {
    if (ch === '(' || ch === '[') d++; else if (ch === ')' || ch === ']') d--;
    if (!d && (/\s/.test(ch) || ch === '>')) { if (cur) { parts.push({ c: cur, comb }); cur = ''; comb = ' '; } if (ch === '>') comb = '>'; continue; }
    cur += ch;
  }
  if (cur) parts.push({ c: cur, comb });
  return parts;
}
function simpleTokens(c) {
  const out = []; let i = 0; const tag = c.match(/^(\*|[a-zA-Z][\w-]*)/); if (tag) { out.push({ t: 'tag', v: tag[1] }); i = tag[1].length; }
  while (i < c.length) {
    const r = c.slice(i); let m;
    if ((m = r.match(/^#([\w-]+)/))) out.push({ t: 'id', v: m[1] });
    else if ((m = r.match(/^\.([\w-]+)/))) out.push({ t: 'class', v: m[1] });
    else if ((m = r.match(/^\[([\w-]+)(?:=["']?([^"'\]]*)["']?)?\]/))) out.push({ t: 'attr', v: m[1], val: m[2] });
    else if ((m = r.match(/^:not\(((?:[^()]|\([^()]*\))*)\)/))) out.push({ t: 'not', v: splitTop(m[1], ',') });
    else if ((m = r.match(/^:(?:is|where)\(((?:[^()]|\([^()]*\))*)\)/))) out.push({ t: 'is', v: splitTop(m[1], ','), zero: /^:where/.test(m[0]) });
    else if ((m = r.match(/^::?[\w-]+(\((?:[^()]|\([^()]*\))*\))?/))) out.push({ t: 'pseudo', v: m[0] });
    else throw new Error('محدِّد غير مُنمذَج: ' + c);
    i += m[0].length;
  }
  return out;
}
function matchCompound(c, el) {
  return simpleTokens(c).every((tk) => {
    if (tk.t === 'tag') return tk.v === '*' || tk.v === el.tag;
    if (tk.t === 'id') return el.id === tk.v;
    if (tk.t === 'class') return (el.cls || []).indexOf(tk.v) >= 0;
    if (tk.t === 'attr') { const a = (el.attrs || {})[tk.v]; return tk.val === undefined ? a !== undefined : a === tk.val; }
    if (tk.t === 'not') return tk.v.every((s) => !matchCompound(s, el));
    if (tk.t === 'is') return tk.v.some((s) => !/[\s>+~]/.test(s) && matchCompound(s, el));
    return false; // حالات (:hover…) وأشباه العناصر (::before) لا تخصّ العنصر في سكونه
  });
}
function matches(sel, chain) { // chain: من الجذر إلى العنصر
  const parts = compounds(sel);
  function rec(pi, ci) {
    if (!matchCompound(parts[pi].c, chain[ci])) return false;
    if (pi === 0) return true;
    if (parts[pi].comb === '>') return ci > 0 && rec(pi - 1, ci - 1);
    for (let k = ci - 1; k >= 0; k--) if (rec(pi - 1, k)) return true;
    return false;
  }
  return rec(parts.length - 1, chain.length - 1);
}
function spec(sel) {
  let a = 0, b = 0, c = 0;
  for (const p of compounds(sel)) for (const tk of simpleTokens(p.c)) {
    if (tk.t === 'id') a++; else if (tk.t === 'class' || tk.t === 'attr') b++; else if (tk.t === 'tag' && tk.v !== '*') c++;
    else if (tk.t === 'not' || (tk.t === 'is' && !tk.zero)) { const s = tk.v.map(spec).sort((x, y) => (x[0] - y[0]) || (x[1] - y[1]) || (x[2] - y[2])).pop(); a += s[0]; b += s[1]; c += s[2]; }
    else if (tk.t === 'pseudo' && !/^::/.test(tk.v)) b++;
  }
  return [a, b, c];
}
/* الإعلانات المطابقة لعنصر بترتيب التتالي (الأضعف أوّلًا) */
function cascade(css, chain, vw) {
  const decls = [];
  for (const r of rulesOf(css, [], [])) {
    if (!mediaOk(r.media, vw)) continue;
    for (const s of splitTop(r.sel, ',')) {
      if (!matches(s, chain)) continue;
      for (const d of r.body.split(';')) {
        const k = d.indexOf(':'); if (k < 0) continue;
        const prop = d.slice(0, k).trim().toLowerCase(); let val = d.slice(k + 1).trim();
        const imp = /!\s*important$/.test(val); val = val.replace(/!\s*important$/, '').trim();
        decls.push({ prop, val, imp, spec: spec(s), order: r.order, sel: s });
      }
    }
  }
  return decls.sort((x, y) => (x.imp - y.imp) || (x.spec[0] - y.spec[0]) || (x.spec[1] - y.spec[1]) || (x.spec[2] - y.spec[2]) || (x.order - y.order));
}
const winner = (decls, prop) => { const w = decls.filter((d) => d.prop === prop); return w.length ? w[w.length - 1].val : undefined; };

/* ───────── (أ) بطاقات الأدوات ───────── */
const TCI = read('css/tool-card-images.css');
function cardChain(lightMode, leaf) {
  const htmlAttrs = { dir: 'rtl', lang: 'ar' }; if (lightMode) htmlAttrs['data-mode'] = 'light';
  return [
    { tag: 'html', attrs: htmlAttrs, cls: [] }, { tag: 'body', cls: [] },
    { tag: 'div', id: 'sectionsToolsPopup', cls: [] }, { tag: 'div', cls: ['ptGrid', 'ptTrack'] },
    { tag: 'button', id: 'btnQibla', cls: ['btn', 'hasToolPhoto', 'tcTxt'] },
  ].concat(leaf);
}
test('أ-١. اسم البطاقة فوق الصورة يلتفّ سطرين في الأسود والفاتح، حاسوبًا وجوّالًا', () => {
  for (const light of [false, true]) for (const vw of [1280, 390]) {
    const d = cascade(TCI, cardChain(light, [{ tag: 'span', cls: ['tcMeta'] }, { tag: 'span', cls: ['tcTxt'] }, { tag: 'span', cls: ['btnLabel'] }]), vw);
    assert.equal(winner(d, '-webkit-line-clamp'), '2', (light ? 'فاتح' : 'أسود') + ' @' + vw);
  }
});
test('أ-٢. الشارة الحيّة (الفجر/الأسهم) في أعلى الصورة، لا في شريط الاسم السفليّ', () => {
  for (const light of [false, true]) for (const vw of [1280, 390]) {
    const d = cascade(TCI, cardChain(light, [{ tag: 'span', cls: ['tcMedia'] }, { tag: 'span', cls: ['tcLive'] }]), vw);
    assert.equal(winner(d, 'position'), 'absolute');
    assert.equal(winner(d, 'inset-block-start'), '8px', 'أعلى الصورة @' + vw);
    assert.equal(winner(d, 'inset-block-end'), 'auto', 'لا تُشدّ للأسفل @' + vw);
    assert.ok(Number(winner(d, 'z-index')) >= 1, 'فوق تدرّج الاسم');
  }
});

/* ───────── (ب) زرّ إعادة فتح القائمة ───────── */
test('ب. #sbReopen: الوصف بمفتاح sidePanelTitle (١٤ لغة) لا بنصّ عربيّ ثابت', () => {
  const src = read('js/app-10-features.js');
  const i = src.indexOf("__sbReopen.id = 'sbReopen'");
  assert.ok(i > 0);
  const block = src.slice(i, src.indexOf('document.body.appendChild(__sbReopen)', i));
  assert.doesNotMatch(block, /setAttribute\('aria-label',\s*'[؀-ۿ]/, 'aria-label عربيّ ثابت');
  assert.match(block, /setAttribute\('data-i18n', '\[aria-label\]sidePanelTitle'\)/);
  assert.match(block, /setAttribute\('data-i18n-title', 'sidePanelTitle'\)/);
  assert.match(block, /t\('sidePanelTitle'\)/);
  const en = read('js/app-03-i18n-data.js');
  assert.match(en, /sidePanelTitle: 'Side menu'/, 'المفتاح موجود بالإنجليزيّ');
  for (const f of fs.readdirSync(path.join(ROOT, 'i18n')).filter((x) => x !== 'ad-studio.js')) assert.match(read('i18n/' + f), /sidePanelTitle/, f);
});

/* ───────── (ج) قائمة ⋮ في شريط اللوحة ───────── */
function tabsMenu({ right, innerWidth, width }) {
  const src = read('js/app-10-features.js');
  const start = src.indexOf("(function(){\n  const btn = document.getElementById('btnTabsMenu');");
  assert.ok(start > 0, 'كتلة قائمة ⋮ موجودة');
  let d = 0, end = -1;
  for (let k = src.indexOf('{', start); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) { end = src.indexOf(';', k) + 1; break; } } }
  const set = (arr) => ({ add(c) { arr.add(c); }, remove(c) { arr.delete(c); }, contains(c) { return arr.has(c); } });
  const btn = { classList: set(new Set()), getBoundingClientRect: () => ({ right, left: right - 40, bottom: 100, top: 60 }) };
  const dd = { style: {}, offsetWidth: width, classList: set(new Set()), parentNode: null, addEventListener() {} };
  const wrap = { appendChild(x) { x.parentNode = wrap; } };
  const document = {
    getElementById: (id) => ({ btnTabsMenu: btn, tabsMenuDropdown: dd, tabDownloadWrap: wrap }[id] || null),
    documentElement: { classList: { contains: (c) => c === 'mobile-ui' } },
    body: { appendChild(x) { x.parentNode = document.body; } },
    addEventListener() {},
  };
  const ctx = { document, window: { innerWidth }, setTimeout: () => 0 };
  vm.createContext(ctx);
  vm.runInContext(src.slice(start, end), ctx);
  btn.onclick({ stopPropagation() {} });
  assert.ok(dd.classList.contains('show'));
  const left = dd.style.left && dd.style.left !== 'auto' ? parseFloat(dd.style.left) : innerWidth - parseFloat(dd.style.right) - width;
  return { left, right: left + width, dd };
}
/* ───────── (د) حروف الإطار الذهبيّة ───────── */
/* ───────── (هـ) مساعد المستندات ───────── */
function docs(lang) {
  const els = {};
  function el(id) {
    if (els[id]) return els[id];
    const e = { id, style: {}, innerHTML: '', textContent: '', value: '', dir: id.endsWith('Modal') ? 'rtl' : '', listeners: {},
      classList: { s: new Set(), add(c) { this.s.add(c); }, remove(c) { this.s.delete(c); }, contains(c) { return this.s.has(c); } },
      addEventListener(t, fn) { (e.listeners[t] = e.listeners[t] || []).push(fn); },
      dispatch(t) { (e.listeners[t] || []).forEach((fn) => fn({ type: t, target: e })); if (typeof e['on' + t] === 'function') e['on' + t]({ type: t, target: e }); },
      querySelectorAll: () => [], click() { e.dispatch('click'); } };
    els[id] = e; return e;
  }
  const document = { getElementById: el, documentElement: { lang } };
  const ctx = { document, window: {}, lang, localStorage: { getItem: () => lang }, fetch: async () => ({ ok: false, json: async () => ({}) }), setTimeout: () => 0, __swallow: () => {} };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('js/ui-docs.js'), ctx);
  return { el, ctx };
}
test('هـ-١. مساعد المستندات باتّجاه لغة الواجهة: الإنجليزيّ LTR، والعربيّ والأردو RTL', () => {
  for (const [lng, dir] of [['en', 'ltr'], ['fr', 'ltr'], ['ar', 'rtl'], ['ur', 'rtl']]) {
    const d = docs(lng);
    d.el('btnDocs').click();
    assert.ok(d.el('docModal').classList.contains('open'));
    assert.equal(d.el('docModal').dir, dir, lng);
  }
});
/* ───────── (و) سهم الإرسال و⚠️ ───────── */
const MOD = read('css/modules.css');
function xmChain(htmlDir, modalDir, leaf) {
  return [{ tag: 'html', attrs: { dir: htmlDir }, cls: [] }, { tag: 'body', cls: [] },
    { tag: 'div', id: 'docModal', cls: ['xm', 'open'], attrs: { dir: modalDir } }, { tag: 'div', cls: ['xmWrap'] }, { tag: 'div', cls: ['xmBody'] }].concat(leaf);
}
function inlineStartPadding(decls, dir) {
  const side = { top: 0, right: 0, bottom: 0, left: 0 };
  const px = (v) => parseFloat(v) || 0;
  for (const d of decls) {
    const v = d.val.split(/\s+/);
    if (d.prop === 'padding') { const [t, r = t, b = t, l = r] = v; Object.assign(side, { top: px(t), right: px(r), bottom: px(b), left: px(l) }); }
    else if (d.prop === 'padding-left') side.left = px(v[0]);
    else if (d.prop === 'padding-right') side.right = px(v[0]);
    else if (d.prop === 'padding-inline') { const s = px(v[0]), e = px(v[1] || v[0]); if (dir === 'rtl') { side.right = s; side.left = e; } else { side.left = s; side.right = e; } }
    else if (d.prop === 'padding-inline-start') side[dir === 'rtl' ? 'right' : 'left'] = px(v[0]);
  }
  return side[dir === 'rtl' ? 'right' : 'left'];
}
/* ───────── (ز) ختم الإصدار في ورقة مشاركة الردّ ───────── */
function shareSheet(owner) {
  const made = [];
  const mk = (tag) => { const e = { tag, style: {}, children: [], textContent: '', innerHTML: '', appendChild(c) { this.children.push(c); return c; }, remove() {}, setAttribute() {} }; made.push(e); return e; };
  const fakeSrc = ['/js/app.bundle.js', 'v=e77f4e30abcd'].join('?'); // سكربت وهميّ للختم، لا تثبيت لوسم حقيقيّ (arch-ratchet)
  const document = { createElement: mk, getElementById: () => null, querySelector: () => ({ getAttribute: () => fakeSrc }), head: { appendChild() {} }, body: { appendChild() {} }, documentElement: { lang: 'ar' } };
  const ctx = { document, navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0)' }, omranOwnerUi: () => owner, setTimeout: () => 0, encodeURIComponent, String };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('js/app-05-share-text.js'), ctx);
  assert.equal(ctx.omranShareText('ردّ للمشاركة'), true);
  return made.map((e) => String(e.textContent || ''));
}
test('ز. ختم «v … · share:no» للمالك وحده', () => {
  assert.ok(!shareSheet(false).some((s) => /^v /.test(s)), 'ظاهر لمستخدم عاديّ');
  assert.ok(shareSheet(true).some((s) => /^v e77f4e30 · share:no$/.test(s)), 'المالك يراه للتشخيص');
});

/* ───────── (ح) ورقة الصورة عند تعذّر الرابط ───────── */
test('ح. تعذّر الرفع: الورقة بتحميل وفتح، بلا «link unavailable» ولا نصّ الخطأ التقنيّ', async () => {
  const made = []; const warns = [];
  const el = (tag) => { const e = { tag, dataset: {}, style: {}, children: [], attrs: {}, href: '', textContent: '', appendChild(c) { this.children.push(c); return c; }, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; }, remove() {}, click() {} }; made.push(e); return e; };
  const ctx = {
    location: { origin: 'https://app.example' },
    navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Version/4.0 Chrome/124.0 Mobile' },
    document: { createElement: el, getElementById: () => null, querySelector: () => null, addEventListener() {}, body: { appendChild() {} } },
    FileReader: function () { this.readAsDataURL = (b) => { b.arrayBuffer().then((ab) => { this.result = 'data:' + b.type + ';base64,' + Buffer.from(ab).toString('base64'); this.onload(); }); }; },
    fetch: async () => { throw new TypeError('Failed to fetch'); },
    authGet: () => 'tok', localStorage: { getItem: () => 'ar' },
    Blob, File, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} }, atob, encodeURIComponent, setTimeout: () => 0, String, Number, Math, Date, Error, JSON, Uint8Array, Promise,
    console: { warn: (...a) => warns.push(a.join(' ')), error() {}, log() {} },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('js/app-05-img-save.js'), ctx);
  assert.equal(await ctx.omranSaveImage(new Blob([Buffer.from('png')], { type: 'image/png' }), 'x.png', 'share'), true);
  const text = made.map((e) => String(e.textContent || '')).join(' | ');
  assert.ok(made.some((e) => e.attrs.download === 'x.png'), 'زرّ التحميل المحلّيّ باقٍ');
  assert.doesNotMatch(text, /link unavailable/);
  assert.doesNotMatch(text, /Failed to fetch/);
  assert.ok(warns.some((w) => /Failed to fetch/.test(w)), 'السبب في السجلّ للتشخيص');
});
