const assert = require('node:assert/strict');
const fs = require('node:fs');

process.env.AUTH_SECRET = 'test-auth-secret-for-construction-staging';

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function imageResponse(label) {
  return response(200, {
    candidates: [{ content: { parts: [{ inlineData: { data: label, mimeType: 'image/png' } }] } }],
  });
}

function textResponse() {
  return response(200, {
    candidates: [{ content: { parts: [{ text: '### خطة مختصرة' }] } }],
  });
}

function makeRes() {
  return {
    statusCode: 200,
    payload: null,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    end() {},
  };
}

const usagePath = require.resolve('../api/_lib/_constructionUsage.js');
const libraryPath = require.resolve('../api/_lib/_constructionLibrary.js');
const kvPath = require.resolve('../api/_lib/kv.js');
let consumeCalls = 0;
require.cache[usagePath] = {
  id: usagePath,
  filename: usagePath,
  loaded: true,
  exports: {
    checkConstructionQuota: async () => ({ allowed: true, username: 'test-user', remaining: 5 }),
    consumeConstruction: async () => { consumeCalls++; return 4; },
    CONSTRUCTION_DAILY_LIMIT: 5,
  },
};
require.cache[libraryPath] = {
  id: libraryPath,
  filename: libraryPath,
  loaded: true,
  exports: { saveDesign: async () => {} },
};
const claims = new Set();
require.cache[kvPath] = {
  id: kvPath,
  filename: kvPath,
  loaded: true,
  exports: {
    kvSetIfAbsent: async (key) => claims.has(key) ? false : (claims.add(key), true),
    kvDel: async (key) => { claims.delete(key); },
  },
};

process.env.GEMINI_API_KEY = 'test-key';
const handler = require('../api/_lib/construction-create.js');
const originalFetch = global.fetch;

const request = {
  method: 'POST',
  body: {
    buildingType: 'villa',
    area: 300,
    includePlan: true,
    includePhoto: true,
    token: 'test-token',
  },
};

(async () => {
  let imageCalls = 0;
  let activeImages = 0;
  let maxActiveImages = 0;
  let textCalls = 0;
  global.fetch = async (url, init) => {
    assert.ok(init && init.signal instanceof AbortSignal, 'every construction provider call needs its own timeout signal');
    if (String(url).includes('gemini-3-pro-image')) {
      imageCalls++;
      activeImages++;
      maxActiveImages = Math.max(maxActiveImages, activeImages);
      await new Promise(resolve => setTimeout(resolve, 5));
      activeImages--;
      return imageResponse('image-' + imageCalls);
    }
    textCalls++;
    return textResponse();
  };

  const successRes = makeRes();
  await handler(request, successRes);
  assert.equal(successRes.statusCode, 200);
  assert.equal(imageCalls, 2, 'plan and exterior image must both use the long image path');
  assert.equal(maxActiveImages, 1, 'image generations must be queued instead of competing in parallel');
  assert.equal(textCalls, 1);
  assert.equal(successRes.payload.imageBase64, 'image-1');
  assert.equal(successRes.payload.photoImageBase64, 'image-2');
  assert.equal(consumeCalls, 1);

  imageCalls = 0;
  textCalls = 0;
  maxActiveImages = 0;
  const stagedBody = {
    ...request.body,
    includeInterior: true,
    parts: ['plan', 'photo', 'interior'],
  };
  const planRes = makeRes();
  await handler({ method: 'POST', body: { ...stagedBody, part: 'plan' } }, planRes);
  assert.equal(planRes.statusCode, 200);
  assert.equal(planRes.payload.imageBase64, 'image-1');
  assert.equal(planRes.payload.photoImageBase64, null);
  assert.ok(planRes.payload.jobTicket, 'first stage must authorize the remaining outputs');

  const photoRes = makeRes();
  await handler({ method: 'POST', body: { ...stagedBody, part: 'photo', jobTicket: planRes.payload.jobTicket } }, photoRes);
  assert.equal(photoRes.statusCode, 200);
  assert.equal(photoRes.payload.photoImageBase64, 'image-2');
  assert.equal(photoRes.payload.planText, null);

  const replayRes = makeRes();
  await handler({ method: 'POST', body: { ...stagedBody, part: 'photo', jobTicket: planRes.payload.jobTicket } }, replayRes);
  assert.equal(replayRes.statusCode, 409, 'a staged image authorization must be single-use');

  const interiorRes = makeRes();
  await handler({ method: 'POST', body: { ...stagedBody, part: 'interior', jobTicket: planRes.payload.jobTicket } }, interiorRes);
  assert.equal(interiorRes.statusCode, 200);
  assert.equal(interiorRes.payload.interiorImageBase64, 'image-3');
  assert.equal(imageCalls, 3, 'triple output must use three separate one-image stages');
  assert.equal(textCalls, 1, 'text generation belongs to the first stage only');
  assert.equal(maxActiveImages, 1);
  assert.equal(consumeCalls, 2, 'one staged click must consume quota only once');

  global.fetch = async (url) => {
    if (String(url).includes('gemini-3-pro-image')) return imageResponse('safe-image');
    throw new Error('secret upstream failure details');
  };

  const failureRes = makeRes();
  await handler(request, failureRes);
  assert.equal(failureRes.statusCode, 500);
  assert.equal(failureRes.payload.error, 'construction_generation_failed');
  assert.doesNotMatch(JSON.stringify(failureRes.payload), /secret|Proxy error|timed out after/i);

  const serverSource = fs.readFileSync(require.resolve('../api/_lib/construction-create.js'), 'utf8');
  assert.doesNotMatch(serverSource, /Proxy error:/);
  const clientSource = fs.readFileSync(require.resolve('../js/app-13-stocks-init.js'), 'utf8');
  const start = clientSource.indexOf('btnRun.onclick = async () =>');
  const end = clientSource.indexOf('if(boqBtn)', start);
  const generationUi = clientSource.slice(start, end);
  assert.match(generationUi, /showGenerationFailure\(\)/);
  assert.doesNotMatch(generationUi, /data\.error \|\| 'unknown'|e && e\.message/);

  console.log('construction timeout and quiet-failure tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  global.fetch = originalFetch;
});
