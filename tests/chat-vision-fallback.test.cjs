'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fc = require('../api/_lib/free-chain.js');
const tier = require('../api/_lib/tier.js');
const image = [{ role: 'user', content: [{ type: 'text', text: 'اقرأها' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } }] }];
const success = new Response('data: ' + JSON.stringify({ choices: [{ delta: { content: 'أراها' } }] }) + '\n\ndata: [DONE]\n\n');
test('streamFreeChain automatically skips blind models and keeps actual pixels without requireVision', async () => {
  const calls = [];
  const r = await fc.streamFreeChain({
    env: { GROQ_API_KEY: 'q', GEMINI_API_KEY: 'g' }, convo: image, send: () => {},
    fetchImpl: async (url, init) => { calls.push({ url: String(url), body: JSON.parse(init.body) }); return success.clone(); },
  });
  assert.equal(r.provider, 'gemini');
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /googleapis/);
  assert.equal(calls[0].body.messages.at(-1).content[1].image_url.url, 'data:image/png;base64,AAAA');
  const none = await fc.streamFreeChain({ env: { GROQ_API_KEY: 'q' }, convo: image, send: () => {},
    fetchImpl: () => { throw new Error('blind fetch'); } });
  assert.equal(none.ok, false);
  assert.ok(none.errors.includes('no-vision-provider'));
  fc.__workingModel.clear();
});
test('text-only still uses Groq first', async () => {
  const calls = [];
  const r = await fc.streamFreeChain({ env: { GROQ_API_KEY: 'q', GEMINI_API_KEY: 'g' }, convo: [{ role: 'user', content: 'مرحبا' }], send: () => {},
    fetchImpl: async (url) => { calls.push(String(url)); return success.clone(); } });
  assert.equal(r.provider, 'groq');
  assert.match(calls[0], /api\.groq/);
  fc.__workingModel.clear();
});
test('unsupported URL and empty image sources fail before any provider call', async () => {
  const env = { GROQ_API_KEY: 'q', GEMINI_API_KEY: 'g' };
  let calls = 0;
  for (const source of [{ type: 'url', url: 'https://example.com/photo.png' }, { type: 'base64', media_type: 'image/png' }, { type: 'base64', data: '' }]) {
    const convo = [{ role: 'user', content: [{ type: 'text', text: 'ما في الصورة؟' }, { type: 'image', source }] }];
    const sent = [];
    const r = await fc.streamFreeChain({ env, convo, send: (ev) => sent.push(ev),
      fetchImpl: () => { calls++; throw new Error('must not fetch'); } });
    assert.deepEqual([r.ok, r.attempts, r.errors[0]], [false, 0, 'unsupported-image-source']);
    assert.deepEqual(sent, []);
    assert.throws(() => fc.toOpenAIMessages('', convo, true), /unsupported-image-source/);
  }
  assert.equal(calls, 0);
});