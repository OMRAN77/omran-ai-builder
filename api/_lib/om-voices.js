// v-om-voices-chat (المالك ٢٣ أكتوبر «ابدأ»: «أريد في الدردشة هذي الأصوات»): «استمع» على ردود المحادثة للمالك
// وحده يقرأ بأصوات «أصوات om» (المتبرعين، موقع omran-voices) بدل مها. باقي المستخدمين كما هم.
// الموقع نفسه يقرأ الأصوات من مستودعه الخاصّ ويركّب اللهجة؛ هنا نرسل له النصّ ونستلم WAV.
// المحرّك هناك مجّانيّ بحدّ يوميّ صغير (≈٧ مقاطع لحساب المالك في Hugging Face) — عند الحدّ ⇐ رسالة لا صوت آخر.
// v-om-voices-piper (المالك ٢٩ أكتوبر «نكمل»): v5 (رجل) وv4 (امرأة) تدرّبا صوتين خفيفين بالفصحى، والموقع يرسل طلبهما العربيّ
// لسيرفرهما المجّانيّ (Space خاصّ للمالك، ثانية للجملة، بلا حدّ يوميّ). الصوت الافتراضيّ للمرأة صار v4 بدل v1 لذلك.
// السيرفر نائم (٥٠٣ من الموقع) ⇐ om-waking: «حاول مرة ثانية» بعد دقيقة، لا صوت آخر.
// البيئة: OM_VOICES_KEY (كلمة سرّ موقع الأصوات — بدونها لا يعمل شيء)، OM_VOICES_URL، OM_VOICES_FEMALE/OM_VOICES_MALE (رقم الصوت).

// لغات محرّك الأصوات؛ غيرها (الأورديّة، البنغاليّة…) يبقى بصوت مها لأنّ المحرّك لا ينطقها.
const LANGS = new Set(['ar', 'da', 'de', 'el', 'en', 'es', 'fi', 'fr', 'he', 'hi', 'it', 'ja', 'ko', 'ms', 'nl', 'no', 'pl', 'pt', 'ru', 'sv', 'sw', 'tr', 'zh']);
const PIECE = 260; // المحرّك يقبل ٣٠٠ حرف للقطعة، والتشكيل في قاموس اللهجة يزيد قليلًا

class OmVoicesError extends Error {
  constructor(message, code, status) { super(message); this.code = code; this.status = status; }
}

function settings() {
  return {
    key: String(process.env.OM_VOICES_KEY || '').trim(),
    url: String(process.env.OM_VOICES_URL || 'https://omran-voices.vercel.app').trim().replace(/\/+$/, ''),
    female: String(process.env.OM_VOICES_FEMALE || 'v4').trim(),
    male: String(process.env.OM_VOICES_MALE || 'v5').trim(),
  };
}

function enabledFor(username, lang) {
  let owner = false;
  try { owner = require('./_owner.js').isOwnerName(username); } catch (e) { owner = false; } // بلا وحدة المالك = لا أحد
  return owner && !!settings().key && LANGS.has(String(lang || '').toLowerCase().slice(0, 2));
}

// قطع ≤ PIECE على حدود الجمل ثمّ الكلمات — المقطع من العميل يصل ٤٠٠ حرف.
function pieces(text) {
  const out = [];
  let cur = '';
  for (const w of String(text || '').replace(/\s+/g, ' ').trim().split(' ')) {
    if (!w) continue;
    const next = cur ? cur + ' ' + w : w;
    if (next.length > PIECE && cur) { out.push(cur); cur = w.slice(0, PIECE); }
    else cur = next.slice(0, PIECE);
    if (/[.!?؟۔]$/.test(w) && cur.length >= PIECE * 0.6) { out.push(cur); cur = ''; }
  }
  if (cur) out.push(cur);
  return out;
}

// بيانات PCM من WAV (16-bit) ومعدّلها؛ يتخطّى أيّ مقطع غير «data».
function pcmOf(buf) {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new OmVoicesError('bad-wav', 'bad_wav', 502);
  let off = 12, rate = 24000, channels = 1, bits = 16;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') { channels = buf.readUInt16LE(off + 10); rate = buf.readUInt32LE(off + 12); bits = buf.readUInt16LE(off + 22); }
    if (id === 'data') return { rate, channels, bits, data: buf.subarray(off + 8, Math.min(buf.length, off + 8 + size)) };
    off += 8 + size + (size & 1);
  }
  throw new OmVoicesError('bad-wav', 'bad_wav', 502);
}

function joinWav(bufs) {
  const parts = bufs.map(pcmOf);
  const { rate, channels, bits } = parts[0];
  const gap = Buffer.alloc(Math.round(rate * 0.25) * channels * (bits / 8)); // وقفة ربع ثانية بين القطع
  const data = Buffer.concat(parts.flatMap((p, i) => (i ? [gap, p.data] : [p.data])));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(channels, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * channels * bits / 8, 28); h.writeUInt16LE(channels * bits / 8, 32); h.writeUInt16LE(bits, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

async function speak({ text, lang, gender }) {
  const s = settings();
  const donor = gender === 'male' ? s.male : s.female;
  const out = [];
  for (const piece of pieces(text)) {
    let r;
    try {
      r = await fetch(s.url + '/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Access-Key': encodeURIComponent(s.key) },
        body: JSON.stringify({ text: piece, lang: String(lang).toLowerCase().slice(0, 2), voice: { donor } }),
        signal: AbortSignal.timeout(170000),
      });
    } catch (e) {
      throw new OmVoicesError('om-down', 'om_down', 502);
    }
    if (r.status === 429) throw new OmVoicesError('om-quota', 'om_quota', 429);
    if (r.status === 503) throw new OmVoicesError('om-waking', 'om_waking', 503); // سيرفر الصوتين نائم ويصحى
    if (!r.ok) {
      let code = '';
      try { code = (await r.json()).code || ''; } catch (e) { code = ''; } // ليس JSON: يكفي الرقم
      throw new OmVoicesError('om-failed:' + r.status + (code ? ':' + code : ''), 'om_failed', 502);
    }
    out.push(Buffer.from(await r.arrayBuffer()));
  }
  if (!out.length) throw new OmVoicesError('empty-text', 'empty', 400);
  return out.length === 1 ? out[0] : joinWav(out);
}

module.exports = { enabledFor, speak, pieces, joinWav, OmVoicesError, LANGS };
