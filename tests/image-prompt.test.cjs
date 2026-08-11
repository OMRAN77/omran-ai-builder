'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildGenerationPrompt } = require('../api/_lib/image-prompt');

test('generation prompt follows the subject instead of forcing one camera style', () => {
  const p = buildGenerationPrompt('شمس مرسومة بأسلوب مائي فوق الجبال');
  assert.match(p, /شمس مرسومة بأسلوب مائي فوق الجبال/);
  assert.match(p, /expansive environmental composition/);
  assert.doesNotMatch(p, /85mm|DSLR|skin texture|8K/i);
});

test('generation prompt forbids unrequested additions and previous-image carryover', () => {
  const p = buildGenerationPrompt('قمر وحيد في سماء صافية');
  assert.match(p, /Do not add objects, people, words, scenery or stylistic elements/);
  assert.match(p, /Treat this as a brand-new image/);
});

test('reserved exact-text area remains free of model-rendered writing', () => {
  const p = buildGenerationPrompt('غروب هادئ', { reserveTextArea:true, textPosition:'top' });
  assert.match(p, /Do not render any words, letters, numbers/);
  assert.match(p, /Keep the upper portion calm and uncluttered/);
});

test('generation never asks the image model to reproduce user wording', () => {
  const p = buildGenerationPrompt('بطاقة عليها عبارة مبروك');
  assert.match(p, /Do not render legible words, letters, numbers/);
  assert.doesNotMatch(p, /reproduce it exactly/i);
});

test('prayer artwork follows its semantic plan and rejects the old default scene', () => {
  const p = buildGenerationPrompt('مصباح مطفأ قرب نافذة في ليلة ممطرة، منظور داخلي قريب', { prayerArt:true, reserveTextArea:true });
  assert.match(p, /topic-specific supplication artwork/);
  assert.match(p, /do not replace it with generic religious imagery/);
  assert.match(p, /exclude boats, ships, coastlines, sunsets, mosque silhouettes/);
});

test('architectural requests retain exact feature constraints without generic photo styling', () => {
  const p = buildGenerationPrompt('فيلا من طابقين وكراج لسيارتين', { architectural:true });
  assert.match(p, /floor count, room count, openings, garage capacity/);
  assert.match(p, /فيلا من طابقين وكراج لسيارتين/);
  assert.doesNotMatch(p, /85mm|skin texture/i);
});
