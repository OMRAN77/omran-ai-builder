'use strict';
/* v-rich-reply (لقطات المالك ١٣ أكتوبر: ChatGPT يجيب «عطني معلومات عن الامارات والسعوديه» في ثوانٍ بعناوين وصور حقيقيّة تحت كلّ
   دولة وبطاقة أسئلة «اعرض التفاصيل»، وعندنا GPT-6 Astra «فكّر لمدّة 44 ث» ثمّ نقاط بلا صور — «اريد الردود اقوى… وفيها صور…
   دقق على الأسلوب… والسرعه»). يثبّت:
   - السرعة: طلب المعلومات بجهد التفكير الأدنى، وبحثه بلا الخرائط (كانت تسبق كلّ بحث محلّيّ بنداء حتّى ٩ ث)، والويب لا ينتظر
     التواصل أكثر من ١٫٥ ث بعده، وPerplexity بمهلة ١٠ ث (بعدها Google في السلسلة نفسها).
   - الشكل: ملاحظة RICH_REPLY_NOTE تصل ذيل الدور في طلب المعلومات وحده (النظام ثابت فيبقى كاشه).
   - الواجهة: سطر [[IMG: …]] معرض صور حقيقيّة (ويكيبيديا)، وسؤالان بخيارات = بطاقة واحدة بزرّ «اعرض التفاصيل» (١٤ لغة).
   المعالج الحقيقيّ (api/_lib/chat.js) على مسار GPT المباشر بـfetch مزيّف، والراسم الحقيقيّ (app-02) في vm بصفحة مصغّرة. */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.AUTH_SECRET = 'rich-reply-test-secret';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
for (const k of ['GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'CHAT_IMAGE_MODEL', 'CHAT_OPENAI_MODEL', 'CHAT_MAX_STEPS', 'GOOGLE_SEARCH_API_KEY', 'GOOGLE_SEARCH_CX', 'GOOGLE_CSE_KEY', 'GOOGLE_CSE_CX']) delete process.env[k];

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rp = (f) => require.resolve(path.join(root, f));
const stub = (f, e) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports: e }; };
const db = new Map();
stub('api/_lib/kv.js', {
  kvGetJSON: async (k) => (db.has(k) ? structuredClone(db.get(k)) : null), kvPutJSON: async (k, v) => { db.set(k, structuredClone(v)); },
  kvDel: async (k) => { db.delete(k); }, kvExpire: async () => {}, kvGetRaw: async () => null, kvSetRaw: async () => {}, kvIncr: async () => 1,
  kvIncrBy: async () => 1, kvDecrBy: async () => 0, kvSetIfAbsent: async () => true, kvList: async () => [],
});
stub('api/_lib/_usage.js', {
  DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', todayCount: async () => 0, bumpCount: async () => {},
  checkAndConsume: async () => ({ allowed: true, username: 'omran', tier: 'owner', subscriber: true }),
});
stub('api/_lib/_vip.js', { isVip: async () => false });
stub('api/_lib/_knowledge.js', { ownerKnowledge: () => '' });
stub('api/_lib/_owner-alert.js', { alertOwnerCredit: async () => {}, alertOwnerError: async () => {}, isCreditFailure: () => false });
const placesAsked = [];
stub('api/_lib/search.js', {
  fetchPlaces: async (key, q) => { placesAsked.push(q); return []; },
  isPlacesAsk: (q) => /مطعم|مطاعم|فندق|عياد/.test(String(q || '')),
  regionOf: () => '',
});
const le = require(rp('api/_lib/log-error.js'));
le.logErrorAndFlush = async () => {}; le.logError = () => {};
const chat = require(rp('api/_lib/chat.js'));
const rs = require(rp('api/_lib/reply-style.js'));
const ot = require(rp('api/_lib/owner-think.js'));

const ASK = 'عطني معلومات عن الامارات العربية والسعوديه';

