'use strict';
/* v-settings-push-body — تدقيق ١٨ أكتوبر (حزمة b5): درج الإعدادات على الكمبيوتر يغطّي الشريط الجانبيّ وطرف صندوق الكتابة ويعتّم المحادثة،
   مع أنّ المالك طلب أن «تدفع الدردشة، ما تغطّيها» (v-settings-push) وألّا تعتّمها (v-settings-clear-desktop). السبب: الإزاحة على <main> الذي
   صار display:contents في شبكة الكمبيوتر (v-frame-c) فلا صندوق له ولا هامش، وقاعدة تعتيم الجوّال بلا نطاق تغلب الشفّافة بالترتيب.
   ومعه: لا ✕ على الحاسوب (v-settings-no-x-mobile: «يبقى على الحاسوب وحده»)، وأزرار الإعدادات بخطّ المتصفّح (Arial) لا خطّ التطبيق،
   ورأس الصفحة (← والعنوان) يختفي مع التمرير، وأمثلة المفاتيح تنقلب «...-sk» في العربيّ.
   الاختبار يحسب التتالي فعلًا (محرّك layout-direction/black-surfaces): أوراق index.html بترتيبها مع <style> الأجزاء والأنماط المضمّنة. */
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
/* o: { mode: dark|light, mobile, dir, vw, pe, html: [أصناف إضافيّة على html] } */
function W(descs, prop, o) {
  o = o || {};
  const mobile = !!o.mobile;
  const cls = ['cv-ok', 'has-user-av'].concat(mobile ? ['mobile-ui'] : [], o.html || []);
  const attrs = { dir: o.dir || 'rtl', lang: (o.dir || 'rtl') === 'rtl' ? 'ar' : 'en' };
  if (o.mode === 'light') attrs['data-mode'] = 'light';
  const html = { tag: 'html', id: '', cls: new Set(cls), attrs, style: '' };
  const chain = [html].concat(descs.map((d) => (Array.isArray(d) ? E(d[0], d[1]) : E(d))));
  return winner(chain, prop, { vw: o.vw || (mobile ? 400 : 1280), mobile }, o.pe);
}
const val = (w) => (w ? w.value.replace(/\s+/g, ' ') : '(none)');
const where = (w) => (w ? w.where : '(لا قاعدة)');
const bare = (p) => rd(p).replace(/\/\*[\s\S]*?\*\//g, '');
const DLG = ['body', 'dialog#settingsDialog[open]'];
const MODES = [{ mode: 'dark' }, { mode: 'light' }];

test('١. الدرج يدفع التطبيق على الكمبيوتر: <main> بلا صندوق (display:contents)، فالإزاحة على الجسم (الشبكة) بعرض الدرج نفسه، والجوّال بلا إزاحة', () => {
  assert.match(HTML, /html:not\(\.mobile-ui\) body > main\{ display: contents; \}/, 'شبكة الكمبيوتر (v-frame-c) كما هي');
  for (const o of MODES) for (const dir of ['rtl', 'ltr']) {
    const push = W(['body'], 'margin-right', Object.assign({ dir, html: ['settings-push'] }, o));
    assert.equal(val(push), '430px', o.mode + ' ' + dir + ' — الجسم لا يُزاح: ' + where(push) + ' ⇒ ' + val(push));
    assert.equal(val(W(['body'], 'margin-right', Object.assign({ dir }, o))), '0', 'مغلق: بلا إزاحة');
    assert.equal(val(W(DLG, 'width', Object.assign({ dir }, o))), '430px', 'عرض الدرج = الإزاحة');
    assert.equal(val(W(DLG, 'right', Object.assign({ dir }, o))), '0', 'الدرج على اليمين في الاتّجاهين (فالإزاحة فيزيائيّة يمينًا)');
  }
  assert.equal(val(W(['body'], 'margin-right', { mobile: true, html: ['settings-push'] })), '0', 'الجوّال بلا إزاحة');
  /* لا قاعدة إزاحة على <main> بعد اليوم: صندوقه ذائب فلا أثر لها */
  assert.doesNotMatch(bare('css/tokens.css'), /settings-push[^{]*\bmain\s*\{/, 'الإزاحة على main لا أثر لها');
});

test('٢. بلا تعتيم على الكمبيوتر (الأسود والفاتح)، والجوّال يحتفظ بتعتيمه', () => {
  for (const o of MODES) {
    const bd = W(DLG, 'background', Object.assign({ pe: 'backdrop' }, o));
    assert.equal(val(bd), 'transparent', o.mode + ' — المحادثة معتّمة خلف الدرج: ' + where(bd) + ' ⇒ ' + val(bd));
  }
  assert.equal(val(W(DLG, 'background', { mobile: true, pe: 'backdrop' })), 'rgba(0,0,0,.55)');
  /* كلّ تعتيم صريح لدرج الإعدادات محصور في الجوّال */
  const css = bare('css/tokens.css');
  for (const m of css.matchAll(/([^{}]*#settingsDialog::backdrop[^{}]*)\{([^}]*)\}/g)) {
    if (/background:\s*transparent/.test(m[2])) continue;
    assert.match(m[1].trim(), /^html\.mobile-ui #settingsDialog::backdrop$/, 'تعتيم بلا نطاق الجوّال: ' + m[1].trim());
  }
});

test('٣. ✕ ظاهر في رأس الدرج على الكمبيوتر، ومخفيّ على الجوّال والنافذة الضيّقة (v-settings-no-x-mobile)', () => {
  const X = DLG.concat(['div#settingsHomeView', 'div#settingsProfile.setProfile', 'button#setHomeClose.setHomeClose[type="button"]']);
  for (const o of MODES) for (const dir of ['rtl', 'ltr']) {
    const d = W(X, 'display', Object.assign({ dir }, o));
    assert.equal(val(d), 'flex', o.mode + ' ' + dir + ' — لا ✕ على الكمبيوتر: ' + where(d) + ' ⇒ ' + val(d));
  }
  assert.equal(val(W(X, 'display', { mobile: true })), 'none', 'الجوّال: الرجوع والسحب يكفيان');
  assert.equal(val(W(X, 'display', { vw: 800 })), 'none', 'النافذة الضيّقة كالجوّال');
});

test('٤. أزرار الإعدادات بخطّ التطبيق لا خطّ المتصفّح (صفوف «حسابي» واللغات وتصدير المشاريع)', () => {
  for (const mobile of [false, true]) for (const o of MODES) {
    for (const btn of [['div#accountSection.settingsPageSection', 'div#accountSectionContent', 'button.acctRowBtn[type="button"]'],
      ['div#langSection.settingsPageSection', 'div#langSectionContent', 'div#langListWrap', 'button#btnLangEn.langFlagBtn[type="button"]'],
      ['div#statsSection.settingsPageSection', 'div#statsSectionContent', 'div', 'button#btnExportProjects']]) {
      const f = W(DLG.concat(btn), 'font-family', Object.assign({ mobile }, o));
      assert.equal(val(f), 'inherit', (mobile ? 'جوّال ' : 'حاسوب ') + o.mode + ' ' + btn[btn.length - 1] + ' — خطّ المتصفّح: ' + where(f) + ' ⇒ ' + val(f));
    }
  }
  /* والدرج نفسه يرث خطّ التطبيق (لا عائلة خاصّة به) */
  assert.equal(W(DLG, 'font-family', {}), null);
});

test('٥. رأس الصفحة (← والعنوان) لاصق أعلى الدرج بخلفيّة الدرج نفسها، وموضع العنوان قبل التمرير كما كان (٢٦px فوق و١٤px تحت)', () => {
  const H = DLG.concat([['div#settingsPageHeader', 'display:flex; align-items:center; gap:10px; margin-top:26px; margin-bottom:14px;']]);
  const px = (w) => (w ? parseFloat(w.value) : 0);
  for (const mobile of [false, true]) for (const o of MODES) {
    const tag = (mobile ? 'جوّال ' : 'حاسوب ') + o.mode;
    const O = Object.assign({ mobile }, o);
    const pos = W(H, 'position', O);
    assert.equal(val(pos), 'sticky', tag + ' — الرأس يختفي مع التمرير: ' + where(pos) + ' ⇒ ' + val(pos));
    assert.match(val(W(H, 'top', O)), mobile ? /^env\(safe-area-inset-top, ?0px\)$/ : /^0$/, tag + ' top');
    assert.ok(Number(val(W(H, 'z-index', O))) >= 1, tag + ' فوق المحتوى');
    assert.equal(val(W(H, 'background', O)), 'inherit', tag + ' — خلفيّة الدرج نفسها (لا شريط بلون آخر)');
    const dbg = W(DLG, 'background', O);
    assert.ok(dbg && !/transparent|rgba\([^)]*,\s*0?\.\d+\)/.test(dbg.value), tag + ' — الدرج نفسه مصمت: ' + val(dbg));
    /* المسافة حول العنوان كما كانت: هامش + حشوة = ٢٦ فوق و١٤ تحت */
    assert.equal(px(W(H, 'margin-top', O)) + px(W(H, 'padding-top', O)), 26, tag + ' فوق');
    assert.equal(px(W(H, 'margin-bottom', O)) + px(W(H, 'padding-bottom', O)), 14, tag + ' تحت');
  }
});

test('٦. حقول المفاتيح والنماذج من اليسار إلى اليمين في العربيّ («sk-...» لا «...-sk»)، ومحاذاتها من البداية', () => {
  const part = rd('js/partials-settings.js');
  const at = part.indexOf('<div id="apiKeysSectionContent"');
  assert.ok(at > 0);
  /* حدود القسم بموازنة div */
  let depth = 0, end = -1;
  for (const m of part.slice(at).matchAll(/<div\b|<\/div>/g)) { depth += m[0] === '</div>' ? -1 : 1; if (!depth) { end = at + m.index; break; } }
  const sec = part.slice(at, end);
  for (const id of ['apiKey', 'modelName', 'geminiApiKey', 'groqApiKey', 'claudeApiKey', 'claudeModel', 'openrouterApiKey']) {
    const m = sec.match(new RegExp('<input type="(password|text)" id="' + id + '"'));
    assert.ok(m, id + ' داخل قسم المفاتيح');
    const field = DLG.concat(['div#apiKeysSection.settingsPageSection', 'div#apiKeysSectionContent.settingsSectionContent', 'div', 'input#' + id + '[type="' + m[1] + '"]']);
    for (const dir of ['rtl', 'ltr']) {
      const d = W(field, 'direction', { dir });
      assert.equal(val(d), 'ltr', dir + ' ' + id + ' — المثال ينقلب: ' + where(d) + ' ⇒ ' + val(d));
      assert.equal(val(W(field, 'text-align', { dir })), 'start');
    }
  }
  /* خانات الاختيار في القسم نفسه لا تُمسّ */
  assert.equal(W(DLG.concat(['div#apiKeysSectionContent', 'input#chkIncludeOpenAI[type="checkbox"]']), 'direction', {}), null);
});
