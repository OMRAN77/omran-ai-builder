// Playing together with no internet: on the same Wi-Fi (even one with no internet behind it) or a phone's hotspot.
// The site is not there to introduce the players, so the two phones introduce themselves: the one asking to come in
// shows a QR code (its half of the connection), the host photographs it and shows its own answer as a QR code, and
// the guest photographs that. Then the browsers talk to each other directly over the local network (WebRTC), as in
// an ordinary room. A code may also be copied and pasted as text (a laptop with no camera).
//
//   const text = await packCode('offer', { world, name }, sdp)      const c = await unpackCode(text)  -> { kind, world, name, id, sdp } | null
//   qrPicture(text) -> data: URL of the QR code               openScanner({ parent, onText, onCancel, title, hint })

import qrcode from '../vendor/qr/qrcode.module.js';

const KIND = { offer: 'BWO1', answer: 'BWA1' };
const b64u = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = (t) => { const s = atob(t.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((t.length + 3) % 4)); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
const canZip = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
async function zip(bytes, back) {
  const s = new Blob([bytes]).stream().pipeThrough(back ? new DecompressionStream('deflate-raw') : new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

/** The lines a browser can do without, so that the code (and its QR picture) is smaller. */
export function trimSdp(sdp) {
  return String(sdp).split(/\r?\n/).filter((l) => l && !/^a=(extmap-allow-mixed|msid-semantic)/.test(l))
    .map((l) => l.replace(/ generation \d+/, '').replace(/ network-(id|cost) \d+/g, '')).join('\r\n') + '\r\n';
}

export async function packCode(kind, f, sdp) {
  const raw = new TextEncoder().encode(trimSdp(sdp));
  let body = 'r' + b64u(raw);
  if (canZip) { try { const z = await zip(raw, false); if (z.length < raw.length) body = 'z' + b64u(z); } catch (e) { /* not packed: the plain text works too */ } }
  const head = kind === 'offer' ? [KIND.offer, f.world, b64u(new TextEncoder().encode(String(f.name || '').slice(0, 16)))] : [KIND.answer, f.id];
  return [...head, body].join('.');
}

export async function unpackCode(text) {
  try {
    const t = String(text || '').trim().replace(/\s+/g, ''), parts = t.split('.');
    const kind = parts[0] === KIND.offer ? 'offer' : parts[0] === KIND.answer ? 'answer' : null;
    if (!kind || parts.length !== (kind === 'offer' ? 4 : 3)) return null;
    const body = parts[parts.length - 1], bytes = unb64u(body.slice(1));
    const sdp = new TextDecoder().decode(body[0] === 'z' ? await zip(bytes, true) : bytes);
    if (!/^v=0\r?\n/.test(sdp) || !/a=fingerprint:/.test(sdp)) return null;
    if (kind === 'offer') return { kind, world: parts[1].replace(/[^a-z]/g, '').slice(0, 12), name: new TextDecoder().decode(unb64u(parts[2])).slice(0, 16), sdp };
    return { kind, id: parts[1].replace(/[^a-z0-9]/gi, '').slice(0, 12), sdp };
  } catch (e) { return null; }
}

/** The QR code of a text, as a picture (data: URL), black on white with a quiet border, sharp at any size. */
export function qrPicture(text, px = 6) {
  const q = qrcode(0, 'L');
  q.addData(text, 'Byte');
  q.make();
  const n = q.getModuleCount(), m = 4, size = (n + m * 2) * px;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, size, size); g.fillStyle = '#000';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) g.fillRect((x + m) * px, (y + m) * px, px, px);
  return c.toDataURL('image/png');
}

let jsqr = null;
function loadReader() {          // the reader is a plain script (it sets window.jsQR): loaded the first time a code is read
  if (window.jsQR) return Promise.resolve(window.jsQR);
  if (!jsqr) jsqr = new Promise((res, rej) => { const s = document.createElement('script'); s.src = new URL('../vendor/qr/jsQR.js', import.meta.url).href; s.onload = () => (window.jsQR ? res(window.jsQR) : rej(new Error('reader'))); s.onerror = () => { jsqr = null; rej(new Error('reader')); }; document.head.appendChild(s); });
  return jsqr;
}
/** Read a QR code in a picture or a video frame: its text, or null. */
export async function readQR(source, w, h) {
  const read = await loadReader();
  const big = Math.max(w, h), k = big > 900 ? 900 / big : 1, cw = Math.round(w * k), ch = Math.round(h * k);
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(source, 0, 0, cw, ch);
  const r = read(g.getImageData(0, 0, cw, ch).data, cw, ch, { inversionAttempts: 'attemptBoth' });
  return r && r.data ? r.data : null;
}

const CSS = `
#bwScan { position: absolute; inset: 0; z-index: 3; display: flex; align-items: center; justify-content: center; padding: 10px; background: rgba(3, 6, 10, .9); direction: rtl; }
#bwScan .in { box-sizing: border-box; width: min(520px, 100%); max-height: 100%; overflow: auto; padding: 14px 16px; border-radius: 14px; background: rgba(12, 16, 22, .97); border: 1px solid rgba(255, 255, 255, .25); text-align: center; }
#bwScan h3 { margin: 0 0 4px; font-size: 19px; }
#bwScan p { margin: 4px 0 8px; font-size: 13px; line-height: 1.6; opacity: .85; }
#bwScan .cam { position: relative; width: min(340px, 100%); aspect-ratio: 4 / 3; margin: 0 auto 8px; border-radius: 12px; overflow: hidden; background: #000; }
#bwScan video { width: 100%; height: 100%; object-fit: cover; }
#bwScan .cam i { position: absolute; inset: 14%; border: 3px solid rgba(158, 230, 168, .9); border-radius: 12px; box-shadow: 0 0 0 999px rgba(0, 0, 0, .25); }
#bwScan textarea { box-sizing: border-box; width: 100%; height: 64px; margin: 4px 0; padding: 6px 8px; font: 12px/1.4 ui-monospace, monospace; direction: ltr; color: #f1f4f8; background: rgba(255, 255, 255, .07); border: 1px solid rgba(255, 255, 255, .3); border-radius: 9px; -webkit-user-select: text; user-select: text; }
#bwScan details { margin-top: 6px; font-size: 13px; text-align: right; } #bwScan summary { cursor: pointer; opacity: .8; }
#bwScan .msg { min-height: 18px; color: #ffcf8a; font-size: 13px; }
#bwScan label.file { display: inline-block; }
#bwScan label.file input { display: none; }
`;

/**
 * Read the other phone's code with the camera (or from a photo, or pasted). onText(text) is called with what was
 * read and returns true when it was the code expected (then the reader closes), or a message to show.
 */
export function openScanner({ parent, onText, onCancel, title, hint, fontFamily }) {
  if (!document.getElementById('bwScanCss')) { const s = document.createElement('style'); s.id = 'bwScanCss'; s.textContent = CSS; document.head.appendChild(s); }
  const el = document.createElement('div');
  el.id = 'bwScan';
  if (fontFamily) el.style.fontFamily = fontFamily;
  el.innerHTML = `<div class="in"><h3></h3><p class="hint"></p><div class="cam"><video playsinline muted autoplay></video><i></i></div><div class="msg"></div>`
    + '<label class="file"><input type="file" accept="image/*" capture="environment"><span class="soft-btn">صوّر بكاميرا الجوال أو اختر صورة</span></label>'
    + '<details><summary>ما في كاميرا؟ الصق الكود</summary><textarea aria-label="الكود" placeholder="BWO1… / BWA1…"></textarea><button type="button" data-paste="1">تمام</button></details>'
    + '<div><button type="button" class="soft" data-cancel="1">إلغاء</button></div></div>';
  el.querySelector('h3').textContent = title || 'صوّر الكود';
  el.querySelector('.hint').textContent = hint || '';
  const fileBtn = el.querySelector('.soft-btn');
  Object.assign(fileBtn.style, { display: 'inline-block', padding: '9px 16px', margin: '4px', borderRadius: '10px', border: '1px solid rgba(255,255,255,.35)', cursor: 'pointer', fontWeight: '700', fontSize: '14px' });
  (parent || document.body).appendChild(el);
  const video = el.querySelector('video'), msg = el.querySelector('.msg');
  let stream = null, timer = 0, closed = false, busy = false;
  const detector = typeof window.BarcodeDetector === 'function' ? (() => { try { return new window.BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { return null; } })() : null;

  function close() {
    closed = true; clearTimeout(timer);
    if (stream) for (const t of stream.getTracks()) t.stop();
    el.remove();
  }
  async function got(text) {
    if (closed || !text) return false;
    const r = await onText(text);
    if (r === true) { close(); return true; }
    msg.textContent = typeof r === 'string' ? r : 'هذا مو الكود المطلوب. صوّر الكود اللي في شاشة صاحبك.';
    return false;
  }
  async function frame() {
    if (closed) return;
    if (!busy && video.readyState >= 2 && video.videoWidth) {
      busy = true;
      try {
        let text = null;
        if (detector) { const found = await detector.detect(video); text = found && found[0] ? found[0].rawValue : null; }
        else text = await readQR(video, video.videoWidth, video.videoHeight);
        if (text && /^BW[OA]1\./.test(text) && (await got(text))) return;
      } catch (e) { /* this frame could not be read: the next one is tried */ }
      busy = false;
    }
    timer = setTimeout(frame, 160);
  }
  (async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('no camera');
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
      if (closed) { for (const t of stream.getTracks()) t.stop(); return; }
      video.srcObject = stream;
      await video.play().catch(() => {});
      frame();
    } catch (e) {
      el.querySelector('.cam').hidden = true;
      msg.textContent = 'ما قدرت أفتح الكاميرا هني. اضغط «صوّر بكاميرا الجوال» تحت، أو الصق الكود.';
    }
  })();
  el.querySelector('input[type="file"]').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    msg.textContent = 'أقرا الصورة…';
    try {
      const bmp = await createImageBitmap(f);
      const text = await readQR(bmp, bmp.width, bmp.height);
      if (!text) { msg.textContent = 'ما لقيت كود في الصورة. قرّب الكاميرا من الكود وخله واضح ومو مايل.'; return; }
      await got(text);
    } catch (err) { msg.textContent = 'ما قدرت أقرا الصورة. جرّب مرة ثانية.'; }
    e.target.value = '';
  });
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.cancel) { close(); if (onCancel) onCancel(); }
    else if (b.dataset.paste) await got(el.querySelector('textarea').value);
  });
  el.addEventListener('keydown', (e) => e.stopPropagation());
  return { close, el };
}
