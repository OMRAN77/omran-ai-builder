'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { buildGenerationPrompt, buildEditPrompt, buildElevatePrompt, sourceStylePreservationRule, explicitlyRequestsStyleChange, shouldUseRawImagePrompt, stripRawImagePrefix } = require('../api/_lib/image-prompt');
const { assessEditVerdict, publicGuardError } = require('../api/_lib/image-edit-guard');

test('engineered image prompts are the default and raw mode is explicit', () => {
  assert.equal(shouldUseRawImagePrompt('صورة منتج احترافية'), false);
  assert.equal(shouldUseRawImagePrompt('نانو: صورة منتج احترافية'), true);
  assert.equal(shouldUseRawImagePrompt('nano banana - cinematic portrait'), true);
  assert.equal(shouldUseRawImagePrompt('صورة منتج احترافية', { envDefault:'on' }), true);
  assert.equal(shouldUseRawImagePrompt('نانو: دعاء', { prayerPlan:{} }), false);
  assert.equal(stripRawImagePrefix('نانو بنانا:  قصر على البحر '), 'قصر على البحر');
});

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
  const fashion = fs.readFileSync('api/_lib/fashion-create.js', 'utf8');
  assert.match(maha, /buildEditPrompt\(cleanPrompt\)/);
  assert.match(portrait, /\['hairstyle',[\s\S]*?'outfit'[\s\S]*?\]\.includes\(style\)/);
  assert.match(portrait, /temperature: isLocalizedEdit \? 0\.15 : 0\.65/);
  assert.match(studio, /if \(feature !== 'anime'\) promptText \+=/);
  assert.match(studio, /temperature: feature === 'anime' \? 0\.65 : 0\.15/);
  assert.match(sourceStylePreservationRule(), /unless the USER REQUEST explicitly asks/);
  assert.match(maha, /verifyLocalizedImageEdit/);
  assert.match(portrait, /if \(!isMultiSourceComposition\)/);
  assert.match(portrait, /allowStyleChange: !!STYLE_PROMPTS\[style\]/);
  assert.match(portrait, /const frameGuard = await verifyLocalizedImageEdit/);
  assert.match(studio, /if \(feature !== 'merge'\)/);
  assert.match(studio, /allowStyleChange: feature === 'anime'/);
  assert.match(fashion, /verifyLocalizedImageEdit/);
  assert.match(fashion, /sourceStylePreservationRule/);
});

test('style-change intent distinguishes an explicit request from a prohibition', () => {
  assert.equal(explicitlyRequestsStyleChange('حوّل الصورة إلى أنمي ياباني'), true);
  assert.equal(explicitlyRequestsStyleChange('أريدها رسمة كرتونية'), true);
  assert.equal(explicitlyRequestsStyleChange('I want an anime version'), true);
  assert.equal(explicitlyRequestsStyleChange('Give it a cartoon style'), true);
  assert.equal(explicitlyRequestsStyleChange('أعطها طابع كرتوني'), true);
  assert.equal(explicitlyRequestsStyleChange('غيّرها إلى أنمي'), true);
  assert.equal(explicitlyRequestsStyleChange('change it to anime'), true);
  assert.equal(explicitlyRequestsStyleChange('انمي'), true);
  assert.equal(explicitlyRequestsStyleChange('خل الملابس سوداء بس مو كرتون'), false);
  assert.equal(explicitlyRequestsStyleChange('غيّر الملابس ولا تحولها أنمي'), false);
  assert.equal(explicitlyRequestsStyleChange('لا أريدها رسمة كرتونية'), false);
  assert.equal(explicitlyRequestsStyleChange('حافظ عليها واقعية without a cartoon look'), false);
});

test('localized edit quality gate rejects anime drift and identity changes', () => {
  assert.deepEqual(assessEditVerdict({ sourceIsPhotograph:true, resultIsPhotograph:false, sameVisualMedium:false, identityPreserved:true, onlyRequestedChange:true }), { ok:false, reason:'style_mismatch' });
  assert.deepEqual(assessEditVerdict({ sourceIsPhotograph:true, resultIsPhotograph:true, sameVisualMedium:true, identityPreserved:false, onlyRequestedChange:true }), { ok:false, reason:'identity_or_scope_mismatch' });
  assert.deepEqual(assessEditVerdict({ sourceIsPhotograph:true, resultIsPhotograph:true, sameVisualMedium:true, identityPreserved:true, onlyRequestedChange:true }), { ok:true, reason:'accepted' });
  assert.deepEqual(assessEditVerdict({ sourceIsPhotograph:true, resultIsPhotograph:false, sameVisualMedium:false, identityPreserved:true, onlyRequestedChange:true }, { allowStyleChange:true }), { ok:true, reason:'accepted_explicit_style_change' });
  assert.deepEqual(assessEditVerdict({ sourceIsPhotograph:true, resultIsPhotograph:false, sameVisualMedium:false, identityPreserved:false, onlyRequestedChange:true }, { allowStyleChange:true }), { ok:false, reason:'identity_or_scope_mismatch' });
  assert.equal(publicGuardError({ reason:'style_mismatch' }), 'image_edit_style_mismatch');
});

