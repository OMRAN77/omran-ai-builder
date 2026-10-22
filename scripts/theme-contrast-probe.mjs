#!/usr/bin/env node
// scripts/theme-contrast-probe.mjs — مسبار التباين الحقيقيّ (v-theme-contrast، أمر المالك ٢١ أكتوبر: «ألوان الخطوط والحدود والفواصل
// والأيقونات والأزرار لازم تتناسق مع كل ثيم وكل خلفية… تباين الكلام مع الخلفية ما يقل عن 4.5:1»).
// يحمّل التطبيق محلّيًّا (خادم ملفّات، /api/* = {}) ويقيس كلّ نصّ وخانة وأيقونة ظاهرة في كلّ ثيم ووضع (فاتح/داكن) وخلفيّة وشاشة:
// لون النصّ المحسوب (مع شفافيّته وشفافيّة آبائه) على بكسلات خلفيّته الفعليّة من لقطة ثانية تُخفى فيها النصوص والأيقونات —
// فالصور والتدرّجات والزجاج والخلفيّات الثلاثيّة محسوبة كما تُرسم. النسبة المعتمدة p10 (٩٠٪ من مساحة النصّ على الأقلّ)،
// والحدّ ٤٫٥ للنصّ و٣ للأيقونة والرمز. ويسجّل الألوان المشبعة (نصّ، أيقونة، حدّ، فاصل) الغريبة عن لوحة الثيم.
//
//   node scripts/theme-contrast-probe.mjs --out <مجلّد> --pw <playwright-core> [--set themes|base|bg3d|bgimg]
//        [--vp desktop|mobile|both] [--only sunset,beach] [--modes dark,light] [--screens chat,video] [--shots] [--dump] [--gl]
// الناتج: results-<set>[-<vp>].jsonl (لكلّ حالة: fails وforeign، ومع --dump كلّ ما قيس) و--shots لقطة كلّ حالة.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : d; };
// --root: نسخة أخرى من المستودع (لقياس «قبل» من main بينما يتغيّر الفرع)
const ROOT = path.resolve(String(opt('root', path.join(path.dirname(fileURLToPath(import.meta.url)), '..'))));
const OUT = path.resolve(String(opt('out', path.join(ROOT, '.shots', 'contrast'))));
const SET = String(opt('set', 'themes'));
const VPS = String(opt('vp', 'both')) === 'both' ? ['desktop', 'mobile'] : [String(opt('vp'))];
const ONLY = opt('only', '') ? String(opt('only')).split(',') : null;
const SCREENS_ONLY = opt('screens', '') ? String(opt('screens')).split(',') : null;
const SHOTS = !!opt('shots', false);
const DUMP = !!opt('dump', false);
const CHAINS = !!opt('chains', false);
const MODES = opt('modes', '') ? String(opt('modes')).split(',') : ['dark', 'light'];
const req = createRequire(import.meta.url); // pngjs من المستودع الذي فيه السكربت (نسخة --root قد تكون بلا node_modules)
const { PNG } = req('pngjs');

