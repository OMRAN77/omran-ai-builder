'use strict';
/* api/_lib/_google-token.js — v-google-token (فحص Desloppify ٨ نوفمبر ٢٠٢٦: «Exact dupe cluster — getAccessToken ×3»).
   رمز وصول Gmail قصير من رمز التحديث المحفوظ للمستخدم — كانت نسخة حرفيّة منه في email-list وemail-send وemail-calendar،
   وكلّها تقرأ GOOGLE_CLIENT_ID/SECRET في نطاق الوحدة. هنا نسخة واحدة تقرأ السرّين عند النداء (نقاط api/*.js تُحمَّل في بيئة عارية). */

/** رمز وصول من رمز التحديث؛ يرمي Error(رمز خطأ جوجل أو refresh_failed) كما كانت النسخ تفعل. */
async function refreshGoogleAccessToken(refreshToken) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'refresh_failed');
  return d.access_token;
}

module.exports = { refreshGoogleAccessToken };
