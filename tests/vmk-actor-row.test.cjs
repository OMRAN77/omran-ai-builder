'use strict';
/* v-vmk-actor-row — تدقيق الإنتاج ١٨–١٩ أكتوبر (جوّال إنجليزيّ، «🗣️ ممثل يتكلم»): خانة «What does the actor say? (exactly)» عرضها ٣١px على
   هاتف ٣٩٠ فلا يُكتب فيها. العنوان <label> ابنٌ لصفّ .mini-mic-field-row المرن (display:flex بلا التفاف) بجانب الخانة والميكروفون، فأخذ
   ٢٦١ من ٣٣٦ بالإنجليزيّ (١٣٠ بالعربيّ). الإصلاح في css/modules.css: صفّا الممثل والتوقيع (البنية نفسها) يلتفّان والعنوان سطر كامل فوق
   الخانة، كعنوان «صوت الممثل» تحته. القياس بالمتصفّح في وصف طلب السحب. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const bare = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

test('١. البنية التي سبّبت العطب: العنوان ابن مباشر لصفّ مرن فيه الخانة والميكروفون', () => {
  const P = read('js/partials-core.js');
  for (const [row, field] of [['videoMakerActorRow', '<textarea id="videoMakerActorSpeech"'], ['videoMakerSignatureRow', '<input type="text" id="videoMakerSignature"']]) {
    const a = P.indexOf('id="' + row + '"');
    assert.ok(a > 0, row);
    const seg = P.slice(a, P.indexOf('</div>', a));
    assert.match(seg, /^id="[\w]+" style="[^"]*"[^>]*>\s*<label /, row + ': العنوان أوّل ابن للصفّ');
    assert.ok(seg.includes(field), row + ': الخانة في الصفّ نفسه');
  }
  assert.match(bare(read('css/tokens.css')), /\.mini-mic-field-row\{ display:flex;/);
});

test('٢. صفّا الممثل والتوقيع يلتفّان والعنوان سطر كامل (flex:0 0 100%) — في كلّ مقاس ولغة', () => {
  const css = bare(read('css/modules.css'));
  assert.ok(css.includes('#videoMakerModal #videoMakerActorRow,#videoMakerModal #videoMakerSignatureRow{flex-wrap:wrap}'), 'التفاف الصفّين');
  assert.ok(css.includes('#videoMakerModal #videoMakerActorRow>label,#videoMakerModal #videoMakerSignatureRow>label{flex:0 0 100%}'), 'العنوان سطر كامل');
  // لا قاعدة أخرى تمنع الالتفاف في هذين الصفّين أو في صفوف الميكروفون عمومًا
  for (const f of fs.readdirSync(path.join(ROOT, 'css')).filter((x) => x.endsWith('.css'))) {
    const c = bare(read('css/' + f));
    assert.doesNotMatch(c, /(videoMakerActorRow|videoMakerSignatureRow|mini-mic-field-row)[^{}]*\{[^}]*flex-wrap:\s*nowrap/, f);
  }
  assert.doesNotMatch(read('index.html'), /(videoMakerActorRow|videoMakerSignatureRow|mini-mic-field-row)[^{}]*\{[^}]*flex-wrap:\s*nowrap/);
});

test('٣. وسم modules.css مرفوع', () => {
  const m = /css\/modules\.css\?v=(\d+)/.exec(read('index.html'));
  assert.ok(m && Number(m[1]) >= 688, 'وسم modules.css');
});
