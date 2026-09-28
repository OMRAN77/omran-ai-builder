// 👗 v-fashion-variety — كتالوج تنويع أداة الأزياء (المالك، ٢٨ سبتمبر ٢٠٢٦):
// «الديزينات واحده… الشكل واحد مافي تنوع في الملابس. على الأقل في كل خاصيّة ١٠٠ نوع… مافي أحد يشتري
//  الخاصيّة إذا دزاين واحد».
//
// الجذر: كلّ نمط كان جملة وصف ثابتة واحدة في fashion-create.js («an elegant evening gown style…») —
// الأمر نفسه حرفيًّا في كلّ ضغطة، فيرجع النموذج إلى الشكل «الافتراضيّ» للنمط كلّ مرّة.
//
// الحلّ بلا أيّ نداء إضافيّ ولا كلفة: لكلّ فئة×نمط ثلاثة محاور تصميم —
//   (١) القصّة/الهيئة  (٢) الياقة والأكمام أو الطبقة العلويّة  (٣) القماش والتفاصيل
// وحاصل ضربها ≥ ١٠٠ تصميم مختلف لكلّ نمط (يثبته tests/fashion-variety.test.cjs). والعميل يرسل عدّادًا
// (variant) يزيد مع كلّ توليد، فيُحوَّل هنا بتبديل ثابت (خطوة أوّليّة مع العدد) إلى رقم تصميم:
// لا يتكرّر تصميم حتّى تنفد تصاميم النمط كلّها، والهيئة (المحور الأوّل) تتغيّر في كلّ ضغطة حتمًا.
// ومثلها لكلّ إضافة (نظارات، ساعة، حقيبة، حذاء، وشاح، مكياج) ≥ ١٠٠ نوع، ولوحة ألوان تتبدّل حين لا
// يختار المستخدم ألوانه.
//
// الصيغة: المحاور مفصولة بـ « // » والخيارات بـ « | ». الخيار المسبوق بـ«!» غير محتشم (فتحة، كتف
// مكشوف، شفّاف، قصير…) — يُسقَط حين يلزم الاحتشام (العباية، التقليديّ، المناسبة الدينيّة)، وإن كان
// في محور الياقة والأكمام منها شيء استُبدل المحور كلّه بياقات محتشمة بأكمام طويلة (MODEST_NECK).
// للأطفال: «girl: … / boy: …» نسختان في خيار واحد، والأمر يطلب ما يطابق الطفل.
// لا أسماء ماركات ولا شعارات ولا نصوص، ولا ألوان في محاور القصّة — اللون من اختيار المستخدم أو لوحة.
'use strict';

