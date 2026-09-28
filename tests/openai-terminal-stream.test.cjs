'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const od = require('../api/_lib/oa-direct.js');

const response = (events) => events.map((e) => 'event: ' + e.type + '\ndata: ' + JSON.stringify(e) + '\n\n').join('');
const completion = (chunks, done = true) => chunks.map((e) => 'data: ' + JSON.stringify(e) + '\n\n').join('') + (done ? 'data: [DONE]\n\n' : '');
const stream = (text, sizes = [1, 3, 2, 7]) => {
  const bytes = new TextEncoder().encode(text);
  let at = 0;
  return new ReadableStream({
    pull(controller) {
      if (at >= bytes.length) { controller.close(); return; }
      const size = sizes[at % sizes.length];
      controller.enqueue(bytes.slice(at, at + size));
      at += size;
    },
  });
};
const events = (s) => s.split('\n').filter((line) => line.startsWith('data: ')).map((line) => JSON.parse(line.slice(6)));
async function convert(kind, text) {
  return new Response(kind === 'responses' ? od.responsesToAnthropicStream(stream(text), 'fallback') : od.toAnthropicStream(stream(text), 'fallback')).text();
}
async function fails(kind, body, pattern) {
  await assert.rejects(convert(kind, body), (error) => {
    assert.equal(error.code, 'OA_STREAM_PROTOCOL_ERROR');
    assert.match(error.message, pattern);
    return true;
  });
}
const call = [
  { type: 'response.output_item.added', output_index: 0, item: { type: 'function_call', id: 'fc_1', call_id: 'call_77', name: 'web_search', arguments: '' } },
  { type: 'response.function_call_arguments.delta', output_index: 0, delta: '{"query":' },
];

test('Responses: failed preserves provider failure type/code/message instead of finishing a tool turn', async () => {
  await fails('responses', response([...call, {
    type: 'response.failed', response: { status: 'failed', error: { type: 'server_error', code: 'server_error', message: 'Upstream unavailable' } },
  }]), /server_error.*Upstream unavailable/);
  await fails('responses', response([{ type: 'error', error: { type: 'rate_limit_error', code: 'rate_limit_exceeded', message: 'Rate limit' } }]), /rate_limit_exceeded.*Rate limit/);
  await fails('responses', response([{ type: 'error', code: 'overloaded', message: 'Try again later' }]), /overloaded.*Try again later/);
});

test('Responses: abrupt EOF, DONE without terminal, incomplete non-limit, and incomplete tool args reject', async () => {
  await fails('responses', response([{ type: 'response.output_text.delta', delta: 'partial' }]), /terminal|ended/i);
  await fails('responses', response(call), /terminal|ended|incomplete/i);
  await fails('responses', response(call) + 'data: [DONE]\n\n', /terminal|ended|incomplete/i);
  await fails('responses', response([...call, { type: 'response.incomplete', response: { incomplete_details: { reason: 'content_filter' } } }]), /content_filter/);
  await fails('responses', response([...call, { type: 'response.incomplete', response: { incomplete_details: { reason: 'max_output_tokens' } } }]), /max_output_tokens/);
  await fails('responses', response([...call, { type: 'response.completed', response: { status: 'completed' } }]), /function_call|tool|arguments|done/i);
  await fails('responses', response([
    { type: 'response.output_item.done', output_index: 0, item: { type: 'function_call', call_id: 'call_77', name: 'web_search', arguments: '{"query":' } },
    { type: 'response.completed', response: { status: 'completed' } },
  ]), /function_call|arguments/i);
  for (const status of ['incomplete', 'in_progress']) {
    await fails('responses', response([
      { type: 'response.output_item.done', output_index: 0, item: { type: 'function_call', status, call_id: 'call_77', name: 'web_search', arguments: '{"query":"ok"}' } },
      { type: 'response.completed', response: { status: 'completed' } },
    ]), /incomplete function_call/i);
  }
});

