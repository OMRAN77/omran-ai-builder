// api/_lib/_errors.js — one place every server error passes through.
//
// Until now a thrown handler wrote to console.error and vanished into the
// Vercel log. Nobody reads those, which is how a broken service-worker path
// survived for months. Errors now go somewhere you will actually look.
//
// Sentry is optional and used WITHOUT its SDK — the envelope endpoint is a
// plain HTTP POST, so this stays inside the project's two-dependency budget.
// With no SENTRY_DSN set, everything still lands in the Redis log that
// /api/system?action=client-errors already reads.
const { kvGetJSON, kvPutJSON } = require('./kv.js');

const LOG_PATH = 'db/server-errors/log.json';
const MAX_ITEMS = 100;
const ERROR_PUSH_TIMEOUT_MS = 2000; // v-error-push: لا يؤخّر ردّ خطأ أكثر من هذا
const RELEASE = process.env.APP_RELEASE || 'omran-ai-builder';
const ENV = process.env.VERCEL_ENV || 'development';

/** Parses https://<publicKey>@<host>/<projectId> into its envelope parts. */
function parseDsn(dsn) {
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\/+/, '');
    if (!u.username || !projectId) return null;
    return {
      url: `${u.protocol}//${u.host}/api/${projectId}/envelope/?sentry_key=${u.username}`,
    };
  } catch (e) {
    return null;
  }
}

async function sendToSentry(err, context) {
  const dsn = (process.env.SENTRY_DSN || '').trim();
  if (!dsn) return false;
  const parsed = parseDsn(dsn);
  if (!parsed) return false;

  const eventId = require('crypto').randomBytes(16).toString('hex');
  const sentAt = new Date().toISOString();
  const event = {
    event_id: eventId,
    timestamp: sentAt,
    platform: 'node',
    level: 'error',
    release: RELEASE,
    environment: ENV,
    server_name: 'vercel',
    tags: { route: (context && context.route) || 'unknown' },
    extra: context || {},
    exception: {
      values: [{
        type: (err && err.name) || 'Error',
        value: String((err && err.message) || err || 'unknown'),
        stacktrace: err && err.stack ? { frames: [{ filename: 'server', function: String(err.stack).slice(0, 2000) }] } : undefined,
      }],
    },
  };

  const body = [
    JSON.stringify({ event_id: eventId, sent_at: sentAt }),
    JSON.stringify({ type: 'event' }),
    JSON.stringify(event),
  ].join('\n');

  try {
    // Short timeout on purpose: reporting an error must never become the
    // reason a request hangs.
    const res = await fetch(parsed.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      body,
      signal: AbortSignal.timeout(4000),
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

// Returns true when this exact route+message pair is new (not a repeat) —
// v-error-push uses this to alert the owner once per distinct error, not
// once per occurrence (a crash loop must never turn into a notification storm).
async function appendToRedisLog(entry) {
  try {
    const items = (await kvGetJSON(LOG_PATH)) || [];
    const list = Array.isArray(items) ? items : [];
    // Collapse repeats: one bad deploy would otherwise flush the whole log.
    const dup = list.find((x) => x.message === entry.message && x.route === entry.route);
    if (dup) {
      dup.count = (dup.count || 1) + 1;
      dup.lastAt = entry.at;
    } else {
      list.unshift(entry);
    }
    await kvPutJSON(LOG_PATH, list.slice(0, MAX_ITEMS));
    return !dup;
  } catch (e) {
    /* the log is best-effort — never let it mask the original error */
    return false;
  }
}

/**
 * Records a server-side error. Always resolves, never throws.
 * `context` should carry at least { route }.
 */
async function reportError(err, context) {
  const ctx = context || {};
  const entry = {
    at: new Date().toISOString(),
    route: ctx.route || 'unknown',
    action: ctx.action || null,
    method: ctx.method || null,
    message: String((err && err.message) || err || 'unknown').slice(0, 500),
    name: (err && err.name) || 'Error',
    stack: err && err.stack ? String(err.stack).slice(0, 1500) : null,
    count: 1,
  };
  console.error(`[error] ${entry.route}${entry.action ? '?' + entry.action : ''}: ${entry.message}`);
  const [, isNew] = await Promise.all([sendToSentry(err, entry), appendToRedisLog(entry)]);
  // v-error-push (طلب المالك: «أي خطأ يبلغني على طول»): كلّ خطأ خادم جديد (لا تكرار
  // لخطأ مسجَّل) يدفع إشعارًا فوريًّا — نفس آلية v-credit-alert الحالية، معمَّمة. يُنتظَر
  // بمهلة قصيرة (لا بلا انتظار إطلاقًا) لأنّ serverless يُجمِّد العامل بعد الردّ فيُسقط أيّ
  // وعد معلَّق — نفس سبب FLUSH_TIMEOUT_MS في log-error.js؛ المهلة تمنع نداء شبكة بطيء من
  // تأخير ردّ خطأ ينتظره مستخدم بالفعل.
  if (isNew) {
    try {
      await new Promise((resolve) => {
        // clearTimeout عند فوز الوعد الحقيقيّ — عكس Promise.race الخام الذي يترك
        // المؤقّت معلَّقًا حتّى ينتهي وحده (يُبقي العامل حيًّا بلا داعٍ على serverless).
        const t = setTimeout(resolve, ERROR_PUSH_TIMEOUT_MS);
        require('./_owner-alert.js').alertOwnerError(entry)
          .then(() => { clearTimeout(t); resolve(); }, () => { clearTimeout(t); resolve(); });
      });
    } catch (e) { /* الإشعار تحسين لا شرط */ }
  }
}

/**
 * Wraps a route handler so nothing escapes unrecorded. The client still gets
 * a clean JSON error; the details go to the log, not to the user.
 */
function withErrorCapture(routeName, handler) {
  return async function wrapped(req, res) {
    try {
      return await handler(req, res);
    } catch (err) {
      const action = (req && req.query && req.query.action) || null;
      await reportError(err, { route: routeName, action, method: req && req.method });
      try {
        if (!res.headersSent) {
          res.status(500).json({
            error: 'حدث خطأ غير متوقع. تم تسجيله وسنصلحه — حاول مرة أخرى.',
          });
        }
      } catch (e) {
        /* response already closed */
      }
    }
  };
}

module.exports = { reportError, withErrorCapture };
