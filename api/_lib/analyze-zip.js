// api/_lib/analyze-zip.js — فكّ الأرشيف وقراءته بترتيب الأهمّيّة.
//
// ثلاثة أعطال أُصلحت هنا، كلّها مقيسة:
//
// ① بلا بوّابة. كانت هذه النقطة الوحيدة في api/tools التي تُنفّذ عملًا ثقيلًا
//    (فكّ ضغط ونفخ) بلا هويّة ولا سقف. أيّ غريب يُشغّل معالج خادمك مجّانًا.
//
// ② قنبلة ضغط. `zlib.inflateRawSync` بلا `maxOutputLength`: أرشيف ٣ م.ب
//    بنسبة ١٠٠٠:١ ينفخ إلى ~٣ ج.ب فتُقتل الدالّة. الحدّ الآن لكلّ مُدخَل
//    وللمجموع معًا — لأنّ ألف ملفّ صغير يتجاوز الحدّ الكلّيّ بلا أن يتجاوز
//    أيٌّ منها الحدّ الفرديّ.
//
// ③ الترتيب. القراءة كانت بترتيب ورود الملفّات ثمّ قصٌّ عند الميزانيّة.
//    قياس على هذا المستودع: `api/_lib/chat.js` رقم ١٢٨ ⇒ لا يصل النموذج،
//    و`app.bundle.js` (مولَّد، ١.٣ م.ب) رقم ٢ ⇒ يبتلع الميزانيّة كلّها.
//    الترتيب الآن في _pack.js، مُختبَرًا وحده (tests/pack.test.cjs).
const zlib = require('zlib');
const { checkAndConsumeCustom, clientIp } = require('./_usage.js');
const { rankFiles, packFiles, renderPack } = require('./_pack.js');
const { safeParse } = require('./safe-parse.js');
const { logError } = require('./log-error.js');

const DAILY_LIMIT = Number(process.env.ARCHIVE_DAILY || 30);
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;      // جسم دالّة Vercel ~٤.٥ م.ب، وbase64 يزيد ٣٣٪
const MAX_INFLATE_PER_ENTRY = 8 * 1024 * 1024; // ملفّ واحد داخل الأرشيف
const MAX_INFLATE_TOTAL = 64 * 1024 * 1024;    // مجموع ما يُنفخ من الأرشيف كلّه
const MAX_ENTRIES = 3000;
const BUDGET_CHARS = 300000;

function findEOCD(buf) {
  const sig = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65536); i--) {
    if (buf[i] === sig[0] && buf[i + 1] === sig[1] && buf[i + 2] === sig[2] && buf[i + 3] === sig[3]) return i;
  }
  return -1;
}

