// اختبار يوم ٢ — قارئ الدفتر عند الفتح، بلا متصفّح وبلا استهلاك حصّة.
// يُنتزع الكودُ الحيّ من البندل نفسه ويُشغَّل ببدائل (fetch/localStorage/الوقت).
// الاستخدام: bun test-day2.ts
const BUNDLE = '/tmp/vc/src/js/app.bundle.js';
const src = await Bun.file(BUNDLE).text();
const a = src.indexOf('async function __agentRecoverRun(onWait){');
const b = src.indexOf('async function runOmranAgent(cur, apiText, thinkingDiv){');
if (a < 0 || b < 0 || b < a) { console.log('✗ تعذّر انتزاع الدوال من البندل'); process.exit(1); }
const code = src.slice(a, b);

type Run = Record<string, unknown> | null;
type Case = {
  name: string; mark: unknown; token: string | null; projects: { id: string; messages: unknown[] }[];
  runs: Run[]; expect: { fetches?: number; markKept?: boolean; applied?: string | null; msgHas?: string };
};

function build(ctxIn: Record<string, unknown>) {
  const f = new Function('ctx', `
    const { localStorage, fetch, state, lang, renderAll, renderMessages, saveState, window, __agentApplyResult, Date, setTimeout, console, authGet } = ctx;
    ${code}
    return { __agentResumeOnLoad };
  `);
  return f(ctxIn) as { __agentResumeOnLoad: () => Promise<void> };
}

const cases: Case[] = [
  { name: 'لا علامة → لا سؤال', mark: null, token: 't', projects: [{ id: 'p1', messages: [] }], runs: [], expect: { fetches: 0, applied: null } },
  { name: 'علامة أقدم من ساعة → تُمحى', mark: { p: 'p1', t: 1 }, token: 't', projects: [{ id: 'p1', messages: [] }], runs: [], expect: { fetches: 0, markKept: false, applied: null } },
  { name: 'بلا جلسة → لا سؤال والعلامة تبقى', mark: { p: 'p1', t: 'NOW' }, token: null, projects: [{ id: 'p1', messages: [] }], runs: [], expect: { fetches: 0, markKept: true, applied: null } },
  { name: 'المشروع محذوف → تُمحى', mark: { p: 'pX', t: 'NOW' }, token: 't', projects: [{ id: 'p1', messages: [] }], runs: [], expect: { fetches: 0, markKept: false, applied: null } },
  { name: 'دفتر مشروع آخر → لا يُلصق', mark: { p: 'p1', t: 'NOW' }, token: 't', projects: [{ id: 'p1', messages: [] }],
    runs: [{ runId: 'r1', projId: 'p2', status: 'done', text: 'عمل غريب', startedAt: 'NOW' }], expect: { fetches: 1, markKept: false, applied: null } },
  { name: 'دفتر أقدم من العلامة → لا يُلصق', mark: { p: 'p1', t: 'NOW' }, token: 't', projects: [{ id: 'p1', messages: [] }],
    runs: [{ runId: 'r0', projId: 'p1', status: 'done', text: 'تشغيل قديم', startedAt: 1000 }], expect: { fetches: 1, markKept: false, applied: null } },
  { name: 'منتهٍ بنصّ → يُطبَّق وتُمحى العلامة', mark: { p: 'p1', t: 'NOW' }, token: 't', projects: [{ id: 'p1', messages: [] }],
    runs: [{ runId: 'r1', projId: 'p1', status: 'done', text: 'الكود جاهز', startedAt: 'NOW' }], expect: { fetches: 1, markKept: false, applied: 'الكود جاهز' } },
  { name: 'ما زال يعمل ثم انتهى → يُطبَّق الأطول', mark: { p: 'p1', t: 'NOW' }, token: 't', projects: [{ id: 'p1', messages: [] }],
    runs: [{ runId: 'r1', projId: 'p1', status: 'running', step: 3, text: 'نصف', startedAt: 'NOW' },
           { runId: 'r1', projId: 'p1', status: 'running', step: 4, text: 'نصف', startedAt: 'NOW' },
           { runId: 'r1', projId: 'p1', status: 'done', step: 5, text: 'نصف + تمام', startedAt: 'NOW' }],
    expect: { markKept: false, applied: 'نصف + تمام' } },
  { name: 'ما زال يعمل بعد ١٥٠ث → العلامة تبقى ولا يُطبَّق ناقص', mark: { p: 'p1', t: 'NOW' }, token: 't', projects: [{ id: 'p1', messages: [] }],
    runs: 'forever' as unknown as Run[], expect: { markKept: true, applied: null, msgHas: 'ما زال يعمل' } },
  { name: 'مهلة بلا نصّ → حالة صادقة بلا تطبيق', mark: { p: 'p1', t: 'NOW' }, token: 't', projects: [{ id: 'p1', messages: [] }],
    runs: [{ runId: 'r1', projId: 'p1', status: 'timeout', text: '', startedAt: 'NOW' }],
    expect: { fetches: 1, markKept: false, applied: null, msgHas: 'timeout' } },
];

