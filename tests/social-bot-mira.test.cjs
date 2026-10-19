// v-mira-series: «مسلسل ميرا» نوع حلقة في بوت التسويق نفسه — قصّتان × ٣٠ يوم من هذي ويوم من هذي، إطار من صورة ميرا الثابتة ثمّ
// مقطعان ٨ ث، فحص صارم (نفس البنت، لا كتابة، لا وجه مشوّه) وإعادة واحدة، والنشر بنفس Upload-Post بمعرّف لا يلمس حلقات البوت.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const load = () => import(path.join(ROOT, 'scripts', 'social-bot-mira.mjs'));
const loadBot = () => import(path.join(ROOT, 'scripts', 'social-bot.mjs'));
const yml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'social-bot.yml'), 'utf8');
const ep = (story, k, extra) => Object.assign({ story, k, title: 'عنوان ' + k, topic: 'موضوع', lines: ['شحالكم! هذي ميرا', 'يالله نشوف'], clips: [{ scene: 'a garden', action: 'Mira waves', sound: 'birds, no speech' }, { scene: 'a kitchen', action: 'Mira smiles', sound: 'soft music, no speech' }], caption: 'ميرا تكتشف شي جديد اليوم', tags: ['#ميرا'] }, extra || {});
const both = () => [...Array.from({ length: 30 }, (_, i) => ep('app', i + 1)), ...Array.from({ length: 30 }, (_, i) => ep('uae', i + 1))];
const row = (id, at, extra) => Object.assign({ external_id: id, upload_timestamp: at, success: true }, extra || {});

test('١) الحالة من سجلّ النشر: آخر حلقة لكلّ قصّة وآخر قصّة نُشرت — وصفوف البوت والفاشلة لا تُحسب', async () => {
  const { miraFromHistory } = await load();
  const st = miraFromHistory([
    row('mira-app-1', '2026-10-20T13:05:00Z'), row('mira-app-1', '2026-10-20T13:05:10Z', { platform: 'facebook' }),
    row('mira-uae-1', '2026-10-21T13:04:00Z'), row('mira-app-2', '2026-10-22T13:03:00Z', { success: false }),
    row('omai-ep-9-site', '2026-10-22T16:00:00Z'),
  ]);
  assert.deepEqual(st, { app: 1, uae: 1, lastStory: 'uae', lastAt: Date.parse('2026-10-21T13:04:00Z') });
});

test('٢) الحلقة الجاية: يوم من هذي ويوم من هذي، أوّلها التطبيق السحري؛ الفاشلة تُعاد في دورها؛ الخالصة تُترك؛ وMIRA_EP يفرض', async () => {
  const { nextEpisode } = await load();
  const eps = both();
  const at = (st) => { const e = nextEpisode(Object.assign({ app: 0, uae: 0, lastStory: '', lastAt: 0 }, st), eps); return e && e.story + ':' + e.k; };
  assert.equal(at({}), 'app:1');
  assert.equal(at({ app: 1, lastStory: 'app' }), 'uae:1');
  assert.equal(at({ app: 1, uae: 1, lastStory: 'uae' }), 'app:2');
  assert.equal(at({ app: 3, uae: 2, lastStory: 'app' }), 'uae:3', 'حلقة uae:3 فشلت أمس ولم تُنشر فتعود اليوم');
  assert.equal(at({ app: 30, uae: 12, lastStory: 'uae' }), 'uae:13', 'التطبيق خلص — تكمل الإمارات');
  assert.equal(at({ app: 30, uae: 30, lastStory: 'uae' }), null);
  assert.equal(nextEpisode({ app: 0, uae: 0 }, eps, 'uae:7').k, 7);
  assert.throws(() => nextEpisode({}, eps, 'uae:31'), /not in mira-episodes/);
  assert.throws(() => nextEpisode({}, eps, 'x7'), /app:3 or uae:7/);
});

