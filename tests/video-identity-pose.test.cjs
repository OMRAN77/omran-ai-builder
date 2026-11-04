'use strict';
/* v-video-identity-pose (المالك ٣ نوفمبر: «افحص الفيديوات تغير ملامح الشخصية»): صورته ووجهه نازل للجوال، والوصف «يطالع الكاميرا» —
   فاخترع المحرّك وجهًا أماميًّا (أعرض، لحية أكثف، حواجب أثقل). ما لم تُظهره الصورة لا يُستعاد؛ فالإصلاح يمنع طلب اختراعه:
   ١) إطار الترند لحظة قبل أيّ فعل — رأسه ونظرته وتعبيره كما في الصورة (كان «حيث يسمح المشهد» فيتبع القالب).
   ٢) Omni: الصورة نفسها مرجعًا ثانيًا مع أوّل إطار خامّ («سينمائي»، وترند الشخص الذي تعذّر إطاره — كان مرجعًا وحده فيُرسم الشخص كلّه).
   ٣) قفل الصورة: أيّ التفات نحو الكاميرا صغير وبطيء. ٤) «مقدّمة وخاتمة» بنسبة المقطع داخل الإطار لا مطّه. */
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'synthetic-test-secret-' + 'x'.repeat(40);
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const TP = require(path.join(root, 'api/_lib/trend-people.js'));
const VT = require(path.join(root, 'api/_lib/video-trends.js'));
const veo = require(path.join(root, 'api/_lib/veo-create.js'));

test('١. إطار الترند لحظة قبل أيّ فعل: سطر الوضعيّة في الفرديّ والجماعيّ، ولا «حيث يسمح المشهد»، والعمر الآخر كما كان', async () => {
  assert.match(TP.FRAME_POSE_FIRST, /moment BEFORE any action/);
  assert.match(TP.FRAME_POSE_FIRST, /looking at the camera, smiling, turning, nodding or walking toward the lens happen later in the video/);
  for (const o of [{}, { closeup: true }, { closeup: true, detail: true }, { closeup: true, start: true }, { people: 2 }]) {
    assert.ok(TP.soloFrameTask('a man looks at the camera and smiles', o).includes(TP.FRAME_POSE_FIRST), JSON.stringify(o));
  }
  assert.ok(!TP.soloFrameTask('a toddler version', { ageShift: true }).includes(TP.FRAME_POSE_FIRST), 'العمر الآخر بلا سطر الوضعيّة');
  for (const many of [false, true]) {
    const s = TP.frameLookLock(many);
    assert.doesNotMatch(s, /wherever the scene allows/);
    assert.match(s, /head angle, gaze and facial expression close to/);
  }
  const seen = [];
  const run = (scene, o) => TP.groupFirstFrame('K', [{ data: 'A', mime: 'image/png' }, { data: 'B', mime: 'image/png' }], scene, '720:1280',
    Object.assign({ faceCrops: async () => [], callImage: async (k, parts) => { seen.push(parts.map((x) => x.text || '').join('\n')); return { b64: 'G', mime: 'image/png' }; } }, o));
  await run('two friends wave at the camera', {});
  await run('a toddler version of them', { ageShift: true });
  assert.ok(seen[0].includes('This frame is the moment BEFORE any action in the scene'), 'الجماعيّ: سطر الوضعيّة');
  assert.ok(!seen[1].includes('moment BEFORE any action'), 'الجماعيّ بعمر آخر: كما كان');
});

test('٢. قفل الصورة: الالتفات نحو الكاميرا صغير وبطيء، والشكل كلّه كما هو، بلا «شخص حقيقيّ» ولا «وجه»، وطوله ≤ قفل الهويّة', () => {
  const t = VT.withPhotoLock('he looks at the camera', 5000);
  assert.match(t, /any turn to the camera is small and slow/);
  assert.match(t, /look, proportions, colours, clothes, art style/);
  assert.match(t, /a photo stays a photo, a drawing a drawing, never more realistic or generic/);
  assert.doesNotMatch(t, /real person|same face|IDENTITY|photorealistic/i);
  assert.ok(VT.withPhotoLock('', 5000).length <= VT.withIdentityLock('', 5000).length);
});

test('٣. Omni: إرشاد مرجع الصورة نفسها محايد، ومرجع الذات لا يشمل بيكسار/رمضان ولا الكشف ولا العمر الآخر ولا ترند بلا خانة صورة ولا تحويل الأسلوب ولا «أنمي» السينمائيّ', () => {
  assert.match(veo.PHOTO_REF_GUIDE, /^ Use Image1 as the starting frame\. Image2 is the same subject as Image1: use it only to keep its exact look/);
  assert.match(veo.PHOTO_REF_GUIDE, /whenever it turns, moves or is seen from another angle/);
  assert.doesNotMatch(veo.PHOTO_REF_GUIDE, /real person|identity/i, 'الأفاتار يبقى أفاتارًا والمنتج منتجًا');
  const src = fs.readFileSync(path.join(root, 'api/_lib/veo-create.js'), 'utf8');
  assert.match(src, /selfRef: !framed && !groupFramed && .*\(\(cinemaOmni && body\.style !== 'anime'\) \|\| \(omniTrend && tp\.omniPersonTrend\(trendId\) && !tp\.OMNI_REF_TRENDS\.has\(trendId\)/);
  assert.match(src, /!tp\.SOLO_FRAME_ART_TRENDS\.has\(trendId\) && !tp\.ART_STYLE_RE\.test\(tp\.trendScene\(promptText\)\)/, 'تحويل الأسلوب يبقى مرجعًا');
  assert.match(src, /bindTrendRef\(prompt\) \+ cuts \+ PHOTO_REF_GUIDE/, 'المونتاج بلقطاته');
  assert.match(src, /!tp\.OMNI_REVEAL_TRENDS\.has\(trendId\) && !tp\.AGE_SHIFT_TRENDS\.has\(trendId\)/);
  assert.match(src, /\.photo !== 'none'/);
});

test('٤. «مقدّمة وخاتمة»: المقطع بنسبته داخل الإطار (حواشٍ) لا مطّه إلى ١٢٨٠×٧٢٠/٧٢٠×١٢٨٠', () => {
  const js = fs.readFileSync(path.join(root, 'js/app-11-video.js'), 'utf8');
  assert.ok(js.includes(":force_original_aspect_ratio=decrease:force_divisible_by=2,pad=' + w + ':' + h + ':(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p["));
  assert.ok(js.includes("fit(1, 'v1')"), 'مقطع الذكاء نفسه');
  assert.doesNotMatch(js, /'\[1:v\]scale=' \+ w \+ ':' \+ h \+ ',fps=30/, 'لا مطّ');
  const bundle = fs.readFileSync(path.join(root, 'js/app.bundle.js'), 'utf8');
  assert.ok(bundle.includes('force_original_aspect_ratio=decrease:force_divisible_by=2'), 'الحزمة مبنيّة');
});

console.log('✓ video-identity-pose: الإطار يحفظ وضعيّة الصورة، وOmni بمرجع الصورة نفسها، والالتفات صغير، والمقدّمة بلا مطّ');
