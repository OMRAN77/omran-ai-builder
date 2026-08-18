// live-answers.js — طبقة "إجابات حيّة" موحّدة (CJS)
// محوّل من live-answers.ts بلا اعتماديات خارجية.

// ============================================================
// 1) متى يبحث
// ============================================================

function buildSystemPrompt(opts) {
  opts = opts || {};
  const now = opts.now || new Date();
  const date = new Intl.DateTimeFormat('ar', {
    dateStyle: 'full',
    timeZone: 'Asia/Dubai',
  }).format(now);
  const year = now.getFullYear();

  const facts =
    opts.memoryFacts && opts.memoryFacts.length
      ? '\n\nما تعرفه عن المستخدم:\n' + opts.memoryFacts.slice(0, 5).map(function (f) { return '- ' + f; }).join('\n')
      : '';

  return 'تاريخ اليوم: ' + date + ' (' + year + ').\n\n' +
    'الأسلوب:\n' +
    '- تكلّم بالعربية كإنسان طبيعي، بجمل قصيرة، وبنفس لهجة المستخدم.\n' +
    '- لا تبدأ بـ"بالطبع" أو "يسعدني مساعدتك"، وادخل في الجواب مباشرة.\n' +
    '- لا تستخدم القوائم النقطية إلا إذا كان الجواب فعلاً قائمة.\n' +
    '- ردّ بقدر السؤال: سؤال بسيط = سطر أو سطران.\n' +
    '- إذا سُئلت هل أنت إنسان، قل إنك ذكاء اصطناعي بوضوح وبدون اعتذار طويل.' +
    (opts.styleHint ? '\n- ' + opts.styleHint : '') +
    '\n\nالدقة:\n' +
    '- معرفتك المخزّنة قديمة وقد تكون خاطئة اليوم.\n' +
    '- ابحث في الويب إلزامياً إذا كان السؤال عن: أخبار، أسعار، طقس، نتائج مباريات،\n' +
    '  إصدارات ونسخ البرامج، منصب حالي (من هو رئيس/مدير/مالك…)، أو فيه كلمة\n' +
    '  "الآن/آخر/أحدث/جديد/حالياً/ما زال"، أو فيه اسم أو مصطلح لا تعرفه بثقة.\n' +
    '- لا تبحث في: التعريفات، الرياضيات، البرمجة، الأحداث التاريخية المنتهية.\n' +
    '- عند وجود قسم <مصادر> في الرسالة: اعتمد عليه وحده في الحقائق المتغيّرة.\n' +
    '  ما لم تذكره المصادر، قل "ما لقيت معلومة مؤكدة عنه".\n' +
    '- إذا تعارضت المصادر، اذكر التعارض بدل اختيار رواية واحدة.\n' +
    '- أشر إلى المصادر برقمها هكذا [1]، وضع روابطها في نهاية الجواب.\n' +
    '- لا تخمّن أرقاماً أو تواريخ أو أسماء. "ما أعرف" جواب مقبول.' + facts;
}

/** مرشّح رخيص قبل استدعاء النموذج. */
var LIVE_HINTS =
  /(الآن|حاليا|حالياً|اليوم|أمس|آخر|أحدث|جديد|ما زال|لا يزال|سعر|أسعار|طقس|خبر|أخبار|نتيجة|نتائج|مباراة|إصدار|نسخة|من هو رئيس|من هو مدير|كم عمر|latest|current|news|price|weather|score|today|now)/i;

var STATIC_HINTS =
  /(اشرح|عرّف|ما معنى|ما هو تعريف|احسب|اكتب كود|صحح|ترجم|لخّص لي النص|explain|define|calculate|write code|translate)/i;

function mightNeedSearch(userText) {
  if (STATIC_HINTS.test(userText) && !LIVE_HINTS.test(userText)) return false;
  if (LIVE_HINTS.test(userText)) return true;
  // غير محسوم → اترك القرار للنموذج عبر tool-calling
  return true;
}

// ============================================================
// 4) الكاش
// ============================================================

var NEWSY = /(خبر|أخبار|سعر|أسعار|طقس|مباراة|نتيجة|بث|عاجل|news|price|weather|score|live)/i;

/** أخبار وأسعار: 15 دقيقة. غير ذلك: 6 ساعات. */
function pickTtl(query) {
  return NEWSY.test(query) ? 15 * 60 : 6 * 60 * 60;
}

function cacheKey(kind, s) {
  return 'live:' + kind + ':' + s.trim().toLowerCase().replace(/\s+/g, ' ');
}

// ============================================================
// 2) جودة البحث
// ============================================================

var PLAN_PROMPT = 'حوّل سؤال المستخدم إلى استعلامات بحث.\n' +
  'القواعد: كل استعلام من 2 إلى 6 كلمات، ومختلف عن الآخر في الزاوية لا في الصياغة.\n' +
  'سؤال بسيط = استعلام واحد. سؤال مركّب أو مقارنة = 3 إلى 6 استعلامات، واحد لكل عنصر.\n' +
  'أضف السنة الحالية فقط إذا كان السؤال زمنياً.\n' +
  'أجب بمصفوفة JSON من النصوص فقط، بدون أي شرح أو علامات markdown.\n\n' +
  'السؤال: ';

