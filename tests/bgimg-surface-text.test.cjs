'use strict';
/* v-bgimg-surface-text — تدقيق ١٨ أكتوبر (حزمة b5): الوضع الفاتح مع خلفيّة داكنة يجعل نصوص الإعدادات والقائمة الجانبيّة بيضاء على
   الرماديّ #EBEBEB («بلا خلفيّة» و«+ صورة من جهازك» وعنوان الصفحة و«محادثة جديدة»)، والداكن مع خلفيّة فاتحة يجعلها سوداء على الأسود،
   وخانة البحث سوداء مصمتة في الفاتح. السبب: css/خلفيات.css يضع ألوان الكتابة (--text/--muted/--accent-ink) على html نفسه فتصل
   الأسطح المعتمة التي بقيت بلون الوضع، وقيم الإطار الفاتحة في css/إطارات.css تستثني .bgimg. قرار v-bg-images أراد أن تتبع الكتابةُ
   الصورةَ فوقها هي، لا فوق اللوحات المعتمة. والحلّ على نمط الثيمات (css/ثيمات.css تعيد --text على أسطحها): الأسطح المعتمة وحدها تأخذ
   ألوان وضعها، وما فوق الصورة (#chatcol، ورأس الكمبيوتر الشفّاف) يبقى على لونها. والمتغيّر المعلَن على العنصر يغلب الموروث ولو كان
   على html بـ!important.
   ومعه: × حذف صورة الجهاز ٢٢px ← منطقة ضغط ٤٤px (و٣٠px ظاهرًا على الجوّال).
   الاختبار يحسب التتالي فعلًا (محرّك layout-direction) مع وراثة المتغيّرات: الفائز على العنصر، وإلّا على أبيه، حتّى html. */
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
  'margin-top': { margin: (v) => v.split(/\s+/)[0], 'margin-block': (v) => v.split(/\s+/)[0], 'margin-top': (v) => v },
  'margin-right': { margin: (v) => { const p = v.split(/\s+/); return p.length === 1 ? p[0] : p[1]; }, 'margin-right': (v) => v },
  'margin-bottom': { margin: (v) => { const p = v.split(/\s+/); return p.length < 3 ? p[0] : p[2]; }, 'margin-block': (v) => { const p = v.split(/\s+/); return p[1] || p[0]; }, 'margin-bottom': (v) => v },
  'padding-top': { padding: (v) => v.split(/\s+/)[0], 'padding-block': (v) => v.split(/\s+/)[0], 'padding-top': (v) => v },
  'padding-bottom': { padding: (v) => { const p = v.split(/\s+/); return p.length < 3 ? p[0] : p[2]; }, 'padding-block': (v) => { const p = v.split(/\s+/); return p[1] || p[0]; }, 'padding-bottom': (v) => v },
  background: { background: (v) => v, 'background-color': (v) => v },
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
/* o: { mode: dark|light, mobile, img: dark|light|none, html: [أصناف إضافيّة], vw, pe } */
function chainOf(descs, o) {
  o = o || {};
  const img = o.img || 'none';
  const cls = ['cv-ok', 'has-user-av'].concat(o.mobile ? ['mobile-ui'] : [], img === 'none' ? [] : ['bgimg', 'bgimg-' + img], o.html || []);
  const attrs = { dir: 'rtl', lang: 'ar' };
  if (o.mode === 'light') attrs['data-mode'] = 'light';
  const html = { tag: 'html', id: '', cls: new Set(cls), attrs, style: '' };
  return [html].concat(descs.map((d) => (Array.isArray(d) ? E(d[0], d[1]) : E(d))));
}
const ctxOf = (o) => ({ vw: (o && o.vw) || (o && o.mobile ? 400 : 1280), mobile: !!(o && o.mobile) });
/* المتغيّر المحسوب: المعلَن على العنصر يغلب، وإلّا يُورث من الأب */
function computed(descs, prop, o) {
  const chain = chainOf(descs, o);
  for (let i = chain.length; i > 0; i--) { const w = winner(chain.slice(0, i), prop, ctxOf(o)); if (w) return Object.assign({ at: i - 1 }, w); }
  return null;
}
const own = (descs, prop, o) => winner(chainOf(descs, o), prop, ctxOf(o), o && o.pe);
const val = (w) => (w ? w.value.replace(/\s+/g, ' ') : '(none)');
const where = (w) => (w ? w.where : '(لا قاعدة)');
const bare = (p) => rd(p).replace(/\/\*[\s\S]*?\*\//g, '');

const IMG_DARK = { text: '#f4f5f8', muted: '#c8ccd4', ink: '#ffffff' };   /* html.bgimg-dark — css/خلفيات.css */
const IMG_LIGHT = { text: '#101114', muted: '#3d4048', ink: '#101114' };  /* html.bgimg-light */
const LIGHT = { text: '#0d0d0d', muted: '#5d5d5d', ink: '#14161a' };      /* html[data-mode=light] — tokens.css */
const DARK = { text: '#eef0f6', muted: '#9a9a9e', ink: '#eef0f6' };       /* :root — tokens.css */

/* الأسطح المعتمة بلون الوضع (tokens.css v520: #EBEBEB في الفاتح، والأسود في الداكن) */
const SURFACES = {
  'نافذة الإعدادات': ['body', 'dialog#settingsDialog[open]'],
  'محتوى الإعدادات': ['body', 'dialog#settingsDialog[open]', 'div#bgImgSection.settingsPageSection', 'div#bgImgSectionContent', 'div#bgImgGrid.bgImgGrid', 'button.bgImgOpt.bgImgNone'],
  'القائمة الجانبيّة': ['body', 'main', 'div#sidebar'],
  'محادثة جديدة': ['body', 'main', 'div#sidebar', 'button#omranNewChatBtn'],
  'لوحة المعاينة': ['body', 'main', 'div#workarea'],
  'قائمة +': ['body', 'main', 'div#chatcol', 'div#inputbar', 'div#composerBox', 'div#plusToolsWrap', 'div#plusToolsPopup'],
  'قائمة الهيدر': ['body', 'header', 'div', 'div#headerMenuDropdown'],
  'قائمة المحادثة ⋮': ['body', 'div#histItemMenu'],
  'قائمة الرسالة': ['body', 'main', 'div#chatcol', 'div#messages', 'div.msg', 'div.msgMoreMenu'],
};

test('١. الفاتح مع خلفيّة داكنة: الأسطح المعتمة بكتابة الوضع الفاتح الداكنة (كانت بيضاء على #EBEBEB)، حاسوبًا وجوّالًا', () => {
  for (const mobile of [false, true]) for (const [name, d] of Object.entries(SURFACES)) {
    const o = { mode: 'light', img: 'dark', mobile };
    const tx = computed(d, '--text', o);
    assert.equal(val(tx), LIGHT.text, (mobile ? 'جوّال ' : 'حاسوب ') + name + ' — --text: ' + where(tx) + ' ⇒ ' + val(tx));
    assert.equal(val(computed(d, '--muted', o)), LIGHT.muted, name + ' --muted');
    assert.equal(val(computed(d, '--accent-ink', o)), LIGHT.ink, name + ' --accent-ink');
  }
});

test('٢. والعكس: الداكن مع خلفيّة فاتحة يعطي الأسطح السوداء كتابة الوضع الداكن الفاتحة (كانت #101114 على الأسود)', () => {
  for (const mobile of [false, true]) for (const [name, d] of Object.entries(SURFACES)) {
    const o = { mode: 'dark', img: 'light', mobile };
    const tx = computed(d, '--text', o);
    assert.equal(val(tx), DARK.text, (mobile ? 'جوّال ' : 'حاسوب ') + name + ' — --text: ' + where(tx) + ' ⇒ ' + val(tx));
    assert.equal(val(computed(d, '--muted', o)), DARK.muted, name + ' --muted');
    assert.equal(val(computed(d, '--accent-ink', o)), DARK.ink, name + ' --accent-ink');
  }
});

test('٣. ما فوق الصورة يبقى على لونها (قرار v-bg-images): المحادثة، ورأس الكمبيوتر الشفّاف؛ وعلى الجوّال الأشرطة المعتمة بلون الوضع', () => {
  const chat = ['body', 'main', 'div#chatcol', 'div#messages', 'div.msg'];
  for (const mobile of [false, true]) {
    assert.equal(val(computed(chat, '--text', { mode: 'light', img: 'dark', mobile })), IMG_DARK.text, 'المحادثة فوق الصورة الداكنة');
    assert.equal(val(computed(chat, '--text', { mode: 'dark', img: 'light', mobile })), IMG_LIGHT.text, 'المحادثة فوق الصورة الفاتحة');
    assert.equal(val(computed(chat, '--text', { mode: 'light', img: 'light', mobile })), IMG_LIGHT.text);
    assert.equal(val(computed(chat, '--text', { mode: 'dark', img: 'dark', mobile })), IMG_DARK.text);
  }
  /* الكمبيوتر: الرأس شفّاف فوق الصورة (إطارات.css) فيبقى على لونها */
  assert.equal(val(computed(['body', 'header'], '--text', { mode: 'light', img: 'dark' })), IMG_DARK.text);
  /* الجوّال: الرأس والشريط السفليّ وشريط الكتابة مصمتة بلون الوضع (#EBEBEB / الأسود) */
  for (const d of [['body', 'header'], ['body', 'nav#omranBottomNav'], ['body', 'main', 'div#chatcol', 'div#inputbar']]) {
    assert.equal(val(computed(d, '--text', { mode: 'light', img: 'dark', mobile: true })), LIGHT.text, 'جوّال فاتح ' + d.join('>'));
    assert.equal(val(computed(d, '--text', { mode: 'dark', img: 'light', mobile: true })), DARK.text, 'جوّال داكن ' + d.join('>'));
  }
});

test('٤. لا تغيير بلا خلفيّة، ولا مع الصورة المطابقة للوضع، ولا في الثيمات (لها ألوانها: html.skin وskin-wood)', () => {
  const dlg = SURFACES['نافذة الإعدادات'];
  /* المتغيّر موروث من html كما كان (لا إعلان على السطح نفسه) */
  for (const mobile of [false, true]) for (const o of [{ mode: 'light' }, { mode: 'dark' }, { mode: 'dark', img: 'dark' }, { mode: 'light', img: 'light' }]) {
    for (const [name, d] of Object.entries(SURFACES)) for (const p of ['--text', '--muted', '--accent-ink']) {
      const w = computed(d, p, Object.assign({ mobile }, o));
      assert.equal(w && w.at, 0, (mobile ? 'جوّال ' : 'حاسوب ') + o.mode + ' ' + (o.img || 'بلا') + ' ' + name + ' ' + p + ' — إعلان جديد: ' + where(w));
    }
  }
  for (const o of [{ mode: 'light', img: 'dark', html: ['skin', 'skin-darkwood'] }, { mode: 'dark', img: 'light', html: ['skin', 'skin-kids'] }, { mode: 'light', img: 'dark', html: ['skin', 'skin-garage', 'skin-scene'] }]) {
    const w = computed(dlg, '--text', o);
    assert.match(where(w), /ثيمات\.css/, o.html.join('.') + ' — الثيم يملك ألوانه: ' + where(w));
  }
  for (const mode of ['light', 'dark']) {
    const w = computed(SURFACES['القائمة الجانبيّة'], '--text', { mode, img: 'light', html: ['skin-wood'] });
    assert.doesNotMatch(where(w), /خلفيات\.css :: (?!html\.bgimg-light$)/, 'الخشبيّ كما كان: ' + where(w));
  }
});

test('٥. الكمبيوتر الفاتح مع خلفيّة: خانة البحث فاتحة لا سوداء، وكتابتها ورماديّها داكنان؛ والداكن مع صورة فاتحة: كتابة البحث فاتحة', () => {
  const field = (o) => computed(['body', 'main', 'div#sidebar', 'div#sbSearchWrap'], '--frame-field', o);
  for (const img of ['dark', 'light']) {
    const f = field({ mode: 'light', img });
    assert.equal(val(f), 'rgba(0,0,0,.06)', 'الفاتح + صورة ' + img + ' — خانة البحث: ' + where(f) + ' ⇒ ' + val(f));
    assert.equal(val(computed(['body', 'main', 'div#sidebar', 'div#sbSearchWrap'], '--frame-muted', { mode: 'light', img })), '#5d5d5d');
    assert.equal(val(computed(['body', 'main', 'div#sidebar', 'div#sbSearchWrap', 'input#sbSearch'], '--frame-ink', { mode: 'light', img })), LIGHT.text);
  }
  assert.equal(val(computed(['body', 'main', 'div#sidebar', 'div#sbSearchWrap', 'input#sbSearch'], '--frame-ink', { mode: 'dark', img: 'light' })), DARK.text, 'الداكن + صورة فاتحة: كتابة البحث');
  /* بلا خلفيّة كما كان: الأسود #0b0b0d والعاجيّ #e8dec8 */
  assert.equal(val(field({ mode: 'dark' })), '#0b0b0d');
  assert.equal(val(field({ mode: 'light' })), '#e8dec8');
  assert.equal(val(field({ mode: 'dark', img: 'dark' })), '#0b0b0d', 'الداكن مع صورة داكنة كما كان');
  /* والخانة ترسم بالمتغيّر نفسه */
  assert.equal(val(own(['body', 'main', 'div#sidebar', 'div#sbSearchWrap'], 'background', { mode: 'light', img: 'dark' })), 'var(--frame-field)');
});

test('٦. × حذف صورة الجهاز: منطقة ضغط ٤٤px على الأقلّ بلا تغيير في شكله على الحاسوب، و٣٠px ظاهرًا على الجوّال', () => {
  const x = ['body', 'dialog#settingsDialog[open]', 'div#bgImgGrid.bgImgGrid', 'button.bgImgOpt.bgImgCustom', 'span.bgImgDel'];
  for (const mobile of [false, true]) {
    const o = { mode: 'dark', mobile };
    const w = parseFloat(val(own(x, 'width', o)));
    assert.equal(val(own(x, 'position', o)), 'absolute');
    assert.equal(val(own(x, 'content', Object.assign({ pe: 'before' }, o))), '""', 'منطقة ضغط غير مرئيّة');
    assert.equal(val(own(x, 'position', Object.assign({ pe: 'before' }, o))), 'absolute');
    const inset = parseFloat(val(own(x, 'inset', Object.assign({ pe: 'before' }, o))));
    assert.ok(inset <= -11, 'inset ' + inset);
    assert.ok(w - 2 * inset >= 44, (mobile ? 'جوّال' : 'حاسوب') + ': منطقة الضغط ' + (w - 2 * inset) + 'px');
    assert.equal(w, mobile ? 30 : 22, mobile ? 'أكبر ظاهرًا على الجوّال' : 'الشكل على الحاسوب كما هو');
  }
});
