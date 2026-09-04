// v-video-trends: قوالب ترندات الفيديو (١٨) — الأمر النهائي يُبنى هنا من قالب الترند ومدخلات المستخدم
'use strict';
const TRENDS = {
 "pixarstory": {
  "engine": "veo",
  "ratio": "1280:720",
  "photo": "opt",
  "kind": "name",
  "prompt": "Pixar-style 3D animated scene {i} of 3: {scene}. Main character: a cheerful child named {name}{look}, the SAME character design in every scene. Warm cinematic lighting, expressive faces, gentle camera movement, soft family music, short Arabic narration voice-over.",
  "scenes": [
   "{name} wakes up smiling to the alarm clock, gets dressed quickly and eats breakfast with the family in a sunny kitchen",
   "{name} arrives at school, greets friends in a bright classroom, raises a hand happily and plays at recess",
   "{name} returns home in the evening and sits with the family in the living room, laughing and sharing the day, warm lamp light"
  ],
  "preview": {
   "frame": "Pixar-style 3D animated still of a cheerful boy stretching happily in a sunlit bedroom, breakfast tray nearby, warm morning light",
   "gender": "m"
  }
 },
 "pixarsketch": {
  "engine": "veo",
  "ratio": "720:1280",
  "photo": "none",
  "kind": "scene",
  "prompt": "Pixar-style 3D animated comedy sketch: {text}. Characters with Gulf Arab features and traditional clothing (abaya, hijab, kandora), exaggerated funny expressions, lip-synced dialogue in Gulf Arabic dialect, two or three shots, warm interior lighting, comedic timing, no subtitles.",
  "scenes": null,
  "preview": {
   "frame": "Pixar-style 3D animated still of two Gulf Arab women in hijab laughing in a school office, exaggerated funny expressions",
   "gender": "w"
  }
 },
 "heritagesing": {
  "engine": "veo",
  "ratio": "720:1280",
  "photo": "req",
  "kind": "sentence",
  "prompt": "Photorealistic cinematic video: the person from the reference image stands in an old Arabian souq decorated with festive lanterns and bunting, a crowd clapping softly behind, singing joyfully in Arabic: '{text}'. Lip-synced singing, close-up then medium shot, golden-hour light, shallow depth of field, celebratory ambience.",
  "scenes": null,
  "preview": {
   "frame": "photorealistic cinematic still of a toddler in an embroidered white kandora smiling in an old Arabian souq with festive lanterns and clapping crowd, golden light",
   "gender": "w"
  }
 },
 "hugyounger": {
  "engine": "veo",
  "ratio": "720:1280",
  "photo": "req",
  "kind": "none",
  "prompt": "Photorealistic emotional video: the adult from the reference image meets their own younger childhood self in a warm sunlit living room; they smile, kneel and embrace gently. Slow camera push-in, soft piano music, natural skin, same face and clothing as the reference.",
  "scenes": null,
  "preview": {
   "frame": "photorealistic still of a young Arab man kneeling and hugging a small child version of himself in a sunlit living room, emotional",
   "gender": "m"
  }
 },
 "oldphoto": {
  "engine": "veo",
  "ratio": "720:1280",
  "photo": "req",
  "kind": "none",
  "prompt": "Bring this old photograph to life: the person subtly breathes, blinks, smiles warmly and turns slightly toward the camera, then says a short heartfelt greeting in Arabic. Keep the original look, natural film grain, respectful and realistic, gentle nostalgic music.",
  "scenes": null,
  "preview": {
   "frame": "vintage sepia-toned photorealistic portrait still of an elderly Arab man smiling warmly at the camera, film grain",
   "gender": "m"
  }
 },
 "tencountries": {
  "engine": "veo",
  "ratio": "720:1280",
  "photo": "req",
  "kind": "none",
  "prompt": "Fast rhythmic travel montage: the person from the reference image (same face, same outfit) appears in famous world locations one after another: Dubai Burj Khalifa, Paris Eiffel Tower, Tokyo neon street, New York Times Square, Istanbul Bosphorus, Cairo pyramids, London Big Ben, Rome Colosseum, Maldives beach, Swiss Alps. Quick cuts, upbeat music, photorealistic.",
  "scenes": null,
  "preview": {
   "frame": "photorealistic still of a young Arab woman in hijab smiling in front of the Eiffel Tower, travel vlog style",
   "gender": "w"
  }
 },
 "babyversion": {
  "engine": "veo",
  "ratio": "720:1280",
  "photo": "req",
  "kind": "none",
  "prompt": "Transform the person from the reference image into an adorable toddler version of themselves wearing an oversized version of their own outfit, giggling and waving in a bright studio, playful music, photorealistic, same facial features.",
  "scenes": null,
  "preview": {
   "frame": "photorealistic still of an adorable toddler wearing an oversized white kandora and tiny ghutra, giggling in a bright studio",
   "gender": "m"
  }
 },
 "outfitswap": {
  "engine": "veo",
  "ratio": "720:1280",
  "photo": "req",
  "kind": "none",
  "prompt": "The person from the reference image stands in a studio while their outfit changes five times in quick snap transitions: elegant evening wear, traditional Gulf attire, sporty, business, casual street style. Same face and pose, studio lighting, upbeat music.",
  "scenes": null,
  "preview": {
   "frame": "photorealistic studio still of a young Arab woman mid-transition between an elegant evening gown and traditional attire, motion blur sparkle",
   "gender": "w"
  }
 },
 "productad": {
  "engine": "veo",
  "ratio": "1280:720",
  "photo": "req",
  "kind": "product",
  "prompt": "Cinematic product commercial for {text}, using the exact product from the reference image: dramatic macro shots, slow orbiting camera, light sweeps and floating particles, premium dark studio, elegant sound design, no text overlays.",
  "scenes": null,
  "preview": {
   "frame": "photorealistic cinematic still of a luxury perfume bottle on a dark glossy surface with golden light sweeps and particles",
   "gender": "w"
  }
 },
 "beforeafter": {
  "engine": "veo",
  "ratio": "720:1280",
  "photo": "req",
  "kind": "change",
  "prompt": "Smooth cinematic before-and-after transformation of the reference image: {text}. A soft light wipe reveals the after version, satisfying, realistic, subtle camera drift, uplifting music.",
  "scenes": null,
  "preview": {
   "frame": "photorealistic split still of a living room half plain and half beautifully redesigned with a glowing light wipe between them",
   "gender": "w"
  }
 },
 "talkingpet": {
  "engine": "veo",
  "ratio": "720:1280",
  "photo": "req",
  "kind": "sentence",
  "prompt": "The animal from the reference image talks with realistic lip movement, saying in Arabic: '{text}'. Funny and charming, subtle head movements, natural home setting, soft ambient sound.",
  "scenes": null,
  "preview": {
   "frame": "photorealistic still of a fluffy cat with its mouth slightly open as if speaking, cozy living room",
   "gender": "w"
  }
 },
 "ghibli": {
  "engine": "veo",
  "ratio": "720:1280",
  "photo": "req",
  "kind": "none",
  "prompt": "Transform the reference image into a hand-painted Studio Ghibli-style animated scene: wind moves the hair and clothes, clouds drift, grass sways, soft watercolor light, gentle orchestral music, same person recognizable.",
  "scenes": null,
  "preview": {
   "frame": "Studio Ghibli-style hand-painted anime still of a young woman in hijab standing in a windy green meadow under drifting clouds",
   "gender": "w"
  }
 },
 "dance": {
  "engine": "veo",
  "ratio": "720:1280",
  "photo": "req",
  "kind": "none",
  "prompt": "The person from the reference image performs an energetic trendy dance routine in place, natural full-body motion, studio with colorful stage lighting, upbeat music, same face and outfit.",
  "scenes": null,
  "preview": {
   "frame": "photorealistic still of a young man mid-dance move under colorful stage lights in a studio",
   "gender": "m"
  }
 },
 "productfly": {
  "engine": "veo",
  "ratio": "1280:720",
  "photo": "req",
  "kind": "none",
  "prompt": "The product from the reference image floats and slowly spins in mid-air with splashes of water and glowing light particles, seamless loop feel, luxury advertisement look, dark glossy background, elegant sound design.",
  "scenes": null,
  "preview": {
   "frame": "photorealistic still of a luxury watch floating mid-air with water splash and light particles on a dark glossy background",
   "gender": "w"
  }
 },
 "agejourney": {
  "engine": "veo",
  "ratio": "720:1280",
  "photo": "req",
  "kind": "none",
  "prompt": "Continuous time-lapse of the person from the reference image aging naturally from a young child to an elderly person in one shot, same identity and features, soft crossfades, emotional piano music, photorealistic.",
  "scenes": null,
  "preview": {
   "frame": "photorealistic triptych-style still showing the same Arab man as a child, an adult and an elder side by side",
   "gender": "m"
  }
 },
 "celebselfie": {
  "engine": "veo",
  "ratio": "720:1280",
  "photo": "req",
  "kind": "setting",
  "prompt": "The person from the reference image records a smiling selfie-style video at {text}: a glamorous gala with a red carpet and photographers' flashes behind, confident, handheld camera feel, festive atmosphere, photorealistic.",
  "scenes": null,
  "preview": {
   "frame": "photorealistic selfie-style still of a young Arab woman smiling on a red carpet with camera flashes behind",
   "gender": "w"
  }
 },
 "asmr": {
  "engine": "veo",
  "ratio": "1280:720",
  "photo": "req",
  "kind": "none",
  "prompt": "Soft ASMR-style close-up video of the product from the reference image: slow gentle handling, light tapping and unboxing sounds, macro details, calm pastel background, no talking, no text.",
  "scenes": null,
  "preview": {
   "frame": "photorealistic macro still of hands gently unboxing a skincare product on a pastel table, soft light",
   "gender": "w"
  }
 },
 "eidgreeting": {
  "engine": "veo",
  "ratio": "720:1280",
  "photo": "opt",
  "kind": "name",
  "prompt": "Festive Eid greeting video: the person (from the reference image if provided) in elegant Eid attire waves warmly and says in Arabic 'عيد مبارك {name}', decorated background with lanterns and a crescent moon, joyful music, elegant animated Arabic calligraphy 'عيد مبارك' appears.",
  "scenes": null,
  "preview": {
   "frame": "photorealistic festive still of a smiling Arab family in Eid attire with lanterns and crescent decorations, golden light",
   "gender": "m"
  }
 }
};
function clean(s) { return String(s || '').replace(/[\r\n]+/g, ' ').replace(/["`\\<>]/g, '').trim().slice(0, 240); }
/** يبني أمر الفيديو لترند معيّن. params: {name, text, sceneIndex, hasImage} */
function buildTrendPrompt(key, params) {
  const t = TRENDS[key];
  if (!t) return null;
  const p = params || {};
  const name = clean(p.name) || clean(p.text) || '';
  const text = clean(p.text) || clean(p.name) || '';
  let prompt = t.prompt;
  if (t.scenes && t.scenes.length) {
    const i = Math.max(0, Math.min(t.scenes.length - 1, parseInt(p.sceneIndex, 10) || 0));
    const scene = t.scenes[i].replace(/\{name\}/g, name || 'the child');
    prompt = prompt.replace('{i}', String(i + 1)).replace('{scene}', scene)
      .replace('{look}', p.hasImage ? ' whose look is based on the reference image, rendered in Pixar 3D style' : '');
  }
  prompt = prompt.replace(/\{name\}/g, name).replace(/\{text\}/g, text || 'a joyful moment');
  return { prompt, engine: t.engine, ratio: t.ratio, sceneCount: (t.scenes && t.scenes.length) || 1 };
}
module.exports = { TRENDS, buildTrendPrompt };