async function loadPlaywright() {
  const explicit = opt('pw', '');
  const cands = explicit ? [String(explicit)] : ['playwright', 'playwright-core'];
  const rq = createRequire(import.meta.url);
  for (const c of cands) { try { return await import(pathToFileURL(rq.resolve(c)).href); } catch (e) { /* التالي */ } }
  throw new Error('playwright غير موجود — مرّر --pw مسار playwright-core');
}
const pw = await loadPlaywright();
const chromium = pw.chromium || (pw.default && pw.default.chromium);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.mp4': 'video/mp4', '.webm': 'video/webm' };
const srv = http.createServer((rq, res) => {
  let p = decodeURIComponent(new URL(rq.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  if (p.startsWith('/api/')) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{}'); return; }
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + srv.address().port;

// ── الحالات: الثيمات الـ٢٤ (الخشبيّ والثلاثة عشر والعشرة)، والوضعان بلا خلفيّة، والخلفيّات الثلاثيّة، وخلفيّات الشاشة ──
const THEMES = ['خشبي', 'خشب-داكن', 'رخام', 'برمجة', 'مركبات', 'أطفال', 'طهي', 'غروب', 'شاطئ', 'شتاء', 'كراج', 'أنمي', 'أمن-سيبراني', 'فصل',
  'أنمي-قتالي', 'ملاك', 'أنمي-نيون', 'محطّة', 'سباق', 'دخان', 'مكتبة', 'مقهى', 'ورشة', 'عصري'];
const BG3D = ['galaxy', 'net', 'waves', 'fog', 'globe', 'rings', 'halo', 'dots', 'birds', 'clouds', 'clouds2', 'trunk', 'topology', 'cells', 'ocean', 'bubbles', 'stars', 'snow', 'rain', 'fireflies'];
const configs = [];
for (const mode of MODES) {
  if (SET === 'base' || SET === 'all') configs.push({ id: 'base-' + mode, mode });
  if (SET === 'themes' || SET === 'all') for (const t of THEMES) configs.push({ mode, theme: t });
  if (SET === 'bg3d' || SET === 'all') for (const b of BG3D) if (!ONLY || ONLY.includes(b)) configs.push({ id: '3d-' + b + '-' + mode, mode, bg3d: b });
  if (SET === 'bgimg' || SET === 'all') {
    const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'خلفيات', 'فهرس.json'), 'utf8')).صور;
    for (const e of idx) if (!ONLY || ONLY.includes(e.ملف)) configs.push({ id: 'img-' + e.ملف.replace(/\.jpg$/, '') + '-' + mode, mode, bgimg: e });
  }
}
const SCREEN_LIST = (SET === 'bgimg' ? ['welcome', 'chat', 'sidebar'] : SET === 'bg3d' ? ['welcome', 'chat', 'sidebar', 'tools'] : ['welcome', 'chat', 'sidebar', 'tools', 'plus', 'menu', 'settings', 'settings-bg', 'settings-acct', 'video', 'tabsmenu', 'histmenu', 'msgmenu', 'modelmenu'])
  .filter((s) => !SCREENS_ONLY || SCREENS_ONLY.includes(s));

// ── القياس داخل الصفحة ──
const PAGE_MEASURE = () => {
  const vw = innerWidth, vh = innerHeight;
  const P = (s) => { const m = String(s || '').match(/rgba?\(([^)]+)\)/); if (!m) return null; const a = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [a[0], a[1], a[2], a.length > 3 ? a[3] : 1]; };
  const sel = (el) => { const s = []; let e = el; for (let i = 0; e && e.nodeType === 1 && i < 4; i++) { let p = e.tagName.toLowerCase(); if (e.id) { s.unshift(p + '#' + e.id); break; } const c = [...e.classList].filter((x) => !/^(active|show|open|hover|focus)$/.test(x)).slice(0, 2); if (c.length) p += '.' + c.join('.'); s.unshift(p); e = e.parentElement; } return s.join('>'); };
  const chainOf = (el) => { const out = []; for (let e = el; e && e.nodeType === 1 && e.tagName !== 'HTML'; e = e.parentElement) { let p = e.tagName.toLowerCase(); if (e.id) p += '#' + e.id; const c = [...e.classList]; if (c.length) p += '.' + c.join('.'); out.unshift(p); } return out; };
  const op = (el) => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const v = parseFloat(getComputedStyle(e).opacity); if (!isNaN(v)) o *= v; } return o; };
  const clip = (r) => { const x0 = Math.max(0, r.left), y0 = Math.max(0, r.top), x1 = Math.min(vw, r.right), y1 = Math.min(vh, r.bottom); return (x1 - x0 > 1.5 && y1 - y0 > 3) ? [x0, y0, x1, y1] : null; };
  // ظاهر = أوّل ما يُرسم فوق مركزه هو العنصر أو قريبه؛ الطبقات الشفّافة تمامًا (بلا لون ولا صورة) لا تحجب
  const seen = (el, rc) => {
    const x = (rc[0] + rc[2]) / 2, y = (rc[1] + rc[3]) / 2;
    for (const h of document.elementsFromPoint(x, y)) {
      if (h === el || el.contains(h) || h.contains(el)) return true;
      const cs = getComputedStyle(h); const bg = P(cs.backgroundColor);
      if (((!bg || bg[3] < 0.05) && cs.backgroundImage === 'none' && !/^(IMG|VIDEO|CANVAS)$/.test(h.tagName)) || parseFloat(cs.opacity) < 0.05 || cs.visibility !== 'visible') continue;
      return false;
    }
    return false;
  };
  const vis = (el) => { try { return el.checkVisibility({ opacityProperty: true, visibilityProperty: true }); } catch (e) { return true; } };
  const texts = [], icons = [], lines = [];
  const by = new Map();
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = tw.nextNode())) {
    const t = n.nodeValue; if (!t || !t.trim()) continue;
    const el = n.parentElement; if (!el || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|OPTION|TEXTAREA|TITLE)$/.test(el.tagName)) continue;
    const r = document.createRange(); r.selectNodeContents(n);
    const rects = [...r.getClientRects()].map(clip).filter(Boolean);
    if (!rects.length) continue;
    let rec = by.get(el); if (!rec) { rec = { el, rects: [], text: '' }; by.set(el, rec); }
    rec.rects.push(...rects); rec.text += t.trim() + ' ';
  }
  for (const rec of by.values()) {
    const el = rec.el; if (!vis(el)) continue;
    const rects = rec.rects.filter((rc) => seen(el, rc)); if (!rects.length) continue;
    const cs = getComputedStyle(el);
    const fill = P(cs.webkitTextFillColor), col = P(cs.color);
    const c = fill && (cs.webkitTextFillColor !== cs.color) ? fill : col;
    const txt = rec.text.trim().slice(0, 40);
    const isText = /[\p{L}\p{N}]/u.test(txt);
    if (!isText && /\p{Extended_Pictographic}/u.test(txt)) continue; // إيموجي ملوّن — لا لون نصّ له
    texts.push({ sel: sel(el), chain: chainOf(el), text: txt, c, op: op(el), sh: cs.textShadow !== 'none', grad: !c || c[3] === 0, kind: isText ? 'text' : 'sym', rects });
  }
  document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]):not([type=submit]):not([type=button]), textarea, select').forEach((el) => {
    if (!vis(el)) return; const b = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    const pl = parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth), pr = parseFloat(cs.paddingRight) + parseFloat(cs.borderRightWidth);
    const rc = clip({ left: b.left + pl, right: b.right - pr, top: b.top + parseFloat(cs.borderTopWidth) + 2, bottom: b.bottom - parseFloat(cs.borderBottomWidth) - 2 }); if (!rc || !seen(el, rc)) return;
    const hasVal = el.tagName === 'SELECT' || !!el.value;
    const cc = hasVal ? cs.color : getComputedStyle(el, '::placeholder').color;
    const txt = hasVal ? (el.tagName === 'SELECT' ? (el.selectedOptions[0] || {}).text || '' : el.value) : (el.placeholder || '');
    if (!String(txt).trim()) return;
    texts.push({ chain: chainOf(el), sel: sel(el) + (hasVal ? '' : '::placeholder'), text: String(txt).slice(0, 40), c: P(cc), op: op(el), sh: false, grad: false, kind: 'field', rects: [rc] });
  });
  let k = 0;
  document.querySelectorAll('svg').forEach((sv) => {
    if (sv.parentElement && sv.parentElement.closest('svg')) return;
    const b = sv.getBoundingClientRect(); if (b.width < 8 || b.height < 8 || b.width > 72 || b.height > 72) return;
    if (!vis(sv) || sv.closest('.bgImgGrid, #bg3dGrid')) return; const rc = clip(b); if (!rc || !seen(sv, rc)) return;
    const shape = sv.querySelector('path,circle,rect,line,polyline,polygon,ellipse'); if (!shape) return;
    const s = getComputedStyle(shape); let c = P(s.stroke);
    if (!c || s.stroke === 'none' || c[3] === 0 || !(parseFloat(s.strokeWidth) > 0)) c = P(s.fill);
    if (!c || c[3] === 0) return;
    sv.setAttribute('data-cxh', String(k++));
    icons.push({ chain: chainOf(sv), sel: sel(sv.parentElement) + '>svg', text: (sv.parentElement.getAttribute('title') || sv.parentElement.getAttribute('aria-label') || '').slice(0, 30), c, op: op(sv), kind: 'icon', rects: [rc] });
  });
  // الحدود والفواصل الظاهرة: لونها فقط (التناسق مع لوحة الثيم)
  let cnt = 0;
  for (const el of document.querySelectorAll('body *')) {
    if (cnt > 1500) break;
    const b = el.getBoundingClientRect(); if (b.width < 6 || b.height < 1 || b.bottom < 0 || b.top > vh || b.right < 0 || b.left > vw) continue;
    const cs = getComputedStyle(el);
    const sides = [];
    for (const sd of ['Top', 'Right', 'Bottom', 'Left']) { const w = parseFloat(cs['border' + sd + 'Width']); const st = cs['border' + sd + 'Style']; if (w >= 1 && st !== 'none' && st !== 'hidden') { const c = P(cs['border' + sd + 'Color']); if (c && c[3] >= 0.2) sides.push(c); } }
    let divider = null;
    if ((b.height <= 2.5 && b.width >= 20) || (b.width <= 2.5 && b.height >= 20)) { const c = P(cs.backgroundColor); if (c && c[3] >= 0.2) divider = c; }
    if (!sides.length && !divider) continue;
    if (!vis(el)) continue;
    const rc = clip(b); if (!rc) continue;
    const probeRc = [Math.max(0, b.left), Math.max(0, b.top), Math.min(vw, b.left + 2), Math.min(vh, b.bottom)];
    if (probeRc[2] - probeRc[0] < 1 || !seen(el, probeRc)) continue;
    cnt++;
    lines.push({ sel: sel(el), c: divider || sides[0], kind: divider ? 'divider' : 'border' });
  }
  const rs = getComputedStyle(document.documentElement);
  const pal = {}; ['--th-gold', '--th-line', '--th-line2', '--th-ink', '--th-muted', '--th-over', '--th-side-ink', '--th-tile-ink', '--th-tile-line', '--th-field-line', '--th-user-line', '--th-ai-line', '--th-glow', '--accent', '--omGold', '--text', '--muted', '--border', '--th-link'].forEach((v) => { pal[v] = rs.getPropertyValue(v).trim(); });
  return { texts, icons, lines, pal, cls: document.documentElement.className, dpr: devicePixelRatio };
};

