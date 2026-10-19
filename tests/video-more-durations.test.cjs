// tests/video-more-durations.test.cjs — v-vmk-more-dur: بقيّة المدد في «خيارات إضافية» (v-vmk-simple: «نقلٌ لا حذف»)
// العرض (فحص الإنتاج ١٨–١٩ أكتوبر): «20 (مشهدين)» و«فيلم متكامل» و«إعلان سريع» و«ريلز ذكي» لا تظهر أبدًا، و«طويل (دقائق)» لا يظهر للمالك —
// #vmkMoreDur فارغ ومخفيّ في كلّ وضع. الجذر: sync() تنادي simplify() (منذ v-vmk-quality) فيُفرَّغ الصندوق (box.innerHTML='')
// بعد أن نُقلت إليه الحبّات، ولا يبقى في مجموعة المدّة ما يُنقل. يُشغَّل هنا group/simplify/sync الحقيقيّة على DOM مصغّر بترتيب enhance().
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const SRC = read('js/video.js');

/* ── DOM مصغّر: ما تلمسه group/simplify/sync فقط (محدِّد بسيط واحد أو مفصول بفواصل، وinnerHTML بوسوم بسيطة) ── */
function matches(n, sel) {
  return String(sel).split(',').some((s) => {
    const m = /^([a-z0-9]+)?(#[\w-]+)?((?:\.[\w-]+)*)(?:\[([\w-]+)(?:="([^"]*)")?\])?$/i.exec(s.trim());
    if (!m) return false;
    if (m[1] && n.tagName !== m[1].toUpperCase()) return false;
    if (m[2] && n.id !== m[2].slice(1)) return false;
    if (m[3] && !m[3].split('.').filter(Boolean).every((c) => n.classList.contains(c))) return false;
    if (m[4]) {
      const v = m[4] === 'data-v' ? n.dataset.v : n.getAttribute(m[4]);
      if (v == null) return false;
      if (m[5] != null && String(v) !== m[5]) return false;
    }
    return true;
  });
}
class El {
  constructor(tag) { this.tagName = String(tag || 'div').toUpperCase(); this.children = []; this.parentNode = null; this.attrs = {}; this.dataset = {}; this.style = { setProperty() {}, removeProperty() {} }; this.className = ''; this.id = ''; this.textContent = ''; this.hidden = false; this._ls = {}; }
  get parentElement() { return this.parentNode; }
  get classList() {
    const n = this, list = () => String(n.className || '').split(/\s+/).filter(Boolean);
    return {
      contains: (c) => list().includes(c),
      add: (...c) => { const s = new Set(list()); c.forEach((x) => s.add(x)); n.className = [...s].join(' '); },
      remove: (...c) => { n.className = list().filter((x) => !c.includes(x)).join(' '); },
      toggle: (c, on) => { const has = list().includes(c), want = on === undefined ? !has : !!on; if (want && !has) n.classList.add(c); if (!want && has) n.classList.remove(c); return want; },
    };
  }
  get firstElementChild() { return this.children[0] || null; }
  get lastElementChild() { return this.children[this.children.length - 1] || null; }
  get nextElementSibling() { const p = this.parentNode; return p ? p.children[p.children.indexOf(this) + 1] || null : null; }
  get previousElementSibling() { const p = this.parentNode; return p ? p.children[p.children.indexOf(this) - 1] || null : null; }
  get nextSibling() { return this.nextElementSibling; }
  _detach() { if (this.parentNode) { const a = this.parentNode.children; a.splice(a.indexOf(this), 1); this.parentNode = null; } }
  appendChild(c) { c._detach(); this.children.push(c); c.parentNode = this; return c; }
  insertBefore(c, ref) { c._detach(); const i = ref ? this.children.indexOf(ref) : -1; this.children.splice(i < 0 ? this.children.length : i, 0, c); c.parentNode = this; return c; }
  removeChild(c) { c._detach(); return c; }
  remove() { this._detach(); }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') this.id = String(v); if (k === 'class') this.className = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(t, f) { (this._ls[t] = this._ls[t] || []).push(f); }
  dispatchEvent(e) { (this._ls[e.type] || []).forEach((f) => f.call(this, e)); if (typeof this['on' + e.type] === 'function') this['on' + e.type](e); return true; }
  closest(sel) { let n = this; while (n) { if (matches(n, sel)) return n; n = n.parentNode; } return null; }
  querySelectorAll(sel) { const out = []; const walk = (x) => x.children.forEach((c) => { if (matches(c, sel)) out.push(c); walk(c); }); walk(this); return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  set innerHTML(html) {
    this.children.slice().forEach((c) => c._detach());
    const frag = new El('frag'); let cur = frag; const re = /<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/gi; let m;
    while ((m = re.exec(String(html)))) {
      if (m[4] !== undefined) { cur.textContent += m[4]; continue; }
      if (m[1]) { cur = cur.parentNode || frag; continue; }
      const n = new El(m[2]); const am = /([\w-]+)="([^"]*)"/g; let a; while ((a = am.exec(m[3]))) n.setAttribute(a[1], a[2]);
      cur.appendChild(n); if (!/^(input|img|br)$/i.test(m[2])) cur = n;
    }
    frag.children.slice().forEach((c) => this.appendChild(c));
  }
  get innerHTML() { return ''; }
}
class Select extends El {
  constructor() { super('select'); this.value = ''; }
  get options() { return this.children.filter((c) => c.tagName === 'OPTION'); }
  get selectedIndex() { return this.options.findIndex((o) => o.value === this.value); }
}
const DUR = [['5', '5'], ['8', '8'], ['10', '10'], ['long20', '20 (⛓️ مشهدين)'], ['film', '🎬 فيلم متكامل (سيناريو + مشاهد + سرد)'],
  ['adspot', '📢 إعلان سريع (5ث طولي + سرد)'], ['reels', '📱 ريلز ذكي (10ث طولي + سرد)']];
