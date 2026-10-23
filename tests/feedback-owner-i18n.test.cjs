'use strict';
/* tests/feedback-owner-i18n.test.cjs — v-fb-owner-i18n (تدقيق ١٨ أكتوبر، لقطتا ٠٢٨ و٠٤٧).
   العرض: في «آراء المستخدمين» للمالك عنوان «🚩 بلاغات المحتوى» عربيّ في الإنجليزيّ، والاسم اللاتينيّ برموز مع الوقت
   ينقلب في السطر العربيّ: «8989][po · 2026-10-18 08:15» يظهر «po · 2026-10-18 08:15][8989».
   هنا: fbOwnerListHtml الحقيقيّة من app-05-ui في vm بقاموس اللغة الحقيقيّ. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { dicts, tFor, AR_RE, visibleOutsideIso, clientSlice, LANGS12 } = require('./_owner-vm.cjs');

const render = (lang) => clientSlice('js/app-05-ui.js', '  function fbEsc(', "  document.getElementById('fbOwnerBtn').onclick", { t: tFor(lang) }).fbOwnerListHtml;
const items = [{ rating: 4, chips: ['fbChipAI'], note: 'good', user: '8989][po', ts: '2026-10-18T08:15:30Z' }, { rating: 5, user: 'سارة', ts: '2026-10-17T07:00:00Z' }];
const reports = [{ content: 'bad reply', user: 'Taryam777777', provider: 'chat', ts: '2026-10-18T09:00:00Z' }];

test('١. الاسم في <bdi> والوقت في <bdi dir="ltr"> للآراء والبلاغات، والمزوّد معزول أيضًا', () => {
  const html = render('ar')(items, reports);
  assert.ok(html.includes('<div class="fbMeta"><bdi>8989][po</bdi> · <bdi dir="ltr">2026-10-18 08:15</bdi></div>'), html);
  assert.ok(html.includes('<div class="fbMeta"><bdi>سارة</bdi> · <bdi dir="ltr">2026-10-17 07:00</bdi></div>'));
  assert.ok(html.includes('<div class="fbMeta"><bdi>Taryam777777</bdi> · <bdi>chat</bdi> · <bdi dir="ltr">2026-10-18 09:00</bdi></div>'));
});

test('٢. عنوان البلاغات بلغة الواجهة (fbReportsTitle) بالـ١٤ لغة', () => {
  const en = render('en')(items, reports);
  assert.match(en, />🚩 Content reports \(1\)<\/div>/);
  assert.ok(!AR_RE.test(visibleOutsideIso(en)), visibleOutsideIso(en));
  assert.match(render('ar')(items, reports), />🚩 بلاغات المحتوى \(1\)<\/div>/);
  const I = dicts();
  for (const lg of ['ar', 'en', ...LANGS12]) assert.ok(typeof I[lg].fbReportsTitle === 'string' && I[lg].fbReportsTitle.startsWith('🚩 '), lg);
});
