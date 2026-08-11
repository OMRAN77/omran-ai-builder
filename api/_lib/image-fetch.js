'use strict';

// Image generation regularly needs more than the global 30-second fetch guard.
// Supplying our own signal keeps that guard from cutting off healthy requests.
const IMAGE_TIMEOUT_MS = 90000;
const MAX_IMAGE_ATTEMPTS = 3;
const MAX_TIMEOUT_ATTEMPTS = 2;

function isImageTimeoutError(error) {
  const name = String(error && error.name || '');
  return name === 'TimeoutError' || name === 'AbortError' || name === 'UpstreamTimeoutError';
}

function isTransientImageError(error) {
  if (isImageTimeoutError(error)) return true;
  const name = String(error && error.name || '');
  const code = String(error && error.code || '');
  return name === 'TypeError' || /^(ECONNRESET|ECONNREFUSED|EPIPE|ETIMEDOUT|UND_ERR_)/.test(code);
}

async function fetchImageWithRetry(options) {
  const opts = options || {};
  const fetchFn = opts.fetchFn || global.fetch;
  const sleepFn = opts.sleepFn || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const timeoutMs = opts.timeoutMs || IMAGE_TIMEOUT_MS;
  const maxAttempts = opts.maxAttempts || MAX_IMAGE_ATTEMPTS;
  const maxTimeoutAttempts = opts.maxTimeoutAttempts || MAX_TIMEOUT_ATTEMPTS;
  let timeoutAttempts = 0;
  let lastResponse = null;
  let lastData = {};
  let lastError = null;
  let attemptsUsed = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    attemptsUsed = attempt + 1;
    try {
      const init = typeof opts.makeInit === 'function' ? opts.makeInit(attempt) : (opts.init || {});
      const signal = AbortSignal.timeout(timeoutMs);
      const response = await fetchFn(opts.url, { ...init, signal });
      const data = await response.json().catch(() => ({}));
      lastResponse = response;
      lastData = data;
      lastError = null;
      if (response.ok) return { response, data, error: null, attempts: attempt + 1 };
      const retryResponse = typeof opts.shouldRetryResponse === 'function'
        ? opts.shouldRetryResponse(response, data)
        : response.status === 429 || response.status >= 500;
      if (!retryResponse || attempt + 1 >= maxAttempts) break;
    } catch (error) {
      lastResponse = null;
      lastData = {};
      lastError = error;
      if (isImageTimeoutError(error)) timeoutAttempts++;
      const canRetryError = isTransientImageError(error)
        && timeoutAttempts < maxTimeoutAttempts
        && attempt + 1 < maxAttempts;
      if (!canRetryError) break;
    }

    if (attempt + 1 >= maxAttempts) break;
    if (typeof opts.onRetry === 'function') {
      opts.onRetry({ attempt: attempt + 1, response: lastResponse, data: lastData, error: lastError });
    }
    await sleepFn(700 * (attempt + 1));
  }

  return { response: lastResponse, data: lastData, error: lastError, attempts: attemptsUsed };
}

module.exports = {
  IMAGE_TIMEOUT_MS,
  fetchImageWithRetry,
  isImageTimeoutError,
  isTransientImageError,
};
