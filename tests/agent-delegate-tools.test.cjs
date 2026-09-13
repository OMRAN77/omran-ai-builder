// tests/agent-delegate-tools.test.cjs — v-agent-smoke: تحقّق من سلسلة التفويض.
// اختبار صغير يثبت أنّ api/_lib/agent-delegate.js يصدّر تعريفَي الأداتين كما يتوقّعهما
// وكيل التطبيق: الاسمان delegate_code_task وcheck_code_task، ولكلّ أداة input_schema
// من نوع object فيه الحقل المطلوب (task للأولى، issue للثانية). تغييرُ اسم أو إسقاطُ
// حقل مطلوب يكسر نداء النموذج للأداة بلا خطأ ظاهر، فيُمسك هنا.
const test = require('node:test');
const assert = require('node:assert/strict');

const D = require('../api/_lib/agent-delegate.js');

test('agent-delegate exports both tool definitions with their names', () => {
  assert.ok(D.START_TOOL && typeof D.START_TOOL === 'object', 'START_TOOL مصدَّر');
  assert.ok(D.CHECK_TOOL && typeof D.CHECK_TOOL === 'object', 'CHECK_TOOL مصدَّر');
  assert.equal(D.START_TOOL.name, 'delegate_code_task');
  assert.equal(D.CHECK_TOOL.name, 'check_code_task');
});

test('each tool declares an input_schema with its required field', () => {
  for (const [tool, required] of [[D.START_TOOL, 'task'], [D.CHECK_TOOL, 'issue']]) {
    const s = tool.input_schema;
    assert.ok(s && typeof s === 'object', tool.name + ': input_schema موجود');
    assert.equal(s.type, 'object', tool.name + ': المخطّط من نوع object');
    assert.ok(s.properties && typeof s.properties === 'object', tool.name + ': properties موجودة');
    assert.ok(Array.isArray(s.required), tool.name + ': required مصفوفة');
    assert.deepEqual(s.required, [required], tool.name + ': الحقل المطلوب ' + required);
    assert.ok(s.properties[required], tool.name + ': الحقل المطلوب معرَّف في properties');
  }
});
