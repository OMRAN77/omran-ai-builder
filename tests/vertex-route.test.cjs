'use strict';
/* tests/vertex-route.test.cjs — v-vertex-route (المالك ٢١ أكتوبر، استثناء من التجميد: «إذا المتغير موجود، كل اتصالات Gemini تروح لـ
   Vertex عن طريق مكتبة @google/genai بـ vertexai: true و apiKey. وإذا مو موجود، يرجع للمسار الحالي بدون أي تغيير»).
   المسارين معًا: بلا المفتاح fetch نفسه بالرابط نفسه؛ وبه المكتبة على Vertex بردّ بشكل REST، والبثّ SSE، والخطأ بحالته،
   وتحويل الأسماء المستعارة، والإطفاء بـGOOGLE_VERTEX=off، وما لا يمرّ (OpenAI المتوافقة وVeo وInteractions وFiles)، والمسبار بلا مفتاح
   في ردّه، وأنّ كلّ نداء generateContent في api/_lib يمرّ بالعبور (فحص ساكن — سقّاطة). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const G = require('../api/_lib/gemini-fetch.js');

const URL_GEN = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=AIza-aistudio';
const URL_STREAM = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:streamGenerateContent?alt=sse&key=AIza-aistudio';
const BODY = { contents: [{ role: 'user', parts: [{ text: 'hi' }] }], systemInstruction: { parts: [{ text: 'be brief' }] }, generationConfig: { temperature: 0.2, responseMimeType: 'application/json', imageConfig: { aspectRatio: '1:1', imageSize: '1K' } }, tools: [{ googleSearch: {} }] };
const withEnv = async (vars, fn) => {
  const saved = {};
  for (const k of ['GOOGLE_VERTEX_API_KEY', 'GOOGLE_VERTEX', 'GOOGLE_VERTEX_MODELS']) { saved[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, vars);
  try { return await fn(); } finally { for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } G.setSdkFactory(null); }
};
/* مكتبة وهميّة تسجّل ما وصلها */
function fakeSdk(opts) {
  const calls = [];
  G.setSdkFactory((init) => { calls.push({ init }); return { models: {
    generateContent: async (p) => { calls.push({ gen: p }); if (opts.throw) throw opts.throw; return Object.assign({ sdkHttpResponse: { headers: { 'x-h': '1' } }, candidates: [{ content: { parts: [{ text: 'ok ' + p.model }] }, finishReason: 'STOP' }], usageMetadata: { totalTokenCount: 3 }, modelVersion: p.model }, opts.extra || {}); },
    generateContentStream: async (p) => { calls.push({ stream: p }); if (opts.throw) throw opts.throw; return (async function* () { yield { candidates: [{ content: { parts: [{ text: 'a' }] } }], sdkHttpResponse: {} }; yield { candidates: [{ content: { parts: [{ text: 'b' }] } }] }; })(); },
    get: async (p) => { calls.push({ get: p }); if (opts.missing && opts.missing.includes(p.model)) { const e = new Error('{"error":{"code":404,"message":"Publisher Model `publishers/google/models/' + p.model + '` not found."}}'); e.status = 404; throw e; } return { name: 'publishers/google/models/' + p.model, displayName: p.model }; },
  } }; });
  return calls;
}

test('١. بلا GOOGLE_VERTEX_API_KEY: geminiFetch = fetch نفسه بالرابط والجسم نفسيهما (العامّ والمحقون)، والردّ كما يعيده', async () => {
  await withEnv({}, async () => {
    const seen = [];
    const prev = global.fetch;
    global.fetch = async (u, i) => { seen.push([u, i]); return { ok: true, status: 200, json: async () => ({ via: 'global' }) }; };
    try {
      const r = await G.geminiFetch(URL_GEN, { method: 'POST', body: '{}' });
      assert.deepEqual(await r.json(), { via: 'global' });
      assert.equal(seen[0][0], URL_GEN, 'الرابط كما هو (بمفتاح AI Studio)');
      assert.equal(seen[0][1].body, '{}');
    } finally { global.fetch = prev; }
    const inj = [];
    const r2 = await G.geminiFetch(URL_GEN, { method: 'POST' }, async (u) => { inj.push(u); return { ok: true, status: 200 }; });
    assert.equal(inj[0], URL_GEN, 'المحقون (fetchFn) يُنادى هو');
    assert.equal(r2.status, 200);
    assert.equal(G.vertexActive(), false);
  });
});

