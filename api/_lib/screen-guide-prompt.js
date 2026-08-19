'use strict';
// screen-guide-prompt.js — محرك التعليمة، خالص من I/O، قابل للاختبار.
//
// القرارات الصارمة التي تفرّق هذا المحرك عن غيره:
//   • label.exact = نسخ حرفي مما في الصورة أو وصف الأيقونة. لا اختراع.
//   • بوابة "الطلب الغامض" قبل أي خصم — درس v204 (60 نقطة على قهوة عشوائية).
//   • الشاشة الحساسة = رسالة تحذير ثابتة، لا توجيه.
//   • السجل يمر كنص فقط، الصور لا تُعاد إرسالها أبدًا.
//   • ثقة منخفضة = إسقاط الإطار وحده، التعليمة النصية تبقى.

const BOX_CONFIDENCE_FLOOR = 0.45;

// كلمات دالة على هدف حقيقي (تتجاوز بوابة الغموض إذا وجد منها واحدة على الأقل)
const MEANINGFUL_RE = /[\u0600-\u06ff]{3,}|[a-z]{4,}/i;

const SENSITIVE_AR = 'هذه الشاشة تحتوي على معلومات حساسة (رمز تحقق أو بيانات دفع). لن أوجهك فيها لحماية أمانك.';
const SENSITIVE_EN = 'This screen contains sensitive information (OTP or payment details). I won\'t guide you here for your security.';

function meaningfulWords(text) {
  return MEANINGFUL_RE.test(String(text || ''));
}

function needsMoreInfo(goal) {
  if (!goal || !meaningfulWords(goal)) return true;
  const s = String(goal).trim();
  if (s.length < 5) return true;
  return false;
}

function askMessage(lang) {
  const ar = 'وضّح لي ماذا تريد تفعل بالضبط — مثال: "أبي أغير كلمة المرور" أو "أريد أرجع منتجًا".';
  const en = 'Please describe what you want to do — for example "I want to change my password" or "I need to return a product".';
  return String(lang || 'ar').toLowerCase().startsWith('en') ? en : ar;
}

function historyLines(history) {
  if (!Array.isArray(history) || !history.length) return '';
  const recent = history.slice(-4);
  const lines = recent.map((h, i) => `  Step ${i + 1}: screen="${String(h.screen || '').slice(0, 60)}" instruction="${String(h.instruction || '').slice(0, 120)}"`);
  return '\n\nProgress so far (latest last — do NOT repeat these):\n' + lines.join('\n');
}

function knownAppNote(app) {
  if (!app || typeof app !== 'object') return '';
  const name = String(app.name || '').slice(0, 80);
  const screens = Array.isArray(app.screens) ? app.screens.slice(0, 14).map(s => String(s).slice(0, 60)).filter(Boolean) : [];
  if (!name) return '';
  let note = `\n\nPre-loaded knowledge about this app (${name}):`;
  if (screens.length) note += `\n- Known screens: ${screens.join(' · ')}`;
  if (app.note) note += `\n- Note: ${String(app.note).slice(0, 400)}`;
  note += '\n- This knowledge is a hint, not authority: what is VISIBLE in the screenshot always wins.';
  return note;
}

