// v-real3d: مفتاح خرائط Google للمباني الحقيقيّة ثلاثيّة الأبعاد (Map Tiles API).
// المفتاح يصل المتصفّح بطبيعته (المتصفّح يجلب البلاطات بنفسه)، وحمايته في Google لا هنا:
// مقيَّد بـMap Tiles API وحدها وبنطاقات الموقع ومعايناته. يُقرأ داخل المعالج لا في نطاق الوحدة.
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const key = (process.env.GOOGLE_MAPS_KEY || '').trim();
  if (!key) { res.status(503).json({ error: 'no-key' }); return; }
  res.status(200).json({ key });
};
