// scripts/build-extension.mjs — يبني إضافة «Om ai» للمتصفّح (Chrome/Edge) من store/chrome/extension:
//   ١) _locales/<لغة>/messages.json من جدول LOCALES أدناه (مصدر النصوص الوحيد، ١٤ لغة)
//   ٢) الأيقونات 16/32/48/128 مصغّرة من icons/icon-512-v2.png (نفس أيقونة التطبيق الذهبيّة)
//   ٣) store/chrome/om-ai-extension.zip جاهز للرفع على متجر Chrome وEdge Add-ons
// التشغيل: node scripts/build-extension.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const extDir = path.join(root, 'store/chrome/extension');
const zipPath = path.join(root, 'store/chrome/om-ai-extension.zip');

// [الوصف، عنوان الزرّ، «اسأل عن»، «لخّص الصفحة»، طلب التلخيص ($URL$)، تلميح شريط العنوان]
// مجلّدات اللغات بأسماء Chrome: الصينيّة zh_CN.
export const LOCALES = {
  en: ['Ask Om ai from any page: select text and right-click, type om and a space in the address bar, or press Alt+O.', 'Open Om ai', 'Ask Om ai about "%s"', 'Summarize this page with Om ai', 'Summarize this page for me: $URL$', 'Om ai: type your question and press Enter'],
  ar: ['اسأل Om ai من أيّ صفحة: حدّد نصًّا واضغط بالزرّ الأيمن، أو اكتب om ثمّ مسافة في شريط العنوان، أو اضغط Alt+O.', 'افتح Om ai', 'اسأل Om ai عن «%s»', 'لخّص هذه الصفحة بـOm ai', 'لخّص لي هذه الصفحة: $URL$', 'Om ai: اكتب سؤالك واضغط Enter'],
  bn: ['যেকোনো পেজ থেকে Om ai-কে জিজ্ঞাসা করুন: লেখা সিলেক্ট করে রাইট-ক্লিক করুন, ঠিকানা বারে om ও একটি স্পেস লিখুন, বা Alt+O চাপুন।', 'Om ai খুলুন', '"%s" সম্পর্কে Om ai-কে জিজ্ঞাসা করুন', 'Om ai দিয়ে এই পেজের সারাংশ', 'এই পেজের সারাংশ দিন: $URL$', 'Om ai: প্রশ্ন লিখে Enter চাপুন'],
  es: ['Pregunta a Om ai desde cualquier página: selecciona texto y clic derecho, escribe om y un espacio en la barra, o pulsa Alt+O.', 'Abrir Om ai', 'Preguntar a Om ai sobre "%s"', 'Resumir esta página con Om ai', 'Resúmeme esta página: $URL$', 'Om ai: escribe tu pregunta y pulsa Enter'],
  fil: ['Magtanong sa Om ai mula sa anumang page: pumili ng teksto at i-right-click, i-type ang om at space sa address bar, o Alt+O.', 'Buksan ang Om ai', 'Tanungin ang Om ai tungkol sa "%s"', 'Ibuod ang page na ito gamit ang Om ai', 'Ibuod mo ang page na ito: $URL$', 'Om ai: i-type ang tanong at pindutin ang Enter'],
  fr: ['Interrogez Om ai depuis toute page : sélectionnez un texte puis clic droit, tapez om et un espace dans la barre, ou Alt+O.', 'Ouvrir Om ai', 'Demander à Om ai à propos de « %s »', 'Résumer cette page avec Om ai', 'Résume-moi cette page : $URL$', 'Om ai : tapez votre question puis Entrée'],
  hi: ['किसी भी पेज से Om ai से पूछें: टेक्स्ट चुनकर राइट-क्लिक करें, एड्रेस बार में om और स्पेस लिखें, या Alt+O दबाएँ।', 'Om ai खोलें', '"%s" के बारे में Om ai से पूछें', 'Om ai से इस पेज का सारांश', 'इस पेज का सारांश दो: $URL$', 'Om ai: अपना सवाल लिखें और Enter दबाएँ'],
  id: ['Tanya Om ai dari halaman mana pun: pilih teks lalu klik kanan, ketik om dan spasi di bilah alamat, atau tekan Alt+O.', 'Buka Om ai', 'Tanya Om ai tentang "%s"', 'Ringkas halaman ini dengan Om ai', 'Ringkaskan halaman ini untukku: $URL$', 'Om ai: ketik pertanyaan lalu tekan Enter'],
  ml: ['ഏത് പേജിൽ നിന്നും Om ai-യോട് ചോദിക്കൂ: ടെക്സ്റ്റ് തിരഞ്ഞെടുത്ത് റൈറ്റ്-ക്ലിക്ക്, വിലാസ ബാറിൽ om + സ്പേസ്, അല്ലെങ്കിൽ Alt+O.', 'Om ai തുറക്കുക', '"%s" എന്നതിനെക്കുറിച്ച് Om ai-യോട് ചോദിക്കുക', 'Om ai ഉപയോഗിച്ച് ഈ പേജ് സംഗ്രഹിക്കുക', 'ഈ പേജ് എനിക്കായി സംഗ്രഹിക്കൂ: $URL$', 'Om ai: ചോദ്യം ടൈപ്പ് ചെയ്ത് Enter അമർത്തുക'],
  ne: ['जुनसुकै पेजबाट Om ai लाई सोध्नुहोस्: टेक्स्ट छानेर राइट-क्लिक, ठेगाना बारमा om र स्पेस, वा Alt+O थिच्नुहोस्।', 'Om ai खोल्नुहोस्', '"%s" बारे Om ai लाई सोध्नुहोस्', 'Om ai बाट यो पेजको सारांश', 'यो पेजको सारांश देऊ: $URL$', 'Om ai: प्रश्न टाइप गरेर Enter थिच्नुहोस्'],
  ru: ['Спросите Om ai с любой страницы: выделите текст и правый клик, введите om и пробел в адресной строке или Alt+O.', 'Открыть Om ai', 'Спросить Om ai о «%s»', 'Кратко пересказать страницу с Om ai', 'Кратко перескажи эту страницу: $URL$', 'Om ai: введите вопрос и нажмите Enter'],
  tr: ['Her sayfadan Om ai’a sorun: metni seçip sağ tıklayın, adres çubuğuna om ve boşluk yazın ya da Alt+O’ya basın.', 'Om ai’ı aç', '"%s" hakkında Om ai’a sor', 'Bu sayfayı Om ai ile özetle', 'Bu sayfayı benim için özetle: $URL$', 'Om ai: sorunuzu yazıp Enter’a basın'],
  ur: ['کسی بھی صفحے سے Om ai سے پوچھیں: متن منتخب کر کے رائٹ کلک کریں، ایڈریس بار میں om اور اسپیس لکھیں، یا Alt+O دبائیں۔', 'Om ai کھولیں', '«%s» کے بارے میں Om ai سے پوچھیں', 'Om ai سے اس صفحے کا خلاصہ', 'اس صفحے کا خلاصہ بتاؤ: $URL$', 'Om ai: اپنا سوال لکھ کر Enter دبائیں'],
  zh_CN: ['在任何网页向 Om ai 提问：选中文字后右键，在地址栏输入 om 加空格，或按 Alt+O。', '打开 Om ai', '向 Om ai 询问“%s”', '用 Om ai 总结此页面', '帮我总结这个页面：$URL$', 'Om ai：输入问题后按 Enter'],
};
const KEYS = ['extDesc', 'actionTitle', 'menuAsk', 'menuSummarize', 'summarizePrompt', 'omniboxHint'];

