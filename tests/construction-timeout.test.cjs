const assert = require('node:assert/strict');
const fs = require('node:fs');

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
require.cache[usagePath] = {
  id: usagePath,
  filename: usagePath,
  loaded: true,
  exports: {
    checkConstructionQuota: async () => ({ allowed: true, username: 'test-user' }),
    consumeConstruction: async () => 4,
    CONSTRUCTION_DAILY_LIMIT: 5,
  },
};
require.cache[libraryPath] = {
  id: libraryPath,
  filename: libraryPath,
  loaded: true,
  exports: { saveDesign: async () => {} },
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
  let textCalls = 0;
  global.fetch = async (url, init) => {
    assert.ok(init && init.signal instanceof AbortSignal, 'every construction provider call needs its own timeout signal');
    if (String(url).includes('gemini-3-pro-image')) {
      imageCalls++;
      return imageResponse('image-' + imageCalls);
    }
    textCalls++;
    return textResponse();
  };

  const successRes = makeRes();
  await handler(request, successRes);
  assert.equal(successRes.statusCode, 200);
  assert.equal(imageCalls, 2, 'plan and exterior image must both use the long image path');
  assert.equal(textCalls, 1);
  assert.equal(successRes.payload.imageBase64, 'image-1');
  assert.equal(successRes.payload.photoImageBase64, 'image-2');

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
