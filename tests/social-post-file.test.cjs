// tests/social-post-file.test.cjs — v-post-file: نشر فيديو جاهز من المستودع (المالك ٩ نوفمبر: «حمّله في التواصل الاجتماعي»
// ← «الكامل على اللي تقبله»: يوتيوب وتيك توك وفيسبوك كفيديو عاديّ، بلا إنستغرام وإكس).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const src = read('scripts/social-post-file.mjs');
const yml = read('.github/workflows/social-bot.yml');
const load = () => import(path.join(root, 'scripts/social-post-file.mjs'));

test('١. فيديو الحوار: المنصّات كما اختارها المالك، والمعرّف لا يحرّك ترقيم البوت ولا ميرا', async () => {
  const { POSTS } = await load();
  const p = POSTS['video/final/om-ai-tour-duo-ar.mp4'];
  assert.ok(p && fs.existsSync(path.join(root, 'video/final/om-ai-tour-duo-ar.mp4')));
  assert.deepEqual(p.platforms, ['youtube', 'tiktok', 'facebook']);
  assert.ok(!/^omai-ep-\d+/.test(p.id) && !/^mira-(app|uae)-\d+$/.test(p.id), p.id);
});

test('٢. النصوص: OM Ai ورابط التحميل، عنوان يوتيوب ≤١٠٠ بلا #shorts، تيك توك بلا رابط، ولا اسم مزوّد', async () => {
  const { POSTS, captions } = await load();
  const c = captions(POSTS['video/final/om-ai-tour-duo-ar.mp4']);
  assert.ok(c.youtubeTitle.length <= 100 && c.youtubeTitle.includes('OM Ai') && !/#shorts/i.test(c.youtubeTitle));
  assert.ok(c.youtube.includes('https://omran-ai-builder.vercel.app/download') && c.facebook.includes('/download'));
  assert.ok(!/https?:\/\//.test(c.tiktok) && c.tiktok.includes('الرابط في البايو') && c.tiktok.length <= 2200);
  for (const t of Object.values(c)) assert.ok(!/claude|gemini|gpt|openai|grok|كلود|جيمناي|عمران/i.test(t), t);
});

test('٣. فيسبوك فيديو عاديّ لا ريلز (٣:١٩ فوق حدّ الريلز)، ويوتيوب عامّ وغير موجّه للأطفال، ولا نشر مرّتين، وDRY_RUN', () => {
  assert.ok(src.includes("fd.append('facebook_media_type', 'VIDEO')") && !src.includes("'REELS'"));
  assert.ok(src.includes("fd.append('privacyStatus', 'public'); fd.append('selfDeclaredMadeForKids', 'false');"));
  assert.ok(src.includes("it.external_id === post.id") && src.includes('if (!todo.length)'));
  assert.ok(src.includes("if (DRY) {"));
  assert.ok(!/sk-|Apikey [A-Za-z0-9]|api_key\s*=/.test(src), 'لا مفتاح في الكود');
});

test('٤. ملفّ التشغيل: وظيفة file يدويّة فقط، والمفتاح من الأسرار، وحلقة البوت لا تعمل معها', () => {
  assert.match(yml, /options: \[bot, mira, file\]/);
  assert.match(yml, /file:\n    if: github\.event_name == 'workflow_dispatch' && inputs\.series == 'file'/);
  assert.match(yml, /reel:\n    if: github\.event\.schedule == '0 16 \* \* \*' \|\| \(github\.event_name == 'workflow_dispatch' && inputs\.series == 'bot'\)/);
  assert.match(yml, /FILE: \$\{\{ inputs\.file \}\}\n {10}PLATFORMS: \$\{\{ inputs\.platforms \|\| 'auto' \}\}\n {10}DRY_RUN: \$\{\{ inputs\.dry_run && '1' \|\| '' \}\}\n {8}run: node scripts\/social-post-file\.mjs/);
  assert.match(yml, /UPLOAD_POST_API_KEY: \$\{\{ secrets\.UPLOAD_POST_API_KEY \}\}\n {10}FILE:/);
});
