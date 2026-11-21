// Game sound, made in the browser with Web Audio: no sound files. Short noises and tones for steps,
// digging, breaking, placing, jumping, landing, water, flying and the bag, over a quiet moving-air bed.
//
//   const sound = createSound();          // nothing is created yet
//   sound.start();                        // call inside a click: browsers only allow sound after one
//   sound.step(); sound.dig(); sound.brk(); sound.place(); ...
//   sound.setMuted(true)

const LEVEL = 1.7;

export function createSound() {
  let ctx = null, master = null, noiseBuf = null, bed = null, muted = false;
  const stats = { played: 0 };
  try { muted = window.localStorage.getItem('bw-mute') === '1'; } catch (e) { /* storage may be closed to this page */ }

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { ctx = new AC(); } catch (e) { ctx = null; return false; }
    master = ctx.createGain(); master.gain.value = muted ? 0 : LEVEL;
    const comp = ctx.createDynamicsCompressor();      // lets everything be loud without clipping when sounds pile up
    comp.threshold.value = -16; comp.knee.value = 18; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.18;
    master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); let s = 22222;
    for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = (s / 2147483647) * 2 - 1; }
    return true;
  }
  /** A burst of filtered noise. f -> f2 sweeps the filter. */
  function noise(dur, { type = 'bandpass', f = 900, f2 = f, q = 0.9, gain = 0.25, attack = 0.004, when = 0 } = {}) {
    if (!ensure()) return;
    stats.played++;
    const t = ctx.currentTime + when, src = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf; src.loop = true; src.playbackRate.value = 0.8 + Math.random() * 0.4;
    flt.type = type; flt.Q.value = q; flt.frequency.setValueAtTime(f, t); flt.frequency.exponentialRampToValueAtTime(Math.max(30, f2), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt); flt.connect(g); g.connect(master);
    src.start(t, Math.random()); src.stop(t + dur + 0.02);
  }
  /** A short tone. f -> f2 slides the pitch. */
  function tone(dur, { type = 'sine', f = 440, f2 = f, gain = 0.15, attack = 0.005, when = 0 } = {}) {
    if (!ensure()) return;
    stats.played++;
    const t = ctx.currentTime + when, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  /** The quiet bed under everything: slow-moving air. */
  function startBed() {
    if (bed || !ensure()) return;
    const src = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), depth = ctx.createGain(), sweep = ctx.createGain();
    src.buffer = noiseBuf; src.loop = true;
    flt.type = 'lowpass'; flt.frequency.value = 420; flt.Q.value = 0.4;
    g.gain.value = 0.05;
    lfo.type = 'sine'; lfo.frequency.value = 0.07; depth.gain.value = 0.025; sweep.gain.value = 170;
    lfo.connect(depth); depth.connect(g.gain); lfo.connect(sweep); sweep.connect(flt.frequency);
    src.connect(flt); flt.connect(g); g.connect(master);
    src.start(); lfo.start();
    bed = { g };
  }
  const r = (a, b) => a + Math.random() * (b - a);
  return {
    stats,
    get muted() { return muted; },
    /** 'running' once the browser lets the page play; 'none' before the first sound. */
    get state() { return ctx ? ctx.state : 'none'; },
    get bed() { return !!bed; },
    start() { if (ensure()) startBed(); },
    setMuted(v) {
      muted = !!v;
      try { window.localStorage.setItem('bw-mute', muted ? '1' : '0'); } catch (e) { /* not kept, that is all */ }
      if (master) master.gain.setTargetAtTime(muted ? 0 : LEVEL, ctx.currentTime, 0.03);
    },
    step(wet) { if (wet) noise(0.22, { f: r(500, 800), f2: 250, q: 0.7, gain: 0.13 }); else noise(0.085, { type: 'lowpass', f: r(520, 760), f2: 180, gain: 0.2 }); },
    /** One hit on a block. */
    dig() { noise(0.1, { f: r(1500, 2300), f2: 500, q: 1.2, gain: 0.34 }); noise(0.07, { type: 'lowpass', f: 700, f2: 160, gain: 0.3 }); tone(0.09, { type: 'triangle', f: r(180, 230), f2: 85, gain: 0.26 }); },
    /** A swing that meets nothing. */
    swing() { noise(0.16, { f: 500, f2: 1500, q: 1.1, gain: 0.13 }); },
    brk() { noise(0.24, { type: 'lowpass', f: 1700, f2: 160, gain: 0.42 }); noise(0.14, { f: 2800, f2: 800, q: 1.1, gain: 0.2, when: 0.02 }); tone(0.14, { type: 'triangle', f: 150, f2: 60, gain: 0.26 }); },
    place() { tone(0.07, { type: 'triangle', f: 250, f2: 150, gain: 0.2 }); noise(0.05, { type: 'lowpass', f: 950, f2: 300, gain: 0.16 }); },
    jump() { noise(0.1, { f: 380, f2: 780, q: 0.8, gain: 0.08 }); },
    land(hard) { noise(0.13, { type: 'lowpass', f: 480, f2: 110, gain: hard ? 0.36 : 0.22 }); tone(0.09, { f: 95, f2: 55, gain: hard ? 0.24 : 0.13 }); },
    splash() { noise(0.4, { f: 1200, f2: 300, q: 0.6, gain: 0.24 }); noise(0.25, { type: 'highpass', f: 2800, f2: 1800, gain: 0.07, when: 0.03 }); },
    fly(on) { noise(0.38, { f: on ? 300 : 1100, f2: on ? 1300 : 260, q: 1.6, gain: 0.14 }); },
    ui() { tone(0.05, { f: 720, f2: 860, gain: 0.08 }); },
    pick() { tone(0.045, { type: 'triangle', f: 540, f2: 500, gain: 0.07 }); },
  };
}