async function planQueries(userText, deps, year) {
  if (!year) year = new Date().getFullYear();
  try {
    var raw = await deps.llm(
      PLAN_PROMPT + userText + '\n(السنة الحالية: ' + year + ')'
    );
    var clean = raw.replace(/```json|```/g, '').trim();
    var arr = JSON.parse(clean);
    if (Array.isArray(arr) && arr.length) {
      return arr.filter(function (q) { return typeof q === 'string'; }).slice(0, 6);
    }
  } catch (e) {
    // تجاهل — نرجع للاحتياطي
  }
  return [userText.slice(0, 80)];
}

/**
 * ينفّذ الاستعلامات بالتوازي، يزيل التكرار بالرابط، ثم يجلب أفضل الصفحات كاملة.
 */
async function gather(queries, deps, fetchTop) {
  if (fetchTop == null) fetchTop = 3;
  var cache = deps.cache;

  var batches = await Promise.all(
    queries.map(async function (q) {
      var key = cacheKey('q', q);
      if (cache) {
        var hit = await cache.get(key);
        if (hit) { try { return JSON.parse(hit); } catch (e) { /* cache مفسد — نبحث */ } }
      }
      try {
        var res = await deps.search(q);
        if (cache) await cache.set(key, JSON.stringify(res), pickTtl(q));
        return res;
      } catch (e) {
        return [];
      }
    })
  );

  var seen = new Set();
  var merged = [];
  // تناوب بين الاستعلامات حتى لا يبتلع استعلام واحد كل المقاعد
  var maxLen = 0;
  for (var b = 0; b < batches.length; b++) {
    if (batches[b].length > maxLen) maxLen = batches[b].length;
  }
  for (var i = 0; i < maxLen; i++) {
    for (var j = 0; j < batches.length; j++) {
      var r = batches[j][i];
      if (!r || !r.url) continue;
      var dedupe = safePath(r.url);
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      merged.push(r);
    }
  }

  var top = merged.slice(0, fetchTop);
  var pages = await Promise.all(
    top.map(async function (r) {
      var key = cacheKey('p', r.url);
      if (cache) {
        var hit = await cache.get(key);
        if (hit) return hit;
      }
      try {
        var text = (await deps.fetchPage(r.url)).slice(0, 6000);
        if (cache) await cache.set(key, text, pickTtl(r.title));
        return text;
      } catch (e) {
        return r.snippet; // الصفحة فشلت → نكتفي بالمقتطف
      }
    })
  );

  var sources = top.map(function (r, i) {
    return { n: i + 1, title: r.title, url: r.url, text: pages[i] || r.snippet };
  });

  // بقية النتائج تدخل كمقتطفات فقط
  merged.slice(fetchTop, fetchTop + 5).forEach(function (r, i) {
    sources.push({
      n: fetchTop + i + 1,
      title: r.title,
      url: r.url,
      text: r.snippet,
    });
  });

  return sources;
}

function safePath(url) {
  try {
    var u = new URL(url);
    return u.hostname.replace(/^www\./, '') + u.pathname;
  } catch (e) {
    return url;
  }
}

function safeHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (e) {
    return url;
  }
}

// ============================================================
// 3) منع الهلوسة
// ============================================================

function buildGroundedContext(userText, sources) {
  if (!sources.length) {
    return userText + '\n\n(لم تُرجع عملية البحث نتائج. قل للمستخدم إنك لم تجد معلومة مؤكدة بدل التخمين.)';
  }

  var blocks = sources
    .map(function (s) {
      return '[' + s.n + '] ' + s.title + ' — ' + safeHost(s.url) + '\n' + s.url + '\n' + s.text.trim();
    })
    .join('\n\n---\n\n');

  return '<مصادر>\n' + blocks + '\n</مصادر>\n\n' +
    'اعتمد على المصادر أعلاه وحدها في أي حقيقة متغيّرة، وأشر إليها بالأرقام [1] [2].\n' +
    'ما لم تذكره المصادر لا تخترعه. إذا تعارضت، اذكر التعارض.\n' +
    'ضع قائمة الروابط المستخدمة في نهاية الجواب.\n\n' +
    'سؤال المستخدم: ' + userText;
}

// ============================================================
// التجميع
// ============================================================

/** نقطة الدخول الوحيدة: نادِها قبل إرسال المحادثة إلى النموذج. */
async function prepareTurn(userText, deps, opts) {
  opts = opts || {};
  var system = buildSystemPrompt(opts);

  if (!mightNeedSearch(userText)) {
    return { system: system, userMessage: userText, sources: [], searched: false };
  }

  var queries = await planQueries(userText, deps);
  var sources = await gather(queries, deps);

  return {
    system: system,
    userMessage: buildGroundedContext(userText, sources),
    sources: sources,
    searched: true,
  };
}

module.exports = {
  buildSystemPrompt: buildSystemPrompt,
  mightNeedSearch: mightNeedSearch,
  planQueries: planQueries,
  gather: gather,
  buildGroundedContext: buildGroundedContext,
  prepareTurn: prepareTurn,
  pickTtl: pickTtl,
  cacheKey: cacheKey,
};
