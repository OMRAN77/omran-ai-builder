'use strict';
/* v-maha-greet (المالك ١ أكتوبر: «الي أريده من أوّل ما تفتح تردّ عليك»): كانت مها صامتة بعد نغمة الجاهزية حتّى
   يتكلّم المستخدم. الآن تبادر بتحيّة قصيرة — إلّا إن قال شيئًا أثناء التجهيز، أو في إعادة الاتّصال، أو في البنّاء. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js/app-08-maha.js'), 'utf8');
const a = src.indexOf('if(!preBufSent && !mahaRtReconnecting && mahaCallMode !== \'builder\'){');
const block = src.slice(a, src.indexOf("__swallow(e, 'maha:greet'); }\n      }", a) + "__swallow(e, 'maha:greet'); }\n      }".length);

function run(ctx) {
  const sent = [];
  const c = Object.assign({ preBufSent: false, mahaRtReconnecting: false, mahaCallMode: 'assistant', lang: 'ar', __swallow() {}, dc: { send: (m) => sent.push(JSON.parse(m)) } }, ctx);
  vm.createContext(c);
  vm.runInContext(block, c);
  return sent;
}

test('١. المكالمة تفتح ← تحيّة واحدة بلغة الواجهة واسمها', () => {
  assert.ok(a > 0);
  const sent = run({});
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, 'response.create');
  assert.match(sent[0].response.instructions, /greet the user warmly in ONE short natural sentence, say your name/);
  assert.match(sent[0].response.instructions, /code "ar"/);
  assert.match(run({ lang: 'en' })[0].response.instructions, /code "en"/);
});

test('٢. لا تحيّة: كلام أثناء التجهيز، إعادة الاتّصال، البنّاء', () => {
  assert.equal(run({ preBufSent: true }).length, 0);
  assert.equal(run({ mahaRtReconnecting: true }).length, 0);
  assert.equal(run({ mahaCallMode: 'builder' }).length, 0);
});

test('٣. الترتيب: بعد الجاهزية والنغمة — والحزمة محدَّثة', () => {
  for (const f of ['js/app-08-maha.js', 'js/app.bundle.js']) {
    const s = fs.readFileSync(path.join(root, f), 'utf8');
    const ready = s.indexOf('mahaRtReady = true;', s.indexOf('const preBufSent = mahaFlushPreBuffer(dc);'));
    const beep = s.indexOf('mahaPlayReadyBeep();', ready);
    const greet = s.indexOf("if(!preBufSent && !mahaRtReconnecting && mahaCallMode !== 'builder'){", beep);
    assert.ok(ready > 0 && beep > ready && greet > beep, f);
  }
});
