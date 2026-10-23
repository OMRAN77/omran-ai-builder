'use strict';
/* دوم مصغّر لاختبارات الواجهة في vm (لا jsdom في المستودع).
   - عناصر بأبناء ومعرّفات وclassList وسمات ومستمعين، ونقرة تصعد إلى document وتقف عند stopPropagation.
   - innerHTML يحفظ النصّ كما هو، ويُنشئ عنصرًا لكلّ وسم فيه id أو class (مسطّحًا تحت العنصر المضيف)
     فيجده getElementById وquerySelectorAll، والخانة النصّيّة تأخذ محتواها قيمةً، والزرّ نصّه. */
function makeDom() {
  class ClassList {
    constructor() { this.s = new Set(); }
    add(...c) { c.forEach((x) => this.s.add(x)); }
    remove(...c) { c.forEach((x) => this.s.delete(x)); }
    contains(c) { return this.s.has(c); }
    toggle(c, f) { const on = f === undefined ? !this.s.has(c) : !!f; if (on) this.s.add(c); else this.s.delete(c); return on; }
  }
  const doc = {};
  class El {
    constructor(tag) {
      this.tagName = String(tag).toUpperCase();
      this.children = []; this.parentNode = null; this.style = {}; this.attrs = {};
      this._html = ''; this.classList = new ClassList(); this._ls = {};
      this.value = ''; this.textContent = ''; this.id = ''; this.title = '';
    }
    get className() { return [...this.classList.s].join(' '); }
    set className(v) { this.classList.s = new Set(String(v).split(/\s+/).filter(Boolean)); }
    get firstElementChild() { return this.children[0] || null; }
    appendChild(c) { if (c.parentNode) c.remove(); c.parentNode = this; this.children.push(c); return c; }
    insertBefore(c, ref) {
      if (c.parentNode) c.remove();
      const i = this.children.indexOf(ref);
      c.parentNode = this;
      if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
      return c;
    }
    remove() { const p = this.parentNode; if (p) { p.children = p.children.filter((x) => x !== this); this.parentNode = null; } }
    setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') this.id = String(v); if (k === 'title') this.title = String(v); }
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
    removeAttribute(k) { delete this.attrs[k]; }
    addEventListener(t, fn) { (this._ls[t] = this._ls[t] || []).push(fn); }
    removeEventListener(t, fn) { this._ls[t] = (this._ls[t] || []).filter((f) => f !== fn); }
    getBoundingClientRect() { return { top: 0, bottom: 40, left: 200, right: 300, width: 100, height: 40 }; }
    focus() {}
    matches(sel) {
      return String(sel).split(',').some((s) => {
        s = s.trim();
        if (s[0] === '#') return this.id === s.slice(1);
        if (s[0] === '.') return this.classList.contains(s.slice(1));
        return this.tagName === s.toUpperCase();
      });
    }
    closest(sel) { let n = this; while (n && n !== doc) { if (n.matches && n.matches(sel)) return n; n = n.parentNode; } return null; }
    _walk(fn) { for (const c of this.children) { fn(c); c._walk(fn); } }
    querySelectorAll(sel) { const out = []; this._walk((c) => { if (c.matches(sel)) out.push(c); }); return out; }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    click() {
      const ev = { type: 'click', target: this, _stop: false, stopPropagation() { this._stop = true; }, preventDefault() {} };
      let n = this;
      while (n) {
        if (typeof n.onclick === 'function') n.onclick.call(n, ev);
        for (const fn of ((n._ls && n._ls.click) || []).slice()) fn.call(n, ev);
        if (ev._stop) break;
        n = n.parentNode;
      }
    }
    set innerHTML(h) {
      this._html = String(h);
      this.children = this.children.filter((c) => !c._gen);
      const re = /<([a-zA-Z][\w-]*)\b([^>]*)>/g;
      let m;
      while ((m = re.exec(this._html))) {
        const attrs = {};
        m[2].replace(/([\w:-]+)="([^"]*)"/g, (_, k, v) => { attrs[k] = v; return ''; });
        if (!attrs.id && !attrs.class) continue;
        const el = new El(m[1]);
        el._gen = true;
        Object.keys(attrs).forEach((k) => { if (k === 'class') el.className = attrs[k]; else el.setAttribute(k, attrs[k]); });
        if (/\schecked\b/.test(m[2])) el.checked = true;
        if (/\sdisabled\b/.test(m[2])) el.disabled = true;
        const close = this._html.indexOf('</' + m[1] + '>', re.lastIndex);
        const inner = close > 0 ? this._html.slice(re.lastIndex, close) : '';
        const txt = (x) => x.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
        if (el.tagName === 'TEXTAREA') el.value = txt(inner);
        else el.textContent = txt(inner.replace(/<[^>]*>/g, ''));
        el.parentNode = this;
        this.children.push(el);
      }
    }
    get innerHTML() { return this._html; }
  }
  doc.documentElement = new El('html');
  doc.body = new El('body');
  doc.documentElement.appendChild(doc.body);
  doc.documentElement.parentNode = doc;
  doc.children = [doc.documentElement];
  doc._ls = {};
  doc.createElement = (tag) => new El(tag);
  doc.addEventListener = (t, fn) => { (doc._ls[t] = doc._ls[t] || []).push(fn); };
  doc.removeEventListener = () => {};
  doc.matches = () => false;
  doc.getElementById = (id) => { let f = null; doc.documentElement._walk((c) => { if (!f && c.id === id) f = c; }); return f; };
  doc.querySelectorAll = (sel) => doc.documentElement.querySelectorAll(sel);
  doc.querySelector = (sel) => doc.documentElement.querySelector(sel);
  /* نصّ العنصر المرئيّ كلّه: محتواه المرسوم بـinnerHTML (بسماته: placeholder وtitle…) ونصوصه وسماته المكتوبة بالكود. */
  doc.allText = (el) => {
    let s = el._html + ' ' + el.textContent + ' ' + el.title + ' ' + Object.values(el.attrs).join(' ') + ' ' + (el.value || '');
    for (const c of el.children) s += ' ' + doc.allText(c);
    return s;
  };
  return { document: doc, El };
}

/* بثّ SSE وهميّ بصيغة ردّ /api/ai?action=chat: كلّ سطر حدث data: */
function sseResponse(events) {
  const chunks = events.map((e) => 'data: ' + (typeof e === 'string' ? e : JSON.stringify(e)) + '\n\n');
  const enc = new TextEncoder();
  let i = 0;
  return {
    ok: true, status: 200,
    body: { getReader() { return { read() { return Promise.resolve(i < chunks.length ? { done: false, value: enc.encode(chunks[i++]) } : { done: true }); }, cancel() { return Promise.resolve(); } }; } },
  };
}

module.exports = { makeDom, sseResponse };
