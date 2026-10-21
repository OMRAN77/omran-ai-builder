// tests/edu-lab-cache.test.cjs — v-edu-lab-cache (تدقيق ١٨–١٩ أكتوبر، لقطة ٠١٥).
// العرض: التجربة الحيّة المبنيّة لا تظهر بعد إعادة فتح الدرس — يطلب «ابنِ» مرّة ثانية، مع أنّها محفوظة للمسجَّل في KV.
// الجذر: العميل لا يسأل عنها إلّا عند «ابنِ»، والخادم يفحص المفتاح قبل الذاكرة.
// القرار: الخادم يبحث في الذاكرة أوّلًا، وcachedOnly يرجع {html:null} عند الغياب بلا حصّة ولا نموذج؛ والعميل يسأل بها للمسجَّل قبل زرّ البناء.
// الاختبار: المعالج الحقيقيّ api/edu.js مع kv وauth في الذاكرة وfetch مسجِّل (نمط edu-econ)، وrenderLab الحقيقيّ في vm.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.AUTH_SECRET = 'edu-lab-cache-secret';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENROUTER_API_KEY;

const root = path.join(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

const db = new Map();
stub('api/_lib/kv.js', {
  kvGetJSON: async (k) => (db.has(k) ? db.get(k) : null),
  kvPutJSON: async (k, v) => { db.set(k, v); },
  kvDel: async (k) => { db.delete(k); },
  kvIncr: async (k) => { const n = (Number(db.get(k)) || 0) + 1; db.set(k, n); return n; },
  kvExpire: async () => true,
});
const users = new Map();
const sign = (p) => crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
function makeToken(u) { const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 3600_000 })).toString('base64url'); return p + '.' + sign(p); }
function verifyToken(t) {
  try { const [p, s] = String(t).split('.'); if (s !== sign(p)) return null; const d = JSON.parse(Buffer.from(p, 'base64url').toString()); return d.exp < Date.now() ? null : d.u; } catch (e) { return null; }
}
stub('api/_lib/auth.js', {
  verifyToken,
  getUser: async (u) => users.get(String(u).toLowerCase()) || null,
  getUserOnce: async (u) => users.get(String(u).toLowerCase()) || null,
  putUser: async (u, rec) => { users.set(String(u).toLowerCase(), rec); },
  isBanned: async () => false,
});
users.set('sara', { username: 'sara', createdAt: Date.now() - 86400000 * 3, points: 70 });
const TOKEN = makeToken('sara');

const calls = [];
global.fetch = async (url) => { calls.push(String(url)); throw new Error('لا نداء نموذج في هذا الاختبار'); };
const edu = require(rp('api/edu.js'));
function call(body) {
  const start = calls.length;
  return new Promise((resolve) => {
    const res = { code: 200, setHeader() {}, getHeader() {}, status(c) { this.code = c; return this; },
      json(j) { resolve({ code: this.code, j, calls: calls.slice(start) }); return this; }, end() { resolve({ code: this.code, calls: calls.slice(start) }); return this; } };
    edu({ method: 'POST', body, headers: { 'x-forwarded-for': '10.9.9.9' }, query: {} }, res);
  });
}
const counters = () => [...db.keys()].filter((k) => k.startsWith('edu:'));

test('١. cachedOnly بلا تجربة محفوظة: {html:null} بلا نداء نموذج ولا عدّاد حصّة (حتّى بلا مفتاح الخادم)', async () => {
  const r = await call({ action: 'lab', id: 'L1', cachedOnly: true, token: TOKEN });
  assert.equal(r.code, 200, JSON.stringify(r.j));
  assert.deepEqual(r.j, { ok: true, html: null });
  assert.equal(r.calls.length, 0);
  assert.deepEqual(counters(), []);
});

test('٢. التجربة المحفوظة تُعاد مجّانًا قبل فحص المفتاح — والطلب العاديّ أيضًا', async () => {
  db.set('db/edu/labs/sara/L2.json', { html: '<!doctype html><html><body>lab</body></html>', at: 1 });
  const a = await call({ action: 'lab', id: 'L2', cachedOnly: true, token: TOKEN });
  assert.equal(a.code, 200, JSON.stringify(a.j));
  assert.equal(a.j.html, '<!doctype html><html><body>lab</body></html>');
  const b = await call({ action: 'lab', id: 'L2', title: 't', summary: 's', token: TOKEN });
  assert.equal(b.code, 200, JSON.stringify(b.j));
  assert.ok(b.j.cached && b.j.html);
  assert.equal(a.calls.length + b.calls.length, 0);
  assert.deepEqual(counters(), []);
});