test('٣) معرّف ميرا لا يحرّك حلقات البوت: seriesFromHistory يتجاهل mira-…، وموعد ميرا يوميّ (٢٠ ساعة)', async () => {
  const { seriesFromHistory } = await loadBot();
  const { MIRA_ID, miraDue } = await load();
  const bot = seriesFromHistory([row('omai-ep-4-video', '2026-10-20T16:00:00Z'), row(MIRA_ID('app', 9), '2026-10-21T13:00:00Z')]);
  assert.equal(bot.last, 4); assert.equal(bot.lastAt, Date.parse('2026-10-20T16:00:00Z'), 'نشر ميرا لا يعيد بوّابة الـ٣٦ ساعة');
  const t = Date.parse('2026-10-21T13:00:00Z');
  assert.equal(miraDue(t, t + 19 * 36e5), false); assert.equal(miraDue(t, t + 21 * 36e5), true); assert.equal(miraDue(0, t), true);
});

test('٤) الفحص صارم: أيّ حقل ناقص أو شكّ = فشل، وكلّ سبب يُسمّى', async () => {
  const { judgeVerdict } = await load();
  assert.equal(judgeVerdict({ same_character: true, text_present: false, face_deformed: false }).ok, true);
  for (const j of [null, {}, { same_character: true, text_present: false }, { same_character: true, face_deformed: false }, { same_character: 'yes', text_present: false, face_deformed: false }, { same_character: true, text_present: true, face_deformed: false }, { same_character: false, text_present: false, face_deformed: false }, { same_character: true, text_present: false, face_deformed: true }]) {
    assert.equal(judgeVerdict(j).ok, false, JSON.stringify(j));
  }
  assert.match(judgeVerdict({ same_character: false, text_present: true, face_deformed: true, reasons: 'x' }).why, /not the same girl, text in frame, deformed face — x/);
});

test('٥) الأوامر: صورة ميرا الثابتة مرجع كلّ إطار، ولا كتابة في أيّ مشهد، والمقطع بلا كلام (السرد صوتنا نحن)', async () => {
  const m = await load();
  assert.ok(fs.existsSync(m.REF_IMAGE), 'صورة ميرا الثابتة في المستودع');
  const e = ep('app', 1);
  const fp = m.framePrompt('SHEET', e, e.clips[0]), cp = m.clipPrompt('SHEET', e, e.clips[0]);
  for (const p of [fp, cp]) { assert.ok(p.includes(m.NO_TEXT)); assert.ok(p.includes('SHEET')); }
  assert.match(fp, /9:16/); assert.match(fp, /Scene: a garden/); assert.match(fp, /reference image/);
  assert.match(cp, /Action: Mira waves/); assert.match(cp, /No speech, no dialogue/);
  assert.ok(cp.length < 1800, 'تحت حدّ المحرّك');
  assert.match(m.JUDGE_PROMPT, /If unsure about same_character answer false; if unsure about text answer true/);
});

