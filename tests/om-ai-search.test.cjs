'use strict';
/**
 * v-om-ai-search — استبدال Omran AI Builder بـ om ai في محركات البحث (SEO/OpenGraph/Twitter/Schema/OpenSearch)
 * دون المساس بالتطبيق وهويته الداخلية.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const opensearchXml = fs.readFileSync(path.join(__dirname, '..', 'opensearch.xml'), 'utf8');

// 1. فحص OpenSearch XML
assert.ok(opensearchXml.includes('<ShortName>om ai</ShortName>'), 'OpenSearch يحتوي على ShortName = om ai');
assert.ok(opensearchXml.includes('om ai'), 'OpenSearch يحتوي على وصف om ai');

// 2. فحص index.html في البحث ومحركات البحث
assert.ok(indexHtml.includes('<title id="pageTitle">om ai — عمران AI — منصّة الذكاء</title>'), 'عنوان الصفحة الافتراضي يحتوي على om ai');
assert.ok(indexHtml.includes('<link rel="search" type="application/opensearchdescription+xml" href="/opensearch.xml" title="om ai">'), 'رابط opensearch موجود');
assert.ok(indexHtml.includes('<meta property="og:site_name" content="om ai">'), 'og:site_name تم تغييره إلى om ai');
assert.ok(indexHtml.includes('<meta property="og:title" content="om ai — مُنشئ التطبيقات بالذكاء الاصطناعي">'), 'og:title يحتوي على om ai');
assert.ok(indexHtml.includes('<meta name="twitter:title" content="om ai — مُنشئ التطبيقات بالذكاء الاصطناعي">'), 'twitter:title يحتوي على om ai');

// 3. فحص schema.org ld+json
assert.ok(indexHtml.includes('"name": "om ai"'), 'Schema.org يحتوي على name: om ai');
assert.ok(indexHtml.includes('"alternateName": ["Omran AI Builder", "Omran AI", "عمران AI", "om ai builder"]'), 'Schema.org يدعم alternateName لربط الاسمين');

// 4. فحص Keywords و Description
assert.ok(indexHtml.includes('om ai, om ai builder, Omran AI Builder'), 'الكلمات المفتاحية تتضمن om ai');
assert.ok(indexHtml.includes('content="om ai — أنشئ تطبيقات'), 'وصف الميتا يتضمن om ai');

// 5. فحص ثبات التطبيق من الداخل
// التأكد من أن الهوية والشعارات وأزرار التطبيق لم تتأثر
assert.ok(indexHtml.includes('alt="عمران Ai"'), 'شعار التطبيق عمران AI لم يتغير');
assert.ok(indexHtml.includes('id="brandTitle"'), 'شعار الهيدر موجود');

console.log('✓ جميع فحوصات v-om-ai-search نجحت بنجاح');
