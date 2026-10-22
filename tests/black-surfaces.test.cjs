'use strict';
/* v-black-surfaces — تدقيق ١٨–١٩ أكتوبر: في الوضع الأسود صارت الحقول والأزرار والقوائم التي اعتمدت على حدّها وحده أسود على أسود بعد
   v-no-lines-2 (css/بلا-خطوط.css يحوّل كلّ om3-line إلى حدّ شبح rgba(0,0,0,.06) بأولويّة معرّفين): حقلا الدخول، زرّا الاسترداد،
   قائمة ⋮ في السجلّ، بطاقة المشاركة، «مفيد» المختار، زرّ ↓، ميكروفون الخانة وقت التسجيل، خانات المحفظة والمقاولات والتعليم،
   كلمة المرور والإيميل في الإعدادات، «اشترك الآن» وباقات النقاط، خيار «بطاقة»، منتقي محرّك الأزياء، وأزرار صفحة المالك.
   الحلّ بدرجتي المالك (#000 و#101013) لا بخطّ: js/app-41-three-colors.js يعلّم الخانة الشفّافة أو التي بلون سطحها om3-field،
   والتتالي يعطيها الدرجة المقابلة؛ وقواعد محدّدة للأسطح والأزرار. الوضع الفاتح والثيمات لا تتغيّر.
   الاختبار يحسب التتالي فعلًا (محرّك bg3d-desktop موسَّعًا): أوراق index.html بترتيبها مع <style> الأجزاء عند وسم سكربتها، والأنماط
   المضمّنة في العنصر، ويختار الفائز بـ!important ثمّ المضمّن ثمّ الأولويّة ثمّ الترتيب. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const HTML = rd('index.html');

/* ── الأوراق بترتيب الصفحة: روابط css/ المحلّيّة و<style> المضمّنة، و<style> أجزاء القوالب حيث يُدرَج سكربتها ── */
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
/* الوسائط: العرض بالبكسل، والمرور/المؤشّر بحسب الجهاز؛ ما سواها (طباعة، تقليل الحركة…) لا يطابق */
function mediaOk(list, ctx) {
  return list.every((q) => q.split(/\s*,\s*/).some((alt) => alt.replace(/^only\s+/, '').split(/\s+and\s+/).every((f) => {
    f = f.trim(); if (!f || f === 'screen' || f === 'all') return true;
    let m = f.match(/^\((min|max)-width:\s*(\d+(?:\.\d+)?)px\)$/);
    if (m) return m[1] === 'min' ? ctx.vw >= +m[2] : ctx.vw <= +m[2];
    m = f.match(/^\((hover|any-hover):\s*(none|hover)\)$/); if (m) return (m[2] === 'none') === ctx.mobile;
    m = f.match(/^\((pointer|any-pointer):\s*(coarse|fine)\)$/); if (m) return (m[2] === 'coarse') === ctx.mobile;
    return false;
  })));
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
    else return null; /* صياغة خارج النموذج: المركّب لا يطابق */
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
    if (k.t === 'pc') return k.v === 'root' ? el.tag === 'html' : false; /* حالة السكون: لا مرور ولا تركيز ولا بنية أخوة */
    if (k.v === 'not') return !splitTop(k.arg, ',').some((c) => matchCompound(c, el, null));
    if (k.v === 'is' || k.v === 'where') return splitTop(k.arg, ',').some((c) => matchCompound(c, el, null));
    return false; /* :has و:nth-child و:dir… */
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
const FAMILY = {
  bg: ['background', 'background-color'],
  border: ['border', 'border-color', 'border-top', 'border-top-color'],
};
const declsOf = (body) => splitTop(body, ';').map((d) => d.match(/^([\w-]+)\s*:\s*([\s\S]*)$/)).filter(Boolean)
  .map((d) => ({ prop: d[1].toLowerCase(), important: /!\s*important\s*$/.test(d[2]), value: d[2].replace(/\s*!\s*important\s*$/, '').trim() }));
/* الفائز لخاصيّة (أو عائلة خلفيّة/حدّ) على آخر عنصر في السلسلة: !important، ثمّ المضمّن، ثمّ الأولويّة، ثمّ الترتيب */
function winner(chain, prop, ctx, pe) {
  const props = FAMILY[prop] || [prop];
  const el = chain[chain.length - 1];
  let best = null;
  const consider = (cand) => {
    if (!best) { best = cand; return; }
    if (cand.important !== best.important) { if (cand.important) best = cand; return; }
    if (cand.inline !== best.inline) { if (cand.important ? !cand.inline : cand.inline) best = cand; return; }
    if ((cmp(cand.sp, best.sp) || cand.order - best.order) >= 0) best = cand;
  };
  for (const r of ALL) {
    const decls = declsOf(r.body).filter((d) => props.includes(d.prop));
    if (!decls.length || !mediaOk(r.media, ctx)) continue;
    const hits = splitTop(r.sel, ',').filter((s) => { const p = complexParts(s); return matchComplex(p, p.length - 1, chain, chain.length - 1, pe); });
    if (!hits.length) continue;
    const sp = hits.map(specComplex).sort(cmp).pop();
    for (const d of decls) consider({ important: d.important, inline: false, sp, order: r.order, value: d.value, where: r.sheet + ' :: ' + r.sel.slice(0, 160) });
  }
  if (!pe && el.style) for (const d of declsOf(el.style).filter((x) => props.includes(x.prop))) consider({ important: d.important, inline: true, sp: [9, 9, 9], order: 1e9, value: d.value, where: 'inline style' });
  return best;
}
/* عنصر من وصف مختصر: tag#id.cls.cls[a=b][c] ونمطه المضمّن */
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
const MODES = {
  dark: { attrs: {}, cls: [] },
  light: { attrs: { 'data-mode': 'light' }, cls: [] },
  skin: { attrs: {}, cls: ['skin'] },
};
function chainOf(mode, mobile, descs) {
  const md = MODES[mode];
  const html = { tag: 'html', id: '', cls: new Set(['cv-ok', 'has-user-av'].concat(md.cls, mobile ? ['mobile-ui'] : [])), attrs: Object.assign({ dir: 'rtl', lang: 'ar' }, md.attrs), style: '' };
  const body = E('body.omranWelcome');
  return [html, body].concat(descs.map((d) => (Array.isArray(d) ? E(d[0], d[1]) : E(d))));
}
const W = (mode, descs, prop, opts) => { const o = opts || {}; const mobile = !!o.mobile; return winner(chainOf(mode, mobile, descs), prop, { vw: mobile ? 400 : 1280, mobile }, o.pe); };
const val = (w) => (w ? w.value.replace(/\s+/g, ' ') : '(none)');
const GHOST = 'rgba(0,0,0,.06)';

/* السلاسل الحقيقيّة كما قرأها مسبار Playwright من الصفحة (الأصناف بعد تصنيف app-41، ومعها om3-field الجديد) */
const SD = 'dialog#settingsDialog.om3-line[open]';
const ACCT = [SD, 'div#accountSection.settingsPageSection.settingsPageActive', 'div#accountSectionContent.settingsSectionContent', 'div', 'div'];
const PASS = ACCT.concat(['div#acctRowPass', 'div', ['input#acctNewPassword.om3-line.om3-hot.om3-field[type="password"]', 'flex:1;']]);
const PASS_CUR = ACCT.concat(['div#acctRowPass', 'input#acctCurrentPassword.om3-line.om3-hot.om3-field[type="password"]']);
const EMAIL = ACCT.concat(['div#acctRowEmail', 'div', ['input#acctEmail.om3-line.om3-hot.om3-field[type="email"]', 'flex:1; direction:ltr;']]);
const CX = ['div#constructionModal.om3-fill', 'div.om3-fill', 'div#cxStart.cx-sec.om3-line', 'div#cxStartQuick', 'div', 'div', ['input#constructionFloors.om3-line.om3-hot.om3-fill.om3-field[type="number"]', 'width:100%;']];
const AUTH_IN = ['div#authOverlay', 'div', 'form#authForm', ['input#authUsername.om3-field[type="text"]', 'height:50px; padding:0 14px; border-radius:14px; border:1px solid var(--border,#3a3a3a); background:transparent; font-size:15px; width:100%; box-sizing:border-box; margin-bottom:12px;']];
const RECOVER = ['div#authOverlay', 'div', 'form#authForm', 'div#authPhoneRecover', 'div', ['button.btn.om3-line.om3-hot[type="button"][data-phone-link="whatsapp"][data-recover="1"]', 'flex:1; justify-content:center; text-align:center;']];
const PRICE = [SD, 'div#pricingSection.settingsPageSection.settingsPageActive', 'div#pricingSectionContent.settingsSectionContent', 'div.priceTab', 'div.planGrid'];
const OWNER = [SD, 'div#ownerSection.settingsPageSection.settingsPageActive', 'div#ownerSectionContent.settingsSectionContent'];
const OWNER_BTN = 'padding:8px 14px; border-radius:var(--r-2); border:1px solid var(--accent); background:var(--panel2); color:var(--text); font-size:13px; cursor:pointer; margin-bottom:10px;';

test('١. حقول الإعدادات (كلمة المرور الحاليّة والجديدة والإيميل): في الأسود #101013 والحدّ يبقى شبحًا، والفاتح والثيمات كما هي', () => {
  for (const chain of [PASS, PASS_CUR, EMAIL]) {
    const name = chain[chain.length - 1];
    const d = W('dark', chain, 'bg');
    assert.equal(val(d), '#101013', name + ' — الحقل أسود على أسود: ' + d.where + ' ⇒ ' + val(d));
    assert.equal(val(W('dark', chain, 'border')), GHOST, 'لا خطّ يعود (v-no-lines-2)');
    assert.equal(val(W('dark', chain, 'bg', { mobile: true })), '#101013', 'الجوّال: الدرج نفسه');
    assert.equal(val(W('light', chain, 'bg')), 'var(--panel2)', 'الفاتح لم يُلمس');
    assert.equal(val(W('skin', chain, 'bg')), 'var(--panel2)', 'الثيمات لم تُلمس');
  }
});

test('٢. خانات الأدوات: الأدوار في المقاولات #101013 (تغلب #constructionModal input …!important)، وداخل تعبئة واحدة #000، وتحتها #101013', () => {
  const d = W('dark', CX, 'bg');
  assert.equal(val(d), '#101013', 'الأدوار: ' + d.where + ' ⇒ ' + val(d));
  assert.equal(val(W('dark', CX, 'border')), GHOST);
  assert.match(val(W('light', CX, 'bg')), /^var\(--panel2/, 'الفاتح كما كان');
  /* التناوب مرآة أدوات-أسود.css: خانة تحت تعبئة واحدة (#101013) تأخذ #000، وتحت تعبئتين (#000) تأخذ #101013 */
  assert.equal(val(W('dark', ['div#stocksModal', 'div.om3-fill', ['input.om3-line.om3-field', 'background:transparent;']], 'bg')), '#000');
  assert.equal(val(W('dark', ['div#stocksModal.om3-fill', 'div#stocksPage.om3-fill', 'div#stockPfWrap', 'div', 'div', ['input#pfSym.om3-field', 'flex:2;min-width:110px;padding:9px;border-radius:9px;border:1px solid var(--border,#444);background:transparent;color:inherit;font:inherit;text-transform:uppercase;']], 'bg')), '#101013', 'خانة الرمز في المحفظة');
  const eduFld = 'width:100%;box-sizing:border-box;padding:11px;border-radius:var(--r-2);border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit;font:inherit;font-size:var(--fs-3);';
  for (const t of ['input#eduCurSubject.om3-line.om3-hot.om3-field', 'select#eduCurStage.om3-line.om3-hot.om3-field']) {
    assert.equal(val(W('dark', ['div#eduHubModal.om3-fill.open', 'div.eduWrap.om3-fill', 'div#eduBody.eduBody', [t, eduFld]], 'bg')), '#101013', t);
    assert.equal(val(W('light', ['div#eduHubModal.om3-fill.open', 'div.eduWrap.om3-fill', 'div#eduBody.eduBody', [t, eduFld]], 'bg')), 'transparent', 'الفاتح كما كان');
  }
});

test('٣. شاشة الدخول: حقل الاسم وزرّا «واتساب/تيليجرام» بتعبئة ظاهرة في الأسود، والفاتح كما هو', () => {
  assert.equal(val(W('dark', AUTH_IN, 'bg')), '#101013', 'حقل الاسم');
  assert.equal(val(W('light', AUTH_IN, 'bg')), 'transparent');
  const r = W('dark', RECOVER, 'bg');
  assert.equal(val(r), '#101013', 'زرّ الاسترداد يبدو كلمة: ' + r.where + ' ⇒ ' + val(r));
  assert.equal(val(W('dark', RECOVER, 'border-radius')), '999px', 'كبسولة كزرّ جوجل بجانبه');
  assert.notEqual(val(W('light', RECOVER, 'bg')), '#101013');
});

test('٤. قائمة ⋮ في السجلّ وبطاقة المشاركة وزرّ ↓: الدرجة الثانية في الأسود، والفاتح كما هو', () => {
  const menu = ['div#histItemMenu.show.om3-line'];
  assert.equal(val(W('dark', menu, 'bg')), '#101013');
  assert.equal(val(W('dark', menu, 'bg', { mobile: true })), '#101013');
  assert.notEqual(val(W('light', menu, 'bg')), '#101013');
  const share = [['div#shareModal', 'position:fixed; inset:0; z-index:10000; background:rgba(0,0,0,0.7); display:none;'], ['div', 'max-width:440px; width:100%; background:var(--panel,#1a1a1a); border-radius:var(--r-4); padding:26px; box-shadow:var(--sh-3);']];
  assert.equal(val(W('dark', share, 'bg')), '#101013');
  assert.equal(val(W('light', share, 'bg')), 'var(--panel,#1a1a1a)');
  const jump = ['main', 'div#chatcol', 'button#chatJumpBottom.om3-line.om3-hot.visible[type="button"]'];
  const j = W('dark', jump, 'bg');
  assert.equal(val(j), '#101013', 'زرّ ↓: ' + j.where + ' ⇒ ' + val(j));
  assert.match(val(W('dark', jump, 'box-shadow')), /rgba\(255,255,255,\.35\)/, 'توهّج «فسّر» الأبيض');
  assert.equal(val(W('dark', jump, 'border')), GHOST, 'بلا حدّ');
  assert.equal(val(W('light', jump, 'bg')), 'var(--panel)');
});

test('٥. «مفيد» المختار في قائمة المزيد: علامة ✓ في كلّ الأوضاع، و#101013 في الأسود — وغير المختار بلا علامة', () => {
  const on = ['div.msgMoreMenu.msgReplyMoreMenu.om3-line', 'button.msgMoreActive[type="button"][role="menuitemcheckbox"][aria-checked="true"]'];
  const off = ['div.msgMoreMenu.msgReplyMoreMenu.om3-line', 'button[type="button"][role="menuitemcheckbox"][aria-checked="false"]'];
  for (const mode of ['dark', 'light', 'skin']) assert.match(val(W(mode, on, 'content', { pe: 'after' })), /^["']✓["']$/, mode);
  assert.equal(W('dark', off, 'content', { pe: 'after' }), null);
  assert.equal(val(W('dark', on, 'bg')), '#101013');
  assert.notEqual(val(W('dark', off, 'bg')), '#101013');
  assert.equal(val(W('light', on, 'bg')), 'var(--panel2)', 'الفاتح كما كان');
});

test('٦. ميكروفون الخانة وقت التسجيل: حدّ ذهبيّ ومسحة ذهبيّة في الأسود تغلب الحدّ الشبح وتعبئة الأدوات', () => {
  for (const host of [['div#fashionAiModal.om3-fill', 'div.om3-line.om3-fill', 'div#fashionAiTextPane', 'div.mini-mic-field-row'], ['div#religionModal.om3-fill', 'div.om3-fill', 'div', 'div.mini-mic-field-row']]) {
    const rec = host.concat(['button.mini-mic-btn.om3-line.om3-hot.om3-fill.recording[type="button"]']);
    const b = W('dark', rec, 'border');
    assert.equal(val(b), '#d4af37', host[0] + ' — حدّ التسجيل يغلبه الشبح: ' + b.where + ' ⇒ ' + val(b));
    assert.equal(val(W('dark', rec, 'bg')), 'rgba(212,175,55,.22)');
    assert.equal(val(W('dark', host.concat(['button.mini-mic-btn.om3-line.om3-hot.om3-fill[type="button"]']), 'border')), GHOST, 'بلا تسجيل: بلا خطّ');
  }
  assert.equal(val(W('light', ['div#religionModal', 'div', 'button.mini-mic-btn.recording'], 'border')), '#d4af37', 'الفاتح كما كان (tokens.css)');
});

test('٧. الخطط: البطاقات #101013 و«اشترك الآن» #000 فوقها، والذهبيّ كما هو، وباقات النقاط ظاهرة — لون فقط', () => {
  const card = PRICE.concat(['div.pcard.om3-line']);
  assert.equal(val(W('dark', card, 'bg')), '#101013');
  assert.equal(val(W('dark', card.concat(['button.pbtn.om3-line.om3-hot[type="button"][onclick="openCheckout(\'basic\')"]']), 'bg')), '#000');
  assert.equal(val(W('dark', card.concat(['button.pbtn.primary.om3-line.om3-hot[type="button"]']), 'bg')), '#c9a227', 'الذهبيّ باقٍ');
  assert.equal(val(W('dark', card.concat(['button.pbtn.ghost.om3-line.om3-hot[type="button"]']), 'bg')), 'transparent', '«باقتك الحالية» المعطّل كما هو');
  const pack = [SD, 'div#pricingSection.settingsPageSection.settingsPageActive', 'div#pricingSectionContent.settingsSectionContent', 'div.priceTab', 'div', ['button.btn.pointsPackBtn[type="button"][onclick="buyPointsPack(100)"]', 'padding:10px 8px; border-radius:var(--r-2); background:var(--panel2); border:none; cursor:pointer; text-align:center;']];
  assert.equal(val(W('dark', pack, 'bg')), '#101013');
  assert.equal(val(W('light', card, 'bg')), 'var(--panel2)');
  assert.equal(val(W('light', pack, 'bg')), 'var(--panel2)');
});

test('٨. نافذة الدفع: خيار «بطاقة» #101013 في الأسود (الحدّ شبح كما هو)، والفاتح كما هو', () => {
  const card = ['div#checkoutModalOverlay', 'div', 'div', ['button.om3-line.om3-hot[type="button"][onclick="startStripeCheckout()"]', 'display:flex; align-items:center; gap:10px; padding:12px 14px; border-radius:10px; border:2px solid #c9a227; background:var(--panel2); cursor:pointer; font-size: var(--fs-3); color:var(--text); font-weight:600;']];
  assert.equal(val(W('dark', card, 'bg')), '#101013');
  assert.equal(val(W('dark', card, 'border')), GHOST);
  assert.equal(val(W('light', card, 'bg')), 'var(--panel2)');
});

test('٩. صفحة المالك: الأزرار الثابتة #101013 بارتفاع 34px، والحذف والمسح نصّهما أحمر، وخطّ v202 كما قرّره المالك؛ أزرار الجداول لا تُمسّ', () => {
  const refresh = OWNER.concat(['div#adminSectionWrap.ownerCard.om3-line', 'div#adminSectionContent', ['button#adminStatsRefreshBtn.om3-line.om3-hot[type="button"]', OWNER_BTN]]);
  const clear = OWNER.concat(['div#adminSectionWrap.ownerCard.om3-line', 'div#adminSectionContent', 'div', ['button#adminHealthClearBtn.om3-line.om3-hot[type="button"]', 'flex:1; padding:8px 10px; border-radius:var(--r-2); border:1px solid var(--accent); background:var(--panel2); color:var(--text); font-size:12px; cursor:pointer;']]);
  const vclear = OWNER.concat(['div#vaultSectionWrap.ownerCard.om3-line', 'div#vaultSectionContent', 'div', ['button.om3-line.om3-hot[type="button"][onclick="vaultClear(\'github_token\')"]', 'padding:8px 14px; border-radius:var(--r-2); border:1px solid var(--border); background:var(--panel2); color:var(--text); font-size:12px; cursor:pointer;']]);
  for (const b of [refresh, clear, vclear]) {
    const w = W('dark', b, 'bg');
    assert.equal(val(w), '#101013', 'زرّ المالك نصّ عائم: ' + w.where + ' ⇒ ' + val(w));
    assert.equal(val(W('dark', b, 'min-height')), '34px');
    assert.equal(val(W('light', b, 'bg')), 'var(--panel2)', 'الفاتح كما كان');
  }
  assert.equal(val(W('dark', refresh, 'font-size')), 'var(--fs-5)', 'v202 (المالك): «خط أصغر» للوحة التحكّم باقٍ');
  for (const b of [clear, vclear]) assert.equal(val(W('dark', b, 'color')), '#ff6b6b', 'الحذف والمسح أحمر');
  assert.equal(val(W('dark', refresh, 'color')), 'var(--text)');
  const row = OWNER.concat(['div#adminSectionWrap.ownerCard.om3-line', 'div#adminSectionContent', 'div#adminUsersTable', 'div', ['button[type="button"]', 'background:none;border:1px solid #a33;color:#e66;border-radius:6px;padding:4px 8px;cursor:pointer']]);
  assert.equal(val(W('dark', row, 'bg')), 'none', 'أزرار جدول المستخدمين كما هي');
  assert.equal(val(W('dark', row, 'min-height')), '(none)');
});

test('١٠. منتقي محرّك الأزياء: ارتفاع 40px وحشوة وزوايا كـ«dialog select» (النافذة div لا dialog) على الحاسوب والجوّال', () => {
  const sel = ['div#fashionAiModal.om3-fill', 'div.om3-line.om3-fill', 'div#fxCustom.om3-line', 'div', ['select#fashionAiEngine.om3-line.om3-hot.om3-fill.om3-field', 'width:100%;']];
  for (const mobile of [false, true]) {
    const h = W('dark', sel, 'min-height', { mobile });
    assert.ok(h && parseFloat(h.value) >= 40, 'رفيع 19px: ' + val(h));
    assert.match(val(W('dark', sel, 'padding', { mobile })), /^8px 12px$/);
    assert.match(val(W('dark', sel, 'border-radius', { mobile })), /var\(--r-2\)/);
  }
  assert.equal(val(W('dark', sel, 'bg')), '#101013', 'في الأسود تعبئة الحقول (تحت تعبئتين)');
  assert.equal(val(W('light', sel, 'bg')), 'var(--panel2)', 'الفاتح بلوحته');
});

/* ── المصنّف نفسه في vm: om3-field للخانة الشفّافة أو التي بلون سطحها أو بدرجتنا الداكنة، في الأدوات والإعدادات والدخول والدفع وحدها ── */
const SRC = rd('js/app-41-three-colors.js');
function loadMark() {
  const body = SRC.slice(SRC.indexOf("'use strict';") + 13, SRC.indexOf('/* طابور عناصر'));
  const sb = { getComputedStyle: (e) => e._cs };
  vm.runInNewContext(body + '\nthis.mark = mark;', sb);
  return sb.mark;
}
function fakeEl(tag, opts) {
  const o = opts || {};
  const cls = new Set(o.cls || []);
  const el = {
    nodeType: 1, tagName: tag, type: o.type || (tag === 'INPUT' ? 'text' : ''), parentElement: o.parent || null, _scope: o.scope || null,
    classList: { add: (...a) => a.forEach((c) => cls.add(c)), remove: (...a) => a.forEach((c) => cls.delete(c)), contains: (c) => cls.has(c) },
    _cls: cls,
    _cs: Object.assign({ animationName: 'none', backgroundImage: 'none', backgroundColor: 'rgba(0, 0, 0, 0)', cursor: 'auto', position: 'static' },
      ...['Top', 'Right', 'Bottom', 'Left'].map((s) => ({ ['border' + s + 'Width']: '1px', ['border' + s + 'Style']: 'solid', ['border' + s + 'Color']: 'rgba(0, 0, 0, 0.06)' })), o.cs || {}),
    closest(sel) { if (sel === '.om3-skip') return null; for (let p = this; p; p = p.parentElement) if (p._scope && sel.split(',').includes(p._scope)) return p; return null; },
    firstElementChild: null,
  };
  return el;
}
test('١١. app-41 mark(): الخانة الشفّافة أو بلون سطحها أو بدرجتنا تأخذ om3-field في نطاقها، ولا تأخذه الاختيارات ولا الملوّنة ولا ما خارج النطاق', () => {
  const mark = loadMark();
  const dlg = fakeEl('DIALOG', { scope: '#settingsDialog', cs: { backgroundColor: 'rgb(0, 0, 0)' } });
  const row = fakeEl('DIV', { parent: dlg });
  const has = (el) => el._cls.has('om3-field');
  const run = (el, inTool) => { mark(el, !!inTool); return has(el); };
  assert.ok(run(fakeEl('INPUT', { parent: row, cs: { backgroundColor: 'rgb(0, 0, 0)' } })), 'بلون السطح (#000 فوق درج #000)');
  assert.ok(run(fakeEl('INPUT', { parent: row, type: 'password' })), 'شفّافة');
  assert.ok(run(fakeEl('SELECT', { parent: row, cs: { backgroundColor: 'rgb(16, 16, 19)' } })), 'بدرجتنا #101013 (تُقرأ هكذا عند إعادة التصنيف فلا يومض)');
  assert.ok(run(fakeEl('TEXTAREA', { parent: row })), 'textarea');
  for (const t of ['checkbox', 'radio', 'range', 'file', 'color', 'hidden', 'button', 'submit']) assert.ok(!run(fakeEl('INPUT', { parent: row, type: t })), t);
  assert.ok(!run(fakeEl('INPUT', { parent: row, cs: { backgroundColor: 'rgb(255, 255, 255)' } })), 'خانة بيضاء ظاهرة لا تُمسّ');
  assert.ok(!run(fakeEl('INPUT', { parent: row, cs: { backgroundColor: 'rgb(46, 158, 107)' } })), 'ملوّنة');
  assert.ok(!run(fakeEl('BUTTON', { parent: row })), 'زرّ');
  const out = fakeEl('DIV', { cs: { backgroundColor: 'rgb(0, 0, 0)' } });
  assert.ok(!run(fakeEl('TEXTAREA', { parent: out })), 'خارج النطاق (صندوق الكتابة) لا يُمسّ');
  for (const scope of ['#authOverlay', '#checkoutModalOverlay']) assert.ok(run(fakeEl('INPUT', { parent: fakeEl('DIV', { scope }) })), scope);
  const tool = fakeEl('DIV', { scope: '#stocksModal', cs: { backgroundColor: 'rgb(0, 0, 0)' } });
  assert.ok(run(fakeEl('INPUT', { parent: tool }), true), 'داخل أداة');
  /* إعادة التصنيف تنزع الصنف أوّلًا ثمّ تقرّره من جديد */
  const x = fakeEl('INPUT', { parent: row, cls: ['om3-field'], cs: { backgroundColor: 'rgb(255, 255, 255)' } });
  assert.ok(!run(x), 'يُنزع حين لا ينطبق');
});

test('١٢. القواعد للوضع الأسود وحده، ودرجتا المالك فقط، وbackground-color للحقل فيبقى سهم القائمة المنسدلة', () => {
  const css = rd('css/بلا-خطوط.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const field = css.match(/[^{}]*\.om3-field[^{}]*\{[^}]*\}/g) || [];
  assert.equal(field.length, 3, 'ثلاث قواعد تناوب');
  for (const r of field) {
    assert.ok(r.trim().startsWith('html:not([data-mode="light"]):not(.skin):not(.skin-wood):not(.bgimg) '), r);
    assert.match(r, /\.om3-field:not\(#om3-a#om3-b\)\{background-color:(#101013|#000) !important;\}/, r);
  }
  assert.ok(SRC.includes("el.classList.remove('om3-line', 'om3-fill', 'om3-hot', 'om3-field')"), 'mark ينزع om3-field قبل القراءة');
});
