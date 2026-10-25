const zlib = require('zlib');

const MAX_TOTAL_CHARS = 150000;
const MAX_PER_FILE_CHARS = 20000;
const SKIP_DIR_PATTERNS = [/(^|\/)node_modules\//, /(^|\/)\.git\//, /(^|\/)dist\//, /(^|\/)build\//, /(^|\/)\.next\//, /(^|\/)__pycache__\//];
const BINARY_EXT = /\.(png|jpe?g|gif|webp|bmp|ico|mp4|mp3|wav|ogg|mov|avi|zip|rar|7z|gz|tar|exe|dll|so|bin|pdf|ttf|otf|woff2?|eot|class|jar|psd|ai|sketch|db|sqlite)$/i;
const TEXT_EXT = /\.(txt|md|markdown|js|jsx|ts|tsx|mjs|cjs|json|html?|css|scss|less|py|rb|php|java|c|cpp|h|hpp|cs|go|rs|swift|kt|sh|bash|yml|yaml|xml|sql|env|gitignore|vue|svelte|toml|ini|conf)$/i;

function findEOCD(buf) {
  const sig = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65536); i--) {
    if (buf[i] === sig[0] && buf[i + 1] === sig[1] && buf[i + 2] === sig[2] && buf[i + 3] === sig[3]) {
      return i;
    }
  }
  return -1;
}

// v-sec-zipbomb: حدود صارمة ضدّ قنبلة الضغط. كانت inflateRawSync بلا maxOutputLength، والحجم
// المعلَن غير مفروض، ولا سقف لعدد المدخلات ولا للمجموع — فأرشيف ٨٨ ك.ب يتمدّد إلى ٥١٢ م.ب في
// الذاكرة ويقتل الدالّة. الآن: سقف لكلّ مدخل، وسقف إجماليّ يوقف التوسيع، وحدّ لعدد المدخلات،
// ورفض المدخلات التي تشير إلى البيانات نفسها (إزاحة محليّة مكرّرة) حتّى لا تُفكّ مرارًا.
const ZIP_MAX_ENTRIES = 4000;
const ZIP_MAX_ENTRY_BYTES = 12 * 1024 * 1024;   // لكلّ ملفّ مفكوك
const ZIP_MAX_TOTAL_BYTES = 80 * 1024 * 1024;   // مجموع المفكوك عبر الأرشيف كلّه

function unzip(buf) {
  const eocdOffset = findEOCD(buf);
  if (eocdOffset === -1) throw new Error('Not a valid ZIP file (EOCD not found)');
  const totalEntries = Math.min(buf.readUInt16LE(eocdOffset + 10), ZIP_MAX_ENTRIES);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);

  const entries = [];
  let ptr = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (ptr + 46 > buf.length) break;
    const sig = buf.readUInt32LE(ptr);
    if (sig !== 0x02014b50) break;
    const compMethod = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const uncompSize = buf.readUInt32LE(ptr + 24);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localHeaderOffset = buf.readUInt32LE(ptr + 42);
    const name = buf.toString('utf8', ptr + 46, ptr + 46 + nameLen);
    entries.push({ name, compMethod, compSize, uncompSize, localHeaderOffset });
    ptr += 46 + nameLen + extraLen + commentLen;
  }

  const files = [];
  const seenOffsets = new Set();
  let totalOut = 0;
  for (const e of entries) {
    if (e.name.endsWith('/')) continue; // directory
    if (seenOffsets.has(e.localHeaderOffset)) continue; // v-sec-zipbomb: إزاحة مكرّرة = نفس البيانات
    seenOffsets.add(e.localHeaderOffset);
    if (totalOut >= ZIP_MAX_TOTAL_BYTES) break; // v-sec-zipbomb: بلغنا السقف الإجماليّ
    const lh = e.localHeaderOffset;
    if (lh < 0 || lh + 30 > buf.length) continue;
    const lNameLen = buf.readUInt16LE(lh + 26);
    const lExtraLen = buf.readUInt16LE(lh + 28);
    const dataStart = lh + 30 + lNameLen + lExtraLen;
    const compData = buf.subarray(dataStart, dataStart + e.compSize);
    // سقف هذا المدخل: الأصغر من المتبقّي والحدّ الفرديّ (والحجم المعلَن إن كان معقولًا).
    const budget = Math.min(ZIP_MAX_ENTRY_BYTES, ZIP_MAX_TOTAL_BYTES - totalOut);
    let data;
    try {
      if (e.compMethod === 0) {
        if (compData.length > budget) continue; // مخزّن بلا ضغط وأكبر من الميزانيّة
        data = compData;
      } else if (e.compMethod === 8) {
        // maxOutputLength يرمي RangeError إن تجاوز الناتجُ الميزانيّة، فيُتخطّى المدخل بأمان.
        data = zlib.inflateRawSync(compData, { maxOutputLength: budget });
      } else continue; // unsupported method
    } catch (err) {
      continue;
    }
    totalOut += data.length;
    files.push({ name: e.name, data });
  }
  return files;
}

