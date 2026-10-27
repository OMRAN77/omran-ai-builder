#!/usr/bin/env node
// scripts/branch-test.mjs — v-branch-test: «جهاز» المزوّدين لاختبار واحد. يشغّله .github/workflows/branch-test.yml على فرع المزوّد.
//
// المدخل الوحيد من البيئة (TEST_FILE) يمرّ بفاحص api/_lib/branch-test.js نفسه، ثمّ بقائمة السماح من package.json
// (scripts/run-tests.mjs registered) — فنصّ النموذج يصير بحثًا في قائمة لا مسارًا يُنفَّذ. الملفّ يُشغَّل وسيطًا بلا صدفة،
// ومخرجه (TAP) يصل الخادم كما هو. ينتهي برمز الاختبار نفسه: الفشل يحمرّ على التزام الفرع (كـci.yml) فيوقف الدمج.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BT = createRequire(import.meta.url)(path.join(ROOT, 'api/_lib/branch-test.js'));
const { registered } = await import(pathToFileURL(path.join(ROOT, 'scripts/run-tests.mjs')).href);

const fail = (m) => { console.log('##[error] ' + m); process.exit(1); };
const v = BT.fileOf({ file: process.env.TEST_FILE });
if (v.error) fail(v.error);
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
if (!registered(pkg).some((e) => e.file === v.file)) fail('الملفّ ' + v.file + ' غير مسجّل في package.json — سجّله في آخر سلسلة test أوّلًا (test-registry يفرض ذلك).');
if (!fs.existsSync(path.join(ROOT, v.file))) fail('الملفّ ' + v.file + ' غير موجود على هذا الفرع.');
console.log('▶ ' + v.file);
const r = spawnSync(process.execPath, [v.file], { cwd: ROOT, stdio: 'inherit', timeout: 240000 });
process.exit(r.status == null ? 1 : r.status);