let pass = 0, fail = 0;
for (const c of cases) {
  let now = 1_700_000_000_000;
  const NOW = now;
  const fix = (o: unknown): unknown => {
    if (o && typeof o === 'object') { const r: Record<string, unknown> = { ...(o as object) } as Record<string, unknown>;
      for (const k of Object.keys(r)) if (r[k] === 'NOW') r[k] = NOW; return r; }
    return o;
  };
  const store = new Map<string, string>();
  if (c.mark) store.set('aiapp_agent_live', JSON.stringify(fix(c.mark)));
  let fetches = 0, applied: string | null = null, saved = 0;
  const project = { id: c.projects[0].id, messages: [] as Record<string, unknown>[] };
  const forever = (c.runs as unknown) === 'forever';
  const ctx = {
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) },
    fetch: async () => {
      const idx = fetches++;
      const run = forever ? { runId: 'r1', projId: 'p1', status: 'running', step: idx, text: 'ناقص', startedAt: NOW }
        : fix((c.runs as Run[])[Math.min(idx, (c.runs as Run[]).length - 1)]);
      return { ok: true, json: async () => ({ run }) };
    },
    state: { projects: c.projects.map(p => (p.id === project.id ? project : p)), currentId: null as string | null },
    lang: 'ar',
    renderAll: () => {}, renderMessages: () => {}, saveState: () => { saved++; },
    window: { authGet: c.token ? () => c.token : null },
    __agentApplyResult: async (cur: typeof project, full: string) => { applied = full; cur.messages.push({ role: 'assistant', content: '🤖 تم' }); },
    Date: { now: () => now },
    setTimeout: (fn: () => void, ms: number) => { now += ms; fn(); },
    console,
    authGet: () => c.token,   // البندل يستدعيها مجرّدة داخل __agentRecoverRun
  };
  if (!c.token) (ctx.window as Record<string, unknown>).authGet = undefined;
  const { __agentResumeOnLoad } = build(ctx as unknown as Record<string, unknown>);
  await __agentResumeOnLoad();

  const markKept = store.has('aiapp_agent_live');
  const msgs = project.messages.map(m => String(m.content || '')).join(' | ');
  const errs: string[] = [];
  if (c.expect.fetches !== undefined && fetches !== c.expect.fetches) errs.push(`طلبات ${fetches} ≠ ${c.expect.fetches}`);
  if (c.expect.markKept !== undefined && markKept !== c.expect.markKept) errs.push(`العلامة ${markKept ? 'باقية' : 'ممحوّة'} خلافًا للمتوقّع`);
  if (applied !== (c.expect.applied ?? null)) errs.push(`طُبِّق «${applied}» بدل «${c.expect.applied}»`);
  if (c.expect.msgHas && !msgs.includes(c.expect.msgHas)) errs.push(`الرسالة لا تذكر «${c.expect.msgHas}» → ${msgs}`);
  if (project.messages.some(m => m._loading)) errs.push('فقاعة مؤقتة بقيت في المشروع');
  if (errs.length) { fail++; console.log(`✗ ${c.name}\n   ${errs.join('\n   ')}`); }
  else { pass++; console.log(`✓ ${c.name}`); }
}
console.log(`\n${pass} ناجح · ${fail} فاشل`);
if (fail) process.exit(1);
