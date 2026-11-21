// Injected into the page by shot.cjs / playtest.cjs with --strict 1.
//
// The software renderer used for testing is forgiving where real GPU drivers are not: pow() of a
// negative base, sqrt() of a negative number, normalize() of a zero vector, log() of zero and
// division results that are undefined in GLSL come back as ordinary numbers here, but as NaN on
// most real hardware (Direct3D in particular). One NaN pixel in an HDR frame is then smeared over
// the whole picture by the bloom blur, or over every lit surface through a baked environment map,
// and the player sees a black world.
//
// This rewrites every shader before it is compiled so those cases return NaN here too. A scene
// that looks the same with and without --strict does not depend on undefined shader maths.
(() => {
  const HELP = `
float _nanf() { return _NAN_EXPR_; }
float _spow(float x, float y) { return (x < 0.0 || (x == 0.0 && y <= 0.0)) ? _nanf() : pow(x, y); }
vec2 _spow(vec2 x, vec2 y) { return vec2(_spow(x.x, y.x), _spow(x.y, y.y)); }
vec3 _spow(vec3 x, vec3 y) { return vec3(_spow(x.x, y.x), _spow(x.y, y.y), _spow(x.z, y.z)); }
vec4 _spow(vec4 x, vec4 y) { return vec4(_spow(x.x, y.x), _spow(x.y, y.y), _spow(x.z, y.z), _spow(x.w, y.w)); }
float _ssqrt(float x) { return x < 0.0 ? _nanf() : sqrt(x); }
vec2 _ssqrt(vec2 x) { return vec2(_ssqrt(x.x), _ssqrt(x.y)); }
vec3 _ssqrt(vec3 x) { return vec3(_ssqrt(x.x), _ssqrt(x.y), _ssqrt(x.z)); }
vec4 _ssqrt(vec4 x) { return vec4(_ssqrt(x.x), _ssqrt(x.y), _ssqrt(x.z), _ssqrt(x.w)); }
float _sisqrt(float x) { return x <= 0.0 ? _nanf() : inversesqrt(x); }
vec2 _sisqrt(vec2 x) { return vec2(_sisqrt(x.x), _sisqrt(x.y)); }
vec3 _sisqrt(vec3 x) { return vec3(_sisqrt(x.x), _sisqrt(x.y), _sisqrt(x.z)); }
float _slog(float x) { return x <= 0.0 ? _nanf() : log(x); }
vec2 _slog(vec2 x) { return vec2(_slog(x.x), _slog(x.y)); }
vec3 _slog(vec3 x) { return vec3(_slog(x.x), _slog(x.y), _slog(x.z)); }
float _slog2(float x) { return x <= 0.0 ? _nanf() : log2(x); }
vec2 _slog2(vec2 x) { return vec2(_slog2(x.x), _slog2(x.y)); }
vec3 _slog2(vec3 x) { return vec3(_slog2(x.x), _slog2(x.y), _slog2(x.z)); }
vec2 _snorm(vec2 v) { return dot(v, v) == 0.0 ? vec2(_nanf()) : normalize(v); }
vec3 _snorm(vec3 v) { return dot(v, v) == 0.0 ? vec3(_nanf()) : normalize(v); }
vec4 _snorm(vec4 v) { return dot(v, v) == 0.0 ? vec4(_nanf()) : normalize(v); }
float _sacos(float x) { return abs(x) > 1.0 ? _nanf() : acos(x); }
float _sasin(float x) { return abs(x) > 1.0 ? _nanf() : asin(x); }
`;
  const MAP = [[/\bpow\s*\(/g, '_spow('], [/\binversesqrt\s*\(/g, '_sisqrt('], [/\bsqrt\s*\(/g, '_ssqrt('], [/\blog2\s*\(/g, '_slog2('], [/\blog\s*\(/g, '_slog('],
    [/\bnormalize\s*\(/g, '_snorm('], [/\bacos\s*\(/g, '_sacos('], [/\basin\s*\(/g, '_sasin(']];
  const orig = WebGL2RenderingContext.prototype.shaderSource;
  window.__strictGL = { shaders: 0 };
  // Optional narrowing for hunting a bad shader: window.__STRICT_CFG = { fns: ['pow', ...], only: 'regex on the source' }
  const CFG = window.__STRICT_CFG || {};
  const only = CFG.only ? new RegExp(CFG.only) : null;
  const use = MAP.filter(([re, to]) => !CFG.fns || CFG.fns.some((f) => to === { pow: '_spow(', inversesqrt: '_sisqrt(', sqrt: '_ssqrt(', log2: '_slog2(', log: '_slog(', normalize: '_snorm(', acos: '_sacos(', asin: '_sasin(' }[f]));
  WebGL2RenderingContext.prototype.shaderSource = function (shader, src) {
    let body = String(src);
    if (only && !only.test(body)) return orig.call(this, shader, body);
    for (const [re, to] of use) body = body.replace(re, to);
    // helpers go right after the first float precision statement (three.js emits it at the top of its prefix,
    // before its own colour-space functions, which already call pow)
    const head = body.slice(0, 4000);
    let at = -1;
    { const m = /precision\s+\w+\s+float\s*;/.exec(head); if (m) at = m.index + m[0].length; }
    // GLSL ES 3.00 can build a NaN from its bit pattern; 1.00 (raw shaders) gets it from 0.0 / 0.0
    const help = HELP.replace('_NAN_EXPR_', /#version\s+300\s+es/.test(head) ? 'intBitsToFloat(0x7fc00000)' : '(min(0.0, 0.0) / min(0.0, 0.0))');
    if (at < 0) { const v = /#version[^\n]*\n/.exec(head); at = v ? v.index + v[0].length : 0; body = body.slice(0, at) + 'precision highp float;\nprecision highp int;\n' + help + body.slice(at); }
    else body = body.slice(0, at) + '\n' + help + body.slice(at);
    window.__strictGL.shaders++;
    return orig.call(this, shader, body);
  };
})();