const HIDE_CSS = '*,*::before,*::after{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;caret-color:transparent!important;transition:none!important;}::placeholder{color:transparent!important;-webkit-text-fill-color:transparent!important;}[data-cxh]{visibility:hidden!important;}';

// ── الحساب (WCAG 2.x) ──
const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const L = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const x = Math.max(a, b), y = Math.min(a, b); return (x + 0.05) / (y + 0.05); };
function stats(png, rects, dpr, c, opac) {
  const a = Math.max(0, Math.min(1, (c ? c[3] : 1) * opac));
  const rs = [];
  let area = 0; for (const r of rects) area += (r[2] - r[0]) * (r[3] - r[1]) * dpr * dpr;
  const step = Math.max(1, Math.floor(Math.sqrt(area / 700)));
  let sr = 0, sg = 0, sb = 0, sn = 0;
  for (const r of rects) {
    const x0 = Math.floor(r[0] * dpr), y0 = Math.floor(r[1] * dpr), x1 = Math.min(png.width, Math.ceil(r[2] * dpr)), y1 = Math.min(png.height, Math.ceil(r[3] * dpr));
    for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) {
      const i = (y * png.width + x) * 4; const R = png.data[i], G = png.data[i + 1], B = png.data[i + 2];
      sr += R; sg += G; sb += B; sn++;
      const fr = c[0] * a + R * (1 - a), fg = c[1] * a + G * (1 - a), fb = c[2] * a + B * (1 - a);
      rs.push(ratio(L(fr, fg, fb), L(R, G, B)));
    }
  }
  if (!rs.length) return null;
  rs.sort((x, y) => x - y);
  const hx = (v) => Math.round(v).toString(16).padStart(2, '0');
  return { p10: +rs[Math.floor(rs.length * 0.1)].toFixed(2), med: +rs[Math.floor(rs.length / 2)].toFixed(2), bg: '#' + hx(sr / sn) + hx(sg / sn) + hx(sb / sn) };
}
const hex = (c) => c ? '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('') + (c[3] < 1 ? '/' + (+c[3].toFixed(2)) : '') : null;
function hsl(c) { const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const l = (mx + mn) / 2; let h = 0, s = 0; if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return [h, s, l]; }
const PCOL = (s) => { if (!s) return null; let m = s.match(/^#([0-9a-f]{3,8})$/i); if (m) { let h = m[1]; if (h.length === 3) h = h.split('').map((x) => x + x).join(''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1]; } m = s.match(/rgba?\(([^)]+)\)/); if (m) { const a = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [a[0], a[1], a[2], a.length > 3 ? a[3] : 1]; } return null; };
// لون مشبع لا يقرب تدرّجه (±٢٨°) أيّ لون مشبع في لوحة الثيم = غريب عنه
function foreign(c, pal) {
  if (!c) return false; const [h, s, l] = hsl(c); if (s < 0.3 || l < 0.12 || l > 0.9 || c[3] < 0.2) return false;
  const hues = Object.values(pal).map(PCOL).filter(Boolean).map(hsl).filter((x) => x[1] >= 0.25 && x[2] > 0.1 && x[2] < 0.92).map((x) => x[0]);
  if (!hues.length) return true;
  return !hues.some((ph) => { const d = Math.abs(ph - h); return Math.min(d, 360 - d) <= 28; });
}

// ── الشاشات ──
async function openScreen(page, s, mobile) {
  return page.evaluate(async ([s, mobile]) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    try { document.querySelectorAll('dialog[open]').forEach((d) => d.close()); } catch (e) { /* */ }
    try { const o = document.getElementById('sectionsToolsOverlay'); if (o) o.classList.remove('show'); } catch (e) { /* */ }
    try { if (typeof closeDrawers === 'function') closeDrawers(); } catch (e) { /* */ }
    try { const v = document.getElementById('videoMakerModal'); if (v && getComputedStyle(v).display !== 'none') { const b = document.getElementById('videoMakerCloseBtn'); if (b) b.click(); } } catch (e) { /* */ }
    ['plusToolsPopup', 'headerMenuDropdown', 'headerUserDropdown', 'tabsMenuDropdown', 'histItemMenu', 'omModelPopup'].forEach((id) => { const el = document.getElementById(id); if (el) { el.classList.remove('show', 'open'); if (id === 'headerUserDropdown') el.style.display = 'none'; } });
    try { for (const t of ['pointerdown', 'mousedown', 'click']) document.body.dispatchEvent(new MouseEvent(t, { bubbles: true })); } catch (e) { /* */ }
    document.querySelectorAll('.msgMoreMenu').forEach((m) => { m.classList.remove('show', 'open'); });
    await wait(150);
    const seed = (withMsgs) => {
      const n = Date.now();
      const msgs = [{ role: 'user', content: 'اكتب لي خطة مذاكرة أسبوعية للرياضيات والفيزياء' },
        { role: 'assistant', content: '## خطة المذاكرة\nهذه **خطة أسبوعية** متوازنة مع روابط [مصادر مفيدة](https://example.com):\n\n- **السبت:** الجبر — حلّ ٢٠ مسألة\n- **الأحد:** الفيزياء — قوانين نيوتن\n- `مراجعة` سريعة كل يوم\n\n```js\nconst plan = ["جبر", "فيزياء"];\n```\nبالتوفيق!' },
        { role: 'user', content: 'شكرًا، أضف يوم الاثنين' },
        { role: 'assistant', content: 'تمّ: **الاثنين** للهندسة والتمارين المختلطة.' }];
      state.projects = ['خطة دراسة', 'تطبيق مهام', 'صورة شخصيّة', 'فيديو قصير', 'موقع مطعم', 'مشروع جديد'].map((t, i) => ({ id: 'p_' + (n - i * 6e4), title: t, provider: 'openai', messages: i === 0 && withMsgs ? msgs : [] }));
      state.currentId = state.projects[withMsgs ? 0 : 5].id;
      window.__renderHistSig = null;
      try { renderAll(); } catch (e) { try { renderHistory(); renderMessages(); } catch (_) { /* */ } }
    };
    if (s === 'welcome') { seed(false); await wait(500); }
    else if (s === 'chat') { seed(true); await wait(700); const m = document.getElementById('messages'); if (m) m.scrollTop = 0; await wait(200); }
    else if (s === 'sidebar') { if (!mobile) return 'skip'; seed(true); await wait(300); if (typeof openDrawer === 'function') openDrawer(document.getElementById('sidebar')); await wait(600); }
    else if (s === 'tools') { seed(false); const o = document.getElementById('sectionsToolsOverlay'); if (!o) return 'none'; o.classList.add('show'); await wait(700); }
    else if (s === 'plus') { seed(true); const b = document.getElementById('btnPlusTools'); if (!b) return 'none'; b.click(); await wait(500); }
    else if (s === 'menu') { seed(true); const b = document.getElementById('btnHeaderMenu'); if (!b) return 'none'; b.click(); await wait(500); const d = document.getElementById('headerMenuDropdown'); if (!d || getComputedStyle(d).display === 'none') return 'hidden'; }
    else if (s.startsWith('settings')) {
      seed(true);
      const d = document.getElementById('settingsDialog'); if (!d) return 'none';
      try { d.showModal(); } catch (e) { d.setAttribute('open', ''); }
      if (typeof renderSettingsNavList === 'function') renderSettingsNavList();
      if (s === 'settings') { if (typeof showSettingsHome === 'function') showSettingsHome(); }
      else if (typeof showSettingsPage === 'function') showSettingsPage(s === 'settings-bg' ? 'bgImgSection' : 'accountSection');
      await wait(700);
    }
    /* القوائم المنبثقة الأخرى (v-theme-menus): ⋮ لوحة المعاينة، و⋮ المحادثة في القائمة، و⋮ الرسالة، وقائمة النموذج */
    else if (s === 'tabsmenu' || s === 'histmenu' || s === 'msgmenu' || s === 'modelmenu') {
      seed(true); await wait(500);
      const shown = (el) => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 10;
      if (s === 'tabsmenu') {
        if (mobile && typeof openDrawer === 'function') { openDrawer(document.getElementById('workarea')); await wait(600); }
        const b = document.getElementById('btnTabsMenu'); if (!b) return 'none'; b.click(); await wait(500);
        const d = document.getElementById('tabsMenuDropdown'); if (!shown(d)) { if (d) d.classList.add('show'); await wait(300); } if (!shown(d)) return 'hidden';
      } else if (s === 'histmenu') {
        if (mobile && typeof openDrawer === 'function') { openDrawer(document.getElementById('sidebar')); await wait(600); }
        const b = document.querySelector('#history .hist-item .hist-menu-btn'); if (!b) return 'none'; b.click(); await wait(500);
        if (!shown(document.getElementById('histItemMenu'))) return 'hidden';
      } else if (s === 'msgmenu') {
        const b = document.querySelector('#messages .msgMoreTrigger'); if (!b) return 'none'; b.click(); await wait(500);
        if (!shown(document.querySelector('.msgMoreMenu'))) return 'hidden';
      } else {
        const b = document.getElementById('omModelChip'); if (!b) return 'none'; b.click(); await wait(600);
        if (!shown(document.getElementById('omModelPopup'))) return 'hidden';
      }
    }
    else if (s === 'video') { seed(true); if (typeof window.omranOpenVideoMaker !== 'function') return 'none'; window.omranOpenVideoMaker(); await wait(1200); }
    return 'ok';
  }, [s, mobile]);
}

async function applyConfig(page, cfg) {
  await page.evaluate(async (cfg) => {
    const html = document.documentElement;
    try { document.querySelectorAll('dialog[open]').forEach((d) => d.close()); } catch (e) { /* */ }
    if (cfg.mode === 'light') html.setAttribute('data-mode', 'light'); else html.removeAttribute('data-mode');
    localStorage.setItem('aiapp_mode', cfg.mode === 'light' ? 'light' : 'dark');
    if (typeof window.omSyncModeBtn === 'function') window.omSyncModeBtn();
    localStorage.setItem('aiapp_bg3d', cfg.bg3d || 'none'); await applyBg3D(cfg.bg3d || 'none', false);
    if (cfg.theme) window.خلفيات.طبّق(window.خلفيات.ثيم(cfg.theme), false);
    else if (cfg.bgimg) window.خلفيات.طبّق({ ملف: cfg.bgimg.ملف, لون: cfg.bgimg.لون, فاتحة: !!cfg.bgimg.فاتحة }, false);
    else if (!cfg.bg3d) window.خلفيات.طبّق(null, false);
  }, cfg);
  await page.waitForTimeout(cfg.bg3d ? 3000 : 400);
  await waitImages(page);
}
/* صور الخلفيّات (مشاهد ٢٥٦٠px وخامات) تُفكّ بعد طلبها بزمن: بدون انتظار فكّها تُصوَّر الشاشة بلون الصفحة وحده فيُقاس النصّ على
   لون لا يراه المستخدم (وقع: «دخان» صُوِّر كحليًّا صافيًا). كلّ رابط خلفيّة في الصفحة يُفكّ قبل القياس. */
async function waitImages(page) {
  await page.evaluate(async () => {
    const urls = new Set();
    for (const el of document.querySelectorAll('body, body *')) {
      for (const pe of [null, '::before', '::after']) {
        const bi = getComputedStyle(el, pe).backgroundImage;
        if (bi && bi !== 'none') for (const m of bi.matchAll(/url\("?([^")]+)"?\)/g)) urls.add(m[1]);
      }
    }
    await Promise.all([...urls].map((u) => { const im = new Image(); im.src = u; return im.decode().catch(() => null); }));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  await page.waitForTimeout(250);
}

fs.mkdirSync(OUT, { recursive: true });
// Google Fonts يعلّق أحيانًا من جهاز المالك فيحجب الصفحة (ورقة الأنماط تحجب السكربتات المؤجَّلة) — نسخة مخبَّأة، وإلّا خطّ احتياطيّ
const FCACHE = path.resolve(String(opt('fonts', path.join(OUT, '..', 'gfonts-cache'))));
fs.mkdirSync(FCACHE, { recursive: true });
const FCSS = path.join(FCACHE, 'gfonts.css');
if (!fs.existsSync(FCSS)) {
  try {
    const u = (fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/https:\/\/fonts\.googleapis\.com\/css2\?[^"]+/) || [])[0];
    const r = await fetch(u.replace(/&amp;/g, '&'), { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36' }, signal: AbortSignal.timeout(12000) });
    if (r.ok) fs.writeFileSync(FCSS, await r.text());
  } catch (e) { console.error('gfonts: بلا شبكة — خطّ احتياطيّ'); }
}
const browser = await chromium.launch({ args: opt('gl', false) ? ['--enable-unsafe-swiftshader'] : [] });
const TAG = SET + (VPS.length === 1 ? '-' + VPS[0] : '') + (opt('tag', '') ? '-' + opt('tag') : '');
const jsonl = fs.createWriteStream(path.join(OUT, 'results-' + TAG + '.jsonl'), { flags: 'w' });
const results = [];
try {
  for (const vp of VPS) {
    const mobile = vp === 'mobile';
    const ctx = await browser.newContext(mobile
      ? { viewport: { width: 400, height: 860 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36' }
      : { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => {
      try { sessionStorage.setItem('omran_sess_v1', '1'); } catch (e) { /* */ }
      try { localStorage.setItem('aiapp_intro', '0'); localStorage.setItem('aiapp_privacy_ack', '1'); localStorage.setItem('aiapp_lang', 'ar'); localStorage.setItem('aiapp_username', 'omran'); localStorage.setItem('aiapp_auth_token', 'local'); } catch (e) { /* */ }
    });
    await ctx.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: fs.existsSync(FCSS) ? fs.readFileSync(FCSS, 'utf8') : '' }));
    await ctx.route(/fonts\.gstatic\.com/, async (r) => {
      const u = r.request().url(); const f = path.join(FCACHE, u.replace(/[^\w.-]+/g, '_').slice(-150));
      const ok = (b) => r.fulfill({ status: 200, contentType: 'font/woff2', headers: { 'access-control-allow-origin': '*' }, body: b });
      if (fs.existsSync(f)) return ok(fs.readFileSync(f));
      try { const res = await fetch(u, { signal: AbortSignal.timeout(15000) }); if (!res.ok) throw new Error(String(res.status)); const b = Buffer.from(await res.arrayBuffer()); fs.writeFileSync(f, b); return ok(b); }
      catch (e) { return r.abort(); }
    });
    const errs = [];
    let page = null, used = 0;
    // صفحة جديدة كلّ ٨ حالات، وبعد أيّ انهيار: صور المشاهد (٢٥٦٠px) تتراكم في الذاكرة فينهار العارض (Target crashed)
    const fresh = async () => {
      if (page) { try { await page.close(); } catch (e) { /* */ } }
      page = await ctx.newPage(); used = 0;
      page.on('pageerror', (e) => errs.push(String(e && e.message || e).slice(0, 160)));
      for (let k = 0; k < 3; k++) { try { await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 90000 }); break; } catch (e) { console.error('goto retry', k); } }
      await page.waitForTimeout(2500);
      await page.evaluate(() => { ['omranIntro', 'privacyConsent'].forEach((id) => { const el = document.getElementById(id); if (el) el.remove(); }); });
    };
    for (const cfg of configs) {
      const id = cfg.id || (cfg.theme + '-' + cfg.mode);
      if (cfg.theme && ONLY && !ONLY.includes(cfg.theme)) continue;
      if (!page || used >= 8) await fresh();
      used++;
      try { await applyConfig(page, cfg); } catch (e) { console.error('cfg fail', id, e.message.slice(0, 120)); await fresh(); try { await applyConfig(page, cfg); } catch (e2) { continue; } }
      for (const s of SCREEN_LIST) {
        let st;
        try { st = await openScreen(page, s, mobile); } catch (e) { st = 'err:' + e.message.slice(0, 80); }
        if (/crashed|closed/i.test(String(st))) { console.error(vp, id, s, 'إعادة الصفحة بعد انهيار'); await fresh(); await applyConfig(page, cfg); try { st = await openScreen(page, s, mobile); } catch (e) { st = 'err:' + e.message.slice(0, 80); } }
        if (st !== 'ok') { if (st !== 'skip') console.error(vp, id, s, st); continue; }
        try { await waitImages(page); } catch (e) { /* صفحة انهارت — تُكشف في القياس */ }
        let m, shotA, shotB;
        try {
          await page.addStyleTag({ content: '*{pointer-events:auto!important}' }).then((h) => h.evaluate((el) => el.setAttribute('data-cxp', '1')));
          m = await page.evaluate(PAGE_MEASURE);
          await page.evaluate(() => document.querySelectorAll('style[data-cxp]').forEach((x) => x.remove()));
          shotA = await page.screenshot({ timeout: 60000, caret: 'hide' });
          await page.addStyleTag({ content: HIDE_CSS }).then((h) => h.evaluate((el) => el.setAttribute('data-cx', '1')));
          await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
          shotB = await page.screenshot({ timeout: 60000, caret: 'hide' });
        } catch (e) { console.error(vp, id, s, 'state fail', e.message.slice(0, 100)); }
        try { await page.evaluate(() => { document.querySelectorAll('style[data-cx],style[data-cxp]').forEach((x) => x.remove()); document.querySelectorAll('[data-cxh]').forEach((e) => e.removeAttribute('data-cxh')); }); } catch (e) { /* */ }
        if (!shotB) continue;
        const png = PNG.sync.read(shotB);
        const fails = [], foreignList = [], ok = [];
        let checked = 0;
        for (const t of [...m.texts, ...m.icons]) {
          if (t.grad) continue;
          const s2 = stats(png, t.rects, m.dpr, t.c, t.op); if (!s2) continue;
          checked++;
          const need = t.kind === 'icon' || t.kind === 'sym' ? 3 : 4.5;
          const rec = { sel: t.sel, text: t.text, kind: t.kind, fg: hex(t.c), op: +t.op.toFixed(2), bg: s2.bg, p10: s2.p10, med: s2.med, need, sh: t.sh };
          if (CHAINS) rec.chain = t.chain.join(' > ');
          if (s2.p10 < need) fails.push(rec); else if (DUMP) ok.push(rec);
          if (foreign(t.c, m.pal)) foreignList.push({ sel: t.sel, text: t.text, kind: t.kind, c: hex(t.c) });
        }
        for (const ln of m.lines) if (foreign(ln.c, m.pal)) foreignList.push({ sel: ln.sel, kind: ln.kind, c: hex(ln.c) });
        jsonl.write(JSON.stringify({ vp, cfg: id, screen: s, checked, fails, foreign: foreignList, errs: errs.splice(0), ok: DUMP ? ok : undefined }) + '\n');
        results.push({ vp, cfg: id, screen: s, checked, nf: fails.length, nfor: foreignList.length });
        if (SHOTS && shotA) { const d = path.join(OUT, 'shots', vp); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, id + '__' + s + '.png'), shotA); }
      }
      console.log(vp, id, results.filter((r) => r.vp === vp && r.cfg === id).map((r) => r.screen + ':' + r.nf + '/' + r.checked + (r.nfor ? ' f' + r.nfor : '')).join(' '));
    }
    await ctx.close();
  }
} finally {
  jsonl.end();
  await browser.close();
  srv.close();
}
const bad = results.reduce((a, r) => a + r.nf, 0);
console.log(JSON.stringify({ states: results.length, failing: bad, out: OUT }));
