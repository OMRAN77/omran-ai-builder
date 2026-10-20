// scripts/liked-probe.mjs — تجربة «عجبني» الحيّة (v-liked-reply) على نشرة — معاينة فرع أو الإنتاج — بحساب المالك:
// ردّ من كلود على سؤال مميَّز ← «عجبني» ← سؤال groq وgemini وdeepseek في محادثات جديدة عن الموضوع نفسه ← هل عرفوه؟
// ثمّ لقطات متصفّح حقيقيّة للتطبيق (المزوّد يجيب في الواجهة نفسها). البيئة: PROBE_BASE (عنوان النشرة)،
// OWNER_TOKEN (رمز جلسة المالك aiapp_auth_token — سرّ SAMPLE_TOKEN في المستودع). لا يطبع الرمز. خمس رسائل مزوّد لا أكثر.
import fs from 'node:fs';

const BASE = (process.env.PROBE_BASE || 'https://omran-ai-builder.vercel.app').replace(/\/$/, '');
const TOKEN = process.env.OWNER_TOKEN || '';
const OUT = 'liked-probe';
fs.mkdirSync(OUT, { recursive: true });
if (!TOKEN) { console.error('✗ OWNER_TOKEN مفقود — سرّ SAMPLE_TOKEN (aiapp_auth_token للمالك).'); process.exit(2); }

const PROVS = (process.env.PROBE_PROVS || 'groq,gemini,deepseek').split(',').map((s) => s.trim()).filter(Boolean);
const Q = 'اقترح لي خمسة أسماء مبتكرة لمقهى صغير في مدينة العين، كلّ اسم كلمتان عربيّتان غير مألوفتين، واكتب كلّ اسم في سطر مرقّم يبدأ بالاسم ثمّ شرطة ثمّ السبب.';
const ASK = 'وش الأسماء الخمسة اللي اقترحتها لي قبل لمقهى العين؟ عدّدها بالضبط كما هي.';
const report = { base: BASE, at: new Date().toISOString(), steps: [] };
const say = (m) => { console.log(m); report.steps.push(m); };
const norm = (s) => String(s || '').replace(/[ً-ٰٟـ]/g, '').replace(/[إأآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

async function chat(provider, messages, label) {
  const t0 = Date.now();
  const res = await fetch(BASE + '/api/ai?action=chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, provider, token: TOKEN, tz: 'Asia/Dubai' }),
  });
  if (res.status === 401 || res.status === 403) throw new Error(label + ': الرمز مرفوض HTTP ' + res.status + ' — SAMPLE_TOKEN منتهٍ أو ليس للمالك');
  if (!res.ok || !res.body) throw new Error(label + ': HTTP ' + res.status + ' ' + (await res.text().catch(() => '')).slice(0, 200));
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', full = '', err = '', statuses = [];
  for (;;) {
    const c = await reader.read();
    if (c.done) break;
    buf += dec.decode(c.value, { stream: true });
    const lines = buf.split('\n'); buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      let ev; try { ev = JSON.parse(line.slice(6)); } catch (e) { continue; }
      if (typeof ev.delta === 'string') full += ev.delta;
      if (ev.status) statuses.push(String(ev.status).slice(0, 60));
      if (ev.error) err = String(ev.error).slice(0, 200);
    }
    if (Date.now() - t0 > 150000) { err = err || 'timeout 150s'; break; }
  }
  const ms = Date.now() - t0;
  say(`  [${label} · ${provider}] ${ms}ms · ${full.length} حرفًا` + (err ? ' · ERROR: ' + err : '') + (statuses.length ? ' · ' + statuses.slice(0, 4).join(' | ') : ''));
  return { text: full, err, ms, statuses };
}

// أسماء المقهى من ردّ كلود: أسطر مرقّمة «١. الاسم — السبب» (أرقام عربيّة أو هنديّة، نجمتا التعريض تُزالان)
function namesOf(text) {
  const out = [];
  for (const raw of String(text || '').split('\n')) {
    const line = raw.replace(/\*\*/g, '').trim();
    const m = line.match(/^(?:[0-9٠-٩]+[.)\-–:]\s*|[-•*]\s*)(.+)$/);
    if (!m) continue;
    const name = m[1].split(/\s[—–-]\s|[:：]/)[0].replace(/^[«"“]|[»"”]$/g, '').trim();
    if (name && name.length >= 3 && name.length <= 40) out.push(name);
  }
  return out.slice(0, 5);
}
function known(names, text) {
  const t = norm(text);
  return names.filter((n) => { const k = norm(n); return k.length >= 3 && t.includes(k); });
}

say('① كلود يقترح الأسماء (محادثة المالك)');
const r1 = await chat('claude', [{ role: 'user', content: Q }], 'Q');
const names = namesOf(r1.text);
report.claudeReply = r1.text; report.names = names;
say('  الأسماء المستخرجة: ' + (names.length ? names.join(' · ') : '— (لم تُستخرج أسماء مرقّمة؛ المطابقة بالكلمات)'));
if (r1.err || r1.text.length < 40) { say('✗ ردّ كلود فاشل أو قصير — لا تجربة'); fs.writeFileSync(OUT + '/report.json', JSON.stringify(report, null, 2)); process.exit(1); }

