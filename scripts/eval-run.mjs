#!/usr/bin/env node
// scripts/eval-run.mjs — مقياس جودة المحادثة على الإنتاج (v-eval). يرسل أسئلة eval/questions.json إلى
// /api/ai?action=chat كما يرسلها التطبيق، ويقيّم الردود آليًّا بـeval/score.cjs، ويكتب نتيجة JSON وتقريرًا عربيًّا
// ومقارنة بالتشغيل السابق. **كلّ تشغيل يكلّف نداءات مزوّد حقيقيّة** — يُشغَّل يدويًّا فقط (workflow_dispatch).
//
//   EVAL_TOKEN      رمز حساب مشترك أو المالك (بدونه: حساب فحص جديد = الطبقة المجّانيّة بلا بحث — يُذكر في التقرير)
//   EVAL_PROVIDERS  claude,openai,gemini…  (الافتراضيّ claude) — لكلّ مزوّد تقرير مستقلّ
//   EVAL_ONLY       معرّفات مفصولة بفواصل لتشغيل جزء
//   EVAL_PREV_DIR   مجلّد نتائج سابقة للمقارنة (الافتراضيّ eval/baseline)
//   EVAL_BASE       عنوان الموقع (الافتراضيّ الإنتاج)
// لا يطبع أيّ رمز أو سرّ.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const S = require(path.join(ROOT, 'eval/score.cjs'));
const BASE = process.env.EVAL_BASE || process.env.PROBE_BASE_URL || 'https://omran-ai-builder.vercel.app';
const OUT = process.env.EVAL_OUT || path.join(ROOT, 'eval/out');
const PREV_DIR = process.env.EVAL_PREV_DIR || path.join(ROOT, 'eval/baseline');
const PROVIDERS = String(process.env.EVAL_PROVIDERS || 'claude').split(',').map((s) => s.trim()).filter(Boolean);
const ONLY = String(process.env.EVAL_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const CONCURRENCY = 3;
const TIMEOUT_MS = 120000;

const all = JSON.parse(fs.readFileSync(path.join(ROOT, 'eval/questions.json'), 'utf8')).questions;
const questions = ONLY.length ? all.filter((q) => ONLY.includes(q.id)) : all;

async function signup() {
  const rnd = Math.random().toString(16).slice(2, 8);
  const r = await fetch(BASE + '/api/account?action=auth', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'signup', username: 'zzeval' + rnd, password: 'Pp1!' + rnd + rnd, lang: 'ar' }),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.token) throw new Error('signup failed: HTTP ' + r.status);
  return j.token;
}

async function ask(token, provider, messages) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const run = { text: '', sources: 0, firstDeltaMs: 0, totalMs: 0, tier: '', model: '', error: '' };
  try {
    const res = await fetch(BASE + '/api/ai?action=chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
      body: JSON.stringify({ messages, token, provider, tz: 'Asia/Dubai' }),
    });
    if (!res.ok || !res.body) { run.error = 'HTTP ' + res.status; return run; }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const c = await reader.read();
      if (c.done) break;
      buf += dec.decode(c.value, { stream: true });
      const ls = buf.split('\n');
      buf = ls.pop();
      for (const line of ls) {
        if (!line.startsWith('data: ')) continue;
        let ev; try { ev = JSON.parse(line.slice(6)); } catch (e) { continue; } // سطر ناقص من البثّ
        if (ev.delta) { if (!run.firstDeltaMs) run.firstDeltaMs = Date.now() - t0; run.text += ev.delta; }
        if (typeof ev.patch === 'string' && ev.patch.trim()) run.text = ev.patch;
        if (Array.isArray(ev.sources)) run.sources += ev.sources.length;
        if (typeof ev.tier === 'string') run.tier = ev.tier;
        if (typeof ev.modelLabel === 'string') run.model = ev.modelLabel;
        if (ev.error) run.error = String(ev.error).slice(0, 160);
      }
    }
  } catch (e) {
    run.error = e && e.name === 'AbortError' ? 'timeout ' + TIMEOUT_MS / 1000 + 's' : String((e && e.message) || e).slice(0, 160);
  } finally {
    clearTimeout(timer);
    run.totalMs = Date.now() - t0;
  }
  return run;
}

async function runQuestion(token, provider, q) {
  const turns = q.turns || [q.q];
  const history = [];
  let run = null;
  for (const t of turns) {
    history.push({ role: 'user', content: t });
    run = await ask(token, provider, history.slice());
    history.push({ role: 'assistant', content: run.text || '…' });
  }
  return Object.assign(S.scoreQuestion(q, run), { question: turns[turns.length - 1], reply: run.text.slice(0, 4000), error: run.error, sources: run.sources });
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

const token = process.env.EVAL_TOKEN || await signup();
if (!process.env.EVAL_TOKEN) console.log('⚠️ بلا EVAL_TOKEN: حساب فحص جديد — النتيجة تقيس الطبقة المجّانيّة (بلا بحث حيّ)، لا تجربة المشترك.');
fs.mkdirSync(OUT, { recursive: true });
for (const provider of PROVIDERS) {
  console.log('\n== ' + provider + ' — ' + questions.length + ' سؤالًا ==');
  const results = await pool(questions, CONCURRENCY, async (q) => {
    const r = await runQuestion(token, provider, q);
    console.log((r.score === 100 ? '✓' : '✗') + ' ' + String(r.score).padStart(3) + '  ' + q.id + (r.error ? '  [' + r.error + ']' : ''));
    return r;
  });
  const tiers = [...new Set(results.map((r) => r.tier).filter(Boolean))];
  const cur = { date: new Date().toISOString().slice(0, 16).replace('T', ' '), provider, tier: tiers.join('/') || 'مشترك', base: BASE, summary: S.summarize(results), results };
  const prevFile = path.join(PREV_DIR, 'result-' + provider + '.json');
  const prev = fs.existsSync(prevFile) ? JSON.parse(fs.readFileSync(prevFile, 'utf8')) : null;
  const cmp = S.compare(prev, cur);
  const md = S.report(cur, cmp);
  fs.writeFileSync(path.join(OUT, 'result-' + provider + '.json'), JSON.stringify(cur, null, 1));
  fs.writeFileSync(path.join(OUT, 'report-' + provider + '.md'), md);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
  console.log('\n' + md);
}
console.log('انتهى — النتائج في eval/out/ (انسخها إلى eval/baseline/ لتصير مرجع المقارنة القادمة).');
