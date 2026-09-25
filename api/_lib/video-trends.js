// v-video-trends: قوالب ترندات الفيديو — الأمر النهائي يُبنى هنا من قالب الترند ومدخلات المستخدم
// v-trends-more (٢٤ سبتمبر): ٢٥ ← ٤٥ ترندًا. كلّ ترند: محرّك ونسبة وحاجة الصورة ونوع المدخل وقالب الأمر وإطار المعاينة.
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
 },
 "drone": {
  "engine": "veo",
  "ratio": "1280:720",
  "photo": "req",
  "kind": "none",
  "prompt": "Cinematic aerial drone footage starting exactly from the reference image: the camera lifts off smoothly, rises high and slowly orbits the location revealing the surroundings from above, stabilized gimbal motion, golden-hour light, gentle wind, realistic scale, subtle ambient sound, 4K look, no text.",
  "scenes": null,
  "preview": {
   "frame": "photorealistic aerial drone still of a modern white villa with a pool seen from above at golden hour",
   "gender": "m"
  }
 },
 "orbit360": {
  "engine": "veo",
  "ratio": "720:1280",
  "photo": "req",
  "kind": "none",
  "prompt": "Smooth 360-degree orbit camera move around the subject of the reference image, the subject stays still and centered, background parallax, consistent lighting, cinematic depth of field, seamless loop feel, photorealistic, no text.",
  "scenes": null,
  "preview": {
   "frame": "photorealistic still of a young Arab man standing still in a studio while a motion-blurred camera orbit circles around him",
   "gender": "m"
  }
 },
 "timecapsule": {
  "engine": "veo",
  "ratio": "720:1280",
  "photo": "req",
  "kind": "none",
  "prompt": "Photorealistic emotional video: the person from the reference image today stands beside their own future self from the year 2050 - the SAME identity aged realistically (gray hair, softened mature features, dignified posture, elegant clothes). They turn to face each other and smile warmly; the older self places a hand on the younger one's shoulder. Slow cinematic push-in, warm nostalgic light, natural skin texture, no text.",
  "scenes": null,
  "preview": {
   "frame": "photorealistic still of a young Arab man standing beside his realistically aged 2050 self with gray hair, hand on shoulder, warm nostalgic light",
   "gender": "m"
  }
 },
 "bullettime": {
  "engine": "veo",
  "ratio": "1280:720",
  "photo": "req",
  "kind": "none",
  "prompt": "Matrix-style bullet-time shot: the subject of the reference image is frozen mid-action inside a completely time-frozen scene - suspended water droplets, floating dust and debris hanging motionless in the air - while the camera sweeps a smooth 360-degree cinematic arc around them. Photorealistic, dramatic rim lighting, shallow depth of field, film grain, no text.",
  "scenes": null,
  "preview": {
   "frame": "photorealistic bullet-time still of a young Arab man frozen mid-jump surrounded by suspended water droplets while a motion-blurred camera arcs around him, dramatic rim light",
   "gender": "m"
  }
 },
 "movieposter": {
  "engine": "veo",
  "ratio": "720:1280",
  "photo": "req",
  "kind": "name",
  "prompt": "Cinematic motion poster: the person from the reference image as the movie star of a dramatic blockbuster film poster titled '{text}' - epic stormy backdrop, drifting smoke and light rays animating subtly, lens flares sweeping, the bold glowing title '{text}' and a small credits block at the bottom, the SAME face as the reference. Vertical poster framing, blockbuster color grade, slow majestic camera drift.",
  "scenes": null,
  "preview": {
   "frame": "cinematic Hollywood movie poster still of a determined young Arab man in a dark coat, epic stormy backdrop, glowing bold title text and credits block, lens flare",
   "gender": "m"
  }
 },
 "materialize": {
  "engine": "veo",
  "ratio": "1280:720",
  "photo": "req",
  "kind": "product",
  "prompt": "High-end product commercial: the exact product from the reference image materializes gradually from thousands of swirling golden particles and fine sand that spiral inward and assemble into the product, which settles softly onto a minimal dark studio pedestal with a gentle glow pulse. Macro detail, slow motion, elegant dark background, soft spotlight, no text.",
  "scenes": null,
  "preview": {
   "frame": "luxury commercial still of a perfume bottle half-formed from swirling golden particles and sand spiraling inward over a dark studio pedestal, macro detail",
   "gender": "m"
  }
 },
 "parallaxpop": {
  "engine": "veo",
  "ratio": "720:1280",
  "photo": "req",
  "kind": "none",
  "prompt": "2.5D parallax animation of the reference image: the still photo separates into layered depth planes - the foreground subject pops gently toward the camera while background layers drift slowly with realistic depth parallax, subtle dust particles floating between the layers, smooth camera sway, the subject stays crisp and unchanged, dreamy cinematic feel, no text.",
  "scenes": null,
  "preview": {
   "frame": "2.5D parallax art still of a portrait photo separating into floating three-dimensional layers with depth, dust particles between layers, dreamy light",
   "gender": "m"
  }
 },
 "realtour": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "none",
   "prompt": "Cinematic real-estate walkthrough of the exact property in the reference image: a smooth gimbal camera glides forward through the space, revealing the living area, the windows and the view, natural daylight pouring in, realistic materials and furniture unchanged from the reference, slow steady motion, shallow depth of field, calm premium music, no text, no people.",
   "scenes": null,
   "preview": {
     "frame": "cinematic real-estate still of a bright modern living room with floor-to-ceiling windows and a city view, gimbal walkthrough perspective",
     "gender": "m"
   }
 },
 "carreveal": {
   "engine": "veo",
   "ratio": "1280:720",
   "photo": "req",
   "kind": "none",
   "prompt": "Luxury car reveal commercial: the exact vehicle from the reference image sits in a dark studio; overhead light bars sweep across the bodywork revealing its lines, the camera orbits slowly from the front three-quarter to the rear, reflections travel along the paint, faint haze on a polished floor, deep cinematic contrast, no text, no people.",
   "scenes": null,
   "preview": {
     "frame": "luxury automotive commercial still of a dark SUV in a black studio with light bars sweeping across the glossy bodywork, reflections on polished floor",
     "gender": "m"
   }
 },
 "agentpitch": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "sentence",
   "prompt": "Vertical social-media clip: the person from the reference image stands confidently in front of a modern property, looks at the camera and says clearly in Arabic: '{text}'. Lip-synced natural speech, friendly professional tone, medium shot, bright daylight, soft background blur, same face and clothing as the reference, no text overlay.",
   "scenes": null,
   "preview": {
     "frame": "photorealistic still of a confident Arab man in a white shirt speaking to camera in front of a modern villa, bright daylight, vertical social video",
     "gender": "m"
   }
 },
 "foodsizzle": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "product",
   "prompt": "Appetising food commercial of {text}: extreme macro of the exact dish from the reference image, steam rising slowly, a droplet falling in slow motion, glossy sauce catching warm light, the camera drifts in a slow arc across the plate, shallow depth of field, rich saturated colours, no text, no hands.",
   "scenes": null,
   "preview": {
     "frame": "macro food commercial still of a steaming grilled meat platter with rice, glossy sauce and rising steam under warm light",
     "gender": "m"
   }
 },
 "buildprogress": {
   "engine": "veo",
   "ratio": "1280:720",
   "photo": "req",
   "kind": "none",
   "prompt": "Construction progress morph: the building in the reference image starts as a bare concrete shell with scaffolding, then time-lapses smoothly into the finished, painted and landscaped building with lit windows, camera locked on the same angle throughout, clouds racing overhead, day turning to evening, photorealistic, no text.",
   "scenes": null,
   "preview": {
     "frame": "photorealistic still of a residential building half concrete shell with scaffolding and half finished with landscaping, split time-lapse feel",
     "gender": "m"
   }
 },
 "testimonial": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "sentence",
   "prompt": "Warm customer testimonial clip: the person from the reference image sits in a bright, tidy interior, smiles at the camera and says sincerely in Arabic: '{text}'. Lip-synced natural speech, honest friendly delivery, soft window light, shallow depth of field, same face and clothing as the reference, no text overlay.",
   "scenes": null,
   "preview": {
     "frame": "photorealistic still of a smiling Arab woman in hijab speaking warmly to camera in a bright modern interior, soft window light",
     "gender": "w"
   }
 },
 "offercountdown": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "product",
   "prompt": "High-energy promo for {text}: the exact product from the reference image sits centre frame on a clean pedestal while a large glowing countdown ticks down behind it, light streaks sweep past, a bold circular discount badge snaps into the corner with a punch, dynamic camera push-in, vivid contrast, no readable text or numbers other than the countdown digits.",
   "scenes": null,
   "preview": {
     "frame": "energetic product promo still of a boxed product on a pedestal with a glowing countdown and light streaks, bold discount badge",
     "gender": "m"
   }
 },
 "graduation": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "name",
   "prompt": "Joyful graduation moment: the person from the reference image wears a graduation gown and cap, throws the cap into the air in slow motion while golden confetti falls, friends cheering softly out of focus behind, campus lawn at golden hour, an elegant Arabic greeting card with the name {name} appears gently at the end, photorealistic, warm uplifting music.",
   "scenes": null,
   "preview": {
     "frame": "photorealistic still of a young Arab graduate in gown and cap throwing the cap into the air with golden confetti at sunset on a campus lawn",
     "gender": "m"
   }
 },
 "newborn": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "name",
   "prompt": "Tender newborn announcement: the baby from the reference image sleeps peacefully wrapped in a soft blanket, gentle breathing, tiny fingers moving slightly, soft diffused window light, dust motes floating, a delicate Arabic card with the name {name} fades in at the end, photorealistic, calm lullaby music, no text other than the card.",
   "scenes": null,
   "preview": {
     "frame": "photorealistic still of a sleeping newborn wrapped in a soft cream blanket in gentle window light, dust motes floating",
     "gender": "w"
   }
 },
 "wedding": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "none",
   "prompt": "Cinematic wedding film moment: the couple from the reference image in slow motion as rose petals drift around them, warm bokeh string lights behind, the camera circles slowly and pushes in, elegant soft focus, golden warm grade, romantic orchestral music, photorealistic, faces and clothing unchanged from the reference, no text.",
   "scenes": null,
   "preview": {
     "frame": "cinematic wedding still of an elegantly dressed couple in slow motion with rose petals and warm bokeh string lights behind them",
     "gender": "w"
   }
 },
 "ramadan": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "opt",
   "kind": "name",
   "prompt": "Ramadan greeting scene: an ornate brass lantern glows in the foreground, a crescent moon hangs in a deep blue sky, a beautifully set iftar table with dates and water waits below, gentle particles of light drift upward, the camera rises slowly, an elegant Arabic greeting with the name {name} appears softly at the end, warm spiritual ambience, no other text.",
   "scenes": null,
   "preview": {
     "frame": "warm Ramadan still of an ornate brass lantern glowing beside a crescent moon over a set iftar table with dates, deep blue night",
     "gender": "m"
   }
 },
 "nationalday": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "none",
   "prompt": "National Day celebration: the person from the reference image stands proudly as UAE flags wave in the wind behind them, fireworks bloom in the evening sky, confetti in national colours drifts down, the camera pushes in slowly, festive uplifting music, photorealistic, same face and clothing as the reference, no text.",
   "scenes": null,
   "preview": {
     "frame": "photorealistic still of a person in traditional Gulf dress with UAE flags waving and fireworks blooming in the evening sky",
     "gender": "m"
   }
 },
 "familywave": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "none",
   "prompt": "Bring this family photograph to life: every person subtly breathes, blinks, turns slightly to each other, breaks into a warm smile and waves at the camera together, natural micro-movements only, identities, faces, clothing and background exactly as in the reference, gentle warm music, photorealistic, respectful.",
   "scenes": null,
   "preview": {
     "frame": "photorealistic still of a warm Gulf Arab family of four smiling and waving at the camera in a bright living room",
     "gender": "m"
   }
 },
 "actionhero": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "none",
   "prompt": "Blockbuster action-hero shot: the person from the reference image walks slowly toward the camera in confident slow motion while a fiery explosion erupts behind them and they never look back, embers and debris flying, heavy contrast and lens flares, low hero angle, epic drum score, photorealistic, same face and clothing as the reference, no text.",
   "scenes": null,
   "preview": {
     "frame": "blockbuster action still of a man walking toward camera in slow motion with a fiery explosion behind him, embers flying, low hero angle",
     "gender": "m"
   }
 },
 "paintingalive": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "none",
   "prompt": "The reference image becomes a living oil painting: thick visible brush strokes form and shimmer, pigments swirl slowly, the subject breathes and blinks inside the painting, canvas texture and craquelure visible, warm gallery lighting, slow camera drift, artistic and dreamlike, no text.",
   "scenes": null,
   "preview": {
     "frame": "living oil painting still of a portrait with thick visible brush strokes and canvas texture, warm gallery light, pigments swirling",
     "gender": "w"
   }
 },
 "miniature": {
   "engine": "veo",
   "ratio": "1280:720",
   "photo": "req",
   "kind": "none",
   "prompt": "Tilt-shift miniature effect on the scene from the reference image: strong selective focus makes the whole scene look like a tiny handcrafted model, tiny cars and people move in fast motion, saturated toy-like colours, slight time-lapse of light across the scene, playful light music, no text.",
   "scenes": null,
   "preview": {
     "frame": "tilt-shift miniature still of a city street from above looking like a toy model, tiny cars, saturated colours, strong selective focus",
     "gender": "m"
   }
 },
 "underwater": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "none",
   "prompt": "Underwater dream scene: the subject from the reference image floats gracefully in clear turquoise water, shafts of sunlight cutting down from the surface, bubbles rising, hair and fabric drifting slowly, colourful fish passing by, gentle slow motion, photorealistic, same face as the reference, calm ambient music, no text.",
   "scenes": null,
   "preview": {
     "frame": "photorealistic underwater still of a person floating in clear turquoise water with sun rays from above, bubbles and colourful fish",
     "gender": "w"
   }
 },
 "weathershift": {
   "engine": "veo",
   "ratio": "1280:720",
   "photo": "req",
   "kind": "none",
   "prompt": "One continuous locked shot of the place from the reference image as the weather transforms: bright sunshine with sharp shadows, then rolling clouds and falling rain with puddles and reflections, then gentle snowfall settling on every surface, seamless transitions, the framing never moves, photorealistic, atmospheric sound, no text.",
   "scenes": null,
   "preview": {
     "frame": "photorealistic still of a street scene split between bright sun, falling rain and settling snow, seamless weather transition",
     "gender": "m"
   }
 },
 "neonnight": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "none",
   "prompt": "Cyberpunk neon night: the person from the reference image stands on a rain-soaked street at night, saturated pink and cyan neon signs glowing around them and reflecting in the wet asphalt, light haze and drifting steam, slow camera push-in, cinematic contrast, photorealistic, same face and clothing as the reference, no readable text on the signs.",
   "scenes": null,
   "preview": {
     "frame": "cyberpunk neon night still of a person on a rain-soaked street with pink and cyan neon reflections in the wet asphalt, light haze",
     "gender": "m"
   }
 },
 "calligraphy": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "none",
   "kind": "sentence",
   "prompt": "Elegant Arabic calligraphy animation: glossy black ink flows across warm cream paper and forms the Arabic sentence '{text}' in flowing Thuluth calligraphy, gold leaf accents catching the light as each letter completes, then the ink blooms softly outward into an ornate arabesque pattern, macro detail, warm side light, calm oud music, spelled exactly as written and no other text.",
   "scenes": null,
   "preview": {
     "frame": "macro still of glossy black Arabic Thuluth calligraphy being written in ink on warm cream paper with gold leaf accents, warm side light",
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
