// v-studio-14: أوامر الميزات الأربع عشرة الجديدة لستايل الذكاء الاصطناعي (تُدمج في studio-create)
'use strict';
const STYLE_PROMPTS = {
 "idphoto": {
  "white": "an official ID photo with a plain pure white background, head-and-shoulders framing, even soft studio lighting, neat formal attire",
  "blue": "an official ID photo with a plain light blue background, head-and-shoulders framing, even soft studio lighting, neat formal attire",
  "passport": "a passport-style photo: plain white background, face centered and fully visible, neutral expression, head-and-shoulders framing",
  "residence": "a residence / ID card photo: plain light background, centered face, neutral expression, formal collar",
  "suit": "a professional portrait wearing a tailored dark formal suit with a white shirt, plain neutral background",
  "kandoraformal": "a formal portrait wearing a crisp white kandora with a white ghutra and black agal, plain neutral background",
  "linkedin": "a professional LinkedIn headshot: smart business attire, soft studio light, blurred neutral grey background, confident subtle smile",
  "graduation": "a graduation portrait wearing a black graduation gown and cap with a tassel, plain elegant background"
 },
 "hijab": {
  "gulf": "a Gulf-style hijab: a flowing black sheila draped loosely with an elegant black abaya",
  "turkish": "a Turkish-style hijab: a structured satin scarf neatly wrapped and pinned, with a modest chic outfit",
  "modern": "a modern minimal hijab wrap in a soft neutral tone with a contemporary modest outfit",
  "shayla": "a classic black shayla with a plain black abaya",
  "colored": "a colored abaya in a rich jewel tone with a matching hijab",
  "embroidered": "a black abaya with fine gold embroidery and a matching embroidered sheila",
  "sport": "a sport hijab with a modest athletic outfit",
  "bridal": "a bridal white hijab with delicate lace and pearls over an elegant white gown"
 },
 "gulfmen": {
  "whiteghutra": "a white kandora with a crisp white ghutra and black agal",
  "redshemagh": "a white thobe with a red-and-white checkered shemagh and black agal",
  "bwshemagh": "a white thobe with a black-and-white checkered shemagh and black agal",
  "cobra": "a white kandora with a white ghutra folded in the raised \"cobra\" style with agal",
  "hamdaniya": "a white kandora with a white hamdaniya headscarf wrapped Emirati style without agal",
  "coloredkandora": "a colored kandora in soft grey or beige with a white ghutra and agal",
  "qatari": "a Qatari-style white thobe with a stiff white ghutra draped in the Qatari way and agal",
  "kuwaiti": "a Kuwaiti-style white dishdasha with a Kuwaiti collar, white ghutra and agal"
 },
 "menhair": {
  "fade": "a clean skin-fade haircut with a short textured top",
  "pompadour": "a voluminous pompadour hairstyle",
  "curlytop": "a curly top with faded sides",
  "manbun": "long hair tied up in a man bun",
  "buzz": "a very short buzz cut",
  "longmen": "shoulder-length long hair for men",
  "sidepart": "a classic side-part hairstyle",
  "undercut": "a disconnected undercut with a slicked-back top",
  "quiff": "a textured quiff hairstyle",
  "afro": "a natural afro hairstyle"
 },
 "henna": {
  "gulfhenna": "intricate Gulf (Khaleeji) henna with floral vine patterns on the hands",
  "indianhenna": "dense traditional Indian bridal mehndi patterns covering the hands",
  "sudanese": "bold Sudanese henna with large geometric floral motifs",
  "bridalhenna": "elaborate bridal henna covering the hands up to the forearms",
  "minimal": "a small delicate minimalist henna design on the back of the hand",
  "feet": "traditional henna patterns on the feet and ankles",
  "whitehenna": "white henna lace-style patterns on the hands",
  "khidab": "black khidab-style henna patterns on the hands"
 },
 "wedding": {
  "bride": "a classic white bridal gown with a veil, elegant bridal makeup and an updo",
  "gulfbride": "a luxurious Gulf bridal look: ornate white gown, gold jewelry, glamorous makeup",
  "groom": "a sharp black tuxedo with a bow tie and groomed hair",
  "gulfgroom": "a Gulf groom look: white kandora, white ghutra, black agal and a gold-trimmed bisht",
  "indianbride": "an Indian bridal lehenga in red and gold with heavy jewelry and bridal makeup",
  "moroccanbride": "a Moroccan bridal caftan with an ornate gold belt and jewelry",
  "engagement": "an elegant engagement outfit in soft pastel with refined makeup",
  "hennanight": "a henna-night look: traditional embroidered dress in green and gold tones with festive jewelry"
 },
 "accessories": {
  "watch": "a luxury wristwatch",
  "earrings": "elegant statement earrings",
  "necklace": "a fine gold necklace",
  "hat": "an elegant wide-brim hat",
  "cap": "a sporty baseball cap",
  "bag": "a luxury designer handbag",
  "bracelet": "stacked gold bracelets",
  "scarf": "a silk scarf"
 },
 "eyes": {
  "blue": "a natural blue eye color",
  "green": "a natural green eye color",
  "hazel": "a natural hazel eye color",
  "grey": "a natural grey eye color",
  "whiteteeth": "naturally whiter, brighter teeth",
  "bigsmile": "a bright natural wide smile",
  "lashes": "fuller, longer natural eyelashes",
  "brows": "neatly shaped, defined eyebrows"
 },
 "body": {
  "athletic": "a lean athletic build",
  "muscular": "a muscular, well-defined build",
  "slim": "a slim, slender build",
  "toned": "a toned, fit build",
  "flatstomach": "a flat, toned stomach",
  "posture": "an upright, confident posture with shoulders back"
 },
 "background": {
  "studio": "a professional dark studio backdrop with soft golden light",
  "beach": "a sunny beach with sea and sky",
  "city": "a city skyline at night with bokeh lights",
  "office": "a modern bright office",
  "desert": "golden desert dunes at sunset",
  "garden": "a lush green garden",
  "luxury": "a luxurious palace interior with marble and chandeliers",
  "plainwhite": "a plain pure white background"
 },
 "palette": {
  "spring": "a warm light spring color palette (peach, coral, warm greens)",
  "summer": "a cool soft summer palette (lavender, dusty rose, soft blue)",
  "autumn": "a warm deep autumn palette (rust, olive, mustard, camel)",
  "winter": "a cool vivid winter palette (royal blue, emerald, black and white)",
  "warm": "warm earthy tones",
  "cool": "cool blue-based tones",
  "jewel": "rich jewel tones (emerald, sapphire, ruby)",
  "pastel": "soft pastel tones"
 },
 "seasons": {
  "eid": "a festive Eid look: a crisp new kandora or elegant dress with refined accessories, celebratory mood",
  "ramadan": "an elegant Ramadan evening look with a modest embroidered outfit and warm lantern-lit ambiance",
  "uaenational": "a UAE National Day look with the UAE flag colors (red, green, white, black) in scarf and accessories",
  "saudinational": "a Saudi National Day look with green and white accents and a Saudi flag scarf",
  "winterlook": "a stylish winter outfit with a coat and scarf",
  "summerlook": "a light, airy summer outfit",
  "graduationlook": "a graduation gown and cap in a celebratory setting",
  "party": "a glamorous evening party outfit"
 },
 "iconic": {
  "redcarpet": "a red-carpet gala look with a designer gown and a flash-photography backdrop",
  "oldmoney": "an old-money quiet-luxury look: tailored beige blazer, loafers, classic styling",
  "kpop": "a K-pop idol stage look with trendy styling and colorful stage lighting",
  "hollywood": "a classic 1950s Hollywood glamour look in black and white",
  "footballer": "a football star look in a professional kit on a stadium pitch",
  "royal": "a royal look with an ornate gown, a tiara and a palace setting",
  "streetstyle": "a trendy street-style look with sneakers and oversized outerwear on a city street",
  "bollywood": "a Bollywood glamour look with a vibrant embellished outfit"
 },
 "age": {
  "child": "a child around 7 years old",
  "teen": "a teenager around 16 years old",
  "twenties": "a young adult in their mid-twenties",
  "forties": "an adult in their mid-forties",
  "sixties": "a person in their mid-sixties",
  "elder": "an elderly person around 80 years old"
 }
};
const INSTR = {
 "idphoto": "Turn this photo into {s}. Keep the same person and face exactly, front-facing, neutral or slight smile, sharp focus. Output a single photorealistic image.",
 "hijab": "Change only the head covering and outfit to {s}. Keep the same person, face, pose and background exactly the same. Output a single photorealistic image.",
 "gulfmen": "Change only the outfit and headwear to {s}. Keep the same person, face, pose and background exactly the same. Output a single photorealistic image.",
 "menhair": "Change only the hair to {s}. Keep the same person, face, pose, clothing and background exactly the same, only alter the hairstyle. Output a single photorealistic image.",
 "henna": "Add {s} on the visible hands or feet in this photo, following the natural curves of the skin, realistic reddish-brown henna stain. Keep everything else exactly the same. Output a single photorealistic image.",
 "wedding": "Change the outfit, hair styling and makeup to {s}. Keep the same person, face and pose; the identity must stay clearly recognizable. Output a single photorealistic image.",
 "accessories": "Add {s} to the person, placed naturally and realistically. Keep everything else in the photo exactly the same. Output a single photorealistic image.",
 "eyes": "Apply {s}. Keep the same person, identity, pose and background exactly the same and fully realistic. Output a single photorealistic image.",
 "body": "Change the body shape to {s} while keeping the same face, identity, clothing style, pose and background; keep proportions realistic. Output a single photorealistic image.",
 "background": "Replace only the background with {s}, matching the lighting and perspective naturally. Keep the person, pose and outfit exactly the same. Output a single photorealistic image.",
 "palette": "Recolor the outfit and accessories in {s} that flatters the person's skin tone. Keep the same person, face, pose and background. Output a single photorealistic image.",
 "seasons": "Change the outfit and styling to {s}. Keep the same person, face and pose; the identity must stay clearly recognizable. Output a single photorealistic image.",
 "iconic": "Restyle the outfit, hair and setting into {s} while keeping the same person and face clearly recognizable. Output a single photorealistic image.",
 "age": "Change the apparent age of the person to {s} while keeping the same identity, features and expression. Output a single photorealistic image."
};
const FEATURE_INSTRUCTIONS = {};
Object.keys(INSTR).forEach((k) => { FEATURE_INSTRUCTIONS[k] = (style) => INSTR[k].replace('{s}', style); });
// جنس نموذج المعاينة لكل خيار (m/w) — لتوليد صور المعاينة من نماذجنا
const PREVIEW_SUBJECT = {
 "idphoto": {
  "__tab": "w",
  "white": "w",
  "blue": "w",
  "passport": "m",
  "residence": "w",
  "suit": "m",
  "kandoraformal": "m",
  "linkedin": "w",
  "graduation": "w"
 },
 "hijab": {
  "__tab": "w",
  "gulf": "w",
  "turkish": "w",
  "modern": "w",
  "shayla": "w",
  "colored": "w",
  "embroidered": "w",
  "sport": "w",
  "bridal": "w"
 },
 "gulfmen": {
  "__tab": "m",
  "whiteghutra": "m",
  "redshemagh": "m",
  "bwshemagh": "m",
  "cobra": "m",
  "hamdaniya": "m",
  "coloredkandora": "m",
  "qatari": "m",
  "kuwaiti": "m"
 },
 "menhair": {
  "__tab": "m",
  "fade": "m",
  "pompadour": "m",
  "curlytop": "m",
  "manbun": "m",
  "buzz": "m",
  "longmen": "m",
  "sidepart": "m",
  "undercut": "m",
  "quiff": "m",
  "afro": "m"
 },
 "henna": {
  "__tab": "w",
  "gulfhenna": "w",
  "indianhenna": "w",
  "sudanese": "w",
  "bridalhenna": "w",
  "minimal": "w",
  "feet": "w",
  "whitehenna": "w",
  "khidab": "w"
 },
 "wedding": {
  "__tab": "w",
  "bride": "w",
  "gulfbride": "w",
  "groom": "m",
  "gulfgroom": "m",
  "indianbride": "w",
  "moroccanbride": "w",
  "engagement": "w",
  "hennanight": "w"
 },
 "accessories": {
  "__tab": "w",
  "watch": "m",
  "earrings": "w",
  "necklace": "w",
  "hat": "m",
  "cap": "m",
  "bag": "w",
  "bracelet": "w",
  "scarf": "w"
 },
 "eyes": {
  "__tab": "w",
  "blue": "w",
  "green": "w",
  "hazel": "w",
  "grey": "w",
  "whiteteeth": "w",
  "bigsmile": "w",
  "lashes": "w",
  "brows": "w"
 },
 "body": {
  "__tab": "m",
  "athletic": "m",
  "muscular": "m",
  "slim": "w",
  "toned": "w",
  "flatstomach": "m",
  "posture": "w"
 },
 "background": {
  "__tab": "w",
  "studio": "w",
  "beach": "w",
  "city": "m",
  "office": "m",
  "desert": "m",
  "garden": "w",
  "luxury": "w",
  "plainwhite": "w"
 },
 "palette": {
  "__tab": "w",
  "spring": "w",
  "summer": "w",
  "autumn": "w",
  "winter": "w",
  "warm": "w",
  "cool": "w",
  "jewel": "w",
  "pastel": "w"
 },
 "seasons": {
  "__tab": "w",
  "eid": "m",
  "ramadan": "w",
  "uaenational": "m",
  "saudinational": "m",
  "winterlook": "w",
  "summerlook": "w",
  "graduationlook": "w",
  "party": "w"
 },
 "iconic": {
  "__tab": "w",
  "redcarpet": "w",
  "oldmoney": "m",
  "kpop": "w",
  "hollywood": "m",
  "footballer": "m",
  "royal": "w",
  "streetstyle": "m",
  "bollywood": "w"
 },
 "age": {
  "__tab": "w",
  "child": "w",
  "teen": "w",
  "twenties": "w",
  "forties": "m",
  "sixties": "m",
  "elder": "m"
 }
};
module.exports = { STYLE_PROMPTS, FEATURE_INSTRUCTIONS, PREVIEW_SUBJECT };
