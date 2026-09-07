// مِجسّ «النصّ الطويل ما يرد» — يعيد إنتاج شكوى المالك على الإنتاج بالأرقام.
// يقيس ثلاثة أزمنة لكلّ حالة: أوّل بايت (وصول الترويسة)، أوّل حدث SSE، أوّل حرف
// من الردّ. عطل التخزين (غياب flushHeaders) يظهر كأوّل بايت متأخّر عشرات
// الثواني أو مهلة كاملة بلا شيء — بينما الردّ القصير يمرّ سليمًا.
// لا يطبع أيّ سرّ؛ حساب الفحص zzlong مؤقّت (يُنظَّف من لوحة المالك 🧹).
const BASE = process.env.PROBE_BASE || 'https://omran-ai-builder.vercel.app';
const HARD_CAP_MS = 120000;

const rnd = Math.random().toString(16).slice(2, 8);
const USER = 'zzlong' + rnd;

async function signup() {
  const r = await fetch(BASE + '/api/account?action=auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'signup', username: USER, password: 'Pp1!' + rnd + rnd, lang: 'ar' }),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.token) throw new Error('signup failed: ' + r.status + ' ' + JSON.stringify(j).slice(0, 120));
  return j.token;
}

// نصّ ٧٠ سطرًا يشبه ما يلصقه المالك: تقرير/كود عربيّ مختلط بعلامات وثيقة.
function buildLongText() {
  const lines = ['أحتاج مراجعة هذا التقرير التقني وتلخيص المشاكل فيه:'];
  for (let i = 1; i <= 68; i++) {
    lines.push(
      i % 4 === 0
        ? '  const step' + i + ' = () => { if (state.error) throw new Error("fail ' + i + '"); };'
        : 'البند ' + i + ': لوحظ تعثّر في المسار رقم ' + i + ' — الطلب يبقى معلّقًا بلا ردّ واضح من الخادم.'
    );
  }
  lines.push('ما سبب هذه المشاكل وكيف أصلحها؟');
  return lines.join('\n');
}

async function probe(token, text, label) {
  const t0 = Date.now();
  let tHead = -1, tFirstEvent = -1, tFirstDelta = -1;
  const statuses = [];
  let full = '', err = null, aborted = false;

  const ctrl = new AbortController();
  const killer = setTimeout(() => { aborted = true; ctrl.abort(); }, HARD_CAP_MS);

  try {
    const res = await fetch(BASE + '/api/ai?action=chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: text }], provider: 'claude', token }),
      signal: ctrl.signal,
    });
    tHead = Date.now() - t0; // ← وصول الترويسة: هنا يظهر عطل التخزين
    if (!res.body) throw new Error('no body, HTTP ' + res.status);

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const c = await reader.read();
      if (c.done) break;
      if (tFirstEvent < 0) tFirstEvent = Date.now() - t0;
      buf += dec.decode(c.value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        let ev; try { ev = JSON.parse(line.slice(6)); } catch (e) { continue; }
        if (ev.status) statuses.push(String(ev.status).slice(0, 60));
        if (ev.delta) { if (tFirstDelta < 0) tFirstDelta = Date.now() - t0; full += ev.delta; }
        if (ev.error) err = String(ev.error).slice(0, 200);
      }
    }
  } catch (e) {
    err = (aborted ? 'TIMEOUT بعد ' + HARD_CAP_MS + 'ms بلا اكتمال — ' : '') + String(e && e.message || e).slice(0, 200);
  } finally {
    clearTimeout(killer);
  }

  const total = Date.now() - t0;
  console.log('== ' + label + ' (طول النصّ: ' + text.length + ' حرفًا · ' + text.split('\n').length + ' سطرًا) ==');
  console.log('  أوّل بايت (ترويسة) : ' + (tHead < 0 ? 'لم تصل' : tHead + 'ms'));
  console.log('  أوّل حدث SSE       : ' + (tFirstEvent < 0 ? 'لم يصل' : tFirstEvent + 'ms'));
  console.log('  أوّل حرف من الردّ   : ' + (tFirstDelta < 0 ? 'لم يصل' : tFirstDelta + 'ms'));
  console.log('  الزمن الكلّي        : ' + total + 'ms');
  console.log('  حجم الردّ           : ' + full.length + ' حرفًا');
  console.log('  الحالات             : ' + (statuses.join(' | ') || '(لا شيء)'));
  if (err) console.log('  خطأ                 : ' + err);
  console.log('  عيّنة               : ' + full.slice(0, 200).replace(/\n/g, ' ⏎ '));
  console.log('');
  return { tHead, tFirstEvent, tFirstDelta, total, len: full.length, err };
}

const token = await signup();
console.log('حساب الفحص جاهز (zzlong…) · القاعدة: ' + BASE + '\n');

const short = await probe(token, 'مرحبا', 'قصير (شاهد ضبط)');
const long = await probe(token, buildLongText(), 'طويل (شكوى المالك)');

console.log('─── الخلاصة ───');
console.log('أوّل بايت — قصير: ' + short.tHead + 'ms · طويل: ' + long.tHead + 'ms');

const fails = [];
if (long.tHead < 0) fails.push('الطويل: الترويسة لم تصل إطلاقًا — التخزين ما زال قائمًا');
if (long.tHead > 15000) fails.push('الطويل: الترويسة تأخّرت ' + long.tHead + 'ms — مؤشّر تخزين');
if (long.tFirstDelta < 0) fails.push('الطويل: لا حرف واحد من الردّ');
if (long.err) fails.push('الطويل: ' + long.err);
if (long.len < 40) fails.push('الطويل: الردّ فارغ أو شبه فارغ (' + long.len + ' حرفًا)');

if (fails.length) {
  console.log('✗ العطل ما زال قائمًا:');
  for (const f of fails) console.log('   • ' + f);
  process.exit(1);
}
console.log('✓ النصّ الطويل يردّ — الترويسة وصلت في ' + long.tHead + 'ms وأوّل حرف في ' + long.tFirstDelta + 'ms');