test('١. الكاشف: طلب المعلومات (ونصّ بحث الموديل وsite:) لا الشراء ولا التحليل؛ و«من هو» والمقارنة شكلٌ غنيّ', () => {
  for (const s of [ASK, 'ابي نبذة عن برج خليفة', 'حقائق عن اليابان', 'الإمارات العربية المتحدة حقائق الدولة', 'site:u.ae about the UAE fact sheet', 'tell me about Dubai', 'وعطني معلومات عن قطر'])
    assert.equal(rs.isInfoAsk(s), true, s);
  for (const s of ['كم سعر الذهب اليوم', 'اعمل لي موقع لمطعمي', 'السلام عليكم', 'مطاعم في عجمان', 'ترجم لي هذي الجملة', '', 'معلومات '.repeat(80)])
    assert.equal(rs.isInfoAsk(s), false, s.slice(0, 30));
  for (const s of [ASK, 'من هو الشيخ زايد', 'قارن بين دبي والرياض', 'وش الفرق بين الآيفون والسامسونج']) assert.equal(rs.wantsRichReply(s), true, s);
  for (const s of ['كم سعر الذهب اليوم', 'اكتب لي قصيدة', 'هلا']) assert.equal(rs.wantsRichReply(s), false, s);
});

test('٢. تفكير المالك: طلب المعلومات light (يفكّر ويظهر تفكيره بالجهد الأدنى — v-owner-light)، والتحليل والكود والشغل البرمجيّ deep', () => {
  assert.equal(ot.ownerThinks(ASK, {}), true, 'يفكّر ويظهر تفكيره');
  assert.equal(ot.ownerThinkLevel(ASK, {}), 'light', 'بالجهد الأدنى');
  assert.equal(ot.ownerThinks('حلّل لي معلومات هذا التقرير', {}), true, 'التحليل يفكّر');
  assert.equal(ot.ownerThinks('اشرح لي الذكاء الاصطناعي باختصار', {}), true, 'الشرح كما كان (v-owner-think-all)');
  const code = [{ role: 'user', content: 'سوّ زر' }, { role: 'assistant', content: '```html\n<b>x</b>\n```' }];
  assert.equal(ot.ownerThinkLevel('عطني معلومات عن الكود هذا', { history: code }), 'deep', 'وسط شغل الكود يفكّر بعمق');
  assert.equal(ot.ownerThinks('وش هذا', { image: true }), true, 'الصورة تحليل');
});

test('٣. مهلة التواصل: الويب يعود بعد وصوله بمهلة قصيرة إن تأخّر التواصل، والتواصل السريع يدخل، وفشله لا شيء', async () => {
  const later = (v, ms) => new Promise((r) => setTimeout(() => r(v), ms));
  let t0 = Date.now();
  let [w, s] = await rs.withSocialGrace(later('WEB', 20), later('SOC', 1500), 60);
  assert.equal(w, 'WEB'); assert.equal(s, null, 'التواصل المتأخّر لا يؤخّر الردّ');
  assert.ok(Date.now() - t0 < 600, 'رجع بعد الويب بالمهلة: ' + (Date.now() - t0));
  [w, s] = await rs.withSocialGrace(later('WEB', 30), later('SOC', 10), 60);
  assert.equal(s, 'SOC');
  [w, s] = await rs.withSocialGrace(later('WEB', 5), Promise.reject(new Error('down')), 60);
  assert.equal(w, 'WEB'); assert.equal(s, null);
  assert.equal(rs.SOCIAL_GRACE_MS, 1500);
});