test('٣. الضيف بـcachedOnly: {html:null}، والبناء الفعليّ بلا مفتاح يبقى خطأ الخادم كما كان', async () => {
  const g = await call({ action: 'lab', id: 'L3', cachedOnly: true });
  assert.deepEqual(g.j, { ok: true, html: null });
  const miss = await call({ action: 'lab', id: 'L9', title: 't', summary: 's', token: TOKEN });
  assert.equal(miss.code, 500);
  assert.match(miss.j.error, /missing ANTHROPIC_API_KEY/);
  assert.equal(g.calls.length + miss.calls.length, 0);
});

/* ── العميل: renderLab الحقيقيّ ── */
const eduSrc = fs.readFileSync(path.join(root, 'js/edu.js'), 'utf8');
function extract(src, head) {
  const i = src.indexOf(head); assert.ok(i >= 0, head);
  let d = 0; for (let j = src.indexOf('{', i); j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}' && --d === 0) return src.slice(i, j + 1); }
  throw new Error('لم يُغلق');
}
function labCtx(token, reply) {
  const pane = { innerHTML: '', kids: [], appendChild(c) { this.kids.push(c); } };
  const sent = [];
  const els = {};
  const document = {
    getElementById: (id) => (pane.innerHTML.includes('id="' + id + '"') ? (els[id] = els[id] || { id }) : null),
    createElement: () => ({ style: {}, setAttribute() {} }),
  };
  const ctx = { document, esc: (s) => String(s), T: (k) => k, eduL: (a) => a, appLang: () => 'ar', eduNativeLang: () => 'ar', getToken: () => token,
    localLessons: () => [], saveLocalLessons() {}, __swallow() {},
    api: (p) => { sent.push(p); return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply); } };
  vm.runInNewContext(extract(eduSrc, 'function renderLab(pane,lesson)') + ';this.renderLab=renderLab;', ctx);
  return { ctx, pane, sent, els };
}
const flush = () => new Promise((r) => setImmediate(r));
const LESSON = () => ({ id: 'L2', title: 't', subject: 's', summary: 'x' });

test('٤. المسجَّل: إعادة فتح التجربة تسأل الخادم بـcachedOnly وتعرض المحفوظة بلا «ابنِ»', async () => {
  const t = labCtx('tok', { ok: true, html: '<html>saved</html>' });
  const lesson = LESSON();
  t.ctx.renderLab(t.pane, lesson);
  assert.equal(t.sent.length, 1);
  assert.equal(t.sent[0].action, 'lab'); assert.equal(t.sent[0].cachedOnly, true); assert.equal(t.sent[0].id, 'L2');
  assert.ok(!t.pane.innerHTML.includes('eduLabBuild'), 'لا زرّ بناء أثناء السؤال');
  await flush();
  assert.equal(lesson.__labHtml, '<html>saved</html>');
  assert.ok(t.pane.innerHTML.includes('eduLabRedo') && t.pane.kids.length === 1, 'الإطار معروض');
});

test('٥. لا محفوظ أو خطأ شبكة: المقدّمة وزرّ البناء كما كانت؛ والضيف لا يسأل', async () => {
  const none = labCtx('tok', { ok: true, html: null }); none.ctx.renderLab(none.pane, LESSON()); await flush();
  assert.ok(none.pane.innerHTML.includes('id="eduLabBuild"'));
  const err = labCtx('tok', new Error('net')); err.ctx.renderLab(err.pane, LESSON()); await flush();
  assert.ok(err.pane.innerHTML.includes('id="eduLabBuild"'));
  const guest = labCtx('', { ok: true, html: 'x' }); guest.ctx.renderLab(guest.pane, LESSON());
  assert.equal(guest.sent.length, 0);
  assert.ok(guest.pane.innerHTML.includes('id="eduLabBuild"'));
  /* البناء نفسه بلا cachedOnly */
  const b = labCtx('', { ok: true, html: '<html>new</html>' }); b.ctx.renderLab(b.pane, LESSON());
  b.els.eduLabBuild.onclick();
  assert.equal(b.sent[0].cachedOnly, undefined);
});
