'use strict';
/* v-news-hourly + v-hist-autoload (المالك ٢ أكتوبر): نبض الأخبار من الجسر كلّ ساعة حتّى والتطبيق مغلق عند الجميع. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const srv = fs.readFileSync(path.join(root, 'cc-bridge/server.mjs'), 'utf8');

test('١. الجسر ينبض check-reminders كلّ ساعة (بعد دقيقة من التشغيل)، ويُطفأ بـCC_PULSE_URL=off، وفشله لا يُسقط الجسر', () => {
  assert.ok(srv.includes("const PULSE_URL = String(env.CC_PULSE_URL || 'https://omran-ai-builder.vercel.app/api/check-reminders?tick=1');"));
  assert.ok(srv.includes('const PULSE_MS = 3600 * 1000;'));
  assert.ok(srv.includes('setInterval(pulse, PULSE_MS).unref();') && srv.includes('setTimeout(pulse, 60000).unref();'));
  assert.ok(srv.includes("if (PULSE_URL === 'off') return;"));
  assert.match(srv, /try \{ await fetch\(PULSE_URL, \{ signal: AbortSignal\.timeout\(30000\) \}\); \} catch \(e\)/);
  assert.ok(srv.indexOf('setInterval(pulse, PULSE_MS)') < srv.indexOf('server.listen('), 'قبل الاستماع، في المستوى الأعلى');
});

test('٢. الخادم: نبضة ?tick=1 مقفولة ٥٥ث فلا يتكرّر الإرسال مع نبض التطبيقات، والأخبار تُدفع مرّة لكلّ خبر', () => {
  const cr = fs.readFileSync(path.join(root, 'api/_lib/check-reminders.js'), 'utf8');
  assert.ok(cr.includes("kvSetIfAbsent('reminders:tick-lock', String(Date.now()), 55)"));
  assert.ok(cr.includes('!sentIds.includes(it.id)'));
});
