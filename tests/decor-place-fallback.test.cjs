// v-decor-fallback (لقطة المالك ١٣ أكتوبر ٢٠٢٦: Decor AI بلا صورة — «خطأ: لم يرجع النموذج أي شكل. جرّب نمطًا أو نوع
// مكان آخر.» على «٣ كراسي فخمة»): المسار كان على gpt-image-2.5-flare وحده — أيّ رفض للموديل أو سلامة أو زحام أو رصيد
// = صفر أشكال، والسبب في detail لا يعرضه العميل. الآن: Flare ← gpt-image-2 لكلّ لقطة، ثمّ نانو برو ← نانو ٢ إن لم يرجع
// شكل من OpenAI، وسبب المزوّد يظهر للمالك وحده. المعالج الحقيقيّ + حصّة التصميم الحقيقيّة؛ KV في الذاكرة وfetch محاكى.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));

process.env.AUTH_SECRET = 'decor-fallback-test-secret';
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'x';
process.env.GEMINI_API_KEY = 'test-gemini';
process.env.OPENAI_API_KEY = 'test-openai';
for (const k of ['IMAGE_DUO', 'OWNER_USERNAMES']) delete process.env[k];

const store = new Map();
const kvImpl = {
  kvGetJSON: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
  kvPutJSON: async (k, v) => { store.set(k, JSON.stringify(v)); },
  kvGetRaw: async (k) => (store.has(k) ? String(store.get(k)) : null),
  kvSetRaw: async (k, v) => { store.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { if (store.has(k)) return false; store.set(k, String(v)); return true; },
  kvIncr: async (k) => { const v = Number(store.get(k) || 0) + 1; store.set(k, String(v)); return v; },
  kvIncrBy: async (k, n) => { const v = Number(store.get(k) || 0) + Number(n); store.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { const v = Number(store.get(k) || 0) - Number(n); store.set(k, String(v)); return v; },
  kvExpire: async () => {},
  kvDel: async (k) => { store.delete(k); },
  kvPipeline: async (cmds) => cmds.map(([op, k, a]) => {
    if (op === 'GET') return store.has(k) ? store.get(k) : null;
    if (op === 'INCRBY') { const v = Number(store.get(k) || 0) + Number(a); store.set(k, String(v)); return v; }
    if (op === 'EXPIRE') return 1;
    if (op === 'DEL') { store.delete(k); return 1; }
    return null;
  }),
};
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
stub('api/_lib/kv.js', new Proxy(kvImpl, { get: (t, p) => t[p] || (async () => null) }));
stub('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });
stub('api/_lib/_vip.js', { isVip: async () => false });

const auth = require(rp('api/_lib/auth.js'));
const design = require(rp('api/_lib/design-create.js'));

// reply(model) ⇒ Response: كلّ موديل يجيب كما يحدّد السيناريو. calls = أسماء الموديلات بترتيب النداء.
let reply = () => null, calls = [];
const realFetch = global.fetch;
global.fetch = async (url, init) => {
  const u = String(url);
  let model = '';
  if (u.includes('api.openai.com')) model = JSON.parse(init.body).model;
  else { const m = u.match(/models\/([^:]+):generateContent/); assert.ok(m, 'نداء يفلت من المحاكاة: ' + u); model = m[1]; }
  calls.push(model);
  const r = reply(model, init);
  if (r) return r;
  return u.includes('openai') ? Response.json({ data: [{ b64_json: 'OAI-' + model }] })
    : Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'GEM-' + model } }] } }] });
};
test.after(() => { global.fetch = realFetch; });

const oaErr = (status, message, code) => Response.json({ error: { message, code } }, { status });
async function place(extra) {
  let done; const sent = new Promise((r) => { done = r; });
  const res = { code: 200, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { done({ code: this.code, body: b }); return this; }, end() { done({ code: this.code }); return this; } };
  const body = Object.assign({ token: auth.makeToken('decoruser'), place: 'custom', notes: '3كراسي فخمه و دزاين', style: 'luxury', rearrange: true, count: 4 }, extra);
  const [out] = await Promise.all([sent, design({ method: 'POST', headers: {}, query: {}, body }, res)]);
  return { code: out.code, body: out.body || {} };
}
const day = new Date().toISOString().slice(0, 10);
const tally = () => Number(store.get('db/design-usage/tally/decoruser/' + day) || 0);
const reset = (fn) => { store.clear(); calls = []; reply = fn || (() => null); };

test('١. الحالة السليمة كما كانت: ٤ أشكال من Flare، أربعة نداءات فقط، لا نانو', async () => {
  reset();
  const r = await place();
  assert.equal(r.code, 200);
  assert.equal(r.body.images.length, 4);
  assert.ok(r.body.images.every((im) => im.imageBase64 === 'OAI-gpt-image-2.5-flare' && im.mimeType === 'image/webp'));
  assert.deepEqual(calls, Array(4).fill('gpt-image-2.5-flare'));
  assert.equal(tally(), 1, 'يُستهلك مقعد واحد');
});

