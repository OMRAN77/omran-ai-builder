// scripts/maha-narration.mjs — توليد تعليق مها الصوتي للفيديوهات التعريفية
// عبر /api/tts على الإنتاج (صوت فاطمة الإماراتية) — المفاتيح تبقى في الخادم.
// حساب فحص مؤقت (zzcheck…) يُحذف من لوحة الإدارة متى شئت.
//
//   node scripts/maha-narration.mjs [BASE_URL]
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = (process.argv[2] || 'https://omran-ai-builder.vercel.app').replace(/\/$/, '');
const t0 = Date.now();
const el = () => String(Date.now() - t0).padStart(6, ' ') + 'ms';

// v-tts-promo: أداء إعلاني متحمس عبر gpt-4o-mini-tts الموجَّه بالتعليمات —
// طلب عمران: «الفيديو مش محفز والصوت مش جميل».
const STYLE_AR = 'Energetic, exciting Arabic app-launch ad narrator. Young warm female voice, big smile in the voice, fast confident upbeat pace with punchy emphasis on key words. Natural Gulf Arabic pronunciation. Sounds thrilled, never flat or robotic.';
const STYLE_EN = 'Energetic, exciting app-launch ad narrator. Young warm female voice, big smile in the voice, fast confident upbeat pace with punchy emphasis. Sounds thrilled, never flat.';
const LINES = {
  'intro-ar-short': { lang: 'ar', style: STYLE_AR, text:
    'تخيّل تكتب فكرتك… ويصير عندك تطبيق! هذا عمران إيه آي! اكتب طلبك بالعربي، وشوفه يُبنى قدّام عينك، حي ومباشر! صمّم ديكور بيتك، وشوفه قبل وبعد! تدرّب على الأسهم بفلوس افتراضية وأسعار حقيقية! وكلّم مها بصوتك، تشوف وتساعدك بكل شي! عمران إيه آي، صُنع في الإمارات. حمّله الحين، مجانًا!' },
  'intro-ar-long': { lang: 'ar', style: STYLE_AR, text:
    'تخيّل تكتب فكرتك… ويصير عندك تطبيق! هذا عمران إيه آي! اكتب طلبك بالعربي، وشوفه يُبنى قدّام عينك، حي ومباشر! جرّب الديكور: عشرات الأنماط، وغرفتك قبل وبعد! خطّط بيتك، وامشِ داخله بجولة ثلاثية الأبعاد قبل ما يُبنى! حوّل أي درس للعبة تفاعلية يتعلم منها أولادك! تدرّب على الأسهم بمئة ألف افتراضية وأسعار حقيقية! شغّل الوكيل الذكي: يخطط، ينفّذ، ويختبر بنفسه! وكلّم مها بصوتك، تشوف وتساعدك بكل شي! عمران إيه آي، صُنع في الإمارات. حمّله الحين، مجانًا!' },
  'intro-en-short': { lang: 'en', style: STYLE_EN, text:
    'Imagine typing your idea… and getting a real app! This is Omran AI! Type it in plain words, and watch it come to life, right in front of you! Redesign your home, before and after! Practice trading with virtual money and real live prices! And talk to Maha, your voice assistant that sees and helps! Omran AI, made in the UAE. Download it now, for free!' },
  'intro-en-long': { lang: 'en', style: STYLE_EN, text:
    'Imagine typing your idea… and getting a real app! This is Omran AI! Type it in plain words, and watch it being built right in front of you, live! Try the decor studio: dozens of styles, your room before and after! Plan your home, then walk inside it in 3D before it is ever built! Turn any lesson into an interactive game your kids learn from! Practice the stock market with one hundred thousand in virtual money and real live prices! Switch on the smart agent: it plans, builds, and tests on its own! And talk to Maha, your voice assistant that sees and helps! Omran AI, made in the UAE. Download it now, for free!' },
};

const post = async (path, payload) => {
  const r = await fetch(BASE + path, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return r;
};

const user = 'zzcheck' + randomBytes(4).toString('hex');
const pw = randomBytes(16).toString('base64url'); // لا يُطبع أبدًا
console.log('① حساب فحص (' + user + ')');
const su = await post('/api/account?action=auth', { action: 'signup', username: user, password: pw, lang: 'ar' });
const suj = await su.json().catch(() => null);
const token = suj && suj.token;
if (!token) { console.log('✗ التسجيل فشل: HTTP ' + su.status); process.exit(1); }
console.log(el(), '✓ توكن جاهز');

mkdirSync('narration', { recursive: true });
let failed = 0;
for (const [name, l] of Object.entries(LINES)) {
  let ok = false;
  for (let a = 1; a <= 3 && !ok; a++) {
    try {
      const r = await post('/api/tts', { voice: 'coral', model: 'gpt-4o-mini-tts', instructions: l.style, lang: l.lang, text: l.text, token });
      const buf = Buffer.from(await r.arrayBuffer());
      const isMp3 = r.ok && buf.length > 20000 && (buf[0] === 0x49 || buf[0] === 0xff); // ID3 أو إطار MP3
      if (isMp3) {
        writeFileSync('narration/' + name + '.mp3', buf);
        console.log(el(), '✓ ' + name + ' — ' + Math.round(buf.length / 1024) + 'KB');
        ok = true;
      } else {
        console.log(el(), '… ' + name + ' محاولة ' + a + ' — HTTP ' + r.status + ' ' + buf.length + 'b ' + buf.toString('utf8', 0, 120).replace(/[\r\n]+/g, ' '));
        await new Promise((res) => setTimeout(res, 5000 * a));
      }
    } catch (e) {
      console.log(el(), '… ' + name + ' محاولة ' + a + ' — ' + (e && e.message));
      await new Promise((res) => setTimeout(res, 5000 * a));
    }
  }
  if (!ok) failed++;
}
console.log('· احذف حساب الفحص ' + user + ' من لوحة الإدارة متى شئت.');
if (failed) { console.log('✗ ' + failed + '/4 فشلت'); process.exit(2); }
console.log('✓ التعليق الصوتي الأربعة جاهز');
