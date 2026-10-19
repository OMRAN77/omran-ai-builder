'use strict';
/* v-bg3d-desktop — تدقيق ١٨ أكتوبر: على الكمبيوتر في الوضع الأسود اختيار أيّ خلفيّة ثلاثيّة الأبعاد لا يغيّر شيئًا والشاشة تبقى سوداء.
   #vantaBg (position:fixed; z-index:-1) طفل للجسم. على الجوّال الجسم position:fixed فهو سياق تكديس، والكانفس يُرسم فوق خلفيّته؛
   على الكمبيوتر الجسم شبكة ثابتة (static) فالكانفس في السياق الجذريّ تحت خلفيّة الجسم نفسها، ثمّ تحت #omFrameCenter
   (لوحة المحادثة: relative + isolation). body.vantaActive{background:transparent !important} في tokens.css كان آليّة الإظهار،
   فغلبته قاعدة الإطار الذهبيّ بأولويّة أعلى (#000 !important)، وطُليت اللوحة الوسطى أسود (إطارات.css ثمّ بلا-خطوط.css) بلا استثناء
   للثلاثيّة (الاستثناء موجود لـhtml.bgimg وحده).
   النطاق: الكمبيوتر في الأسود وحده. العاجيّ على الكمبيوتر قيد موثّق في v-bg-galaxy («لم يُلمس بلا طلب») فيبقى كما هو بإطاره الذهبيّ،
   والجوّال لم يُلمس.
   الاختبار يحسب التتالي فعلًا: يقرأ أوراق index.html بترتيبها، يأخذ كلّ قاعدة تضع خلفيّة على الجسم أو #omFrameCenter، يطابق
   محدِّداتها على شجرة html > body > main > #omFrameCenter بحالة معيّنة، ويختار الفائز بـ!important ثمّ الأولويّة ثمّ الترتيب. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const HTML = rd('index.html');

/* ── الأوراق بترتيب الصفحة: روابط css/ المحلّيّة و<style> المضمّنة (والمعلّق بـ<!-- --> خارجها) ── */
function sheets() {
  const html = HTML.replace(/<!--[\s\S]*?-->/g, (c) => ' '.repeat(c.length));
  const re = /<link rel="stylesheet" href="(css\/[^"?]+)[^"]*"|<style\b[^>]*>([\s\S]*?)<\/style>/g;
  const out = []; let m;
  while ((m = re.exec(html))) out.push({ name: m[1] || 'inline', css: m[1] ? rd(m[1]) : m[2] });
  return out;
}
/* ── القواعد مع سياق @media (و@supports يُعدّ صحيحًا؛ @keyframes/@font-face لا تحمل محدِّدات) ── */
function rulesOf(css, media, out, sheet) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i); if (open < 0) break;
    const prelude = css.slice(i, open).trim();
    let d = 1, j = open + 1;
    while (j < css.length && d) { if (css[j] === '{') d++; else if (css[j] === '}') d--; j++; }
    const body = css.slice(open + 1, j - 1);
    if (prelude.startsWith('@media')) rulesOf(body, media.concat(prelude.slice(6).trim()), out, sheet);
    else if (prelude.startsWith('@supports')) rulesOf(body, media, out, sheet);
    else if (!prelude.startsWith('@')) out.push({ sheet, media, sel: prelude, body, order: out.length });
    i = j;
  }
  return out;
}
const splitTop = (s, sep) => { const out = []; let d = 0, q = '', cur = ''; for (const ch of s) {
  if (q) { if (ch === q) q = ''; cur += ch; continue; }
  if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
  if (ch === '(' || ch === '[') d++; if (ch === ')' || ch === ']') d--;
  if (ch === sep && !d) { out.push(cur.trim()); cur = ''; } else cur += ch; }
  if (cur.trim()) out.push(cur.trim()); return out; };