test('٢. بالمفتاح: المكتبة بـvertexai:true وapiKey، الجسم يُحوَّل (generationConfig تُفرد في config ومعها systemInstruction وtools)، والردّ Response بشكل REST', async () => {
  await withEnv({ GOOGLE_VERTEX_API_KEY: 'vk-secret' }, async () => {
    const calls = fakeSdk({});
    const prev = global.fetch; global.fetch = async () => { throw new Error('fetch must not be called'); };
    try {
      const sig = AbortSignal.timeout(60000);
      const r = await G.geminiFetch(URL_GEN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(BODY), signal: sig });
      assert.deepEqual(calls[0].init, { vertexai: true, apiKey: 'vk-secret' });
      const p = calls[1].gen;
      assert.equal(p.model, 'gemini-3.8-flash', 'الاسم المستعار -latest يُحوَّل');
      assert.deepEqual(p.contents, BODY.contents);
      assert.equal(p.config.temperature, 0.2);
      assert.equal(p.config.responseMimeType, 'application/json');
      assert.deepEqual(p.config.imageConfig, { aspectRatio: '1:1', imageSize: '1K' });
      assert.deepEqual(p.config.systemInstruction, BODY.systemInstruction);
      assert.deepEqual(p.config.tools, BODY.tools);
      assert.equal(p.config.abortSignal, sig, 'مهلة النداء تصل المكتبة');
      assert.equal(r.ok, true); assert.equal(r.status, 200);
      const j = await r.json();
      assert.equal(j.candidates[0].content.parts[0].text, 'ok gemini-3.8-flash');
      assert.equal(j.usageMetadata.totalTokenCount, 3);
      assert.equal('sdkHttpResponse' in j, false, 'لا حقول داخليّة في الردّ');
      assert.equal(G.vertexActive(), true);
    } finally { global.fetch = prev; }
  });
});

test('٣. البثّ: streamGenerateContent ← أحداث SSE «data: {…}» من مولّد المكتبة، ورأس text/event-stream', async () => {
  await withEnv({ GOOGLE_VERTEX_API_KEY: 'vk' }, async () => {
    const calls = fakeSdk({});
    const r = await G.geminiFetch(URL_STREAM, { method: 'POST', body: JSON.stringify({ contents: [] }) });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/event-stream/);
    assert.equal(calls[1].stream.model, 'gemini-3.1-pro-preview');
    const txt = await r.text();
    const frames = txt.split('\r\n\r\n').filter(Boolean);
    assert.equal(frames.length, 2);
    assert.match(frames[0], /^data: \{/);
    const c0 = JSON.parse(frames[0].slice(6));
    assert.equal(c0.candidates[0].content.parts[0].text, 'a');
    assert.equal('sdkHttpResponse' in c0, false);
  });
});

test('٤. خطأ المكتبة (ApiError برسالة JSON أو نصّ) ← Response بحالة الخادم وبشكل {error:{message}}؛ خطأ الشبكة يُرمى كما كان fetch', async () => {
  await withEnv({ GOOGLE_VERTEX_API_KEY: 'vk' }, async () => {
    const e1 = new Error('{"error":{"code":429,"message":"Resource exhausted","status":"RESOURCE_EXHAUSTED"}}'); e1.status = 429;
    fakeSdk({ throw: e1 });
    const r1 = await G.geminiFetch(URL_GEN, { method: 'POST', body: '{}' });
    assert.equal(r1.ok, false); assert.equal(r1.status, 429);
    assert.equal((await r1.json()).error.message, 'Resource exhausted');
    const e2 = new Error('Publisher Model not found'); e2.status = 404;
    fakeSdk({ throw: e2 });
    const r2 = await G.geminiFetch(URL_GEN, { method: 'POST', body: '{}' });
    assert.equal(r2.status, 404);
    assert.deepEqual(await r2.json(), { error: { code: 404, message: 'Publisher Model not found', status: '' } });
    fakeSdk({ throw: new Error('fetch failed') });
    await assert.rejects(G.geminiFetch(URL_GEN, { method: 'POST', body: '{}' }), /fetch failed/);
  });
});

test('٥. ما لا يمرّ بـVertex حتّى بالمفتاح: OpenAI المتوافقة، وVeo (predictLongRunning/العمليّات)، وInteractions، وFiles، وقائمة النماذج — fetch كما هو', async () => {
  await withEnv({ GOOGLE_VERTEX_API_KEY: 'vk' }, async () => {
    const calls = fakeSdk({});
    const seen = [];
    const f = async (u) => { seen.push(u); return { ok: true, status: 200 }; };
    for (const u of ['https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', 'https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning',
      'https://generativelanguage.googleapis.com/v1beta/models/veo/operations/1', 'https://generativelanguage.googleapis.com/v1beta/interactions', 'https://generativelanguage.googleapis.com/upload/v1beta/files',
      'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=k', 'https://api.openai.com/v1/images/generations']) {
      await G.geminiFetch(u, { method: 'POST' }, f);
    }
    assert.equal(seen.length, 7);
    assert.equal(calls.length, 0, 'المكتبة لم تُنشأ');
    assert.equal(G.parseGeminiUrl(URL_GEN).model, 'gemini-flash-latest');
    assert.equal(G.parseGeminiUrl(URL_STREAM).stream, true);
    assert.equal(G.parseGeminiUrl('https://generativelanguage.googleapis.com/v1beta/models/x:predictLongRunning'), null);
  });
});

