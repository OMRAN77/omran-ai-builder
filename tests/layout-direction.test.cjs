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
/* ── ٦) انزياح المحادثة ── */
/* ── ٧) أدوات الصندوق على الجوّال ── */
/* ── ٨) الخطوط: محرّر الكود وخانات الوصف ── */
/* ── ٩) لوحة «اختيار الملف» في ستايل AI ── */
/* ── ١٠) الشعار و«محادثة جديدة» مع شريط الأسهم ── */
