'use strict';
/* أدوات اختبار التباين (v-theme-contrast، أمر المالك ٢١ أكتوبر: «تباين الكلام مع الخلفية ما يقل عن 4.5:1» في كلّ ثيم ووضع وخلفيّة).
   - نسبة التباين بصيغة WCAG 2.x (النصوع النسبيّ) ودمج الألفا.
   - تتالٍ حقيقيّ لأوراق الأنماط كما يحمّلها index.html (محرّك tests/bgimg-surface-text.test.cjs نفسه، مع فهرسة القواعد بالخاصيّة):
     الفائز على العنصر، والموروث من الأب، والمتغيّرات var() محلولة على العنصر نفسه.
   - طبقات الخلفيّة: لون، تدرّج (كلّ محطّاته)، وصورة (بكسلاتها الحقيقيّة بـjpeg-js/pngjs، بـcover وموضعها، أو مبلّطة).
     التباين على سطح فيه صورة أو تدرّج = العُشر الأدنى (p10) من نسب العيّنات — كمسبار البكسلات scripts/theme-contrast-probe.mjs. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ── الألوان ──
const NAMED = { white: [255, 255, 255, 1], black: [0, 0, 0, 1], transparent: [0, 0, 0, 0], red: [255, 0, 0, 1], gold: [255, 215, 0, 1] };
function parseColor(s) {
  if (!s) return null; s = String(s).trim().toLowerCase();
  if (NAMED[s]) return NAMED[s].slice();
  let m = s.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let h = m[1]; if (h.length === 3 || h.length === 4) h = h.split('').map((x) => x + x).join('');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
  }
  m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) { const a = m[1].split(/[\s,/]+/).filter(Boolean).map((x) => (x.endsWith('%') ? parseFloat(x) / 100 : Number(x))); return [a[0], a[1], a[2], a.length > 3 ? a[3] : 1]; }
  return null;
}
const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const ratio = (a, b) => { const x = Math.max(lum(a), lum(b)), y = Math.min(lum(a), lum(b)); return (x + 0.05) / (y + 0.05); };
const over = (fg, bg, k) => { const a = (fg[3] == null ? 1 : fg[3]) * (k == null ? 1 : k); return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1]; };
const hex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('') + (c[3] != null && c[3] < 1 ? '/' + (+c[3].toFixed(2)) : '');

// ── أوراق الأنماط كما يحمّلها index.html (وما تحقنه الأجزاء المنفصلة) ──
const splitTop = (s, sep) => { const out = []; let d = 0, q = '', cur = ''; for (const ch of s) {
  if (q) { if (ch === q) q = ''; cur += ch; continue; }
  if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
  if (ch === '(' || ch === '[') d++; if (ch === ')' || ch === ']') d--;
  if (ch === sep && !d) { out.push(cur.trim()); cur = ''; } else cur += ch; }
  if (cur.trim()) out.push(cur.trim()); return out; };
function sheets() {
  const html = rd('index.html').replace(/<!--[\s\S]*?-->/g, (c) => ' '.repeat(c.length));
  const re = /<link rel="stylesheet" href="(css\/[^"?]+)[^"]*"|<style\b[^>]*>([\s\S]*?)<\/style>|<script\b[^>]*src="\/?(js\/partials-[\w-]+\.js)[^"]*"/g;
  const out = []; let m;
  while ((m = re.exec(html))) {
    if (m[1]) out.push({ name: m[1], css: rd(m[1]) });
    else if (m[3]) { const src = rd(m[3]); let s; const sr = /<style\b[^>]*>([\s\S]*?)<\/style>/g; while ((s = sr.exec(src))) out.push({ name: m[3], css: s[1] }); }
    else out.push({ name: 'inline', css: m[2] });
  }
  /* ui-wiring.js يلحق بطاقات الأدوات آخرًا في كلّ إقلاع */
  out.push({ name: 'css/tool-card-images.css', css: rd('css/tool-card-images.css') });
  return out;
}
const declsOf = (body) => splitTop(body, ';').map((d) => d.match(/^([\w-]+)\s*:\s*([\s\S]*)$/)).filter(Boolean)
  .map((d) => ({ prop: d[1].startsWith('--') ? d[1] : d[1].toLowerCase(), important: /!\s*important\s*$/.test(d[2]), value: d[2].replace(/\s*!\s*important\s*$/, '').trim() }));
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
    else if (!prelude.startsWith('@')) out.push({ sheet, media, sel: prelude, sels: splitTop(prelude, ','), decls: declsOf(body), order: out.length });
    i = j;
  }
  return out;
}
function mediaOk(list, ctx) {
  return list.every((q) => {
    if (q.startsWith('container:')) return false;
    return q.split(/\s*,\s*/).some((alt) => alt.replace(/^only\s+/, '').split(/\s+and\s+/).every((f) => {
      f = f.trim(); if (!f || f === 'screen' || f === 'all') return true;
      let m = f.match(/^\((min|max)-width:\s*(\d+(?:\.\d+)?)px\)$/);
      if (m) return m[1] === 'min' ? ctx.vw >= +m[2] : ctx.vw <= +m[2];
      m = f.match(/^\((min|max)-height:\s*(\d+(?:\.\d+)?)px\)$/);
      if (m) return m[1] === 'min' ? ctx.vh >= +m[2] : ctx.vh <= +m[2];
      m = f.match(/^\((hover|any-hover):\s*(none|hover)\)$/); if (m) return (m[2] === 'none') === ctx.mobile;
      m = f.match(/^\((pointer|any-pointer):\s*(coarse|fine)\)$/); if (m) return (m[2] === 'coarse') === ctx.mobile;
      m = f.match(/^\(prefers-color-scheme:\s*(dark|light)\)$/); if (m) return m[1] === 'dark';
      m = f.match(/^\(prefers-reduced-motion/); if (m) return false;
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
const TOK = new Map();
function tokens(compound) {
  if (TOK.has(compound)) return TOK.get(compound);
  const out = []; let i = 0;
  const tag = compound.match(/^(\*|[a-zA-Z][\w-]*)/); if (tag) { out.push({ t: 'tag', v: tag[1].toLowerCase() }); i = tag[1].length; }
  let bad = false;
  while (i < compound.length) {
    const rest = compound.slice(i); let m;
    if ((m = rest.match(/^#([\w-]+)/))) out.push({ t: 'id', v: m[1] });
    else if ((m = rest.match(/^\.([\w-]+)/))) out.push({ t: 'class', v: m[1] });
    else if ((m = rest.match(/^\[\s*([\w-]+)\s*(?:([*^$~|]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]*))\s*(i)?\s*)?\]/))) out.push({ t: 'attr', v: m[1], op: m[2], val: m[3] != null ? m[3] : (m[4] != null ? m[4] : m[5]) });
    else if ((m = rest.match(/^::([\w-]+)/))) out.push({ t: 'pe', v: m[1] });
    else if ((m = rest.match(/^:([\w-]+)\(/))) { let d = 1, j = m[0].length; while (d && j < rest.length) { if (rest[j] === '(') d++; else if (rest[j] === ')') d--; j++; } out.push({ t: 'fn', v: m[1], arg: rest.slice(m[0].length, j - 1) }); m = [rest.slice(0, j)]; }
    else if ((m = rest.match(/^:([\w-]+)/))) out.push({ t: m[1] === 'before' || m[1] === 'after' ? 'pe' : 'pc', v: m[1] });
    else { bad = true; break; }
    i += m[0].length;
  }
  const r = bad ? null : out; TOK.set(compound, r); return r;
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
/* الحالات الثابتة التي تُنمذَج: :root، و:not/:is/:where، و:first-child لأوّل الأبناء إن عُلِّم (first)، و:hover/:focus لا */
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
    if (k.t === 'pc') return k.v === 'root' ? el.tag === 'html' : (k.v === 'first-child' ? !!el.first : (k.v === 'last-child' ? !!el.last : (k.v === 'not-defined' ? false : false)));
    if (k.v === 'not') return !splitTop(k.arg, ',').some((c) => matchCompound(c, el, null));
    if (k.v === 'is' || k.v === 'where') return splitTop(k.arg, ',').some((c) => matchCompound(c, el, null));
    return false; /* :has و:nth-child… — حالة لا تُنمذَج */
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
const SPC = new Map();
const specComplex = (sel) => { if (SPC.has(sel)) return SPC.get(sel); const r = complexParts(sel).reduce((acc, p) => { const s = spec(p.c); return [acc[0] + s[0], acc[1] + s[1], acc[2] + s[2]]; }, [0, 0, 0]); SPC.set(sel, r); return r; };
const CP = new Map();
const partsOf = (s) => { if (!CP.has(s)) CP.set(s, complexParts(s)); return CP.get(s); };
function matchComplex(parts, idx, chain, at, pe) {
  if (at < 0 || !matchCompound(parts[idx].c, chain[at], idx === parts.length - 1 ? pe : null)) return false;
  if (idx === 0) return true;
  const comb = parts[idx].comb;
  if (comb === '>') return matchComplex(parts, idx - 1, chain, at - 1, pe);
  if (comb === ' ') { for (let k = at - 1; k >= 0; k--) if (matchComplex(parts, idx - 1, chain, k, pe)) return true; return false; }
  return false;
}

let ALL = null, BYPROP = null;
/* فهرسة كالمتصفّح: كلّ محدِّد بمفتاح مركّبه الأيمن (معرّف، وإلّا صنف، وإلّا وسم، وإلّا *) — فلا يُجرَّب على العنصر إلّا ما قد يطابقه */
function keyOfSel(sel) {
  const p = partsOf(sel); const ks = tokens(p[p.length - 1].c) || [];
  const id = ks.find((k) => k.t === 'id'); if (id) return '#' + id.v;
  const c = ks.find((k) => k.t === 'class'); if (c) return '.' + c.v;
  const t = ks.find((k) => k.t === 'tag' && k.v !== '*'); if (t) return t.v;
  return '*';
}
function load() {
  if (ALL) return;
  ALL = sheets().reduce((acc, s) => rulesOf(s.css, [], acc, s.name), []);
  BYPROP = new Map();
  for (const r of ALL) for (const d of r.decls) for (const sel of r.sels) {
    if (!BYPROP.has(d.prop)) BYPROP.set(d.prop, new Map());
    const m = BYPROP.get(d.prop); const k = keyOfSel(sel);
    if (!m.has(k)) m.set(k, []); m.get(k).push({ r, d, sel });
  }
}
/* الخاصيّة ومن أين تُقرأ (الاختصار background يعطي الطبقات كلّها؛ background-color لونها) */
const FROM = {
  background: ['background', 'background-color', 'background-image'],
  color: ['color'],
  '-webkit-text-fill-color': ['-webkit-text-fill-color'],
  opacity: ['opacity'],
  stroke: ['stroke'],
  fill: ['fill'],
};
function winner(chain, prop, ctx, pe) {
  load();
  const names = FROM[prop] || [prop];
  const el = chain[chain.length - 1];
  let best = null;
  const consider = (cand) => {
    if (!best) { best = cand; return; }
    if (cand.important !== best.important) { if (cand.important) best = cand; return; }
    if (cand.inline !== best.inline) { if (cand.important ? !cand.inline : cand.inline) best = cand; return; }
    if ((cmp(cand.sp, best.sp) || cand.order - best.order) >= 0) best = cand;
  };
  const keys = ['*', el.tag].concat(el.id ? ['#' + el.id] : [], [...el.cls].map((c) => '.' + c));
  for (const name of names) {
    const m = BYPROP.get(name); if (!m) continue;
    for (const key of keys) for (const { r, d, sel } of m.get(key) || []) {
      if (!mediaOk(r.media, ctx)) continue;
      const p = partsOf(sel);
      if (!matchComplex(p, p.length - 1, chain, chain.length - 1, pe)) continue;
      consider({ important: d.important, inline: false, sp: specComplex(sel), order: r.order, value: d.value, prop: d.prop, where: r.sheet + ' :: ' + r.sel.slice(0, 160) });
    }
  }
  if (!pe && el.style) for (const d of declsOf(el.style).filter((x) => names.includes(x.prop))) consider({ important: d.important, inline: true, sp: [9, 9, 9], order: 1e9, value: d.value, prop: d.prop, where: 'inline style' });
  return best;
}
function E(desc, style) {
  const m = desc.match(/^([a-z][a-z0-9]*)/); const el = { tag: m ? m[1] : 'div', id: '', cls: new Set(), attrs: {}, style: style || '' };
  let rest = desc.slice(m ? m[1].length : 0), x;
  while (rest) {
    if ((x = rest.match(/^#([\w-]+)/))) el.id = x[1];
    else if ((x = rest.match(/^\.([\w-]+)/))) el.cls.add(x[1]);
    else if ((x = rest.match(/^\[([\w-]+)(?:="([^"]*)")?\]/))) el.attrs[x[1]] = x[2] == null ? '' : x[2];
    else if ((x = rest.match(/^:first/))) el.first = true;
    else throw new Error('وصف غير مفهوم: ' + rest);
    rest = rest.slice(x[0].length);
  }
  if (el.id) el.attrs.id = el.id;
  if (el.cls.size) el.attrs.class = [...el.cls].join(' ');
  if (el.style) el.attrs.style = el.style;
  return el;
}
/* o: { mode: dark|light, mobile, html: [أصناف html], body: [أصناف body] } */
function chainOf(descs, o) {
  o = o || {};
  const cls = ['cv-ok', 'has-user-av'].concat(o.mobile ? ['mobile-ui'] : [], o.html || []);
  const attrs = { dir: 'rtl', lang: 'ar', class: cls.join(' ') };
  if (o.mode === 'light') attrs['data-mode'] = 'light';
  /* applyTheme (js/app-05-ui.js) يضع عند الإقلاع على html نفسه: --text و--bg وفقاعتي المحادثة (THEME_DEFAULTS) — ما ليس !important في الأوراق يخسر أمامها */
  const html = { tag: 'html', id: '', cls: new Set(cls), attrs, style: o.htmlStyle != null ? o.htmlStyle : '--text:#eef0f6; --bg:#000000; --user-bubble:var(--accent); --assistant-bubble:#1e1e1e' };
  return [html].concat(descs.map((d, i) => {
    const e = Array.isArray(d) ? E(d[0], d[1]) : E(d);
    if (i === 0 && e.tag === 'body' && o.body) for (const c of o.body) e.cls.add(c);
    return e;
  }));
}
const ctxOf = (o) => ({ vw: (o && o.vw) || (o && o.mobile ? 400 : 1280), vh: (o && o.mobile ? 860 : 900), mobile: !!(o && o.mobile) });
const INHERITED = new Set(['color', '-webkit-text-fill-color', 'stroke', 'fill']);
const memo = new Map();
const keyOf = (chain, prop, o, pe) => chain.map((e) => e.tag + '#' + e.id + '.' + [...e.cls].join('.') + JSON.stringify(e.attrs) + (e.first ? ':first' : '')).join('>') + '|' + prop + '|' + JSON.stringify(o || {}) + '|' + (pe || '');
/* القيمة المحسوبة: المتغيّرات والخاصيّات الموروثة تصعد إلى الأب؛ var() تُحلّ على العنصر الذي فاز عليه الإعلان */
function cssValue(chain, prop, o, pe) {
  const k = keyOf(chain, prop, o, pe); if (memo.has(k)) return memo.get(k);
  const inherits = prop.startsWith('--') || INHERITED.has(prop);
  let out = null;
  for (let i = chain.length; i > 0; i--) {
    const sub = chain.slice(0, i);
    const w = winner(sub, prop, ctxOf(o), i === chain.length ? pe : null);
    if (w && !/^(inherit|unset)$/.test(w.value)) {
      if (w.value === 'currentColor' || w.value === 'currentcolor') { out = Object.assign({}, w, { value: (cssValue(sub, 'color', o) || {}).value }); break; }
      out = Object.assign({ at: i - 1 }, w, { raw: w.value, value: resolveVars(w.value, sub, o) });
      break;
    }
    if (!inherits) break;
  }
  memo.set(k, out);
  return out;
}
function resolveVars(v, chain, o, depth) {
  depth = depth || 0;
  if (depth > 12 || !v || v.indexOf('var(') < 0) return v;
  let out = '', i = 0;
  while (i < v.length) {
    const j = v.indexOf('var(', i); if (j < 0) { out += v.slice(i); break; }
    out += v.slice(i, j);
    let d = 1, k = j + 4; while (k < v.length && d) { if (v[k] === '(') d++; else if (v[k] === ')') d--; k++; }
    const inner = v.slice(j + 4, k - 1); const parts = splitTop(inner, ',');
    const name = parts[0].trim(); const fb = inner.slice(inner.indexOf(',') + 1).trim();
    const w = cssValue(chain, name, o);
    out += w && w.value != null && w.value !== '' ? w.value : (parts.length > 1 ? resolveVars(fb, chain, o, depth + 1) : '');
    i = k;
  }
  return resolveVars(out, chain, o, depth + 1);
}

// ── الصور: بكسلاتها الحقيقيّة ──
const IMG = new Map();
function image(urlRel, fromSheet) {
  let p = decodeURIComponent(urlRel.replace(/^["']|["']$/g, '').replace(/[?#].*$/, ''));
  p = p.startsWith('/') ? p.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(fromSheet || 'css/x.css'), p));
  if (IMG.has(p)) return IMG.get(p);
  let img = null;
  const f = path.join(ROOT, p);
  if (fs.existsSync(f)) {
    if (/\.jpe?g$/i.test(p)) { const d = require('jpeg-js').decode(fs.readFileSync(f), { useTArray: true, maxMemoryUsageInMB: 2048 }); img = { w: d.width, h: d.height, data: d.data, file: p }; }
    else if (/\.png$/i.test(p)) { const d = require('pngjs').PNG.sync.read(fs.readFileSync(f)); img = { w: d.width, h: d.height, data: d.data, file: p }; }
  }
  IMG.set(p, img);
  return img;
}
const px = (img, u, v) => { const x = Math.max(0, Math.min(img.w - 1, Math.floor(u * img.w))), y = Math.max(0, Math.min(img.h - 1, Math.floor(v * img.h))); const i = (y * img.w + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3] / 255]; };

/* طبقات قيمة background (من الأعلى إلى الأسفل)، كلّ طبقة بموضعها ومقاسها وتكرارها:
   لون | تدرّج (خطّيّ باتّجاهه ومواضع محطّاته؛ غيره ومكرَّره = كلّ محطّاته) | صورة (cover/contain/مقاس، أو بمقاسها مبلّطة) */
const COLRE = /(#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|\btransparent\b|\bwhite\b|\bblack\b)/i;
function geom(rest) {
  const parts = (rest || '').split('/');
  const P = (parts[0] || '').match(/(-?\d+(?:\.\d+)?(?:%|px)|left|right|center|top|bottom)/g) || [];
  const kw = (t) => (/%$/.test(t) ? parseFloat(t) / 100 : t === 'left' || t === 'top' ? 0 : t === 'right' || t === 'bottom' ? 1 : 0.5);
  let fx = 0.5, fy = 0.5;
  if (P.length === 1) { if (P[0] === 'top' || P[0] === 'bottom') fy = kw(P[0]); else fx = kw(P[0]); }
  else if (P.length >= 2) { if (P[0] === 'top' || P[0] === 'bottom') { fy = kw(P[0]); fx = kw(P[1]); } else { fx = kw(P[0]); fy = kw(P[1]); } }
  let size = null;
  const S = (parts[1] || '').trim();
  if (/^cover\b/.test(S)) size = 'cover';
  else if (/^contain\b/.test(S)) size = 'contain';
  else { const m = S.match(/^(-?\d+(?:\.\d+)?(?:px|%)|auto)(?:\s+(-?\d+(?:\.\d+)?(?:px|%)|auto))?/); if (m) size = [m[1], m[2] || 'auto']; }
  return { fx, fy, size, repeat: !/no-repeat/.test(rest || '') };
}
function layersOf(value, sheet) {
  if (!value || /^(none|transparent|initial|unset)$/.test(value.trim())) return [];
  const out = [];
  for (const L of splitTop(value, ',')) {
    const u = L.match(/url\(\s*(["']?)([^"')]+)\1\s*\)/);
    const g = L.match(/((repeating-)?(linear|radial|conic)-gradient)\(/);
    if (u) {
      const rest = L.replace(u[0], ' ');
      out.push(Object.assign({ t: 'img', img: image(u[2], sheet) }, geom(rest.replace(COLRE, ''))));
      const c = parseColor((rest.match(COLRE) || [])[0]); if (c) out.push({ t: 'color', c });
    } else if (g) {
      let d = 1, k = L.indexOf(g[0]) + g[0].length; const st = k;
      while (k < L.length && d) { if (L[k] === '(') d++; else if (L[k] === ')') d--; k++; }
      const args = splitTop(L.slice(st, k - 1), ',');
      let ang = 180;
      let rad = null; // شعاعيّ: { size: [rx, ry] نصّيّة أو null = أبعد زاوية، at: [x, y] }
      if (args.length && !COLRE.test(args[0])) {
        const a0 = args.shift().trim();
        if (g[3] === 'linear') { const m = a0.match(/^(-?\d+(?:\.\d+)?)deg$/); const T = { 'to top': 0, 'to right': 90, 'to bottom': 180, 'to left': 270 }; ang = m ? +m[1] : (T[a0] != null ? T[a0] : 180); }
        else if (g[3] === 'radial') {
          const [shape, at] = a0.split(/\bat\b/);
          const sz = (shape || '').match(/(-?\d+(?:\.\d+)?(?:px|%))/g);
          const pos = (at || '').match(/(-?\d+(?:\.\d+)?%|left|right|center|top|bottom)/g) || [];
          const kw = (t) => (/%$/.test(t) ? parseFloat(t) / 100 : t === 'left' || t === 'top' ? 0 : t === 'right' || t === 'bottom' ? 1 : 0.5);
          rad = { size: sz ? [sz[0], sz[1] || sz[0]] : null, at: [pos[0] ? kw(pos[0]) : 0.5, pos[1] ? kw(pos[1]) : 0.5] };
        }
      }
      if (g[3] === 'radial' && !rad) rad = { size: null, at: [0.5, 0.5] };
      const stops = args.map((x) => { const c = parseColor((x.match(COLRE) || [])[0]); const rest = x.replace(COLRE, ''); const p = rest.match(/(-?\d+(?:\.\d+)?)%/); const q = rest.match(/(-?\d+(?:\.\d+)?)px/); return c ? { c, p: p ? +p[1] / 100 : null, px: q ? +q[1] : null } : null; }).filter(Boolean);
      stops.forEach((sp, i) => { if (sp.p == null && sp.px == null) sp.p = stops.length === 1 ? 0 : i / (stops.length - 1); });
      if (stops.length) out.push(Object.assign({ t: 'grad', kind: g[3], rep: !!g[2], ang, rad, stops }, geom(L.slice(k).replace(COLRE, ''))));
      const after = L.slice(k).match(COLRE); if (after) out.push({ t: 'color', c: parseColor(after[0]) });
    } else {
      const c = parseColor((L.match(COLRE) || [])[0]); if (c) out.push({ t: 'color', c });
    }
  }
  return out;
}
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
function gradAt(L, lx, ly, sw, sh, idx) {
  if (L.kind === 'radial' && !L.rep && L.rad) { // المسافة من المركز على نصفي القطر (نقاط ١px في بلاطة ٢٢px لا تُعدّ سطحًا كاملًا)
    const dim = (v, full) => (/%$/.test(v) ? parseFloat(v) / 100 * full : parseFloat(v));
    const cx = L.rad.at[0] * sw, cy = L.rad.at[1] * sh;
    const far = Math.max(Math.hypot(cx, cy), Math.hypot(sw - cx, cy), Math.hypot(cx, sh - cy), Math.hypot(sw - cx, sh - cy)) || 1;
    const rx = L.rad.size ? dim(L.rad.size[0], sw) : far, ry = L.rad.size ? dim(L.rad.size[1], sh) : far;
    const d = Math.hypot((lx - cx) / (rx || 1), (ly - cy) / (ry || 1)); // ٠ في المركز و١ على الحافّة
    const S = L.stops.map((sp, i) => ({ c: sp.c, p: sp.px != null ? sp.px / (rx || 1) : (sp.p != null ? sp.p : i / Math.max(1, L.stops.length - 1)) }));
    if (d <= S[0].p) return S[0].c;
    for (let i = 1; i < S.length; i++) if (d <= S[i].p) return lerp(S[i - 1].c, S[i].c, (d - S[i - 1].p) / ((S[i].p - S[i - 1].p) || 1));
    return S[S.length - 1].c;
  }
  if (L.kind !== 'linear' || L.rep) return L.stops[idx % L.stops.length].c; // مخروطيّ أو مكرَّر: كلّ المحطّات تُجرَّب
  const a = L.ang * Math.PI / 180, dx = Math.sin(a), dy = -Math.cos(a);
  const len = Math.abs(sw * dx) + Math.abs(sh * dy) || 1;
  const t = ((lx - sw / 2) * dx + (ly - sh / 2) * dy) / len + 0.5;
  const S = L.stops.map((sp, i) => ({ c: sp.c, p: sp.p != null ? sp.p : i / Math.max(1, L.stops.length - 1) }));
  if (t <= S[0].p) return S[0].c;
  for (let i = 1; i < S.length; i++) if (t <= S[i].p) return lerp(S[i - 1].c, S[i].c, (t - S[i - 1].p) / ((S[i].p - S[i - 1].p) || 1));
  return S[S.length - 1].c;
}
/* لون طبقة عند نقطة (px) داخل صندوق عنصرها box=[x0,y0,x1,y1] */
function layerAt(L, x, y, box, idx) {
  if (L.t === 'color') return L.c;
  const bw = box[2] - box[0], bh = box[3] - box[1];
  const dim = (v, full) => (/%$/.test(v) ? parseFloat(v) / 100 * full : parseFloat(v));
  let sw, sh;
  if (L.t === 'img') {
    if (!L.img) return null;
    if (L.size === 'cover' || L.size === 'contain') { const q = L.size === 'cover' ? Math.max(bw / L.img.w, bh / L.img.h) : Math.min(bw / L.img.w, bh / L.img.h); sw = L.img.w * q; sh = L.img.h * q; }
    else if (Array.isArray(L.size)) {
      sw = L.size[0] === 'auto' ? null : dim(L.size[0], bw); sh = L.size[1] === 'auto' ? null : dim(L.size[1], bh);
      if (sw == null && sh == null) { sw = L.img.w; sh = L.img.h; } else if (sw == null) sw = sh * L.img.w / L.img.h; else if (sh == null) sh = sw * L.img.h / L.img.w;
    } else { sw = L.img.w; sh = L.img.h; }
  } else if (Array.isArray(L.size)) { sw = L.size[0] === 'auto' ? bw : dim(L.size[0], bw); sh = L.size[1] === 'auto' ? bh : dim(L.size[1], bh); }
  else { sw = bw; sh = bh; }
  if (!(sw > 0) || !(sh > 0)) return null;
  let lx = x - box[0] - (bw - sw) * L.fx, ly = y - box[1] - (bh - sh) * L.fy;
  if (L.repeat) { lx = ((lx % sw) + sw) % sw; ly = ((ly % sh) + sh) % sh; }
  else if (lx < 0 || ly < 0 || lx > sw || ly > sh) return null;
  return L.t === 'img' ? px(L.img, lx / sw, ly / sh) : gradAt(L, lx, ly, sw, sh, idx);
}
/* عيّنات سطح مركَّب: stack من الأسفل إلى الأعلى { layers (من الأعلى إلى الأسفل), box, k (شفافيّة) }، والنقاط في منطقة region (px) */
function samples(stack, region, n) {
  n = n || 20;
  const out = [];
  for (let iy = 0; iy < n; iy++) for (let ix = 0; ix < n; ix++) {
    const x = region[0] + (region[2] - region[0]) * (ix + 0.5) / n, y = region[1] + (region[3] - region[1]) * (iy + 0.5) / n;
    const idx = iy * n + ix;
    let c = [0, 0, 0, 1];
    for (const e of stack) for (let li = e.layers.length - 1; li >= 0; li--) {
      const col = layerAt(e.layers[li], x, y, e.box, idx * 7 + iy);
      if (col) c = over(col, c, e.k);
    }
    out.push(c);
  }
  return out;
}
/* تباين لون نصّ على عيّنات: العُشر الأدنى (كمسبار البكسلات)، والأدنى إن كان السطح ألوانًا معدودة */
function contrastOn(fg, samplesList, k) {
  const rs = samplesList.map((bg) => ratio(over(fg, bg, k), bg)).sort((a, b) => a - b);
  const uniq = new Set(samplesList.map((c) => c.slice(0, 3).map(Math.round).join(','))).size;
  return uniq <= 6 ? rs[0] : rs[Math.floor(rs.length * 0.1)];
}

/* سطح عنصر كما يُرسم: لوحة html، ثمّ طبقة الخلفيّة الثابتة #bgImgLayer ووشاحها ::after (حين تظهر)، ثمّ خلفيّة كلّ عنصر في السلسلة
   (body ثمّ الأبناء) بشفافيّته (opacity). boxOf(وصف العنصر، الأوصاف حتّى أبيه) يعيد صندوقه بالبكسل أو null (= الشاشة كلّها).
   o.bgimgUrl لصورة شاشة (style مضمَّن). */
function surfaceOf(descs, o, view, boxOf) {
  const VIEW = [0, 0, view.W, view.H];
  const stack = [], where = [];
  const sheetOf = (w) => (w && w.where ? w.where.split(' :: ')[0] : 'css/x.css');
  const push = (w, box, k) => { if (!w || !w.value) return; const L = layersOf(w.value, sheetOf(w)); if (!L.length) return; stack.push({ layers: L, box: box || VIEW, k: k == null ? 1 : k }); where.push(w.where); };
  const htmlChain = chainOf([], o);
  push(cssValue(htmlChain, 'background', o));
  /* الخلفيّة الثلاثيّة (#vantaBg): ما ترسمه لا يُعرف ساكنًا — o.canvas لون مفروض (الاختبار يجرّب الأبيض والأسود) */
  if (o.canvas) push({ value: o.canvas, where: 'vantaBg (مفروض)' });
  if (htmlChain[0].cls.has('bgimg')) {
    const layer = chainOf(['body', 'div#bgImgLayer'], o);
    const disp = cssValue(layer, 'display', o);
    if (disp && disp.value !== 'none') {
      push(cssValue(layer, 'background', o));
      if (o.bgimgUrl) push({ value: 'url("' + o.bgimgUrl + '") center / cover no-repeat', where: 'inline' });
      const ad = cssValue(layer, 'display', o, 'after');
      if (!ad || ad.value !== 'none') push(cssValue(layer, 'background', o, 'after'));
    }
  }
  const full = chainOf(descs, o);
  let k = 1;
  for (let i = 2; i <= full.length; i++) {
    const sub = full.slice(0, i);
    const opw = cssValue(sub, 'opacity', o); if (opw && !isNaN(parseFloat(opw.value))) k *= parseFloat(opw.value);
    const plain = (d) => (Array.isArray(d) ? d[0] : d);
    push(cssValue(sub, 'background', o), boxOf ? boxOf(plain(descs[i - 2]), descs.slice(0, i - 2).map(plain)) : null, k);
  }
  return { stack, where, opacity: k };
}
/* لون النصّ المرسوم (-webkit-text-fill-color يغلب color إن أُعلن) بعد حلّ المتغيّرات، وشفافيّة العنصر وآبائه */
function inkOf(descs, o, pe) {
  const ch = chainOf(descs, o);
  const fill = cssValue(ch, '-webkit-text-fill-color', o, pe);
  const w = fill && fill.value && !/^(currentcolor|initial|unset)$/i.test(fill.value) ? fill : cssValue(ch, 'color', o, pe);
  return { c: parseColor(w && w.value), where: w && w.where, value: w && w.value, raw: w && w.raw };
}

module.exports = { surfaceOf, inkOf, ROOT, rd, parseColor, lum, ratio, over, hex, splitTop, load, winner, cssValue, resolveVars, chainOf, ctxOf, layersOf, samples, contrastOn, image, get rules() { load(); return ALL; } };
