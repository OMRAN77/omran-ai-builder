// tests/qr-download-hub.test.cjs — فحص بطاقة الباركود الذكي وصفحة التحميل الموحّدة لكافة المتاجر
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('١. صفحة download.html موجودة وتدعم الهوية والتوجيه الموحّد', () => {
  const html = read('download.html');
  assert.ok(html.includes('<!DOCTYPE html>'), 'صيغة HTML صالحة');
  assert.ok(html.includes('dir="rtl"'), 'الاتجاه الافتراضي عربي RTL');
  assert.ok(html.includes('Omran AI Builder') || html.includes('عمران AI'), 'اسم التطبيق موجود');
  assert.ok(html.includes('/icons/omran-qr-code.png'), 'صورة الباركود الرسمي موجودة');
});

test('٢. كافّة المتاجر الخمسة موجودة ومنظّمة بطريقة احترافية AI', () => {
  const html = read('download.html');
  // 1. Apple
  assert.ok(html.includes('cardApple') && html.includes('iPhone'), 'متجر آبل / iOS موجود');
  // 2. Android
  assert.ok(html.includes('cardAndroid') && html.includes('Google Play'), 'أندرويد وجوجل بلاي موجود');
  // 3. Huawei
  assert.ok(html.includes('cardHuawei') && html.includes('AppGallery'), 'متجر هواوي موجود');
  assert.ok(html.includes('?store=huawei'), 'رابط متجر هواوي الرسمي معتمد');
  // 4. Microsoft Store
  assert.ok(html.includes('cardWindows') && html.includes('Windows'), 'متجر مايكروسوفت موجود');
  // 5. Browser Extension
  assert.ok(html.includes('cardExtension'), 'إضافات المتصفح موجودة');
});

test('٣. أزرار الإجراءات: تحميل الباركود PNG ونسخ الرابط الموحّد', () => {
  const html = read('download.html');
  assert.ok(html.includes('btnDownloadQr'), 'زر تحميل الباركود كصورة موجود');
  assert.ok(html.includes('btnCopyLink'), 'زر نسخ الرابط الموحّد موجود');
  assert.ok(html.includes('omran-qr-code.png'), 'رابط التنزيل المباشر للباركود');
});

test('٤. فحص النقاء: لا اسم مزوّد أو نموذج خارجي في نصوص الصفحة', () => {
  const html = read('download.html');
  // CLAUDE.md: لا اسم مزود أو نموذج (كلاود، جيمناي، غروق، GPT…)
  const FORBIDDEN = /\b(claude|openai|gpt|gemini|groq|anthropic|openrouter)\b/i;
  assert.doesNotMatch(html, FORBIDDEN, 'لا أسماء مزودين في download.html');
});

test('٥. فحص الأمان: لا سكربتات خارجية عبر شبكات CDN', () => {
  const html = read('download.html');
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/i, 'لا سكربتات خارجية — ذاتية الاكتفاء بالكامل');
});

test('٦. صورة أيقونة المركز وشعار الباركود موجودان بحجم فعلي', () => {
  const iconOriginal = path.join(ROOT, 'icons/ai-hub-mark.png');
  const icon256 = path.join(ROOT, 'icons/ai-hub-mark-256.png');
  const qrCode = path.join(ROOT, 'icons/omran-qr-code.png');

  assert.ok(fs.existsSync(iconOriginal), 'الأيقونة الأصلية التي اختارها المالك موجودة');
  assert.ok(fs.existsSync(icon256), 'النسخة المحسّنة للويب 256px موجودة');
  assert.ok(fs.existsSync(qrCode), 'صورة الباركود الرسمية موجودة');

  assert.ok(fs.statSync(iconOriginal).size > 100000, 'حجم الأيقونة الأصلية سليم');
  assert.ok(fs.statSync(qrCode).size > 20000, 'حجم الباركود سليم');
});

test('٧. توجيه vercel.json يربط /download و /install بـ download.html', () => {
  const vercel = JSON.parse(read('vercel.json'));
  const rewrites = vercel.rewrites || vercel.routes || [];
  const hasDownload = rewrites.some(r => r.source === '/download' && r.destination === '/download.html');
  const hasInstall = rewrites.some(r => r.source === '/install' && r.destination === '/download.html');

  assert.ok(hasDownload, 'توجيه /download موجود في vercel.json');
  assert.ok(hasInstall, 'توجيه /install موجود في vercel.json');
});

test('٨. حارس guard.mjs يحمي download.html ضمن ملفّات CLIENT', () => {
  const guard = read('scripts/guard.mjs');
  assert.ok(guard.includes("'download.html'"), 'download.html مسجّلة في CLIENT في guard.mjs');
});