say('② «عجبني» على ردّ كلود');
const r2 = await chat('claude', [{ role: 'user', content: Q }, { role: 'assistant', content: r1.text }, { role: 'user', content: 'عجبني' }], 'عجبني');
report.likedReply = r2.text;
say('  ردّ التأكيد: ' + r2.text.replace(/\s+/g, ' ').slice(0, 160));

let allOk = true;
report.providers = {};
for (const p of PROVS) {
  say(`③ ${p} في محادثة جديدة: ${ASK}`);
  const r = await chat(p, [{ role: 'user', content: ASK }], 'سؤال');
  const hit = known(names, r.text);
  const tokensQ = new Set(norm(r1.text).split(' ').filter((w) => w.length >= 4));
  const overlap = norm(r.text).split(' ').filter((w) => w.length >= 4 && tokensQ.has(w)).length;
  const ok = names.length ? hit.length >= Math.min(3, names.length) : overlap >= 12;
  report.providers[p] = { reply: r.text, err: r.err, hit, overlap, ok };
  say(`  ${ok ? '✓' : '✗'} ${p}: عرف ${hit.length}/${names.length} أسماء (${hit.join(' · ') || '—'}) · تداخل كلمات ${overlap}`);
  if (!ok) allOk = false;
}

// ④ لقطات المتصفّح الحقيقيّ: الرمز في التخزين المحلّيّ كما يضعه التطبيق، المزوّد المختار، السؤال من صندوق الكتابة نفسه
try {
  const { chromium } = await import('playwright');
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 }, locale: 'ar' });
  const page = await ctx.newPage();
  const pageErrs = [];
  page.on('pageerror', (e) => pageErrs.push(String(e.message || e).slice(0, 160)));
  await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate((t) => { localStorage.setItem('aiapp_auth_token', t); localStorage.setItem('aiapp_username', 'omran'); localStorage.setItem('aiapp_provider', 'groq'); localStorage.setItem('aiapp_provider_explicit', '1'); }, TOKEN);
  for (const p of PROVS) {
    await page.evaluate((k) => { localStorage.setItem('aiapp_provider', k); localStorage.setItem('aiapp_provider_explicit', '1'); }, p);
    await page.reload({ waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(3500);
    for (const sel of ['#omranIntro', '#privacyAgreeBtn']) { try { if (await page.locator(sel).count()) await page.click(sel, { timeout: 4000 }); } catch (e) { /* الشاشة غير ظاهرة */ } }
    await page.waitForTimeout(800);
    const who = await page.evaluate(() => ({ user: localStorage.getItem('aiapp_username') || sessionStorage.getItem('aiapp_username'), prov: localStorage.getItem('aiapp_provider'), send: typeof window.sendPrompt }));
    say(`④ لقطة ${p}: الحساب ${who.user} · المزوّد ${who.prov} · sendPrompt=${who.send}`);
    await page.fill('#prompt', ASK);
    await page.click('#btnSend');
    let shown = false;
    try {
      await page.waitForFunction((ns) => { const ms = document.querySelectorAll('.msg.assistant'); const last = ms[ms.length - 1]; const t = last ? last.innerText : ''; return ns.some((n) => t.includes(n)) || /⚠️|ما قدرت/.test(t); }, names, { timeout: 150000 });
      shown = true;
    } catch (e) { say(`  ✗ ${p}: لم يظهر ردّ يذكر الأسماء خلال ١٥٠ ث`); }
    await page.waitForTimeout(2500);
    const lastText = await page.evaluate(() => { const ms = document.querySelectorAll('.msg.assistant'); const last = ms[ms.length - 1]; return last ? last.innerText.slice(0, 600) : ''; });
    const hit = known(names, lastText);
    say(`  ${shown && hit.length ? '✓' : '✗'} لقطة ${p}: الواجهة تعرض ${hit.length}/${names.length} أسماء`);
    await page.screenshot({ path: `${OUT}/${p}.png` });
    report.providers[p] = Object.assign(report.providers[p] || {}, { uiText: lastText, uiHit: hit, shot: `${p}.png` });
  }
  if (pageErrs.length) say('  أخطاء الصفحة: ' + pageErrs.slice(0, 5).join(' | '));
  report.pageErrors = pageErrs;
  await b.close();
} catch (e) { say('✗ المتصفّح: ' + String(e && e.message || e).slice(0, 300)); allOk = false; }

fs.writeFileSync(OUT + '/report.json', JSON.stringify(report, null, 2));
say(allOk ? '✅ التجربة نجحت: الثلاثة عرفوا ما اعتمده المالك عند كلود' : '✗ التجربة لم تنجح كاملةً — راجع السجلّ');
process.exit(allOk ? 0 : 1);
