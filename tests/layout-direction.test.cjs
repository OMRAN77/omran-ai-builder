'use strict';
/* v-layout-direction — تدقيق ١٨–١٩ أكتوبر (حزمة b4): قواعد CSS فيزيائيّة أو ناقصة تظهر عيوبًا في الاتّجاه والتخطيط:
   ظلّ الدرج المغلق على طرف الجوّال الفاتح، سهم الدرج داخل حرف O بالإنجليزيّ، سهم الطيّ لا ينعكس بالإنجليزيّ، عناوين المحادثات
   المكتوبة بلغة غير لغة الواجهة ينقصّ أوّلها، قائمة + بخطّين وبنود تلتفّ، نقطة «شغّال» داخل العنوان المقصوص، فراغ بجانب بطاقة
   القبلة، المحادثة تنزاح ٤٠px على الجوّال، أدوات الصندوق ٢٤px بفراغ ١px، العربيّ في محرّر الكود حروف متفرّقة، خانات الوصف بخطّ
   monospace، «اختيار الملف» مقصوصة على لوحة الستايل، والشعار يقفز ١٨px مع شريط الأسهم.
   الاختبار يحسب التتالي فعلًا (محرّك black-surfaces/bg3d-desktop، وموسَّع باستعلامات الحاوية واختصارَي margin وfont): أوراق index.html
   بترتيبها مع <style> الأجزاء، والأنماط المضمّنة، والفائز بـ!important ثمّ المضمّن ثمّ الأولويّة ثمّ الترتيب. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const HTML = rd('index.html');

function sheets() {
  const html = HTML.replace(/<!--[\s\S]*?-->/g, (c) => ' '.repeat(c.length));
  const re = /<link rel="stylesheet" href="(css\/[^"?]+)[^"]*"|<style\b[^>]*>([\s\S]*?)<\/style>|<script\b[^>]*src="\/(js\/partials-[\w-]+\.js)[^"]*"/g;
  const out = []; let m;
  while ((m = re.exec(html))) {
    if (m[1]) out.push({ name: m[1], css: rd(m[1]) });
    else if (m[3]) { const src = rd(m[3]); let s; const sr = /<style\b[^>]*>([\s\S]*?)<\/style>/g; while ((s = sr.exec(src))) out.push({ name: m[3], css: s[1] }); }
    else out.push({ name: 'inline', css: m[2] });
  }
  return out;
}
/* القواعد مع سياق @media و@container (الثاني يُحفظ بعلامة «container:» ويُقيَّم بعرض الحاوية ctx.cw) */
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
    else if (prelude.startsWith('@container')) rulesOf(body, media.concat('container:' + prelude.slice(10).trim()), out, sheet);
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
function mediaOk(list, ctx) {
  return list.every((q) => {
    if (q.startsWith('container:')) {
      const m = q.slice(10).match(/^\((min|max)-width:\s*(\d+(?:\.\d+)?)px\)$/);
      if (!m || ctx.cw == null) return false;
      return m[1] === 'min' ? ctx.cw >= +m[2] : ctx.cw <= +m[2];
    }
    return q.split(/\s*,\s*/).some((alt) => alt.replace(/^only\s+/, '').split(/\s+and\s+/).every((f) => {
      f = f.trim(); if (!f || f === 'screen' || f === 'all') return true;
      let m = f.match(/^\((min|max)-width:\s*(\d+(?:\.\d+)?)px\)$/);
      if (m) return m[1] === 'min' ? ctx.vw >= +m[2] : ctx.vw <= +m[2];
      m = f.match(/^\((hover|any-hover):\s*(none|hover)\)$/); if (m) return (m[2] === 'none') === ctx.mobile;
      m = f.match(/^\((pointer|any-pointer):\s*(coarse|fine)\)$/); if (m) return (m[2] === 'coarse') === ctx.mobile;
      return false;
    }));
  });
}
function complexParts(sel) {
  const parts = []; let cur = '', d = 0, pending = null, comb = null, q = '';
  for (const ch of sel) {
    if (q) { if (ch === q) q = ''; cur += ch; continue; }
    if (d && (ch === '"' || ch === "'")) { q = ch; cur += ch; continue; }
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
  const tag = compound.match(/^(\*|[a-zA-Z][\w-]*)/); if (tag) { out.push({ t: 'tag', v: tag[1].toLowerCase() }); i = tag[1].length; }
  while (i < compound.length) {
    const rest = compound.slice(i); let m;
    if ((m = rest.match(/^#([\w-]+)/))) out.push({ t: 'id', v: m[1] });
    else if ((m = rest.match(/^\.([\w-]+)/))) out.push({ t: 'class', v: m[1] });
    else if ((m = rest.match(/^\[\s*([\w-]+)\s*(?:([*^$~|]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]*))\s*(i)?\s*)?\]/))) out.push({ t: 'attr', v: m[1], op: m[2], val: m[3] != null ? m[3] : (m[4] != null ? m[4] : m[5]) });
    else if ((m = rest.match(/^::([\w-]+)/))) out.push({ t: 'pe', v: m[1] });
    else if ((m = rest.match(/^:([\w-]+)\(/))) { let d = 1, j = m[0].length; while (d && j < rest.length) { if (rest[j] === '(') d++; else if (rest[j] === ')') d--; j++; } out.push({ t: 'fn', v: m[1], arg: rest.slice(m[0].length, j - 1) }); m = [rest.slice(0, j)]; }
    else if ((m = rest.match(/^:([\w-]+)/))) out.push({ t: m[1] === 'before' || m[1] === 'after' ? 'pe' : 'pc', v: m[1] });
    else return null;
    i += m[0].length;
  }
  return out;
}
function attrOk(k, el) {
  const v = el.attrs[k.v];
  if (!k.op) return v != null;
  if (v == null) return false;
  const want = k.val;
  if (k.op === '=') return v === want;
  if (k.op === '*=') return v.includes(want);
  if (k.op === '^=') return v.startsWith(want);
  if (k.op === '$=') return v.endsWith(want);
  if (k.op === '~=') return v.split(/\s+/).includes(want);
  if (k.op === '|=') return v === want || v.startsWith(want + '-');
  return false;
}
function matchCompound(compound, el, pe) {
  const ks = tokens(compound); if (!ks) return false;
  const wantPe = ks.find((k) => k.t === 'pe');
  if ((wantPe ? wantPe.v : null) !== (pe || null)) return false;
  return ks.every((k) => {
    if (k.t === 'tag') return k.v === '*' || k.v === el.tag;
    if (k.t === 'id') return el.id === k.v;
    if (k.t === 'class') return el.cls.has(k.v);
    if (k.t === 'attr') return attrOk(k, el);
    if (k.t === 'pe') return true;
    if (k.t === 'pc') return k.v === 'root' ? el.tag === 'html' : false;
    if (k.v === 'not') return !splitTop(k.arg, ',').some((c) => matchCompound(c, el, null));
    if (k.v === 'is' || k.v === 'where') return splitTop(k.arg, ',').some((c) => matchCompound(c, el, null));
    return false; /* :has و:nth-child… — حالة لا تُنمذَج هنا */
  });
}
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
function spec(compound) {
  const s = [0, 0, 0];
  for (const k of tokens(compound) || []) {
    if (k.t === 'id') s[0]++;
    else if (k.t === 'class' || k.t === 'attr' || k.t === 'pc') s[1]++;
    else if ((k.t === 'tag' && k.v !== '*') || k.t === 'pe') s[2]++;
    else if (k.t === 'fn' && k.v !== 'where') {
      if (k.v === 'not' || k.v === 'is' || k.v === 'has') { const best = splitTop(k.arg, ',').map(spec).sort(cmp).pop() || [0, 0, 0]; for (let x = 0; x < 3; x++) s[x] += best[x]; }
      else s[1]++;
    }
  }
  return s;
}
const specComplex = (sel) => complexParts(sel).reduce((acc, p) => { const s = spec(p.c); return [acc[0] + s[0], acc[1] + s[1], acc[2] + s[2]]; }, [0, 0, 0]);
function matchComplex(parts, idx, chain, at, pe) {
  if (at < 0 || !matchCompound(parts[idx].c, chain[at], idx === parts.length - 1 ? pe : null)) return false;
  if (idx === 0) return true;
  const comb = parts[idx].comb;
  if (comb === '>') return matchComplex(parts, idx - 1, chain, at - 1, pe);
  if (comb === ' ') { for (let k = at - 1; k >= 0; k--) if (matchComplex(parts, idx - 1, chain, k, pe)) return true; return false; }
  return false;
}
const ALL = sheets().reduce((acc, s) => rulesOf(s.css, [], acc, s.name), []);
/* الخاصيّة المطلوبة ومن أين تُقرأ: الاختصار margin يعطي margin-top أوّل قيمه، والاختصار font يعطي العائلة (أو inherit) */
const FROM = {
  'margin-top': { margin: (v) => v.split(/\s+/)[0], 'margin-top': (v) => v },
  'font-family': { 'font-family': (v) => v, font: (v) => (/^(inherit|initial|unset)$/.test(v) ? v : ((v.match(/(?:^|\s)[\d.]+(?:px|em|rem|%)(?:\/[\d.]+\w*)?\s+(.+)$/) || [])[1] || null)) },
};
const declsOf = (body) => splitTop(body, ';').map((d) => d.match(/^([\w-]+)\s*:\s*([\s\S]*)$/)).filter(Boolean)
  .map((d) => ({ prop: d[1].toLowerCase(), important: /!\s*important\s*$/.test(d[2]), value: d[2].replace(/\s*!\s*important\s*$/, '').trim() }));
function winner(chain, prop, ctx, pe) {
  const from = FROM[prop] || { [prop]: (v) => v };
  const el = chain[chain.length - 1];
  let best = null;
  const consider = (cand) => {
    if (cand.value == null) return;
    if (!best) { best = cand; return; }
    if (cand.important !== best.important) { if (cand.important) best = cand; return; }
    if (cand.inline !== best.inline) { if (cand.important ? !cand.inline : cand.inline) best = cand; return; }
    if ((cmp(cand.sp, best.sp) || cand.order - best.order) >= 0) best = cand;
  };
  for (const r of ALL) {
    const decls = declsOf(r.body).filter((d) => from[d.prop]);
    if (!decls.length || !mediaOk(r.media, ctx)) continue;
    const hits = splitTop(r.sel, ',').filter((s) => { const p = complexParts(s); return matchComplex(p, p.length - 1, chain, chain.length - 1, pe); });
    if (!hits.length) continue;
    const sp = hits.map(specComplex).sort(cmp).pop();
    for (const d of decls) consider({ important: d.important, inline: false, sp, order: r.order, value: from[d.prop](d.value), where: r.sheet + ' :: ' + r.sel.slice(0, 160) });
  }
  if (!pe && el.style) for (const d of declsOf(el.style).filter((x) => from[x.prop])) consider({ important: d.important, inline: true, sp: [9, 9, 9], order: 1e9, value: from[d.prop](d.value), where: 'inline style' });
  return best;
}
function E(desc, style) {
  const m = desc.match(/^([a-z]+)/); const el = { tag: m ? m[1] : 'div', id: '', cls: new Set(), attrs: {}, style: style || '' };
  let rest = desc.slice(m ? m[1].length : 0), x;
  while (rest) {
    if ((x = rest.match(/^#([\w-]+)/))) el.id = x[1];
    else if ((x = rest.match(/^\.([\w-]+)/))) el.cls.add(x[1]);
    else if ((x = rest.match(/^\[([\w-]+)(?:="([^"]*)")?\]/))) el.attrs[x[1]] = x[2] == null ? '' : x[2];
    else throw new Error('وصف غير مفهوم: ' + rest);
    rest = rest.slice(x[0].length);
  }
  if (el.id) el.attrs.id = el.id;
  if (el.style) el.attrs.style = el.style;
  return el;
}
/* o: { mode: dark|light|skin, mobile, dir: rtl|ltr, vw, cw, pe, body: [أصناف الجسم] } */
function W(descs, prop, o) {
  o = o || {};
  const mobile = !!o.mobile;
  const cls = ['cv-ok', 'has-user-av'].concat(mobile ? ['mobile-ui'] : [], o.mode === 'skin' ? ['skin'] : []);
  const attrs = { dir: o.dir || 'rtl', lang: (o.dir || 'rtl') === 'rtl' ? 'ar' : 'en' };
  if (o.mode === 'light') attrs['data-mode'] = 'light';
  const html = { tag: 'html', id: '', cls: new Set(cls), attrs, style: '' };
  const body = E('body' + (o.body || []).map((c) => '.' + c).join(''));
  const chain = [html, body].concat(descs.map((d) => (Array.isArray(d) ? E(d[0], d[1]) : E(d))));
  return winner(chain, prop, { vw: o.vw || (mobile ? 400 : 1280), mobile, cw: o.cw }, o.pe);
}
const val = (w) => (w ? w.value.replace(/\s+/g, ' ') : '(none)');
const px = (w) => { const m = /^(-?[\d.]+)px$/.exec(val(w)); return m ? Number(m[1]) : NaN; };
const bare = (p) => rd(p).replace(/\/\*[\s\S]*?\*\//g, '');

/* ── ١) ظلّ الدرج المغلق ── */
test('١. الدرج المغلق بلا ظلّ على الجوّال (الفاتح والأسود، ودرج القائمة والملفّات)، والمفتوح بظلّه كما كان', () => {
  for (const mode of ['light', 'dark']) {
    for (const id of ['sidebar', 'workarea']) {
      for (const dir of ['rtl', 'ltr']) {
        const closed = W(['main', 'div#' + id], 'box-shadow', { mode, mobile: true, dir });
        assert.equal(val(closed), 'none', mode + ' ' + dir + ' #' + id + ' مغلق — ظلّه يبين على طرف الشاشة: ' + (closed && closed.where) + ' ⇒ ' + val(closed));
        assert.equal(val(W(['main', 'div#' + id + '.open'], 'box-shadow', { mode, mobile: true, dir })), 'var(--sh-4)', 'المفتوح بظلّه');
      }
    }
  }
  /* المتصفّح الضيّق بلا صنف الجوّال (@media max-width:860px) — المسار نفسه */
  assert.equal(val(W(['main', 'div#sidebar'], 'box-shadow', { mode: 'light', vw: 800 })), 'none');
  assert.equal(val(W(['main', 'div#sidebar.open'], 'box-shadow', { mode: 'light', vw: 800 })), '0 10px 50px rgba(0,0,0,.55)');
  /* الثيمات كما كانت */
  assert.equal(val(W(['main', 'div#sidebar'], 'box-shadow', { mode: 'skin', mobile: true })), 'none');
});

/* ── ٢) سهم الدرج على الجوّال وسهم الطيّ على الحاسوب ── */
test('٢. سهم الدرج بالإنجليزيّ في الطرف الداخليّ (يمين) ومنعكس، والعربيّ كما قرّره المالك (يسار بلا انعكاس)', () => {
  const btn = ['main', 'div#sidebar.open', 'button#sidebarCloseBtn'];
  const svg = btn.concat(['svg']);
  assert.equal(val(W(btn, 'right', { mobile: true, dir: 'ltr' })), '8px', 'LTR: الطرف الداخليّ للدرج الأيسر');
  assert.equal(val(W(btn, 'left', { mobile: true, dir: 'ltr' })), 'auto', 'LTR: لا يبقى فوق حرف O في الشعار');
  assert.equal(val(W(svg, 'transform', { mobile: true, dir: 'ltr' })), 'scaleX(-1)', 'LTR: السهم يشير إلى جهة خروج الدرج (اليسار)');
  assert.equal(val(W(btn, 'left', { mobile: true, dir: 'rtl' })), '8px', 'RTL: يسار كما طلب المالك');
  assert.equal(val(W(btn, 'right', { mobile: true, dir: 'rtl' })), 'auto');
  assert.equal(W(svg, 'transform', { mobile: true, dir: 'rtl' }), null, 'RTL: بلا انعكاس');
});

test('٣. سهم طيّ القائمة على الحاسوب ينعكس بالإنجليزيّ (القائمة يسارًا) ولا ينعكس بالعربيّ', () => {
  const svg = ['main', 'div#sidebar', 'button#sidebarCloseBtn', 'svg'];
  assert.equal(val(W(svg, 'transform', { dir: 'ltr' })), 'scaleX(-1)');
  assert.equal(val(W(svg, 'transform', { dir: 'ltr', vw: 800 })), 'scaleX(-1)', 'الحاسوب الضيّق (درج) أيضًا');
  assert.equal(W(svg, 'transform', { dir: 'rtl' }), null);
});

/* ── ٣) عناوين المحادثات ونقطة «شغّال» ── */
test('٤. عنوان المحادثة باتّجاه محتواه (unicode-bidi:plaintext) ومحاذاته بجهة الصفحة، فيبدأ من أوّله وتقع النقاط في آخره', () => {
  const t = ['main', 'div#sidebar', 'div#history', 'div.hist-item', 'span.hist-title'];
  for (const dir of ['rtl', 'ltr']) {
    for (const mobile of [false, true]) {
      assert.equal(val(W(t, 'unicode-bidi', { dir, mobile })), 'plaintext', dir + (mobile ? ' جوّال' : ' حاسوب'));
      assert.equal(val(W(t, 'text-align', { dir, mobile })), dir === 'rtl' ? 'right' : 'left', 'المحاذاة تتبع الصفحة لا العنوان');
      assert.equal(val(W(t, 'text-overflow', { dir, mobile })), 'ellipsis');
    }
  }
});

test('٥. نقطة «شغّال» عنصر مستقلّ في صفّ المحادثة (لا داخل العنوان المقصوص) وقبل زرّ ⋮', () => {
  const css = bare('css/tokens.css');
  assert.doesNotMatch(css, /omRunning\s*\.hist-title::after/, 'لا نقطة داخل العنوان (overflow:hidden يقصّها)');
  const row = ['main', 'div#sidebar', 'div#history', 'div.hist-item.omRunning'];
  for (const dir of ['rtl', 'ltr']) {
    assert.equal(val(W(row, 'content', { dir, pe: 'after' })), '""', dir);
    assert.equal(val(W(row, 'flex', { dir, pe: 'after' })), 'none', 'لا تنضغط');
    const dot = Number(val(W(row, 'order', { dir, pe: 'after' })));
    const menu = Number(val(W(row.concat(['button.hist-menu-btn']), 'order', { dir })));
    assert.ok(dot > 0 && menu > dot, 'بعد العنوان وقبل ⋮: dot=' + dot + ' menu=' + menu);
    assert.equal(val(W(row, 'width', { dir, pe: 'after' })), '7px');
    assert.equal(W(['main', 'div#sidebar', 'div#history', 'div.hist-item'], 'content', { dir, pe: 'after' }), null, 'بلا نقطة حين لا يعمل طلب');
  }
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\{ \.hist-item\.omRunning::after\{animation:none;\} \}/);
});

/* ── ٤) قائمة + ── */
test('٦. قائمة +: عرضها بعرض أطول بند (بلا التفاف) وسقفها الشاشة، وكلّ البنود بخطّ الصفحة ومن بداية السطر', () => {
  const pop = ['main', 'div#chatcol', 'div#inputbar', 'div.inputbar-tools.inputbar-tools-below', 'div.inputbar-tools-left', 'div#plusToolsWrap', 'div#plusToolsPopup.show'];
  for (const o of [{ dir: 'ltr' }, { dir: 'rtl' }, { dir: 'ltr', mobile: true }]) {
    assert.equal(val(W(pop, 'width', o)), 'max-content', JSON.stringify(o) + ' — العرض كان min-width:170px فيلتفّ البند الطويل');
    assert.equal(val(W(pop, 'max-width', o)), 'calc(100vw - 24px)');
    for (const b of ['button.btn#btnVideoEdit[type="button"]', 'button.btn#btnAttach[type="button"]', 'button.btn.omModeItem[type="button"][data-mode="image"]']) {
      const ff = W(pop.concat([b]), 'font-family', o);
      assert.equal(val(ff), 'inherit', b + ' — خطّ المتصفّح (Arial) بدل خطّ الصفحة: ' + (ff && ff.where));
      assert.equal(val(W(pop.concat([b]), 'text-align', o)), 'start', b + ' — الالتفاف كان يتوسّط');
    }
  }
});

/* ── ٥) بطاقات هواوي ── */
test('٧. بطاقات الرئيسيّة: البطاقة الأخيرة الفرديّة الظاهرة تمتدّ وتتوسّط (بعد إخفاء «اقتراحات»)، والعمود الواحد ≤340 كما هو', () => {
  const css = bare('css/redesign.css');
  const blocks = [...css.matchAll(/@media \(min-width:341px\)\{([\s\S]*?)\n\}/g)].map((m) => m[1]);
  const all = blocks.join('\n');
  assert.match(all, /\.huawei-tools-grid > \.hwToolCard:last-child:nth-child\(odd\)\{[^}]*grid-column:1 \/ -1;[^}]*justify-self:center;/, 'الأخيرة الفرديّة');
  /* :has في قاعدة منفصلة: المتصفّح الذي لا يعرفه يُسقط قاعدته وحدها وتبقى الأولى */
  const hasRule = all.match(/([^{}]*:has\([^{}]*)\{([^}]*)\}/);
  assert.ok(hasRule, 'قاعدة البطاقة الظاهرة الأخيرة قبل بطاقة مخفيّة');
  assert.match(hasRule[1].trim(), /^\.huawei-tools-grid > \.hwToolCard:nth-last-child\(2\):nth-child\(odd\):has\(\+ \.hwToolCard\[hidden\]\)$/);
  assert.doesNotMatch(hasRule[1], /,/, 'منفصلة لا ضمن قائمة محدِّدات');
  assert.match(hasRule[2], /grid-column:1 \/ -1;[^}]*justify-self:center;/);
  /* عرض البطاقة = عرض عمود واحد بحسب الفراغ (12px فوق 480، و8px حتّى 480) */
  assert.match(all, /width:calc\(50% - 6px\)/);
  assert.match(css, /@media \(min-width:341px\) and \(max-width:480px\)\{[^}]*\{[^}]*width:calc\(50% - 4px\)/);
  assert.match(css, /@media \(max-width:340px\)\{\n  \.huawei-tools-grid\{grid-template-columns:1fr; gap:8px;\}\n\}/, 'العمود الواحد كما هو');
  /* البطاقة المخفيّة تُعلَّم hidden فعلًا (app-05-ui) — شرط قاعدة :has */
  assert.match(rd('js/app-05-ui.js'), /__hwSug\.hidden = true;/);
});

/* ── ٦) انزياح المحادثة ── */
test('٨. #chatcol على الجوّال overflow:clip (ليس حاوية تمرير فلا يُزاح ٤٠px)، مع hidden احتياطًا، وحيلة إخفاء الشريط على #messages كما هي', () => {
  const col = ['main', 'div#chatcol'];
  const msgs = col.concat(['div#messages']);
  for (const dir of ['rtl', 'ltr']) {
    const w = W(col, 'overflow', { mobile: true, dir });
    assert.equal(val(w), 'clip', dir + ' — hidden يبقى قابلًا للتمرير برمجيًّا: ' + (w && w.where));
    assert.equal(val(W(msgs, dir === 'rtl' ? 'margin-left' : 'margin-right', { mobile: true, dir })), '-40px', 'الحيلة كما هي');
    assert.equal(val(W(msgs, 'width', { mobile: true, dir })), 'calc(100% + 40px)');
  }
  const css = bare('css/tokens.css');
  const iHidden = css.indexOf('html.mobile-ui #chatcol{overflow:hidden !important;}');
  const iClip = css.indexOf('html.mobile-ui #chatcol{overflow:clip !important;}');
  assert.ok(iClip > 0, 'قاعدة clip');
  assert.ok(css.includes('html.mobile-ui #videoMakerModal, html.mobile-ui #chatcol{overflow:hidden !important;}') || iHidden > 0, 'hidden باقٍ احتياطًا للأغلفة القديمة');
  assert.ok(iClip > css.indexOf('html.mobile-ui #chatcol{overflow:hidden !important;}'), 'clip بعد hidden');
  assert.equal(val(W(col, 'overflow', {})), '(none)', 'الحاسوب لم يُلمس');
});

/* ── ٧) أدوات الصندوق على الجوّال ── */
test('٩. أدوات الصندوق على الجوّال: فراغ ≥ 8px ومنطقة لمس أوسع (::after) بلا تداخل، والأيقونة ٢٤px والحاسوب كما هما', () => {
  const row = ['main', 'div#chatcol', 'div#inputbar', 'div.inputbar-tools.inputbar-tools-below', 'div.inputbar-tools-left'];
  const btns = [row.concat(['div#plusToolsWrap', 'button.btn#btnPlusTools']), row.concat(['button.btn#btnMic']), row.concat(['button.btn.maha-in-tools#btnMahaDock'])];
  const gap = px(W(row, 'gap', { mobile: true }));
  assert.ok(gap >= 8, 'الفراغ بين + والمايك و«م»: ' + gap);
  for (const b of btns) {
    const name = b[b.length - 1];
    assert.equal(val(W(b, 'width', { mobile: true })), '24px', name + ' — المقاس كما قرّره المالك');
    assert.equal(val(W(b, 'position', { mobile: true })), 'relative', name);
    assert.equal(val(W(b, 'content', { mobile: true, pe: 'after' })), '""', name + ' — منطقة اللمس');
    assert.equal(val(W(b, 'position', { mobile: true, pe: 'after' })), 'absolute', name);
    const inset = px(W(b, 'inset', { mobile: true, pe: 'after' }));
    assert.ok(inset <= -4, name + ' — inset ' + inset);
    assert.ok(-inset * 2 <= gap, name + ' — منطقتا لمس متجاورتان لا تتداخلان: inset ' + inset + ' gap ' + gap);
    assert.equal(W(b, 'content', { pe: 'after' }), null, name + ' — الحاسوب بلا منطقة إضافيّة');
  }
  assert.equal(val(W(row, 'gap', {})), '1px', 'الحاسوب كما هو');
});

/* ── ٨) الخطوط: محرّر الكود وخانات الوصف ── */
test('١٠. محرّر الكود: خطّ عربيّ متّصل (Tajawal) قبل Courier New، وخطّ لاتينيّ ثابت العرض قبله على كلّ منصّة', () => {
  const ff = val(W(['main', 'div#workarea', 'div#panels', 'div#panel-code.panel.active', 'textarea#code[spellcheck="false"]'], 'font-family', {}));
  const fams = ff.split(/\s*,\s*/).map((s) => s.replace(/^['"]|['"]$/g, ''));
  const iT = fams.indexOf('Tajawal'), iC = fams.indexOf('Courier New');
  assert.ok(iT > 0 && iC > iT, 'Tajawal قبل Courier New (عربيّ Courier New حروف متفرّقة): ' + ff);
  /* اللاتينيّ يبقى ثابت العرض: Consolas (ويندوز) وMenlo (ماك/آيفون) وMonaco (أندرويد: اسم مستعار لخطّ النظام الثابت) قبل Tajawal */
  for (const f of ['Consolas', 'Menlo', 'Monaco']) assert.ok(fams.indexOf(f) >= 0 && fams.indexOf(f) < iT, f + ' قبل Tajawal: ' + ff);
  assert.equal(fams[fams.length - 1], 'monospace');
});

test('١١. خانات الوصف (صانع الفيديو على الجوّال، الأزياء على الحاسوب، وغيرها) ترث خطّ الصفحة لا monospace المتصفّح', () => {
  const vmk = ['div#videoMakerModal', 'div', 'div.vmk-main', ['textarea#videoMakerPrompt[rows="4"]', 'width:100%; resize:vertical;']];
  const fash = ['div#fashionAiModal', 'div', 'div#fashionAiTextPane', ['textarea#fashionAiDescription[rows="3"]', 'width:100%; resize:vertical;']];
  const studio = ['div#studioAiModal', 'div', ['textarea#studioAiDescription[rows="2"]', 'width:100%; resize:vertical;']];
  for (const [chain, o] of [[vmk, { mobile: true }], [vmk, {}], [fash, {}], [fash, { mobile: true }], [studio, { mobile: true }]]) {
    const w = W(chain, 'font-family', o);
    assert.equal(val(w), 'inherit', JSON.stringify(o) + ' ' + (Array.isArray(chain[chain.length - 1]) ? chain[chain.length - 1][0] : '') + ' ⇒ ' + val(w));
  }
  /* القاعدة بمحدِّد عنصر وحده: أيّ قاعدة بصنف أو معرّف (محرّر الكود، لصق الكود في «تقييم الكود» بنمطه المضمّن) تغلبها */
  assert.match(bare('css/tokens.css'), /\n\s*textarea\{font-family:inherit;\}/);
  assert.match(val(W(['div', ['textarea#csPaste[rows="8"]', 'width:100%;font:12px/1.6 ui-monospace,Menlo,Consolas,monospace;direction:ltr;']], 'font-family', {})), /^ui-monospace/);
});

/* ── ٩) لوحة «اختيار الملف» في ستايل AI ── */
test('١٢. لوحة الستايل في المربّع الضيّق (≤560px): أعرض بعرض اللوحة الذهبيّة، وتلتفّ بدل «اختيار الـ…»، والعريض كما هو', () => {
  const slot = (q) => ['div#studioAiModal', 'div', 'div#studioAiSlots.stSlots', 'div#studioAiImageAWrap.stSlotWrap', 'div#studioAiSlotA.stSlot.omUpArt.omUpStyle.om3-skip[role="button"]', 'div.stSlotEmpty', q];
  for (const cw of [348, 302, 169]) {
    for (const q of ['span.omUpB', 'span.omUpL']) {
      const o = { mobile: true, cw };
      assert.equal(val(W(slot(q), 'white-space', o)), 'normal', cw + ' ' + q + ' — nowrap مع ellipsis يقصّ الكلمة');
      assert.equal(val(W(slot(q), 'overflow', o)), 'visible', cw + ' ' + q);
      const left = parseFloat(val(W(slot(q), 'left', o)));
      assert.ok(left <= 40, cw + ' ' + q + ' — العرض بعرض اللوحة الذهبيّة (٣٨–٦٢٪): left ' + left);
    }
  }
  /* الخطّ: ١٢px في المربّع المفرد (٣٠٢–٣٤٨) كما كان، وينزل حتّى ٩px في مربّعَي الدمج الضيّقين */
  assert.equal(val(W(slot('span.omUpB'), 'font-size', { mobile: true, cw: 348 })), 'max(9px,min(12px,4.2cqw))');
  /* المربّع العريض (الحاسوب، والجوّال المفتوح) كما كان */
  for (const q of ['span.omUpB', 'span.omUpL']) {
    assert.equal(val(W(slot(q), 'white-space', { cw: 900 })), 'nowrap');
    assert.equal(val(W(slot(q), 'left', { cw: 900 })), '42%');
  }
  /* الديكور والأزياء لم يُلمسا */
  assert.equal(val(W(['div', 'div.omUpArt.omUpFashion', 'div', 'span.omUpB'], 'white-space', { mobile: true, cw: 348 })), 'nowrap');
});

/* ── ١٠) الشعار و«محادثة جديدة» مع شريط الأسهم ── */
test('١٣. الحاسوب: الشعار ٢٨px ثابت مهما كانت حالة شريط الأسهم (لا قفزة ١٨px للشعار و«محادثة جديدة» تحته عند فتحه)', () => {
  const brand = ['main', 'div#sidebar', 'div#sidebarBrand.sidebarBrand'];
  const btn = ['main', 'div#sidebar', 'button#omranNewChatBtn[type="button"]'];
  /* محرّك التتالي لا يطابق :has — أي حالة الشريط مفتوحًا أو مخفيًّا؛ فيها كان الشعار ١٠px (والمطويّ ٢٨px) */
  for (const body of [['omranWelcome'], []]) {
    assert.equal(val(W(brand, 'margin-top', { body })), '28px', 'الشعار — بأيّ حالة للشريط');
    assert.equal(val(W(btn, 'margin-top', { body })), '14px', '«محادثة جديدة» ثابت أصلًا (index.html !important)');
  }
  const css = bare('css/redesign.css');
  assert.doesNotMatch(css, /body:has\(#stockTicker[^)]*\) #sidebarBrand\{/, 'لا حجز مشروط بحالة الشريط للشعار');
  /* الجوّال كما هو */
  assert.match(css, /html\.mobile-ui #sidebarBrand\{order:-3; display:flex; align-items:center; justify-content:flex-start; margin:12px 14px 2px;/);
});
