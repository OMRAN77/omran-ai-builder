'use strict';

function extractJsonObject(value) {
  const text = String(value || '').replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch (_) { return null; }
}

function assessEditVerdict(verdict, options) {
  const opts = options || {};
  if (!verdict || typeof verdict !== 'object') return { ok: false, reason: 'validation_unavailable' };
  if (opts.allowStyleChange !== true && (verdict.sameVisualMedium !== true || (verdict.sourceIsPhotograph === true && verdict.resultIsPhotograph !== true))) {
    return { ok: false, reason: 'style_mismatch' };
  }
  if (verdict.identityPreserved !== true || verdict.onlyRequestedChange !== true) {
    return { ok: false, reason: 'identity_or_scope_mismatch' };
  }
  return { ok: true, reason: opts.allowStyleChange === true ? 'accepted_explicit_style_change' : 'accepted' };
}

async function verifyLocalizedImageEdit(options) {
  const opts = options || {};
  if (!opts.apiKey || !opts.sourceBase64 || !opts.resultBase64) return { ok: false, reason: 'validation_unavailable' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=' + opts.apiKey;
    const instruction = [
      'You are a strict quality gate for a localized image edit.',
      'Compare SOURCE and RESULT against USER REQUEST: ' + String(opts.userPrompt || '').slice(0, 800),
      'Return JSON only with four booleans:',
      'sourceIsPhotograph: SOURCE is a real camera photograph.',
      'resultIsPhotograph: RESULT is still a real camera-like photograph, not anime, cartoon, illustration, painting, CGI or 3D render.',
      opts.allowStyleChange === true
        ? 'sameVisualMedium: report whether the medium stayed the same; the requested style transformation itself is allowed.'
        : 'sameVisualMedium: RESULT preserves SOURCE visual medium exactly.',
      'identityPreserved: every person remains recognizably the same person, including when a style transformation was requested.',
      'onlyRequestedChange: changes are limited to what USER REQUEST asks; requested clothing, hair, age, background or framing changes are allowed.',
      'Be strict. If uncertain, use false.'
    ].join('\n');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [
          { text: 'SOURCE image:' },
          { inlineData: { mimeType: opts.sourceMime || 'image/jpeg', data: opts.sourceBase64 } },
          { text: 'RESULT image:' },
          { inlineData: { mimeType: opts.resultMime || 'image/png', data: opts.resultBase64 } },
          { text: instruction }
        ] }],
        generationConfig: { temperature: 0, maxOutputTokens: 180, responseMimeType: 'application/json' }
      })
    });
    if (!response.ok) return { ok: false, reason: 'validation_unavailable' };
    const data = await response.json();
    const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
    const verdict = extractJsonObject(parts.map((part) => part.text || '').join('\n'));
    return assessEditVerdict(verdict, { allowStyleChange: opts.allowStyleChange === true });
  } catch (_) {
    return { ok: false, reason: 'validation_unavailable' };
  } finally {
    clearTimeout(timer);
  }
}

function publicGuardError(result) {
  if (result && result.reason === 'style_mismatch') return 'image_edit_style_mismatch';
  if (result && result.reason === 'identity_or_scope_mismatch') return 'image_edit_identity_mismatch';
  return 'image_edit_validation_failed';
}

module.exports = { extractJsonObject, assessEditVerdict, verifyLocalizedImageEdit, publicGuardError };