test('Responses: complete text and tools keep ids, usage, and valid max_tokens text is explicit', async () => {
  const good = response([
    { type: 'response.created', response: { model: 'gpt-test' } },
    ...call,
    { type: 'response.function_call_arguments.delta', output_index: 0, delta: '"ok"}' },
    { type: 'response.output_item.done', output_index: 0, item: { type: 'function_call', call_id: 'call_77', name: 'web_search', arguments: '{"query":"ok"}' } },
    { type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 12, input_tokens_details: { cached_tokens: 2 }, output_tokens: 5 } } },
  ]);
  const out = events(await convert('responses', good));
  assert.equal(out.find((e) => e.content_block && e.content_block.type === 'tool_use').content_block.id, 'call_77');
  assert.equal(out.find((e) => e.type === 'message_delta').delta.stop_reason, 'tool_use');
  assert.equal(out.find((e) => e.type === 'message_delta').usage.output_tokens, 5);
  assert.equal(out.filter((e) => e.type === 'message_start')[1].message.usage.input_tokens, 10);
  assert.equal(out.at(-1).type, 'message_stop');
  const text = events(await convert('responses', response([
    { type: 'response.output_text.delta', delta: 'answer' },
    { type: 'response.completed', response: { status: 'completed' } },
  ])));
  assert.equal(text.find((e) => e.type === 'message_delta').delta.stop_reason, 'end_turn');
  assert.equal(text.filter((e) => e.delta && e.delta.type === 'text_delta').map((e) => e.delta.text).join(''), 'answer');
  const limited = events(await convert('responses', response([
    { type: 'response.output_text.delta', delta: 'partial' },
    { type: 'response.incomplete', response: { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } } },
  ])));
  assert.equal(limited.find((e) => e.type === 'message_delta').delta.stop_reason, 'max_tokens');
});

test('Chat completions: error, missing terminal, interrupted tools and invalid JSON reject', async () => {
  const part = { model: 'm', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call_9', function: { name: 'web_search', arguments: '{"query":' } }] } }] };
  await fails('completion', completion([part], false), /DONE|terminal|ended/i);
  await fails('completion', completion([part]), /finish_reason|tool|arguments/i);
  await fails('completion', completion([part, { error: { type: 'server_error', code: 'bad_gateway', message: 'Gateway failed' } }]), /bad_gateway.*Gateway failed/);
  await fails('completion', completion([part, { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] }]), /arguments|JSON/i);
  await fails('completion', completion([{ choices: [{ index: 0, delta: { content: 'cut' }, finish_reason: 'stop' }] }], false), /DONE/i);
  await fails('completion', 'data: {invalid}\n\ndata: [DONE]\n\n', /invalid SSE JSON/i);
});

test('Chat completions: completed text/tool turns retain usage and call id across chunks', async () => {
  const out = events(await convert('completion', completion([
    { model: 'm', choices: [{ index: 0, delta: { content: 'hi' } }] },
    { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call_9', function: { name: 'web_search', arguments: '{"query":' } }] } }] },
    { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '"ok"}' } }] } }] },
    { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 12, completion_tokens: 5 } },
  ])));
  assert.equal(out.find((e) => e.content_block && e.content_block.type === 'tool_use').content_block.id, 'call_9');
  assert.equal(out.find((e) => e.type === 'message_delta').delta.stop_reason, 'tool_use');
  assert.equal(out.find((e) => e.type === 'message_delta').usage.output_tokens, 5);
  assert.equal(out.at(-1).type, 'message_stop');
  const limited = events(await convert('completion', completion([
    { choices: [{ index: 0, delta: { content: 'partial' }, finish_reason: 'length' }] },
  ])));
  assert.equal(limited.find((e) => e.type === 'message_delta').delta.stop_reason, 'max_tokens');
});

test('UTF-8 bytes split inside Arabic/emoji characters and across multiple SSE deltas retain exact text', async () => {
  const pieces = ['مر', 'حباً ', '🌍'];
  const body = response([
    ...pieces.map((delta) => ({ type: 'response.output_text.delta', delta })),
    { type: 'response.completed', response: { status: 'completed' } },
  ]);
  // Every byte is a separate upstream chunk, including the middle bytes of multibyte codepoints.
  const out = events(await new Response(od.responsesToAnthropicStream(stream(body, [1]), 'fallback')).text());
  assert.deepEqual(out.filter((e) => e.delta && e.delta.type === 'text_delta').map((e) => e.delta.text), pieces);
  assert.equal(out.find((e) => e.type === 'message_delta').delta.stop_reason, 'end_turn');
});