test('٦. GOOGLE_VERTEX=off يطفئ المسار مع بقاء المفتاح، وGOOGLE_VERTEX_MODELS يصحّح اسمًا، والأسماء غير المستعارة تمرّ كما هي', async () => {
  await withEnv({ GOOGLE_VERTEX_API_KEY: 'vk', GOOGLE_VERTEX: 'off' }, async () => {
    const seen = [];
    await G.geminiFetch(URL_GEN, { method: 'POST' }, async (u) => { seen.push(u); return { ok: true }; });
    assert.equal(seen.length, 1); assert.equal(G.vertexActive(), false);
  });
  await withEnv({ GOOGLE_VERTEX_API_KEY: 'vk', GOOGLE_VERTEX_MODELS: 'gemini-3-pro-image=gemini-3-pro-image-preview, gemini-flash-latest = gemini-3.9-flash' }, async () => {
    assert.equal(G.toVertexModel('gemini-3-pro-image'), 'gemini-3-pro-image-preview');
    assert.equal(G.toVertexModel('gemini-flash-latest'), 'gemini-3.9-flash', 'التصحيح يغلب الخريطة');
    assert.equal(G.toVertexModel('models/gemini-2.5-flash'), 'gemini-2.5-flash');
    assert.equal(G.toVertexModel('gemini-nano-banana'), 'gemini-2.5-flash-image');
    assert.equal(G.toVertexModel('gemini-3.1-flash-image'), 'gemini-3.1-flash-image');
  });
});

test('٧. المسبار: نصّ وصورة وأسماء النماذج ورقم المشروع من رسائل الخطأ — والمفتاح لا يظهر في ردّه أبدًا', async () => {
  await withEnv({ GOOGLE_VERTEX_API_KEY: 'vk-very-secret' }, async () => {
    let n = 0;
    const client = { models: {
      get: async (p) => { if (p.model === 'gemini-3-pro-image') { const e = new Error('{"error":{"code":404,"message":"Publisher Model `projects/123456789/locations/global/publishers/google/models/gemini-3-pro-image` not found. key=vk-very-secret"}}'); e.status = 404; throw e; } return { displayName: p.model }; },
      generateContent: async (p) => (++n === 1 ? { candidates: [{ content: { parts: [{ text: 'OK' }] } }], usageMetadata: { totalTokenCount: 5 }, modelVersion: p.model }
        : { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'A'.repeat(400) } }] } }], usageMetadata: { totalTokenCount: 9 } }),
    } };
    const out = await G.probe({ client, models: ['gemini-flash-latest', 'gemini-3-pro-image'] });
    assert.equal(out.ok, true);
    assert.equal(out.text.ok, true); assert.equal(out.text.reply, 'OK');
    assert.equal(out.image.ok, true); assert.equal(out.image.mime, 'image/png'); assert.equal(out.image.bytes, 300);
    assert.equal(out.models['gemini-flash-latest'], 'gemini-3.8-flash ← ok · gemini-3.8-flash');
    assert.match(out.models['gemini-3-pro-image'], /^لا: 404/);
    assert.equal(out.project, '123456789', 'رقم المشروع من رسالة الخطأ');
    assert.equal(JSON.stringify(out).includes('vk-very-secret'), false, 'المفتاح لا يُطبع');
  });
  await withEnv({}, async () => { const out = await G.probe({}); assert.equal(out.active, false); assert.equal(out.ok, false); });
});

