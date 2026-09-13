#!/usr/bin/env node
// scripts/agent-context.mjs — v-agent-parity: «أبي الوكيل عنده كلّ صلاحيّاتك بالضبط».
//
// ما عندي أنا (Claude Code في جلسة المالك) وليس عند Claude Code في Actions: رؤية GitHub
// (المسائل، الطلبات، فحوص CI) ورؤية Vercel (النشرات وسجلّ البناء). الطريقة الآمنة ليست
// إعطاءه المفاتيح — رمز Vercel رمز حساب كامل ولا يُقيَّد للقراءة — بل إعطاءه المعلومات:
// هذا السكربت يعمل في خطوة قبل Claude بالمفاتيح، ويكتب AGENT_CONTEXT.md، وClaude يقرأ الملفّ
// ولا يرى مفتاحًا. لا يرمي أبدًا: كلّ قسم يفشل يكتب سبب فشله ويكمل، والخروج دائمًا 0.
//
//   node scripts/agent-context.mjs --issue 560 --base main --out AGENT_CONTEXT.md
//   البيئة: GH_TOKEN + GITHUB_REPOSITORY (من Actions)، VERCEL_TOKEN (اختياريّ)،
//           VERCEL_PROJECT (افتراضيّ omran-ai-builder)، VERCEL_TEAM_ID (افتراضيّ فريق المالك).
import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const SECRET_RE = /\b(?:sk-ant-[A-Za-z0-9_\-]{8,}|sk-[A-Za-z0-9_\-]{24,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_\-]{30,})\b/g;
const scrub = (s) => String(s == null ? '' : s).replace(SECRET_RE, '[مفتاح محذوف]');
const when = (t) => { try { return new Date(t).toISOString().replace('T', ' ').slice(0, 16); } catch (e) { return '؟'; } };

function argOf(argv, name, dflt) { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt; }