test('٢. Flare غير متاح للمفتاح (400 model) ⇒ gpt-image-2 لكلّ لقطة — كانت «لم يرجع النموذج أي شكل»', async () => {
  reset((m) => (m === 'gpt-image-2.5-flare' ? oaErr(400, "The model 'gpt-image-2.5-flare' does not exist or you do not have access to it.") : null));
  const r = await place();
  assert.equal(r.code, 200);
  assert.equal(r.body.images.length, 4);
  assert.ok(r.body.images.every((im) => im.imageBase64 === 'OAI-gpt-image-2'));
  assert.equal(calls.filter((m) => m === 'gpt-image-2').length, 4);
  assert.ok(!calls.some((m) => /gemini/.test(m)), 'لا نانو ما دام OpenAI رجّع أشكالًا');
});

test('٣. رفض سلامة Flare أو زحامه (٤٢٩) ⇒ الموديل التالي', async () => {
  for (const err of [() => oaErr(400, 'Your request was rejected by the safety system.'), () => oaErr(429, 'Rate limit reached for gpt-image-2.5-flare')]) {
    reset((m) => (m === 'gpt-image-2.5-flare' ? err() : null));
    const r = await place();
    assert.equal(r.code, 200);
    assert.equal(r.body.images.length, 4);
    assert.ok(r.body.images.every((im) => im.imageBase64 === 'OAI-gpt-image-2'));
  }
});

test('٤. نفاد رصيد OpenAI (للحساب كلّه) ⇒ لا تكرار على gpt-image-2، والأشكال من نانو برو', async () => {
  reset((m) => (/^gpt-image/.test(m) ? oaErr(429, 'You exceeded your current quota, please check your plan and billing details.', 'insufficient_quota') : null));
  const r = await place();
  assert.equal(r.code, 200);
  assert.equal(r.body.images.length, 4);
  assert.ok(r.body.images.every((im) => im.imageBase64 === 'GEM-gemini-3-pro-image' && im.mimeType === 'image/png'));
  assert.ok(!calls.includes('gpt-image-2'), 'الرصيد للحساب لا للموديل');
  assert.equal(tally(), 1);
});

test('٥. OpenAI وبرو كلاهما يسقطان ⇒ نانو ٢ بالصيغة النظيفة', async () => {
  const bodies = {};
  reset((m, init) => {
    if (/^gemini/.test(m)) bodies[m] = JSON.parse(init.body).generationConfig;
    if (/^gpt-image/.test(m)) return oaErr(500, 'server error');
    if (m === 'gemini-3-pro-image') return Response.json({ error: { message: 'Resource exhausted' } }, { status: 429 });
    return null;
  });
  const r = await place();
  assert.equal(r.code, 200);
  assert.ok(r.body.images.length && r.body.images.every((im) => im.imageBase64 === 'GEM-gemini-3.1-flash-image'));
  assert.deepEqual(bodies['gemini-3-pro-image'], { imageConfig: { imageSize: '2K', aspectRatio: '16:9' } });
  assert.deepEqual(bodies['gemini-3.1-flash-image'], { responseModalities: ['IMAGE'] });
});

test('٦. الكلّ يسقط ⇒ ٥٠٢ بالرسالة نفسها، والسبب الحقيقيّ في detail (بلا مفتاح)، والحصّة لا تُستهلك', async () => {
  reset((m) => (/^gpt-image/.test(m) ? oaErr(401, 'Incorrect API key provided') : Response.json({ error: { message: 'API key not valid. key=AIzaSECRET' } }, { status: 400 })));
  const r = await place();
  assert.equal(r.code, 502);
  assert.equal(r.body.error, 'لم يرجع النموذج أي شكل. جرّب نمطًا أو نوع مكان آخر.');
  assert.match(r.body.detail, /gpt-image-2\.5-flare 401: Incorrect API key/);
  assert.match(r.body.detail, /gemini-3-pro-image 400/);
  assert.doesNotMatch(r.body.detail, /AIzaSECRET/);
  assert.equal(tally(), 0);
});

test('٧. العميل والحزمة: detail يظهر للمالك وحده بجانب الخطأ', () => {
  const src = fs.readFileSync(path.join(root, 'js/app-12-studios.js'), 'utf8');
  const bundle = fs.readFileSync(path.join(root, 'js/app.bundle.js'), 'utf8');
  const line = "const __why = (data.detail && typeof omranOwnerUi === 'function' && omranOwnerUi()) ? ' (' + String(data.detail).slice(0, 300) + ')' : '';";
  assert.ok(src.includes(line) && bundle.includes(line));
  assert.ok(src.includes("throw new Error((data.error || 'unknown') + __why);"));
});

