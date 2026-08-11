const assert = require('node:assert/strict');
const {
  IMAGE_TIMEOUT_MS,
  fetchImageWithRetry,
  isImageTimeoutError,
} = require('../api/_lib/image-fetch.js');

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

(async () => {
  assert.equal(IMAGE_TIMEOUT_MS, 90000);
  assert.equal(isImageTimeoutError(Object.assign(new Error('late'), { name: 'TimeoutError' })), true);

  let receivedSignal = null;
  const first = await fetchImageWithRetry({
    url: 'https://example.invalid/image',
    makeInit: () => ({ method: 'POST', body: '{}' }),
    fetchFn: async (_url, init) => {
      receivedSignal = init.signal;
      return response(200, { image: 'ok' });
    },
    sleepFn: async () => {},
  });
  assert.equal(first.attempts, 1);
  assert.deepEqual(first.data, { image: 'ok' });
  assert.ok(receivedSignal instanceof AbortSignal, 'image fetch must carry its own timeout signal');

  let calls = 0;
  const retried = await fetchImageWithRetry({
    url: 'https://example.invalid/image',
    makeInit: attempt => ({ body: String(attempt) }),
    fetchFn: async () => {
      calls++;
      if (calls === 1) throw Object.assign(new Error('late'), { name: 'TimeoutError' });
      return response(200, { image: 'after retry' });
    },
    sleepFn: async () => {},
  });
  assert.equal(calls, 2);
  assert.equal(retried.attempts, 2);
  assert.deepEqual(retried.data, { image: 'after retry' });

  calls = 0;
  const stopped = await fetchImageWithRetry({
    url: 'https://example.invalid/image',
    fetchFn: async () => {
      calls++;
      throw Object.assign(new Error('late'), { name: 'TimeoutError' });
    },
    sleepFn: async () => {},
  });
  assert.equal(calls, 2, 'timeout retries must stay inside the server duration budget');
  assert.equal(stopped.attempts, 2);
  assert.equal(isImageTimeoutError(stopped.error), true);

  calls = 0;
  const upstreamRetry = await fetchImageWithRetry({
    url: 'https://example.invalid/image',
    fetchFn: async () => {
      calls++;
      return calls < 3 ? response(503, { error: 'busy' }) : response(200, { image: 'ok' });
    },
    sleepFn: async () => {},
  });
  assert.equal(upstreamRetry.attempts, 3);
  assert.equal(upstreamRetry.response.ok, true);

  console.log('image fetch timeout/retry tests passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
