'use strict';
/* tests/_route-src.cjs — مساعد اختبارات التوجيه: يستخرج تعابير __sendPromptCore وشروطه الحقيقيّة من js/app-09-attach.js
   (نصّها من الكود لا نسخةً منه) ويشغّلها في vm، فيُختبر القرار نفسه الذي يأخذه التطبيق بلا متصفّح.
   يستعمله tests/route-corpus.test.cjs (المدوّنة كلّها) وtests/route-families.test.cjs. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load(root) {
  root = root || path.join(__dirname, '..');
  const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
  const SRC = read('js/app-09-attach.js');
  const line = (head) => { const i = SRC.indexOf(head); if (i < 0) throw new Error('مفقود: ' + head); return SRC.slice(i, SRC.indexOf('\n', i)); };
  const stmt = (head) => { const i = SRC.indexOf(head); if (i < 0) throw new Error('مفقود: ' + head); return SRC.slice(i, SRC.indexOf(';\n', i) + 1); };
  const block = (head, end) => { const i = SRC.indexOf(head); if (i < 0) throw new Error('مفقود: ' + head); const j = SRC.indexOf(end, i); return SRC.slice(i, j + end.length); };
  const has = (head) => SRC.indexOf(head) >= 0;

  /* المحلّل الحقيقيّ لنصّ الصورة (app-08) — يستعمله __IMG_FOLLOW */
  const IMG_TEXT = { window: {} }; IMG_TEXT.self = IMG_TEXT.window; IMG_TEXT.globalThis = IMG_TEXT;
  vm.runInNewContext(read('js/app-08-image-text.js'), IMG_TEXT);

  /* التعابير الوحيدة: كلّ ما يلزم قرارات المدوّنة (ما غاب عن نسخة قديمة يُترك فارغًا فيُعرف من الاسم) */
  const ctx = { window: { __isExplicitImageEdit: IMG_TEXT.window.__isExplicitImageEdit } };
  const optional = (head) => (has(head) ? line(head) : '');
  vm.runInNewContext([
    line('const __MEDIA_WORD_RE = '), line('const __MEDIA_MAKE_RE = '), line('const __MEDIA_TALK_RE = '),
    optional('const __OMRAN_ACK_RE = '),
    line('const __VID_MAKE_RE = '), line('const __VID_Q_RE '),
    line('const __routeCmdRe = '), line('const __questionStartRe = '),
    line('const __codeWordRe = '), line('const __ATT_VISION_RE = '), line('const __nanoQ = '), line('const __imgEditRe = '),
    line('const __imgGenIntentRe = '), line('const __videoWordRe = '), line('const __animateRe = '),
    line('const __mediaTriggerWordsRe = '),
    block('    function __isVagueMediaRequest(raw){', '\n    }'),
    line('const __unifiedBuildRe = '), line('const __txtOnlyImgRe = '), line('const __rtDesignMakeRe = '), line('const __rtDesignWantRe = '),
    line('const __bareDraw = ').replace(/\.test\(text\);\s*$/, ';').replace('const __bareDraw = ', 'const __bareDrawRe = '),
    'this.R = { MEDIA_WORD: __MEDIA_WORD_RE, MEDIA_MAKE: __MEDIA_MAKE_RE, MEDIA_TALK: __MEDIA_TALK_RE, VID_MAKE: __VID_MAKE_RE, VID_Q: __VID_Q_RE,',
    '  routeCmd: __routeCmdRe, questionStart: __questionStartRe, codeWord: __codeWordRe, attVision: __ATT_VISION_RE, nanoQ: __nanoQ, imgEdit: __imgEditRe,',
    '  imgGen: __imgGenIntentRe, videoWord: __videoWordRe, animate: __animateRe, unifiedBuild: __unifiedBuildRe, txtOnly: __txtOnlyImgRe,',
    '  designMake: __rtDesignMakeRe, designWant: __rtDesignWantRe, bareDraw: __bareDrawRe, ack: (typeof __OMRAN_ACK_RE !== "undefined" ? __OMRAN_ACK_RE : null) };',
    'this.vague = __isVagueMediaRequest;',
    /* __wantsVideo بنصّه: الصورة مرفقة (photo) أو لا */
    'this.wantsVideo = function(text, photo, lane){',
    '  const __mediaLane = lane || null, __srcImg = photo ? { isImage: true } : null, __vidSrc = photo ? { b64: "x" } : null, cur = { lastMsgWasImageEdit: false };',
    '  ' + stmt('const __wantsVideo = '),
    '  return __wantsVideo;',
    '};',
    /* بوّابة المصنّف أوّل الإرسال (v-media-gate/v-chat-fast): هل يُسأل؟ */
    'this.classifierCalled = (text) => __MEDIA_WORD_RE.test(text) && !__MEDIA_TALK_RE.test(text) && __MEDIA_MAKE_RE.test(text);',
  ].join('\n'), ctx);

  /* المتابعة بعد صورة مولَّدة: __IMG_FOLLOW و__FOLLOW_ANY و__FOLLOW_DEFAULT و__STYLE_FOLLOW بنصوصها */
  const imgFollowStart = SRC.indexOf('const __IMG_FOLLOW = (function(){');
  const imgFollowSrc = SRC.slice(imgFollowStart, SRC.indexOf('\n  })();', imgFollowStart) + '\n  })();'.length);
  const F = { window: { __isExplicitImageEdit: IMG_TEXT.window.__isExplicitImageEdit } };
  const MEM_HEAD = 'if(!imageAttachments.length && cur.lastEditedImage && cur.lastEditedImage.b64 && !__rtWriteAsk';
  const memAt = SRC.indexOf(MEM_HEAD);
  const memCond = SRC.slice(memAt + MEM_HEAD.length, SRC.indexOf('){\n', memAt));
  const EDIT_HEAD = '    if(!__freshGenWins && !__SHOT_ANALYZE && ';
  const editLine = line(EDIT_HEAD);
  const ackVeto = editLine.includes('!__OMRAN_ACK_RE.test(text)');
  const qStart = (editLine.match(/!(\/\^\(\?:وش\|[^\n]*?\/i)\.test\(text\)/) || [])[1];
  if (!qStart) throw new Error('مفقود: سؤال مدخل التعديل');
  vm.runInNewContext([
    'const __omranPrev = ' + SRC.slice(SRC.indexOf('function omranPrevTurnHadImage(messages){'), SRC.indexOf('\n}\n', SRC.indexOf('function omranPrevTurnHadImage(messages){')) + 2) + ';',
    optional('const __OMRAN_ACK_RE = '),
    'this.after = function(text, prevUser){',
    '  const omranPrevTurnHadImage = __omranPrev;',
    '  const cur = { lastMsgWasImageEdit: true, lastEditedImage: { b64: "x", mime: "image/png" }, messages: [',
    '    { role: "user", content: prevUser || "ارسم صورة صقر على جبل" }, { role: "assistant", content: "", attachments: [{ isImage: true, name: "generated.png" }] } ] };',
    '  const getCurrent = () => cur, pendingAttachments = [], imageAttachments = [];',
    line('const __rtWriteVerbRe = '), line('const __rtImgRefRe = '), line('const __rtDocNounRe = '), line('const __rtStyleCueRe = '), line('const __rtSuggestRe = '), line('const __rtPutRe = '), line('const __rtWriteAsk = '), line('const __rtTextOutRe = '), line('const __rtTextOut = '), line('const __rtTextRevRe = '), line('const __rtIsTextOut = '), line('const __rtQRe = '), line('const __rtContRe = '), line('const __rtDocNameRe = '),
    SRC.slice(SRC.indexOf('  const __rtCtx = '), SRC.indexOf('  })();', SRC.indexOf('  const __rtCtx = ')) + 7),
    line('const __rtTextRev = '), line('const __rtAfterTextOut = '),
    line('const __IMGF_NEW_RE = '), line('const __IMGF_NOT_RE = '), line('const __IMG_EDIT_VERB_RE = '),
    imgFollowSrc,
    line('const __nanoQ = '), line('const __ATT_VISION_RE = '), line('const __codeWordRe = '), optional('const __ackOnly = '),
    '  const __srcImg = null;',
    line('const __FOLLOW_ANY = '),
    line('const __imgEditRe = '), line('const __IMG_CREATIVE_RE = '), line('const __editStyleIntent = '), line('const __FOLLOW_DEFAULT = '),
    line('const __STYLE_RE = '), line('const __styleShort = '), line('const __STYLE_FOLLOW = '),
    line('const __imgGenIntentRe = '),
    /* إرفاق صورة الذاكرة (شرط الكود بنصّه) — معه تكفي كلمة تعديل/توليد لدخول مسار التعديل */
    '  const mem = !!(!imageAttachments.length && cur.lastEditedImage && cur.lastEditedImage.b64 && !__rtWriteAsk' + memCond + ');',
    '  const editWord = __imgEditRe.test(text) || __imgGenIntentRe.test(text);',
    /* فيتوهات مدخل مسار التعديل (السطر نفسه في الكود): شكر (إن وُجد)، كود، قراءة، سؤال */
    '  const veto = ' + (ackVeto ? '__OMRAN_ACK_RE.test(text) || ' : '') + '__codeWordRe.test(text) || __ATT_VISION_RE.test(text) || ' + qStart + '.test(text) || /[؟?]\\s*$/.test(text);',
    '  return { follow: __IMG_FOLLOW, any: __FOLLOW_ANY, def: __FOLLOW_DEFAULT, style: __STYLE_FOLLOW, mem, editWord, veto,',
    '    edit: !veto && (__IMG_FOLLOW || __FOLLOW_ANY || __FOLLOW_DEFAULT || __STYLE_FOLLOW || (mem && editWord)) };',
    '};',
  ].join('\n'), F);

  return { SRC, R: ctx.R, vague: ctx.vague, wantsVideo: ctx.wantsVideo, classifierCalled: ctx.classifierCalled, after: F.after };
}

