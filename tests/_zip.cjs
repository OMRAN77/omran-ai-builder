// tests/_zip.cjs — أرشيف zip مخزَّن (بلا ضغط) للاختبارات: يكفي لفكّ analyze-zip.js.
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let n = 0; n < buf.length; n++) {
    let c = (crc ^ buf[n]) & 0xFF;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xEDB88320 : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function makeZip(entries) {
  const locals = [], centrals = [];
  let off = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name);
    const data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(String(e.data));
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt32LE(crc32(data), 14);
    lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt32LE(crc32(data), 16);
    ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, name, data); centrals.push(ch, name);
    off += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(off, 16);
  return Buffer.concat(locals.concat([cd, eocd]));
}
module.exports = { makeZip, crc32 };