function mediaOk(list, vw) {
  return list.every((q) => q.split(/\s*,\s*/).some((alt) => alt.split(/\s+and\s+/).every((f) => {
    f = f.trim(); if (!f || f === 'screen' || f === 'all') return true;
    const m = f.match(/^\((min|max)-width:\s*(\d+)px\)$/);
    if (m) return m[1] === 'min' ? vw >= +m[2] : vw <= +m[2];
    throw new Error('استعلام وسائط غير مُنمذَج حول خلفيّة الجسم/اللوحة: ' + f);
  })));
}
/* ── المحدِّد: مركّبات بينها مسافة أو > ── */
function complexParts(sel) {
  const parts = []; let cur = '', d = 0, pending = null, comb = null;
  for (const ch of sel) {
    if (ch === '(' || ch === '[') d++; else if (ch === ')' || ch === ']') d--;
    if (!d && /\s/.test(ch)) { if (cur) { parts.push({ c: cur, comb }); cur = ''; pending = ' '; } continue; }
    if (!d && '>+~'.includes(ch)) { if (cur) { parts.push({ c: cur, comb }); cur = ''; } pending = ch; continue; }
    if (!cur) { comb = pending; pending = null; }
    cur += ch;
  }
  if (cur) parts.push({ c: cur, comb });
  return parts;
}
function tokens(compound) {
  const out = []; let i = 0;
  const tag = compound.match(/^(\*|[a-zA-Z][\w-]*)/); if (tag) { out.push({ t: 'tag', v: tag[1] }); i = tag[1].length; }
  while (i < compound.length) {
    const rest = compound.slice(i); let m;
    if ((m = rest.match(/^#([^\s#.\[:()>]+)/))) out.push({ t: 'id', v: m[1] });
    else if ((m = rest.match(/^\.([^\s#.\[:()>]+)/))) out.push({ t: 'class', v: m[1] });
    else if ((m = rest.match(/^\[([\w-]+)(?:="([^"]*)")?\]/))) out.push({ t: 'attr', v: m[1], val: m[2] });
    else if ((m = rest.match(/^\[[^\]]*\]/))) out.push({ t: 'attr', v: '[other]', val: undefined }); /* [type=text] وأمثاله: لا يطابق عناصر الشجرة المصغّرة */
    else if ((m = rest.match(/^::([\w-]+)/))) out.push({ t: 'pe', v: m[1] });
    else if ((m = rest.match(/^:([\w-]+)\(/))) { let d = 1, j = m[0].length; while (d) { if (rest[j] === '(') d++; else if (rest[j] === ')') d--; j++; } out.push({ t: 'fn', v: m[1], arg: rest.slice(m[0].length, j - 1) }); m = [rest.slice(0, j)]; }
    else if ((m = rest.match(/^:([\w-]+)/))) out.push({ t: 'pc', v: m[1] });
    else throw new Error('محدِّد غير مفهوم: ' + compound);
    i += m[0].length;
  }
  return out;
}
const RESTING_FALSE = new Set(['hover', 'focus', 'focus-visible', 'focus-within', 'active', 'checked', 'disabled']);
function matchCompound(compound, el) {
  return tokens(compound).every((k) => {
    if (k.t === 'tag') return k.v === '*' || k.v === el.tag;
    if (k.t === 'id') return el.id === k.v;
    if (k.t === 'class') return el.cls.has(k.v);
    if (k.t === 'attr') return k.val === undefined ? k.v in el.attrs : el.attrs[k.v] === k.val;
    if (k.t === 'pe') return false; /* ::before/::after صندوق آخر */
    if (k.t === 'pc') { if (k.v === 'root') return el.tag === 'html'; if (RESTING_FALSE.has(k.v)) return false; throw new Error('شبه صنف غير مُنمذَج: ' + k.v); }
    if (k.v === 'not') return !splitTop(k.arg, ',').some((c) => matchCompound(c, el));
    if (k.v === 'is' || k.v === 'where') return splitTop(k.arg, ',').some((c) => matchCompound(c, el));
    if (k.v === 'has') return false; /* :has(…:hover) في القواعد الحاليّة — حالة السكون */
    throw new Error('دالّة غير مُنمذَجة: ' + k.v);
  });
}
function spec(compound) {
  const s = [0, 0, 0];
  for (const k of tokens(compound)) {
    if (k.t === 'id') s[0]++;
    else if (k.t === 'class' || k.t === 'attr' || k.t === 'pc') s[1]++;
    else if (k.t === 'tag' && k.v !== '*' || k.t === 'pe') s[2]++;
    else if (k.t === 'fn' && k.v !== 'where') { const best = splitTop(k.arg, ',').map(spec).sort(cmp).pop(); for (let x = 0; x < 3; x++) s[x] += best[x]; }
  }
  return s;
}
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const specComplex = (sel) => complexParts(sel).reduce((acc, p) => { const s = spec(p.c); return [acc[0] + s[0], acc[1] + s[1], acc[2] + s[2]]; }, [0, 0, 0]);
function matchComplex(parts, idx, chain, at) {
  if (at < 0 || !matchCompound(parts[idx].c, chain[at])) return false;
  if (idx === 0) return true;
  const comb = parts[idx].comb;
  if (comb === '>') return matchComplex(parts, idx - 1, chain, at - 1);
  if (comb === ' ') { for (let k = at - 1; k >= 0; k--) if (matchComplex(parts, idx - 1, chain, k)) return true; return false; }
  return false; /* + و~: لا أخوة في الشجرة المصغّرة */
}
const ALL = sheets().reduce((acc, s) => rulesOf(s.css, [], acc, s.name), []);
/* الفائز لخاصيّة الخلفيّة (background/background-color معًا) على عنصر الشجرة الأخير */
function winner(chain, vw) {
  let best = null;
  for (const r of ALL) {
    const decls = splitTop(r.body, ';').map((d) => d.match(/^(background|background-color)\s*:\s*([\s\S]*)$/)).filter(Boolean);
    if (!decls.length) continue;
    const hits = splitTop(r.sel, ',').filter((s) => { const p = complexParts(s); const last = p[p.length - 1].c;
      if (!(chain[chain.length - 1].id ? last.includes('#' + chain[chain.length - 1].id) : /^body(?![\w-])/.test(last))) return false; /* القواعد التي تستهدف هذا العنصر وحدها */
      return matchComplex(p, p.length - 1, chain, chain.length - 1); });
    if (!hits.length || !mediaOk(r.media, vw)) continue;
    const sp = hits.map(specComplex).sort(cmp).pop();
    for (const d of decls) {
      const important = /!important\s*$/.test(d[2]);
      const value = d[2].replace(/\s*!important\s*$/, '').trim();
      const cand = { important, sp, order: r.order, value, where: r.sheet + ' :: ' + r.sel.slice(0, 140) };
      if (!best || (cand.important !== best.important ? cand.important : (cmp(cand.sp, best.sp) || cand.order - best.order) >= 0)) best = cand;
    }
  }
  return best;
}
function state({ mode = 'dark', mobile = false, body = [], htmlCls = [] } = {}) {
  const html = { tag: 'html', id: '', cls: new Set(htmlCls.concat(mobile ? ['mobile-ui'] : [])), attrs: mode === 'light' ? { 'data-mode': 'light' } : {} };
  const b = { tag: 'body', id: '', cls: new Set(body), attrs: {} };
  const main = { tag: 'main', id: '', cls: new Set(), attrs: {} };
  const frame = { tag: 'div', id: 'omFrameCenter', cls: new Set(), attrs: { 'aria-hidden': 'true' } };
  const vw = mobile ? 390 : 1440;
  return { body: winner([html, b], vw), frame: winner([html, b, main, frame], vw) };
}
const GOLD_FRAME = /^var\(--om-glow\) padding-box, var\(--om-panel\) padding-box, var\(--om-gold-line\) border-box$/;

test('١. الآليّة كما هي: #vantaBg ثابت تحت كلّ شيء، وapplyBg3D يعلّم الجسم vantaActive، وtokens.css يجعله شفّافًا', () => {
  const tok = rd('css/tokens.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(tok, /#vantaBg\{position:fixed; inset:0; z-index:-1; pointer-events:none;\}/);
  assert.match(tok, /body\.vantaActive\{background:transparent !important;/);
  assert.match(rd('js/app-05-ui.js'), /document\.body\.classList\.toggle\('vantaActive', id !== 'none'\);/);
  assert.match(HTML, /<div id="vantaBg"><\/div>/);
  assert.match(HTML, /<main>\n  <div id="omFrameCenter" aria-hidden="true"><\/div>/, 'اللوحة الوسطى أوّل <main>');
});

test('٢. الكمبيوتر في الأسود بخلفيّة ثلاثيّة (الترحيب ووسط المحادثة): الجسم واللوحة الوسطى شفّافان', () => {
  for (const body of [['omranWelcome', 'vantaActive'], ['vantaActive']]) {
    const s = state({ mode: 'dark', body, htmlCls: ['cv-ok', 'has-user-av'] });
    assert.ok(s.body, 'قاعدة للجسم');
    assert.equal(s.body.value, 'transparent', body.join('.') + ' — الجسم يغطّي الكانفس: ' + s.body.where + ' ⇒ ' + s.body.value);
    assert.equal(s.frame.value, 'transparent', body.join('.') + ' — اللوحة الوسطى تغطّي الكانفس: ' + s.frame.where + ' ⇒ ' + s.frame.value);
  }
});

test('٣. بلا خلفيّة ثلاثيّة: تصميم الكمبيوتر كما هو (الأسود #000، والعاجيّ #f9f2e4 ولوحته بتوهّجها وإطارها الذهبيّ)', () => {
  const dark = state({ body: ['omranWelcome'] });
  assert.equal(dark.body.value, '#000'); assert.equal(dark.frame.value, '#000');
  const light = state({ mode: 'light', body: ['omranWelcome'] });
  assert.equal(light.body.value, '#f9f2e4');
  assert.match(light.frame.value, GOLD_FRAME);
});

test('٣ب. العاجيّ على الكمبيوتر لم يُلمس حتّى مع الخلفيّة الثلاثيّة (قيد v-bg-galaxy): الجسم #f9f2e4 واللوحة الوسطى بإطارها الذهبيّ', () => {
  for (const body of [['omranWelcome', 'vantaActive'], ['vantaActive']]) {
    const s = state({ mode: 'light', body, htmlCls: ['cv-ok', 'has-user-av'] });
    assert.equal(s.body.value, '#f9f2e4', body.join('.') + ' — ' + s.body.where);
    assert.match(s.frame.value, GOLD_FRAME, body.join('.') + ' — ' + s.frame.where);
  }
});

test('٤. الجوّال لم يُلمس: قواعده كما هي، والكانفس يظهر هناك لأنّ الجسم position:fixed (سياق تكديس يرسم الطفل z-index:-1 فوق خلفيّته)', () => {
  const m = state({ mobile: true, body: ['omranWelcome', 'vantaActive'] });
  assert.equal(m.body.value, '#000', 'خلفيّة جسم الجوّال كما كانت (إطارات-الجوال.css)');
  assert.match(m.body.where, /إطارات-الجوال\.css/);
  assert.match(rd('css/redesign.css'), /html\.mobile-ui body\{overscroll-behavior:none; position:fixed;/);
});

test('٥. الإصلاح في ملفّ الكمبيوتر وحده بوسم كاش مرفوع، للأسود وحده، واستثناء الخلفيّات (html.bgimg) كما هو', () => {
  const css = rd('css/إطارات.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const desk = css.slice(css.indexOf('@media (min-width:861px){'));
  const rules = [...desk.matchAll(/([^{}]*body\.vantaActive[^{}]*)\{/g)].map((m) => m[1].trim());
  assert.equal(rules.length, 2, 'قاعدتا الجسم واللوحة الوسطى داخل كتلة الكمبيوتر');
  for (const sel of rules) assert.match(sel, /^html:not\(\[data-mode="light"\]\):not\(\.mobile-ui\) body\.vantaActive/, 'للأسود على الكمبيوتر وحده: ' + sel);
  const mob = [...rd('css/إطارات-الجوال.css').replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]*body\.vantaActive[^{}]*)\{/g)].map((m) => m[1].trim());
  assert.ok(mob.every((sel) => /body\.vantaActive #omranBottomNav$/.test(sel)), 'على الجوال قاعدة الشريط السفليّ وحدها (v-bg3d-mobile-band): ' + mob.join(' | '));
  assert.match(css, /html\.bgimg:not\(\.mobile-ui\) #omFrameCenter\{ background:transparent; \}/);
  const v = HTML.match(/css\/إطارات\.css\?v=(\d+)/);
  assert.ok(v && Number(v[1]) >= 7, 'وسم إطارات.css مرفوع فوق 6');
});

/* ── v-bg3d-mobile-band (تدقيق ١٨–١٩ أكتوبر، لقطة ٠٦٩ «أمواج» على الجوّال، وأُعيد إنتاجه حيًّا على الإنتاج بالحساب التجريبيّ ١٩ أكتوبر):
   شريط بلون الجسم بارتفاع ٥١px أعلى الشاشة فوق خلفيّات WebGL وحدها (أمواج، ضباب، شبكة…؛ لا المجرّة/النجوم/المحيط ثنائيّة الأبعاد).
   الزناد: #omranBottomNav معتم تمامًا (#000 / #f9f2e4) بعرض الشاشة وارتفاعه ٥١px يحجب أسفل كانفس WebGL، والمركِّب يقصّ الجزء المحجوب
   من صورة WebGL المقلوبة رأسيًّا فيظهر القصّ أعلى الشاشة (الشريط يطول بطول الشريط السفليّ: +٣٠px ⇒ ٨١px؛ وإخفاؤه أو ألفا ٠٫٩٩ يمحوه —
   قِيس على إطارات Screencast، لا لقطة Playwright المقصوصة التي تخفيه). الإصلاح: مع الخلفيّة الثلاثيّة الشريط السفليّ بألفا ٠٫٩٩ — اللون نفسه بالعين. ── */
function navState({ mode = 'dark', body = [] } = {}) {
  const html = { tag: 'html', id: '', cls: new Set(['mobile-ui', 'omAndroid', 'cv-ok', 'has-user-av']), attrs: mode === 'light' ? { 'data-mode': 'light' } : {} };
  const b = { tag: 'body', id: '', cls: new Set(body), attrs: {} };
  const nav = { tag: 'nav', id: 'omranBottomNav', cls: new Set(), attrs: {} };
  return winner([html, b, nav], 390);
}
const alphaOf = (v) => { if (/^#[0-9a-f]{3,6}$/i.test(v)) return 1; const m = v.match(/^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)$/); if (m) return Number(m[1]); const r = v.match(/^rgb\(/); if (r) return 1; return NaN; };

test('٦. الجوّال بخلفيّة ثلاثيّة: الشريط السفليّ غير معتم تمامًا (ألفا ٠٫٩٩) في الأسود والعاجيّ — الترحيب ووسط المحادثة', () => {
  for (const [mode, rgb] of [['dark', '0,0,0'], ['light', '249,242,228']]) {
    for (const body of [['omranWelcome', 'vantaActive'], ['vantaActive']]) {
      const w = navState({ mode, body });
      assert.ok(w, mode + ': قاعدة للشريط');
      const a = alphaOf(w.value.replace(/\s+/g, ''));
      assert.ok(a < 1 && a >= 0.98, mode + ' ' + body.join('.') + ': الشريط معتم تمامًا فيقصّ المركِّب أعلى كانفس WebGL — ' + w.where + ' ⇒ ' + w.value);
      assert.equal(w.value.replace(/\s+/g, ''), 'rgba(' + rgb + ',.99)', mode + ': اللون نفسه بالعين');
      assert.match(w.where, /إطارات-الجوال\.css/);
    }
  }
});

test('٧. الجوّال بلا خلفيّة ثلاثيّة: الشريط السفليّ كما كان (#000 في الأسود، #f9f2e4 في العاجيّ)', () => {
  assert.equal(navState({ mode: 'dark', body: ['omranWelcome'] }).value, '#000');
  assert.equal(navState({ mode: 'light', body: ['omranWelcome'] }).value, '#f9f2e4');
  const v = HTML.match(/css\/إطارات-الجوال\.css\?v=(\d+)/);
  assert.ok(v && Number(v[1]) >= 2, 'وسم إطارات-الجوال.css مرفوع فوق 1');
});
