// Vercel Blob client-upload flow (large direct-to-storage browser uploads).
// Vercel Blob is suspended and storage has moved to Upstash Redis, which has
// no equivalent client-side direct-upload mechanism (Redis is not designed
// for large binary uploads straight from the browser). This endpoint is
// intentionally disabled rather than removed, so any caller gets a clear,
// non-crashing error instead of a missing-token exception from @vercel/blob.
module.exports = async function handler(request, response) {
  return response.status(503).json({
    error: 'disabled',
    message: 'Client-side direct uploads are disabled: Vercel Blob storage has been replaced with Upstash Redis, which does not support this upload flow. Use a server-proxied upload endpoint instead.',
  });
};
