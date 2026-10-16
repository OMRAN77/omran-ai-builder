// v-social-bot: بوت التسويق — الفكرة تدور، النصّ صادق بالزمن الفعليّ، والجدول لا يتخطّى حصّة Upload-Post المجانيّة.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const ideas = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'social-bot-ideas.json'), 'utf8'));
const src = fs.readFileSync(path.join(ROOT, 'scripts', 'social-bot.mjs'), 'utf8');
const load = () => import(path.join(ROOT, 'scripts', 'social-bot.mjs'));

test('١) قائمة الأفكار سليمة: اسم + طلب قصير يُكتب على الشاشة + وسوم', () => {
  assert.ok(ideas.length >= 20);
  const names = new Set();
  for (const i of ideas) {
    assert.ok(i.name && i.prompt && Array.isArray(i.tags));
    assert.ok(i.prompt.length <= 100, 'الطلب يُكتب حيًّا في الفيديو فيبقى قصيرًا: ' + i.name);
    assert.ok(i.tags.every((t) => t.startsWith('#') && !/\s/.test(t)));
    assert.ok(!names.has(i.name)); names.add(i.name);
  }
});

test('٢) الفكرة تدور برقم التشغيل، وIDEA_INDEX يغلبه، وتلتفّ بلا خروج عن القائمة', async () => {
  const { pickIdea } = await load();
  assert.equal(pickIdea(ideas, '', '5', 0).idx, 5);
  assert.equal(pickIdea(ideas, '2', '5', 0).idx, 2);
  assert.equal(pickIdea(ideas, undefined, undefined, ideas.length + 3).idx, 3);
  assert.equal(pickIdea(ideas, '-1', '', 0).idx, ideas.length - 1);
});

test('٣) العدد بصيغة عربيّة صحيحة والنصّ يحمل الزمن الفعليّ والرابط', async () => {
  const { secWord, buildCaption } = await load();
  assert.equal(secWord(2), 'ثانيتين');
  assert.equal(secWord(7), '7 ثواني');
  assert.equal(secWord(45), '45 ثانية');
  const c = buildCaption(ideas[0], 45);
  assert.match(c.ig, /45 ثانية/);
  assert.match(c.ig, /الرابط في البايو/);
  assert.match(c.fb, /https:\/\/omran-ai-builder\.vercel\.app\/\?ref=fb/);
  assert.ok(c.ig.includes('#OMAi'));
  assert.ok((c.ig.match(/#/g) || []).length <= 30, 'إنستقرام يقبل 30 وسمًا كحدّ أقصى');
});

test('٤) الزمن في الفيديو هو الزمن المقيس، ولا نشر لموقع هزيل', () => {
  assert.match(src, /m\.secs = Math\.max\(1, Math\.round\(doneAt - m\.send\)\)/);
  assert.match(src, /quality gate/);
  assert.match(src, /DRY_RUN/);
});

test('٥) المونتاج ضمن مدّة الريلز (15–30 ث)', async () => {
  const { timeline } = await load();
  const m = { a0: 0, send: 5 };
  for (const siteH of [1500, 6000]) {
    const tl = timeline(m, siteH);
    assert.ok(tl.total >= 15 && tl.total <= 30, String(tl.total));
  }
});
