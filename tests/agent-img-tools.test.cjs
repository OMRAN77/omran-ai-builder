// tests/agent-img-tools.test.cjs — v-agent-img-tools (المالك ١٤ أكتوبر: وضع الوكيل ما وصله من #1047).
// الرسم في المتصفّح (runInClient) كما في المحادثة؛ الخريطة من agent-img.js؛ write_github يأخذ imgIds.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

process.env.AUTH_SECRET = 'agent-img-tools-test-secret';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const store = new Map();
const stub = (f, exports) => { const p = rp(f); require.cache[p] = { id: p, filename: p, loaded: true, exports }; };
stub('api/_lib/kv.js', { kvPutJSON: async (k, v) => { store.set(k, v); }, kvGetJSON: async (k) => (store.has(k) ? store.get(k) : null), kvDel: async (k) => { store.delete(k); }, kvExpire: async () => {}, kvIncr: async () => 1 });
stub('api/_lib/_usage.js', { DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', checkAndConsume: async () => ({ allowed: true, username: 'omran' }) });
stub('api/_lib/_knowledge.js', { ownerKnowledge: () => '' });

const pushes = [];
const GW = require(rp('api/_lib/github-write.js'));
stub('api/_lib/github-write.js', Object.assign({}, GW, {
  pushFiles: async (input, o) => {
    pushes.push({ input, o });
    return { ok: true, commit: 'abc1234567', repo: 'OMRAN77/omran-ai-builder', branch: 'omran-agent/x', files: 1, commitUrl: 'https://github.com/OMRAN77/omran-ai-builder/commit/abc1234', prUrl: 'https://github.com/OMRAN77/omran-ai-builder/pull/77', prNumber: 77 };
  },
}));
const agent = require(rp('api/_lib/agent.js'));

function token(u) {
  const payload = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60_000 })).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(payload).digest('base64url');
}
const sse = (events) => new Response(events.map((e) => 'event: ' + e.type + '\ndata: ' + JSON.stringify(e) + '\n\n').join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const start = { type: 'message_start', message: { model: 'claude-opus-5-5', usage: { input_tokens: 5, output_tokens: 0 } } };
const tool = (i, id, name, input) => [
  { type: 'content_block_start', index: i, content_block: { type: 'tool_use', id, name, input: {} } },
  { type: 'content_block_delta', index: i, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } },
  { type: 'content_block_stop', index: i },
];
const textDone = (t) => sse([start, { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } }, { type: 'content_block_stop', index: 0 }, { type: 'message_delta', delta: { stop_reason: 'end_turn' } }]);

async function run(script, extra) {
  const calls = [];
  const save = global.fetch;
  let i = 0;
  global.fetch = async (url, init) => {
    if (!/api\.anthropic\.com\/v1\/messages/.test(String(url))) return new Response('{}', { status: 404 });
    calls.push(JSON.parse(init.body));
    return script[Math.min(i++, script.length - 1)]();
  };
  let written = '';
  const req = { method: 'POST', headers: { host: 'x' }, body: Object.assign({ messages: [{ role: 'user', content: 'ارسم عماني بكمة وارفعها' }], token: token('omran') }, extra) };
  const res = {
    setHeader() {}, status() { return this; }, json(v) { throw new Error('json ' + JSON.stringify(v)); },
    write(c) {
      written += String(c || '');
      for (const l of String(c).split('\n')) {
        if (!l.startsWith('data: ')) continue;
        let e = null; try { e = JSON.parse(l.slice(6)); } catch (err) { e = null; }
        if (e && e.clientTool && (e.clientTool.name === 'generate_image' || e.clientTool.name === 'edit_image')) {
          store.set('agent/tool/' + e.clientTool.id, { output: '✅ رُسمت الصورة (engine: test). ضع هذا الرمز حرفيًّا في src بلا أي إضافة: __IMG_1__ رابطها في التطبيق: /i/0123456789abcdef.png — لرفعها إلى المستودع: write_github ملف {path, image: "__IMG_1__"}.' });
        }
      }
    },
    end() {}, flush() {},
  };
  pushes.length = 0;
  try { await agent(req, res); } finally { global.fetch = save; }
  const events = written.split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return null; } }).filter(Boolean);
  return { calls, events, pushes: pushes.slice() };
}

test('١. أداتا الرسم في قائمة الوكيل، والتنفيذ عبر المتصفّح بمهلة الرسم', () => {
  const { toolsFor } = agent.__test;
  const names = (u) => toolsFor(u).map((t) => t.name);
  assert.ok(names('omran').includes('generate_image') && names('omran').includes('edit_image'));
  assert.ok(names('guest').includes('generate_image') && names('guest').includes('edit_image'));
  const src = read('api/_lib/agent.js');
  assert.ok(src.includes('runInClient(send, cb.name, input, cb.name === \'edit_image\' ? 150000 : cb.name === \'generate_image\' ? 75000 : undefined)'));
  assert.ok(src.includes('agentImg.noteTokens(result, imgIds)'));
  assert.ok(src.includes('pushFiles(input, { imgIds })'));
});

test('٢. نفس التشغيل: generate_image في المتصفّح ← noteTokens ← write_github بـ__IMG_1__ والخريطة ممتلئة', async () => {
  const r = await run([
    () => sse([start, ...tool(0, 'tu1', 'generate_image', { prompt: 'Omani man in kummah, studio' }), { type: 'message_delta', delta: { stop_reason: 'tool_use' } }]),
    () => sse([start, ...tool(0, 'tu2', 'write_github', { repo: 'OMRAN77/omran-ai-builder', files: [{ path: 'assets/studio/options/heritage-omani.webp', image: '__IMG_1__' }], message: 'صورة عماني' }), { type: 'message_delta', delta: { stop_reason: 'tool_use' } }]),
    () => textDone('رفعت الصورة.'),
  ]);
  assert.ok((r.calls[0].tools || []).some((t) => t.name === 'generate_image'), 'الأداة في القائمة المرسلة للنموذج');
  assert.ok(r.events.some((e) => e.clientTool && e.clientTool.name === 'generate_image'), 'الرسم خرج للمتصفّح');
  assert.equal(r.pushes.length, 1, JSON.stringify(r.pushes));
  assert.equal(r.pushes[0].input.files[0].image, '__IMG_1__');
  assert.equal(r.pushes[0].o.imgIds.__IMG_1__, '0123456789abcdef');
});

test('٣. دور لاحق: خريطة imgIds من طلب الوكيل تكفي للرفع بلا رسم جديد', async () => {
  const r = await run([
    () => sse([start, ...tool(0, 'tu1', 'write_github', { repo: 'OMRAN77/omran-ai-builder', files: [{ path: 'assets/studio/options/heritage-omani.webp', image: '__IMG_2__' }], message: 'رفع' }), { type: 'message_delta', delta: { stop_reason: 'tool_use' } }]),
    () => textDone('رفعت.'),
  ], { imgIds: { __IMG_2__: 'fedcba9876543210' } });
  assert.equal(r.pushes.length, 1);
  assert.deepEqual(r.pushes[0].o.imgIds, { __IMG_2__: 'fedcba9876543210' });
});