test('٦) النصّ: القصّة ورقم الحلقة وموعد الجاية؛ X ≤٢٨٠ بلا رابط، Threads ≤٥٠٠ برابط ووسم واحد؛ بلا اسم مزوّد', async () => {
  const m = await load(); const bot = await loadBot();
  const c = m.miraCaption(ep('app', 3, { title: 'ميرا تصمّم بطاقة عيد ميلاد ليدّوه', caption: 'ميرا تبي تفاجئ يدّوه ببطاقة حلوة… والتطبيق السحري عنده فكرة! تابعوا وشوفوا شو صار' }), ep('uae', 3));
  assert.match(c.ig, /ميرا والتطبيق السحري · الحلقة 3/); assert.match(c.ig, /باچر «ميرا تكتشف الإمارات» الحلقة 3/); assert.match(c.ig, /#مسلسل_ميرا/);
  assert.ok(bot.xLen(c.x) <= 280); assert.doesNotMatch(c.x, /https?:|vercel\.app/);
  assert.ok(bot.threadsLen(c.threads) <= 500); assert.match(c.threads, /\?ref=threads/); assert.equal((c.threads.match(/#/g) || []).length, 1);
  assert.ok(c.head.length + 8 <= 100, 'عنوان يوتيوب');
  assert.doesNotMatch(Object.values(c).join(' '), /gemini|veo|openai|claude|gpt|جيمناي|كلاود/i);
});

test('٧) المونتاج: المشهدان ثمّ بطاقة النهاية بتلاشٍ (١٩ ث)، الترجمة في وقت مشهدها، السرد فوق صوت المشهد المنخفض', async () => {
  const { composeArgs } = await load();
  const { args, total } = composeArgs({ clips: ['a.mp4', 'b.mp4'], audio: [true, false], narr: ['n1.mp3', null], end: 'e.png', hud: 'h.png', subs: ['s1.png', 's2.png'], out: 'o.mp4' });
  assert.equal(total, 19);
  const fc = args[args.indexOf('-filter_complex') + 1];
  assert.match(fc, /between\(t,0\.5,7\.6\)/); assert.match(fc, /between\(t,8\.5,15\.6\)/);
  assert.match(fc, /xfade=transition=fade:duration=0\.5:offset=15\.5/);
  assert.match(fc, /\[0:a\]atrim/); assert.match(fc, /anullsrc/, 'مقطع بلا صوت = صمت لا كسر');
  assert.match(fc, /adelay=600:all=1/); assert.doesNotMatch(fc, /adelay=8600/, 'السرد المتعذّر يُحذف لا يكسر الأمر');
  assert.match(fc, /volume=0\.35/);
  assert.ok(args.includes('-loop') && args.includes('e.png'));
});

test('٨) ملفّ التشغيل: ميرا يوميًّا ٥ العصر في وظيفتها، والبوت كما هو ٨ المساء؛ صلاحيات ميرا وحدها، والمعاينة لـDRY_RUN', () => {
  assert.match(yml, /cron: '0 16 \* \* \*'/); assert.match(yml, /cron: '0 13 \* \* \*'/);
  assert.match(yml, /reel:\n    if: github\.event\.schedule == '0 16 \* \* \*' \|\| \(github\.event_name == 'workflow_dispatch' && inputs\.series != 'mira'\)/);
  assert.match(yml, /mira:\n    if: github\.event\.schedule == '0 13 \* \* \*' \|\| \(github\.event_name == 'workflow_dispatch' && inputs\.series == 'mira'\)/);
  assert.match(yml, /group: social-bot\n/); assert.match(yml, /group: social-bot-mira/);
  assert.match(yml, /permissions:\n  contents: read/, 'البوت الحاليّ قراءة فقط كما كان');
  assert.match(yml, /contents: write {3}# DRY_RUN preview/); assert.match(yml, /issues: write/);
  assert.match(yml, /node scripts\/social-bot\.mjs --gate-mira/); assert.match(yml, /node scripts\/social-bot\.mjs --mira/);
  assert.match(yml, /id: gate\n        env:\n          UPLOAD_POST_API_KEY: [^\n]*\n          GITHUB_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}\n        run: node scripts\/social-bot\.mjs --gate-mira/, 'البوّابة تقرأ الحلقات الموقوفة');
  assert.match(yml, /GEMINI_API_KEY: \$\{\{ secrets\.GEMINI_API_KEY \}\}/);
  assert.match(yml, /bot\/mira-preview/);
});

test('٩) بوّابة ميرا: الجدول لا ينشر قبل موافقة المالك (live=false)، والتشغيل اليدويّ يمرّ', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mira-'));
  const run = (live, event) => {
    const f = path.join(dir, 'eps-' + live + '.json'), out = path.join(dir, 'out-' + live + event);
    fs.writeFileSync(f, JSON.stringify({ live, character: 'x', episodes: both() }));
    fs.writeFileSync(out, '');
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'social-bot.mjs'), '--gate-mira'], { env: { ...process.env, GITHUB_EVENT_NAME: event, GITHUB_OUTPUT: out, MIRA_EPISODES_FILE: f, UPLOAD_POST_API_KEY: '', GITHUB_ACTIONS: '' }, stdio: 'pipe' });
    return fs.readFileSync(out, 'utf8').trim();
  };
  assert.equal(run(false, 'schedule'), 'go=0');
  assert.equal(run(true, 'schedule'), 'go=0', 'بلا مفتاح Upload-Post لا يُعرف آخر نشر — لا نشر');
  assert.equal(run(false, 'workflow_dispatch'), 'go=1');
});

