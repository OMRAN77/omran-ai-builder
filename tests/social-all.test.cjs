// tests/social-all.test.cjs — v-social-all (طلب المالك ١٠ نوفمبر بلقطة «عن البرنامج»: «ضيفلي الحسابات التواصل الاجتماعي كلها الي موجودة»).
// كان قسم «تابعنا» يُظهر Instagram وX وحدهما. الحسابات الخمسة الموصولة بخدمة النشر (Instagram وX وTikTok وYouTube وFacebook) صارت كلّها
// ظاهرة بروابطها الحقيقيّة — من روابط منشور حلقة الشيخ سلطان (٩ نوفمبر)، وقناة YouTube من oEmbed، وصفحة Facebook بعد تحويلها.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const ACCOUNTS = {
  Instagram: 'https://www.instagram.com/omranaibuilder/',
  'X / Twitter': 'https://x.com/omranalsamxa3p',
  TikTok: 'https://www.tiktok.com/@omranaibuilderver',
  YouTube: 'https://www.youtube.com/@omran-ai-builder',
  Facebook: 'https://www.facebook.com/61595409062427',
};

function socialLinks() {
  const s = read('js/partials-settings.js');
  const about = s.slice(s.indexOf('id="aboutSection"'), s.indexOf('id="ownerSection"'));
  const social = about.slice(about.indexOf('data-i18n="socialTitle"'), about.indexOf('data-i18n="aboutCopyright"'));
  return [...social.matchAll(/<a href="([^"]*)"([^>]*)>/g)].map((m) => ({ href: m[1], attrs: m[2], title: (/title="([^"]*)"/.exec(m[2]) || [])[1] }));
}

test('١. الحسابات الخمسة ظاهرة بروابطها الحقيقيّة، في تبويب جديد، وبوصف للقارئ', () => {
  const links = socialLinks();
  for (const [title, href] of Object.entries(ACCOUNTS)) {
    const a = links.find((l) => l.title === title);
    assert.ok(a, title + ' موجود');
    assert.equal(a.href, href, title);
    assert.ok(!/ hidden[ >]/.test(a.attrs + ' ') && /display:flex/.test(a.attrs), title + ' ظاهر');
    assert.ok(a.attrs.includes('target="_blank"') && a.attrs.includes('rel="noopener noreferrer"'), title + ' في تبويب جديد بأمان');
    assert.ok(/aria-label="[^"]+"/.test(a.attrs), title + ' له aria-label');
  }
});

test('٢. لا رابط ميّت ظاهر، وWhatsApp مخفيّ حتّى يصل رقمه، والصفّ يلتفّ على الشاشة الضيّقة', () => {
  const links = socialLinks();
  for (const l of links) if (l.href === '#') assert.match(l.attrs, /hidden/, l.title + ': رابط # لا يظهر');
  assert.equal(links.filter((l) => l.href !== '#').length, 5);
  const s = read('js/partials-settings.js');
  const row = s.slice(s.indexOf('data-i18n="socialTitle"'));
  assert.match(row.slice(0, 1200), /justify-content:center; flex-wrap:wrap;/);
});

test('٣. وسم partials-settings رُفع فلا يبقى متصفّح على النسخة القديمة', () => {
  const v = Number((/partials-settings\.js\?v=(\d+)/.exec(read('index.html')) || [])[1]);
  assert.ok(v >= 714, 'الوسم ' + v);
});
