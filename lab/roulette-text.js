// Strings for roulette.html. Language follows the main app's setting (aiapp_lang).
const T = {
  pageTitle: ['الروليت: الحقيقة بالأرقام', 'Roulette: the truth in numbers'],
  subtitle: ['أجر البيت الحقيقي في كل رهان، واختبار إحصائي على أرقام الجولات: هل العجلة عادلة، أم مائلة، أم مُعاد تشغيلها — وما لا يمكن توقّعه مهما قيل', 'The real house edge on every bet, and a statistical test on the winning numbers: is the wheel fair, biased, or replayed — and what cannot be predicted whatever anyone claims'],
  back: ['العودة للتطبيق', 'Back to the app'],
  checkLink: ['فحص الكازينو', 'Casino check'],
  minesLink: ['Mines من أ إلى ي', 'Mines from A to Z'],
  casinoLink: ['كيف يكسب الكازينو', 'How the casino wins'],
  language: ['English', 'العربية'],
  privacy: ['كل شيء هنا يُحسب في متصفحك ولا يُرسل شيء. سياسة الصفحة تمنع أي اتصال.', 'Everything here is computed in your browser and nothing is sent. The page policy blocks every connection.'],

  // Story: how a roulette "hack" really works, and its honest limit
  storyTitle: ['كيف «يُهكَّر» الروليت فعلًا — وما حدوده', 'How roulette is really "hacked" — and its limit'],
  story1: ['١ — توقّع من ميل العجلة: في عجلة فيزيائية معيبة يتكرر رقم أو قطاع أكثر من المتوقع. يُكشف بجمع آلاف الجولات وقياس التكرار — لا بالتخمين. الاختبار في الأسفل يفعل هذا بالضبط.', '1 — Bias prediction: a faulty physical wheel favours a number or sector more than expected. It is found by logging thousands of spins and measuring the frequency — not by guessing. The test below does exactly this.'],
  story2: ['٢ — إعادة الحالة («سكّرها وفتحها»): إن حُسمت نتيجة الجولة وخُزّنت في الجلسة بلا حماية، فإغلاق اللعبة وإعادة فتحها قد يعيد سحب بذرة أو يعيد جولة رابحة. هذه ثغرة برمجية حقيقية، لا «حظ».', '2 — State replay ("close and reopen"): if a round\'s result is fixed and stored in the session without protection, closing and reopening the game may re-draw a seed or replay a winning round. This is a real software flaw, not "luck".'],
  story3: ['٣ — التلاعب من جهة العميل: إن حُسبت النتيجة أو الرصيد في المتصفح بدل الخادم، يمكن تعديل الطلب وإرسال نتيجة رابحة. يُكشف بمراقبة حركة الشبكة: من يقرّر — المتصفح أم الخادم؟', '3 — Client-side tampering: if the result or balance is computed in the browser instead of the server, a request can be edited to send a winning outcome. It shows in the network traffic: who decides — the browser or the server?'],
  story4: ['٤ — الحدّ الصادق: عجلة عشوائية سليمة بلا ذاكرة. لا بذرة محسومة مسبقًا، ولا «بوت توقّع»، ولا ذكاء يقرأ الرقم القادم. من يبيعك توقّعًا للرقم التالي يبيعك وهمًا. ما يُكشف: الخلل، لا الغيب.', '4 — The honest limit: a sound random wheel has no memory. No pre-fixed seed, no "predictor bot", no AI reads the next number. Anyone selling you the next number sells an illusion. What is exposed is the flaw, not the future.'],

  // House edge
  edgeTitle: ['١. أجر البيت الحقيقي في كل رهان', '1. The real house edge on every bet'],
  edgeIntro: ['اختر نوع العجلة. المضاعِف المعروض أقل دائمًا من الاحتمال الحقيقي؛ الفرق هو ما يأخذه البيت من كل درهم، مهما راهنت وأينما راهنت.', 'Pick the wheel type. The paid odds are always below the true odds; the gap is what the house takes from every dirham, whatever and wherever you bet.'],
  wheelLabel: ['نوع العجلة', 'Wheel type'],
  wheelEU: ['أوروبية (صفر واحد)', 'European (single zero)'],
  wheelUS: ['أمريكية (صفر مزدوج)', 'American (double zero)'],
  colBet: ['الرهان', 'Bet'],
  colPayout: ['ما يدفعه', 'Pays'],
  colTrueOdds: ['الاحتمال الحقيقي', 'True chance'],
  colRtp: ['العائد', 'RTP'],
  colEdge: ['أجر البيت', 'House edge'],
  betNames: [
    { k: 'straight', ar: 'رقم واحد', en: 'Straight' },
    { k: 'split', ar: 'رقمان', en: 'Split' },
    { k: 'street', ar: 'ثلاثة', en: 'Street' },
    { k: 'corner', ar: 'أربعة', en: 'Corner' },
    { k: 'basket', ar: 'السلة (0-00-1-2-3)', en: 'Basket (0-00-1-2-3)' },
    { k: 'line', ar: 'ستة', en: 'Line (six)' },
    { k: 'column', ar: 'عمود', en: 'Column' },
    { k: 'dozen', ar: 'دستة', en: 'Dozen' },
    { k: 'even', ar: 'أحمر/أسود، زوجي/فردي…', en: 'Red/black, odd/even…' },
  ],
  edgeNote: ['في العجلة الأوروبية كل رهان يعيد 36 من 37 (أجر 2.70٪). في الأمريكية 36 من 38 (أجر 5.26٪)، ورهان السلة أسوأ. لا يوجد رهان «أذكى» — الأجر واحد في الطاولة كلها.', 'On the European wheel every bet returns 36 of 37 (2.70% edge). On the American, 36 of 38 (5.26%), and the basket is worse. There is no "smarter" bet — the edge is the same across the table.'],

  // Sequence analyzer
  seqTitle: ['٢. اختبر أرقام الجولات: عادلة أم مائلة؟', '2. Test the winning numbers: fair or biased?'],
  seqIntro: ['انسخ شريط الأرقام الفائزة من أعلى اللعبة والصقه (الأحدث أو الأقدم، لا يهم الترتيب). نُجري عليه اختبارات حقيقية: توزّع الأرقام، ميل كل رقم، توازن الأحمر/الأسود، والارتباط المتسلسل. كلما زادت الأرقام، أدقّ الحكم.', 'Copy the strip of winning numbers from the top of the game and paste it (newest or oldest, order does not matter). We run real tests on it: the spread of numbers, each number\'s bias, the red/black balance, and serial correlation. The more numbers, the sharper the verdict.'],
  seqIn: ['الأرقام الفائزة', 'Winning numbers'],
  seqHint: ['مثال: 29 27 6 20 2 11 26 36 13 21 21 1 22 8 — كما تظهر في الشريط العلوي.', 'e.g. 29 27 6 20 2 11 26 36 13 21 21 1 22 8 — as shown in the top strip.'],
  analyse: ['حلّل', 'Analyse'],
  example: ['مثال', 'Example'],
  seqNeed: ['أدخل أرقام الجولات أولًا.', 'Enter the winning numbers first.'],
  cRounds: ['جولات', 'Spins'],
  cRedBlack: ['أحمر مقابل أسود', 'Red vs black'],
  cUniform: ['توزّع الأرقام (p)', 'Number spread (p)'],
  cSerial: ['الارتباط المتسلسل (p)', 'Serial correlation (p)'],
  cHot: ['الأكثر تكرارًا', 'Hottest number'],
  vFair: ['ضمن العادل: لا ميل ولا نمط يُستغل في هذه الأرقام. عجلة سليمة لا تُتوقَّع — مهما بلغ عدد الجولات.', 'Within fair: no bias or exploitable pattern in these numbers. A sound wheel cannot be predicted — however many spins you add.'],
  vAnomaly: ['شذوذ: الأرقام لا تتصرف كعجلة عادلة. راجع الأرقام المميّزة بالأحمر أدناه — قد يكون ميلًا أو مولّدًا ضعيفًا يستحق التوثيق.', 'Anomaly: the numbers do not behave like a fair wheel. Review the flagged numbers below — it may be a bias or a weak generator worth documenting.'],
  vInsufficient: ['أرقام قليلة للحكم. للاختبار الكامل على الأرقام تحتاج {need} جولة إضافية على الأقل. اجمع الشريط عبر عدة جلسات والصقه كله.', 'Too few numbers to judge. A full per-number test needs at least {need} more spins. Collect the strip over several sessions and paste it all.'],
  biasTitle: ['ميل كل رقم', 'Each number\'s bias'],
  biasIntro: ['لكل رقم: كم مرة ظهر مقابل المتوقّع، وبُعده بالانحرافات المعيارية (z). الأرقام المميّزة تجاوزت عتبة صارمة تراعي أنّنا نفحص كل الأرقام معًا.', 'For each number: how often it appeared versus expected, and its distance in standard deviations (z). Flagged numbers crossed a strict threshold that accounts for testing all numbers at once.'],
  colNum: ['الرقم', 'Number'],
  colSeen: ['ظهر', 'Seen'],
  colExp: ['المتوقّع', 'Expected'],
  colZ: ['z', 'z'],
  flaggedTag: ['مميّز', 'flagged'],
  evenTitle: ['الرهانات المتساوية', 'Even-money bets'],
  evenRedBlack: ['أحمر/أسود', 'Red/black'],
  evenOddEven: ['زوجي/فردي', 'Odd/even'],
  evenHighLow: ['عالٍ/منخفض (1-18 / 19-36)', 'High/low (1-18 / 19-36)'],
  evenShare: ['{hits} من {trials} ({share})', '{hits} of {trials} ({share})'],
  evenOk: ['متوازن', 'balanced'],
  evenOff: ['مائل', 'skewed'],

  // Replay checklist
  replayTitle: ['٣. اختبار ثغرة «سكّرها وفتحها» (إعادة الحالة)', '3. Testing the "close and reopen" flaw (state replay)'],
  replayIntro: ['إن قيل إنّ أحدهم ربح بإغلاق اللعبة وإعادة فتحها، فهذه طريقة فحصها جنائيًّا — بلا تخمين:', 'If someone is said to have won by closing and reopening the game, this is how to check it forensically — without guessing:'],
  replay1: ['افتح أدوات المطوّر (F12) ← الشبكة، وشغّل جولة. راقب: هل تصل نتيجة الدورة في ردّ من الخادم، أم تُحسب داخل الصفحة؟ إن كانت داخل الصفحة فالنتيجة قابلة للتلاعب.', 'Open DevTools (F12) → Network and play a round. Watch: does the spin result arrive in a server response, or is it computed in the page? If it is in the page, the result can be tampered with.'],
  replay2: ['دوّن معرّف الجولة/البذرة قبل الإغلاق. أغلق اللعبة وأعد فتحها. هل عاد نفس المعرّف/البذرة؟ عودة نفس الجولة = ثغرة إعادة حالة حقيقية، تُوثّق.', 'Note the round ID/seed before closing. Close the game and reopen it. Did the same ID/seed come back? The same round returning = a real state-replay flaw, to be documented.'],
  replay3: ['راقب الرصيد: هل يُحدَّث من الخادم عند كل جولة، أم يُخزَّن محليًّا ويُصدَّق لاحقًا؟ الرصيد المحلي القابل للتعديل هو ما يصنع «أرباحًا» لا تُسحب.', 'Watch the balance: is it updated by the server each round, or stored locally and trusted later? An editable local balance is what makes "winnings" that never withdraw.'],
  replay4: ['السؤال الحاسم: هل نزلت الأرباح حسابًا بنكيًّا فعلًا، أم بقيت رقمًا في التطبيق؟ هذا وحده يفرّق بين ثغرة مُستغَلّة وطُعم تجنيد.', 'The decisive question: did the winnings actually reach a bank account, or stay a number in the app? That alone separates an exploited flaw from recruitment bait.'],

  // Operator
  siteTitle: ['٤. الطبقة الأخيرة: الموقع لا اللعبة', '4. The last layer: the site, not the game'],
  siteText: ['حتى لو كانت الأرقام عادلة والعجلة سليمة، الموقع غير المرخّص في الإمارات يمسك رصيدك: يجمّد الحساب، يرفض السحب بحجة «شرط البونص»، ويغلق النطاق ويعود باسم جديد. افحص الموقع نفسه:', 'Even if the numbers are fair and the wheel is sound, a site unlicensed in the UAE holds your balance: it freezes the account, refuses withdrawals citing a "bonus condition", and closes the domain to return under a new name. Check the site itself:'],
  siteBtn: ['افحص الموقع الذي تلعب عليه', 'Check the site you play on'],
};

export function text(key, lang) {
  const v = T[key];
  if (v === undefined) return key;
  if (Array.isArray(v) && typeof v[0] === 'string') return lang === 'en' ? v[1] : v[0];
  return v;
}

export function fmt(s, vars) {
  return String(s).replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : '{' + k + '}'));
}
