'use strict';
/* v-btn-no-lift (المالك ٢٤ أكتوبر بعد فحص الديكور: «شيل الارتفاع ١ بكسل من أزرار التطبيق كله»): المرور على أيّ زرّ يلوّنه ولا يرفعه.
   المصدر الأوسع `.btn:hover` و`.btn.primary:hover` في css/tokens.css، ومعها أزرار لها قاعدتها: بطاقات الخطوط وخيارات الخلفيّة (أزرار)،
   زرّ رفع التعليم، منطقة رفع المصاريف، زرّ توليد صانع الفيديو، زرّ إرسال «رأيك يهمنا» (كان ٢px)، وخيارات المحادثة (.omranOpt).
   مسبار المرور على كلّ زرّ ظاهر (الرئيسيّة، الديكور، صانع الفيديو، رأيك يهمنا): main يتحرّك «أعطني أفكارًا» 1px و«إرسال التقييم» 2px، والفرع صفر. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const rule = (src, sel) => { const i = src.indexOf(sel + '{'); assert.ok(i >= 0, 'قاعدة مفقودة: ' + sel); return src.slice(i, src.indexOf('}', i) + 1); };
const LIFT = /translateY\(-\d/;

const CASES = [
  ['css/tokens.css', '.btn:hover'],
  ['css/tokens.css', '.btn.primary:hover'],
  ['css/tokens.css', '.ofp-card:hover'],
  ['css/خلفيات.css', '.bgImgOpt:hover'],
  ['css/modules.css', '#eduHubModal .eduUploadBtn:hover'],
  ['css/modules.css', '#expModal .expDrop:hover'],
  ['css/modules.css', '#videoMakerModal #videoMakerGenerateBtn:hover'],
  ['js/app-05-ui.js', '#fbSendBtn:hover'],
  ['js/app-04-i18n-state.js', '.omranOpt:hover'],
];

test('١ قواعد مرور الأزرار باقية (لون/ظلّ) بلا رفع', () => {
  for (const [f, sel] of CASES) {
    const r = rule(read(f), sel);
    assert.doesNotMatch(r, LIFT, f + ' ' + sel + ': ' + r);
    assert.match(r, /border-color|box-shadow|background/, f + ' ' + sel + ': المرور ما زال يُرى');
  }
});

test('٢ لا رفع لأيّ زرّ عند المرور في أوراق الأنماط (المحدِّد ينتهي بزرّ معروف)', () => {
  const BTN = /(\.btn(\.primary)?|Btn|\.omranOpt|\.ofp-card|\.bgImgOpt|\.expDrop):hover/;
  for (const f of ['css/tokens.css', 'css/modules.css', 'css/redesign.css', 'css/خلفيات.css']) {
    const css = read(f);
    const re = /([^{}]+)\{([^}]*)\}/g; let m;
    while ((m = re.exec(css))) {
      const sels = m[1].split(',').map((s) => s.trim()).filter((s) => BTN.test(s) && !/\.(omToolCard|vmk-card|vmk-sm|eduSubjCard|hasToolPhoto|hwToolCard)/.test(s));
      if (sels.length) assert.doesNotMatch(m[2], LIFT, f + ': ' + sels.join(', '));
    }
  }
});

test('٣ الحزمة مبنيّة من الأجزاء، والوسوم مرفوعة', () => {
  const bundle = read('js/app.bundle.js');
  assert.ok(bundle.includes("'.omranOpt:hover{border-color:var(--accent2,#a78bfa);}'"), 'خيارات المحادثة في الحزمة');
  assert.ok(bundle.includes('#fbSendBtn:hover{box-shadow:'), 'زرّ الإرسال في الحزمة');
  const html = read('index.html');
  const tag = (name) => Number((new RegExp(name.replace(/[.?]/g, '\\$&') + '\\?v=(\\d+)').exec(html) || [])[1] || 0);
  assert.ok(tag('css/tokens.css') >= 740, 'tokens.css');
  assert.ok(tag('css/modules.css') >= 693, 'modules.css');
  assert.ok(tag('css/خلفيات.css') >= 6, 'خلفيات.css');
});
