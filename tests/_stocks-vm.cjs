'use strict';
/* مساعد اختبارات نافذة الأسهم والمقاولات (js/app-13-stocks-init.js) في vm — ليس اختبارًا ولا يُسجَّل.
   دوم مصغّر بعقد نصّيّة وأجزاء (DocumentFragment) يكفي للماركداون الخفيف، وinnerHTML يحفظ النصّ ويُنشئ عنصرًا مسطّحًا لكلّ وسم
   فيه id أو سمة data- (يجده getElementById وquerySelectorAll)، وكانفس يسجّل نداءات الرسم، وfetch وهميّ يُوجَّه بدالّة.
   القواميس الحقيقيّة: app-03 وملفّات i18n/*.js الاثنا عشر محمّلة في السياق نفسه (window.__bT و__BI كما في التطبيق). */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const LANGS = ['fr', 'hi', 'ur', 'bn', 'ne', 'id', 'fil', 'tr', 'zh', 'ru', 'es', 'ml'];
const A13 = read('js/app-13-stocks-init.js');
const STOCKS_MARK = '/* ---------- 📈 Stocks';
const CONS_MARK = '/* ---------- 🏗️ Construction';
const STUDIO_MARK = '/* ---------- 💄 AI Style Studio';

const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const escT = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

class Text {
  constructor(s) { this.nodeType = 3; this.data = String(s); this.parentNode = null; }
  get textContent() { return this.data; }
}
function attach(host, n) {
  if (n.nodeType === 11) { n.childNodes.slice().forEach((c) => attach(host, c)); n.childNodes = []; return n; }
  if (n.parentNode && n.parentNode.removeChild) n.parentNode.removeChild(n);
  n.parentNode = host; host.childNodes.push(n); host._html = null;
  return n;
}
class Frag {
  constructor() { this.nodeType = 11; this.childNodes = []; }
  appendChild(n) { return attach(this, n); }
  removeChild(n) { this.childNodes = this.childNodes.filter((c) => c !== n); n.parentNode = null; return n; }
  get textContent() { return this.childNodes.map((n) => n.textContent).join(''); }
}
function serialize(n) {
  if (n.nodeType === 3) return escT(n.data);
  const tag = n.tagName.toLowerCase();
  const at = Object.keys(n.attrs).map((k) => ' ' + k + '="' + String(n.attrs[k]).replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"').join('');
  if (/^(hr|br|img|input)$/.test(tag)) return '<' + tag + at + '>';
  return '<' + tag + at + '>' + n.innerHTML + '</' + tag + '>';
}
class ClassList {
  constructor() { this.s = new Set(); }
  add(...c) { c.forEach((x) => this.s.add(x)); }
  remove(...c) { c.forEach((x) => this.s.delete(x)); }
  contains(c) { return this.s.has(c); }
  toggle(c, f) { const on = f === undefined ? !this.s.has(c) : !!f; if (on) this.s.add(c); else this.s.delete(c); return on; }
}
function makeCtx2d() {
  const calls = [];
  const ctx = {
    calls, font: '10px sans-serif', direction: 'inherit', textAlign: 'start', fillStyle: '', strokeStyle: '', lineWidth: 1,
    clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, closePath() {},
    createLinearGradient() { return { addColorStop() {} }; },
    fillText(t, x, y) { calls.push({ t: String(t), x, y, font: ctx.font, direction: ctx.direction, textAlign: ctx.textAlign }); },
  };
  return ctx;
}
class El {
  constructor(tag) {
    this.nodeType = 1; this.tagName = String(tag).toUpperCase(); this.childNodes = []; this.parentNode = null;
    this.attrs = {}; this.style = {}; this._html = null; this._ls = {}; this.value = ''; this.disabled = false;
    this.classList = new ClassList(); this.width = 0; this.height = 0; this.clientWidth = 0;
  }
  get id() { return this.attrs.id || ''; }
  set id(v) { this.attrs.id = String(v); }
  get title() { return this.attrs.title || ''; }
  set title(v) { this.attrs.title = String(v); }
  get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
  get firstElementChild() { return this.children[0] || null; }
  get offsetWidth() { return 0; }
  get scrollWidth() { return 0; }
  appendChild(n) { return attach(this, n); }
  removeChild(n) { this.childNodes = this.childNodes.filter((c) => c !== n); n.parentNode = null; return n; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  replaceChildren(...ns) { this.childNodes = []; this._html = null; ns.forEach((n) => attach(this, typeof n === 'string' ? new Text(n) : n)); }
  set textContent(v) { this.childNodes = []; this._html = null; const s = v == null ? '' : String(v); if (s) attach(this, new Text(s)); }
  get textContent() { return this._html != null ? decode(this._html.replace(/<[^>]*>/g, '')) : this.childNodes.map((n) => n.textContent).join(''); }
  set innerHTML(h) {
    this._html = String(h); this.childNodes = [];
    const re = /<([a-zA-Z][\w-]*)\b([^>]*)>/g;
    let m;
    while ((m = re.exec(this._html))) {
      const attrs = {};
      m[2].replace(/([\w:-]+)="([^"]*)"/g, (_, k, v) => { attrs[k] = decode(v); return ''; });
      if (!attrs.id && !Object.keys(attrs).some((k) => k.indexOf('data-') === 0)) continue;
      const el = new El(m[1]);
      Object.keys(attrs).forEach((k) => el.setAttribute(k, attrs[k]));
      const close = this._html.indexOf('</' + m[1] + '>', re.lastIndex);
      const inner = close > 0 ? this._html.slice(re.lastIndex, close) : '';
      if (inner) el.textContent = decode(inner.replace(/<[^>]*>/g, ''));
      el.parentNode = this; this.childNodes.push(el);
    }
  }
  get innerHTML() { return this._html != null ? this._html : this.childNodes.map(serialize).join(''); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
  hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); }
  removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(t, fn) { (this._ls[t] = this._ls[t] || []).push(fn); }
  removeEventListener(t, fn) { this._ls[t] = (this._ls[t] || []).filter((f) => f !== fn); }
  dispatch(type, extra) {
    const ev = Object.assign({ type, target: this, _stop: false, preventDefault() {}, stopPropagation() { this._stop = true; } }, extra || {});
    let n = this;
    while (n) {
      if (typeof n['on' + type] === 'function') n['on' + type].call(n, ev);
      for (const fn of ((n._ls || {})[type] || []).slice()) fn.call(n, ev);
      if (ev._stop) break;
      n = n.parentNode;
    }
    return ev;
  }
  click() { return this.dispatch('click'); }
  matches(sel) {
    sel = String(sel).trim();
    let m;
    if (sel[0] === '#') return this.id === sel.slice(1);
    if ((m = sel.match(/^\[([\w-]+)\]$/))) return this.hasAttribute(m[1]);
    if (sel[0] === '.' || sel.indexOf(':') >= 0) return false;
    return this.tagName === sel.toUpperCase();
  }
  closest(sel) { let n = this; while (n && n.nodeType === 1) { if (n.matches(sel)) return n; n = n.parentNode; } return null; }
  _walk(fn) { for (const c of this.childNodes) { if (c.nodeType === 1) { fn(c); c._walk(fn); } } }
  querySelectorAll(sel) {
    const out = [];
    String(sel).split(',').forEach((one) => {
      const parts = one.trim().split(/\s+/);
      const last = parts.pop();
      this._walk((c) => {
        if (!c.matches(last) || out.includes(c)) return;
        if (parts.length) { let p = c.parentNode, ok = false; while (p && p.nodeType === 1) { if (p.matches(parts[parts.length - 1])) { ok = true; break; } p = p.parentNode; } if (!ok) return; }
        out.push(c);
      });
    });
    return out;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  getContext() { return this._ctx || (this._ctx = makeCtx2d()); }
}

function makeDoc() {
  const html = new El('html'), head = new El('head'), body = new El('body');
  html.appendChild(head); html.appendChild(body);
  const doc = {
    documentElement: html, head, body, fullscreenElement: null, _ls: {},
    createElement: (t) => new El(t),
    createTextNode: (s) => new Text(s),
    createDocumentFragment: () => new Frag(),
    getElementById: (id) => { let f = null; html._walk((c) => { if (!f && c.id === id) f = c; }); return f; },
    querySelectorAll: (s) => html.querySelectorAll(s),
    querySelector: (s) => html.querySelector(s),
    addEventListener(t, fn) { (doc._ls[t] = doc._ls[t] || []).push(fn); },
    removeEventListener() {},
    fire(t) { (doc._ls[t] || []).slice().forEach((fn) => fn({ type: t })); },
  };
  html.requestFullscreen = () => { doc.fullscreenElement = html; doc.fire('fullscreenchange'); return Promise.resolve(); };
  doc.exitFullscreen = () => { doc.fullscreenElement = null; doc.fire('fullscreenchange'); return Promise.resolve(); };
  return doc;
}

const STOCK_IDS = ['btnStocks', 'stocksCloseBtn', 'stockSymbolInput', 'stockLoadBtn', 'stockChips', 'stockInterval', 'stockStatus', 'stockQuoteCard',
  'stockAnalyzeWrap', 'stockAnalyzeBtn', 'stockQuestion', 'stockAnalysis', 'stocksLearnBtn', 'stockLearnWrap', 'stockLearnChips', 'stockLearnQ',
  'stockLearnAskBtn', 'stockLesson', 'stockGlobalWrap', 'tvChart', 'tvOverview', 'goldOz', 'goldChg', 'goldG24', 'goldG22', 'goldG21', 'goldCard',
  'globalChips', 'stocksFullBtn', 'stockSearchWrap', 'stockPfWrap', 'stocksGlobalBtn', 'stocksSearchBtn', 'stocksPfBtn', 'stockName', 'stockExchange',
  'stockPrice', 'stockChange', 'stockDetails'];
const CONS_IDS = ['btnConstruction', 'constructionCloseBtn', 'constructionRunBtn', 'constructionType', 'constructionFloors', 'constructionArea',
  'constructionStyle', 'constructionNotes', 'constructionBudget', 'constructionStatus', 'constructionResultImageWrap', 'constructionResultImage',
  'constructionDownloadLink', 'constructionPhotoImageWrap', 'constructionPhotoImage', 'constructionPhotoDownloadLink', 'constructionInteriorImageWrap',
  'constructionInteriorImage', 'constructionInteriorDownloadLink', 'constructionModePlan', 'constructionModePhoto', 'constructionLibraryWrap',
  'constructionLibraryEmpty', 'constructionPlanText', 'constructionViewsSection', 'constructionAngleStatus', 'constructionAngleImageWrap',
  'constructionAngleImage', 'constructionAngleDownloadLink', 'constructionRoomSelect', 'constructionRoomColor', 'constructionRoomViewBtn',
  'constructionRoomStatus', 'constructionRoomImageWrap', 'constructionRoomImage', 'constructionRoomDownloadLink', 'constructionPlot',
  'constructionEmirate', 'constructionBoqWrap', 'constructionExportRow', 'constructionBoqBtn', 'constructionPdfBtn', 'constructionQuotaBadge'];

/* route(mode|url, body) ← { status, body } أو كائن الردّ نفسه (200) */
function boot(opts) {
  opts = opts || {};
  const lang = opts.lang || 'ar';
  const doc = makeDoc();
  const store = new Map(Object.entries(Object.assign({ aiapp_lang: lang, tickerCollapsed: '1' }, opts.storage || {})));
  const sent = [];
  const opened = [];
  const ctx = {
    console: { log() {}, warn() {}, error() {}, info() {} }, JSON, Object, Array, Math, Promise, String, Number, Date, Map, Set, RegExp, Error, isFinite, encodeURIComponent, decodeURIComponent, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} }, Blob: function () {},
    document: doc, lang,
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    __swallow() {}, isEn: () => lang === 'en', authGet: (k) => (k === 'aiapp_auth_token' ? (opts.token === undefined ? 'tok' : opts.token) : ''),
    getGuestId: () => 'g1', confirm: () => true,
    open: () => { const w = { html: '', document: { write(h) { w.html += h; }, close() {} }, focus() {}, print() {} }; opened.push(w); return w; },
    fetch: async (url, init) => {
      const body = init && init.body ? JSON.parse(init.body) : {};
      sent.push({ url, body });
      const key = String(url).indexOf('action=stocks') >= 0 ? body.mode : String(url);
      let r = opts.route ? opts.route(key, body) : null;
      if (!r || r.status === undefined) r = { status: 200, body: r || {} };
      return { ok: r.status < 400, status: r.status, json: async () => r.body };
    },
  };
  ctx.window = ctx; ctx.self = ctx;
  ctx.$ = (s) => doc.querySelector(s);
  vm.createContext(ctx);
  const a3 = read('js/app-03-i18n-data.js').replace(/^const (codeEl|previewFrame|emptyState|historyEl) = .*$/mg, '');
  vm.runInContext(a3 + '\n;this.I18N = I18N;', ctx);
  for (const l of LANGS) vm.runInContext(read('i18n/' + l + '.js'), ctx);
  const I = ctx.I18N;
  const dict = lang === 'ar' ? I.ar : Object.assign({}, I.en, I[lang] || {});
  ctx.t = (k) => (dict[k] !== undefined ? dict[k] : k);

  // الأسهم: الشريط في الجسم، والنافذة ‹#stocksModal› أوّل أبنائها ‹#stocksPage› (modal.firstElementChild)
  const mk = (id, tag, parent) => { const e = new El(tag || 'div'); e.id = id; (parent || doc.body).appendChild(e); return e; };
  const ticker = mk('stockTicker'); mk('stockTickerTrack', 'div', ticker); mk('stockTickerToggle', 'button', ticker); mk('stockTickerToggleIcon', 'svg', ticker);
  const modal = mk('stocksModal');
  const page = mk('stocksPage', 'div', modal);
  Object.assign(page.style, { maxWidth: 'none', maxHeight: 'none', height: '100%', borderRadius: '0px' });
  modal.style.padding = '0px';
  STOCK_IDS.forEach((id) => mk(id, /Btn$/.test(id) ? 'button' : 'div', page));
  doc.getElementById('stockInterval').value = '1day';
  const topic = new El('button'); topic.setAttribute('data-topic', 'support'); doc.getElementById('stockLearnChips').appendChild(topic);
  const chart = mk('stockChart', 'canvas', page);
  chart.width = 1000; chart.height = 440; chart.clientWidth = opts.chartWidth || 1000;

  // المقاولات
  const cmodal = mk('constructionModal');
  CONS_IDS.forEach((id) => mk(id, /Btn$/.test(id) ? 'button' : 'div', cmodal));
  const sel = (id, text, value) => { const e = doc.getElementById(id); e.options = [{ text, value }]; e.selectedIndex = 0; e.value = value; };
  sel('constructionType', 'فيلا سكنية', 'villa'); sel('constructionStyle', 'عصري', 'modern'); sel('constructionEmirate', '', '');
  doc.getElementById('constructionFloors').value = opts.floors || '1';
  doc.getElementById('constructionArea').value = '300';
  doc.getElementById('constructionModePlan').checked = true;
  doc.getElementById('constructionModePhoto').checked = false;

  const helperEnd = A13.indexOf(STOCKS_MARK);
  const helper = helperEnd > 0 ? A13.slice(0, helperEnd) : '';
  const part = opts.part || 'stocks';
  const src = part === 'stocks'
    ? A13.slice(0, A13.indexOf(CONS_MARK))
    : helper + '\n' + A13.slice(A13.indexOf(CONS_MARK), A13.indexOf(STUDIO_MARK));
  vm.runInContext(src, ctx);
  const flush = async () => { for (let i = 0; i < 12; i++) await new Promise((r) => setImmediate(r)); };
  return { ctx, doc, sent, opened, flush, $: (id) => doc.getElementById(id), I18N: I };
}

module.exports = { boot, read, LANGS, A13, El, Text, Frag, makeDoc };
