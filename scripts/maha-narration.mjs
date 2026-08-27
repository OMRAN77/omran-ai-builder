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

const LINES = {
  'intro-ar-short': { lang: 'ar', text:
    'عمران إيه آي، مساعدك الذكي اللي يشتغل، مو بس يتكلم. اكتب طلبك بالعربي، وشوف تطبيقك يُبنى قدام عينك بمعاينة حية. صمم ديكور بيتك، وشوفه قبل وبعد. وتدرب على الأسهم بأموال افتراضية وأسعار حقيقية. وكلم مها بصوتك، تشوف وتساعدك في كل شي. عمران إيه آي، صُنع في الإمارات. حمّله الآن مجانًا.' },
  'intro-ar-long': { lang: 'ar', text:
    'عمران إيه آي، مساعدك الذكي اللي يشتغل، مو بس يتكلم. اكتب طلبك بالعربي، وشوف تطبيقك يُبنى قدام عينك بمعاينة حية. جرب الديكور: اختر نمطك من عشرات التصاميم، وشوف غرفتك قبل وبعد. خطط بيتك في قسم المقاولات، وامش داخله بجولة ثلاثية الأبعاد قبل ما يُبنى. حول أي درس لتجربة تفاعلية يلعب فيها أولادك ويتعلمون. وتدرب على الأسهم بمئة ألف افتراضية وأسعار حقيقية. شغل الوكيل الذكي، يخطط وينفذ ويختبر بنفسه. وكلم مها بصوتك، تشوف وتساعدك في كل شي. عمران إيه آي، صُنع في الإمارات. حمّله الآن مجانًا.' },
  'intro-en-short': { lang: 'en', text:
    'Omran AI, the assistant that gets things done, not just talks. Type your idea in plain words, and watch your app come to life with a live preview. Redesign your home, and see it before and after. Practice trading with virtual money and real market prices. And talk to Maha, your voice assistant that sees and helps. Omran AI, made in the UAE. Download it free today.' },
  'intro-en-long': { lang: 'en', text:
    'Omran AI, the assistant that gets things done, not just talks. Type your idea in plain words, and watch your app being built in front of you, with a live preview. Try the decor studio: pick from dozens of styles, and see your room before and after. Plan your home in the construction studio, then walk inside it in 3D before it is ever built. Turn any lesson into an interactive lab your kids can play with. Practice the stock market with one hundred thousand in virtual money and real live prices. Switch on the smart agent: it plans, builds, and tests on its own. And talk to Maha, your voice assistant that sees and helps. Omran AI, made in the UAE. Download it free today.' },
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
      const r = await post('/api/tts', { voice: 'maha', gender: 'female', lang: l.lang, text: l.text, token });
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