test('١٠) ملفّ الحلقات: ٣٠ + ٣٠ بأرقامها، سطران ≤١٤ كلمة، مشهدان بلا كلام، نصّ ≤١٦٠ بلا رابط ولا اسم مزوّد', async () => {
  const { loadEpisodes, EPISODES_FILE } = await load();
  const raw = JSON.parse(fs.readFileSync(EPISODES_FILE, 'utf8'));
  assert.equal(typeof raw.live, 'boolean', 'live صريح (قلبه true بعد موافقة المالك لا يكسر الفحص — قفل النشر مفحوص في ١١)');
  const { character, episodes } = loadEpisodes();
  assert.ok(character.length > 80 && /shayla/i.test(character) && /abaya/i.test(character));
  for (const story of ['app', 'uae']) assert.deepEqual(episodes.filter((e) => e.story === story).map((e) => e.k), Array.from({ length: 30 }, (_, i) => i + 1));
  for (const e of episodes) {
    const tag = e.story + ':' + e.k;
    assert.ok(e.title && e.title.length <= 40, tag);
    assert.equal(e.lines.length, 2, tag);
    for (const l of e.lines) assert.ok(l.split(/\s+/).length <= 14, tag + ' ' + l);
    assert.equal(e.clips.length, 2, tag);
    for (const c of e.clips) { assert.ok(c.scene && c.action && c.sound, tag); assert.match(c.sound, /no speech|no dialogue|no voices|no vocals/i, tag); }
    assert.ok(e.caption.length <= 160, tag);
    assert.doesNotMatch(JSON.stringify(e), /https?:\/\//, tag);
    assert.doesNotMatch(e.title + e.caption + e.lines.join(' '), /gemini|veo|openai|claude|gpt|جيمناي|كلاود/i, tag);
  }
});

test('١١) التدفّق كاملًا بمحرّكات مزيّفة: قفل النشر، إعادة واحدة بإطار مقبول، التنبيه يوقف القصّة، عطل الشبكة لا يحرق الإعادة، والسرد الإماراتيّ شرط', async () => {
  const FX = path.join(ROOT, 'tests', 'fixtures', 'mira-stub');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mira-flow-'));
  const epsFile = (live) => { const f = path.join(dir, 'eps-' + live + '.json'); fs.writeFileSync(f, JSON.stringify({ live, character: 'SHEET', episodes: both() })); return f; };
  const run = (o) => {
    const counts = path.join(dir, 'c-' + Math.random().toString(36).slice(2) + '.json'), out = fs.mkdtempSync(path.join(dir, 'o-'));
    let code = 0, err = '';
    try {
      execFileSync(process.execPath, ['--import', require('url').pathToFileURL(path.join(FX, 'stub.mjs')).href, path.join(ROOT, 'scripts', 'social-bot.mjs'), o.gate ? '--gate-mira' : '--mira'], {
        env: { ...process.env, PATH: path.join(FX, 'bin') + path.delimiter + process.env.PATH, BASE: 'http://stub.base', OUT_DIR: out, MIRA_EPISODES_FILE: epsFile(o.live), GEMINI_API_KEY: 'g', UPLOAD_POST_API_KEY: 'u', GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'o/r', GITHUB_ACTIONS: '', GITHUB_EVENT_NAME: o.event || 'workflow_dispatch', GITHUB_OUTPUT: path.join(out, 'gh-out'), DRY_RUN: o.dry ? '1' : '', MIRA_EP: '', STUB_MODE: o.mode || 'ok', STUB_COUNTS: counts, STUB_HISTORY: JSON.stringify(o.history || []), STUB_ISSUES: JSON.stringify(o.issues || []) },
        stdio: 'pipe',
      });
    } catch (e) { code = e.status; err = String(e.stderr || ''); }
    const c = fs.existsSync(counts) ? JSON.parse(fs.readFileSync(counts, 'utf8')) : {};
    return { code, err, c, out: fs.existsSync(path.join(out, 'gh-out')) ? fs.readFileSync(path.join(out, 'gh-out'), 'utf8').trim() : '' };
  };
  const n = (c, k) => c[k] || 0;
  // قفل النشر: live=false وتشغيل فعليّ = يتوقّف قبل أيّ نداء مدفوع
  const a = run({ live: false });
  assert.equal(a.code, 1); assert.match(a.err, /live=false/); assert.equal(n(a.c, 'frame') + n(a.c, 'predict') + n(a.c, 'upload'), 0);
  // ينجح: إطاران، مقطعان، رفع واحد بمعرّف ميرا
  const ok = run({ live: true });
  assert.equal(ok.code, 0, ok.err); assert.equal(n(ok.c, 'frame'), 2); assert.equal(n(ok.c, 'predict'), 2); assert.equal(n(ok.c, 'upload'), 1);
  assert.deepEqual(ok.c.uploads, ['mira-app-1']);
  // المقطع يفشل فحصه دائمًا: إعادة واحدة بنفس الإطار المقبول، ثمّ لا نشر ومسألة تنبيه بوسم الإيقاف، والمشهد الثاني لا يُصرف عليه
  const f = run({ live: true, mode: 'clipfail' });
  assert.equal(f.code, 1); assert.equal(n(f.c, 'frame'), 1, 'الإطار المقبول يُعاد تحريكه لا يُرسم ثانية'); assert.equal(n(f.c, 'predict'), 2, 'إعادة واحدة فقط');
  assert.equal(n(f.c, 'upload'), 0); assert.equal(n(f.c, 'issue'), 1); assert.match(f.c.issues[0], /^\[mira-failed app:1\]/);
  // تنبيه مفتوح للحلقة = قصّتها موقوفة والثانية تكمل
  const b = run({ live: true, issues: [{ title: '[mira-failed app:1] مسلسل ميرا' }] });
  assert.equal(b.code, 0, b.err); assert.deepEqual(b.c.uploads, ['mira-uae-1']);
  // عطل شبكة أثناء انتظار المقطع: يُسأل عن المهمّة نفسها — لا مقطع مدفوع ثالث
  const bl = run({ live: true, mode: 'blip' });
  assert.equal(bl.code, 0, bl.err); assert.equal(n(bl.c, 'predict'), 2); assert.ok(n(bl.c, 'poll') >= 3);
  // تنزيل المقطع المدفوع يتعثّر دائمًا: يُعاد من الرابط نفسه ٤ مرّات ثمّ يقف — لا توليد ثانٍ، وتنبيه «عطل مؤقّت» لا يوقف القصّة
  const dl = run({ live: true, mode: 'dlfail' });
  assert.equal(dl.code, 1); assert.equal(n(dl.c, 'predict'), 1); assert.equal(n(dl.c, 'frame'), 1); assert.equal(n(dl.c, 'download'), 4);
  assert.equal(n(dl.c, 'upload'), 0); assert.equal(n(dl.c, 'issue'), 1); assert.doesNotMatch(dl.c.issues[0], /mira-failed/);
  // صوت الاحتياط غير الإماراتيّ في النشر الفعليّ = لا نشر وتنبيه، والسرد يُفحص قبل أيّ إنفاق
  const fb = run({ live: true, mode: 'fallback' });
  assert.equal(fb.code, 1); assert.equal(n(fb.c, 'upload'), 0); assert.equal(n(fb.c, 'issue'), 1); assert.doesNotMatch(fb.c.issues[0], /mira-failed/, 'عطل السرد لا يوقف القصّة');
  assert.equal(n(fb.c, 'frame') + n(fb.c, 'predict'), 0, 'السرد أوّلًا — لا إطار ولا مقطع مدفوع');
  // البوّابة: نُشرت ميرا قبل ساعة = لا؛ قبل ٢٥ ساعة = نعم؛ الجاية موقوفة والأخرى خالصة = لا
  const ago = (h) => new Date(Date.now() - h * 36e5).toISOString();
  assert.equal(run({ gate: true, live: true, event: 'schedule', history: [{ external_id: 'mira-app-1', upload_timestamp: ago(1) }] }).out, 'go=0');
  assert.equal(run({ gate: true, live: true, event: 'schedule', history: [{ external_id: 'mira-app-1', upload_timestamp: ago(25) }] }).out, 'go=1');
  const done = Array.from({ length: 30 }, (_, i) => ({ external_id: 'mira-app-' + (i + 1), upload_timestamp: ago(48) }));
  assert.equal(run({ gate: true, live: true, event: 'schedule', history: done, issues: [{ title: '[mira-failed uae:1] x' }] }).out, 'go=0');
});

test('١٢) الموقوفة: وسم التنبيه يُقرأ من العنوان، وMIRA_EP يفرضها ولو موقوفة', async () => {
  const { blockedFrom, nextEpisode, FAILED_TAG } = await load();
  const bl = blockedFrom([FAILED_TAG('uae', 3) + ' مسلسل ميرا…', 'عنوان آخر', '[mira-failed app:12] x']);
  assert.deepEqual([...bl].sort(), ['app:12', 'uae:3']);
  const eps = both();
  assert.equal(nextEpisode({ app: 3, uae: 2, lastStory: 'app' }, eps, '', bl).story + ':' + nextEpisode({ app: 3, uae: 2, lastStory: 'app' }, eps, '', bl).k, 'app:4');
  assert.equal(nextEpisode({ app: 11, uae: 2, lastStory: 'app' }, eps, '', bl), null, 'القصّتان موقوفتان');
  assert.equal(nextEpisode({}, eps, 'uae:3', bl).k, 3);
});

test('١٣) أعطال الخدمة والنقل والسرد والمسائل والصفحات بمحرّكات مزيّفة (المراجعة الثانية)', async () => {
  const FX = path.join(ROOT, 'tests', 'fixtures', 'mira-stub');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mira-flow2-'));
  const epsFile = (live) => { const f = path.join(dir, 'eps-' + live + '.json'); fs.writeFileSync(f, JSON.stringify({ live, character: 'SHEET', episodes: both() })); return f; };
  const run = (o) => {
    const counts = path.join(dir, 'c-' + Math.random().toString(36).slice(2) + '.json'), out = fs.mkdtempSync(path.join(dir, 'o-'));
    let code = 0, err = '';
    try {
      execFileSync(process.execPath, ['--import', require('url').pathToFileURL(path.join(FX, 'stub.mjs')).href, path.join(ROOT, 'scripts', 'social-bot.mjs'), o.bot ? '--gate' : o.gate ? '--gate-mira' : '--mira'], {
        env: { ...process.env, PATH: path.join(FX, 'bin') + path.delimiter + process.env.PATH, BASE: 'http://stub.base', OUT_DIR: out, MIRA_EPISODES_FILE: epsFile(o.live), GEMINI_API_KEY: 'g', UPLOAD_POST_API_KEY: 'u', GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'o/r', GITHUB_ACTIONS: '', GITHUB_EVENT_NAME: o.event || 'workflow_dispatch', GITHUB_OUTPUT: path.join(out, 'gh-out'), DRY_RUN: o.dry ? '1' : '', MIRA_EP: '', STUB_MODE: o.mode || 'ok', STUB_COUNTS: counts, STUB_HISTORY: JSON.stringify(o.history || []), STUB_FILL: String(o.fill || 0), STUB_FILL_ID: o.fillId || '', STUB_ISSUES: JSON.stringify(o.issues || []), STUB_ISSUE_FILL: String(o.issueFill || 0) },
        stdio: 'pipe',
      });
    } catch (e) { code = e.status; err = String(e.stderr || ''); }
    const c = fs.existsSync(counts) ? JSON.parse(fs.readFileSync(counts, 'utf8')) : {};
    const rd = (f) => (fs.existsSync(path.join(out, f)) ? fs.readFileSync(path.join(out, f), 'utf8').trim() : '');
    return { code, err, c, out: rd('gh-out'), caption: rd('caption.txt') };
  };
  const n = (c, k) => c[k] || 0;
  const ago = (h) => new Date(Date.now() - h * 36e5).toISOString();
  const untagged = (r, m) => { assert.equal(n(r.c, 'issue') >= 1, true, m); assert.doesNotMatch(r.c.issues[0], /mira-failed/, m); };
  // ٤٢٩ مرّة، أو اتّصال لم يُفتح: إعادة مجّانيّة للطلب نفسه — لا إطار مدفوع ثانٍ ولا تنبيه
  for (const mode of ['predict429', 'predictnet']) {
    const r = run({ live: true, mode });
    assert.equal(r.code, 0, mode + r.err); assert.equal(n(r.c, 'frame'), 2, mode); assert.equal(n(r.c, 'predict'), 3, mode); assert.equal(n(r.c, 'issue'), 0, mode);
  }
  // انقطاع بعد الإرسال أو مهلة على نداء مدفوع = ربما حُوسب: لا إعادة ولا توليد ثانٍ، وتنبيه لا يوقف القصّة (v-img-no-rebill)
  const rs = run({ live: true, mode: 'predictreset' });
  assert.equal(rs.code, 1); assert.equal(n(rs.c, 'predict'), 1); assert.equal(n(rs.c, 'frame'), 1); untagged(rs, 'reset');
  const to = run({ live: true, mode: 'frametimeout' });
  assert.equal(to.code, 1); assert.equal(n(to.c, 'frame'), 1); assert.equal(n(to.c, 'predict'), 0); untagged(to, 'timeout');
  // ٥٠٣ دائم على الصور: ٣ محاولات مجّانيّة ثمّ عطل خدمة — لا إعادة ولا إيقاف
  // ردّ ٢٠٠ غير مقروء على نداء مدفوع = ربما حُوسب: لا إعادة؛ وبدء مقطع بلا رقم مهمّة = ربما بدأت: لا مقطع ثانٍ فوقها
  const fb2 = run({ live: true, mode: 'frame200bad' });
  assert.equal(fb2.code, 1); assert.equal(n(fb2.c, 'frame'), 1); assert.equal(n(fb2.c, 'predict'), 0); untagged(fb2, 'frame200bad');
  const nop = run({ live: true, mode: 'predictnoop' });
  assert.equal(nop.code, 1); assert.equal(n(nop.c, 'predict'), 1); assert.equal(n(nop.c, 'frame'), 1); untagged(nop, 'predictnoop');
  const f5 = run({ live: true, mode: 'frame503' });
  assert.equal(f5.code, 1); assert.equal(n(f5.c, 'frame'), 3); assert.equal(n(f5.c, 'predict'), 0); untagged(f5, 'frame503');
  // ٤٠٠ رفض صريح: محاولة + إعادة واحدة بالإطار المقبول نفسه، ثمّ إيقاف
  const r400 = run({ live: true, mode: 'predict400' });
  assert.equal(r400.code, 1); assert.equal(n(r400.c, 'predict'), 2); assert.equal(n(r400.c, 'frame'), 1); assert.equal(n(r400.c, 'upload'), 0); assert.match(r400.c.issues[0], /mira-failed/);
  // المهمّة فشلت عند المحرّك: عطل لا فحص؛ حجبها بفلتر الأمان: محتوى يُعاد مرّة بالإطار نفسه ثمّ يوقف
  const vf = run({ live: true, mode: 'veofail' });
  assert.equal(vf.code, 1); assert.equal(n(vf.c, 'predict'), 1); untagged(vf, 'veofail');
  const vb = run({ live: true, mode: 'veoblocked' });
  assert.equal(vb.code, 1); assert.equal(n(vb.c, 'predict'), 2); assert.equal(n(vb.c, 'frame'), 1); assert.match(vb.c.issues[0], /^\[mira-failed app:1\]/);
  // مهمّة ما زالت تعمل بعد ١٠ دقائق: لا مقطع ثانٍ فوقها
  const pend = run({ live: true, mode: 'pending' });
  assert.equal(pend.code, 1); assert.equal(n(pend.c, 'predict'), 1); assert.equal(n(pend.c, 'frame'), 1); untagged(pend, 'pending');
  // الفحص نفسه معطّل: لا إعادة ولا وسم إيقاف
  for (const mode of ['framejudgenet', 'clipjudgenet']) {
    const r = run({ live: true, mode });
    assert.equal(r.code, 1, mode); assert.equal(n(r.c, 'frame'), 1, mode); assert.equal(n(r.c, 'predict'), mode === 'framejudgenet' ? 0 : 1, mode); untagged(r, mode);
  }
  // معاينة DRY_RUN فشلت فحصها: تنبيه بلا وسم إيقاف (لا يحجب الجدول ولا المعاينة التالية)
  const dr = run({ live: false, dry: true, mode: 'clipfail' });
  assert.equal(dr.code, 1); assert.match(dr.c.issues[0], /^\[DRY_RUN\]/); assert.doesNotMatch(dr.c.issues[0], /mira-failed/);
  // السرد: عطل مؤقّت يُعاد وينشر؛ ٤٠١ لا يُعاد؛ سطر ناقص = لا نشر ولا إنفاق؛ وفي DRY_RUN معاينة بلا تنبيه
  const t1 = run({ live: true, mode: 'tts503once' }); assert.equal(t1.code, 0, t1.err); assert.equal(n(t1.c, 'tts'), 3); assert.equal(n(t1.c, 'upload'), 1);
  const t4 = run({ live: true, mode: 'tts401' }); assert.equal(t4.code, 1); assert.equal(n(t4.c, 'tts'), 2); assert.equal(n(t4.c, 'upload') + n(t4.c, 'frame'), 0);
  const tl = run({ live: true, mode: 'tts1fail' }); assert.equal(tl.code, 1); assert.equal(n(tl.c, 'upload') + n(tl.c, 'predict'), 0); assert.equal(n(tl.c, 'issue'), 1);
  const td = run({ live: false, dry: true, mode: 'tts1fail' }); assert.equal(td.code, 0, td.err); assert.equal(n(td.c, 'upload'), 0); assert.equal(n(td.c, 'issue'), 0);
  // مسائل التنبيه: عطلها في النشر الفعليّ = توقّف قبل أيّ نداء مدفوع، والبوّابة go=0؛ الطلب والمسألة المقفلة لا يوقفان
  const i5 = run({ live: true, mode: 'issues500' }); assert.equal(i5.code, 1); assert.equal(n(i5.c, 'frame'), 0);
  assert.equal(run({ gate: true, live: true, event: 'schedule', mode: 'issues500' }).out, 'go=0');
  const ib = run({ live: true, mode: 'issuesbad' }); assert.equal(ib.code, 1); assert.equal(n(ib.c, 'frame'), 0, 'صفحة مسائل غير مقروءة = مغلق');
  const pr = run({ live: true, issues: [{ title: '[mira-failed app:1] x', pull_request: {} }, { title: '[mira-failed app:1] y', state: 'closed' }] });
  assert.deepEqual(pr.c.uploads, ['mira-app-1']); assert.match(pr.c.issueGets[0], /state=open/);
  // تنبيه أقدم من ١٠٠ مفتوح يُرى (صفحات): القصّة الموقوفة تبقى موقوفة
  const deep = run({ live: true, issueFill: 150, issues: [{ title: '[mira-failed app:1] قديم' }] });
  assert.deepEqual(deep.c.uploads, ['mira-uae-1']); assert.ok(deep.c.issueGets.length >= 2);
  // إنشاء التنبيه يتعثّر: يُعاد ٤ مرّات
  const ip = run({ live: true, mode: 'clipfail,issuepost500' }); assert.equal(n(ip.c, 'issue'), 4);
  const i403 = run({ live: true, mode: 'clipfail,issuepost403' }); assert.equal(n(i403.c, 'issue'), 1, 'رفض صريح (٤xx) لا يُعاد');
  // الجاية بعد الموقوفة: «باچر» لا يَعِد بحلقة موقوفة
  const tz = run({ live: true, issues: [{ title: '[mira-failed uae:1] x' }] });
  assert.deepEqual(tz.c.uploads, ['mira-app-1']); assert.doesNotMatch(tz.caption, /باچر «ميرا تكتشف الإمارات»/);
  // الصفحات: صفّ ميرا في الصفحة ١١ يُرى (٣٠ صفحة)، وحلقة البوت في الصفحة ٤ تُرى (١٠ صفحات)
  assert.equal(run({ gate: true, live: true, event: 'schedule', fill: 1000, history: [{ external_id: 'mira-app-1', upload_timestamp: ago(1) }] }).out, 'go=0');
  assert.equal(run({ bot: true, live: true, event: 'schedule', fill: 300, fillId: 'mira-uae-1', history: [{ external_id: 'omai-ep-4-video', upload_timestamp: ago(1) }] }).out, 'go=0');
});