const EXTRA = ['long20', 'film', 'adspot', 'reels'];

/* النافذة بعد build(): البطاقة ← .vmk-main ← صفّ ← صندوق المدّة (تسمية + select)، ثمّ تشغيل video.js الحقيقيّ عليها */
function boot() {
  const body = new El('body');
  const doc = {
    body, documentElement: { lang: 'ar', dir: 'rtl' },
    createElement: (t) => new El(t),
    getElementById: (x) => { let hit = null; const walk = (n) => { for (const c of n.children) { if (hit) return; if (c.id === x) { hit = c; return; } walk(c); } }; walk(body); return hit; },
  };
  const M = body.appendChild(new El('div')); M.id = 'videoMakerModal';
  const card = M.appendChild(new El('div'));
  const main = card.appendChild(new El('div')); main.className = 'vmk-main';
  const row = main.appendChild(new El('div')); row.className = 'vmk-row3';
  const box = row.appendChild(new El('div'));
  box.appendChild(new El('label')).setAttribute('data-i18n', 'videoMakerDurationLabel');
  const dur = box.appendChild(new Select()); dur.id = 'videoMakerDuration';
  DUR.forEach(([v, t]) => { const o = dur.appendChild(new El('option')); o.value = v; o.textContent = t; });
  dur.value = '5';
  function Event(type) { this.type = type; }
  const ctx = { document: doc, MutationObserver: function () { this.observe = () => {}; }, Event, setTimeout, clearTimeout, console };
  ctx.window = ctx;
  vm.runInNewContext(SRC.replace('var wasOpen=false;', 'var wasOpen=false; window.__vmk={group:group,simplify:simplify,sync:sync};'), ctx);
  assert.ok(ctx.__vmk, 'خطّاف الاختبار وصل إلى داخل video.js');
  const api = ctx.__vmk;
  /* ترتيب enhance(): group لكلّ select ← simplify ← sync (وsync تنادي simplify مرّة ثانية) */
  const open = () => { api.group(dur, 'pill'); api.simplify(); api.sync(); };
  const vals = (n) => (n ? n.children.map((c) => c.dataset.v) : []);
  const more = () => doc.getElementById('vmkMoreDur');
  const extraBox = () => (more() ? more().querySelector('.vmk-g') : null);
  const basic = () => dur.nextElementSibling;
  const addOwnerLong = () => { const o = new El('option'); o.value = 'longMinutes'; o.id = 'videoMakerDurationLongMinutesOpt'; o.textContent = '🎥 طويل (دقائق) - المالك فقط'; dur.appendChild(o); return o; };
  return { api, dur, open, vals, more, extraBox, basic, addOwnerLong, Event };
}