const WOMEN = {
  evening:
    'a mermaid silhouette fitted to the knee with a soft flared train | a flowing floor-length A-line skirt | a sleek floor-length column silhouette | a draped Grecian silhouette gathered at the waist | a full floor-length ball skirt with a fitted bodice | !a fluid skirt with a high front slit' +
    ' // !an off-the-shoulder neckline | !a one-shoulder asymmetric neckline | a high neck with long fitted sleeves | a square neckline with sculpted puff sleeves | !a plunging V-neck with floating cape sleeves | a boat neckline with long bell sleeves' +
    ' // liquid satin with a draped waist | crystal-beaded tulle over a satin lining | velvet with a sculpted bow at the back | hand-embroidered lace appliques on a lined bodice | layered chiffon with a jeweled belt | ombre sequins fading toward the hem',
  formal:
    'a single-breasted trouser suit | !a pencil-skirt suit | a double-breasted blazer with wide-leg trousers | !a structured sheath dress with a matching jacket | a longline blazer over slim cigarette trousers | a belted wrap blazer with straight trousers' +
    ' // notch lapels | peak lapels | a collarless jacket with a clean round neck | a shawl collar | a mandarin collar | a soft pussy-bow blouse under the jacket' +
    ' // fine wool crepe | textured boucle | pinstriped suiting | subtle houndstooth | smooth stretch gabardine | tonal jacquard with covered buttons',
  casual:
    'relaxed straight-leg jeans with a tucked top | !a flowy midi skirt with a fitted top | wide-leg linen trousers with a boxy shirt | !a belted shirt dress | a knit co-ord set with wide trousers | a long tiered skirt with a relaxed knit' +
    ' // a crew-neck long-sleeve top | a relaxed button-down shirt | a V-neck cardigan layered over a tee | a striped Breton top | a cropped denim jacket layer | a hooded sweatshirt layer' +
    ' // soft cotton jersey | washed linen | ribbed knit | lightweight denim | brushed fleece | cotton poplin with contrast stitching',
  abaya:
    'an open-front abaya over a matching slip dress | a closed kaftan-cut abaya | a butterfly-cut abaya with wide flowing panels | a belted wrap abaya | an A-line abaya flaring from the shoulders | a straight column abaya with a longline cut' +
    ' // wide bell sleeves | kimono sleeves | cuffed bishop sleeves | batwing sleeves | layered cape sleeves over long sleeves | straight sleeves with embroidered cuffs' +
    ' // crepe with tone-on-tone embroidery | linen with lace trim at the hem | nida fabric with pearl buttons | chiffon layered over a crepe lining | textured jacquard with a metallic piping edge | silk with delicate crystal detailing along the placket',
  wedding:
    'a princess ball gown | !a fitted mermaid gown | a soft A-line gown | a sleek column gown with a detachable overskirt | a tiered tulle gown | an empire-waist flowing gown' +
    ' // !a strapless sweetheart bodice | !an off-the-shoulder neckline | long fitted lace sleeves with a high neck | a bateau neckline with long sleeves | puffed long sleeves with a square neckline | !cap sleeves with an open V-back' +
    ' // a cathedral train with scalloped lace edges | duchess satin with a clean minimalist finish | 3D floral appliques | pearl-beaded embroidery | layered organza with a sweeping train | crystal-embellished tulle over a satin lining',
  traditional:
    'an Emirati mukhawar dress | a loose daraa gown | a thobe nashal worn over a matching dress | a jalabiya with a flowing hem | an A-line kaftan dress | a straight dress over embroidered sirwal trousers' +
    ' // wide embroidered sleeves | cuffed long sleeves | bell sleeves | flowing butterfly sleeves | straight sleeves with talli trim | long sleeves with a round embroidered neckline' +
    ' // gold talli braid embroidery | hand-sewn sequin motifs | zari thread embroidery along the neckline | beaded geometric patterns | velvet panels with gold piping | soft chiffon with metallic stitching over a lining',
  kaftan:
    'a classic straight Moroccan kaftan | a takchita with a belted overlayer | a flared kaftan with a flowing train | an open-front kaftan over a matching slip dress | a caped kaftan | a kaftan cinched with a jeweled mdamma belt' +
    ' // wide bell sleeves | long sleeves edged with sfifa braid | cape sleeves over long fitted sleeves | cuffed sleeves closed with aakad buttons | flowing butterfly sleeves | !three-quarter sleeves with embroidered edges' +
    ' // velvet with gold sfifa braid | silk brocade | satin with hand-beaded embroidery | chiffon over satin with sequined motifs | jacquard with metallic threadwork | crepe with Fassi embroidery',
  jalabiya:
    'a loose straight jalabiya | an A-line jalabiya with side godets | a wrap-style jalabiya | a jalabiya with a flowing trumpet hem | a tiered jalabiya | a kaftan-style jalabiya with a drawstring waist' +
    ' // wide sleeves with embroidered cuffs | bell sleeves | batwing sleeves | long straight sleeves | puff sleeves gathered at the wrist | kimono sleeves' +
    ' // soft cotton with a hand-embroidered yoke | printed chiffon over a lining | crinkled viscose with a beaded neckline | linen with contrast piping | satin with crystal buttons | !sheer voile with lace insets',
  hijabchic:
    'wide-leg palazzo trousers with a long tunic | a maxi skirt with an oversized shirt | a long shirt dress over wide trousers | a longline blazer over a maxi dress | a pleated maxi skirt with a long knit | a wide jumpsuit with a long open kimono' +
    ' // a draped jersey hijab | a silk hijab with soft pleats | a chiffon hijab wrapped neatly | a turban-style wrap | a printed satin hijab | a crinkle-cotton hijab' +
    ' // crepe with clean lines | textured linen | satin with a subtle sheen | ribbed knit | lined pleated chiffon | soft washed denim',
  oldmoney:
    'tailored wide-leg trousers with a tucked knit | !a pleated midi skirt with a cashmere sweater | a long coat over a column dress | slim riding-style trousers with a tailored jacket | a silk shirt with high-waisted trousers | a long pleated skirt with a fine cardigan' +
    ' // a crisp collared shirt | a cable-knit sweater draped over the shoulders | a fine-gauge crew-neck knit | a double-breasted blazer with gold buttons | a silk blouse with a soft bow | a polo-collar knit' +
    ' // cashmere and silk | fine merino and pressed cotton | tweed with leather trims | pearl button accents | subtle herringbone wool | pleated silk twill',
  streetwear:
    'baggy cargo pants | parachute pants | loose carpenter jeans | wide-leg track pants | !a pleated mini skirt | a long pleated maxi skirt' +
    ' // an oversized hoodie | a varsity jacket over a long-sleeve tee | a boxy windbreaker | a puffer vest over a long-sleeve tee | an abstract-print tee under an open flannel shirt | a technical shell jacket' +
    ' // utility pockets and toggles | reflective trims | patchwork panels | contrast stitching | washed garment-dyed fabric | quilted nylon details',
  sporty:
    'wide-leg joggers | straight track pants | a pleated sport maxi skirt over leggings | tapered cargo joggers | relaxed yoga pants under a long tunic | a long tennis-inspired skirt over leggings' +
    ' // a zip-up track jacket | a long-sleeve performance top with thumbholes | a longline hoodie | a half-zip anorak | a quilted gilet over a long-sleeve top | a mock-neck base layer' +
    ' // color-blocked panels | reflective piping | perforated breathable panels | matte technical fabric | ribbed seamless knit | contrast side stripes',
  winterlux:
    'a long wrap coat belted at the waist | a double-breasted maxi coat | a cape coat | a car coat with a shearling collar | a quilted puffer maxi coat | an oversized cocoon coat' +
    ' // over a roll-neck cashmere sweater and wide trousers | over a long cable-knit sweater dress | over a fine-knit polo neck and tailored trousers | over a long ribbed knit dress | with a faux-fur stole | over a tailored trouser suit' +
    ' // double-faced wool | cashmere blend | teddy faux fur | quilted satin | brushed alpaca | leather trims with tortoiseshell buttons',
  summer:
    'wide-leg linen trousers with a loose shirt | a tiered linen maxi dress | a flowing linen kaftan dress | a linen jumpsuit with a tie waist | !linen shorts with a relaxed camp-collar shirt | !a linen slip dress' +
    ' // !a camp collar with short sleeves | a V-neck with rolled long sleeves | !a square neckline with short puff sleeves | a mandarin collar with long sleeves | !a strappy neckline | a relaxed open collar with long sleeves' +
    ' // natural washed linen | linen-cotton with crochet trim | airy cotton gauze | broderie anglaise details | linen with wooden buttons | light seersucker',
  office:
    'straight-leg tailored trousers | wide-leg pleated trousers | !a midi pencil skirt | a tailored jumpsuit | slim cigarette trousers | a long A-line pleated skirt' +
    ' // a single-breasted blazer over a silk shell | a cropped boxy jacket over a fine knit | a tailored waistcoat over a crisp shirt | a longline blazer with a pussy-bow blouse | a structured shirt with a cinched belt | a double-breasted blazer over a turtleneck' +
    ' // fine suiting wool | crepe with satin trims | tweed with contrast binding | stretch cotton sateen | subtle windowpane check | classic pinstripe',
  cocktail:
    'a fit-and-flare dress with a full skirt | a sleek sheath dress | a wrap dress | a tulip-skirt dress | a pleated skater dress | a draped dress with an asymmetric hem' +
    ' // !a strapless sweetheart bodice | !spaghetti straps with a cowl neck | !a bateau neckline with cap sleeves | a high neck with long sleeves | a square neckline with long puff sleeves | !a one-shoulder neckline with a bow' +
    ' // satin with a bow at the waist | sequined tweed | a feather-trimmed hem | jacquard with metallic threads | lined pleated organza | velvet with crystal buttons',
  ballgown:
    'a voluminous tiered ball skirt | a structured ball skirt with a pick-up hem | a ball gown with a sweeping chapel train | a crinoline-shaped skirt with layered petticoats | !a ball skirt with a high slit | a ball gown with a detachable overskirt' +
    ' // !an off-the-shoulder corset bodice | !a strapless sweetheart bodice | a high-neck bodice with long sleeves | a square neckline with voluminous puff sleeves | !a portrait collar with three-quarter sleeves | a bateau neckline with long bell sleeves' +
    ' // duchess satin with rosette details | layered tulle with scattered crystals | brocade with gold embroidery | organza with hand-painted florals | a velvet bodice with a satin skirt | taffeta with dramatic pleating',
  boho:
    'a tiered maxi dress | a flared maxi skirt with a peasant blouse | wide flared trousers with a long tunic | a wrap maxi skirt with a lined crochet top | a smocked maxi dress | !a fringed suede mini skirt with a peasant blouse' +
    ' // bell sleeves | a ruffled peasant neckline | a tie-front neckline | !an off-the-shoulder blouse | a fringed suede jacket layer | a long crochet cardigan layer' +
    ' // paisley prints | a patchwork of folk prints | macrame details | embroidered folk motifs | tassel trims | tie-dye',
  vintage:
    'a full circle skirt with a fitted bodice | !a fitted pencil wiggle dress | a swing dress with a petticoat | !high-waisted capri pants with a knotted blouse | a belted shirtwaist dress | a tea-length A-line dress' +
    ' // a Peter Pan collar | !a sweetheart neckline with cap sleeves | a boat neckline | !a halter neckline | a bow-tie neckline | !a notched collar with short sleeves' +
    ' // polka dots | gingham check | cherry-blossom print | houndstooth | solid color with contrast piping | striped cotton with button details',
  y2k:
    'low-rise flared jeans | a velour tracksuit | wide cargo pants | a long satin slip skirt | !a pleated mini skirt | !a baby-doll mini dress' +
    ' // !a cropped baby tee | a butterfly-print long-sleeve top | a zip-up hoodie | !a mesh top over a camisole | !a cropped cardigan | a patched denim jacket' +
    ' // rhinestone embellishments | holographic accents | butterfly motifs | metallic finishes | velour texture | tie-dye prints',
  minimal:
    'a straight column dress | wide-leg trousers with a tucked top | a slip dress under a long coat | a structured midi skirt with a crisp shirt | a relaxed jumpsuit | a knit co-ord with wide trousers' +
    ' // a clean crew neck | a funnel neck | a boxy shirt collar | a collarless coat layer | a mock neck | a boat neck' +
    ' // matte crepe | fine-gauge knit | crisp cotton poplin | brushed wool | silk twill | heavy jersey',
  glam:
    'a sequined column gown | a crystal-fringed dress | a metallic lame gown | a feather-trimmed gown | !a mirrored-paillette mini dress | !a draped liquid-lame gown with a high slit' +
    ' // !a plunging neckline | a high neck with long sequined sleeves | !a one-shoulder neckline with a statement bow | !a strapless structured bodice | long sleeves with crystal cuffs | a cowl neck with draped long sleeves' +
    ' // all-over crystals | dense micro-sequins | mirror paillettes | beaded fringe | metallic lame | ostrich feather trims',
  leather:
    'a biker leather jacket with slim trousers | a leather trench coat | a cropped leather jacket with a long slip skirt | leather trousers with an oversized blazer | a leather shirt dress | a leather moto jacket over a maxi dress' +
    ' // over a fitted turtleneck | over a plain crew-neck tee | !over a silk camisole | !over a mesh top | over a knit sweater | over a crisp shirt' +
    ' // silver zips and studs | quilted shoulder panels | a belted waist with buckles | lace-up details | a glossy patent finish | distressed washed leather',
  denim:
    'wide-leg jeans with a denim shirt | a denim jumpsuit | a denim maxi skirt with a matching jacket | straight jeans with a denim waistcoat | a long denim shirt dress | flared jeans with a cropped denim jacket' +
    ' // a western yoke shirt | a trucker jacket | !a sleeveless denim corset top | a chambray blouse with puff sleeves | an oversized denim blazer | a denim overshirt' +
    ' // light acid wash | raw indigo selvedge | !distressed rips | patchwork denim | contrast topstitching | embroidered denim',
  pastel:
    'a pleated midi dress | a tailored suit | a tiered maxi dress | wide trousers with a soft knit | a ruffled blouse with a maxi skirt | a jumpsuit with a sash' +
    ' // puff sleeves | a Peter Pan collar | !short flutter sleeves | a tie-neck bow | !a sweetheart neckline | long balloon sleeves' +
    ' // organza layers | soft satin | ribbed knit | eyelet cotton | a lined tulle overlay | crepe with ruffle trims',
  monochrome:
    'a sculpted column dress | a tailored trouser suit | wide-leg trousers with a long coat | a knit dress with a matching long cardigan | a pleated skirt with a matching blouse | a belted jumpsuit' +
    ' // a funnel neck | a structured shoulder line | a draped cowl neck | a sharp shirt collar | an asymmetric neckline | a high neck with long sleeves' +
    ' // a tonal mix of matte and sheen | ribbed and smooth knits | crepe and satin panels | sculptural seams | pleated details | tone-on-tone embroidery',
  floral:
    'a floral maxi dress | a floral midi skirt with a solid knit | wide-leg floral trousers with a matching shirt | a floral wrap dress | a tiered floral dress | a floral kimono jacket over a solid dress' +
    ' // puff sleeves | a square neckline | ruffled shoulders | a V-neck with long sleeves | a tie-front neckline | a high smocked neck' +
    ' // small ditsy flowers | large watercolor blooms | 3D fabric flower appliques | embroidered florals | botanical leaf prints | vintage rose prints',
  velvet:
    'a velvet column gown | a velvet wrap dress | a velvet trouser suit | !a velvet slip dress | a velvet dress with a flared skirt | a velvet maxi skirt with a satin blouse' +
    ' // !a sweetheart neckline | long puff sleeves | a high neck | a V-neck with long sleeves | !an off-the-shoulder neckline | a shawl-collar jacket' +
    ' // crushed velvet | smooth silk velvet | !devore burnout velvet | velvet with satin piping | velvet with crystal buttons | embossed velvet',
  silk:
    'a bias-cut silk gown | a silk shirt with wide trousers | a silk wrap dress | a silk pajama-style suit | a silk midi skirt with a fine knit | a silk kaftan dress' +
    ' // a cowl neck | a shirt collar | !a halter neck | a V-neck with long sleeves | a tie neck | !spaghetti straps' +
    ' // fluid satin | washed silk crepe de chine | printed silk twill | charmeuse with lace trims | silk with draped panels | silk with contrast piping',
  suitf:
    'a double-breasted suit with wide-leg trousers | a single-breasted suit with flared trousers | an oversized boxy suit | !a skirt suit | a three-piece suit with a waistcoat | a tuxedo suit' +
    ' // sharp peak lapels | a collarless jacket | a shawl collar | notch lapels with a pocket square | a belted jacket | strong padded shoulders' +
    ' // pinstripe wool | Prince of Wales check | velvet | satin lapels | crepe with gold buttons | linen blend',
  turkish:
    'an embroidered long coat dress | a flared maxi dress with a fitted waist | a long tunic with wide trousers | a belted caftan | an A-line dress with a long vest | a pleated maxi skirt with an embroidered blouse' +
    ' // wide sleeves with embroidered cuffs | long bishop sleeves | a high mandarin collar | a V-neck with long sleeves | puff shoulders with long sleeves | bell sleeves' +
    ' // Ottoman tulip embroidery | Iznik-inspired tile patterns | gold braid trim | silk brocade | velvet with metallic threads | kilim-inspired motifs',
  indian:
    'a flared anarkali | !a lehenga with a cropped choli | !a draped sari | a straight kurta with palazzo trousers | a sharara set | a salwar kameez' +
    ' // a dupatta draped over one shoulder | long sleeves with embroidered cuffs | a high neck | !a sweetheart neckline | !three-quarter sleeves | !cap sleeves' +
    ' // zardozi embroidery | mirror work | bandhani tie-dye | banarasi brocade | chikankari embroidery | gota patti trims',
  princess:
    'a tulle ball gown | a layered tulle A-line gown | a ball gown with a long train | a tiered princess gown | a corseted gown with a full skirt | an empire gown with a flowing cape' +
    ' // !an off-the-shoulder neckline | puff sleeves | !long sheer bell sleeves | !a sweetheart neckline | a high neck with long sleeves | a square neckline with long sleeves' +
    ' // scattered sparkles | 3D butterflies | floral appliques | glitter tulle | pearl details | a crystal-studded bodice',
  safari:
    'a belted safari shirt dress | cargo trousers with a utility shirt | a safari jumpsuit | a utility jacket with wide trousers | a belted trench-style coat with trousers | a long utility skirt with a shirt' +
    ' // epaulettes | !roll-up sleeves with button tabs | a camp collar | a stand collar | patch chest pockets | a drawstring waist' +
    ' // cotton twill | washed linen | canvas with brass buttons | ripstop cotton | suede trims | lightweight gabardine',
  preppy:
    '!a pleated mini skirt | a pleated midi skirt | tailored chinos | a blazer dress | a knit dress | !bermuda shorts' +
    ' // a cable-knit sweater over a collared shirt | a V-neck sweater vest over a shirt | a blazer with contrast piping | a cardigan over a shirt | a rugby shirt | !a short-sleeve polo shirt' +
    ' // tartan plaid | argyle knit | houndstooth | oxford cotton | tweed | varsity stripes',
  artgown:
    'a sculptural gown with architectural pleats | an asymmetric gown with a cascading ruffle | a gown with an exaggerated structured hip | a gown with a spiral wrapped skirt | a gown with a dramatic trapeze silhouette | a gown with a 3D origami bodice' +
    ' // an oversized sculpted collar | !a single dramatic sleeve | a high funnel neck | cape shoulders | !a halter neck | long sleeves with sculpted cuffs' +
    ' // bonded neoprene | stiff silk gazar | !laser-cut panels | pleated organza | metallic foil finish | featherlight tulle layers',
};