function buildGuidePrompt(goalText, options) {
  const opts = options || {};
  const isEn = String(opts.lang || 'ar').toLowerCase().startsWith('en');
  const replyLang = isEn ? 'English' : 'Arabic';
  const isStuck = opts.stuck === true;

  const stuckNote = isStuck
    ? '\n\nIMPORTANT: The user has sent the same screen twice. They are stuck. The previous instruction did not work. Offer a DIFFERENT approach — a different button, a different path, or ask for a new screenshot of a different screen.'
    : '';

  return `You are a visual step-by-step guide assistant embedded in Omran AI.
The user sent ONE screenshot of an app and a goal. Return the SINGLE next physical action.

Goal (user's words): "${String(goalText || '').slice(0, 300)}"${knownAppNote(opts.app)}${historyLines(opts.history)}${stuckNote}

Return ONE JSON object only. No markdown, no prose before or after.

Required fields:
{
  "screen": "<name of current screen, max 60 chars, in ${replyLang}>",
  "onTrack": <true|false — is the user on the right path?>,
  "done": <true|false — is the goal already achieved?>,
  "instruction": "<single sentence in ${replyLang}, one physical action, mentions the exact visible label>",
  "label": {
    "exact": "<text or icon description COPIED verbatim from the screenshot — never invented>",
    "translated": "<meaning in ${replyLang} if exact is not in ${replyLang}, else same as exact>"
  },
  "box": { "x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0 },
  "confidence": 0.0,
  "sensitive": <true|false>,
  "stepNumber": 1,
  "totalSteps": 3,
  "askFor": "<if target not visible: short ${replyLang} question asking for the right screen — else null>"
}

Hard rules (violation = wrong answer):
1. label.exact MUST be copied character-for-character from visible text in the screenshot.
   If no text is visible on the target, describe the icon: e.g. "أيقونة الترس أعلى اليمين".
   NEVER translate, normalize, or invent label.exact.
2. box = normalized coordinates (0.0–1.0), origin top-left, covering only the tap target.
3. If the tap target is NOT visible in this screenshot: set instruction="" and put a question in askFor.
4. confidence = your honest estimate that box is correct (0.0–1.0). Low confidence is honest; wrong box is harmful.
5. sensitive=true when: OTP/verification code entry, money transfer confirmation, full card number visible, password entry. When sensitive=true set instruction="" and askFor=null.
6. done=true only when screenshot already shows the goal achieved.
7. onTrack=false when user drifted; instruction must bring them back.
8. instruction: one sentence, second person imperative, mentions label.exact.
9. Never say you are an AI or describe the screenshot as an image.
10. stepNumber/totalSteps: honest estimate of where user is in the flow.`;
}

// تطبيع ردّ النموذج — يُدير الأخطاء الشائعة: ثقة سالبة، إطار خارج الحدود، label مفقود
function normalizeGuideStep(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const step = {
    screen: String(raw.screen || '').slice(0, 80),
    onTrack: raw.onTrack !== false,
    done: raw.done === true,
    instruction: String(raw.instruction || ''),
    label: {
      exact: String((raw.label && raw.label.exact) || raw.instruction || '').slice(0, 120),
      translated: String((raw.label && raw.label.translated) || (raw.label && raw.label.exact) || '').slice(0, 120),
    },
    box: null,
    confidence: 0,
    sensitive: raw.sensitive === true,
    stepNumber: Math.max(1, parseInt(raw.stepNumber, 10) || 1),
    totalSteps: Math.max(1, parseInt(raw.totalSteps, 10) || 3),
    askFor: raw.askFor ? String(raw.askFor).slice(0, 200) : null,
  };

  // حساسة → لا توجيه
  if (step.sensitive) {
    step.instruction = '';
    step.askFor = null;
    step.box = null;
    return step;
  }

  // هدف غير مرئي → سؤال
  if (step.askFor) {
    step.instruction = '';
    step.box = null;
    return step;
  }

  // إطار
  const b = raw.box;
  if (b && typeof b === 'object') {
    const x = parseFloat(b.x) || 0;
    const y = parseFloat(b.y) || 0;
    const w = parseFloat(b.w) || 0;
    const h = parseFloat(b.h) || 0;
    const conf = Math.max(0, Math.min(1, parseFloat(raw.confidence) || 0));
    // إطار صالح: داخل الحدود وثقة كافية
    if (x >= 0 && y >= 0 && w > 0.01 && h > 0.005 && x + w <= 1.02 && y + h <= 1.02 && conf >= BOX_CONFIDENCE_FLOOR) {
      step.box = { x: Math.min(x, 0.98), y: Math.min(y, 0.98), w: Math.min(w, 1 - x), h: Math.min(h, 1 - y) };
      step.confidence = conf;
    }
  }

  return step;
}

module.exports = {
  BOX_CONFIDENCE_FLOOR,
  meaningfulWords,
  needsMoreInfo,
  askMessage,
  normalizeBox: (b, conf) => (b && conf >= BOX_CONFIDENCE_FLOOR ? b : null),
  normalizeGuideStep,
  buildGuidePrompt,
  historyLines,
  SENSITIVE_AR,
  SENSITIVE_EN,
};
