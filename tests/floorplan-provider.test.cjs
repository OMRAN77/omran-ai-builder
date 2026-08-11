const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-15-floorplan.js'), 'utf8');

assert.match(source, /function requestPlanSpec\(desc\)/, 'the interactive editor must have its own plan request');
assert.match(source, /fetch\('\/api\/gemini'/, 'the interactive editor must use the available Gemini route');
assert.match(source, /model: 'gemini-flash-latest'/, 'the editor must request the supported Gemini alias');
assert.doesNotMatch(source, /claudeProxyRequest\(/, 'the editor must not depend on the depleted Anthropic account');
assert.doesNotMatch(source, /statusMsg\([^\n]*(?:err\.message|String\(.*err)/, 'provider errors must not reach the status element');
assert.doesNotMatch(source, /reply\(\{ ok: false, error: \(data && data\.error\)/, 'image provider errors must not cross the iframe bridge');
assert.match(source, /statusMsg\('⚠️ تعذر تجهيز المخطط الآن\. حاول مرة أخرى بعد قليل\.'\)/, 'the editor must show a calm Arabic failure');

const imageFailure = "reply({ ok: false, error: 'تعذر توليد الصورة الآن. حاول مرة أخرى بعد قليل.' });";
assert.equal(source.split(imageFailure).length - 1, 2, 'HTTP and network image failures must use the same safe message');

console.log('floorplan provider tests passed');