const MEN = {
  evening:
    'a slim single-breasted tuxedo | a double-breasted tuxedo | a velvet dinner jacket with tuxedo trousers | a shawl-collar dinner jacket | a three-piece tuxedo with a waistcoat | a tuxedo with a Nehru-collar jacket' +
    ' // satin peak lapels with a bow tie | grosgrain shawl lapels with a bow tie | notch lapels with a slim silk tie | a wing-collar shirt with studs and a bow tie | a fine turtleneck instead of a shirt' +
    ' // wool barathea with satin-striped trousers | silk velvet | tonal paisley jacquard | mohair with a subtle sheen | textured grain de poudre',
  formal:
    'a two-button single-breasted suit | a double-breasted suit | a three-piece suit | a slim-fit suit with tapered trousers | a relaxed suit with soft shoulders | a suit with a belted jacket' +
    ' // notch lapels with a silk tie | peak lapels with a knit tie | a spread-collar shirt without a tie | a button-down shirt with a pocket square | a fine turtleneck under the suit' +
    ' // chalk-stripe wool | birdseye wool | sharkskin | Prince of Wales check | flannel',
  casual:
    'slim chinos | straight jeans | relaxed pleated trousers | tapered cargo trousers | drawstring linen trousers | !chino shorts' +
    ' // an overshirt over a tee | a crewneck sweater | a henley | a denim jacket over a hoodie | a quilted jacket over a sweatshirt' +
    ' // washed cotton | brushed flannel | waffle knit | corduroy | heathered jersey',
  wedding:
    'a morning suit with a waistcoat | a three-piece tuxedo | a double-breasted suit with a boutonniere | a white-tie tailcoat | a single-breasted suit with a waistcoat | a shawl-collar tuxedo' +
    ' // a silk cravat | a classic bow tie | a slim tie with a tie bar | a wide silk tie with a pocket square | an ascot tie' +
    ' // jacquard with tonal florals | silk-wool blend | textured herringbone | satin lapel details | subtle pinstripe',
  traditional:
    'an Emirati kandura with a tassel | a Saudi thobe with a stand collar | a Qatari thobe with a shirt collar | a Kuwaiti dishdasha with a round collar | an Omani dishdasha with a tassel | a Bahraini thobe with a buttoned placket' +
    ' // a hidden-button placket | a pearl-button placket | fine piping along the collar | a subtly embroidered neckline | French cuffs with cufflinks' +
    ' // crisp cotton | fine winter-weight wool | textured slub fabric | silky cotton blend with a soft sheen | airy linen blend',
  bisht:
    'a bisht with a wide gold zari trim | a bisht with a fine silver trim | a bisht with a double row of gold braid | a bisht with a minimal thin gold edge | a bisht with ornate embroidered shoulders | a bisht with gold trim running down the front edges' +
    ' // over an Emirati kandura | over a Saudi thobe | over a Kuwaiti dishdasha | over a Qatari thobe | over an Omani dishdasha' +
    ' // fine camel-hair wool | lightweight summer wool | soft cashmere blend | silky summer weave | heavy winter wool',
  oldmoney:
    'pleated wool trousers with a cable-knit sweater | tailored chinos with a double-breasted blazer | flannel trousers with a shawl-collar cardigan | linen trousers with a knitted polo | a polo coat over a turtleneck and trousers | corduroy trousers with a quilted jacket' +
    ' // a button-down oxford shirt | a fine merino crewneck | a polo-collar knit | a quarter-zip knit | a cashmere sweater draped over the shoulders' +
    ' // cashmere | tweed | flannel | fine-gauge merino | brushed cotton',
  streetwear:
    'baggy cargo pants | relaxed carpenter jeans | wide track pants | parachute pants | straight denim with a stacked hem | !long mesh basketball shorts' +
    ' // an oversized hoodie | a varsity jacket | a coach jacket over a hoodie | a puffer vest over a long-sleeve tee | a technical shell jacket' +
    ' // utility pockets | reflective trims | patchwork panels | washed garment-dyed fabric | quilted nylon',
  sporty:
    'tapered joggers | track pants with side stripes | technical trail trousers | relaxed sweatpants | slim training pants | !running shorts over leggings' +
    ' // a zip-up track jacket | a half-zip performance top | a hooded running jacket | a quilted gilet over a long-sleeve tee | a crewneck sweatshirt' +
    ' // color-blocked panels | reflective piping | matte technical fabric | brushed fleece | perforated breathable panels',
  winterlux:
    'a long wool overcoat | a double-breasted peacoat | a shearling aviator jacket | a quilted parka | a belted wrap coat | a Chesterfield coat with a velvet collar' +
    ' // over a roll-neck sweater | over a cable-knit sweater | over a tailored suit | over a quilted gilet and shirt | over a fine merino crewneck' +
    ' // double-faced cashmere | herringbone tweed | teddy fleece | loden wool | alpaca blend',
  summer:
    'drawstring linen trousers | relaxed pleated linen trousers | !tailored linen shorts | straight cotton trousers | a linen suit | !wide cropped trousers' +
    ' // !a camp-collar short-sleeve shirt | a long-sleeve linen shirt with rolled cuffs | a band-collar long-sleeve shirt | !a short-sleeve knitted polo | an unstructured linen blazer over a tee' +
    ' // natural washed linen | cotton seersucker | open-weave knit | light chambray | crinkle cotton | linen with wooden buttons',
  office:
    'a blazer with chinos | a sport coat with wool trousers | an unstructured blazer with flannel trousers | a quilted jacket with tailored trousers | a knit blazer with slim trousers | a suede jacket with tailored trousers' +
    ' // a button-down shirt | an oxford shirt with a knit tie | a long-sleeve merino polo | a crewneck sweater over a shirt | a fine turtleneck' +
    ' // hopsack | houndstooth | windowpane check | brushed cotton | wool-cashmere blend',
  leather:
    'a biker jacket | a leather bomber | a leather trucker jacket | a leather car coat | a cafe-racer jacket | a suede overshirt' +
    ' // over a plain tee | over a hoodie | over a turtleneck | over a flannel shirt | over a henley' +
    ' // silver hardware and zips | distressed washed leather | soft suede | quilted shoulder panels | a shearling collar',
  denim:
    'straight raw jeans | relaxed tapered jeans | wide-leg jeans | slim jeans with a turn-up | carpenter jeans | a denim-on-denim suit' +
    ' // a trucker denim jacket | a western denim shirt | a denim overshirt | a chore jacket | a sherpa-lined denim jacket' +
    ' // raw indigo selvedge | light vintage wash | dark rinse | contrast topstitching | patchwork repairs',
  minimal:
    'straight wool trousers | wide pleated trousers | slim tailored trousers | relaxed drawstring trousers | straight chinos | a boxy two-piece suit' +
    ' // !a boxy crewneck tee | a mock-neck knit | a collarless shirt | a clean overshirt | a longline coat over a knit' +
    ' // heavy cotton | fine-gauge merino | wool crepe | brushed twill | technical wool',
  monochrome:
    'a tailored suit | an overcoat with matching trousers | a knit set | an overshirt with matching trousers | a bomber with matching trousers | a tailored tracksuit-style set' +
    ' // a turtleneck | a crew neck | a band collar | a camp collar | a mock neck' +
    ' // a tonal mix of matte and sheen | ribbed and smooth knits | suede and wool | tone-on-tone stitching | sculpted seams',
  vintage:
    'slim trousers with a short boxy jacket | a slim mod suit | high-waisted pleated trousers with braces | a knit polo with pressed slacks | a zip-front jacket with slim trousers | a corduroy suit' +
    ' // a narrow tie | a turtleneck | a knitted polo collar | a button-down shirt | a band-collar shirt' +
    ' // houndstooth | tweed | mohair suiting | corduroy | windowpane check',
  smartcasual:
    'chinos with a knitted polo | tailored trousers with an oxford shirt | dark jeans with a blazer | wool trousers with a quarter-zip | chinos with an overshirt | tailored trousers with a cardigan' +
    ' // an unstructured blazer | a suede jacket | a quilted gilet | a fine cardigan | !no layer, sleeves neatly rolled' +
    ' // pique cotton | brushed flannel | linen blend | suede details | fine knit',
  threepiece:
    'a classic three-piece suit | a double-breasted three-piece suit | a tweed three-piece suit | a slim three-piece suit | a three-piece suit with a double-breasted waistcoat | a three-piece suit with a shawl-lapel waistcoat' +
    ' // peak lapels | notch lapels | a lapelled waistcoat | a pocket-watch chain on the waistcoat | a folded pocket square' +
    ' // chalk stripe | glen check | herringbone tweed | flannel | windowpane',
  safari:
    'a safari jacket with chinos | cargo trousers with a field shirt | a utility jumpsuit | a belted field jacket with trousers | a gilet with cargo trousers | a bush shirt with pleated trousers' +
    ' // epaulettes | bellows patch pockets | a camp collar | a stand collar | a drawstring waist' +
    ' // cotton twill | ripstop | canvas | waxed cotton | linen',
  preppy:
    'chinos with a cable-knit sweater | pleated trousers with a V-neck sweater | chinos with a blazer | corduroys with a rugby shirt | !bermuda shorts with a polo | flannel trousers with a cardigan' +
    ' // an oxford button-down | !a short-sleeve polo shirt | a striped shirt | a sweater vest | a blazer with contrast piping' +
    ' // argyle | tartan | seersucker | oxford cotton | cable knit',
  athleisure:
    'technical joggers | tapered track pants | tech trousers | slim sweatpants | cargo joggers | relaxed tech chinos' +
    ' // a half-zip fleece | a hooded tech jacket | a crewneck sweatshirt | a quilted gilet | a zip-up knit jacket' +
    ' // bonded jersey | technical fleece | ventilated panels | reflective details | matte nylon',
  rockstar:
    'skinny jeans with a leather jacket | flared trousers with a velvet blazer | leather trousers with a sequined jacket | a jumpsuit with a studded belt | slim trousers with a long duster coat | tailored trousers with a brocade jacket' +
    ' // an open-collar printed shirt | a plain tee | a silk scarf tied at the collar | !a sleeveless vest | a ruffled shirt' +
    ' // metal studs | sequins | velvet | snakeskin-embossed leather | distressed finishes',
  moroccan:
    'a hooded djellaba | a djellaba with a pointed hood | a jabador set with a tunic and trousers | a gandora | a burnous cloak over a djellaba | a sleeveless gandora over a long-sleeve shirt' +
    ' // a round neckline with sfifa braid | a V-neckline with embroidered edges | a buttoned placket with aakad knots | a mandarin collar | a hidden placket' +
    ' // fine wool | linen | cotton blend | striped wool | embroidered trims',
};

