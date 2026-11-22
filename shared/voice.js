// Talking in a shared game. Every link between two players carries one voice line from the start, silent
// until a microphone is put on it, so switching the microphone on needs no new handshake.
// A guest's line goes to the host and back. The host hears every guest, and sends each guest a mix of its
// own microphone and all the OTHER guests, so everyone hears everyone through the host.
// The microphone is off until the player switches it on.
//
//   const voice = createVoice({ lines: () => [{ id, sender }], onChange })
//   voice.setMic(true | false) -> Promise<true | reason>     voice.hear(id, stream)     voice.gone(id)     voice.setDeaf(bool)

export function createVoice({ lines, onChange }) {
  let mic = null, micOn = false, deaf = false, ctx = null, micNode = null;
  const heard = new Map();      // id -> { stream, el, node }
  const outs = new Map();       // host: guest id -> MediaStreamAudioDestinationNode
  const api = {
    get micOn() { return micOn; }, get deaf() { return deaf; }, heard, host: false,
    /** Someone's voice arrived on their line. */
    hear(id, stream) {
      api.gone(id);
      const el = document.createElement('audio');
      el.autoplay = true; el.playsInline = true; el.srcObject = stream; el.muted = deaf; el.style.display = 'none';
      document.body.appendChild(el);
      const p = el.play(); if (p && p.catch) p.catch(() => {});      // a browser that wants a tap first plays it on the next one
      heard.set(id, { stream, el, node: null });
      remix();
    },
    gone(id) { const h = heard.get(id); if (!h) return; h.el.srcObject = null; h.el.remove(); if (h.node) { try { h.node.disconnect(); } catch (e) { /* already apart */ } } heard.delete(id); outs.delete(id); remix(); },
    setDeaf(v) { deaf = !!v; for (const h of heard.values()) h.el.muted = deaf; if (onChange) onChange(); },
    /** Switch this player's microphone. Resolves true, or a reason in Arabic. */
    async setMic(on) {
      if (!on) { if (mic) for (const t of mic.getTracks()) t.stop(); mic = null; micOn = false; micNode = null; remix(); if (onChange) onChange(); return true; }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return 'هذا المتصفح ما يدعم المايك هني.';
      try { mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
      catch (e) { return 'ما في إذن للمايك. اسمح له من إعدادات المتصفح وجرّب مرة ثانية.'; }
      micOn = true; micNode = null; remix(); if (onChange) onChange();
      return true;
    },
    stop() { api.setMic(false); for (const id of [...heard.keys()]) api.gone(id); },
  };
  /** Put the right sound on every line: a guest sends its microphone; the host sends each guest a mix without that guest's own voice. */
  function remix() {
    const all = lines();
    if (!api.host) { const track = micOn && mic ? mic.getAudioTracks()[0] : null; for (const l of all) if (l.sender) l.sender.replaceTrack(track).catch(() => {}); return; }
    const guests = all.filter((l) => l.sender);
    if (guests.length <= 1) {      // one guest: nothing to mix, the host's microphone goes straight down the line
      const track = micOn && mic ? mic.getAudioTracks()[0] : null;
      for (const l of guests) l.sender.replaceTrack(track).catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (micOn && mic && !micNode) micNode = ctx.createMediaStreamSource(mic);
    for (const [id, h] of heard) if (!h.node) { try { h.node = ctx.createMediaStreamSource(h.stream); } catch (e) { h.node = null; } }
    for (const l of guests) {
      const old = outs.get(l.id); if (old) { try { old.disconnect(); } catch (e) { /* already apart */ } }
      const dest = ctx.createMediaStreamDestination();
      outs.set(l.id, dest);
      if (micNode) micNode.connect(dest);
      for (const [id, h] of heard) if (id !== l.id && h.node) h.node.connect(dest);
      l.sender.replaceTrack(dest.stream.getAudioTracks()[0]).catch(() => {});
    }
  }
  api.remix = remix;
  return api;
}