test('فتح الصانع: بقيّة المدد الأربع في «خيارات إضافية» بعد sync() — والظاهر ٥/٨/١٠ وحدها', () => {
  const d = boot();
  d.open();
  assert.deepEqual(d.vals(d.basic()), ['5', '8', '10'], 'المجموعة الظاهرة: المدد الأساسيّة فقط');
  assert.ok(d.more(), '#vmkMoreDur أُنشئ');
  assert.deepEqual(d.vals(d.extraBox()), EXTRA, 'بقيّة المدد لم تُمحَ بنداء simplify() الثاني داخل sync()');
  assert.notEqual(d.more().style.display, 'none', 'القسم ظاهر لا مخفيّ');
  assert.deepEqual(d.extraBox().children.map((c) => c.textContent), ['20', 'فيلم متكامل', 'إعلان سريع', 'ريلز ذكي'], 'أسماء الحبّات من نصّ الخيار بلا أيقونة ولا قوس');
});

test('النقر على مدّة إضافيّة يختارها ويُبقي القسم كما هو (sync بعد change لا يمحوه)', () => {
  const d = boot();
  d.open();
  const film = d.extraBox().children.find((c) => c.dataset.v === 'film');
  film.dispatchEvent(new d.Event('click'));
  assert.equal(d.dur.value, 'film');
  assert.deepEqual(d.vals(d.extraBox()), EXTRA, 'الحبّات باقية بعد الاختيار');
  assert.equal(film.getAttribute('aria-checked'), 'true', 'الحبّة المختارة معلَّمة');
  assert.equal(d.basic().children.find((c) => c.dataset.v === '5').getAttribute('aria-checked'), 'false');
  d.api.sync(); d.api.sync();
  assert.deepEqual(d.vals(d.extraBox()), EXTRA, 'نداءات sync المتكرّرة لا تفرّغه');
});

test('إعادة الفتح تبني الحبّات من جديد بلا تكرار', () => {
  const d = boot();
  d.open(); d.open(); d.open();
  assert.deepEqual(d.vals(d.extraBox()), EXTRA, 'أربع حبّات لا اثنتا عشرة');
  assert.deepEqual(d.vals(d.basic()), ['5', '8', '10']);
});

test('المالك يرى «طويل (دقائق)» في القسم نفسه، ويزول حين يُزال خياره (حساب غير المالك)', () => {
  const d = boot();
  const o = d.addOwnerLong(); /* ensureLongMinutesOption(owner) في app-11-video.js يسبق enhance() */
  d.open();
  assert.deepEqual(d.vals(d.extraBox()), EXTRA.concat('longMinutes'));
  assert.notEqual(d.more().style.display, 'none');
  o.remove(); /* ensureLongMinutesOption(false) */
  d.open();
  assert.deepEqual(d.vals(d.extraBox()), EXTRA, 'لا حبّة قديمة للمالك عند غيره');
});

test('وسم video.js رُفع (يُحمَّل منفصلًا من index.html)', () => {
  const v = Number((read('index.html').match(/\/js\/video\.js\?v=(\d+)/) || [])[1]);
  assert.ok(v >= 452, 'الوسم ' + v);
});