const KIDS = {
  evening:
    'girl: a full tulle party dress / boy: a velvet waistcoat with tailored trousers | girl: a satin dress with a big bow sash / boy: a mini tuxedo with a bow tie | girl: a tiered ruffle dress / boy: a blazer with a crisp shirt and chinos | girl: a sequined-bodice dress with a soft skirt / boy: a shawl-collar dinner jacket | girl: a velvet dress with a lace collar / boy: a velvet blazer with a bow tie | girl: a brocade dress with a flared skirt / boy: a brocade waistcoat with trousers' +
    ' // embroidered collar details | a satin sash or cummerbund | contrast piping | covered buttons | small bow accents' +
    ' // velvet | satin | brocade | jacquard | linen blend',
  formal:
    'girl: a tailored pinafore dress with a blouse / boy: a two-piece suit | girl: a blazer with a pleated skirt / boy: a blazer with chinos | girl: a smart dress with a cardigan / boy: a waistcoat with trousers | girl: a sailor-collar dress / boy: a sailor-collar shirt with trousers | girl: a tweed dress with a bow / boy: a tweed jacket with trousers | girl: a collared shift dress / boy: a shirt with a knitted vest' +
    ' // a crisp collared shirt | a knitted tie or ribbon bow | a Peter Pan collar | a V-neck sweater layer | a fine-knit cardigan layer' +
    ' // wool blend | cotton twill | tweed | corduroy | gabardine',
  casual:
    'girl: leggings with a long tunic top / boy: joggers with a long-sleeve tee | girl: a denim pinafore / boy: denim dungarees | girl: a jersey dress / boy: cargo trousers with a sweatshirt | girl: wide trousers with a striped top / boy: chinos with a striped long-sleeve tee | !girl: a skort with a hoodie / boy: shorts with a hoodie | girl: a corduroy skirt with a knit / boy: corduroy trousers with a knit' +
    ' // a cozy hoodie layer | a zip-up fleece | a denim jacket | a knit cardigan | a light windbreaker' +
    ' // soft cotton jersey | fleece | washed denim | ribbed knit | terry cotton',
  wedding:
    'girl: a flower-girl tulle dress / boy: a mini suit with a bow tie | girl: a lace dress with a sash / boy: a waistcoat with a tie | girl: a satin ball-skirt dress / boy: a mini tuxedo | girl: a tiered chiffon dress / boy: a linen suit | girl: an embroidered organza dress / boy: a kandura with a mini bisht | girl: a satin dress with a cape / boy: a three-piece suit' +
    ' // a satin sash or bow detail | a small flower pin | pearl buttons | an embroidered collar | embroidered cuffs' +
    ' // satin | linen | velvet | brocade | jacquard',
  traditional:
    'girl: a mini jalabiya with embroidery / boy: a kandura with a tassel | girl: a daraa dress with talli trim / boy: a thobe with a stand collar | girl: a kaftan dress / boy: a dishdasha with a sadriya vest | girl: a mukhawar dress / boy: a kandura with a mini bisht | girl: a thobe nashal over a dress / boy: a thobe with pearl buttons | girl: a velvet jalabiya / boy: a winter-weight thobe with a vest' +
    ' // girl: gold talli trim / boy: fine collar piping | girl: an embroidered neckline / boy: a pearl-button placket | girl: wide embroidered sleeves / boy: French cuffs with cufflinks | girl: sequin motifs / boy: a hidden placket | girl: beaded cuffs / boy: a subtly embroidered collar' +
    ' // soft cotton | lined chiffon | crisp cotton | velvet panels | linen blend',
  sporty:
    'joggers with a hoodie | a tracksuit | tech pants with a half-zip top | track pants with a zip jacket | cargo joggers with a sweatshirt | !sport shorts with a tee | !a football-style kit' +
    ' // color-blocked panels | side stripes | reflective details | a hooded layer | a quilted vest' +
    ' // breathable jersey | fleece | quick-dry knit | soft cotton | ripstop',
  winterlux:
    'a puffer coat | a duffle coat with toggles | a wool pea coat | a teddy fleece jacket | a quilted parka | a hooded wool cape coat' +
    ' // over a chunky knit sweater | over a turtleneck | over a hoodie | over a fleece jumper | over a cardigan' +
    ' // a faux-fur trimmed hood | quilted nylon | brushed wool | sherpa lining | cable knit',
  summer:
    'girl: a long cotton sundress / boy: linen trousers with a shirt | girl: a smocked dress / boy: a camp-collar shirt with chinos | girl: a tiered cotton dress / boy: a linen shirt with drawstring trousers | girl: a broderie dress / boy: a band-collar shirt with trousers | !girl: wide cotton trousers with a top / boy: shorts with a tee | girl: a linen jumpsuit / boy: linen dungarees' +
    ' // embroidered trims | wooden buttons | contrast piping | patch pockets | ruffle or pleat details' +
    ' // light cotton | linen | seersucker | gauze | chambray',
  school:
    'girl: a pleated pinafore with a blouse / boy: trousers with a shirt and sweater | girl: a blazer with a pleated skirt / boy: a blazer with trousers | !girl: a sailor-collar dress / boy: a sailor-collar shirt with shorts | girl: a gingham dress with a cardigan / boy: chinos with a polo shirt | girl: a tunic dress with leggings / boy: a sweater vest with trousers | girl: a pleated skirt with a knit vest / boy: trousers with a knit vest' +
    ' // a crisp shirt collar | a V-neck sweater | a knit cardigan | a striped tie or ribbon | a sweater vest' +
    ' // cotton twill | wool blend | gingham | cotton poplin | fine knit',
  denim:
    'denim dungarees | a denim jacket with jeans | a denim pinafore or overalls | wide-leg jeans with a long-sleeve tee | a denim jumpsuit | denim joggers with a sweatshirt' +
    ' // patch pockets | embroidered patches | contrast stitching | rolled cuffs | a sherpa collar' +
    ' // light wash | dark rinse | washed indigo | soft stretch denim | chambray',
  pastel:
    'girl: a tulle skirt with a knit top / boy: chinos with a soft knit sweater | girl: a smocked dress / boy: a polo with trousers | girl: a ruffled dress / boy: a linen shirt with trousers | girl: a jumpsuit with bows / boy: dungarees | girl: a pleated dress / boy: a sweatshirt with joggers | girl: a cardigan over a dress / boy: a cardigan over a shirt' +
    ' // a Peter Pan collar | bow details | pleat details | contrast piping | embroidered hearts or stars' +
    ' // soft cotton | linen | fine knit | brushed fleece | seersucker',
  floral:
    'girl: a floral tiered dress / boy: a floral-print shirt with chinos | girl: a floral smocked dress / boy: a floral camp-collar shirt with linen trousers | girl: a floral jumpsuit / boy: a floral bomber jacket with jeans | !girl: a floral skirt with a tee / boy: a floral-print tee with shorts | girl: a floral dress with a cardigan / boy: a shirt with a small floral print and trousers | girl: a floral pinafore / boy: floral-print dungarees' +
    ' // bow details | embroidered flowers | a contrast collar | ruffle trims | button-front details' +
    ' // ditsy prints | large blooms | watercolor florals | embroidered flowers | botanical leaves',
  streetwear:
    'cargo pants with a hoodie | wide jeans with an oversized long-sleeve tee | joggers with a varsity jacket | track pants with a puffer vest | parachute pants with a windbreaker | carpenter jeans with a zip hoodie' +
    ' // bold color-blocking | patch details | reflective trims | drawstring details | utility pockets' +
    ' // cotton fleece | nylon | denim | jersey | quilted fabric',
  minimal:
    'straight trousers with a long-sleeve tee | a knit set | a cotton jumpsuit | a sweatshirt with wide trousers | a long-sleeve tee with joggers | girl: a simple tunic dress over leggings / boy: a simple overshirt with trousers' +
    ' // a crew neck | a mock neck | a collared shirt | a zip neck | a relaxed cardigan' +
    ' // organic cotton | fine knit | brushed cotton | linen | heavy jersey',
  vintage:
    'girl: a smocked dress with a round collar / boy: suspenders with a shirt and trousers | girl: a gingham pinafore / boy: a vest with pleated trousers | girl: a sailor dress / boy: a sailor suit | girl: a polka-dot dress / boy: a knitted sweater vest with trousers | girl: a corduroy pinafore / boy: corduroy dungarees | girl: a puff-sleeve dress with a bow / boy: a bow tie with a shirt and braces' +
    ' // a Peter Pan collar | a sailor collar | a bow tie or ribbon | a knitted vest layer | smocked details' +
    ' // gingham | corduroy | polka dots | tweed | stripes',
  preppy:
    'girl: a pleated skirt with a cardigan / boy: chinos with a V-neck sweater | !girl: a polo dress / boy: a polo with chinos | girl: a blazer with a kilt skirt / boy: a blazer with trousers | girl: a cable-knit sweater dress / boy: a cable-knit sweater with cords | girl: a rugby-stripe dress / boy: a rugby shirt with chinos | girl: a pinafore with a striped shirt / boy: a striped shirt with a sweater vest' +
    ' // an oxford collar | a sweater vest | a blazer with contrast piping | a striped ribbon or tie | a cable-knit layer' +
    ' // tartan | argyle | oxford cotton | cable knit | corduroy',
  eidkids:
    'girl: an embroidered jalabiya / boy: a kandura with a vest | girl: a sequined party dress / boy: a thobe with a mini bisht | girl: a kaftan with a sash / boy: a jabador set | girl: a tulle dress with a lace bodice / boy: a waistcoat suit | girl: a satin dress with a cape / boy: a dishdasha with an embroidered collar | girl: a velvet coat over a long dress / boy: a sherwani-style coat' +
    ' // gold embroidery | pearl details | sequin accents | embroidered cuffs | a satin sash' +
    ' // satin | velvet | lined chiffon | brocade | soft cotton',
  princess:
    'girl: a tulle ball gown / boy: a royal prince jacket with a sash | girl: a tiered tulle dress / boy: a velvet prince tunic with a cape | girl: a satin gown with a cape / boy: a brocade prince coat | girl: a layered princess dress with a bow / boy: a regal waistcoat with a sash | girl: a sparkly tutu dress / boy: a knight-inspired tabard over a shirt | girl: a long-sleeved sparkly gown / boy: a royal military-style jacket' +
    ' // puff sleeves | !long sheer sleeves | a Peter Pan collar | a square neckline with long sleeves | gold braid details' +
    ' // glitter tulle | pearl details | 3D flowers | star sequins | satin ribbons',
};

