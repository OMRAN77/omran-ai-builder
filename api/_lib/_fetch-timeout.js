// api/_lib/_fetch-timeout.js — installs a time-to-first-byte timeout on the
// global fetch(), once per cold start.
//
// 45 of the 50 outbound fetch() calls in this codebase had no timeout at all.
// With `maxDuration: 300` in vercel.json, one stalled upstream provider holds
// a serverless function open for five full minutes — a handful of those and
// the concurrency budget is gone while users watch a spinner forever.
//
// The timeout is deliberately TTFB, not total duration: the timer is cleared
// the moment response headers arrive. Streaming SSE bodies (the chat
// providers, api/_lib/agent.js) can then run as long as generation needs
// without ever being cut off mid-answer — which is exactly what a plain
// AbortSignal.timeout() would have done.
//
// Callers that pass their own `signal` are left completely alone.
const DEFAULT_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 30000);

if (!globalThis.__omranFetchTimeoutInstalled) {
  const nativeFetch = globalThis.fetch;

  if (typeof nativeFetch === 'function') {
    globalThis.fetch = function timedFetch(input, init) {
      const options = init || {};
      if (options.signal) return nativeFetch(input, options);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

      return nativeFetch(input, Object.assign({}, options, { signal: controller.signal })).then(
        (res) => {
          clearTimeout(timer); // headers arrived — the body may stream freely
          return res;
        },
        (err) => {
          clearTimeout(timer);
          if (err && err.name === 'AbortError') {
            const e = new Error(
              `تعذّر الاتصال بالخدمة الخارجية خلال ${Math.round(DEFAULT_TIMEOUT_MS / 1000)} ثانية. ` +
                `Upstream request timed out after ${DEFAULT_TIMEOUT_MS}ms.`
            );
            e.name = 'UpstreamTimeoutError';
            e.cause = err;
            throw e;
          }
          throw err;
        }
      );
    };
  }

  globalThis.__omranFetchTimeoutInstalled = true;
}

module.exports = { DEFAULT_TIMEOUT_MS };
