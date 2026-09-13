'use strict';
/* v-maha-name — «مها» اسم المساعدة الصوتيّة في التطبيق، والنموذج النصّيّ («عمران»)
   لم يكن يعرفه فردّ «هلا مها، كيفك؟ وش تحتاجين» على المستخدم. الاختبار يثبّت
   أنّ بصمة الشخصيّة تعرّفه بالاسم وتمنعه من مناداة المستخدم به، وأنّ مدير
   الذاكرة لا يسجّل «مها» أو «عمران» اسمًا للمستخدم. */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const chat = fs.readFileSync(path.join(__dirname, '..', 'api', '_lib', 'chat.js'), 'utf8');
const persona = chat.slice(chat.indexOf("const PERSONA_NOTE = 'أنت «عمران»"), chat.indexOf('LANGUAGE (highest priority)'));
assert.ok(persona.includes('«مها» هي المساعدة الصوتيّة في هذا التطبيق نفسه'), 'البصمة تعرّف النموذج بمها');
assert.ok(persona.includes('إذا ناداك المستخدم «مها» فهو يخاطبك أنت'), 'النداء بمها = مخاطبة المساعد');
assert.ok(persona.includes('«مها» ليست اسم المستخدم أبدًا ولا تنادِه بها'), 'لا مناداة للمستخدم بمها');
// السطر يسبق قاعدة اللغة مباشرةً — أي في أوّل ما يقرأه النموذج في المسارات كلّها (الاحترافيّ والمجانيّ والاجتماعيّ)
assert.ok(/PERSONA_NOTE \+ '\\n' \+ baseSystem/.test(chat), 'البصمة تتصدّر النظام');
assert.ok((chat.match(/streamFreeChain\(\{ system: PERSONA_NOTE \+ '\\n' \+ baseSystem/g) || []).length >= 2, 'السلسلة المجانيّة تأخذ البصمة نفسها');

const memory = fs.readFileSync(path.join(__dirname, '..', 'api', '_lib', 'memory.js'), 'utf8');
assert.ok(memory.includes('«مها» و«عمران» اسما مساعدَي التطبيق'), 'مدير الذاكرة يعرف الاسمين');
assert.ok(memory.includes('لا تسجّلهما اسمًا للمستخدم أو لأحد من أهله'), 'لا يسجّلهما اسمًا للمستخدم');
assert.ok(memory.includes('واحذفهما إن وُجدا كذلك في الملف القديم'), 'ينظّف الملفّات القديمة');

// v-no-provider-names: لا اسم مزوّد أو نموذج للمستخدم، ولا «مشروع» باسم نموذج — في البصمة والذاكرة والمعرفة
assert.ok(persona.includes('أسماء النماذج ومزوّدي الذكاء الاصطناعي (أيّ شركة أو نموذج) لا تُذكر للمستخدم أبدًا'), 'البصمة تمنع أسماء المزوّدين');
assert.ok(persona.includes('ولا تنسب إلى المستخدم «مشروعًا» أو «عملًا» باسم نموذج أو مزوّد'), 'لا مشروع باسم نموذج');
assert.ok(memory.includes('ليست مشاريع للمستخدم ولا حقائق عنه'), 'الذاكرة لا تسجّل النماذج مشاريع');
const know = fs.readFileSync(path.join(__dirname, '..', 'api', '_lib', '_knowledge.js'), 'utf8');
assert.ok(know.includes('لا تُذكر في الردّ أبدًا ولا تُنسب لعمران مشروعًا'), 'خريطة المزوّدين في معرفة المالك داخليّة');

// لا اسم مزوّد في نصّ يراه المستخدم أو النموذج هنا
assert.ok(!/claude|gemini|groq|openai|mistral/i.test(persona), 'بلا أسماء مزوّدين في البصمة');
console.log('✓ maha-name: مها اسم المساعد لا اسم المستخدم — في البصمة والذاكرة');
