'use strict';
/* tests/owner-page-i18n.test.cjs — v-owner-i18n (تدقيق ١٨ أكتوبر، g14-owner: لقطات ٠١٥–٠٢١ و٠٤٣–٠٤٥).
   العرض: صفحة المالك كلّها عربيّة في الواجهة الإنجليزيّة إلّا العنوان (الخزنة، الإحصاءات، المستخدمون، VIP، فحص النظام)،
   وسطر الصلاحيّات «Contents: write وPull requests: write» يتلخبط، وأسماء الخدمات رموز خامّة (chat، tts، media-intent)،
   و«Failed to fetch» إنجليزيّ خام عند انقطاع الشبكة، وصفّ الاسم الطويل يتراكب على الإيميل والحذف ينزل سطرًا.
   هنا: تحليل وسوم صفحة المالك، والدوالّ الحقيقيّة من app-01 وapp-28 في vm بقاموس اللغة الحقيقيّ. */
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { read, dicts, dictFor, tFor, AR_RE, visibleOutsideIso, clientSlice, flush, LANGS12 } = require('./_owner-vm.cjs');
const { makeDom } = require('./_mini-dom.cjs');

const partial = read('js/partials-settings.js');
function divSpan(html, id) {
  const start = html.indexOf('<div id="' + id + '"');
  assert.ok(start >= 0, 'العنصر ' + id);
  const re = /<div\b|<\/div>/g; re.lastIndex = start; let depth = 0, m;
  while ((m = re.exec(html))) { depth += m[0] === '</div>' ? -1 : 1; if (depth === 0) return html.slice(start, re.lastIndex); }
  throw new Error('غير مغلق: ' + id);
}
const owner = divSpan(partial, 'ownerSection').replace(/<!--[\s\S]*?-->/g, '');
const ph = (s) => (String(s).match(/\{[a-z]+\}/g) || []).sort().join(',');
// الاسم الخامّ داخل onclick وdata-id بيانات لا تسمية (يصل كما هو لأفعال المالك)
const noData = (h) => visibleOutsideIso(String(h).replace(/\s(?:onclick|data-id)="[^"]*"/g, ''));

test('١. وسوم صفحة المالك: لا نصّ عربيّ بلا data-i18n، ولا placeholder عربيّ بلا data-i18n-placeholder', () => {
  const VOID = new Set(['input', 'br', 'img', 'hr']);
  const stack = [];
  const bad = [];
  const re = /<\/?([a-zA-Z][\w-]*)([^>]*)>|([^<]+)/g;
  let m;
  while ((m = re.exec(owner))) {
    if (m[3] !== undefined) {
      if (AR_RE.test(m[3])) { const top = stack[stack.length - 1]; if (!top || !/\sdata-i18n="/.test(top.attrs)) bad.push(m[3].trim().slice(0, 60)); }
      continue;
    }
    const tag = m[1].toLowerCase();
    if (m[0][1] === '/') { stack.pop(); continue; }
    const ph = /\splaceholder="([^"]*)"/.exec(m[2]);
    if (ph && AR_RE.test(ph[1]) && !/\sdata-i18n-placeholder="/.test(m[2])) bad.push('placeholder: ' + ph[1]);
    const ti = /\stitle="([^"]*)"/.exec(m[2]);
    if (ti && AR_RE.test(ti[1]) && !/\sdata-i18n-title="/.test(m[2])) bad.push('title: ' + ti[1]);
    if (!VOID.has(tag)) stack.push({ tag, attrs: m[2] });
  }
  assert.deepEqual(bad, [], 'نصوص عربيّة ثابتة في صفحة المالك');
});

test('٢. سطر الصلاحيّات: الرمزان داخل <bdi dir="ltr"> لا يلتفّان، وخارج النصّ المترجَم', () => {
  for (const tok of ['Contents: write', 'Pull requests: write']) {
    assert.ok(owner.includes('<bdi dir="ltr" style="white-space:nowrap">' + tok + '</bdi>'), tok);
    assert.equal(owner.split(tok).length - 1, 1, tok + ' مرّة واحدة');
  }
  const I = dicts();
  for (const lg of ['ar', 'en', ...LANGS12]) assert.ok(!/Contents: write/.test(I[lg].ownerVaultPerms || ''), lg + ': الرمز خارج الترجمة');
});

test('٣. كلّ مفتاح تستعمله صفحة المالك ولوحاتها موجود بالـ١٤ لغة وبالعناصر النائبة نفسها', () => {
  const I = dicts();
  const keys = new Set();
  owner.replace(/data-i18n(?:-placeholder|-title)?="([^"]+)"/g, (_, k) => keys.add(k));
  const scan = (file, re) => read(file).replace(re, (_, k) => { keys.add(k); return _; });
  scan('js/app-01-boot-auth.js', /\bownT\('([A-Za-z0-9]+)'/g);
  scan('js/app-11-video.js', /\boT\('([A-Za-z0-9]+)'/g);
  scan('js/app-28-vault.js', /\bgk\('([A-Za-z0-9]+)'/g);
  // المفاتيح في الجداول (أسماء الخدمات، أنواع الجرد، المسارات، رموز الخزنة) — كلّ نصّ 'owner…' في الملفّات الثلاثة
  for (const f of ['js/app-01-boot-auth.js', 'js/app-11-video.js', 'js/app-28-vault.js']) scan(f, /'(owner[A-Z][A-Za-z]+)'/g);
  for (const id of ['ownerHealthBar', 'ownerSection']) keys.delete(id); // معرّفات عناصر لا مفاتيح
  scan('js/app-13-stocks-init.js', /'(ver[A-Z][a-z]+)'/g);
  keys.add('fbReportsTitle');
  for (const k of ['ownerVaultTitle', 'ownerStatsByService', 'ownerHealthPill', 'ownerClearErrorsConfirm', 'verPush']) assert.ok(keys.has(k), 'المفتاح مستعمل: ' + k);
  assert.ok(keys.size >= 100, 'عدد المفاتيح ' + keys.size);
  const miss = [];
  for (const k of keys) {
    if (I.ar[k] === undefined) { miss.push('ar:' + k); continue; }
    for (const lg of ['en', ...LANGS12]) {
      const v = I[lg][k];
      if (v === undefined) miss.push(lg + ':' + k);
      else if (ph(v) !== ph(I.ar[k])) miss.push(lg + ':' + k + ' عناصر نائبة');
    }
  }
  assert.deepEqual(miss, []);
});

test('٤. «مسح سجل الأخطاء» بشكل الخطر لا بشكل الأزرار الآمنة', () => {
  const btn = /<button[^>]*id="adminHealthClearBtn"[^>]*>/.exec(owner)[0];
  assert.match(btn, /border:1px solid #a33/);
  assert.match(btn, /color:#e66/);
  const safe = /<button[^>]*id="adminHealthBtn"[^>]*>/.exec(owner)[0];
  assert.doesNotMatch(safe, /#a33|#e66/);
});

/* ---------- لوحة الإدارة وVIP من app-01 في vm ---------- */
const STATS = {
  generatedAt: '2026-10-19T09:30:00Z', totalAccounts: 140, realAccounts: 114, testAccounts: 3, messagesToday: 37, totalMessagesAllTime: 9120,
  perProviderToday: { chat: 21, tts: 6, 'media-intent': 4, 'plan-premium': 3, 'zz-new': 1 },
  topUsersToday: [{ username: 'Taryam777777', messages: 12 }, { username: 'سارة', messages: 4 }],
  recentUsers: [{ username: 'g_x@gmail.com', lastWrite: '2026-10-18T10:00:00Z' }],
  manageableUsers: [
    { username: 'zzcheck_17', email: null },
    { username: 'g_averyveryverylongusername.withdots@gmail.com', email: 'averyveryverylongusername.withdots@gmail.com' },
    { username: 'سارة', email: 'sara@x.com', banned: true },
  ],
};
function adminEnv(lang, route) {
  const { document } = makeDom();
  const add = (id, tag, parent) => { const e = document.createElement(tag || 'div'); e.id = id; (parent || document.body).appendChild(e); return e; };
  ['adminStatsBox', 'adminUsersTable', 'adminClaudeDiagBox'].forEach((id) => add(id));
  const wrap = add('vipWrap');
  add('vipInput', 'input', wrap);
  add('vipListBox', 'div', wrap);
  const said = [];
  const ctx = {
    document, curT: () => dictFor(lang), authGet: () => 'tok', __swallow() {},
    confirm: (m) => { said.push(['confirm', m]); return false; }, alert: (m) => said.push(['alert', m]), prompt: (m) => { said.push(['prompt', m]); return ''; },
    fetch: async (url, init) => route(String(url), init),
  };
  ctx.window = ctx;
  clientSlice('js/app-01-boot-auth.js', '  /* v-owner-i18n', '  function setAuthToggleUI(loggedIn){', ctx);
  return { ctx, document, said, $: (id) => document.getElementById(id) };
}
const J = (body, status) => ({ ok: (status || 200) < 400, status: status || 200, json: async () => body });
const route = (url) => {
  if (url.includes('/api/admin-stats')) return J(STATS);
  if (url.includes('audit=1')) return J({ audit: { rows: [{ username: 'ali', email: 'ali@x.com', kind: 'email' }, { username: 'noor', email: 'n@x.com', kind: 'vip-name' }], scanned: 140 } });
  if (url.includes('/api/vip')) return J({ list: ['averyveryverylongvipaddress.withdots@example.com', 'سارة'] });
  return J({});
};

test('٥. الإحصاءات بالإنجليزيّة: لا عربيّ خارج الحمولات المعزولة، و«حسب الخدمة» بأسماء وظيفيّة لا رموز خامّة', async () => {
  const env = adminEnv('en', route);
  await env.ctx.loadAdminStats();
  const box = env.$('adminStatsBox').textContent;
  assert.ok(!AR_RE.test(visibleOutsideIso(box)), box);
  assert.match(box, /Total accounts: 140 {2}\(real: 114, test: 3\)/);
  assert.match(box, /By service today:/);
  assert.match(box, /• Chat: 21/);
  assert.match(box, /• Read aloud: 6/);
  assert.match(box, /• Media classification: 4/);
  assert.match(box, /• Plan chat \u2066\(plan-premium\)\u2069: 3/);
  assert.match(box, /• \u2066zz-new\u2069: 1/, 'غير المعروف يبقى خامًا معزولًا');
  assert.doesNotMatch(box, /• (chat|tts|media-intent):/);
  assert.match(box, /• \u2068سارة\u2069: 4 messages/, 'الاسم معزول');
  // بالعربيّة نفس الشكل القديم إلّا العنوان
  const ar = adminEnv('ar', route);
  await ar.ctx.loadAdminStats();
  assert.match(ar.$('adminStatsBox').textContent, /^👥 إجمالي الحسابات: 140 {2}\(حقيقية: 114، اختبار: 3\)/);
  assert.match(ar.$('adminStatsBox').textContent, /📊 حسب الخدمة اليوم:\n {2}• المحادثة: 21/);
});

test('٦. جدول المستخدمين: بالإنجليزيّة بلا عربيّ خارج <bdi>، والاسم الطويل لا يتراكب والأزرار في مجموعة لا تنزل سطرًا', async () => {
  const env = adminEnv('en', route);
  await env.ctx.loadAdminStats();
  const html = env.$('adminUsersTable').innerHTML;
  assert.ok(!AR_RE.test(noData(html)), noData(html));
  assert.match(html, /Automated check accounts \(zzcheck…\): 1/);
  assert.match(html, /🧹 Delete them all/);
  assert.match(html, /No email/);
  for (const t of ['Send a message', 'Ban', 'Unban', 'Delete permanently']) assert.ok(html.includes('title="' + t + '"'), t);
  const rows = html.split('<div style="display:flex;align-items:center;gap:8px;padding:8px 6px;border-bottom:1px solid var(--border,#333)">').slice(1);
  assert.equal(rows.length, 3);
  for (const r of rows) {
    assert.doesNotMatch(r, /<div/, 'لا div بين الصفّ والأزرار (delete-confirm يأخذ closest(div))');
    assert.match(r, /min-width:0[^"]*overflow-wrap:anywhere/, 'الاسم يلتفّ داخل خانته');
    assert.match(r, /<span style="display:flex;gap:6px;flex:none">(<button[^]*?<\/button>){3}<\/span>/, 'الأزرار الثلاثة في مجموعة flex:none');
  }
  assert.ok(html.includes('<bdi dir="ltr">averyveryverylongusername.withdots@gmail.com</bdi>'), 'الإيميل معزول يسار-يمين');
  assert.ok(html.includes('<bdi>g_averyveryverylongusername.withdots@gmail.com</bdi>'));
  assert.doesNotMatch(html, /min-width:110px|flex-wrap:wrap"/);
});

test('٧. VIP بالإنجليزيّة: القائمة والتلميح وزرّ الجرد ونتيجته بلا عربيّ خارج الحمولات، والصفّ لا يتراكب', async () => {
  const env = adminEnv('en', route);
  await env.ctx.loadVipList();
  const list = env.$('vipListBox').innerHTML;
  assert.ok(!AR_RE.test(noData(list)), noData(list));
  assert.ok(list.includes('title="Remove from VIP"'));
  assert.match(list, /min-width:0[^"]*overflow-wrap:anywhere/);
  assert.ok(list.includes('<bdi>سارة</bdi>'));
  const btn = env.$('vipAuditBtn');
  assert.equal(btn.textContent, '🔎 Unverified VIP emails');
  btn.onclick();
  await flush();
  const audit = env.$('vipAuditBox').innerHTML;
  assert.ok(!AR_RE.test(visibleOutsideIso(audit)), audit);
  assert.match(audit, /Unverified VIP emails: 2 \(140 accounts checked\)/);
  assert.match(audit, /no VIP until they verify it/);
  assert.match(audit, /if you added them by email before today/);
  const empty = adminEnv('en', (u) => (u.includes('/api/vip') ? J({ list: [] }) : J({})));
  await empty.ctx.loadVipList();
  assert.match(empty.$('vipListBox').innerHTML, /Nobody is on the VIP list\./);
});

test('٨. انقطاع الشبكة: «Failed to fetch» يصير نصّ acctNetError بلغة الواجهة في فحص المفتاح والإحصاءات وVIP', async () => {
  const down = () => { throw new TypeError('Failed to fetch'); };
  for (const lg of ['en', 'ar', 'fr']) {
    const env = adminEnv(lg, down);
    const net = dictFor(lg).acctNetError;
    await env.ctx.adminClaudeDiag();
    const diag = env.$('adminClaudeDiagBox').textContent;
    assert.ok(diag.includes(net) && !diag.includes('Failed to fetch'), lg + ': ' + diag);
    await env.ctx.loadAdminStats();
    assert.ok(env.$('adminStatsBox').textContent.includes(net), lg);
    await env.ctx.loadVipList();
    assert.ok(env.$('vipListBox').textContent.includes(net), lg);
  }
  // خطأ غير شبكيّ يبقى كما هو (التشخيص يحتاجه)
  const env = adminEnv('en', () => { throw new Error('boom 42'); });
  await env.ctx.adminClaudeDiag();
  assert.match(env.$('adminClaudeDiagBox').textContent, /boom 42/);
});

test('٩. نوافذ التأكيد والتنبيه في أفعال المالك بلغة الواجهة', async () => {
  const env = adminEnv('en', route);
  await env.ctx.adminToggleBan('bob', true);
  await env.ctx.adminToggleBan('bob', false);
  await env.ctx.adminDeleteUser('bob');
  await env.ctx.adminPurgeChecks();
  await env.ctx.adminMessageUser('bob');
  await env.ctx.addVipUser();
  await env.ctx.removeVipUser('vip@x.com');
  const msgs = env.said.map((x) => x[1]);
  assert.deepEqual(msgs.slice(0, 2), ['Ban user “\u2068bob\u2069”?', 'Unban user “\u2068bob\u2069”?']);
  assert.equal(msgs.length, 7);
  for (const m of msgs) assert.ok(!AR_RE.test(visibleOutsideIso(m)), m);
  assert.match(msgs[2], /Permanently delete the account/);
  assert.match(msgs[4], /Write the message for/);
  assert.equal(msgs[5], 'Enter an email or a username first.');
});

/* ---------- الخزنة (app-28) ---------- */
function vaultEnv(lang, reply) {
  const { document } = makeDom();
  for (const id of ['vaultTestBox', 'vaultGhStatus']) { const e = document.createElement('div'); e.id = id; document.body.appendChild(e); }
  const repo = document.createElement('input'); repo.id = 'vaultRepoInput'; repo.value = 'OMRAN77/omran-ai-builder'; document.body.appendChild(repo);
  const store = { aiapp_lang: lang };
  const ctx = {
    document, localStorage: { getItem: (k) => (k in store ? store[k] : null) }, authGet: () => 'tok', __swallow() {},
    fetch: async () => (typeof reply === 'function' ? reply() : J(reply)), confirm: () => true, alert() {},
  };
  ctx.window = ctx;
  ctx.t = tFor(lang);
  vm.createContext(ctx);
  vm.runInContext(read('js/app-28-vault.js'), ctx);
  return { ctx, box: document.getElementById('vaultTestBox') };
}

test('١٠. فحص مفتاح الخزنة: رمز الخطأ من الخادم يُترجَم بلغة الواجهة، وحدّ الطلبات معزول، والشبكة acctNetError', async () => {
  let v = vaultEnv('en', { ok: false, error: 'no_github_token', message: 'لا مفتاح GitHub محفوظ في الخزنة.' });
  await v.ctx.vaultTest();
  assert.equal(v.box.textContent, '❌ No GitHub token is saved in the vault.');
  v = vaultEnv('fr', { ok: false, error: 'bad_repo', message: 'صيغة المستودع: owner/repo' });
  await v.ctx.vaultTest();
  assert.equal(v.box.textContent, '❌ ' + dictFor('fr').ownerVaultBadRepo);
  v = vaultEnv('en', { ok: false, error: 'token_rejected' });
  await v.ctx.vaultTest();
  assert.match(v.box.textContent, /GitHub rejected the key \(401\)/);
  v = vaultEnv('en', { ok: true, login: 'OMRAN77', repo: 'OMRAN77/omran-ai-builder', readable: true, writable: true, rateLimit: '5000' });
  await v.ctx.vaultTest();
  assert.ok(!AR_RE.test(v.box.textContent), v.box.textContent);
  assert.match(v.box.textContent, /⏱️ Rate limit: \u20665000\u2069\/hour$/);
  // سطور الخزنة الثنائيّة (قراءة/رفع) لغير العربيّة بالإنجليزيّة — كانت الفرنسيّة وغيرها عربيّة
  v = vaultEnv('fr', { ok: true, login: 'OMRAN77', repo: 'OMRAN77/omran-ai-builder', readable: true, writable: false, rateLimit: '60' });
  await v.ctx.vaultTest();
  assert.ok(!AR_RE.test(v.box.textContent), v.box.textContent);
  v = vaultEnv('en', () => { throw new TypeError('Failed to fetch'); });
  await v.ctx.vaultTest();
  assert.equal(v.box.textContent, '❌ ' + dictFor('en').acctNetError);
});
