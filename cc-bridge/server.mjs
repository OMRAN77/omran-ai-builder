// cc-bridge/server.mjs — v-cc-bridge: Claude Code الخام لمالك التطبيق، على خادمه هو.
//
// أمر عمران ١٣ سبتمبر: «أريد كلاود كود خام وليس تركيبًا من عندك، تزيد عليه النشر
// والدمج بأمري فقط». هذا الملفّ لا يبني حلقة وكيل: يستدعي query() من حزمة الوكيل
// الرسميّة (Claude Code نفسه: أدواته، سياقه، جلساته على القرص)، ويحوّل رسائله إلى
// بثّ SSE يقرأه التطبيق، ويحفظ معرّف الجلسة ليُستأنف بين الرسائل.
//
// ما يزيده الجسر فقط: سياج الأدوات (policy.mjs)، وأمرا «انشر» و«ادمج» (git.mjs)
// اللذان لا ينفّذهما إلّا طلب صريح من المالك عبر التطبيق، وسجلّ أحداث يُستعاد إن
// انقطع الاتّصال. كلّ طلب يحمل السرّ المشترك CC_BRIDGE_SECRET في الترويسة.
'use strict';

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { timingSafeEqual, randomBytes } from 'node:crypto';
import { ALLOWED_TOOLS, DENIED_TOOLS, RULES_APPEND, RunLog, decideTool, briefTool, redact } from './policy.mjs';
import { makeGit } from './git.mjs';

const env = process.env;
const PORT = Number(env.PORT) || 8787;
const REPO_DIR = env.CC_REPO_DIR || '/work/repo';
const STATE_DIR = env.CC_STATE_DIR || '/work/state';
const SECRET = String(env.CC_BRIDGE_SECRET || '');
/* v-cc-strength (شكوى المالك «مش قوي… ضعيف»): النموذج الافتراضيّ نموذج جلسة المالك على الويب
   نفسه (Fable 5.1) مع احتياط Opus 5 إن لم يتوفّر، والجهد الأقصى والتفكير التكيّفيّ. */
const MODEL = String(env.CC_MODEL || 'claude-fable-5-1');
const FALLBACK_MODEL = String(env.CC_FALLBACK_MODEL || (MODEL === 'claude-opus-5' ? '' : 'claude-opus-5'));
const EFFORT = ['low', 'medium', 'high', 'xhigh', 'max'].includes(String(env.CC_EFFORT || '')) ? String(env.CC_EFFORT) : 'max';
const MAX_TURNS = Math.max(5, Number(env.CC_MAX_TURNS) || 200);
const MAX_BUDGET = Number(env.CC_MAX_BUDGET_USD) || 0;
const RUN_TTL_MS = 6 * 3600 * 1000;

if (!SECRET || SECRET.length < 24) { console.error('CC_BRIDGE_SECRET مفقود أو قصير (٢٤ حرفًا فأكثر).'); process.exit(1); }
if (!env.ANTHROPIC_API_KEY && !env.CLAUDE_CODE_OAUTH_TOKEN) { console.error('لا ANTHROPIC_API_KEY ولا CLAUDE_CODE_OAUTH_TOKEN في البيئة.'); process.exit(1); }

const gitOps = makeGit({ cwd: REPO_DIR });

/** بيئة Claude Code: بيئة الجسر بلا سرّه المشترك، ومفتاح GitHub باسمه عند gh (GH_TOKEN) ليعمل gh وgit push. */
function childEnv() {
  const e = Object.assign({}, env);
  delete e.CC_BRIDGE_SECRET;
  if (e.GITHUB_TOKEN && !e.GH_TOKEN) e.GH_TOKEN = e.GITHUB_TOKEN;
  return e;
}
const runs = new Map();       // runId -> RunLog
let current = null;           // التشغيل الجاري (واحد فقط)
let state = { sessionId: '', updatedAt: 0 };

async function loadState() { try { state = JSON.parse(await readFile(join(STATE_DIR, 'state.json'), 'utf8')); } catch (e) { state = { sessionId: '', updatedAt: 0 }; } }
async function saveState() { try { await mkdir(STATE_DIR, { recursive: true }); await writeFile(join(STATE_DIR, 'state.json'), JSON.stringify(state)); } catch (e) { console.warn('[cc] state save failed', e && e.message); } }