// ── المعالج الحقيقيّ: المالك على GPT-6 Astra بمفتاح OpenAI المباشر، والموديل يبحث مرّة ثمّ يجيب ──
function token(u) {
  const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 600000 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
}
const sse = (evs) => new Response(evs.map((e) => 'event: ' + e.type + '\ndata: ' + JSON.stringify(e) + '\n\n').join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const done = { type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 10, output_tokens: 2 } } };
const R = {
  text: (t) => sse([{ type: 'response.created', response: { model: 'gpt-6-astra' } }, { type: 'response.output_text.delta', output_index: 0, delta: t }, done]),
  search: (q) => {
    const id = 'call_s1', args = JSON.stringify({ query: q });
    return sse([{ type: 'response.created', response: { model: 'gpt-6-astra' } },
      { type: 'response.output_item.added', output_index: 0, item: { type: 'function_call', call_id: id, name: 'web_search', arguments: '' } },
      { type: 'response.function_call_arguments.delta', output_index: 0, delta: args },
      { type: 'response.output_item.done', output_index: 0, item: { type: 'function_call', call_id: id, name: 'web_search', arguments: args, status: 'completed' } }, done]);
  },
};
const ANSWER = 'الإمارات والسعوديّة جارتان خليجيّتان.\n\n## 🇦🇪 الإمارات\n[[IMG: برج خليفة / Burj Khalifa | مسجد الشيخ زايد الكبير / Sheikh Zayed Grand Mosque]]\n- **العاصمة:** أبوظبي';
async function run(messages, { socialMs }) {
  const calls = [], out = [];
  const save = global.fetch;
  global.fetch = async (url, init) => {
    const u = String(url);
    let b = null; try { b = init && typeof init.body === 'string' ? JSON.parse(init.body) : null; } catch (e) { b = null; }
    calls.push({ url: u, body: b, at: Date.now() });
    if (/api\.openai\.com\/v1\/responses/.test(u)) return calls.filter((c) => /v1\/responses/.test(c.url)).length === 1 ? R.search('الإمارات العربية المتحدة حقائق') : R.text(ANSWER);
    if (/api\.perplexity\.ai/.test(u) && !(b && b.search_domain_filter)) {
      return new Response(JSON.stringify({ choices: [{ message: { content: 'الإمارات اتّحاد من سبع إمارات عاصمته أبوظبي.' } }], search_results: [{ url: 'https://u.ae/ar', title: 'u.ae' }] }), { status: 200 });
    }
    if (/api\.tavily\.com/.test(u) && b && b.include_domains) { // التواصل: بطيء
      await new Promise((r) => setTimeout(r, socialMs));
      return new Response(JSON.stringify({ results: [{ url: 'https://www.youtube.com/watch?v=1', title: 'UAE vlog', content: 'x' }] }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  };
  const req = { method: 'POST', headers: {}, body: { token: token('omran'), provider: 'openai', model: 'openai/gpt-6-astra', messages } };
  const res = { setHeader() {}, status() { return this; }, json(v) { out.push(JSON.stringify(v)); return this; }, write(c) { out.push(String(c)); return true; }, end() {}, flushHeaders() {} };
  try { await chat(req, res); } finally { global.fetch = save; }
  const events = out.join('').split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return {}; } });
  return { calls, oa: calls.filter((c) => /v1\/responses/.test(c.url)), text: events.map((e) => e.delta || '').join('') };
}
const withEnv = async (fn) => {
  Object.assign(process.env, { OPENAI_API_KEY: 'sk-openai-test', PERPLEXITY_API_KEY: 'pplx-test', TAVILY_API_KEY: 'tvly-test', GOOGLE_PLACES_API_KEY: 'places-test' });
  try { return await fn(); } finally { for (const k of ['OPENAI_API_KEY', 'PERPLEXITY_API_KEY', 'TAVILY_API_KEY', 'GOOGLE_PLACES_API_KEY']) delete process.env[k]; }
};

test('٤. دور المالك «معلومات عن الإمارات والسعوديّة»: جهد low، شكل ChatGPT في ذيل الدور، البحث بلا خرائط، والتواصل البطيء لا يؤخّره', async () => {
  await withEnv(async () => {
    placesAsked.length = 0;
    const r = await run([{ role: 'user', content: ASK }], { socialMs: 3000 });
    assert.equal(r.oa.length, 2, 'بحث ثمّ جواب');
    assert.equal(r.oa[0].body.reasoning && r.oa[0].body.reasoning.effort, 'low', 'الجهد الأدنى لـAstra: ' + JSON.stringify(r.oa[0].body.reasoning));
    const tail = JSON.stringify(r.oa[0].body.input || '');
    assert.ok(tail.includes('[شكل هذا الردّ') && tail.includes('[[IMG: اسم١ | اسم٢ | اسم٣]]') && tail.includes('[[OPT]]'), 'ملاحظة الشكل في ذيل الدور');
    assert.ok(!JSON.stringify(r.oa[0].body.instructions || '').includes('[شكل هذا الردّ'), 'لا في النظام (كاشه ثابت)');
    assert.deepEqual(placesAsked, [], 'لا خرائط لطلب معلومات: ' + JSON.stringify(placesAsked));
    const gap = r.oa[1].at - r.oa[0].at;
    assert.ok(gap < 2600, 'نتيجة البحث لم تنتظر التواصل (٣ ث): ' + gap + 'ms');
    const toolOut = JSON.stringify(r.oa[1].body.input || '');
    assert.ok(toolOut.includes('أبوظبي'), 'نتيجة الويب وصلت الموديل');
    assert.ok(!toolOut.includes('UAE vlog'), 'التواصل المتأخّر خارجها');
    assert.ok(r.text.includes('[[IMG: برج خليفة'), 'سطر الصور يصل الواجهة كما هو');
  });
});

