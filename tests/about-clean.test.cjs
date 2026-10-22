'use strict';
/* v-about-clean (المالك ١٨ أكتوبر): ٢) terms.html بألوان privacy.html الذهبيّة بدل البنفسجيّ وزرّ English شفّاف بتوهّج؛
   وشاشة «عن البرنامج»: لا شارة «صُنع في الإمارات» ولا الفيديوهات التعريفيّة ولا عبارة الإمارات في سطر الحقوق — بالـ١٤ لغة.
   ملفّات الفيديو نفسها تبقى (الوسائط الكبيرة غير المستخدمة قرار مالك). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('١. terms.html: ألوان privacy.html الذهبيّة، h1 وh2 والنقاط، وزرّ English شفّاف بإطار رفيع وتوهّج عند المرور، بلا بنفسجيّ', () => {
  const t = read('terms.html');
  assert.ok(t.includes(':root{--bg:#000;--card:#0b0b0c;--text:#f2efe7;--muted:#a9a497;--accent:#e9d39a;--border:rgba(240,222,170,.16)}'));
  assert.ok(/h1\{color:#f0deaa;/.test(t) && /h2\{color:#e2c77e;/.test(t) && t.includes('li::marker{color:#e2c77e}'));
  const btn = t.match(/\.lang-btn\{([^}]*)\}/)[1];
  assert.ok(btn.includes('background:transparent') && btn.includes('color:#f0deaa') && btn.includes('border:1px solid rgba(240,222,170,.45)') && !/background:var\(--accent\)/.test(btn));
  assert.ok(/\.lang-btn:hover[^{]*\{box-shadow:0 0 12px rgba\(240,222,170,\.35\)/.test(t), 'توهّج المرور');
  assert.ok(!/8b5cf6|139,\s*92,\s*246|#0d0d14|#16161f/i.test(t), 'لا بنفسجيّ ولا خلفيّات قديمة');
});

test('٢. شاشة «عن البرنامج»: لا شارة «صُنع في الإمارات» ولا فيديوهات تعريفيّة، وسطر الحقوق بلا عبارة الإمارات', () => {
  const s = read('js/partials-settings.js');
  const about = s.slice(s.indexOf('id="aboutSection"'), s.indexOf('id="ownerSection"'));
  assert.ok(about.length > 500, 'القسم موجود');
  for (const bad of ['<video', '/assets/videos/', 'aboutChipUAE', 'videosGroupTitle', 'lang-videos', '🇦🇪', 'الفيديوهات التعريفية']) assert.ok(!about.includes(bad), bad);
  assert.ok(about.includes('data-i18n="aboutCopyright">© فريق om ai</div>'));
  assert.ok(about.includes('data-i18n="aboutSectionTitle">ℹ️ عن البرنامج</h3>'));
  /* ما بقي: بطاقة الهوية، الشبكة، الدعم، التواصل */
  for (const keep of ['aboutChipPWA', 'aboutChipLangs', 'aboutFeatChat', 'supportContactBox', 'socialTitle']) assert.ok(about.includes(keep), keep);
});

test('٣. كلّ اللغات الـ١٤: سطر الحقوق بلا عبارة الإمارات ولا العلم، وعنوان القسم بلا ذكر الفيديوهات', () => {
  const files = ['js/app-03-i18n-data.js'].concat(fs.readdirSync(path.join(ROOT, 'i18n')).filter((f) => f !== 'ad-studio.js').map((f) => 'i18n/' + f));
  assert.strictEqual(files.length, 13, '٢ في app-03 + ١٢ حزمة = ١٤ لغة');
  let copyLines = 0, titleLines = 0;
  for (const f of files) {
    const src = read(f);
    for (const m of src.matchAll(/^\s*"?aboutCopyright"?:\s*(["'])(.*)\1,?\s*$/gm)) { copyLines++; assert.ok(m[2].startsWith('© ') && !/🇦🇪/.test(m[2]) && m[2].length < 30, f + ' ' + m[2]); }
    for (const m of src.matchAll(/^\s*"?aboutSectionTitle"?:\s*(["'])(.*)\1,?\s*$/gm)) { titleLines++; assert.ok(m[2].startsWith('ℹ️ ') && m[2].length < 32 && !/video|видео|vidéo|ویڈیو|वीडियो|भिडियो|视频|ভিডিও|വീഡിയോ|فيديو|vídeo|bidyo|intro/i.test(m[2]), f + ' ' + m[2]); }
  }
  assert.strictEqual(copyLines, 14); assert.strictEqual(titleLines, 14);
});

test('٤. ملفّات الفيديو التعريفيّة تبقى على القرص (قرار المالك: الوسائط الكبيرة غير المستخدمة تبقى)', () => {
  for (const n of ['intro-ar-short', 'intro-ar-long', 'intro-en-short', 'intro-en-long']) assert.ok(fs.existsSync(path.join(ROOT, 'assets', 'videos', n + '.mp4')), n);
});

test('٥. البريد ommntr77@gmail.com (v-om-ai-name، أمر المالك) في الشاشة وprivacy وterms (الخادم VAPID خارج الطلب)', () => {
  for (const f of ['js/partials-settings.js', 'privacy.html', 'terms.html']) {
    const src = read(f);
    assert.ok(src.includes('mailto:ommntr77@gmail.com'), f + ' رابط البريد الجديد');
    assert.ok(src.includes('ommntr77@gmail.com</a>'), f + ' نصّ البريد الظاهر');
    assert.ok(!src.includes('ommntr2712@gmail.com'), f + ' بلا البريد السابق (ommntr2712)');
  }
});

test('٦. منصّات التواصل: Instagram وX بروابط حساباتهما الحقيقيّة في تبويب جديد، والباقي مخفيّ حتّى تصل روابطه، ولا رابط # ظاهر', () => {
  const s = read('js/partials-settings.js');
  const about = s.slice(s.indexOf('id="aboutSection"'), s.indexOf('id="ownerSection"'));
  const social = about.slice(about.indexOf('data-i18n="socialTitle"'));
  const links = [...social.matchAll(/<a href="([^"]*)"([^>]*)>/g)];
  assert.strictEqual(links.length, 5, 'خمس أيقونات');
  const byTitle = (t) => links.find((m) => m[2].includes('title="' + t + '"'));
  const ig = byTitle('Instagram'), x = byTitle('X / Twitter');
  assert.strictEqual(ig[1], 'https://www.instagram.com/omranaibuilder/'); assert.strictEqual(x[1], 'https://x.com/omranalsamxa3p');
  for (const m of [ig, x]) assert.ok(m[2].includes('target="_blank"') && m[2].includes('rel="noopener noreferrer"'));
  /* hidden وحدها لا تكفي: style="display:flex" المضمّن يغلبها — لذلك display:none في النمط نفسه */
  for (const t of ['TikTok', 'YouTube', 'WhatsApp']) { const m = byTitle(t); assert.ok(m && m[1] === '#' && / hidden /.test(m[2] + ' ') && /display:none/.test(m[2]), t + ' مخفيّ فعلًا'); }
  assert.ok(!links.some((m) => m[1] === '#' && !/display:none/.test(m[2])), 'لا أيقونة ميتة ظاهرة');
});