const CATALOG = { women: WOMEN, men: MEN, kids: KIDS };

// بديل محور الياقة والأكمام حين يلزم الاحتشام وفي المحور خيار مكشوف.
const MODEST_NECK = {
  women: 'a high round neckline with long bishop sleeves | a modest V-neck over a high inner layer with long cuffed sleeves | a mandarin collar with long straight sleeves | a boat neckline with long bell sleeves | a wrapped crossover neckline with long fitted sleeves | a cowl neckline with long puff sleeves',
  men: 'a long-sleeve shirt with a band collar | a long-sleeve oxford shirt | a long-sleeve henley | a long-sleeve linen shirt | a long-sleeve fine knit',
  kids: 'long sleeves with a round collar | long sleeves with a shirt collar | long puffed sleeves | long sleeves with a Peter Pan collar | long sleeves with a high neckline',
};

// لوحات الألوان حين لا يختار المستخدم ألوانه: '_' للفئة، وما يخصّ نمطًا يغلبها، وnull = بلا لوحة
// (فستان العروس الأبيض، الكندورة، الدنيم، السفاري… لونها من هويّة النمط نفسه).
const PALETTES = {
  women: {
    _: 'deep emerald with gold accents | champagne and ivory | dusty rose | midnight navy | burgundy | sapphire blue | blush pink | black with gold accents | sage green | soft lilac | terracotta | pearl grey | ruby red | teal | camel and cream | cobalt blue | mocha brown | olive green',
    abaya: 'classic black | sand beige | midnight navy | chocolate brown | olive green | dusty rose | charcoal grey | ivory with gold accents | deep burgundy | stone grey',
    oldmoney: 'navy and cream | camel and ivory | forest green and cream | grey and white | chocolate and beige | black and ivory',
    minimal: 'ivory | stone | charcoal | black | camel | cream and grey | taupe | white and navy',
    pastel: 'lavender | mint | baby blue | blush pink | butter yellow | peach | lilac and mint | powder blue and cream',
    monochrome: 'cobalt blue | emerald green | camel | ivory | charcoal | burgundy | dusty rose | olive | chocolate brown | sky blue | black | red',
    wedding: null, denim: null, safari: null,
  },
  men: {
    _: 'navy | charcoal grey | camel | olive | burgundy | cream and stone | black | slate blue | chocolate brown | forest green | sand beige | ink blue | grey and white | rust',
    bisht: 'a black bisht over a white kandura | a chocolate-brown bisht over a white kandura | a beige bisht over a white kandura | a cream bisht over an off-white kandura | a charcoal bisht over a white kandura | a navy bisht over a white kandura',
    oldmoney: 'navy and cream | camel and white | forest green and stone | grey and navy | chocolate and beige',
    minimal: 'ivory | stone | charcoal | black | camel | navy and grey | taupe',
    monochrome: 'charcoal | navy | camel | olive | chocolate brown | stone grey | ivory | burgundy | black | forest green',
    traditional: null, wedding: null, denim: null, safari: null,
  },
  kids: {
    _: 'sunny yellow | sky blue | mint green | coral | lavender | navy and white | cherry red | peach | turquoise | olive and cream | royal blue | mustard and navy',
    school: 'navy and white | grey and burgundy | green and white | navy and red | brown and cream | blue and grey',
    pastel: 'baby pink | mint | lavender | baby blue | butter yellow | peach',
    minimal: 'ivory | stone | oatmeal | grey | navy | sage',
    traditional: null, eidkids: null, denim: null,
  },
};

