'use strict';
/* v-codemap (طلب المالك ١٠ أكتوبر «المزوّدون يكون عندهم كافّة المعلومات… معلومات الكود من الصفر»):
   خريطة الكود كلّه مولَّدة آليًّا (scripts/codemap.mjs → api/_lib/codemap.json، ويعيدها codemap.yml بعد كلّ دمج)،
   ملخّصها في معرفة المالك، وتفصيلها بـread_github what=map — محلّيّة بلا نداء GitHub. */
process.env.AUTH_SECRET = 'synthetic-test-secret-' + 'x'.repeat(40);
process.env.OWNER_USERNAME = 'omran';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');

(async () => {
  // ١) المولّد: يقرأ الملفّات نفسها — غرض ودوالّ وأدوات وعناصر واجهة، بلا أرقام أسطر (تتغيّر مع كلّ تعديل)
  const gen = await import(path.join(ROOT, 'scripts/codemap.mjs'));
  const built = gen.build();
  const chat = built.files.find((e) => e.p === 'api/_lib/chat.js');
  assert.ok(built.files.length > 300, 'الخريطة تغطّي الكود كلّه');
  assert.ok(chat && chat.d && chat.k === 1, 'chat.js بغرضه المكتوب');
  assert.ok(chat.t.includes('read_github') && chat.f.includes('toolsFor'), 'أدوات chat.js ودوالّه');
  const idx = built.files.find((e) => e.p === 'index.html');
  assert.ok(idx && idx.u && idx.u.length > 50 && idx.u.some((u) => /«[^»]+»/.test(u)), 'عناصر الواجهة id«نصّها»');
  assert.ok(!built.files.some((e) => e.p === 'js/app.bundle.js' || /\/vendor\//.test(e.p) || e.p === 'api/_lib/codemap.json'), 'لا الحزمة المبنيّة ولا vendor ولا الخريطة نفسها');
  assert.ok(built.files.every((e) => Object.keys(e).every((k) => ['p', 'n', 'd', 'k', 'f', 'x', 't', 'u'].includes(k))), 'لا حقل أسطر متغيّر');
  assert.strictEqual(gen.serialize(built), gen.serialize(gen.build()), 'التوليد حتميّ');
  console.log('✓ codemap: المولّد يقرأ كلّ ملفّ — غرضه ودوالّه وأدواته وعناصر واجهته');

  // ٢) الملفّ المحفوظ يُقرأ في الخادم (require يتتبّعه Vercel)
  const saved = require('../api/_lib/codemap.json');
  assert.ok(saved.files.length > 300 && saved.files.some((e) => e.p === 'api/_lib/chat.js'), 'codemap.json محفوظ وكامل');

  // ٣) read_github what=map: محلّيّة — أيّ نداء شبكة هنا خطأ
  const realFetch = global.fetch;
  global.fetch = () => { throw new Error('لا شبكة في الخريطة'); };
  const gr = require('../api/_lib/github-read.js');
  const R = 'OMRAN77/omran-ai-builder';
  const all = await gr.readGithub({ url: R, what: 'map' });
  assert.ok(/^خريطة الكود — \d+ ملفًّا/.test(all) && all.includes('## api/_lib') && all.length <= 28000, 'بلا path: كلّ المجلّدات ضمن الحدّ');
  const dir = await gr.readGithub({ url: R, path: 'api/_lib', what: 'map' });
  assert.ok(dir.includes('api/_lib/chat.js (~') && !dir.includes('## js'), 'path=مجلّد: ملفّاته بأغراضها وحده');
  const file = await gr.readGithub({ url: R, path: 'api/_lib/chat.js', what: 'map' });
  assert.ok(file.includes('### api/_lib/chat.js') && file.includes('الدوالّ (') && file.includes('toolsFor') && file.includes('read_github'), 'path=ملفّ: دوالّه وأدواته');
  const q = await gr.readGithub({ url: R, what: 'map', query: 'toolsFor' });
  assert.ok(q.includes('api/_lib/chat.js') && q.includes('يطابق: toolsFor'), 'query: يجد الدالّة وملفّها');
  const ui = idx.u.find((u) => /«[^»]{3,}»/.test(u));
  const label = /«([^»]+)»/.exec(ui)[1].replace('…', '');
  const qu = await gr.readGithub({ url: R, what: 'map', query: label });
  assert.ok(qu.includes('index.html') && qu.includes(ui.split('«')[0]), 'نصّ ظاهر من لقطة يعطي id العنصر وملفّه');
  assert.ok(/لمستودع التطبيق وحده/.test(await gr.readGithub({ url: 'someone/other', what: 'map' })), 'مستودع آخر: لا خريطة');
  assert.ok(/لا شيء في الخريطة/.test(await gr.readGithub({ url: R, path: 'no/such/dir', what: 'map' })), 'مسار غير موجود: يقولها');
  global.fetch = realFetch;
  console.log('✓ codemap: read_github what=map — مجلّدات/مجلّد/ملفّ/بحث، بلا شبكة');

  // ٤) معرفة المالك تحمل ملخّص الخريطة وقاعدة «الخريطة قبل أيّ حكم» — للمالك وحده
  const { ownerKnowledge } = require('../api/_lib/_knowledge.js');
  const { makeToken } = require('../api/_lib/auth.js');
  const o = ownerKnowledge({ query: {}, body: {} }, makeToken('omran'));
  assert.ok(o.includes('خريطة الكود (مولَّدة آليًّا') && o.includes('what=map') && o.length - o.indexOf('خريطة الكود (مولَّدة') < 1200, 'المالك يأخذ سطر الخريطة التفصيليّة — قصيرًا (المستودع في REPO_NOTE)');
  assert.ok(/الخريطة أوّلًا ثمّ الملفّ نفسه/.test(o) && /لا تخمّن مكان شيء/.test(o), 'قاعدة الخريطة قبل الحكم');
  assert.strictEqual(ownerKnowledge({ query: {}, body: {} }, makeToken('guest')), '', 'الضيف لا شيء');
  const PL0 = require('../api/_lib/provider-level.js');
  assert.ok(PL0.ownerBrief(o, false).includes('خريطة الكود (مولَّدة') && !PL0.ownerBrief(o, true).includes('خريطة الكود'), 'دور بلا أدوات: لا خريطة تسمّي الأدوات');
  console.log('✓ codemap: معرفة المالك فيها ملخّص الخريطة وقاعدتها');

  // ٥) الأداة تعرف map: نسخة المالك في المحادثة، والوكيل
  const PL = require('../api/_lib/provider-level.js');
  const base = { name: 'read_github', description: 'd', input_schema: { type: 'object', properties: { what: { type: 'string', enum: ['auto', 'commits'], description: 'w' } } } };
  const ro = PL.ownerReadTool(base).input_schema.properties.what;
  assert.ok(ro.enum.includes('map') && ro.description.includes('map = خريطة'), 'المالك: what=map بوصفه');
  assert.deepStrictEqual(base.input_schema.properties.what.enum, ['auto', 'commits'], 'المشتركة كما هي');
  const agent = fs.readFileSync(path.join(ROOT, 'api/_lib/agent.js'), 'utf8');
  assert.ok(agent.includes("enum: ['auto', 'commits', 'commit', 'map']"), 'الوكيل: what=map');

  // ٦) تُعاد بعد كلّ دمج — الخريطة وحدها، بلا CI. الملفّ يضيفه المالك (رفع ملفّات الـworkflows يحتاج صلاحيّة workflows
  //    لا يملكها تكامل GitHub الذي فتح الطلب) — فيُفحص إن وُجد، ولا يكسر CI قبل إضافته.
  const wfPath = path.join(ROOT, '.github/workflows/codemap.yml');
  const wf = fs.existsSync(wfPath) ? fs.readFileSync(wfPath, 'utf8') : '';
  if (wf) assert.ok(/branches: \[main\]/.test(wf) && wf.includes('node scripts/codemap.mjs') && wf.includes('git add -- api/_lib/codemap.json') && wf.includes('[skip ci]'), 'codemap.yml يعيدها بعد الدمج');
  console.log('✓ codemap: what=map للمالك والوكيل' + (wf ? '، وcodemap.yml يعيدها بعد كلّ دمج' : ' (codemap.yml لم يُضف بعد)'));
})().catch((e) => { console.error(e); process.exit(1); });
