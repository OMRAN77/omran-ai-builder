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
  for (const j of [null, {}, { same_character: true, text_present: false }, { same_character: 'yes', text_present: false, face_deformed: false }, { same_character: true, text_present: true, face_deformed: false }, { same_character: false, text_present: false, face_deformed: false }, { same_character: true, text_present: false, face_deformed: true }]) {
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

test('١٠) ملفّ الحلقات: ٣٠ + ٣٠ بأرقامها، سطران ≤١٤ كلمة، مشهدان بلا كلام، نصّ ≤١٦٠ بلا رابط ولا اسم مزوّد، والنشر مقفل حتّى الموافقة', async () => {
  const { loadEpisodes, EPISODES_FILE } = await load();
  const raw = JSON.parse(fs.readFileSync(EPISODES_FILE, 'utf8'));
  assert.equal(raw.live, false, 'لا نشر قبل موافقة المالك على حلقة DRY_RUN');
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