// الإضافات: محوران (نوع × خامة/لون) = ١٠٠ نوع لكلّ إضافة. مكياج الرجال تهذيب لا يمسّ اللحية ولا الملامح
// (قفل الهويّة)، ومكياج الأطفال لمسة تناسب الطفل لا مكياج كبار — نوع واحد لكلّ منهما عمدًا.
const ACCESSORIES = {
  Glasses: {
    women: 'cat-eye glasses | oversized square glasses | aviator glasses | small round glasses | geometric hexagonal glasses | slim rectangular glasses | butterfly glasses | shield-visor sunglasses | oval glasses | browline glasses' +
      ' // with tortoiseshell frames and brown lenses | with thin gold frames and dark gradient lenses | with glossy black frames and black lenses | with clear crystal frames and clear lenses | rimless with rose-tinted lenses | with white acetate frames and grey lenses | with gold frames and mirrored lenses | with ivory frames and amber lenses | with two-tone frames and green lenses | with burgundy acetate frames and smoke lenses',
    men: 'aviator glasses | square acetate glasses | round glasses | rectangular glasses | navigator glasses | browline glasses | oversized square glasses | sport wraparound sunglasses | double-bridge pilot glasses | slim rimless glasses' +
      ' // with matte black frames and dark lenses | with gold metal frames and green lenses | with tortoiseshell frames and brown lenses | with gunmetal frames and mirrored lenses | with clear frames and clear lenses | with titanium frames and grey lenses | with black-and-gold frames and gradient lenses | with brushed silver frames and blue lenses | with dark havana frames and clear lenses | with matte navy frames and polarized lenses',
    kids: 'round kids sunglasses | star-shaped fun sunglasses | sporty wrap sunglasses | cat-eye kids sunglasses | aviator kids sunglasses | heart-shaped sunglasses | square flexible-frame sunglasses | clear round glasses | retro browline kids glasses | oval kids sunglasses' +
      ' // in bright red | in sky blue | in mint green | in sunny yellow | in pink | in clear crystal | in tortoiseshell | in navy | in white | in purple',
  },
  Watch: {
    women: 'a slim dress watch | a square Art-Deco watch | a diver-style watch | a bangle cuff watch | a chronograph | a tiny vintage cocktail watch | an oval watch | a rectangular watch | a hexagonal watch | a minimalist thin-bezel watch' +
      ' // with a gold case on a gold bracelet | with a steel case on a mesh bracelet | with a rose-gold case on a blush leather strap | with a two-tone case on a link bracelet | with a white ceramic case on a rubber strap | with a gold case and a mother-of-pearl dial | with a silver case and a diamond-set bezel | with a gold case on a black croc-embossed strap | with a steel case and a champagne dial | with a rose-gold case on a pearl bracelet',
    men: 'a classic dress watch | a diver watch | a chronograph | a pilot watch | a field watch | a GMT travel watch | a square watch | a skeleton watch | a slim minimalist watch | a digital sports watch' +
      ' // with a steel case on a steel bracelet | with a gold case on a leather strap | with a black case on a rubber strap | with a two-tone case on a five-link bracelet | with a titanium case on a woven strap | with a rose-gold case on a brown croc-embossed strap | with a steel case and a blue sunburst dial | with a gold case and a green dial | with a ceramic case and a black dial | with a bronze case on a suede strap',
    kids: 'a colorful analog kids watch | a sporty digital watch | a smartwatch-style kids watch | a classic leather-strap watch | a silicone jelly watch | a rainbow-dial watch | a glow-hands adventure watch | a slim metal kids watch | a flower-shaped fun watch | a rugged outdoor kids watch' +
      ' // in red | in sky blue | in mint | in yellow | in pink | in navy | in white | in purple | in orange | in green',
  },
  Handbag: {
    women: 'a structured top-handle bag | a crossbody saddle bag | a quilted chain shoulder bag | a jeweled clutch | a soft hobo bag | a mini bucket bag | a baguette bag | a roomy tote | a box bag | a half-moon bag' +
      ' // in smooth leather with gold hardware | in croc-embossed leather | in quilted lambskin with silver hardware | in woven raffia | in satin with crystals | in suede with a tassel | in glossy patent leather | in pleated leather | in canvas with leather trim | in metallic leather',
    men: 'a leather briefcase | a slim document portfolio | a crossbody sling bag | a messenger bag | a leather tote | a compact belt bag | a weekender duffel | a backpack | a zip pouch clutch | a camera-style shoulder bag' +
      ' // in cognac leather | in black pebbled leather | in canvas with leather trims | in suede | in nylon with leather details | in croc-embossed leather | in waxed cotton | in tan saddle leather | in dark brown grained leather | in navy canvas',
    kids: 'a mini crossbody purse | a small backpack | a heart-shaped mini bag | a woven straw mini bag | a mini bucket bag | a pouch with a wrist strap | a quilted mini bag | a round crossbody bag | a bow-topped clutch | a small canvas tote' +
      ' // in red | in sky blue | in mint | in yellow | in pink | in navy | in white | in lilac | in orange | in glitter silver',
  },
  Shoes: {
    women: 'pointed stiletto pumps | strappy heeled sandals | block-heel mules | ankle boots | knee-high boots | ballet flats | loafers | clean low-top sneakers | slingback kitten heels | platform sandals' +
      ' // in patent leather | in suede | in satin | in metallic leather | in smooth matte leather | in croc-embossed leather | in velvet | with crystal buckles | with pearl details | in woven leather',
    men: 'oxford shoes | penny loafers | tassel loafers | chelsea boots | chukka boots | double monk-strap shoes | minimal low-top sneakers | suede driving moccasins | leather Arabic sandals | derby shoes' +
      ' // in polished black calf | in cognac brown leather | in dark brown suede | in burgundy leather | in tan suede | in navy suede | in white leather | in black patent | in grey nubuck | in two-tone brown',
    kids: 'low-top sneakers | Mary Jane shoes | sandals | ankle boots | ballet flats | loafers | high-top sneakers | canvas slip-ons | rain boots | hook-and-loop trainers' +
      ' // in white | in red | in navy | in pink | in silver | in gold | in sky blue | in black patent | in tan | in multicolor',
  },
  Scarf: {
    women: 'a silk square scarf knotted at the neck | a long silk twilly tied in a bow | a cashmere wrap draped over the shoulders | a pleated chiffon stole | a chunky knitted scarf | a pashmina shawl | a skinny silk scarf worn as a necktie | a fringed wool blanket scarf | a bandana scarf tied at the neck | a lace-edged stole' +
      ' // with a paisley print | with a geometric print | with a floral print | in a solid color | with a chain print | with an animal print | with stripes | with polka dots | with an ombre dye | with an embroidered border',
    men: 'a cashmere scarf draped loosely | a wool scarf in a Parisian knot | a silk neckerchief | a ribbed knit scarf | a lightweight linen scarf | a fringed wool scarf | a silk ascot | a chunky cable-knit scarf | a double-face wool scarf | a cotton bandana' +
      ' // in a solid color | with a houndstooth pattern | with a paisley print | with stripes | with a check pattern | with a herringbone weave | with a polka dot print | with a tartan pattern | with a subtle geometric print | in two-tone colors',
    kids: 'a soft knit scarf | a fleece neck warmer | a cotton bandana | a fringed wool scarf | a pom-pom scarf | a satin neck bow | a striped knit scarf | a cable-knit scarf | a snood | a lightweight cotton scarf' +
      ' // in red | in sky blue | in mint | in yellow | in pink | in navy | in rainbow stripes | in lilac | in orange | with star prints',
  },
  Makeup: {
    women: 'makeup with soft brown shimmer eyes | makeup with smoky charcoal eyes | makeup with a winged black liner | makeup with bold kohl-lined eyes | makeup with bronze metallic lids | makeup with a champagne glow on the lids | makeup with rose-gold shimmer eyes | makeup with a graphic floating liner | makeup with natural fluttery lashes | makeup with subtle matte taupe eyes' +
      ' // and classic red lips | and nude matte lips | and a berry-stained lip | and glossy pink lips | and coral lips | and mauve satin lips | and deep plum lips | and a peach gloss | and brick-red matte lips | and a clear balm glow',
    men: 'subtle natural grooming (matte even skin and tidy brows) without changing facial hair or features',
    kids: 'no adult makeup on the child: at most clear lip gloss and a little cheek glitter, keeping the face natural',
  },
};
const ACC_ORDER = Object.keys(ACCESSORIES);