test('٨. سقّاطة: كلّ نداء generateContent/streamGenerateContent في api/_lib يمرّ بـgeminiFetch، إلّا المسارات الموثَّقة التي تبقى على AI Studio', () => {
  const SKIP = new Set(['video-watch.js', 'veo-create.js', 'veo-status.js', 'veo-download.js', 'omni-create.js', 'oa-direct.js', 'tier.js', 'gemini-fetch.js']);
  const MODELS_URL = /generativelanguage\.googleapis\.com\/v1beta\/models\//;
  const bad = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'api/_lib')).filter((x) => x.endsWith('.js') && !SKIP.has(x))) {
    const s = rd('api/_lib/' + f); if (!MODELS_URL.test(s)) continue;
    if (!/require\('\.\/gemini-fetch\.js'\)/.test(s)) bad.push(f + ': لا يستورد gemini-fetch');
    const L = s.split('\n');
    const urlVars = new Set();
    L.forEach((l) => { const m = l.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\(?\s*)?['"`]https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\//); if (m) urlVars.add(m[1]); });
    L.forEach((l, i) => {
      if (/\|\|\s*fetch\b/.test(l)) bad.push(f + ':' + (i + 1) + ' احتياط fetch بدل geminiFetch');
      const m = l.match(/(?<![\w.])fetch\s*\(\s*(.*)$/); if (!m) return;
      const arg = m[1] + ' ' + (L[i + 1] || '');
      if (MODELS_URL.test(arg) || [...urlVars].some((v) => new RegExp('^\\s*' + v + '\\b').test(m[1]))) bad.push(f + ':' + (i + 1) + ' fetch مباشر على رابط Gemini');
    });
  }
  assert.deepEqual(bad, [], bad.join('\n'));
  /* وما بقي على AI Studio عمدًا موثَّق في رأس gemini-fetch.js */
  assert.match(rd('api/_lib/gemini-fetch.js'), /لا تمرّ بـVertex/);
});

test('١٠. المكتبة الحقيقيّة @google/genai على خادم محلّيّ: المسار publishers/google/models/<model>:generateContent على v1beta1، والمفتاح في x-goog-api-key لا في الرابط، والجسم بشكل Vertex، وردّها يُعاد JSON بشكل REST', async () => {
  const http = require('node:http');
  const seen = [];
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => {
      seen.push({ url: req.url, key: req.headers['x-goog-api-key'], body: b ? JSON.parse(b) : null });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'مرحبا' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2, totalTokenCount: 6 }, modelVersion: 'gemini-3.8-flash-001', responseId: 'r1' }));
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  try {
    await withEnv({ GOOGLE_VERTEX_API_KEY: 'vk-real-sdk' }, async () => {
      const { GoogleGenAI } = require('@google/genai');
      G.setSdkFactory((init) => new GoogleGenAI(Object.assign({}, init, { httpOptions: { baseUrl: base } })));
      const r = await G.geminiFetch(URL_GEN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(BODY) });
      assert.equal(r.status, 200);
      const j = await r.json();
      assert.equal(j.candidates[0].content.parts[0].text, 'مرحبا');
      assert.equal(j.usageMetadata.totalTokenCount, 6);
      assert.equal(j.modelVersion, 'gemini-3.8-flash-001');
      assert.equal('sdkHttpResponse' in j, false);
      assert.equal(seen.length, 1);
      assert.equal(seen[0].url, '/v1beta1/publishers/google/models/gemini-3.8-flash:generateContent', 'مسار Vertex Express');
      assert.equal(seen[0].key, 'vk-real-sdk', 'المفتاح في الترويسة');
      assert.doesNotMatch(seen[0].url, /AIza|key=/, 'مفتاح AI Studio من الرابط لا يُرسل');
      const vb = seen[0].body;
      assert.deepEqual(vb.contents, BODY.contents);
      assert.equal(vb.generationConfig.temperature, 0.2);
      assert.equal(vb.generationConfig.responseMimeType, 'application/json');
      assert.deepEqual(vb.generationConfig.imageConfig, { aspectRatio: '1:1', imageSize: '1K' });
      assert.deepEqual(vb.systemInstruction.parts, BODY.systemInstruction.parts);
      assert.deepEqual(vb.tools, BODY.tools);
    });
  } finally { srv.close(); }
});

test('٩. التوثيق والاعتماديّة: المتغيّرات الثلاثة في env.js، و@google/genai في package.json، والمسبار في health بطلب صريح وللمالك', () => {
  const env = rd('api/_lib/env.js');
  for (const k of ['GOOGLE_VERTEX_API_KEY', 'GOOGLE_VERTEX', 'GOOGLE_VERTEX_MODELS']) assert.ok(env.includes(k + ':'), 'env.js: ' + k);
  assert.ok(JSON.parse(rd('package.json')).dependencies['@google/genai'], '@google/genai اعتماديّة');
  const h = rd('api/_lib/health.js');
  assert.ok(h.indexOf("req.query.vertex === 'probe'") > h.indexOf('isOwner(req)'), 'المسبار بعد حارس المالك');
  assert.doesNotMatch(rd('api/_lib/gemini-fetch.js'), /require\('@google\/genai'\)[^\n]*\n[^\n]*\bconst\b/, 'المكتبة تُحمَّل كسولة داخل client() لا في نطاق الوحدة');
  assert.match(rd('api/_lib/gemini-fetch.js'), /function client\(apiKey\) \{\n  if \(sdkFactory\)[^\n]*\n  const \{ GoogleGenAI \} = require\('@google\/genai'\);/);
});
