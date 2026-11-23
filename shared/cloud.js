// «حسابي»: the saved world kept on the site as well as in this browser, so it can be carried on from another
// browser or device. The account is one code given once (see api/cloud-save.js); this browser remembers it.
// The save is the same one save.js keeps in this browser, squeezed (gzip) before it is sent.
//
//   const cloud = createCloud({ world });      (save.js does this)
//   cloud.code            the account linked here ('' when none)
//   cloud.create()        a new account, linked here           cloud.link(code)   link an existing one     cloud.unlink()
//   cloud.push(text)      send this world's save (the JSON text)      cloud.pull() -> { at, text } | null

const API = '/api/cloud-save';
const CODE_KEY = 'bw-cloud';
export const PUSH_EVERY = 90;      // seconds between sends while playing (and on leaving the game from the menu)

const toB64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = (s) => { const b = atob(s), u8 = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u8[i] = b.charCodeAt(i); return u8; };
/** The save text as it travels: 'g:' + base64 of gzip where the browser can squeeze, else 'j:' + the text. */
export async function pack(text) {
  if (typeof CompressionStream === 'undefined') return 'j:' + text;
  const out = new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip')));
  return 'g:' + toB64(new Uint8Array(await out.arrayBuffer()));
}
export async function unpack(data) {
  if (typeof data !== 'string') return null;
  if (data.startsWith('j:')) return data.slice(2);
  if (!data.startsWith('g:') || typeof DecompressionStream === 'undefined') return null;
  const out = new Response(new Blob([fromB64(data.slice(2))]).stream().pipeThrough(new DecompressionStream('gzip')));
  return out.text();
}
export const showCode = (v) => { const c = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return c.length === 12 ? c.slice(0, 4) + '-' + c.slice(4, 8) + '-' + c.slice(8) : ''; };

const WHY = { 'no-account': 'ما في حساب بهذا الرمز. تأكد من الحروف.', code: 'الرمز 12 حرف ورقم (مثل K7QM-2XPA-9DTR).', 'too-big': 'عالمك كبير وايد على الحساب. يبقى محفوظ في هذا المتصفح.', 'slow-down': 'محاولات كثيرة. انتظر دقيقة.', store: 'الحساب ما يرد الحين من جهة الموقع. عالمك محفوظ في هذا المتصفح.', offline: 'ما قدرت أوصل للموقع. الحفظ في الحساب يشتغل من الموقع نفسه وبوجود نت.' };
export const cloudWhy = (e) => WHY[e] || 'صار خطأ. جرّب مرة ثانية.';

export function createCloud({ world, api = API }) {
  let code = '';
  try { code = showCode(window.localStorage.getItem(CODE_KEY) || ''); } catch (e) { code = ''; }
  const cloud = { last: 0, why: '', busy: false };
  async function call(body) {
    let r = null, j = null;
    try { r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); j = await r.json(); } catch (e) { j = null; }
    if (!j) return { error: 'offline' };
    return j;
  }
  const keep = (c) => { code = c; try { if (c) window.localStorage.setItem(CODE_KEY, c); else window.localStorage.removeItem(CODE_KEY); } catch (e) { /* not kept: linked for this visit only */ } };

  // (a getter, not a copied value: Object.assign would freeze the code as it is now)
  Object.defineProperty(cloud, 'code', { get: () => code, enumerable: true });
  Object.assign(cloud, {
    async create() {
      const r = await call({ op: 'new' });
      if (r.error || !showCode(r.code)) { cloud.why = cloudWhy(r.error); return false; }
      keep(showCode(r.code)); cloud.why = ''; return true;
    },
    async link(c) {
      const s = showCode(c);
      if (!s) { cloud.why = cloudWhy('code'); return false; }
      const r = await call({ op: 'info', code: s });
      if (r.error) { cloud.why = cloudWhy(r.error); return false; }
      keep(s); cloud.why = ''; cloud.worlds = r.worlds || {}; return true;
    },
    unlink() { keep(''); cloud.last = 0; },
    async push(text, at) {
      if (!code || !text || cloud.busy) return false;
      cloud.busy = true;
      try {
        const r = await call({ op: 'put', code, world, at: at || Date.now(), data: await pack(text) });
        if (r.error) { cloud.why = cloudWhy(r.error); return false; }
        cloud.last = Date.now(); cloud.why = ''; return true;
      } catch (e) { cloud.why = cloudWhy('offline'); return false; } finally { cloud.busy = false; }
    },
    async pull() {
      if (!code) return null;
      const r = await call({ op: 'get', code, world });
      if (r.error) { cloud.why = cloudWhy(r.error); return null; }
      if (r.none) return null;
      try { const text = await unpack(r.data); return text ? { at: Number(r.at) || 0, text } : null; } catch (e) { return null; }
    },
  });
  window.__GAME_CLOUD = cloud;
  return cloud;
}