const IMMODEST = /^!\s*/;
const parseCache = new Map();
function parseSpec(spec) {
  if (parseCache.has(spec)) return parseCache.get(spec);
  const axes = String(spec).split(' // ').map((ax) => ax.split(' | ').map((o) => o.trim()).filter(Boolean));
  parseCache.set(spec, axes);
  return axes;
}
function clean(o) { return o.replace(IMMODEST, ''); }
function gcd(a, b) { while (b) { const t = a % b; a = b; b = t; } return a; }
// خطوة أوّليّة مع العدد قرب ٠٫٦١٨ منه: المسار n → (n·s) mod N يمرّ على كلّ التصاميم قبل أن يتكرّر،
// ولأنّ s لا يقبل القسمة على طول المحور الأوّل تتغيّر الهيئة في كلّ خطوة.
function strideFor(total) {
  if (total <= 2) return 1;
  let s = Math.max(1, Math.round(total * 0.618));
  while (gcd(s, total) !== 1) s++;
  return s;
}
function toVariant(v) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 ? n % 1e12 : Math.floor(Math.random() * 1e6);
}
function genderOf(g) { return CATALOG[g] ? g : 'women'; }
function specFor(gender, style) {
  const g = genderOf(gender);
  // مثل styleDescFor في fashion-create: نمط الفئة، وإلّا نمط النساء، وإلّا السهرة.
  return (CATALOG[g][style]) || WOMEN[style] || WOMEN.evening;
}

