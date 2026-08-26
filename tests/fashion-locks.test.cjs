// 👗 اختبار أقفال الأزياء وأسلاكها — من حزمة المالك.
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { IDENTITY_LOCK, FAIRNESS_LOCK, MODEST_LOCK, locksFor } = require('../api/_lib/fashion-locks.js');

// ① قفل الهوية دائم — هو جوهر الأداة.
assert.ok(locksFor({}).includes(IDENTITY_LOCK), 'قفل الهوية في كل توليد');
assert.ok(IDENTITY_LOCK.includes('Do not slim') && IDENTITY_LOCK.includes('same face'), 'الهوية تمنع التنحيف وتغيير الوجه صراحةً');

// ② قفل العدالة عند المقارنة فقط.
assert.ok(locksFor({ fairness: true }).includes(FAIRNESS_LOCK), 'المقارنة تحمل قفل العدالة');
assert.ok(!locksFor({}).includes(FAIRNESS_LOCK), 'التوليد المفرد بلا قفل عدالة — يحافظ على خلفية صورة المستخدمة');

// ③ الاحتشام: بالطلب، أو تلقائيًا للعباية والتقليدي والمناسبة الدينية.
assert.ok(locksFor({ modest: true }).includes(MODEST_LOCK), 'الاحتشام بالطلب');
assert.ok(locksFor({ style: 'abaya' }).includes(MODEST_LOCK), 'العباية محتشمة تلقائيًا');
assert.ok(locksFor({ occasion: 'religious' }).includes(MODEST_LOCK), 'المناسبة الدينية محتشمة تلقائيًا');
assert.ok(!locksFor({ style: 'casual' }).includes(MODEST_LOCK), 'الكاجوال بلا فرض احتشام');
console.log('  ✓ الأقفال الثلاثة تتركب صحيحًا');

// ④ الأسلاك: الخادم يستعمل الأقفال، والعميل يفعّل العدالة في المقارنة،
//    ومحرك OpenAI اختياري بمفتاح الخادم فقط.
const create = fs.readFileSync(path.join(__dirname, '../api/_lib/fashion-create.js'), 'utf8');
const studios = fs.readFileSync(path.join(__dirname, '../js/app-12-studios.js'), 'utf8');
const partials = fs.readFileSync(path.join(__dirname, '../js/partials-core.js'), 'utf8');
assert.ok(create.includes("require('./fashion-locks')") && create.includes('locksFor({'), 'fashion-create يستعمل الأقفال');
assert.ok(!create.includes('Keep the same person, pose, face and background, but change only'), 'السطر الضعيف القديم أزيل');
assert.ok(create.includes("engine === 'openai'") && create.includes('gpt-image-1'), 'محرك gpt-image-1 اختياري');
assert.ok(create.includes('images/edits') && create.includes('OPENAI_API_KEY'), 'مفتاح OpenAI من الخادم لا من العميل');
assert.ok(studios.includes('fairness: true'), 'مقارنة العميل تفعّل قفل العدالة');
assert.ok(studios.includes('v-fashion-cards') && studios.includes('اضغطي للاختيار'), 'بطاقات المقارنة بشكل التصميم المعتمد مع اختيار ذهبي');
assert.ok(partials.includes('fashionAiEngine'), 'مبدّل المحرك موجود في الواجهة');
console.log('  ✓ الأسلاك: خادم + عميل + مبدّل المحرك');

console.log('fashion locks tests passed');
