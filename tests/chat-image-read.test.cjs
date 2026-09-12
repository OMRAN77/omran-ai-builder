// tests/chat-image-read.test.cjs — v-img-read: «قرأت الصور، تحليل ضعيف جدًّا».
// لقطة المالك: تنبيه «المايك مشغول ببرنامج ثاني» ظاهر في الصورة والردّ وصف عناصر ثانويّة
// وتجاهله. الحلّ: قاعدة «اقرأ اللقطة أوّلًا» (النصوص حرفيًّا، التنبيهات والأخطاء أوّلًا)
// في كلّ دور فيه صورة، ونموذج/جهد قابلان للضبط لدور الصورة.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-secret-for-chat-image';
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'api/_lib/chat.js'), 'utf8');
const { imageTurnConfig, IMAGE_READ_NOTE } = require('../api/_lib/chat.js').__vimg;

test('IMAGE_READ_NOTE: reads the screenshot first, alerts and errors before anything else', () => {
  assert.ok(IMAGE_READ_NOTE.includes('قراءة اللقطة أوّلًا'));
  assert.ok(/تنبيه|رسالة خطأ/.test(IMAGE_READ_NOTE) && /حرفيًّا/.test(IMAGE_READ_NOTE));
  assert.ok(IMAGE_READ_NOTE.includes('ممنوع ردّ عامّ'));
});

test('source guard: the note rides every image turn (tool turn and no-tool turn), after the guide note', () => {
  const withTools = src.indexOf("+ ownerKnowledge + IMAGE_TURN_NOTE + VISUAL_GUIDE_NOTE + IMAGE_READ + IMAGE_GATE_NOTE + IMAGE_REPORT_NOTE");
  const noTools = src.indexOf("+ baseSystem + IMAGE_TURN_NOTE + VISUAL_GUIDE_NOTE + IMAGE_READ;");
  assert.ok(withTools > 0, 'فرع الأدوات');
  assert.ok(noTools > 0, 'فرع بلا أدوات');
  assert.ok(src.includes("const IMAGE_READ = lastUserHasImage ? IMAGE_READ_NOTE : '';"));
  assert.ok(src.includes('imageTurnConfig(process.env, viaOR, CHAT_MODEL)'), 'إعداد دور الصورة يُطبَّق في الطلب');
});

test('imageTurnConfig: defaults keep the chat model, xhigh effort on the direct path only, env overrides', () => {
  assert.deepEqual(imageTurnConfig({}, false, 'claude-sonnet-5'), { model: 'claude-sonnet-5', output_config: { effort: 'xhigh' } });
  assert.deepEqual(imageTurnConfig({}, true, 'anthropic/claude-sonnet-5'), { model: 'anthropic/claude-sonnet-5', output_config: null }, 'الوسيط: بلا output_config');
  assert.deepEqual(imageTurnConfig({ CHAT_IMAGE_MODEL: 'claude-opus-5', CHAT_IMAGE_EFFORT: 'max' }, false, 'claude-sonnet-5'), { model: 'claude-opus-5', output_config: { effort: 'max' } });
  assert.equal(imageTurnConfig({ CHAT_IMAGE_MODEL: 'claude-opus-5' }, true, 'anthropic/claude-sonnet-5').model, 'anthropic/claude-opus-5', 'الوسيط يأخذ بادئة المزوّد');
  assert.equal(imageTurnConfig({ CHAT_IMAGE_EFFORT: 'weird' }, false, 'm').output_config.effort, 'xhigh', 'جهد تالف = xhigh');
  assert.equal(imageTurnConfig({ CHAT_IMAGE_EFFORT: ' HIGH ' }, false, 'm').output_config.effort, 'high');
});