function axesFor(gender, style, modest) {
  const g = genderOf(gender);
  let axes = parseSpec(specFor(g, style));
  if (modest) {
    axes = axes.map((ax, i) => {
      if (i === 1 && ax.some((o) => IMMODEST.test(o))) return parseSpec(MODEST_NECK[g])[0];
      return ax.filter((o) => !IMMODEST.test(o));
    });
  }
  return axes.map((ax) => ax.map(clean));
}

function pickFrom(axes, n, salt) {
  const total = axes.reduce((p, ax) => p * ax.length, 1);
  const index = (((n % total) * strideFor(total)) + (salt || 0)) % total;
  let rest = index;
  const parts = axes.map((ax) => { const o = ax[rest % ax.length]; rest = Math.floor(rest / ax.length); return o; });
  return { index, total, parts };
}

// التصميم رقم (index+1) من total لهذا النمط — ثلاثة محاور تُكتب في الأمر بعد وصف النمط.
function designFor(opts) {
  const o = opts || {};
  const g = genderOf(o.gender);
  const axes = axesFor(g, o.style, !!o.modest);
  const n = toVariant(o.variant);
  const r = pickFrom(axes, n, 0);
  return { index: r.index, total: r.total, variant: n, parts: r.parts, text: r.parts.join('; '), kidsPair: r.parts.some((p) => / \/ boy: /.test(p)) };
}

function paletteFor(gender, style) {
  const g = genderOf(gender);
  const P = PALETTES[g];
  const spec = Object.prototype.hasOwnProperty.call(P, style) ? P[style] : P._;
  return spec ? parseSpec(spec)[0] : null;
}
function colourStoryFor(opts) {
  const o = opts || {};
  const list = paletteFor(o.gender, o.style);
  if (!list || !list.length) return '';
  return pickFrom([list], toVariant(o.variant), 1).parts[0];
}

function accessoryFor(name, opts) {
  const o = opts || {};
  const spec = ACCESSORIES[name] && ACCESSORIES[name][genderOf(o.gender)];
  if (!spec) return '';
  const salt = 7 * (ACC_ORDER.indexOf(name) + 1);
  return pickFrom(parseSpec(spec), toVariant(o.variant), salt).parts.join(' ');
}
// بديل joinList للإضافات: الأسماء المعروفة تصير نوعًا محدّدًا، والمجهولة تبقى كما كانت (حدّ ٨ و٢٤ حرفًا).
function accessoriesText(list, opts) {
  if (!Array.isArray(list)) return '';
  return list.filter((x) => typeof x === 'string' && x.trim()).slice(0, 8)
    .map((x) => { const k = x.trim().slice(0, 24); return accessoryFor(k, opts) || k; }).join('; ');
}

function accessoryTotal(name, gender) {
  const spec = ACCESSORIES[name] && ACCESSORIES[name][genderOf(gender)];
  return spec ? parseSpec(spec).reduce((p, ax) => p * ax.length, 1) : 0;
}
function designTotal(gender, style, modest) {
  return axesFor(gender, style, !!modest).reduce((p, ax) => p * ax.length, 1);
}

module.exports = {
  CATALOG, MODEST_NECK, PALETTES, ACCESSORIES,
  designFor, colourStoryFor, accessoryFor, accessoriesText,
  designTotal, accessoryTotal, axesFor, strideFor,
  // يُحسم الرقم مرّة واحدة للطلب (عدّاد العميل، أو عشوائيّ لعميل قديم بلا عدّاد) ثمّ يمرّ على الثلاثة.
  resolveVariant: toVariant,
};