function stripXmlTags(xml) {
  return xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// v405 — كان `export default` (صيغة ESM) بينما tools.js يستدعيه بـ require
// (CommonJS)، فكان الرفع المباشر يفشل بـ«handler is not a function» منذ v402.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  try {
    const { filename, fileBase64, token, guestId } = req.body || {};

    // v-sec-zip-gate: كانت النقطة مفتوحة بلا جلسة ولا حصّة — أيّ زائر يكرّرها. الآن حصّة يوميّة
    // لكلّ حساب/شبكة (٣٠). الحجز قبل العمل، ويُردّ إن فشل التحليل قبل أن يخدم المستخدم.
    const usage = require('./_usage.js');
    const gate = await usage.checkAndConsumeCustom(token, guestId, usage.clientIp(req), 'analyze-zip', 30);
    if (!gate.allowed) {
      res.status(gate.reason === 'auth' ? 401 : 429).json({ error: gate.reason === 'auth' ? 'سجّل الدخول لتحليل الأرشيف.' : 'وصلت للحدّ اليوميّ لتحليل الأرشيفات.' });
      return;
    }
    const refundGate = () => { try { usage.refundCustom(token, guestId, usage.clientIp(req), 'analyze-zip'); } catch (e) { /* أفضل جهد */ } };

    // مسار الرفع المباشر (fileBase64) هو الأساسي الآن.
    //
    // كان الملف يُرفع من المتصفح إلى Vercel Blob ثم يُنزَّل هنا برابط. لكن
    // Vercel Blob عُلِّق والتخزين انتقل إلى Redis، و/api/blob-client-upload
    // صار يرجع 503 عمدًا — فانقطعت الخطوة الأولى وتوقّفت ميزة الأرشيف
    // بالكامل. الطريق الوحيد الباقي هو أن يصل الملف مع الطلب نفسه.
    //
    // لا نقبل روابط تنزيل من العميل: جلبها من الخادم يفتح مسار SSRF.
    let buf;
    if (fileBase64) {
      try {
        buf = Buffer.from(String(fileBase64), 'base64');
      } catch (e) {
        refundGate();
        res.status(400).json({ error: 'تعذّر قراءة الملف المرسل.' });
        return;
      }
      // جسم دالة Vercel محدود بـ ~4.5 م.ب، وbase64 يزيد الحجم ~33%.
      // نرفض مبكرًا برسالة مفهومة بدل أن تفشل المنصة برسالة غامضة.
      if (buf.length > 3 * 1024 * 1024) {
        refundGate();
        res.status(413).json({
          error: 'الملف كبير جدًا للتحليل المباشر (الحد ~3 ميجابايت). احذف مجلدات مثل node_modules أو أرسل الملفات المهمة فقط.',
        });
        return;
      }
    } else {
      refundGate();
      res.status(400).json({ error: 'لم يصل الملف. حاول اختياره مجددًا.' });
      return;
    }

    if (!buf || !buf.length) {
      refundGate();
      res.status(400).json({ error: 'الملف فارغ.' });
      return;
    }
    if (buf.length > 30 * 1024 * 1024) {
      refundGate();
      res.status(400).json({ error: 'الأرشيف كبير جدًا للتحليل.' });
      return;
    }

    let files;
    try {
      files = unzip(buf);
    } catch (err) {
      refundGate();
      res.status(400).json({ error: 'الملف ليس أرشيفًا صالحًا (تأكد أنه zip أو docx أو xlsx أو pptx سليم).' });
      return;
    }

    const isOfficeDoc = files.some(f => f.name === '[Content_Types].xml');
    let combined = '';
    let fileList = [];
    let usedChars = 0;

    if (isOfficeDoc) {
      // Word/Excel/PowerPoint: extract main text content from key XML parts
      const mainParts = files.filter(f => /word\/document\.xml$|xl\/sharedStrings\.xml$|ppt\/slides\/slide\d+\.xml$/.test(f.name));
      for (const f of mainParts) {
        const text = stripXmlTags(f.data.toString('utf8')).slice(0, MAX_PER_FILE_CHARS);
        if (usedChars + text.length > MAX_TOTAL_CHARS) break;
        combined += `\n--- ${f.name} ---\n${text}\n`;
        usedChars += text.length;
        fileList.push(f.name);
      }
    } else {
      for (const f of files) {
        if (SKIP_DIR_PATTERNS.some(p => p.test(f.name))) continue;
        fileList.push(f.name);
        if (BINARY_EXT.test(f.name)) continue;
        if (!TEXT_EXT.test(f.name) && f.data.length > 200000) continue;
        let text;
        try { text = f.data.toString('utf8'); } catch { continue; }
        // heuristic: skip if looks binary (many null bytes)
        if (text.includes('\u0000')) continue;
        text = text.slice(0, MAX_PER_FILE_CHARS);
        if (usedChars + text.length > MAX_TOTAL_CHARS) continue;
        combined += `\n--- ${f.name} ---\n${text}\n`;
        usedChars += text.length;
      }
    }

    let truncatedNote = usedChars >= MAX_TOTAL_CHARS ? '\n... (تم اقتطاع باقي الملفات لأن المحتوى طويل جدًا)' : '';

    res.status(200).json({
      ok: true,
      filename: filename || 'archive.zip',
      entryCount: files.length,
      fileList: fileList.slice(0, 300),
      content: (`ملفات داخل الأرشيف "${filename || ''}" (${files.length} ملف):\n` + fileList.slice(0, 300).join('\n') + '\n\n=== المحتوى المستخرج ===\n' + combined + truncatedNote)
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error analyzing archive' });
  }
}

// v-code-score — محلّل الكود (code-analyze.js) يعيد استعمال فكّ الأرشيف وقوائم
// الامتدادات نفسها بدل نسخها: مصدر واحد لما يُعدّ نصًّا وما يُتخطّى.
module.exports.unzip = unzip;
module.exports.TEXT_EXT = TEXT_EXT;
module.exports.BINARY_EXT = BINARY_EXT;
module.exports.SKIP_DIR_PATTERNS = SKIP_DIR_PATTERNS;
