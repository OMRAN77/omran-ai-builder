// tests/quality-gate.test.cjs — v-quality-gate (قرار المالك: «جودة أعلى» للمشتركين والمالك فقط)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

let TIER = {}, VIP = new Set(), BROKEN = false;
mock('api/_lib/points.js', { isOwnerUsername: (u) => u === 'omran' });
mock('api/_lib/_vip.js', { isVip: async (u) => VIP.has(u) });
mock('api/_lib/auth.js', { getUserOnce: async () => null });
mock('api/_lib/tier.js', { resolveTier: async (u) => { if (BROKEN) throw new Error('redis down'); return TIER[u] || { tier: 'free' }; } });
const g = require('../api/_lib/_qualityGate.js');

test('المالك وVIP والمشترك يُسمح لهم، والمجّانيّ والضيف لا', async () => {
  TIER = { sub1: { tier: 'sub', plan: 'pro' } }; VIP = new Set(['vip1']);
  assert.equal(await g.allowHigh('omran'), true);
  assert.equal(await g.allowHigh('vip1'), true);
  assert.equal(await g.allowHigh('sub1'), true);
  assert.equal(await g.allowHigh('free1'), false);
  assert.equal(await g.allowHigh(''), false);
});

test('gateQuality: «high» يُنزَّل إلى «fast» لغير المشترك، وغيرها لا يُمسّ', async () => {
  assert.equal(await g.gateQuality('free1', 'high'), 'fast');
  assert.equal(await g.gateQuality('sub1', 'high'), 'high');
  assert.equal(await g.gateQuality('free1', 'fast'), 'fast');
  assert.equal(await g.gateQuality('free1', undefined), undefined);
});

test('عطل قراءة الباقة = لا جودة عالية (لا فتح للتكلفة)، والمالك لا يمرّ بالقراءة', async () => {
  BROKEN = true;
  assert.equal(await g.allowHigh('sub1'), false);
  assert.equal(await g.allowHigh('omran'), true);
  BROKEN = false;
});

test('الربط: الخوادم الأربعة تمرّ بالحارس، والواجهة تُخفي المفتاح لغير المشترك', () => {
  ['veo-create', 'minimax-create', 'omni-create'].forEach((f) => assert.match(read('api/_lib/' + f + '.js'), /quality = await require\('\.\/_qualityGate\.js'\)\.gateQuality\(username, quality\);/, f));
  assert.match(read('api/_lib/video-upscale-create.js'), /allowHigh\(username\)\)\) \{ res\.status\(403\)\.json\(\{ error: 'quality_plan' \}\)/);
  const js = read('js/video.js');
  assert.ok(js.includes("paid=!!{owner:1,vip:1,basic:1,pro:1,max:1}[String(window.__omranPlan||'').toLowerCase()]"));
  assert.ok(js.includes("qr.classList.toggle('vmk-q-off',!paid||"));
});