/* قرارات المدوّنة (tests/fixtures/route-corpus/*.json) بالتعابير وحدها، ستّ عائلات يحسمها تعبير واحد أو اثنان:
   ack    — متابعة بعد صورة مولَّدة يُتوقَّع لها كلام: لا __IMG_FOLLOW ولا __FOLLOW_ANY/DEFAULT ولا __STYLE_FOLLOW ولا كلمة تعديل/توليد
   ask    — طلب مبهم: صانع الفيديو المجّانيّ، أو «ارسم» وحدها، أو حارس الإبهام
   photoVideo — صورة مرفقة + تحريك: __wantsVideo أو صانع الفيديو
   ocr    — صورة مرفقة + قراءة فيها فعل تعديل («حول/اكتب…»): __ATT_VISION_RE أو سؤال
   textVideo / textImage — نصّ بلا مرفق يُتوقَّع له فيديو/صورة: تعبير المسار يطابق (المصنّف oracle كما في المدوّنة)
   chatSafe — نصّ بلا مرفق يُتوقَّع له كلام: لا يفتح صانع الفيديو ولا مسار فيديو/صورة والمصنّف متعذّر (null)
   يُرجع لكلّ عائلة قائمة المعرّفات التي يخطئ فيها القرار. */
function corpusMisses(h, sets) {
  const R = h.R;
  const out = { ack: [], ask: [], photoVideo: [], ocr: [], textVideo: [], textImage: [], chatSafe: [] };
  const n = { ack: 0, ask: 0, photoVideo: 0, ocr: 0, textVideo: 0, textImage: 0, chatSafe: 0 };
  const isImgStep = (st) => ['image', 'edit', 'edit-text'].includes(st.expect) || (Array.isArray(st.exp) && st.exp.some((e) => /^IMG_/.test(e)));
  const isChat = (st) => /^chat/.test(st.expect || '') || (Array.isArray(st.exp) && st.exp.length && st.exp.every((e) => e === 'CHAT' || e === 'CHAT_IMG'));
  const vidOpens = (t, lane) => R.VID_MAKE.test(t) && !R.VID_Q.test(t) && lane !== 'none' && lane !== 'image';
  const builder = (t, lane) => lane !== 'none' && lane !== 'video' && !R.codeWord.test(t) && (R.designMake.test(t) || (lane === 'image' && R.designWant.test(t)) || R.txtOnly.test(t) || (R.imgGen.test(t) && /صور|رسمة|منظر|تصور|image|picture|visual/i.test(t)) || (R.unifiedBuild.test(t) && !R.nanoQ.test(t)));
  const laneOf = (t, clf) => (R.MEDIA_WORD.test(t) ? (R.MEDIA_TALK.test(t) ? 'none' : (R.MEDIA_MAKE.test(t) ? (clf === undefined ? null : clf) : null)) : null);
  for (const set of sets) {
    for (const c of set.cases) {
      const steps = [c].concat(c.then || []);
      steps.forEach((st, i) => {
        const id = set.name + ':' + (i ? (st.id || c.id + '.' + i) : c.id);
        const t = String(st.text || '');
        const prev = i ? steps[i - 1] : null;
        if (prev && isImgStep(prev) && !st.attach && isChat(st)) {
          n.ack++;
          if (h.after(t, prev.text).edit) out.ack.push(id);
        }
        if (st.expect === 'ask' && !st.attach) {
          n.ask++;
          if (!(vidOpens(t, laneOf(t, st.clf || st.lane || 'none')) || R.bareDraw.test(t) || h.vague(t))) out.ask.push(id);
        }
        if (st.attach === 'photo' && (st.expect === 'video' || (Array.isArray(st.exp) && st.exp.includes('VIDEO')))) {
          n.photoVideo++;
          if (!(h.wantsVideo(t, true, null) || (R.VID_MAKE.test(t) && !R.VID_Q.test(t)))) out.photoVideo.push(id);
        }
        if (st.attach && (st.expect === 'vision' || (Array.isArray(st.exp) && st.exp.length === 1 && st.exp[0] === 'CHAT_IMG')) && R.imgEdit.test(t)) {
          n.ocr++;
          if (!(R.attVision.test(t) || R.nanoQ.test(t))) out.ocr.push(id);
        }
        if (!i && !st.attach && !c.ctx && (st.expect === 'video' || (Array.isArray(st.exp) && st.exp.length === 1 && st.exp[0] === 'VIDEO'))) {
          n.textVideo++;
          const lane = laneOf(t, st.clf || st.lane || 'none');
          if (!(vidOpens(t, lane) || h.wantsVideo(t, false, lane))) out.textVideo.push(id);
        }
        if (!i && !st.attach && !c.ctx && (st.expect === 'image' || (Array.isArray(st.exp) && st.exp.length === 1 && st.exp[0] === 'IMG_GEN'))) {
          n.textImage++;
          const lane = laneOf(t, st.clf || st.lane || 'none');
          if (!builder(t, lane) || R.bareDraw.test(t) || h.vague(t)) out.textImage.push(id);
        }
        if (!i && !st.attach && !c.ctx && isChat(st)) {
          n.chatSafe++;
          const lane = laneOf(t, null);
          if (vidOpens(t, lane) || h.wantsVideo(t, false, lane)) out.chatSafe.push(id);
        }
      });
    }
  }
  return { misses: out, counts: n };
}

function loadCorpus(root) {
  root = root || path.join(__dirname, '..');
  const dir = path.join(root, 'tests/fixtures/route-corpus');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => ({ name: f.replace(/\.json$/, ''), cases: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) }));
}

module.exports = { load, corpusMisses, loadCorpus };
