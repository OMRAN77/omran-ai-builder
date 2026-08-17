// api/logos.js — مكتبة شعارات العالم
// actions: search | popular | categories
// المصدر: Wikimedia Commons + قائمة منتقاة يدوياً
require('./_lib/_fetch-timeout.js');
const { withErrorCapture } = require('./_lib/_errors.js');
const { installCors } = require('./_lib/cors.js');

// ── قائمة منتقاة (تظهر قبل البحث) ──────────────────────────────────────────
const CURATED = [
  // ── السعودية ──
  { id:'sa-gov',      cat:'sa',  label:'الحكومة السعودية',            q:'Saudi Arabia coat of arms' },
  { id:'sa-border',   cat:'sa',  label:'حرس الحدود السعودية',          q:'Saudi Border Guard logo' },
  { id:'sa-police',   cat:'sa',  label:'الأمن السعودي',               q:'Saudi Police logo' },
  { id:'sa-national', cat:'sa',  label:'الحرس الوطني السعودي',         q:'Saudi Arabian National Guard' },
  { id:'sa-coast',    cat:'sa',  label:'خفر السواحل السعودية',         q:'Saudi Coast Guard logo' },
  { id:'sa-civil',    cat:'sa',  label:'الدفاع المدني السعودي',        q:'Saudi Civil Defense logo' },
  { id:'sa-passport', cat:'sa',  label:'الجوازات السعودية',            q:'Saudi Directorate of Passports' },
  { id:'sa-customs',  cat:'sa',  label:'الجمارك السعودية',             q:'Zakat Tax Customs Authority Saudi' },
  { id:'sa-moe',      cat:'sa',  label:'وزارة التعليم السعودية',       q:'Saudi Ministry of Education logo' },
  { id:'sa-moh',      cat:'sa',  label:'وزارة الصحة السعودية',         q:'Saudi Ministry of Health logo' },
  { id:'sa-hilal',    cat:'sa',  label:'الهلال الأحمر السعودي',        q:'Saudi Red Crescent Society' },
  // ── الإمارات ──
  { id:'ae-gov',      cat:'ae',  label:'حكومة الإمارات',               q:'United Arab Emirates coat of arms' },
  { id:'ae-dubai-p',  cat:'ae',  label:'شرطة دبي',                    q:'Dubai Police logo' },
  { id:'ae-abudhabi', cat:'ae',  label:'شرطة أبوظبي',                 q:'Abu Dhabi Police logo' },
  { id:'ae-sharjah',  cat:'ae',  label:'شرطة الشارقة',                q:'Sharjah Police logo' },
  { id:'ae-coast',    cat:'ae',  label:'خفر السواحل الإماراتية',       q:'UAE Coast Guard logo' },
  { id:'ae-civil',    cat:'ae',  label:'الدفاع المدني دبي',            q:'Dubai Civil Defense logo' },
  { id:'ae-customs',  cat:'ae',  label:'جمارك دبي',                   q:'Dubai Customs logo' },
  { id:'ae-dnrd',     cat:'ae',  label:'الهوية والجنسية الإماراتية',   q:'UAE Federal Authority Identity Citizenship' },
  // ── الكويت ──
  { id:'kw-gov',      cat:'kw',  label:'حكومة الكويت',                q:'Kuwait coat of arms' },
  { id:'kw-police',   cat:'kw',  label:'شرطة الكويت',                 q:'Kuwait Ministry of Interior logo' },
  { id:'kw-coast',    cat:'kw',  label:'خفر السواحل الكويتية',        q:'Kuwait Coast Guard' },
  // ── قطر ──
  { id:'qa-gov',      cat:'qa',  label:'حكومة قطر',                   q:'Qatar coat of arms' },
  { id:'qa-police',   cat:'qa',  label:'شرطة قطر',                   q:'Qatar Ministry of Interior logo' },
  { id:'qa-2022',     cat:'qa',  label:'كأس العالم 2022',             q:'FIFA World Cup 2022 Qatar logo' },
  // ── البحرين ──
  { id:'bh-gov',      cat:'bh',  label:'حكومة البحرين',               q:'Bahrain coat of arms' },
  { id:'bh-police',   cat:'bh',  label:'شرطة البحرين',                q:'Bahrain Police logo' },
  // ── عُمان ──
  { id:'om-gov',      cat:'om',  label:'حكومة عُمان',                 q:'Oman coat of arms' },
  { id:'om-police',   cat:'om',  label:'شرطة عُمان',                  q:'Royal Oman Police logo' },
  // ── الأردن ──
  { id:'jo-gov',      cat:'jo',  label:'حكومة الأردن',                q:'Jordan coat of arms' },
  { id:'jo-police',   cat:'jo',  label:'الأمن العام الأردني',          q:'Jordan Public Security Directorate' },
  // ── مصر ──
  { id:'eg-gov',      cat:'eg',  label:'حكومة مصر',                   q:'Egypt coat of arms' },
  { id:'eg-police',   cat:'eg',  label:'الشرطة المصرية',              q:'Egyptian Police logo' },
  // ── الاتحادات الرياضية ──
  { id:'fifa',        cat:'sport', label:'FIFA',                      q:'FIFA logo' },
  { id:'afc',         cat:'sport', label:'الاتحاد الآسيوي لكرة القدم', q:'Asian Football Confederation logo' },
  { id:'saff',        cat:'sport', label:'اتحاد كرة القدم الخليجي',   q:'SAFF Gulf football logo' },
  { id:'uaefa',       cat:'sport', label:'اتحاد كرة القدم الإماراتي', q:'UAE Football Association logo' },
  { id:'saudi-fa',    cat:'sport', label:'اتحاد كرة القدم السعودي',   q:'Saudi Arabia Football Federation logo' },
  { id:'al-hilal',    cat:'sport', label:'نادي الهلال',               q:'Al-Hilal FC logo' },
  { id:'al-nassr',    cat:'sport', label:'نادي النصر',                q:'Al-Nassr FC logo' },
  { id:'al-ahly',     cat:'sport', label:'الأهلي',                    q:'Al Ahly SC logo' },
  { id:'al-ain',      cat:'sport', label:'نادي العين',                q:'Al Ain FC logo' },
  { id:'al-jazira',   cat:'sport', label:'نادي الجزيرة',              q:'Al-Jazira Club Abu Dhabi logo' },
  // ── دولي ──
  { id:'un',          cat:'intl',  label:'الأمم المتحدة',              q:'United Nations logo emblem' },
  { id:'interpol',    cat:'intl',  label:'الإنتربول',                  q:'Interpol logo' },
  { id:'arab-league', cat:'intl',  label:'جامعة الدول العربية',        q:'Arab League logo' },
  { id:'gcc',         cat:'intl',  label:'مجلس التعاون الخليجي',      q:'Gulf Cooperation Council logo' },
  { id:'ioc',         cat:'intl',  label:'اللجنة الأولمبية الدولية',   q:'International Olympic Committee logo' },
  { id:'who',         cat:'intl',  label:'منظمة الصحة العالمية',       q:'World Health Organization logo' },
  { id:'red-cross',   cat:'intl',  label:'الصليب الأحمر',             q:'International Red Cross logo' },
  { id:'red-crescent',cat:'intl',  label:'الهلال الأحمر الدولي',      q:'International Red Crescent logo' },
];

