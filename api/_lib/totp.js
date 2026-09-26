// api/_lib/totp.js — v-account-guard: رموز تطبيق المصادقة (RFC 6238: HMAC-SHA1، ٦ أرقام، ٣٠ ثانية)
// بلا مكتبات، ورموز احتياطيّة تُحفظ مجزّأة (sha256 — عشوائيّة ٥٠ بتًّا فلا حاجة لـscrypt).
'use strict';
const crypto = require('crypto');

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP = 30;

function b32encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function b32decode(str) {
  const s = String(str || '').toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const ch of s) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error('bad_base32');
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

function genSecret() {
  return b32encode(crypto.randomBytes(20));
}

function hotp(secretB32, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', b32decode(secretB32)).update(msg).digest();
  const off = h[h.length - 1] & 15;
  const bin = ((h[off] & 127) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 1000000).padStart(6, '0');
}

// يعيد رقم الخطوة المطابقة (نافذة ±١ لانحراف الساعة) أو null. lastStep يمنع إعادة الرمز نفسه.
function verifyTotp(secretB32, code, lastStep, now) {
  const c = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return null;
  const step = Math.floor((now || Date.now()) / 1000 / STEP);
  for (const s of [step - 1, step, step + 1]) {
    if (lastStep != null && s <= lastStep) continue;
    const want = Buffer.from(hotp(secretB32, s));
    if (crypto.timingSafeEqual(want, Buffer.from(c))) return s;
  }
  return null;
}

function otpauthUri(account, secretB32, issuer) {
  const iss = issuer || 'Omran AI';
  return 'otpauth://totp/' + encodeURIComponent(iss + ':' + account) +
    '?secret=' + secretB32 + '&issuer=' + encodeURIComponent(iss) + '&algorithm=SHA1&digits=6&period=' + STEP;
}

const normBackup = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const hashBackup = (c) => crypto.createHash('sha256').update('omran-mfa-backup:' + normBackup(c)).digest('hex');

function genBackupCodes(n) {
  const codes = [];
  for (let i = 0; i < (n || 8); i++) {
    const raw = b32encode(crypto.randomBytes(7)).slice(0, 10);
    codes.push(raw.slice(0, 5) + '-' + raw.slice(5));
  }
  return codes;
}

module.exports = { genSecret, hotp, verifyTotp, otpauthUri, genBackupCodes, hashBackup, normBackup, b32encode, b32decode, STEP };
