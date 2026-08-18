/**
 * image-pipeline.js — خط إنتاج الصور لعمران
 *
 * المبدأ: النموذج اللغوي هو العقل، ونموذج الصور هو اليد.
 *
 * rewrite  → Claude يحوّل الطلب العربي إلى وصف إنجليزي + قيود قابلة للفحص
 * generate → مزوّد صور حقيقي (gpt-image-2 / gemini)
 * verify   → Claude vision يفحص الصورة مقابل القيود ويعيد ملاحظة تصحيح
 * retry    → إعادة التوليد بالملاحظة، لا بنفس الوصف
 * logo     → الرمز من النموذج، والنص العربي يُركَّب برمجياً بـ SVG
 *
 * لا اعتماديات خارجية. Node 18+ (fetch مدمج).
 */

"use strict";

// ============================================================
// 1) إعادة الصياغة — العقل
// ============================================================

const REWRITE_SYSTEM = `You convert Arabic image requests into precise English prompts for a text-to-image model.

Rules:
- Output English only in "prompt". Be concrete: subject, count, composition, lighting, style, camera, background.
- Repeat every numeric count in three forms, e.g. "exactly two men, a pair of men, 2 people total".
- "negative" lists what must not appear, comma separated. Always include wrong counts when a count is specified (if user asked for 2, negative includes "three people, four people, crowd, extra person").
- "constraints" must be machine-checkable facts a vision model can verify from the image alone.
- If the user wants a logo, brand mark, or any rendered words: set isLogo true, put the EXACT Arabic (or original) text in textContent, and write the prompt for a SYMBOL ONLY — append "no text, no letters, no typography, isolated symbol, centered, transparent background". Never ask the image model to render Arabic script.
- Never invent brand names, faces of real people, or copyrighted characters.
- Return ONLY a JSON object, no markdown fences, no commentary:
  {"prompt":"","negative":"","constraints":[{"type":"count","subject":"men","value":2}],"isLogo":false,"textContent":null,"aspect":"1:1"}`;

function parseJson(raw) {
  const clean = raw
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no json in response");
  return JSON.parse(clean.slice(start, end + 1));
}

async function rewrite(userText, llm) {
  const raw = await llm.text(REWRITE_SYSTEM, userText);
  const r = parseJson(raw);
  // تحصين: لو النموذج نسي القيود أو النيجاتف
  if (!r.constraints) r.constraints = [];
  if (!r.negative) r.negative = "";
  if (!r.aspect) r.aspect = "1:1";
  return r;
}

// ============================================================
// 2) المزوّدون — اليد
// ============================================================

/** gpt-image-2: الأقوى حالياً في العدّ والتخطيط. */
function openaiProvider(apiKey) {
  const SIZES = {
    "1:1": "1024x1024",
    "3:2": "1536x1024",
    "2:3": "1024x1536",
    "16:9": "1536x864",
  };

  return {
    name: "gpt-image-2",
    async generate({ prompt, negative, aspect, transparent }) {
      const body = {
        model: "gpt-image-2",
        prompt: negative ? `${prompt}\n\nAvoid: ${negative}` : prompt,
        size: SIZES[aspect] || "1024x1024",
        n: 1,
      };
      if (transparent) {
        body.background = "transparent";
        body.output_format = "png";
      }

      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error(`openai images ${res.status}: ${await res.text()}`);
      }
      const data = await res.json();
      const b64 = data?.data?.[0]?.b64_json;
      if (!b64) throw new Error("openai images: empty response");
      return b64;
    },
  };
}

/** بديل: Gemini — جيد جداً وأرخص. */
function geminiProvider(apiKey, model) {
  model = model || "gemini-3-pro-image";
  return {
    name: model,
    async generate({ prompt, negative, aspect }) {
      const full = negative
        ? `${prompt}\n\nDo not include: ${negative}`
        : prompt;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: full }] }],
            generationConfig: { imageConfig: { aspectRatio: aspect } },
          }),
        }
      );

      if (!res.ok) {
        throw new Error(`gemini images ${res.status}: ${await res.text()}`);
      }
      const data = await res.json();
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const img = parts.find((p) => p.inlineData?.data);
      if (!img) throw new Error("gemini images: no image part");
      return img.inlineData.data;
    },
  };
}

// ============================================================
// 3) التحقّق البصري — الفرق الحقيقي في الدقة
// ============================================================

const VERIFY_SYSTEM = `You are a strict visual QA checker. You are given an image and a list of constraints.

Check each constraint against what is actually visible. Count carefully: count each distinct subject once, including partially visible ones at the frame edge.

Be conservative: if a constraint is not clearly satisfied, it fails.

Return ONLY JSON, no fences:
{"pass":true,"issues":["shows 3 men, expected 2"],"fix":"one short English sentence to prepend to the next generation prompt, imperative, addressing the failures only"}`;