test('٥. غير طلب المعلومات: سؤال الأماكن يمرّ بالخرائط، ولا ملاحظة شكل، والردّ العاديّ بالجهد الأدنى (v-owner-light)', async () => {
  await withEnv(async () => {
    placesAsked.length = 0;
    const save = R.search;
    R.search = () => save('مطاعم مندي في عجمان');
    try {
      const r = await run([{ role: 'user', content: 'وين أحصل مندي زين في عجمان' }], { socialMs: 5 });
      assert.deepEqual(placesAsked, ['مطاعم مندي في عجمان'], 'الخرائط كما كانت');
      assert.ok(!JSON.stringify(r.oa[0].body).includes('[شكل هذا الردّ'), 'لا ملاحظة شكل');
      assert.equal(r.oa[0].body.reasoning && r.oa[0].body.reasoning.effort, 'low', 'v-owner-light: الردّ العاديّ low');
      assert.ok(r.oa[0].body.reasoning.summary, 'وتفكيره ظاهر');
    } finally { R.search = save; }
  });
});

test('٦. Perplexity بمهلة ١٠ ث لا ٢٠ (بعدها Google في السلسلة نفسها)', () => {
  const c = read('api/_lib/chat.js');
  const s = c.indexOf('async function pplxSearch('), e = c.indexOf('\n}\n', s);
  assert.match(c.slice(s, e), /\}, 10000\); \/\/ v-rich-reply/);
});

// ── الواجهة: المعرض في الراسم الحقيقيّ ──
class Txt { constructor(t){ this.nodeType = 3; this.textContent = t; this.parentNode = null; this.className = ''; } }
class El {
  constructor(tag){
    this.tagName = tag.toUpperCase(); this.nodeType = 1; this.childNodes = []; this.parentNode = null; this.className = ''; this.style = {}; this._attrs = {};
    const self = this;
    this.classList = { add(c){ if(!self.classList.contains(c)) self.className = (self.className + ' ' + c).trim(); }, remove(c){ self.className = self.className.split(/\s+/).filter((x) => x && x !== c).join(' '); }, toggle(c, on){ if(on) this.add(c); else this.remove(c); }, contains(c){ return self.className.split(/\s+/).indexOf(c) >= 0; } };
  }
  appendChild(n){ if(n.parentNode) n.parentNode.removeChild(n); n.parentNode = this; this.childNodes.push(n); return n; }
  insertBefore(n, ref){ if(n.parentNode) n.parentNode.removeChild(n); n.parentNode = this; const i = this.childNodes.indexOf(ref); if(i < 0) this.childNodes.push(n); else this.childNodes.splice(i, 0, n); return n; }
  removeChild(n){ const i = this.childNodes.indexOf(n); if(i >= 0) this.childNodes.splice(i, 1); n.parentNode = null; return n; }
  remove(){ if(this.parentNode) this.parentNode.removeChild(this); }
  get textContent(){ return this.childNodes.map((c) => c.textContent).join(''); }
  set textContent(v){ this.childNodes = []; if(v !== '' && v != null) this.appendChild(new Txt(String(v))); }
  get innerHTML(){ return this.textContent; }
  set innerHTML(v){ this.childNodes = []; }
  setAttribute(k, v){ this._attrs[k] = v; } getAttribute(k){ return this._attrs[k]; }
  querySelectorAll(sel){ const cls = String(sel).replace(/^\./, ''); const out = []; const walk = (n) => (n.childNodes || []).forEach((c) => { if(c.classList && c.classList.contains(cls)) out.push(c); walk(c); }); walk(this); return out; }
  querySelector(sel){ return this.querySelectorAll(sel)[0] || null; }
  addEventListener(){}
}
const WIKI = {
  'Burj Khalifa': 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/93/Burj_Khalifa.jpg/800px-Burj_Khalifa.jpg',
  'Sheikh Zayed Grand Mosque': 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/SZGM.jpg/800px-SZGM.jpg',
  'Flag of Nowhere': 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/ff/Flag.svg/800px-Flag.svg.png',
};
function loadApp02(){
  const asked = [];
  const document = { createElement: (t) => new El(t), createTextNode: (t) => new Txt(t), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener(){}, documentElement: new El('html'), head: new El('head'), body: new El('body') };
  const fetch = async (u) => {
    const q = decodeURIComponent((/gsrsearch=([^&]*)/.exec(u) || [])[1] || '');
    asked.push(q);
    const src = WIKI[q];
    return { ok: true, json: async () => (src ? { query: { pages: { 1: { title: q, thumbnail: { source: src } } } } } : {}) };
  };
  const ctx = { document, navigator: { userAgent: 'node' }, localStorage: { getItem: () => null, setItem(){} }, sessionStorage: { getItem: () => null, setItem(){} },
    $: () => null, __swallow(){}, console, setTimeout, clearTimeout, setInterval, clearInterval, Audio: function(){}, fetch, t: (k) => k, lang: 'ar',
    requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame: clearTimeout, URL, encodeURIComponent };
  ctx.window = ctx;
  vm.runInNewContext(read('js/app-02-tts.js') + '\n;this.__b = buildSpokenWordSpans; this.__sp = omranSpeechNoImg; this.__pt = omranImgPartial;', ctx);
  ctx.asked = asked;
  return ctx;
}
const all = (n, f, out = []) => { (n.childNodes || []).forEach((c) => { if (f(c)) out.push(c); all(c, f, out); }); return out; };
const shown = (n) => (n.style && n.style.display === 'none') ? '' : (n.nodeType === 3 ? n.textContent : n.childNodes.map(shown).join(''));
const flush = () => new Promise((r) => setTimeout(r, 20));