function writeLocales() {
  const base = path.join(extDir, '_locales');
  fs.rmSync(base, { recursive: true, force: true });
  for (const [lg, texts] of Object.entries(LOCALES)) {
    const msgs = { extName: { message: 'Om ai' } };
    KEYS.forEach((k, i) => { msgs[k] = { message: texts[i] }; });
    msgs.summarizePrompt.placeholders = { url: { content: '$1', example: 'https://example.com' } };
    fs.mkdirSync(path.join(base, lg), { recursive: true });
    fs.writeFileSync(path.join(base, lg, 'messages.json'), JSON.stringify(msgs, null, 2) + '\n');
  }
}

// تصغير بمتوسّط المساحة (box filter) مع ألفا مضروبة مسبقًا — حوافّ نظيفة بلا مكتبة صور.
function downscale(src, size) {
  const out = new PNG({ width: size, height: size });
  const sx = src.width / size, sy = src.height / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * src.width + xx) * 4, al = src.data[i + 3];
          r += src.data[i] * al; g += src.data[i + 1] * al; b += src.data[i + 2] * al; a += al; n++;
        }
      }
      const o = (y * size + x) * 4;
      out.data[o] = a ? Math.round(r / a) : 0;
      out.data[o + 1] = a ? Math.round(g / a) : 0;
      out.data[o + 2] = a ? Math.round(b / a) : 0;
      out.data[o + 3] = Math.round(a / n);
    }
  }
  return out;
}

function writeIcons() {
  const src = PNG.sync.read(fs.readFileSync(path.join(root, 'icons/icon-512-v2.png')));
  const dir = path.join(extDir, 'icons');
  fs.mkdirSync(dir, { recursive: true });
  for (const s of [16, 32, 48, 128]) fs.writeFileSync(path.join(dir, `icon-${s}.png`), PNG.sync.write(downscale(src, s)));
}

function writeZip() {
  fs.rmSync(zipPath, { force: true });
  // -X بلا سمات النظام، والترتيب ثابت — نفس المدخلات تعطي نفس الملفّ.
  const files = execFileSync('find', ['.', '-type', 'f'], { cwd: extDir, encoding: 'utf8' }).split('\n').filter(Boolean).map((f) => f.replace(/^\.\//, '')).sort();
  execFileSync('zip', ['-X', '-q', zipPath, ...files], { cwd: extDir });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  writeLocales();
  writeIcons();
  writeZip();
  console.log('✓ الإضافة: ' + Object.keys(LOCALES).length + ' لغة · ٤ أيقونات · ' + path.relative(root, zipPath) + ' (' + fs.statSync(zipPath).size + ' بايت)');
}