/** يقرأ فهرس الأرشيف وحده — بلا نفخ. النفخ يجري كسولًا عند الطلب. */
function readIndex(buf) {
  const eocd = findEOCD(buf);
  if (eocd === -1) throw new Error('not_a_zip');
  const total = Math.min(buf.readUInt16LE(eocd + 10), MAX_ENTRIES);
  const cdOffset = buf.readUInt32LE(eocd + 16);

  const entries = [];
  let ptr = cdOffset;
  for (let i = 0; i < total; i++) {
    if (ptr + 46 > buf.length) break;
    if (buf.readUInt32LE(ptr) !== 0x02014b50) break;
    const compMethod = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const uncompSize = buf.readUInt32LE(ptr + 24);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const offset = buf.readUInt32LE(ptr + 42);
    const name = buf.toString('utf8', ptr + 46, ptr + 46 + nameLen);
    // اسم يخرج من الشجرة لا يُقرأ. لا نكتب على القرص هنا، لكنّ مسارًا كهذا
    // علامة أرشيف معاديّ، وإظهاره للنموذج تلويثٌ بلا فائدة.
    if (!name.endsWith('/') && !name.includes('..') && !name.startsWith('/')) {
      entries.push({ name, compMethod, compSize, uncompSize, offset });
    }
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** يُنشئ قارئًا كسولًا محكوم الميزانيّة. */
function makeReader(buf, entries) {
  const byName = new Map(entries.map((e) => [e.name, e]));
  let inflatedTotal = 0;
  return function read(name) {
    const e = byName.get(name);
    if (!e) throw new Error('missing');
    if (e.uncompSize > MAX_INFLATE_PER_ENTRY) throw new Error('entry_too_large');
    if (inflatedTotal + e.uncompSize > MAX_INFLATE_TOTAL) throw new Error('inflate_budget');
    const lh = e.offset;
    if (lh + 30 > buf.length) throw new Error('bad_offset');
    const dataStart = lh + 30 + buf.readUInt16LE(lh + 26) + buf.readUInt16LE(lh + 28);
    const comp = buf.subarray(dataStart, dataStart + e.compSize);
    let data;
    if (e.compMethod === 0) data = comp;
    else if (e.compMethod === 8) data = zlib.inflateRawSync(comp, { maxOutputLength: MAX_INFLATE_PER_ENTRY });
    else throw new Error('unsupported_method');
    inflatedTotal += data.length;
    return data.toString('utf8');
  };
}

function stripXml(xml) {
  return xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

const OFFICE_PART = /word\/document\.xml$|xl\/sharedStrings\.xml$|ppt\/slides\/slide\d+\.xml$/;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  try {
    const body = safeParse(req.body, {}, 'analyze-zip');
    const { filename, fileBase64, token, guestId, question } = body || {};

    // ① بوّابة قبل أي عمل: الهويّة ثمّ سقف يوميّ منفصل عن المحادثة.
    const gate = await checkAndConsumeCustom(token, guestId, clientIp(req), 'archive', DAILY_LIMIT);
    if (!gate.allowed) {
      res.status(gate.reason === 'limit' ? 429 : 401).json({
        error: gate.reason === 'limit'
          ? ('بلغتَ حدّ ' + DAILY_LIMIT + ' أرشيفًا اليوم. جرّب غدًا.')
          : 'يلزم تسجيل الدخول لتحليل الأرشيف.',
        reason: gate.reason,
      });
      return;
    }

    if (!fileBase64) { res.status(400).json({ error: 'لم يصل الملف. حاول اختياره مجددًا.' }); return; }
    let buf;
    try { buf = Buffer.from(String(fileBase64), 'base64'); }
    catch (e) { res.status(400).json({ error: 'تعذّر قراءة الملف المرسل.' }); return; }
    if (!buf.length) { res.status(400).json({ error: 'الملف فارغ.' }); return; }
    if (buf.length > MAX_UPLOAD_BYTES) {
      res.status(413).json({ error: 'الملف كبير جدًا (الحد ~٣ ميجابايت). احذف مجلدات مثل node_modules أو أرسل المهم فقط.' });
      return;
    }

    let entries;
    try { entries = readIndex(buf); }
    catch (e) { res.status(400).json({ error: 'الملف ليس أرشيفًا صالحًا (zip أو docx أو xlsx أو pptx).' }); return; }
    if (!entries.length) { res.status(400).json({ error: 'الأرشيف فارغ أو تالف.' }); return; }

    const read = makeReader(buf, entries);
    const isOffice = entries.some((e) => e.name === '[Content_Types].xml');

    // مستند Office: النصّ في أجزاء XML معروفة — لا ترتيب ولا بيان ملفّات.
    if (isOffice) {
      let out = '';
      for (const e of entries.filter((x) => OFFICE_PART.test(x.name))) {
        if (out.length >= BUDGET_CHARS) break;
        let text;
        try { text = stripXml(read(e.name)); }
        catch (err) { logError('analyze-zip/office', err, { part: e.name }); continue; }
        out += '\n--- ' + e.name + ' ---\n' + text.slice(0, BUDGET_CHARS - out.length) + '\n';
      }
      res.status(200).json({
        ok: true, kind: 'office', filename: filename || 'document',
        entryCount: entries.length,
        content: out.trim() || 'لم يُعثر على نصّ داخل المستند.',
      });
      return;
    }

    // ③ أرشيف شيفرة: رتّب بالأهمّيّة — وبسؤال المستخدم إن أرسله.
    const ranked = rankFiles(entries.map((e) => ({ name: e.name, size: e.uncompSize })), question);
    const pack = packFiles(ranked, read, { budget: BUDGET_CHARS, perFile: 60000, maxFiles: 120 });

    if (!pack.picked.length) {
      res.status(200).json({
        ok: true, kind: 'archive', filename: filename || 'archive.zip',
        entryCount: entries.length, readCount: 0,
        content: 'لا توجد ملفات نصية قابلة للقراءة داخل الأرشيف (' + entries.length + ' مدخلًا، كلّها ثنائيّة أو مولَّدة).',
      });
      return;
    }

    res.status(200).json({
      ok: true,
      kind: 'archive',
      filename: filename || 'archive.zip',
      entryCount: entries.length,
      readCount: pack.picked.length,
      usedChars: pack.used,
      content: renderPack(filename || 'archive.zip', entries, pack),
    });
  } catch (err) {
    logError('analyze-zip', err, { action: 'handler' });
    // الرسالة الخام كانت تخرج للعميل — تسريب داخليّ بلا فائدة له.
    res.status(500).json({ error: 'تعذّر تحليل الأرشيف. حاول مجددًا.' });
  }
};
