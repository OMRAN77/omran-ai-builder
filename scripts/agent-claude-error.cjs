#!/usr/bin/env node
// scripts/agent-claude-error.cjs — v-agent-report: لماذا فشل Claude Code داخل الورك فلو؟
// claude-code-action يخفي مخرجات Claude في السجلّ («full output hidden for security») ويكتفي
// بـ«result is_error:true»، فيبقى المالك بلا سبب. هذا السكربت يقرأ ملفّ التنفيذ الذي يحفظه
// الإجراء (مصفوفة رسائل SDK) ويستخرج آخر نتيجة/خطأ وآخر نصّ كتبه المساعد، مختصرًا ومنقّحًا
// من أيّ مفتاح، ليُكتب في تعليق المسألة وفي سطر الحالة المخفيّ.
'use strict';
const fs = require('fs');

const KEY_RE = /\b(?:sk-ant-[A-Za-z0-9_\-]{8,}|sk-[A-Za-z0-9_\-]{24,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g;

function summarize(raw, max) {
  const cap = max || 1500;
  let a;
  try { a = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return ''; }
  if (!Array.isArray(a)) a = a && typeof a === 'object' ? [a] : [];
  const out = [];
  const push = (s) => { s = String(s || '').trim(); if (s && !out.includes(s)) out.push(s); };

  const result = [...a].reverse().find((m) => m && m.type === 'result');
  if (result) {
    if (result.subtype && result.subtype !== 'success') push('subtype: ' + result.subtype);
    if (Array.isArray(result.errors) && result.errors.length) push(result.errors.map((e) => (typeof e === 'string' ? e : JSON.stringify(e))).join(' | '));
    if (result.result) push(result.result);
  }
  const asst = [...a].reverse().find((m) => m && m.type === 'assistant' && m.message && Array.isArray(m.message.content) && m.message.content.some((b) => b && b.type === 'text' && b.text));
  if (asst) push(asst.message.content.filter((b) => b && b.type === 'text').map((b) => b.text).join('\n'));

  return out.join('\n').replace(KEY_RE, '[مفتاح محذوف]').replace(/`/g, "'").slice(0, cap);
}

if (require.main === module) {
  const file = process.argv[2];
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { process.exit(0); }
  process.stdout.write(summarize(text));
}

module.exports = { summarize, KEY_RE };
