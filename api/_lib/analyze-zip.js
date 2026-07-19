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

function unzip(buf) {
  const eocdOffset = findEOCD(buf);
  if (eocdOffset === -1) throw new Error('Not a valid ZIP file (EOCD not found)');
  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);

  const entries = [];
  let ptr = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
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
  for (const e of entries) {
    if (e.name.endsWith('/')) continue; // directory
    const lh = e.localHeaderOffset;
    const lNameLen = buf.readUInt16LE(lh + 26);
    const lExtraLen = buf.readUInt16LE(lh + 28);
    const dataStart = lh + 30 + lNameLen + lExtraLen;
    const compData = buf.subarray(dataStart, dataStart + e.compSize);
    let data;
    try {
      if (e.compMethod === 0) data = compData;
      else if (e.compMethod === 8) data = zlib.inflateRawSync(compData);
      else continue; // unsupported method
    } catch (err) {
      continue;
    }
    files.push({ name: e.name, data });
  }
  return files;
}

function stripXmlTags(xml) {
  return xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  try {
    const { url, filename } = req.body || {};
    if (!url) { res.status(400).json({ error: 'Missing url' }); return; }

    const fileResp = await fetch(url);
    if (!fileResp.ok) { res.status(400).json({ error: 'Could not download uploaded file' }); return; }
    const arrBuf = await fileResp.arrayBuffer();
    const buf = Buffer.from(arrBuf);

    if (buf.length > 30 * 1024 * 1024) {
      res.status(400).json({ error: 'File too large to analyze' });
      return;
    }

    let files;
    try {
      files = unzip(buf);
    } catch (err) {
      res.status(400).json({ error: 'Not a readable archive: ' + (err.message || err) });
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
