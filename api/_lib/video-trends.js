// v-video-trends: قوالب ترندات الفيديو — الأمر النهائي يُبنى هنا من قالب الترند ومدخلات المستخدم
// v-trends-more (٢٤ سبتمبر): ٢٥ ← ٤٥ ترندًا. كلّ ترند: محرّك ونسبة وحاجة الصورة ونوع المدخل وقالب الأمر وإطار المعاينة.
'use strict';
const TRENDS = {
 "pixarstory": {
  "engine": "veo",
  "ratio": "1280:720",
  "photo": "opt",
  "kind": "name",
  "prompt": "Pixar-style 3D animated scene {i} of {n}: {scene}. Main character: a cheerful child named {name}{look}, the SAME character design in every scene. Warm cinematic lighting, expressive faces, gentle camera movement, soft family music, short Arabic narration voice-over.",
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
  "prompt": "Photorealistic cinematic video: the person from the reference image stands in an old Arabian souq decorated with festive lanterns and bunting, a crowd clapping softly behind, singing joyfully in Arabic: '{text}'. Lip-synced singing in one continuous medium close-up (chest up, their face large and clearly lit), the camera drifting slowly, golden-hour light, shallow depth of field, celebratory ambience.",
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
  "prompt": "Bring this old photograph to life: the person subtly breathes, blinks, makes a small natural head movement within the photo's own angle with a faint, gentle smile, then says a short heartfelt greeting in Arabic. Keep the original look, natural film grain, respectful and realistic, gentle nostalgic music.",
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
  "prompt": "Fast rhythmic travel montage: the person from the reference image (same face, hair and outfit) appears in famous world locations one after another: Dubai Burj Khalifa, Paris Eiffel Tower, Tokyo neon street, New York Times Square, Istanbul Bosphorus, Cairo pyramids, London Big Ben, Rome Colosseum, Maldives beach, Swiss Alps — each shot a medium close-up with their face large and clearly lit. Quick cuts, upbeat music, photorealistic.",
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
  "prompt": "The person from the reference image stands in a studio while their outfit changes five times in quick snap transitions: elegant evening wear, a traditional Gulf kandura or abaya, sporty, business, casual street style. Only the clothes change: their face, hair and any headwear stay exactly as in the photo in every look — nothing is put on or taken off the head. Same face and pose, studio lighting, upbeat music.",
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
  "prompt": "Transform the reference image into a hand-painted Studio Ghibli-style animated scene: wind moves their clothes and gently stirs their hair without changing its length or cut, clouds drift, grass sways, soft watercolor light, gentle orchestral music, same person recognizable.",
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
  "prompt": "The person from the reference image records a selfie-style video at {text}: a glamorous gala with a red carpet and photographers' flashes behind, confident, handheld camera feel, festive atmosphere, photorealistic.",
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
  "prompt": "Festive Eid greeting video: the person (from the reference image if provided) in elegant Eid clothes, their hair and any headwear exactly as in the photo (nothing added on the head), waves warmly and says joyfully in Arabic 'عيد مبارك {name}', decorated background with lanterns and a crescent moon, joyful music.",
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
  "prompt": "Cinematic motion poster: the person from the reference image, exactly as they look, as the star of a dramatic blockbuster film poster titled '{text}' - epic stormy backdrop, drifting smoke and light rays animating subtly, lens flares sweeping, the bold glowing title '{text}' and a small credits block at the bottom, the SAME face as the reference. Vertical poster framing, blockbuster color grade on the backdrop, their face in natural light, slow majestic camera drift.",
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
   "prompt": "Warm customer testimonial clip: the person from the reference image sits in a bright, tidy interior, looks at the camera and says sincerely in Arabic: '{text}'. Lip-synced natural speech, honest friendly delivery, soft window light, shallow depth of field, same face and clothing as the reference, no text overlay.",
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
   "prompt": "Joyful graduation moment: the person from the reference image wears a graduation gown and a cap (worn over their own ghutra or headscarf if they have one, their hair exactly as in the photo), tosses the cap into the air in slow motion while golden confetti falls, campus lawn at golden hour, friends cheering warmly out of focus behind and calling out their name '{name}' with joy, photorealistic, warm uplifting music.",
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
   "prompt": "Tender newborn announcement: the baby from the reference image sleeps peacefully wrapped in a soft blanket, gentle breathing, tiny fingers moving slightly, soft diffused window light, dust motes floating, a soft off-screen voice-over gently welcomes them by name, saying '{name}' warmly, photorealistic, calm lullaby music.",
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
   "prompt": "Cinematic wedding film moment: the person or couple from the reference image (only the people it shows, never an invented partner) in slow motion as rose petals drift around them, warm bokeh string lights behind, the camera stays in front of them at eye level and pushes in slowly, elegant soft focus, golden warm grade, romantic orchestral music, photorealistic, faces and clothing unchanged from the reference, no text.",
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
   "prompt": "Ramadan greeting scene: an ornate brass lantern glows in the foreground, a crescent moon hangs in a deep blue sky, a beautifully set iftar table with dates and water waits below, gentle particles of light drift upward, the camera rises slowly, a warm off-screen voice softly says the Ramadan greeting 'رمضان مبارك {name}', warm spiritual ambience.",
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
   "prompt": "Bring this family photograph to life: every person subtly breathes, blinks, breaks into a warm smile and waves at the camera together, natural micro-movements only, identities, faces, clothing and background exactly as in the reference, gentle warm music, photorealistic, respectful.",
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
   "prompt": "Blockbuster action-hero shot: the person from the reference image walks a few slow steps toward the camera in confident slow motion, seen from the waist up at eye level throughout, their face evenly lit and unchanged, while a fiery explosion erupts behind them (its glow on the background and edges only) and they never look back, embers and debris flying, heavy contrast and lens flares on the background, epic drum score, photorealistic, same face and clothing as the reference, no text.",
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
   "prompt": "Underwater dream scene: the subject from the reference image floats gracefully in clear turquoise water, shafts of sunlight cutting down from the surface, bubbles rising, fabric drifting slowly while their hair keeps its exact length and cut and only stirs gently (any headscarf stays on), their face clearly lit in its true skin tone, colourful fish passing by, gentle slow motion, photorealistic, same face as the reference, calm ambient music, no text.",
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
 },
 /* v-trends-more-2 (المالك: «أريد أزيد في الفيديوهات — الترندات»): +١٠ ترندات جديدة، لا تكرار لموضوع قائم. */
 "actionfigure": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "none",
   "prompt": "The person from the reference image is reimagined as a collectible action-figure toy sealed in plastic blister packaging on a toy-store shelf, with small plastic accessories beside them in the tray; the camera slowly orbits the package under bright store lighting, then the plastic blister flexes gently and the figure inside blinks and gives a small wave before freezing back into toy pose, playful studio light, photorealistic toy product look, same face as the reference.",
   "scenes": null,
   "preview": {
     "frame": "photorealistic still of a collectible action-figure toy of a young man sealed in plastic blister packaging with small accessories, on a toy-store shelf under bright light",
     "gender": "m"
   }
 },
 "superhero": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "none",
   "prompt": "The person from the reference image stands as energy swirls around them and their clothing transforms into a sleek superhero suit with a flowing cape — no mask, cowl or helmet; their face, hair and any headwear stay exactly as in the photo — the wind whipping the cape, a city skyline glowing at dusk behind them; they plant their feet and look ahead with their own steady expression, their face clearly lit, dramatic rim light on the edges, powerful orchestral score, photorealistic, same face as the reference.",
   "scenes": null,
   "preview": {
     "frame": "photorealistic still of a person in a sleek superhero suit with a flowing cape standing heroically before a glowing dusk city skyline, dramatic rim light",
     "gender": "m"
   }
 },
 "catwalk": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "none",
   "prompt": "The person from the reference image walks confidently down a lit fashion-runway catwalk wearing their own outfit exactly as photographed, camera flashes popping from the audience on both sides, dramatic runway music, slow-motion strides, professional runway lighting, photorealistic, same face and outfit as the reference.",
   "scenes": null,
   "preview": {
     "frame": "photorealistic still of a woman walking confidently down a lit fashion runway catwalk with camera flashes popping from the audience, dramatic lighting",
     "gender": "w"
   }
 },
 "animeaction": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "none",
   "prompt": "Transform the scene into a high-energy Japanese shonen-anime style: bold ink outlines, dramatic speed lines and impact frames, the person from the reference image strikes a confident dynamic pose as their clothes whip with sudden wind (their hair keeps its own length and cut), vivid saturated color flashes, intense orchestral hit, same person recognizable in anime form.",
   "scenes": null,
   "preview": {
     "frame": "high-energy shonen anime still of a young man in a dynamic pose with bold ink outlines, dramatic speed lines and vivid color flashes",
     "gender": "m"
   }
 },
 "claymation": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "none",
   "prompt": "Transform the reference image into a handcrafted claymation stop-motion character: visible clay texture, fingerprint dents and sculpting seams, subtle jittery stop-motion movement frame to frame, a miniature handmade set behind them, warm soft studio light, playful plinky music, same person recognizable in clay form.",
   "scenes": null,
   "preview": {
     "frame": "claymation stop-motion still of a character with visible clay texture and fingerprint dents standing in a miniature handmade set, warm soft light",
     "gender": "w"
   }
 },
 "legofy": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "none",
   "prompt": "Transform the person from the reference image into a LEGO minifigure version of themselves: blocky plastic body, cylindrical head, painted-on facial features matching their real face, standing on a LEGO baseplate inside a small LEGO-brick diorama that echoes their outfit's colors; the camera orbits slowly, cheerful bright light, playful music, same person recognizable as a LEGO figure.",
   "scenes": null,
   "preview": {
     "frame": "still of a LEGO minifigure version of a person with a cylindrical head and blocky plastic body standing on a baseplate in a small brick diorama",
     "gender": "m"
   }
 },
 "vhsflashback": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "none",
   "prompt": "The person from the reference image is seen through a nostalgic 1990s VHS home-camcorder look: soft glow, gentle scan lines, slight tracking wobble and warm color bleed, subtle grain; they wave naturally at the camera in a cozy home setting, handheld camera sway, same face and outfit as the reference, warm nostalgic feel.",
   "scenes": null,
   "preview": {
     "frame": "nostalgic 1990s VHS camcorder-style still of a person smiling and waving in a cozy home setting, soft glow, gentle scan lines, warm grain",
     "gender": "w"
   }
 },
 "podcastclip": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "sentence",
   "prompt": "Vertical podcast-style clip: the person from the reference image sits at a studio desk with a professional microphone and soft LED panel lighting behind them, leans in and says energetically in Arabic: '{text}'. Lip-synced natural speech, confident engaging delivery, shallow depth of field, same face and clothing as the reference, no text overlay.",
   "scenes": null,
   "preview": {
     "frame": "photorealistic still of a person sitting at a studio podcast desk with a professional microphone and soft LED panel lighting behind them, confident expression",
     "gender": "m"
   }
 },
 "dayinlife": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "none",
   "prompt": "Fast rhythmic day-in-the-life montage of the person from the reference image (same face, same hair, facial hair and outfit style, each shot a medium close-up): waking up and stretching in soft morning light, sipping coffee by a sunny window, stepping out of the front door, walking energetically down a city street; quick cuts, upbeat music, photorealistic, natural candid feel.",
   "scenes": null,
   "preview": {
     "frame": "photorealistic still of a person sipping coffee by a sunny window in a warm morning montage moment, candid natural feel",
     "gender": "w"
   }
 },
 "birthdaybash": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "none",
   "prompt": "Joyful birthday celebration: the person from the reference image sits before a beautifully decorated birthday cake with lit candles, friends clapping softly out of focus behind them; they blow out the candles as balloons and warm confetti drift down, warm party lighting, cheerful music, photorealistic, same face and outfit as the reference.",
   "scenes": null,
   "preview": {
     "frame": "photorealistic still of a person smiling before a decorated birthday cake with lit candles, balloons and warm confetti drifting, cheerful party light",
     "gender": "w"
   }
 },
 "tears": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "none",
   "prompt": "Close-up emotional portrait starting exactly from the reference photo of the person: at first their expression exactly as in the photo, then their eyes slowly fill and glisten, the eyelids redden, and a few tears roll gently down their cheeks as the expression turns quietly sad; tiny natural movements of breathing and blinking, the camera almost still with a very slow push-in, the face, hair, makeup, clothing and background exactly as in the photo, soft emotional piano music, photorealistic.",
   "scenes": null,
   "preview": {
     "frame": "photorealistic close-up portrait of a young woman with a single tear rolling down her cheek, soft window light, quiet emotional mood",
     "gender": "w"
   }
 },
 "saveyourself": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "none",
   "prompt": "Cinematic rescue on a sea cliff at sunset: the person from the reference image hangs from the crumbling edge of a high rocky cliff above crashing waves, fingers slipping; a second figure who is the very same person, standing strong and calm on the edge in different, darker clothes, kneels, grabs their wrist and pulls them up to safety; both share the same face; dust and sea spray in the air, both with the hair exactly as in the photo, dramatic orchestral music, photorealistic.",
   "scenes": null,
   "preview": {
     "frame": "photorealistic cinematic still of a man hanging from a rocky cliff edge above the sea at sunset while a strong hand reaches down and grabs his wrist",
     "gender": "m"
   }
 },
 "flyingcar": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "none",
   "prompt": "Starting exactly from the reference photo of the car: white cold-gas thruster jets hiss out from under its body in sharp puffs, the car lifts straight up off the road, hovers for a beat, then rolls one slow full barrel turn in mid-air as it soars over the vehicles ahead, a big semi-truck among them, and lands smoothly back on its wheels on the open road beyond and drives on; the camera follows from the side; the car's exact shape, colour and details stay unchanged, no readable licence plate, hiss of the thrusters and gasps of onlookers, cinematic, photorealistic, clearly a fun fantasy effect.",
   "scenes": null,
   "preview": {
     "frame": "photorealistic still of a white sports car hovering in a mid-air barrel roll above a semi-truck on a desert highway, white thruster jets puffing beneath it, golden hour",
     "gender": "m"
   }
 },
 "jetflyover": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "none",
   "prompt": "Selfie-style view from inside a parked car with an open panoramic sunroof: the person from the reference image sits in the driver's seat and glances up only briefly, their face staying toward the camera as in the photo, as a fighter jet roars low directly overhead against a clear blue sky, trailing long coloured smoke, seen through the open sunroof behind them; the car shakes gently, the camera stays on them, thunderous engine rumble, proud and thrilling mood, photorealistic.",
   "scenes": null,
   "preview": {
     "frame": "photorealistic selfie from inside a car with an open panoramic sunroof as a fighter jet flies low overhead trailing coloured smoke against a blue sky",
     "gender": "m"
   }
 },
 "lostfilm80s": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "none",
   "prompt": "Grainy, warm footage from a lost 1980s fantasy film shot on 35mm with practical effects: in a candle-lit medieval barn strewn with straw beside an old spinning wheel, the person from the reference image, dressed as a mischievous trickster in a ragged velvet tunic and a pointed felt hat (over their own headwear if any), does a sly tiptoe dance in a little circle with a mischievous look, their face turned toward the camera, while a frightened young princess in a flowing gown backs away clutching her skirts; dust and straw float in the shafts of light; soft film grain, slight gate weave, faded colours, eerie playful harpsichord-and-synth score.",
   "scenes": null,
   "preview": {
     "frame": "grainy 1980s 35mm fantasy film still: a grinning trickster in a ragged velvet tunic and pointed felt hat tiptoe-dancing in a candle-lit straw barn beside a spinning wheel while a frightened princess in a gown backs away",
     "gender": "w"
   }
 },
 "zombielove": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "none",
   "prompt": "A short post-apocalyptic love story in an abandoned, dusty city street at dusk: the person from the reference image walks toward someone they love — the second person in the reference photos, if one is given — who has turned into a zombie: pale grey-tinted skin, dark circles and torn clothes, but their own face still clearly recognizable, with no blood or gore. They hesitate with tears in their eyes, then embrace them tenderly, and as they hug a flicker of recognition softens the zombie's eyes and they gently hug back; emotional piano music, photorealistic.",
   "scenes": null,
   "preview": {
     "frame": "photorealistic cinematic still of a woman embracing a pale zombie-like man in torn clothes on an abandoned dusty city street at dusk, emotional, no blood",
     "gender": "w"
   }
 },
 "standstill": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "none",
   "prompt": "The person from the reference image stands perfectly still at the front of a vast dark hall, staring calmly into the lens, while hundreds of adult dancers in identical dark uniforms behind them move in sharp robotic sync under cold white spotlights; the camera slowly pulls back to reveal the scale of the crowd; deep electronic beat, photorealistic.",
   "scenes": null,
   "preview": {
     "frame": "photorealistic still of a young man standing still at the front of a dark hall while a huge crowd of dancers in identical dark uniforms dance in sync behind him under white spotlights",
     "gender": "m"
   }
 },
 /* v-trend-hair-lock (المالك: «سامحوني» بصورة رجل ملتحٍ بشعر قصير جدًّا ← وجه أنحف وشعر طويل تطيّره الريح): لا «glow-up» ولا «ريح في
    الشعر» في القوالب — الريح تحرّك العباءة واللبس، والوجه والشعر واللحية كما في الصورة (والمثل في ترندات أخرى أدناه) */
 "sorryreveal": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "none",
   "prompt": "Epic hero reveal: the clip opens on the person from the reference image as a legendary desert knight — only the costume and the setting are epic; their own face, build, facial hair and hair stay exactly as in the photo, bare-headed or in their own headwear from the photo — in ornate golden armour with a cape billowing in the wind on a cliff at golden hour, their face clearly lit, an epic orchestral swell; then in the final second it cuts to the reference photo itself, as a funny self-mocking reveal; photorealistic.",
   "scenes": null,
   "preview": {
     "frame": "photorealistic epic still of a heroic desert knight in ornate golden armour with a flowing cape standing on a cliff at golden hour",
     "gender": "m"
   }
 },
 "spanishrap": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "none",
   "prompt": "Vertical night phone clip at a red-lit restaurant entrance, filmed handheld by a street freestyler whose hand holds a small portable speaker in the foreground, blasting a dembow beat; people in the doorway film on their phones. The person from the reference image, in an open pale-pink mesh short-sleeve shirt, has stopped on the way in and faces the lens. The freestyler raps a playful line at them first; they answer with an improvised Spanish-language rap freestyle into the phone, lips synced, with the signature nonstop shoulder bounce: right shoulder up, then left, on every beat, loose hands rolling at chest height. At the end the freestyler takes the vocals back while they keep the shoulder bounce, then point straight at the lens. Shaky handheld, photorealistic.",
   "scenes": null,
   "preview": {
     "frame": "photorealistic vertical night still at a red-lit restaurant entrance: a grinning young man in an open pale-pink mesh short-sleeve shirt rapping into the lens with a shoulder bounce, a street freestyler's hand holding a small portable speaker in the foreground, people in the doorway filming on their phones",
     "gender": "m"
   }
 },
 "orangebooth": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "none",
   "prompt": "The person (or people) from the reference image stand in a bare, bright-orange recording booth under a single hanging microphone and trade short rap verses into it over an original trap beat, stepping up in turn (taking turns if there are several of them), lips synced, while whoever is not rapping bobs to the beat and hypes with ad-libs and playful reactions; locked-off, centred camera framed from the knees up, even studio light, fun and cool mood, photorealistic.",
   "scenes": null,
   "preview": {
     "frame": "photorealistic still of two young men standing in a bare bright orange recording booth under a single hanging microphone, framed from the knees up, centred",
     "gender": "m"
   }
 },
 "petclap": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "none",
   "prompt": "Starting exactly from the reference photo of the pet: it suddenly stands up on its hind legs, gives a big uncanny human-like grin, and claps a pair of small human hands together in time with a cheerful beat, then freezes and blinks innocently; same fur, colours and markings as in the photo, natural home setting, funny and charming, photorealistic.",
   "scenes": null,
   "preview": {
     "frame": "photorealistic still of a black cat standing on its hind legs clapping small human hands with a big grin in a cosy living room",
     "gender": "w"
   }
 },
 "gamechar": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "none",
   "prompt": "The person from the reference image reimagined as the hero of an open-world action video game, in the painted illustration art style of a game loading screen: they stand confidently in a sun-bleached coastal city street with palm trees and sports cars, the camera sweeps around them in a slow cinematic arc as the painted scene gains parallax depth, ending on a heroic character pose; no game name, no logos, no text, energetic synth music.",
   "scenes": null,
   "preview": {
     "frame": "painted illustration in the style of a video game loading screen of a confident young man standing in a sunny coastal city street with palm trees and sports cars",
     "gender": "m"
   }
 },
 "bbywow": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "none",
   "prompt": "Vertical handheld phone clip filmed by a guest at a party in a banquet hall, purple, pink and green party lights, formally dressed guests around the dance floor. The person from the reference image, in a plain black polo, holds a round sugar-topped sweet bun and starts a few steps back on the dance floor, dancing toward the phone, rolling their shoulders and swaying. Stopping near the phone in a medium close-up (chest up), they take one bite of the bun on the beat, then hold a deadpan stare straight into the lens while chewing, cheeks puffed, head still. Then they turn and dance back into the crowd. Fast sped-up dancehall beat with party chatter, one continuous shot, photorealistic.",
   "scenes": null,
   "preview": {
     "frame": "photorealistic vertical phone still in a banquet hall with purple, pink and green party lights: a young man in a plain black polo close to the lens, cheeks full mid-chew, holding a round sugar-topped sweet bun, deadpan stare straight into the camera, formally dressed guests blurred behind him",
     "gender": "m"
   }
 },
 "invisiblebike": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "none",
   "prompt": "One continuous vertical tracking shot on a concrete highway overpass by day: the camera rolls backward at chest height in front of the person from the reference image, in their own clothes, riding toward it in a deep squat in mid-air, both fists forward on invisible handlebars, nothing at all beneath them, their face as in the photo as the road streams past. Close behind, a helmeted officer with no insignia chases on a white futuristic hover-bike with round red lights. The rider kicks off into a mid-air flip, lands in the same squat and speeds away, the camera still at chest height. High-energy instrumental Eurodance synth beat, hover-bike whine, wind, photorealistic.",
   "scenes": null,
   "preview": {
     "frame": "photorealistic vertical still on a concrete highway overpass by day: a grinning young man in a hoodie squatting in mid-air with both fists forward on invisible handlebars and nothing beneath him, a helmeted rider on a white futuristic hover-bike with round red lights chasing close behind, motion blur on the road",
     "gender": "m"
   }
 },
 "ceilingfan": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "none",
   "prompt": "Locked overhead camera pointing straight down past a slowly turning wooden ceiling fan, its blades in the foreground and its hub just outside a top corner. Below, the person from the reference image lies still on their back, face up, on a patterned rug in warm afternoon light, in their own outfit. The camera never moves. Each time a blade sweeps fully across the lens their outfit changes instantly behind it, no dissolve or morph: first to an all-black modest look, then to a modest shimmering gold one. Face, hair and headwear (none added, none removed), pose, spot, rug and light stay identical. Upbeat beat with each blade pass landing on a drop, one continuous shot, photorealistic.",
   "scenes": null,
   "preview": {
     "frame": "photorealistic overhead still looking straight down past the soft-blurred blades of a wooden ceiling fan at a young woman in a modest long shimmering gold outfit and headscarf lying on her back on a patterned rug in warm afternoon light",
     "gender": "w"
   }
 },
 "slowmoentry": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "none",
   "prompt": "Static vertical shot from a phone on a tripod in an ordinary open-air parking lot by day, framed from the knees up; the camera never moves. The person from the reference image, in casual streetwear, makes an exaggerated cinematic slow-motion entrance: starting left of centre, they stride across the lot at the same distance from the lens, every step slow and heavy, their face and natural expression exactly as in the photo, each step landing on a big hit of the music, until they stand in the middle of the frame, seen from the knees up. True slow motion throughout, an ordinary spot played like a blockbuster opening. Dark, dramatic cinematic hip-hop instrumental with heavy drums, photorealistic.",
   "scenes": null,
   "preview": {
     "frame": "photorealistic vertical still from a fixed camera in an ordinary open-air parking lot by day: a young man in casual streetwear striding in from the left in slow motion, mid-step, with a calm, natural face",
     "gender": "m"
   }
 },
 "lonelywalk": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "none",
   "prompt": "Vertical comedy shot in a cold village lane at dusk: warmly dressed couples sit close together around small fires on both sides, sharing blankets and tea. The person from the reference image walks alone down the middle toward the camera in a worn, torn grey coat, hugging themselves and shivering, glancing left and right at the cosy couples. Reaching the foreground, they look straight into the lens with a dry, resigned expression, breathe out a small cloud of cold air, and keep walking. Face, hair and any headwear exactly as in the reference. One continuous shot, bouncy playful folk comedy tune, wind and crackling fire, photorealistic.",
   "scenes": null,
   "preview": {
     "frame": "photorealistic vertical still in a cold village lane at dusk: a young man in a worn, torn grey coat walking alone toward the camera, hugging himself and shivering with a dry, resigned look into the lens, warmly dressed couples sitting close around small fires on both sides",
     "gender": "m"
   }
 },
 "chestroll": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "none",
   "prompt": "Locked vertical phone camera at chest height in a clean bright room. The person from the reference image, in their own clothes, is framed from the knees up, faces the camera the whole time and dances one catchy routine on the beat: rolls both hands over each other in front of the chest, rolls the arms out to each side, raises both hands up beside the head, then sways the hips lightly from side to side with a confident smile, and repeats the sequence. Natural motion, the camera never moves. Face, hair and any headwear exactly as in the reference, face clearly visible throughout. Upbeat Latin-pop dance beat, one continuous shot, photorealistic.",
   "scenes": null,
   "preview": {
     "frame": "photorealistic vertical full-body still of a smiling young man in casual clothes dancing in a clean bright room, both hands rolling over each other in front of his chest, feet in frame",
     "gender": "m"
   }
 },
 "babysway": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "none",
   "prompt": "Locked vertical phone camera in a cosy living room. The person from the reference image, exactly as they are, same face, same age and in their own clothes, is framed from the knees up and faces the camera the whole time, performing the cute wobbling sway dance on the beat: knees bouncing, shoulders rocking from side to side, arms swinging and pointing, then a confident final pose with arms crossed and a big grin. Face, hair and any headwear exactly as in the reference, face clearly visible throughout. One continuous shot, catchy upbeat pop-dance tune, photorealistic.",
   "scenes": null,
   "preview": {
     "frame": "photorealistic vertical still of a smiling young man in casual clothes framed from the knees up in a cosy living room, mid sway dance with shoulders tilted and arms out, facing the camera",
     "gender": "m"
   }
 },
 "panelcut": {
   "engine": "veo",
   "ratio": "720:1280",
   "photo": "req",
   "kind": "none",
   "prompt": "Two-part vertical transition. Part one: a handheld selfie in a bedroom at home, the person from the reference image in their own top lip-syncs to the beat, then raises both index fingers beside the top of the head like little horns. On the beat they push two plain white panels shut in front of the lens like double doors. Then the video cuts to part two and their outfit changes: the same person on a windy city street at night, glass towers and traffic lights behind, in an oversized black leather jacket over modest clothes, walking toward the camera with a confident look, one hand on the jacket collar. Same face, hair and any headwear in both parts. Punchy electronic beat, photorealistic.",
   "scenes": null,
   "preview": {
     "frame": "photorealistic vertical night still on a windy city street with glass towers and traffic lights: a confident young woman in a headscarf and an oversized black leather jacket over modest clothes walking toward the camera, one hand on the jacket collar",
     "gender": "w"
   }
 }
};
/* v-trend-extra: الحدّ ٢٤٠ ← ٤٠٠ — المالك يكتب أكثر من جملة («دمج الكلمات») */
function clean(s) { return String(s || '').replace(/[\r\n]+/g, ' ').replace(/["`\\<>]/g, '').trim().slice(0, 400); }
const BACKDROPS = require('./video-backdrops.js');
/* v-trend-scenes (المالك: «كتبت مشهدين عن البحر وطلع الفيديو عن المدرسة»): مشاهد بيكسار الثلاثة كانت ثابتة
   (صباح، مدرسة، مساء) وما يُكتب في «اكتب اللي تبيه» يُلحق بعدها توجيهًا فقط، فيغلب المشهدُ المكتوب كلامَه.
   الآن مشاهد المستخدم تحلّ محلّ الافتراضيّة وعدد المقاطع بعددها: «المشهد الأول: … المشهد الثاني: …» داخل
   «اكتب اللي تبيه» أوّلًا، ثمّ خانات المشاهد في العميل (params.scenes)، ثمّ الافتراضيّ. العلامة تُقبل بفاصل
   (: دائمًا، أو شرطة/نقطة بعدها فراغ، أو سطر جديد)، وبلا فاصل إن تكرّرت (قائمة مشاهد) — «زي المشهد الأول بس
   بالليل» لا تُقسَم، ولا «scene one-shot».
   الدالّة منسوخة حرفيًّا في js/app-11-video-trends.js (العميل يعرض بها الخانات ويعدّ المقاطع) وtrend-scenes يطابق
   النسختين؛ بلا lookbehind ولا \p (الحزمة تُحلَّل على المحرّكات القديمة — v-es-floor).
   بعد المراجعة: «المشهد الأول، …» و«الـ1» و«١)» و«(1):» و«؛» و«اللقطة/المقطع» وعلامات الاتّجاه الخفيّة من اللصق وإيموجي
   قبلها تُقبل؛ رقم القائمة («1- المشهد…») وروابط «ثم/and» لا تبقى في المشهد؛ ونصّ المدخل يُقصّ ١٠٠٠ قبل أيّ تعبير. */
function splitScenes(text){
  var s = String(text == null ? '' : text).slice(0, 1000); /* الخانة ٤٠٠ — والحدّ يمنع كلفة التعابير على نصّ ضخم من خارج الواجهة */
  var MAX = 5;
  var SP = '[ \\t\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]*';
  var NUM = '[0-9\u0660-\u0669\u06F0-\u06F9\u0966-\u096F\u09E6-\u09EF]+';
  var ORD = '(?:ال)?(?:[أاإ]و[\u064B-\u0652]*لى?|ثان[يى]ة?|ثالثة?|رابعة?|خامسة?|سادسة?|سابعة?|ثامنة?|تاسعة?|عاشرة?|[أا]خيرة?)[\u064B-\u0652]*';
  var MARK = new RegExp('[وف]?(?:المشهد|مشهد|اللقطة|لقطة|المقطع|مقطع)' + SP + '(?:رقم' + SP + ')?(\\()?' + SP + '(?:(?:ال\u0640*)?' + NUM + '|' + ORD + ')'
    + '|(?:scene|scène|escena|sahne|сцена|eksena|adegan|दृश्य|منظر|দৃশ্য|രംഗം)' + SP + '(?:#|no\\.?' + SP + ')?(\\()?' + SP + '(?:' + NUM + '|one|two|three|four|five|six|seven|eight|nine|ten)'
    + '|(?:first|second|third|fourth|fifth|last)' + SP + 'scene'
    + '|第' + SP + '[0-9一二三四五六七八九十]+' + SP + '幕|场景' + SP + '[0-9一二三四五六七八九十]+', 'gi');
  var WORD = /[A-Za-z0-9_\u00C0-\u024F\u0400-\u04FF\u0621-\u063A\u0641-\u065F\u0660-\u0669\u0670-\u06D3\u06FA-\u06FF\u0900-\u097F\u0980-\u09FF\u0D00-\u0D7F]/;
  var cands = [], m;
  while((m = MARK.exec(s))){
    var at = m.index, end = at + m[0].length, cjk = /^[第场]/.test(m[0]);
    if(!cjk && at > 0 && WORD.test(s.charAt(at - 1))) continue; /* «بالمشهد» و«obscene 1» ليستا علامة */
    var close = /^[ \t\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]*\)/.exec(s.slice(end));
    if(close) end += close[0].length;
    var sep = /^[ \t\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]*(?:[:：;؛]|[\-–—.](?!\S)|\r?\n)/.exec(s.slice(end));
    var strong = !!sep || (!!close && !(m[1] || m[2])); /* «المشهد ١)» فاصل؛ «المشهد (١)» قوس فقط */
    if(!strong && !cjk && end < s.length && !/[\s,،\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/.test(s.charAt(end))) continue; /* «one-shot» */
    cands.push({ at: at, body: end + (sep ? sep[0].length : 0), strong: strong });
  }
  if(!cands.length) return { scenes: [], rest: s.trim() };
  var LISTNUM = /(?:(?:^|\s)[0-9\u0660-\u0669\u06F0-\u06F9]{1,2}[ \t]*[\-–—.)]|(?:^|\n)[ \t]*[0-9\u0660-\u0669\u06F0-\u06F9]{1,2})[ \t]*$/;
  var tidy = function(x){
    var y = x.replace(LISTNUM, '').replace(/^[\s,،؛;:.\-–—\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]+/, '');
    for(var r = 0; r < 3; r++){
      y = y.replace(/[\s,،؛;\-–—\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]+$/, '').replace(/(^|[\s,،])(?:و?ثم[\u064B-\u0652]*|و?بعدين|و?بعدها|and then|and|then|و)$/i, '');
    }
    return y;
  };
  /* بلا فاصل («المشهد الأول سالم… المشهد الثاني…») تُعدّ العلامات فقط إن بدأ بها النصّ (أو بعد نهاية جملة):
     «غيّر المشهد الثاني والمشهد الثالث…» و«زي المشهد الأول بس بالليل» إشارة إلى المشاهد لا قائمة مشاهد */
  var head = s.slice(0, cands[0].at).replace(LISTNUM, '').replace(/[ \t\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]+$/, '');
  var weakOK = !head.trim() || /[.!?؟:：;؛\n]$/.test(head);
  var marks = (weakOK && cands.length > 1) ? cands : cands.filter(function(c){ return c.strong; });
  if(!marks.length) return { scenes: [], rest: s.trim() };
  var scenes = [];
  for(var k = 0; k < marks.length; k++){
    var body = tidy(s.slice(marks[k].body, k + 1 < marks.length ? marks[k + 1].at : s.length));
    if(body) scenes.push(body);
  }
  if(scenes.length > MAX) scenes = scenes.slice(0, MAX - 1).concat([scenes.slice(MAX - 1).join(' ')]);
  var rest = tidy(s.slice(0, marks[0].at));
  return { scenes: scenes, rest: /^[\s\uD800-\uDFFF\u2600-\u27BF\uFE0F\u200D]*$/.test(rest) ? '' : rest }; /* «🌊» وحدها ليست توجيهًا */
}
const MAX_SCENES = 5;
/** مشاهد «اكتب اللي تبيه» ← params.scenes والباقي توجيهًا. مرّة واحدة قبل البناء — veo-create يقصّ extra إن طال الأمر،
 *  وقصّ نصّ فيه العلامات قد يُسقط مشهدًا. تُعاد بلا أثر: بعدها لا علامة في extra. */
function sceneParams(key, params) {
  const t = TRENDS[key];
  const p = Object.assign({}, params || {});
  if (!t || !t.scenes || !t.scenes.length) return p;
  const sp = splitScenes(p.extra);
  if (sp.scenes.length) { p.scenes = sp.scenes; p.extra = sp.rest; }
  /* v-chat-trend-scenes: مقطع المحادثة الواحد — قصّة بلا علامات ولا مشاهد هي المشهد نفسه، لا توجيهًا على مشهد الصباح */
  else if (p.oneClip && !(Array.isArray(p.scenes) && p.scenes.length) && clean(p.extra)) { p.scenes = [p.extra]; p.extra = ''; }
  return p;
}
/* v-trends-lang (المالك ١٤ نوفمبر: «إذا أسوّي أيّ فيديو فقط بالعربي… أريده بكلّ اللغات الموجودة»): القوالب تقول «says in Arabic»
   و«Gulf Arabic dialect» و«Arabic narration» حرفًا، فيتكلّم الفيديو عربيًّا بأيّ لغة واجهة ولو كتب المستخدم كلامه بالإنجليزيّة.
   params.lang (لغة الواجهة من العميل) من اللغات الثلاث عشرة الأخرى = الكلام المسموع بها؛ والتهنئتان المكتوبتان بالعربيّة بصيغتهما
   العالميّة. بلا لغة أو بالعربيّة = القالب كما كان حرفيًّا (المحادثة لا ترسلها). الخطّ العربيّ موضوعه الحروف العربيّة فلا يُمسّ. */
const SPEECH_LANGS = { en: 'English', fr: 'French', es: 'Spanish', tr: 'Turkish', ru: 'Russian', zh: 'Mandarin Chinese', hi: 'Hindi', ur: 'Urdu', bn: 'Bengali', ne: 'Nepali', ml: 'Malayalam', id: 'Indonesian', fil: 'Filipino' };
function speechLang(key, prompt, lang) {
  const L = SPEECH_LANGS[String(lang || '').toLowerCase()];
  if (!L || key === 'calligraphy') return prompt;
  return prompt
    .replace(/\bin Gulf Arabic dialect\b/g, 'in ' + L)
    .replace(/\bin Arabic\b/g, 'in ' + L)
    .replace(/\bArabic narration\b/g, L + ' narration')
    .replace(/'عيد مبارك \{name\}'/g, "'Eid Mubarak, {name}'")
    .replace(/'رمضان مبارك \{name\}'/g, "'Ramadan Mubarak, {name}'");
}
/** يبني أمر الفيديو لترند معيّن. params: {name, text, sceneIndex, scenes, oneClip, extra, hasImage, people, bg, lang}
 *  scenes (ترند المشاهد): نصّ المستخدم لكلّ مشهد، أو رقم مشهد افتراضيّ لم يُعدَّل (فيبقى أمره الإنجليزيّ).
 *  oneClip (المحادثة): مشاهد المستخدم كلّها لقطات في مقطع واحد (sceneCount ١) — بلاها المشهد الأوّل الافتراضيّ.
 *  opts.cap (من الخادم وحده): سقف الأمر الذي تُحسب منه مساحة «اكتب اللي تبيه» — veo-create يمرّر حدّه الحقيقيّ. */
function buildTrendPrompt(key, params, opts) {
  const t = TRENDS[key];
  if (!t) return null;
  const p = sceneParams(key, params);
  const name = clean(p.name) || clean(p.text) || '';
  const text = clean(p.text) || clean(p.name) || '';
  let prompt = speechLang(key, t.prompt, p.lang);
  let n = 1;
  if (t.scenes && t.scenes.length) {
    const list = Array.isArray(p.scenes) ? p.scenes.slice(0, 50).map((e) => (Number.isInteger(e) && e >= 0 && e < t.scenes.length) ? t.scenes[e]
      : clean(typeof e === 'string' ? e : '')).filter(Boolean).slice(0, MAX_SCENES) : [];
    const scenes = list.length ? list : t.scenes;
    n = scenes.length;
    const i = Math.max(0, Math.min(n - 1, parseInt(p.sceneIndex, 10) || 0));
    const fill = (s) => s.replace(/\{name\}/g, name || 'the child').replace(/[\s.。]+$/, ''); /* القالب يضع النقطة بعده */
    let scene = fill(scenes[i]);
    /* v-chat-trend-scenes (المالك، الخيار «أ»): المحادثة تصنع مقطعًا واحدًا ٨ ثوانٍ — مشاهد المستخدم كلّها لقطات فيه بالترتيب
       بدل «scene 1 of n» الذي يصنع أوّلها وحده. حصّة كلّ مشهد من ١٠٠٠ حرف فلا يُقصّ آخرها ولا قفل الذيل. بلا مشاهد مستخدم
       = المشهد الأوّل الافتراضيّ كما كان. */
    if (p.oneClip && list.length) {
      const share = Math.min(400, Math.floor(1000 / n));
      const shots = list.map((s) => fill(s.slice(0, share)));
      scene = n > 1 ? 'one short story told in ' + n + ' consecutive shots within this single clip, in this exact order — '
        + shots.map((s, k) => 'shot ' + (k + 1) + ': ' + s).join('; ') : shots[0];
      n = 1;
    }
    /* مشهد واحد: «scene 1 of 1» لا معنى لها؛ وبلا اسم: «child named ,» تصير «child» */
    prompt = prompt.replace(n > 1 ? '{i}' : ' {i} of {n}', n > 1 ? String(i + 1) : '').replace('{n}', String(n))
      .replace('{scene}', () => scene).replace(' named {name}', name ? ' named {name}' : '')
      .replace('{look}', p.hasImage ? ' whose look is based on the reference image, rendered in Pixar 3D style' : '');
  }
  prompt = prompt.replace(/\{name\}/g, name).replace(/\{text\}/g, text || 'a joyful moment');
  /* v-trend-identity-2 (المالك: «الفيديوات كلّها تغيّر الأشكال… أريد نفس شكل الشخصيّة الي أحطّها»):
     قفل الهويّة (v-trend-identity) كان يُلحق مرّة واحدة في الذيل فقط — نفس الضعف الذي شُخِّص وعُولج
     في أنماط الصور (v-pstyle-identity): «جملة احفظ الهويّة لا تُقاس بوجودها بل بموضعها وبما يليها»،
     وهناك الحلّ كان فقرة هويّة **أوّلًا** (أولويّة) مع تذكير أخير (حداثة) معًا لا أحدهما. القوالب الـ٤٥
     تبدأ كلّها بأمر التحويل/المشهد مباشرة («Transform the person…» أو نظيره) بلا مرساة هويّة قبله؛
     هذه الفقرة تُلحق أوّلًا هنا (والقفل القائم في الذيل يبقى كما هو). بلا نداء إضافيّ ولا كلفة، ومتوافقة
     مع الأساليب الفنّيّة (بيكسار/جيبلي/الخ) لأنّها تقول «مهما أعاد المشهد رسمه» لا «كما صُوِّر». */
  /* v-two-people (المالك: «إذا حطيت صورة شخصيّتين يغيّر الشخصيّة الثانية فقط — وحدة تمام والثانية يغيّر الشكل كامل»):
     فقرة الأولويّة وقفل الذيل كانا بصيغة «الشخص» المفرد — يحميان شخصًا واحدًا، والثاني لا يحرسه إلّا سطر «IMPORTANT».
     مع أكثر من شخص تصيران بصيغة الجمع: كلّ واحد بوجهه هو. الشخص الواحد كما كان حرفيًّا. */
  const nPeople = Math.max(1, Math.min(3, parseInt(p.people, 10) || 1));
  if (p.hasImage && nPeople > 1) {
    prompt = 'WHO THEY ARE (read first): the reference image shows ' + nPeople + ' real, specific people — not characters'
      + ' to invent. Each one\'s face shape, eyes, eyebrows, nose, lips, jawline, skin tone, hair and build belong to'
      + ' that person alone and must carry through recognizably into the video, however the scene below restyles, ages,'
      + ' dresses or animates them. Never invent a new face for any of them, never average them into generic faces,'
      + ' never swap faces between them.\n\nSCENE: ' + prompt;
  } else if (p.hasImage) {
    prompt = 'WHO THEY ARE (read first): the reference image shows a real, specific person — not a character'
      + ' to invent. Their face shape, eyes, eyebrows, nose, lips, jawline, skin tone, and hair belong to them'
      + ' and must carry through recognizably into the video, however the scene below restyles, ages, dresses'
      + ' or animates them. Never invent a new face, never average it into a generic one, never swap it for'
      + ' someone else\'s.\n\nSCENE: ' + prompt;
  }
  /* v-trend-people: أكثر من شخص في أوّل إطار — القوالب الـ٤٥ مكتوبة بصيغة «الشخص»، فنُلحق
     شرطًا واحدًا بدل تعديلها كلّها: كلّهم يظهرون، وكلّ واحد بوجهه هو، ولا يُدمجون في واحد. */
  /* v-trend-notext (المالك بلقطة: ترجمة محروقة في ناتج «سوق التراث» حروفها مكسورة — «غيوييةامة يه
     حادافلا سخحلں»): محرّكات الفيديو لا تصل العربيّة ولا تعكس اتّجاهها، فكلّ نصّ تكتبه على الإطار يخرج
     ركامًا. و{text} في القوالب **كلام مسموع** لا مكتوب. المنع يُلحق لكلّ الترندات إلّا `calligraphy`
     الذي موضوعه رسم الجملة نفسها، وعنوان `movieposter` (تحته). النمط نفسه مستعمل في وضع الممثّل
     بصانع الفيديو. */
  /* v-trend-notext-2 (وُجد أثناء v-trend-identity-2، أمر المالك «عالجها»): خمسة قوالب كانت تطلب في
     نصّها نصًّا على الإطار (بطاقة اسم/عنوان) ثمّ يُلحق بها هذا المنع نفسه فيناقضها — العنوان لا يظهر
     أصلًا. أربعة منها (تخرّج/مولود/رمضان/عيد) حُوِّلت أعلاه إلى **كلام مسموع** بدل بطاقة مكتوبة (نفس
     مبدأ {text} أعلاه، ونفس درس v-trend-notext) فصار المنع صحيحًا لها بلا تعديل هنا. `movieposter`
     وحده جوهره عنوان مقروء (لا بديل مسموع لملصق فيلم) — يُستثنى كـ`calligraphy` تمامًا، بالمخاطرة
     الموثَّقة نفسها (حروف عربيّة قد تخرج مكسورة إن كتب المستخدم عنوانًا عربيًّا). */
  /* v-trend-backdrops: خلفيّة جديدة لكلّ فيديو من مكتبة ١٠٠ (رقم العميل) — للترندات التي مكانها مرن.
     المكتوب من المستخدم يغلب: إن سمّى مكانًا فهو المكان. */
  const bd = (p.bg !== undefined && p.bg !== null && p.bg !== '') ? BACKDROPS.backdropFor(key, p.bg) : null; /* بلا رقم من العميل = السلوك القديم */
  let addons = '';
  if (bd) addons += ' SETTING (replaces the default location, same action and style): ' + bd + '.';
  /* v-trend-extra (المالك: «ليش ما أقدر أكتب اللي أريده؟»): ٤٦ من ٥٥ ترندًا بلا خانة كتابة أصلًا.
     الآن لكلّ ترند خانة «اكتب اللي تبيه» اختياريّة تُدمج هنا توجيهًا يعدّل الترند ولا يلغيه. */
  const extra = clean(p.extra); /* v-trend-scenes: بعد sceneParams — بلا المشاهد التي قُسِّمت منه */
  if (extra) addons += ' USER DIRECTION (follow it; it wins over the setting if it names a place): ' + extra + '.';
  const base = prompt;
  prompt = '';
  if (key !== 'calligraphy' && key !== 'movieposter') {
    prompt += ' No on-screen text: no subtitles, no captions, no titles, no watermarks, and no letters or'
      + ' words anywhere in the frame. Spoken or sung words are heard only, never written.';
  }
  /* v-trend-identity (المالك بلقطتين: صورة ابنه مقابل ناتج ترند «بيبي ستايل» — «يغيّر الأشكال، شوف
     الاختلاف الكبير»): ٤٥ قالبًا مكتوبة بصيغة «حوّل الشخص إلى…»، وأقوى ما فيها «same facial features»
     ثلاث كلمات في ذيل الأمر — وهو بعينه الضعف الذي عولج في أنماط الصور (v-pstyle-identity). القفل
     يُلحق أخيرًا فيكون آخر ما يقرؤه المحرّك، وصيغته تحفظ الهويّة **عبر** ما يغيّره الترند (سنًّا أو
     زيًّا أو أسلوبًا) لا ضدّه — كصياغة ageshift المثبَتة. */
  if (p.hasImage && nPeople > 1) {
    prompt += ' IDENTITY (mandatory): every one of the ' + nPeople + ' people in the video is the same real person as in the reference image —'
      + ' each keeps their own face shape, eyes, eyebrows, nose, lips, jawline, skin tone, and hair. Whatever this scene changes'
      + ' (age, outfit, style, setting), who each of them is never changes: someone who knows them must recognize every one of them'
      + ' instantly. Never replace any of them with a different, prettier or more generic face.';
  } else if (p.hasImage) {
    prompt += ' IDENTITY (mandatory): the person in the video is the same real person as in the reference image —'
      + ' same face shape, eyes, eyebrows, nose, lips, jawline, skin tone, and hair. Whatever this scene changes'
      + ' (age, outfit, style, setting), who they are never changes: someone who knows them must recognize them'
      + ' instantly. Never replace them with a different, prettier or more generic face.';
  }
  const people = Math.max(1, Math.min(3, parseInt(p.people, 10) || 1));
  if (people > 1) {
    prompt += ' IMPORTANT — the reference image contains ' + people + ' different people: all ' + people
      + ' of them must appear together throughout the video, each keeping their own exact face and identity from the reference image;'
      + ' never merge them into one person, never replace anyone with an invented person, and never drop anyone out of frame.';
  }
  /* v-trend-extra: المحرّكات تقصّ الأمر (Veo/Omni/MiniMax عند ١٥٠٠ حرف، ويُلحق بعده سطر الإطار الأوّل)
     — والذيل (منع الكتابة، قفل الهويّة، شرط الأشخاص) هو الأهمّ. الإضافات تأخذ ما يتبقّى من الميزانيّة
     فقط، فتُقصّ هي ولا يُقصّ الذيل أبدًا. */
  const tail = prompt;
  /* شخص واحد: حدّ المحرّك ١٥٠٠؛ أكثر: يُلحق بعد البناء سطر الإطار الأوّل (≈٣٣٠ حرفًا) فيُحجز له */
  /* v-trend-scenes (قياس أثناء المراجعة): مع صورة شخصين كان «اكتب اللي تبيه» يسقط كلّه في الـ٥٥ ترندًا، ومع شخص واحد يُقصّ في ١٦
     — السقفان ١٤٨٠/١١٧٠ من زمن حدّ ١٥٠٠، وحدّ Veo للترندات ٢٦٠٠ (v-video-photo-identity). veo-create يمرّر سقفه بعد حجز
     FRAME_LOCK؛ بقيّة المسارات (١٥٠٠) كما كانت حرفيًّا. */
  const cap = (opts && opts.cap > 0) ? opts.cap : (people > 1 ? 1170 : 1480);
  const room = Math.max(0, cap - base.length - tail.length);
  prompt = base + (addons.length > room ? addons.slice(0, room) : addons) + tail;
  return { prompt, engine: t.engine, ratio: t.ratio, people, sceneCount: n };
}
/* v-video-identity (المالك بفيديو «سفينة حربيّة» وصورته: «يغيّر الشخصيّة، مش نفس الشخصيّة»): صانع الفيديو
   الحرّ (Omni وVeo) كان يرسل الصورة مع وصف المستخدم **بلا أيّ أمر يحفظ الوجه** — الترندات وحدها كان لها
   قفل. فيأخذ المحرّك الصورة إلهامًا ويخترع وجهًا (في الفيديو: وجه أنحف، أنف آخر، لحية أخفّ، بلا ابتسامته).
   الغلاف نفسه: مرساة أوّلًا وقفل أخيرًا، ووصف المستخدم يُقصّ هو ليبقى القفلان داخل حدّ المحرّك. */
/* v-video-photo-identity: `subject` يسمّي الصورة كما يفهمها المحرّك — Omni يربط الصورة بدورها بوسم
   <IMAGE_REF_0> داخل النصّ (بلا وسم «يقرّر النموذج كيف يستعملها» — توثيق المزوّد). الافتراضيّ كما كان. */
/* v-two-people: `people` (اختياريّ) — صورة فيها شخصان أو أكثر (عدّهم كشف الوجوه في أوّل الإطار): القفلان بصيغة الجمع،
   كلّ واحد بوجهه ولا تبادل بينهم. بلا عدد = المفرد كما كان حرفيًّا. */
/* v-video-speech-pace: tail (اختياريّ) = قاعدة توقيت الكلام — بعد الوصف وقبل سطر القفل (القفل آخرًا كما كان)، ويُقصّ الوصف لا هي، والطول ≤ الحدّ */
function withIdentityLock(promptText, max, subject, people, tail) {
  const cap = max || 1500;
  const t = String(tail || '');
  const n = Math.max(1, Math.min(3, parseInt(people, 10) || 1));
  const pre = n > 1
    ? 'MAIN CHARACTERS: the ' + n + ' real people in ' + (subject || 'the attached reference photo') + ' — keep each person\'s own exact face (face shape, eyes, eyebrows, nose, lips, jawline, beard, skin tone, hair) in every shot, never swapped or merged. '
    : 'MAIN CHARACTER: the real person in ' + (subject || 'the attached reference photo') + ' — keep their exact face (face shape, eyes, eyebrows, nose, lips, jawline, beard, skin tone, hair) in every shot. ';
  const post = n > 1
    ? ' IDENTITY (mandatory): every person who appears is one of these same ' + n + ' real people from the photo, each with their own face — never a different, prettier or generic face; someone who knows them must recognize every one of them instantly.'
    : ' IDENTITY (mandatory): whenever a person appears, it is this same real person from the photo — never a different, prettier or generic face; someone who knows them must recognize them instantly.';
  const body = String(promptText || '').trim().slice(0, Math.max(0, cap - pre.length - post.length - t.length)) + t;
  return pre + body + post;
}
/* v-photo-as-is: الصورة نفسها أوّل إطار — قفل محايد بلا «شخص حقيقيّ» ولا «واقعيّ» (كانا يحوّلان الكرتون والأفاتار إنسانًا):
   الصورة تبقى صورة، والرسم يبقى رسمًا، والمنتج يبقى منتجًا؛ والوصف يحدّد الحركة والمكان والكاميرا وحدها لا الشكل. */
function withPhotoLock(promptText, max, subject, tail) {
  const cap = max || 1500;
  const t = String(tail || ''); // v-video-speech-pace: كقفل الهويّة
  /* مراجعة ٢٧ أكتوبر: بطول قفل الهويّة أو أقصر (حدود VEO_FREE_IMAGE_MAX قيست عليه — كلام الممثّل و«بلا ترجمة» لا يُقصّان)، وبلا «وجه» ولا
     «IDENTITY» (صورة منتج لا يُخترع لها شخص — v-ai-video-speed) */
  /* v-video-identity-pose (المالك ٣ نوفمبر: «تغير ملامح الشخصية» — صورته ووجهه نازل للجوال و«يطالع الكاميرا» فاخترع المحرّك وجهًا أماميًّا):
     أيّ التفات نحو الكاميرا صغير وبطيء من زاوية الصورة نفسها — ما لم تُظهره الصورة لا يُرسم من جديد دفعة واحدة. والطول كما كان ≤ قفل الهويّة. */
  const pre = 'MAIN SUBJECT: whoever or whatever is in ' + (subject || 'the attached image') + ' — keep it exactly as shown (look, proportions, colours, clothes, art style) in every shot; the description sets action, place, camera — any turn to the camera is small and slow. ';
  const post = ' SUBJECT (mandatory): the same throughout — a photo stays a photo, a drawing a drawing, never more realistic or generic.';
  const body = String(promptText || '').trim().slice(0, Math.max(0, cap - pre.length - post.length - t.length)) + t;
  return pre + body + post;
}
/* v-video-speech-pace (المالك ١٧ نوفمبر ٢٠٢٦: «اصلح مسار الفيديوهات السينمائي وفيديو سريع — الاصوات تتراكب على بعضها، وثاني شي
   الكلام غير متناسق»): المقطعان اللذان صنعهما صباحها («سينمائي» ١٠ث و٨ث، حوار أمّ وبنت عن اليوم الوطني) فُرّغا بـWhisper محلّيًّا:
   ستّة أدوار في ١٠ ثوانٍ بلا وقفة بين المتكلّمين والصوتان معًا عند ١٫٧ث، وآخر جملة مقطوعة عند نهاية المقطع في الاثنين.
   الجذر: الوصف الحرّ يصل المحرّك (Omni في «سينمائي»، H3 في «سريع» — كلاهما يولّد الكلام بنفسه) بلا أيّ قاعدة لتوقيت الكلام،
   والمقطع ٥–١٠ ثوانٍ، فيحشر الحوار كلّه فيه. هنا قاعدة قصيرة تُلحق بالوصف حين يطلب كلامًا: صوت واحد في كلّ لحظة ووقفة بين
   الأدوار، والجملة كاملة بنطق متّزن ومتزامنة مع شفتي المتكلّم، والكلام ينتهي قبل آخر ثانية بقدر ما تتّسع له المدّة — وإن لم يتّسع
   فجمل أقلّ كاملة لا جمل مسرعة أو مقطوعة. بلا كلام في الوصف = الأمر كما كان حرفيًّا. الترندات لها قوالبها فلا تمرّ هنا. */

/* (v-video-speech-pace) التشكيل والتطويل يُحذفان قبل البحث («يتكلّم» = «يتكلم») */
function speechPlain(s) { return String(s || '').replace(/[\u064B-\u065F\u0670\u0640]/g, ''); }

/* كلام بين علامتي تنصيص (حرفان فأكثر)، أو سطر يبدأ باسم متكلّم ونقطتين («الأم: …»، «Mom: …») */
const QUOTED = /«[^»]{2,}»|"[^"]{2,}"|“[^”]{2,}”|'[^'\n]{2,}'/;
const SPEAKER_LINE = /(^|\n)\s*[^\s:：\n][^:：\n]{0,24}[:：]\s*\S/;
/* أفعال الكلام وأسماؤه — بالعربيّة بلا تشكيل، وبالإنجليزيّة كلمةً كاملة (الغناء ليس حوارًا فلا يدخل). الإيجاب الكاذب لا يضرّ: القاعدة
   مشروطة «إن تكلّم أحد» */
const AR_SPEECH = /(يقول|تقول|قال|قالت|يسأل|تسأل|سأل|يجيب|تجيب|أجاب|يرد|ترد|يتكلم|تتكلم|يتحدث|تتحدث|يتحاور|تتحاور|حوار|محادثة|دردشة|يسولف|تسولف|سوالف|يحكي|تحكي|يخاطب|تخاطب|ينادي|تنادي|يهمس|تهمس|يرحب|ترحب|كلام|ينطق|تنطق|بصوت)/;
const EN_SPEECH = /\b(say|says|said|saying|asks?|asked|answers?|answered|repl(?:y|ies|ied)|talks?|talking|speaks?|speaking|spoken|dialog(?:ue)?|conversation|chat(?:s|ting)?|narrat\w*|voice-?over|whispers?|shouts?|greets?)\b/i;

function hasSpeech(desc) {
  const s = speechPlain(desc);
  if (!s.trim()) return false;
  return QUOTED.test(s) || SPEAKER_LINE.test(s) || AR_SPEECH.test(s) || EN_SPEECH.test(s);
}

/* كم كلمة تتّسع لها المدّة بنطق متّزن مع وقفات بين الأدوار: ~١٫٧ كلمة في الثانية، وثانية أخيرة بلا كلام
   (المقطع ٨ث اليوم: ثلاث جمل ١٣ كلمة لم تتّسع وقُطعت آخرها) */
/* v-video-full-dialogue: lead = ثواني الصمت المحجوزة (ثانية للمقطع الجديد؛ تمديد فيديو جارٍ بلا افتتاح = EXTEND_SAY_LEAD: ١٦ كلمة في ١٠ث) */
const EXTEND_SAY_LEAD = 0.5;
/* v-video-say-natural (المالك ١٩ نوفمبر عن فيديو «سريع» بحواره كاملًا: «التوقيت خل التوقيت على حسب الكلام مش محدد» — الكلمة تُمطّ قرابة
   ثانية: ٤٤ كلمة في ٣٢ث): المحرّك يملأ المدّة التي نطلبها بالكلام، فمدّة أطول من حاجته = نطق ممطوط. الحساب بنطق طبيعيّ ووقفة بين
   الأدوار: SAY_RATE كلمة في الثانية داخل الدور، و SAY_GAP ثانية بين كلّ دورين، و lead صمت الأوّل والآخر (كان ١٫٧ كلمة/ث للكلّ بلا
   عدّ للأدوار). sayRoom = ما تتّسع له المدّة بوحدة «كلمات + وقفة لكلّ دور»؛ ودور بكلماته يأخذ منها w + SAY_GAP × SAY_RATE. */
const SAY_RATE = 2.2, SAY_GAP = 0.4;
function sayRoom(seconds, lead) { return (seconds - (lead > 0 ? lead : 1) + SAY_GAP) * SAY_RATE; }
/* أقصى كلمات دور واحد تتّسع لها المدّة (للقاعدة في الأمر وللاختبارات) */
function wordBudget(seconds, lead) { return Math.max(4, Math.floor(sayRoom(seconds, lead) - SAY_GAP * SAY_RATE + 1e-9)); }
/* v-video-say-natural (المالك: «اللهجه مش امارتيه»): الكلام العربيّ بلكنة إماراتيّة ما لم يطلب الوصف لهجة أو لكنة بعينها */
const HAS_ARABIC = /[ء-ي]/;
const ASKS_ACCENT = /لهج|لكنة|فصح|accent|dialect/i;

/* «ممثل يتكلم» (احتياطه يمرّ بـveo-create): كلامه بالحرف ومدّته كلامه — قالبه في app-11-video.js («saying exactly these Arabic words»)
   لا يمرّ بالقاعدة: «جمل أقلّ» تناقض «بالحرف»، ولا يُقصّ له شيء (video-photo-identity ٥ب) */
const ACTOR_EXACT = /saying exactly these (?:Arabic )?words/i;

/* القاعدة نفسها لكلّ محرّك؛ بالإنجليزيّة (المحرّكات تطيع أوامر التوقيت بها أدقّ) وقصيرة (< ٤٨٠ حرفًا) لأنّها تدخل حدّ الوصف القديم
   نفسه (١٥٠٠/٢٠٠٠) فيُقصّ لها من وصف طويل */
function speechPace(desc, seconds, lead) {
  if (!hasSpeech(desc) || ACTOR_EXACT.test(String(desc || ''))) return '';
  const s = Math.max(3, Math.min(15, Math.round(Number(seconds) || 8)));
  return ' If anyone speaks in this ' + s + '-second clip: one voice at a time — each speaker finishes before the next starts,'
    + ' with a short pause (and any camera cut) between turns; no narrator or background voices over them.'
    + ' Each line is spoken complete and clear at a natural pace, as written, lip-synced to the speaker on screen.'
    + ((HAS_ARABIC.test(String(desc)) && !ASKS_ACCENT.test(speechPlain(desc))) ? ' Arabic in an Emirati Gulf accent, word for word.' : '')
    + ' All speech ends before the last second: every line is said, in order — never overlap two voices or cut a line off.';
}

/* بلا صورة (لا قفل): الوصف ثمّ القاعدة داخل حدّ الوصف نفسه — يُقصّ الوصف لا هي (مع صورة تدخل القفل نفسه: withIdentityLock/withPhotoLock tail) */
function fitPace(text, pace, cap) {
  const t = String(text || '').trim();
  return pace ? t.slice(0, Math.max(0, cap - pace.length)) + pace : t;
}

/* v-video-dialogue-fit (المالك ١٧ نوفمبر بعد #1341: «كأنّي في سوق السمك… الحوار ليس بالدقّة والحوار سريع» — مقطعه «سريع» من النسخة
   الجديدة: ست جمل (~٢٦ كلمة) في ١٠ث بلا وقفة. القاعدة في الأمر لا تكفي: المحرّك يقرأ كلّ حوار يجده في الوصف. اختار «مقطع واحد مع
   تنبيه»): أدوار الحوار في الوصف — سطر «اسم: كلام»، أو كلام بين تنصيص — تُعدّ كلماتها، ويصل المحرّك منها بالترتيب ما تتّسع له المدّة
   (wordBudget، والأوّل دائمًا)، والباقي يُحذف من الوصف (السطر كلّه، أو الجملة التي فيها التنصيص). المشهد والوصف كما هما.
   الدالّة نفسها حرفيًّا في js/app-11-video.js — العميل ينبّه بها قبل الخصم («سيُقال إلى: …») — واختبار video-dialogue-fit يقارن النصّين. */
/* v-video-dialogue-clips: قارئ أدوار الحوار وحده — يشترك فيه القصّ (fitDialogue) وتوزيع الحوار على مقاطع (planDialogue في العميل).
   كلّ دور: موضعه في الوصف (a..b)، وكلماته w، ونصّه said، وما يسبقه lead («الأم: » أو «والأم ترد: ») وعلامتا تنصيصه. */
function dialogueTurns(desc) {
  const s = String(desc || '');
  const turns = [];
  if (/saying exactly these (?:Arabic )?words/i.test(s)) return turns; // «ممثل يتكلم»: كلامه بالحرف
  const words = (x) => String(x || '').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  /* v-video-full-dialogue: عناوين المشهد («🇦🇪 مشهد قصير: أحب وطني»، «الشخصيات: طفلة وأمها») ليست كلامًا — كانت تُحسب أدوارًا فتأكل من
     ميزانيّة الكلام وتطيل التوليدة. العنوان يُقارن بحروفه وحدها (بلا رموز ولا تشكيل) */
  const notSpeaker = /^(?:المكان|(?:ال)?مشهد(?: \S+){0,2}|الزمان|الوقت|الكاميرا|التصوير|الأسلوب|الستايل|الإضاءة|الموسيقى|الخلفية|ملاحظة|(?:ال)?شخصيات|العنوان|الوصف|الفكرة|scene(?: \S+){0,2}|setting|location|place|time|camera|shot|style|lighting|music|background|note|characters?|cast|title|description)$/i;
  const label = (x) => String(x).replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  let off = 0;
  for (const line of s.split('\n')) {
    /* سطر فيه تنصيصان فأكثر («البنت تسأل: «…» والأم ترد: «…»») = عدّة أدوار تُعدّ بتنصيصاتها، لا دور واحد باسم قبل النقطتين */
    const m = (line.match(/«[^»]+»|"[^"]+"|“[^”]+”/g) || []).length < 2 && /^\s*([^\s:：][^:：]{0,24}?)\s*[:：]\s*(\S.*)$/.exec(line);
    if (m && !/\d$/.test(m[1]) && !notSpeaker.test(label(m[1]))) {
      turns.push({ a: off, b: Math.min(s.length, off + line.length + 1), w: words(m[2].replace(/[«»"“”]/g, ' ')), said: m[2].trim(), lead: m[1].trim() + ': ', open: '', close: '', line: true });
    } else {
      const re = /«([^»]+)»|"([^"]+)"|“([^”]+)”/g;
      let q, prev = off;
      while ((q = re.exec(line))) {
        const qa = off + q.index, before = s.slice(prev, qa);
        const cut = Math.max(before.lastIndexOf('.'), before.lastIndexOf('؟'), before.lastIndexOf('?'), before.lastIndexOf('!'), before.lastIndexOf('،'));
        const said = (q[1] || q[2] || q[3]).trim(), from = cut >= 0 ? prev + cut + 1 : prev;
        turns.push({ a: from, b: qa + q[0].length, w: words(said), said, lead: s.slice(from, qa).replace(/^\s+/, ''), open: q[0][0], close: q[0][q[0].length - 1], line: false });
        prev = qa + q[0].length;
      }
    }
    off += line.length + 1;
  }
  return turns;
}
function fitDialogue(desc, seconds, lead) {
  const s = String(desc || '');
  const sec = Math.max(3, Math.min(15, Math.round(Number(seconds) || 8)));
  /* v-video-say-natural: نطق طبيعيّ (٢٫٢ كلمة/ث) ووقفة ٠٫٤ث بين الأدوار — budget بوحدة «كلمات + ٠٫٨٨ لكلّ دور» */
  const budget = (sec - (lead > 0 ? lead : 1) + 0.4) * 2.2;
  const turns = dialogueTurns(s);
  const res = { text: s, budget, turns: turns.length, kept: 0, dropped: 0, words: turns.reduce((n, t) => n + t.w, 0), keptWords: 0, last: '' };
  let used = 0, kept = 0, room = 0;
  for (const t of turns) { if (kept && room + t.w + 0.4 * 2.2 > budget + 1e-9) break; room += t.w + 0.4 * 2.2; used += t.w; kept++; }
  res.kept = kept; res.keptWords = used; res.last = kept ? turns[kept - 1].said : '';
  if (kept === turns.length) return res;
  let out = s;
  for (let i = turns.length - 1; i >= kept; i--) out = out.slice(0, turns[i].a) + out.slice(turns[i].b);
  res.text = out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
  res.dropped = turns.length - kept;
  return res;
}

module.exports = { TRENDS, buildTrendPrompt, withIdentityLock, withPhotoLock, splitScenes, sceneParams, MAX_SCENES, SPEECH_LANGS,
  hasSpeech, speechPace, wordBudget, sayRoom, SAY_RATE, SAY_GAP, EXTEND_SAY_LEAD, fitPace, fitDialogue, dialogueTurns }; // v-video-speech-pace · v-video-dialogue-fit · v-video-dialogue-clips