const CAT_LABELS = {
  sa:    'السعودية 🇸🇦',
  ae:    'الإمارات 🇦🇪',
  kw:    'الكويت 🇰🇼',
  qa:    'قطر 🇶🇦',
  bh:    'البحرين 🇧🇭',
  om:    'عُمان 🇴🇲',
  jo:    'الأردن 🇯🇴',
  eg:    'مصر 🇪🇬',
  sport: 'الرياضة ⚽',
  intl:  'دولي 🌐',
};

// ── Wikimedia Commons API ────────────────────────────────────────────────────
async function wikiSearch(q, limit = 20) {
  const url = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrnamespace: '6',
    gsrsearch: `${q} logo emblem`,
    gsrlimit: String(Math.min(limit, 30)),
    prop: 'imageinfo',
    iiprop: 'url|size|mime|thumbmime',
    iiurlwidth: '200',
    format: 'json',
    origin: '*',
  });
  const res = await fetch(url, { headers: { 'User-Agent': 'OmranAI/1.0' } });
  if (!res.ok) throw new Error('wiki ' + res.status);
  const j = await res.json();
  const pages = Object.values((j.query || {}).pages || {});
  return pages
    .filter(p => {
      const ii = (p.imageinfo || [])[0] || {};
      const m = ii.mime || '';
      return m === 'image/svg+xml' || m === 'image/png' || m === 'image/jpeg' || m === 'image/webp';
    })
    .map(p => {
      const ii = (p.imageinfo || [])[0] || {};
      return {
        title: p.title.replace(/^File:/i, '').replace(/\.(svg|png|jpg|jpeg|webp)$/i, ''),
        url:   ii.thumburl || ii.url,
        full:  ii.url,
        w:     ii.thumbwidth || ii.width,
        h:     ii.thumbheight || ii.height,
        mime:  ii.mime,
      };
    })
    .filter(x => x.url);
}

module.exports = withErrorCapture('logos', async (req, res) => {
  installCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const action = req.query.action || 'search';

  // ── categories ───────────────────────────────────────────────────────────
  if (action === 'categories') {
    return res.json({ cats: CAT_LABELS });
  }

  // ── popular (قائمة منتقاة + بحث ويكيميديا للكل أو لفئة) ──────────────────
  if (action === 'popular') {
    const cat = (req.query.cat || '').toLowerCase();
    const list = cat ? CURATED.filter(x => x.cat === cat) : CURATED;
    // نُعيد القائمة فقط (بدون صور) ليختار منها العميل
    return res.json({ items: list.map(x => ({ id: x.id, cat: x.cat, label: x.label })) });
  }

  // ── search ────────────────────────────────────────────────────────────────
  if (action === 'search') {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(400).json({ error: 'q مطلوب' });

    // ابحث في القائمة المنتقاة أولاً
    const curated = CURATED.filter(x =>
      x.label.includes(q) || x.id.includes(q.toLowerCase()) || x.q.toLowerCase().includes(q.toLowerCase())
    );

    // ثم ويكيميديا
    const wiki = await wikiSearch(q, 20);
    return res.json({ curated, wiki });
  }

  // ── resolve (جلب صورة لعنصر منتقى بـ id) ─────────────────────────────────
  if (action === 'resolve') {
    const id = String(req.query.id || '').trim();
    const item = CURATED.find(x => x.id === id);
    if (!item) return res.status(404).json({ error: 'id غير موجود' });
    const wiki = await wikiSearch(item.q, 6);
    return res.json({ id, label: item.label, results: wiki });
  }

  return res.status(400).json({ error: 'action غير معروف' });
});