function authed(req) {
  const h = String(req.headers.authorization || '');
  const got = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  const a = Buffer.from(got), b = Buffer.from(SECRET);
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}
function json(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); }
async function body(req) { let s = ''; for await (const c of req) { s += c; if (s.length > 2e6) throw new Error('body too large'); } try { return s ? JSON.parse(s) : {}; } catch (e) { return {}; } }
function sseHead(res) { res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' }); }
function sseWrite(res, ev) { try { res.write('data: ' + JSON.stringify(ev) + '\n\n'); } catch (e) { /* المستمع رحل */ } }

/** تشغيل رسالة واحدة عبر Claude Code (query) وتسجيل أحداثها في السجلّ. */
async function runMessage(log, message, opts) {
  const { query } = await import('@anthropic-ai/claude-agent-sdk');
  const abort = new AbortController();
  log.abort = abort;
  const options = {
    cwd: REPO_DIR,
    model: opts.model || MODEL,
    effort: EFFORT,
    thinking: { type: 'adaptive' },
    maxTurns: MAX_TURNS,
    permissionMode: 'acceptEdits',
    allowedTools: ALLOWED_TOOLS,
    disallowedTools: DENIED_TOOLS,
    canUseTool: async (name, input) => decideTool(name, input),
    includePartialMessages: true,
    systemPrompt: { type: 'append', text: RULES_APPEND },
    /* كجلسة المالك على الويب: CLAUDE.md وإعدادات المشروع تُقرأ من المستودع (بلا هذا
       السطر لا تحمّل الحزمة إعدادات من القرص). */
    settingSources: ['project'],
    abortController: abort,
    env: childEnv(),
  };
  if (MAX_BUDGET > 0) options.maxBudgetUsd = MAX_BUDGET;
  if (FALLBACK_MODEL && FALLBACK_MODEL !== options.model) options.fallbackModel = FALLBACK_MODEL;
  if (opts.sessionId) options.resume = opts.sessionId;
  let sessionId = opts.sessionId || '';
  let sawText = false;
  try {
    for await (const msg of query({ prompt: message, options })) {
      if (msg.type === 'system' && msg.subtype === 'init') {
        sessionId = msg.session_id || sessionId;
        log.push({ init: { sessionId, model: msg.model || options.model } });
      } else if (msg.type === 'stream_event') {
        const ev = msg.event || {};
        if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta' && ev.delta.text) { sawText = true; log.push({ delta: ev.delta.text }); }
      } else if (msg.type === 'assistant' && msg.message && Array.isArray(msg.message.content)) {
        for (const b of msg.message.content) if (b && b.type === 'tool_use') log.push({ tool: { name: b.name, brief: redact(briefTool(b.name, b.input)) } });
      } else if (msg.type === 'user' && msg.message && Array.isArray(msg.message.content)) {
        for (const b of msg.message.content) if (b && b.type === 'tool_result') {
          const t = typeof b.content === 'string' ? b.content : (Array.isArray(b.content) ? b.content.map((c) => c.text || '').join('\n') : '');
          if (b.is_error) log.push({ toolError: redact(String(t).slice(0, 300)) });
        }
      } else if (msg.type === 'result') {
        if (msg.is_error && opts.sessionId && !opts._retried && !sawText && /No conversation found|session/i.test(String(msg.result || ''))) throw new Error('No conversation found: ' + String(msg.result || '').slice(0, 120));
        sessionId = msg.session_id || sessionId;
        log.push({ result: { sessionId, subtype: msg.subtype, cost: msg.total_cost_usd, turns: msg.num_turns, stopReason: msg.stop_reason || null, models: Object.keys(msg.modelUsage || {}), effort: EFFORT, text: (!sawText && msg.result) ? String(msg.result) : '' } });
      }
    }
  } catch (e) {
    const msg = String((e && e.message) || e);
    // جلسة محفوظة لم تعد على القرص (إعادة نشر بلا قرص دائم مثلًا): نبدأ جلسة جديدة بالرسالة نفسها بدل خطأ صامت.
    if (opts.sessionId && !opts._retried && /No conversation found|session/i.test(msg)) {
      log.push({ toolError: 'الجلسة السابقة غير موجودة على الخادم — بدأت جلسة جديدة.' });
      return runMessage(log, message, Object.assign({}, opts, { sessionId: '', _retried: true }));
    }
    log.push({ error: redact(msg.slice(0, 400)) });
  }
  if (sessionId) { state.sessionId = sessionId; state.updatedAt = Date.now(); await saveState(); }
  log.push({ done: true, sessionId });
  log.end();
}

/** بثّ سجلّ تشغيل من نقطة معيّنة حتى نهايته. */
async function streamLog(res, log, since) {
  sseHead(res);
  let i = Math.max(0, Number(since) || 0);
  let closed = false;
  res.on('close', () => { closed = true; });
  while (!closed) {
    const evs = log.since(i);
    for (const ev of evs) sseWrite(res, ev);
    i += evs.length;
    if (log.done) break;
    await log.wait(15000);
    if (!closed && !log.since(i).length && !log.done) sseWrite(res, { ping: Date.now() });
  }
  try { res.end(); } catch (e) { /* مغلق */ }
}

function gc() { const now = Date.now(); for (const [id, l] of runs) if (l.done && now - l.startedAt > RUN_TTL_MS) runs.delete(id); }

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') return json(res, 200, { ok: true, busy: !!(current && !current.done) });
  if (!authed(req)) return json(res, 401, { error: 'unauthorized' });
  try {
    if (req.method === 'POST' && url.pathname === '/chat') {
      const b = await body(req);
      const message = String(b.message || '').trim();
      if (!message) return json(res, 400, { error: 'رسالة فارغة' });
      if (current && !current.done) return json(res, 409, { error: 'تشغيل جارٍ — انتظر انتهاءه أو أوقفه.', runId: current.id });
      gc();
      const log = new RunLog('r' + Date.now().toString(36) + randomBytes(3).toString('hex'));
      runs.set(log.id, log); current = log;
      log.push({ run: log.id });
      runMessage(log, message, { sessionId: b.newSession ? '' : (b.sessionId || state.sessionId || ''), model: b.model }).catch((e) => { log.push({ error: redact(String(e && e.message || e)) }); log.end(); });
      return streamLog(res, log, 0);
    }
    if (req.method === 'GET' && url.pathname.startsWith('/runs/')) {
      const log = runs.get(url.pathname.slice(6));
      if (!log) return json(res, 404, { error: 'لا تشغيل بهذا المعرّف' });
      return streamLog(res, log, url.searchParams.get('since'));
    }
    if (req.method === 'POST' && url.pathname === '/stop') {
      if (current && !current.done && current.abort) { current.abort.abort(); return json(res, 200, { ok: true }); }
      return json(res, 200, { ok: true, idle: true });
    }
    if (req.method === 'GET' && url.pathname === '/status') {
      const st = await gitOps.status();
      return json(res, 200, Object.assign({ ok: true, sessionId: state.sessionId, busy: !!(current && !current.done), runId: current ? current.id : '', model: MODEL, effort: EFFORT }, st));
    }
    if (req.method === 'POST' && url.pathname === '/publish') {
      if (current && !current.done) return json(res, 409, { error: 'تشغيل جارٍ — انتظر انتهاءه قبل النشر.' });
      const r = await gitOps.publish(await body(req));
      return json(res, r.error ? 400 : 200, r);
    }
    if (req.method === 'POST' && url.pathname === '/merge') {
      if (current && !current.done) return json(res, 409, { error: 'تشغيل جارٍ — انتظر انتهاءه قبل الدمج.' });
      const r = await gitOps.merge(await body(req));
      return json(res, r.error ? 400 : 200, r);
    }
    if (req.method === 'GET' && url.pathname.startsWith('/pr/')) {
      return json(res, 200, await gitOps.prState(parseInt(url.pathname.slice(4), 10)));
    }
    if (req.method === 'POST' && url.pathname === '/reset') {
      if (current && !current.done) return json(res, 409, { error: 'تشغيل جارٍ — أوقفه أوّلًا.' });
      const b = await body(req);
      const st = await gitOps.resetToBase();
      if (b.newSession) { state.sessionId = ''; await saveState(); }
      return json(res, 200, Object.assign({ ok: true, sessionId: state.sessionId }, st));
    }
    return json(res, 404, { error: 'not found' });
  } catch (e) {
    return json(res, 500, { error: redact(String((e && e.message) || e).slice(0, 300)) });
  }
});

await loadState();
server.listen(PORT, () => console.log('[cc-bridge] listening on ' + PORT + ' · repo ' + REPO_DIR + ' · model ' + MODEL));
