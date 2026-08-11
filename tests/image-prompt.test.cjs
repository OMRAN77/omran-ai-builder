'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { buildGenerationPrompt, buildEditPrompt, sourceStylePreservationRule } = require('../api/_lib/image-prompt');

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

test('localized edits preserve a real photo and never invent anime styling', () => {
  const p = buildEditPrompt('غيّر الملابس إلى بدلة زرقاء فقط');
  assert.match(p, /غيّر الملابس إلى بدلة زرقاء فقط/);
  assert.match(p, /A real photograph must remain a real photorealistic photograph/);
  assert.match(p, /Never convert it to anime, cartoon, illustration, painting, 3D render/);
  assert.match(p, /unless the USER REQUEST explicitly asks/);
});

test('all image-edit entry points apply style preservation except explicit anime mode', () => {
  const maha = fs.readFileSync('api/_lib/maha-image.js', 'utf8');
  const portrait = fs.readFileSync('api/_lib/portrait-style.js', 'utf8');
  const studio = fs.readFileSync('api/_lib/studio-create.js', 'utf8');
  assert.match(maha, /buildEditPrompt\(cleanPrompt\)/);
  assert.match(portrait, /\['hairstyle',[\s\S]*?'outfit'[\s\S]*?\]\.includes\(style\)/);
  assert.match(portrait, /temperature: isLocalizedEdit \? 0\.15 : 0\.65/);
  assert.match(studio, /if \(feature !== 'anime'\) promptText \+=/);
  assert.match(studio, /temperature: feature === 'anime' \? 0\.65 : 0\.15/);
  assert.match(sourceStylePreservationRule(), /unless the USER REQUEST explicitly asks/);
});