test('chat edit flow continues from the latest edited pixels and never auto-recreates from text', () => {
  const attach = fs.readFileSync('js/app-09-attach.js', 'utf8');
  const maha = fs.readFileSync('js/app-08-maha.js', 'utf8');
  assert.match(attach, /__pendingImageEditSource = \{ b64:__b64, mime:__mime \}/); assert.match(attach, /__side=\/\^\(right\|left\)-\//); assert.match(require('../api/_lib/prayer-plan').buildPlannerPrompt('أريد شعرًا', { kind:'poetry' }), /original polished 2–3 line Arabic poem/); assert.equal(require('../js/app-08-image-text.js').parseImageTextSpec('اكتب «نص» أعلى يمين الصورة').position, 'right-top');
  assert.match(attach, /cumulativeImageEditPrompt\(cur, text/);
  assert.match(attach, /cur\.imageEditSource = __pendingImageEditSource/);
  assert.match(attach, /cur\.imageEditInstructions = __pendingImageEditInstructions/);
  assert.doesNotMatch(attach, /imageEditStylized/);
  assert.doesNotMatch(attach, /imageEditInstructions\.slice\(-/);
  const mahaApi = fs.readFileSync('api/_lib/maha-image.js', 'utf8');
  assert.match(maha, /mahaEditSourceBase64/);
  assert.match(maha, /mahaCombinedEditPrompt\(promptText\)/);
  assert.doesNotMatch(maha, /mahaImageEditInstructions\.slice\(-/);
  assert.doesNotMatch(maha, /requestedStyleChange/);
  assert.match(attach, /const __IMG_ELEVATE = !!\([^;]{0,500}__IMG_REIMAGINE_HINT/);
  assert.match(attach, /const __SHOT_ANALYZE = !!\([^;]{0,600}!__IMG_UPGRADE && !__IMG_ELEVATE[^;]+!String\(text \|\| ''\)\.trim\(\)/);
  assert.match(attach, /const __ATT_DEFAULT = !!\(__srcImg && !__srcImg\._fromMemory && String\(text \|\| ''\)\.trim\(\)/);
  assert.doesNotMatch(attach, /const __ATT_DEFAULT = [^;]+__cameFromEditBtn/);
  assert.match(attach, /const __FOLLOW_DEFAULT = [^;]+text\.length <= 1200/);
  assert.doesNotMatch(attach, /const __FOLLOW_DEFAULT = [^;]+split\(\/\\s\+\/\)\.length >= 2/);
  assert.match(attach, /__IMG_UPGRADE \|\| __IMG_ELEVATE \|\| __IMG_FOLLOW/);
  assert.match(attach, /!__srcImg && \(__IMG_UPGRADE \|\| __IMG_ELEVATE\)[^;]+__IMG_UPGRADE_SRC/);
  assert.doesNotMatch(mahaApi, /!isSceneUpgrade && !isElevate\s*\n\s*&& \(editImageBase64/);
  assert.match(mahaApi, /guestImageCharge = \{ counterKey \}/);
  assert.match(mahaApi, /await kvDecrBy\(charge\.counterKey, 1\)/);
  assert.match(mahaApi, /await refundImageCharge\(\)/);
  assert.doesNotMatch(maha, /mahaCallImageApi\(promptText, false\)/);
});

test('single-letter replacements are masked and cannot redraw the rest of the image', () => {
  const attach = fs.readFileSync('js/app-09-attach.js', 'utf8');
  const mahaApi = fs.readFileSync('api/_lib/maha-image.js', 'utf8');
  const textSwap = fs.readFileSync('api/_lib/text-swap.js', 'utf8');
  assert.match(attach, /شيل\|احذف\|امسح\|استبدل[\s\S]{0,100}حرف\|رمز/);
  assert.match(attach, /omranBuildTextEditMask/);
  assert.match(attach, /editMaskBase64:__masked\.maskB64/);
  assert.match(attach, /omranMergeTextEditRegion/);
  assert.match(mahaApi, /form\.append\('mask',[\s\S]{0,120}'mask\.png'\)/);
  assert.match(mahaApi, /if \(exactTextEdit\) \{[\s\S]{0,500}return;[\s\S]{0,300}return;/);
  assert.match(textSwap, /standalone letter or logo glyph/);
});

test('specialized image routes do not expose provider errors to the user', () => {
  for (const file of ['api/_lib/portrait-style.js', 'api/_lib/studio-create.js', 'api/_lib/fashion-create.js']) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /json\(\{ error: 'Proxy error: '/);
    assert.doesNotMatch(source, /json\(\{ error: \(data && data\.error && data\.error\.message\)/);
    assert.doesNotMatch(source, /json\(\{ error: 'Server is missing GEMINI_API_KEY'/);
    assert.doesNotMatch(source, /json\(\{ error: \(frameData && frameData\.error/);
  }
});

/* v-nano-pro-edit — «أقوى» = الفكرة نفسها مرفوعة بإثراء ينتمي للموضوع، لا صورة فوتوغرافية باهتة */
test('elevate prompt keeps the same idea but demands thematic enrichment instead of a plain photo', () => {
  const p = buildElevatePrompt('أقوى');
  assert.match(p, /TASK: "أقوى"/);
  assert.match(p, /keep the main subject, the setting, the overall composition, the meaning/);
  assert.match(p, /A subtle polish is a FAILURE/);
  assert.match(p, /symbolic motifs, ornamental patterns/);
  assert.match(p, /decorative calligraphy or lettering/);
  assert.match(p, /Arabic in correct right-to-left joined script/);
  assert.match(p, /Never add unrelated objects, random faces, gadgets, jewels, wires or gimmicks/);
  assert.match(p, /a real photograph of a place or person stays a believable photograph/);
  assert.doesNotMatch(p, /realistic materials and textures/);
  assert.doesNotMatch(p, /Do NOT add random unrelated elements \(extra faces, jewels, wires, gadgets, effects\)/);
});
