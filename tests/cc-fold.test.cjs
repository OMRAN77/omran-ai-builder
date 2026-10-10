'use strict';
/* v-cc-fold — أدوات Claude Code وأكواده مطويّة داخل المحادثة كتطبيق Claude (طلب المالك ٢٥ سبتمبر):
   الجسر يرسل تفاصيل الأداة وناتجها، والعميل يحفظ الردّ أجزاءً بترتيبها ويرسمها مطويّة. */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

(async () => {
  const P = await import('../cc-bridge/policy.mjs');
  // ١. تفاصيل الأداة: الأمر كاملًا، التعديل «- قبل / + بعد»، الكتابة «+»، والقراءة بلا تفاصيل (ناتجها يكفي)
  assert.strictEqual(P.detailTool('Bash', { command: 'npm run ci' }), 'npm run ci');
  assert.strictEqual(P.detailTool('Edit', { old_string: 'a\nb', new_string: 'c' }), '- a\n- b\n+ c');
  assert.strictEqual(P.detailTool('Write', { content: 'x\ny' }), '+ x\n+ y');
  assert.match(P.detailTool('MultiEdit', { edits: [{ old_string: 'a', new_string: 'b' }, { old_string: 'c', new_string: 'd' }] }), /^- a\n\+ b\n…\n- c\n\+ d$/);
  assert.strictEqual(P.detailTool('Read', { file_path: 'x.js' }), '');
  const long = P.detailTool('Bash', { command: 'x'.repeat(5000) });
  assert.ok(long.length < 3100 && long.endsWith('(مقصوص)'), 'سقف الحجم');

  // ٢. الجسر: التفاصيل والناتج منقّحان من الأسرار، بمعرّف يربطهما
  const srv = read('cc-bridge/server.mjs');
  assert.match(srv, /log\.push\(\{ tool: \{ id: b\.id, name: b\.name, brief: redact\(briefTool\(b\.name, b\.input\)\), detail: redact\(detailTool\(b\.name, b\.input\)\) \} \}\);/);
  assert.match(srv, /log\.push\(\{ toolResult: \{ id: b\.tool_use_id, error: !!b\.is_error, text: redact\(/);

  // ٣. العميل: الحفظ أجزاءً بترتيبها، والرمز في أوّل نصّ، وسقف الحجم
  const win = { localStorage: { getItem: () => '', setItem() {}, removeItem() {} } };
  new Function('window', 'localStorage', read('js/app-29-cc.js'))(win, win.localStorage);
  const F = win.omranCC._fold;
  const cur = { messages: [] };
  F.push(cur, 'نصّ فقط', [{ t: 'text', s: 'نصّ فقط' }]);
  assert.strictEqual(cur.messages[0]._ccParts, undefined, 'بلا أدوات = رسالة عاديّة');
  const parts = [{ t: 'text', s: 'أقرأ' }, { t: 'tools', items: [{ id: '1', name: 'Read', brief: 'قراءة x.js', result: 'abc' }] }, { t: 'text', s: 'تمّ' }];
  F.push(cur, 'أقرأتمّ', parts);
  const m = cur.messages[1];
  assert.strictEqual(m._cc, true);
  assert.strictEqual(m.content, '🧑‍💻 أقرأتمّ', 'النصّ الكامل يبقى للنسخ والقراءة والتصدير');
  assert.deepStrictEqual(m._ccParts.map((p) => p.t), ['text', 'tools', 'text']);
  assert.strictEqual(m._ccParts[0].s, '🧑‍💻 أقرأ');
  const big = F.capParts([{ t: 'tools', items: [{ result: 'x'.repeat(50000) }, { result: 'y'.repeat(20000) }] }]);
  assert.strictEqual(big[0].items[0].result.length, 50000);
  assert.strictEqual(big[0].items[1].result, '… (حُذف للحجم)', 'ما فوق ٦٠ ألفًا يُحذف');

  // ٤. الجمع أثناء البثّ والرسم: الأدوات بمعرّفها، الناتج يلتحق بأداته، والرسم من renderMessages
  const cc = read('js/app-29-cc.js');
  assert.match(cc, /if\(ev\.toolResult\) parts\.forEach/);
  assert.match(cc, /push\(cur, prevOut \+ body \+ \(foot \? '\\n\\n' \+ foot : ''\) \+ x\.hint, ccParts\);/);
  assert.match(cc, /var FOLD_BUDGET = 60000, CODE_FOLD_LINES = 15;/);
  assert.match(cc, /document\.createElement\('details'\)/);
  assert.match(cc, /'🔧 استخدم ' \+ items\.length/);
  const r = read('js/app-04-i18n-state.js');
  assert.match(r, /if\(m\._cc && window\.omranCC && typeof window\.omranCC\.decorate === 'function'\)\{/);
  assert.ok(r.indexOf('window.omranCC.decorate(textDiv, m)') > r.indexOf('msgWordEls = buildSpokenWordSpans(textDiv'), 'بعد الرسم العاديّ');

  console.log('cc-fold: ok');
})().catch((e) => { console.error(e); process.exit(1); });
