// 📍 موقع تقريبي من عنوان IP — احتياط لمواقيت الصلاة والقبلة حين يرفض
// المستخدم/الجهاز خدمة الموقع الدقيقة. مجاني بلا مفتاح، ولا يُحفظ شيء.
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  // IP الحقيقي خلف Vercel
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = xf || req.socket.remoteAddress || '';

  try {
    const r = await fetch('https://ipapi.co/' + encodeURIComponent(ip) + '/json/', {
      headers: { 'User-Agent': 'omran-ai-builder' },
      signal: AbortSignal.timeout(6000),
    });
    if (r.ok) {
      const d = await r.json();
      if (typeof d.latitude === 'number' && typeof d.longitude === 'number') {
        res.status(200).json({ lat: d.latitude, lng: d.longitude, city: d.city || '', country: d.country_name || '', source: 'ip' });
        return;
      }
    }
  } catch (e) { /* المزوّد الأول فشل — جرّب الثاني */ }

  try {
    const r2 = await fetch('https://ipwho.is/' + encodeURIComponent(ip), { signal: AbortSignal.timeout(6000) });
    if (r2.ok) {
      const d2 = await r2.json();
      if (d2 && d2.success && typeof d2.latitude === 'number') {
        res.status(200).json({ lat: d2.latitude, lng: d2.longitude, city: d2.city || '', country: d2.country || '', source: 'ip' });
        return;
      }
    }
  } catch (e) { /* كلاهما فشل */ }

  res.status(502).json({ error: 'ip_geo_failed' });
};