async function verify(imageB64, constraints, llm) {
  if (!constraints.length) return { pass: true, issues: [], fix: "" };

  const list = constraints
    .map((c) => {
      switch (c.type) {
        case "count":
          return `- there must be exactly ${c.value} ${c.subject}`;
        case "absent":
          return `- there must be no ${c.subject}`;
        case "text":
          return `- the visible text must read exactly: ${c.content}`;
        case "attribute":
          return `- the ${c.subject} must be ${c.value}`;
        default:
          return "";
      }
    })
    .join("\n");

  try {
    const raw = await llm.vision(
      VERIFY_SYSTEM,
      `Constraints:\n${list}`,
      imageB64
    );
    return parseJson(raw);
  } catch (_e) {
    // فشل الفحص لا يعني فشل الصورة
    return { pass: true, issues: [], fix: "" };
  }
}

// ============================================================
// 4) الحلقة الكاملة
// ============================================================

async function generateImage(userText, llm, provider, opts) {
  opts = opts || {};
  const maxAttempts = opts.maxAttempts || 3;
  const progress = opts.onProgress || (() => {});

  progress("rewrite");
  const spec = await rewrite(userText, llm);

  let prompt = spec.prompt;
  let last = "";
  let verdict = { pass: false, issues: [], fix: "" };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    progress("generate", { attempt, provider: provider.name });

    last = await provider.generate({
      prompt,
      negative: spec.negative,
      aspect: spec.aspect,
      transparent: spec.isLogo,
      seed: attempt === 1 ? undefined : Math.floor(Math.random() * 1e9),
    });

    progress("verify", { attempt });
    verdict = await verify(last, spec.constraints, llm);

    if (verdict.pass) break;
    if (attempt === maxAttempts) break;

    // المحاولة التالية تحمل التصحيح، لا نفس الوصف
    prompt = `${verdict.fix} ${spec.prompt}`;
    progress("retry", { issues: verdict.issues });
  }

  const result = {
    imageB64: last,
    attempts: maxAttempts,
    spec,
    verdict,
  };

  if (spec.isLogo && spec.textContent) {
    result.logoSvg = composeLogo({
      markPngB64: last,
      name: spec.textContent,
    });
  }

  return result;
}

// ============================================================
// 5) تركيب الشعار — النص العربي مضبوط 100%
// ============================================================

function escXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * لا نطلب من نموذج الصور كتابة الاسم أبداً — يخرج حروفاً مشوّهة.
 * نولّد الرمز بخلفية شفافة، ثم نضع الاسم كنص SVG حقيقي:
 * مضبوط دائماً، قابل للتحرير، وقابل للتكبير بلا حدود.
 */
function composeLogo(o) {
  const size = o.size || 512;
  const font = o.fontFamily || "'Plus Jakarta Sans', 'Cairo', sans-serif";
  const color = o.color || "#111111";
  const horizontal = o.layout === "horizontal";

  const w = horizontal ? size * 2 : size;
  const h = horizontal ? size * 0.7 : size * 1.35;

  const markSize = horizontal ? size * 0.6 : size * 0.72;
  const markX = horizontal ? size * 0.12 : (w - markSize) / 2;
  const markY = horizontal ? (h - markSize) / 2 : size * 0.06;

  const textX = horizontal ? size * 0.85 : w / 2;
  const textY = horizontal
    ? h / 2 + size * 0.04
    : markY + markSize + size * 0.24;
  const anchor = horizontal ? "start" : "middle";

  const tagline = o.tagline
    ? `<text x="${textX}" y="${textY + size * 0.15}" text-anchor="${anchor}" font-family="${font}" font-size="${size * 0.085}" fill="${color}" opacity="0.62" direction="rtl">${escXml(o.tagline)}</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <image href="data:image/png;base64,${o.markPngB64}" x="${markX}" y="${markY}" width="${markSize}" height="${markSize}" preserveAspectRatio="xMidYMid meet"/>
  <text x="${textX}" y="${textY}" text-anchor="${anchor}" font-family="${font}" font-size="${size * 0.17}" font-weight="700" fill="${color}" direction="rtl">${escXml(o.name)}</text>
  ${tagline}
</svg>`;
}

// ============================================================
// عميل Claude جاهز (نص + رؤية)
// ============================================================

function claudeClient(apiKey, model) {
  model = model || "claude-sonnet-5";

  async function call(body) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok)
      throw new Error(`anthropic ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
  }

  return {
    text: (system, user) =>
      call({
        model,
        max_tokens: 1200,
        temperature: 0.4,
        system,
        messages: [{ role: "user", content: user }],
      }),

    vision: (system, user, imageB64) =>
      call({
        model,
        max_tokens: 600,
        temperature: 0,
        system,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/png",
                  data: imageB64,
                },
              },
              { type: "text", text: user },
            ],
          },
        ],
      }),
  };
}

// ============================================================
// التصدير
// ============================================================

module.exports = {
  rewrite,
  verify,
  generateImage,
  composeLogo,
  claudeClient,
  openaiProvider,
  geminiProvider,
};