test('٧. سطر [[IMG: …]] معرض كتلة: صور ويكيبيديا الحقيقيّة، الاسم الإنجليزيّ أوّلًا، العلم (svg) والمجهول يسقطان، ولا يظهر السطر خامًا', async () => {
  const c = loadApp02();
  const box = new El('div');
  const reply = '## 🇦🇪 الإمارات\n[[IMG: برج خليفة / Burj Khalifa | مسجد الشيخ زايد الكبير / Sheikh Zayed Grand Mosque | علم / Flag of Nowhere | شيء / Nothing Here]]\n- **العاصمة:** أبوظبي';
  const words = c.__b(box, reply);
  const g = box.childNodes.find((n) => n.className === 'md-gallery');
  assert.ok(g, 'كتلة المعرض بين الأسطر');
  assert.ok(!/\[\[IMG|Burj Khalifa/.test(shown(box)), 'لا سطر خام: ' + shown(box));
  await flush();
  const imgs = all(g, (n) => n.tagName === 'IMG');
  assert.deepEqual(imgs.map((i) => i.src), [WIKI['Burj Khalifa'], WIKI['Sheikh Zayed Grand Mosque']], 'صورتان حقيقيّتان');
  assert.equal(imgs[0].alt, 'برج خليفة', 'الاسم العربيّ وصفًا');
  assert.equal(g.getAttribute('data-n'), '2', 'تخطيط صورتين');
  assert.ok(c.asked.indexOf('Burj Khalifa') >= 0 && c.asked.indexOf('برج خليفة') < 0, 'الإنجليزيّ يكفي عن العربيّ: ' + c.asked.join(','));
  assert.ok(c.asked.indexOf('شيء') >= 0, 'المجهول بالإنجليزيّة يُجرَّب بالعربيّة');
  // القراءة الصوتيّة: كلمات السطر عناصر مخفيّة بعددها، ونصّ النطق بلا أسماء الصور وبالعدد نفسه
  const line = reply.split('\n')[1];
  const hidden = all(g, (n) => /tts-word/.test(n.className) && n.style.display === 'none');
  assert.equal(hidden.length, line.match(/\S+/g).length, 'محاذاة tts-word');
  const spoken = c.__sp(reply);
  assert.equal(spoken.match(/\S+/g).length, reply.match(/\S+/g).length, 'عدد الكلمات باقٍ');
  assert.ok(!/Burj|IMG/.test(spoken), 'لا يُنطق السطر');
  assert.ok(Array.isArray(words) || words == null || typeof words === 'object');
  // إعادة الرسم (البثّ) لا تعيد الطلب، وترسم فورًا بلا هيكل
  const n0 = c.asked.length;
  const box2 = new El('div');
  c.__b(box2, reply);
  assert.equal(c.asked.length, n0, 'الطلب مرّة في الجلسة');
  const g2 = box2.childNodes.find((n) => n.className === 'md-gallery');
  assert.equal(all(g2, (n) => n.tagName === 'IMG').length, 2, 'فوريّة من الذاكرة');
});

test('٨. البثّ: سطر صور لم يُغلق لا يظهر خامًا، وداخل كتلة كود يبقى نصًّا', async () => {
  const c = loadApp02();
  for (const s of ['[', '[[', '[[IM', '[[IMG:', '[[IMG: برج خليفة / Burj']) assert.equal(c.__pt(s), true, s);
  for (const s of ['[[IMG: برج خليفة]]', 'نصّ عاديّ', '[رابط](https://x.y)', '']) assert.equal(c.__pt(s), false, s);
  assert.match(read('js/app-02-tts.js'), /if\(omranImgPartial\(__st\.slice\(__nl \+ 1\)\)\) __st = __st\.slice\(0, __nl \+ 1\)\.trimEnd\(\);/);
  const box = new El('div');
  c.__b(box, '```\n[[IMG: برج خليفة]]\n```');
  assert.ok(!box.childNodes.some((n) => n.className === 'md-gallery'), 'الكود لا يُمسّ');
});

test('٩. بطاقة الأسئلة: سؤالان بخيارات = بطاقة واحدة (السؤال داخلها) بزرّ يرسل الاختيارين؛ السؤال الواحد كما كان', () => {
  const src = read('js/app-04-i18n-state.js');
  const s = src.indexOf('function omranExtractOptions('), e = src.indexOf('function omranSendOption(');
  const ctx = {};
  vm.runInNewContext(src.slice(s, e) + ';this.x = omranExtractOptions;', ctx);
  const two = 'هذي نبذة.\n\n**أي موضوع يهمك أكثر؟**\n[[OPT]]التاريخ والحكام|الاقتصاد|السياحة[[/OPT]]\nعن أي دولة؟\n[[OPT]]الإمارات فقط|السعودية فقط|البلدان معًا[[/OPT]]';
  const r = ctx.x(two);
  assert.equal(r.text, 'هذي نبذة.', 'السؤالان خرجا من النصّ إلى البطاقة: ' + JSON.stringify(r.text));
  assert.equal(r.blocks.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(r.blocks[0].form)), [
    { q: 'أي موضوع يهمك أكثر؟', items: ['التاريخ والحكام', 'الاقتصاد', 'السياحة'] },
    { q: 'عن أي دولة؟', items: ['الإمارات فقط', 'السعودية فقط', 'البلدان معًا'] },
  ]);
  const one = ctx.x('تبي أكمل؟\n[[OPT]]نعم|لا[[/OPT]]');
  assert.equal(one.text, 'تبي أكمل؟');
  assert.deepEqual(JSON.parse(JSON.stringify(one.blocks)), [{ multi: false, items: ['نعم', 'لا'] }], 'السؤال الواحد أزرار فوريّة كما كان');
  assert.match(src, /send\.onclick = function\(\)\{ const v = picked\.filter\(Boolean\); if\(v\.length\) omranSendOption\(v\.join\(' — '\)\); \};/);
  assert.match(src, /if\(blocks\.length === 1 && blocks\[0\]\.form\)\{ omranRenderOptForm\(host, blocks\[0\]\.form\); return; \}/);
});

test('١٠. زرّ البطاقة بالـ١٤ لغة ووسم ملفّات اللغات مرفوع، والحزمة تحمل المعرض والبطاقة', () => {
  const data = read('js/app-03-i18n-data.js');
  assert.equal((data.match(/optFormSend: '/g) || []).length, 2, 'العربيّة والإنجليزيّة');
  for (const lg of ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh']) assert.match(read('i18n/' + lg + '.js'), /optFormSend: '[^']+'/, lg);
  const tag = +(/i18n\/' \+ lg \+ '\.js\?v=(\d+)'/.exec(read('js/app-04-i18n-state.js')) || [])[1];
  assert.ok(tag >= 744, 'الوسم مرفوع: ' + tag);
  const bundle = read('js/app.bundle.js');
  for (const k of ['function omranGalleryEl(', 'function omranMdImgMark(', 'function omranRenderOptForm(', 'omranSpeechNoImg(text)']) assert.ok(bundle.includes(k), k);
});
