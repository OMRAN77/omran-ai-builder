'use strict';

// Limits apply to the tool-chat loop, including direct-provider retries.
// No paid classification request and no automatic upgrade to a pricier model.
const PROFILES = Object.freeze({
  quick: Object.freeze({ searches: 2, steps: 6, calls: 8, output: 16000, ms: 60000 }),
  deep: Object.freeze({ searches: 4, steps: 12, calls: 16, output: 16000, ms: 120000 }),
});
function limitError(reason) {
  const e = new Error(reason);
  e.code = 'CHAT_BUDGET';
  return e;
}
function createBudget(deep, options = {}) {
  const profile = PROFILES[deep ? 'deep' : 'quick'];
  const now = options.now || Date.now;
  const ms = Math.floor(Math.min(profile.ms, Math.max(1, Number(options.ms) || profile.ms)));
  const deadline = now() + ms;
  const controllers = new Set();
  const queries = new Set();
  let calls = 0, searches = 0;
  function remaining() { return Math.max(0, deadline - now()); }
  function check() {
    if (!remaining()) throw limitError('انتهت مهلة الردّ؛ لم يكتمل التحقق.');
  }
  async function wait(promise, onTimeout) {
    const left = remaining();
    if (!left) {
      Promise.resolve(promise).catch(() => {});
      if (onTimeout) onTimeout();
      check();
    }
    let timer;
    try {
      return await Promise.race([promise, new Promise((_, reject) => {
        timer = setTimeout(() => {
          if (onTimeout) onTimeout();
          reject(limitError('انتهت مهلة الردّ؛ لم يكتمل التحقق.'));
        }, left);
      })]);
    } finally { clearTimeout(timer); }
  }
  async function fetchBounded(url, init = {}) {
    check();
    if (calls >= profile.calls) throw limitError('بلغتُ سقف محاولات النموذج لهذا الردّ؛ لم يكتمل التحقق.');
    calls++;
    const controller = new AbortController();
    controllers.add(controller);
    const signals = [controller.signal, AbortSignal.timeout(remaining())];
    if (init.signal) signals.push(init.signal);
    try {
      return await wait((options.fetchImpl || fetch)(url, {
        ...init, signal: AbortSignal.any(signals),
      }), () => controller.abort());
    } catch (e) {
      if (!remaining() || e.name === 'TimeoutError') throw limitError('انتهت مهلة الردّ؛ لم يكتمل التحقق.');
      throw e;
    }
  }
  function search(query) {
    if (remaining() < 2000) return 'الوقت المتبقي لا يكفي لبحث جديد؛ اذكر ما تحققت منه وما بقي غير مؤكد.';
    const key = String(query || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!key) return 'استعلام البحث فارغ؛ حدّد ما تريد التحقق منه.';
    if (queries.has(key)) return 'هذا الاستعلام بُحث بالفعل؛ استخدم النتائج السابقة أو ابحث عن دليل مختلف.';
    if (searches >= profile.searches) return 'بلغتَ سقف البحث لهذا الردّ (' + profile.searches + ')؛ أجب بالمصادر المتاحة وصرّح بما لم تتحقق منه.';
    queries.add(key); searches++;
    return '';
  }
  return { profile, remaining, check, wait, fetch: fetchBounded, search,
    close() { for (const c of controllers) c.abort(); controllers.clear(); },
  };
}
module.exports = { PROFILES, createBudget };