export async function buildContext(opts) {
  const o = opts || {};
  const env = o.env || process.env;
  const fetchImpl = o.fetchImpl || fetch;
  const exec = o.exec || ((cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', timeout: 20000 }));
  const repo = String(env.GITHUB_REPOSITORY || 'OMRAN77/omran-ai-builder');
  const issue = String(o.issue || '').trim();
  const base = String(o.base || 'main').trim();
  const out = [];
  const H = (t) => out.push('\n## ' + t + '\n');
  const line = (s) => out.push(scrub(s));
  const fail = (what, e) => line('(تعذّر ' + what + ': ' + scrub(e && e.message ? e.message : e).slice(0, 200) + ')');

  out.push('# سياق المهمّة — جُمع آليًّا قبل تشغيل Claude Code (' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC)');
  out.push('المستودع: ' + repo + ' · الأساس: ' + base + (issue ? ' · مسألة المهمّة: #' + issue : ''));
  out.push('هذا الملفّ للقراءة فقط ولا يُلتزم في git. المفاتيح لم تُمرَّر إليك؛ ما تحتاجه من GitHub اقرأه بـ`gh`، وما تحتاجه من Vercel هنا.');

  // ١) git المحلّيّ
  H('آخر الالتزامات على ' + base);
  try { line(exec('git', ['log', '--oneline', '-15', 'origin/' + base]).trim() || '(لا شيء)'); } catch (e) { try { line(exec('git', ['log', '--oneline', '-15']).trim()); } catch (e2) { fail('قراءة git log', e2); } }

  // ٢) GitHub REST
  const gh = async (path) => {
    const tok = String(env.GH_TOKEN || env.GITHUB_TOKEN || '').trim();
    const r = await fetchImpl('https://api.github.com' + path, { headers: Object.assign({ Accept: 'application/vnd.github+json', 'User-Agent': 'omran-agent-context' }, tok ? { Authorization: 'Bearer ' + tok } : {}) });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(path + ' → ' + r.status + ' ' + JSON.stringify(j || {}).slice(0, 120));
    return j;
  };
  const R = '/repos/' + repo;
  if (issue) {
    H('مسألة المهمّة #' + issue);
    try {
      const it = await gh(R + '/issues/' + issue);
      line('العنوان: ' + (it.title || ''));
      line(String(it.body || '').slice(0, 3000));
      const cs = await gh(R + '/issues/' + issue + '/comments?per_page=20');
      const human = (Array.isArray(cs) ? cs : []).filter((c) => c && c.user && !/\[bot\]$/.test(c.user.login));
      if (human.length) { line('\nتعليقات بشريّة على المسألة:'); for (const c of human) line('- ' + c.user.login + ' (' + when(c.created_at) + '): ' + String(c.body || '').slice(0, 800)); }
    } catch (e) { fail('قراءة المسألة', e); }
  }
  H('المسائل المفتوحة (آخر ١٠)');
  try {
    const is = await gh(R + '/issues?state=open&per_page=15&sort=updated');
    const rows = (Array.isArray(is) ? is : []).filter((i) => !i.pull_request && String(i.number) !== issue).slice(0, 10);
    if (!rows.length) line('(لا مسائل مفتوحة أخرى)');
    for (const i of rows) line('- #' + i.number + ' ' + i.title + ' (' + when(i.updated_at) + ')');
  } catch (e) { fail('قراءة المسائل', e); }
  H('طلبات السحب المفتوحة');
  try {
    const prs = await gh(R + '/pulls?state=open&per_page=10&sort=updated&direction=desc');
    if (!Array.isArray(prs) || !prs.length) line('(لا طلبات مفتوحة)');
    for (const p of prs || []) line('- #' + p.number + ' ' + p.title + ' — ' + (p.head && p.head.ref) + ' → ' + (p.base && p.base.ref) + (p.draft ? ' (مسودّة)' : ''));
  } catch (e) { fail('قراءة الطلبات', e); }
  H('آخر تشغيلات CI على ' + base);
  try {
    const runs = await gh(R + '/actions/workflows/ci.yml/runs?branch=' + encodeURIComponent(base) + '&per_page=5');
    const rows = (runs && runs.workflow_runs) || [];
    if (!rows.length) line('(لا تشغيلات)');
    for (const r of rows) line('- ' + (r.conclusion || r.status) + ' · ' + String(r.head_sha || '').slice(0, 7) + ' · ' + when(r.created_at) + ' · ' + (r.html_url || ''));
  } catch (e) { fail('قراءة CI', e); }

  // ٣) Vercel REST
  H('Vercel — النشرات');
  const vtok = String(env.VERCEL_TOKEN || '').trim();
  if (!vtok) line('(لا VERCEL_TOKEN في أسرار المستودع — أضفه ليظهر هنا سجلّ النشر والبناء)');
  else {
    const project = String(env.VERCEL_PROJECT || 'omran-ai-builder');
    const team = String(env.VERCEL_TEAM_ID || 'team_6DNwMUYcnmLswqL8Aj7VedO3').trim();
    const q = (extra) => (team ? '?teamId=' + team + (extra ? '&' + extra : '') : (extra ? '?' + extra : ''));
    const vc = async (path) => {
      const r = await fetchImpl('https://api.vercel.com' + path, { headers: { Authorization: 'Bearer ' + vtok } });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(path.split('?')[0] + ' → ' + r.status + ' ' + JSON.stringify(j || {}).slice(0, 120));
      return j;
    };
    try {
      const proj = await vc('/v9/projects/' + encodeURIComponent(project) + q(''));
      line('المشروع: ' + proj.name + ' (' + proj.id + ')' + (proj.link && proj.link.repo ? ' · مربوط بـGitHub: ' + proj.link.org + '/' + proj.link.repo : ''));
      const deps = await vc('/v6/deployments' + q('projectId=' + proj.id + '&limit=6'));
      const list = (deps && deps.deployments) || [];
      if (!list.length) line('(لا نشرات)');
      for (const d of list) {
        const m = d.meta || {};
        line('- ' + (d.readyState || d.state || '؟') + ' · ' + (d.target || 'preview') + ' · ' + String(m.githubCommitSha || '').slice(0, 7) + ' ' + (m.githubCommitRef || '') + ' · ' + when(d.created) + ' · https://' + (d.url || ''));
      }
      const bad = list.find((d) => /ERROR|CANCELED/.test(String(d.readyState || d.state || '')));
      const prod = list.find((d) => d.target === 'production');
      const pick = bad || prod;
      if (pick) {
        H('Vercel — سجلّ بناء ' + (bad ? 'آخر نشرة فاشلة' : 'آخر نشرة إنتاج') + ' (' + String((pick.meta || {}).githubCommitSha || '').slice(0, 7) + ')');
        try {
          const ev = await vc('/v3/deployments/' + pick.uid + '/events' + q('limit=80&builds=1'));
          const rows = Array.isArray(ev) ? ev : [];
          const txt = rows.map((e) => (e.payload && (e.payload.text || (e.payload.info && e.payload.info.name))) || e.text || '').filter(Boolean);
          line(txt.slice(-40).join('\n') || '(لا سطور)');
        } catch (e) { fail('قراءة سجلّ البناء', e); }
      }
    } catch (e) { fail('قراءة Vercel', e); }
  }

  H('كيف تستعمل هذا');
  line('- المسائل والطلبات وسجلّات الفحوص: `gh issue view N`، `gh pr view N --comments`، `gh run view ID --log-failed` (رمز GitHub في بيئتك).');
  line('- الإنتاج: الموقع https://omran-ai-builder.vercel.app؛ مسابر Playwright جاهزة في scripts/*-probe.mjs (Chromium مثبّت).');
  line('- لا تدفع ولا تفتح طلب سحب ولا تدمج: الورك فلو يدفع ويفتح الطلب، والمالك يدمج وينشر.');
  return out.join('\n') + '\n';
}

const isMain = process.argv[1] && /agent-context\.mjs$/.test(process.argv[1]);
if (isMain) {
  const argv = process.argv.slice(2);
  const outPath = argOf(argv, '--out', 'AGENT_CONTEXT.md');
  let text = '';
  try { text = await buildContext({ issue: argOf(argv, '--issue', ''), base: argOf(argv, '--base', 'main') }); }
  catch (e) { text = '# سياق المهمّة\n(تعذّر جمع السياق: ' + scrub(e && e.message) + ')\n'; }
  await writeFile(outPath, text);
  console.log('✓ كُتب ' + outPath + ' (' + text.length + ' حرفًا)');
}
