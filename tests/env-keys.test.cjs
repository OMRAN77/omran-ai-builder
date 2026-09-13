// tests/env-keys.test.cjs — v-key-shape: مفتاح OpenRouter (sk-or-…) وُضع في ANTHROPIC_API_KEY
// فكانت كلّ محادثة كلود تُرفض بـ401 وتسقط للاحتياط الضعيف بلا سبب ظاهر. يثبت: (١) تصنيف شكل
// المفتاح من بادئته العامّة، (٢) التطبيع ينقل مفتاح OpenRouter إلى مكانه ويقصّ الفراغات ولا يمسّ
// المفتاح الصحيح، (٣) يعمل عند التحميل في عمليّة حقيقيّة وفي بيئة عارية بلا رمي، (٤) كلّ نقطة
// دخول تحمّله بجانب _fetch-timeout، (٥) claude-diag يشرح النقل بدل «غير مضبوط».
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const { shape, normalize } = require('../api/_lib/_env-keys.js');

test('١. shape: البادئة العامّة تصنّف المفتاح بلا كشفه', () => {
  assert.equal(shape('sk-ant-api03-' + 'x'.repeat(95)).kind, 'api');
  assert.equal(shape('sk-ant-oat01-abc').kind, 'oauth');
  assert.equal(shape('sk-ant-admin01-abc').kind, 'admin');
  assert.equal(shape('sk-or-v1-abc').kind, 'openrouter');
  assert.equal(shape('sk-proj-abc').kind, 'other');
  assert.equal(shape('AIzaSy').kind, 'other');
  assert.equal(shape('sk-ant-zzz').kind, 'other');
  assert.equal(shape('   ').kind, 'empty');
  const secret = 'sk-or-v1-SECRETSECRETSECRET';
  assert.ok(!shape(secret).label.includes('SECRET'), 'التسمية لا تحوي المفتاح');
  assert.match(shape('sk-ant-api03-' + 'x'.repeat(95)).label, /108/);
});

test('٢. normalize: ينقل sk-or- إلى OPENROUTER_API_KEY إن كان فارغًا، ويحذفه من ANTHROPIC، ويقصّ الفراغات، ولا يمسّ الصحيح', () => {
  let e = { ANTHROPIC_API_KEY: 'sk-or-v1-abc' };
  let r = normalize(e);
  assert.equal(r.misplaced, 'openrouter');
  assert.equal(e.OPENROUTER_API_KEY, 'sk-or-v1-abc');
  assert.ok(!('ANTHROPIC_API_KEY' in e));
  assert.equal(e.ANTHROPIC_KEY_MISPLACED, 'openrouter');

  e = { ANTHROPIC_API_KEY: 'sk-or-v1-abc', OPENROUTER_API_KEY: 'sk-or-v1-real' };
  normalize(e);
  assert.equal(e.OPENROUTER_API_KEY, 'sk-or-v1-real', 'مفتاح OpenRouter الموجود لا يُستبدل');
  assert.ok(!('ANTHROPIC_API_KEY' in e));

  e = { ANTHROPIC_API_KEY: 'sk-ant-api03-good\n', OPENROUTER_API_KEY: 'sk-or-v1-real' };
  r = normalize(e);
  assert.equal(r.misplaced, '');
  assert.equal(e.ANTHROPIC_API_KEY, 'sk-ant-api03-good');
  assert.equal(e.OPENROUTER_API_KEY, 'sk-or-v1-real');
  assert.ok(!('ANTHROPIC_KEY_MISPLACED' in e));

  e = {};
  r = normalize(e);
  assert.equal(r.shape.kind, 'empty');
  assert.deepEqual(Object.keys(e), []);
});

test('٣. عند التحميل في عمليّة حقيقيّة: البيئة تُصلَح قبل أيّ معالج، وفي بيئة عارية لا يرمي', () => {
  const mod = path.join(root, 'api', '_lib', '_env-keys.js');
  const code = "require(process.argv[1]); console.log(JSON.stringify({ a: process.env.ANTHROPIC_API_KEY || null, o: process.env.OPENROUTER_API_KEY || null, m: process.env.ANTHROPIC_KEY_MISPLACED || null }))";
  const bare = { PATH: process.env.PATH, HOME: process.env.HOME };
  const out = JSON.parse(execFileSync(process.execPath, ['-e', code, mod], { encoding: 'utf8', env: Object.assign({}, bare, { ANTHROPIC_API_KEY: 'sk-or-v1-abc ' }) }));
  assert.deepEqual(out, { a: null, o: 'sk-or-v1-abc', m: 'openrouter' });
  const out2 = JSON.parse(execFileSync(process.execPath, ['-e', code, mod], { encoding: 'utf8', env: bare }));
  assert.deepEqual(out2, { a: null, o: null, m: null });
});

test('٤. كلّ نقطة دخول تحمّل _env-keys بجانب _fetch-timeout', () => {
  for (const n of ['account', 'ai', 'edu', 'media', 'raw', 'system', 'telegram', 'tools', 'video']) {
    const s = read('api/' + n + '.js');
    const a = s.indexOf("require('./_lib/_fetch-timeout.js');");
    const b = s.indexOf("require('./_lib/_env-keys.js');");
    assert.ok(a >= 0 && b > a && b - a < 120, 'api/' + n + '.js يحمّل _env-keys بعد _fetch-timeout مباشرة');
  }
});

test('٥. claude-diag يشرح النقل وشكل المفتاح', () => {
  const s = read('api/_lib/admin-actions.js');
  assert.ok(s.includes("require('./_env-keys.js')"));
  assert.ok(s.includes("ANTHROPIC_KEY_MISPLACED === 'openrouter'"));
  assert.ok(s.includes('يحمل مفتاح OpenRouter (sk-or-…) لا مفتاح Anthropic'));
  assert.ok(s.includes("'\\nشكل المفتاح: ' + sh"));
});
