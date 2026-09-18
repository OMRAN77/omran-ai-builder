// tests/long-reply-off.test.cjs — v-long-reply-off: «أريد حذف اقرأ كامل / اطوِ في المحادثة».
// الردّ الطويل كان يُقصّ بقناع ويُعرض زرّان تحته؛ المالك يريد الردّ كاملًا بلا أزرار.
// يثبت أنّ القصّ والزرّين ولوحة القراءة أُزيلت من المصدر ومن الحزمة معًا.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('لا قصّ ولا أزرار «اقرأ كامل الرد» / «اطوِ» في المصدر والحزمة', () => {
  for (const f of ['js/app-04-i18n-state.js', 'js/app.bundle.js']) {
    const s = read(f);
    for (const bad of ['اقرأ كامل الرد', 'Read full reply', 'omranLongClip', 'OMRAN_LONG_REPLY_CHARS', '__expandedLong', 'omranOpenReplyInPanel']) {
      assert.ok(!s.includes(bad), f + ' ما زال يحوي: ' + bad);
    }
    assert.ok(s.includes('v-long-reply-off'), f + ' يحمل أثر القرار');
  }
});