// v-lighting-3d: كل لون جديد يصل إلى الطلب الفعلي، مع الصورة وبدونها، بلا شبكة أو رصيد حقيقي.
test('الإضاءات السبع تصل للتوليد مع صورة وبدون صورة', async () => {
  const colors = { emerald:'emerald-green', turquoise:'turquoise', rose:'powder-rose', burgundy:'burgundy-red', neon:'cyan from the left and fuchsia from the right', cinematic:'cool steel-blue from the left and warm amber from the right', aurora:'emerald-green on the left blending into muted violet' };
  for (const [lighting,word] of Object.entries(colors)) {
    for(const uploaded of [false,true]){
      const prompts=[];
      reset((m,init)=>{
        const body=JSON.parse(init.body);
        prompts.push(/^gpt-image/.test(m)?body.prompt:body.contents[0].parts.find(p=>p.text).text);
        return null;
      });
      const r=await place({lighting,count:1,...(uploaded?{imageBase64:'test-room',mimeType:'image/png'}:{})});
      assert.equal(r.code,200,lighting+' '+uploaded);
      assert.ok(prompts.length>0);
      assert.ok(prompts.every(p=>p.includes(word)),lighting+' لم يصل للأمر الفعلي');
      assert.equal(tally(),1,'طلب واحد لا توليد متكرر عند الاختيار');
    }
  }
});

// v-decor-18 (المالك ١٦ أكتوبر: «تضيف لكلّ واحد ١٨… ويكونون يشتغلون على نفس الطلب»): كلّ خيار من الأقسام الخمسة (١٧ لكلّ قسم)
// يصل وصفه إلى أمر التوليد الفعليّ، والأقسام الستّة معًا في الطلب نفسه — بصورة وبدونها، طلب واحد بلا رصيد حقيقيّ.
test('الأقسام الخمسة: كلّ خيار من القائمة له وصف يصل للأمر، والستّة معًا في طلب واحد', async () => {
  const core = fs.readFileSync(path.join(root, 'js/partials-core.js'), 'utf8');
  const srv = fs.readFileSync(path.join(root, 'api/_lib/design-create.js'), 'utf8');
  const grab = (n) => new Function('return {' + srv.match(new RegExp('const ' + n + ' = \\{([\\s\\S]*?)\\n\\};'))[1] + '}')();
  const SECS = { furniture: ['designAiFurniture', 'FURNITURE_PROMPTS'], flooring: ['designAiFlooring', 'FLOORING_PROMPTS'], fabric: ['designAiFabric', 'FABRIC_PROMPTS'], wallColor: ['designAiWallColor', 'WALLCOLOR_PROMPTS'], curtains: ['designAiCurtains', 'CURTAIN_PROMPTS'] };
  const promptsOf = async (extra) => {
    const prompts = [];
    reset((m, init) => { const body = JSON.parse(init.body); prompts.push(/^gpt-image/.test(m) ? body.prompt : body.contents[0].parts.find((p) => p.text).text); return null; });
    const r = await place(Object.assign({ count: 1 }, extra));
    assert.equal(r.code, 200);
    assert.ok(prompts.length > 0);
    assert.equal(tally(), 1, 'طلب واحد');
    return prompts;
  };
  for (const [field, [id, map]] of Object.entries(SECS)) {
    const vals = [...core.match(new RegExp('<select id="' + id + '"[\\s\\S]*?</select>'))[0].matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]).filter(Boolean);
    assert.equal(vals.length, 17, id + ': ١٧ خيارًا + «بدون تغيير»');
    const P = grab(map);
    for (const v of vals) {
      assert.ok(P[v], id + ': لا وصف توليد لـ' + v);
      const prompts = await promptsOf({ [field]: v });
      assert.ok(prompts.every((p) => p.includes(P[v])), id + '/' + v + ' لم يصل للأمر الفعليّ');
    }
  }
  // خيار الرخام يجب أن يصل لأمر التوليد مثل بقية خيارات الأرضيات.
  const marblePrompts = await promptsOf({ flooring: 'marble' });
  assert.ok(marblePrompts.every((p) => p.includes(grab('FLOORING_PROMPTS').marble)), 'اختيار الرخام لا يصل لأمر التوليد');
  const pick = { lighting: 'aurora', furniture: 'velvet', flooring: 'terrazzo', fabric: 'emerald', wallColor: 'navy', curtains: 'linen' };
  for (const uploaded of [false, true]) {
    const prompts = await promptsOf(Object.assign({}, pick, uploaded ? { imageBase64: 'test-room', mimeType: 'image/png' } : {}));
    // مراجعة نقض: لون القماش لا يلوّن الستائر حين اختار المستخدم ستارة بعينها (كان الأمر يقول «ستائر زمرّديّة» و«ستائر كتّان» معًا).
    const fabric = grab('FABRIC_PROMPTS').emerald;
    const want = [grab('LIGHTING_PROMPTS').aurora, grab('FURNITURE_PROMPTS').velvet, grab('FLOORING_PROMPTS').terrazzo, fabric.replace('sofas/cushions/curtains', 'sofas and cushions'), grab('WALLCOLOR_PROMPTS').navy, grab('CURTAIN_PROMPTS').linen];
    for (const p of prompts) for (const w of want) assert.ok(p.includes(w), (uploaded ? 'بصورة' : 'بلا صورة') + ': ' + w);
    for (const p of prompts) assert.ok(!p.includes(fabric), 'لون القماش لا يناقض الستارة المختارة');
  }
});
