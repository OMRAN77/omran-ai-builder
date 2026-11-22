'use strict';
// ملاحظات اللاعبين وبلاغاتهم: تُحفظ بلا هويّة، تُحدّ، ولا تُقرأ إلّا بمفتاح المالك.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { act } = require('../api/feedback.js');

function memoryKV() {
  const data = new Map();
  const run = ([cmd, key, ...a]) => {
    if (cmd === 'LPUSH') { const l = data.get(key) || []; l.unshift(a[0]); data.set(key, l); return l.length; }
    if (cmd === 'LTRIM') { const l = data.get(key) || []; data.set(key, l.slice(Number(a[0]), Number(a[1]) + 1)); return 'OK'; }
    if (cmd === 'LRANGE') return (data.get(key) || []).slice(Number(a[0]), Number(a[1]) + 1);
    throw new Error('unexpected command ' + cmd);
  };
  return { data, kvIncr: async (k) => { const n = Number(data.get(k) || 0) + 1; data.set(k, String(n)); return n; }, kvExpire: async () => {}, kvPipeline: async (cmds) => cmds.map(run) };
}

test('ملاحظة بنجومها وبلاغ خطأ يُحفظان، بلا اسم ولا عنوان', async () => {
  const K = memoryKV();
  assert.equal((await act('POST', { rating: 4, note: '[عالم المكعبات · كوكب] اللعبة حلوة', lang: 'ar' }, {}, '1.1.1.1', K)).status, 200);
  assert.equal((await act('POST', { rating: 3, chips: ['fbChipBug'], note: '[عالم المكعبات · واحة · خطأ] الباب ما ينفتح' }, {}, '1.1.1.1', K)).status, 200);
  const rows = K.data.get('play/feedback').map((r) => JSON.parse(r));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].bug, true);
  assert.equal(rows[1].rating, 4);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['bug', 'lang', 'note', 'rating', 'ts']);
  assert.ok(!JSON.stringify(rows).includes('1.1.1.1'), 'العنوان للحدّ فقط ولا يُخزَّن');
});

test('بلا نجوم أو بلا نصّ يُرفض، والطويل يُقصّ، والكثير من عنوان واحد يُحدّ', async () => {
  const K = memoryKV();
  assert.equal((await act('POST', { note: 'بلا تقييم' }, {}, 'a', K)).status, 400);
  assert.equal((await act('POST', { rating: 5, note: ' ' }, {}, 'a', K)).status, 400);
  await act('POST', { rating: 5, note: 'x'.repeat(5000) }, {}, 'b', K);
  assert.equal(JSON.parse(K.data.get('play/feedback')[0]).note.length, 1000);
  let slow = 0;
  for (let i = 0; i < 10; i++) if ((await act('POST', { rating: 5, note: 'تجربة ' + i }, {}, 'same', K)).status === 429) slow++;
  assert.equal(slow, 4, 'بعد ٦ في الدقيقة يُرفض');
});

test('القراءة بمفتاح المالك وحده؛ بلا مفتاح مضبوط لا قراءة أبدًا', async () => {
  const K = memoryKV();
  await act('POST', { rating: 5, note: 'ملاحظة أولى' }, {}, 'a', K);
  assert.equal((await act('GET', null, { key: 'secret-1' }, 'x', K, 'secret-1')).json.notes.length, 1);
  assert.equal((await act('GET', null, { key: 'wrong' }, 'x', K, 'secret-1')).status, 401);
  assert.equal((await act('GET', null, {}, 'x', K, 'secret-1')).status, 401);
  assert.equal((await act('GET', null, { key: '' }, 'x', K, '')).status, 401, 'مفتاح فارغ لا يفتح شيئًا');
  assert.equal((await act('GET', null, { key: 'anything' }, 'x', K, undefined)).status, 401);
});

test('الآخر ٢٠٠ فقط يبقى', async () => {
  const K = memoryKV();
  for (let i = 0; i < 205; i++) await act('POST', { rating: 5, note: 'ملاحظة رقم ' + i }, {}, 'ip' + i, K);
  assert.equal(K.data.get('play/feedback').length, 200);
});
