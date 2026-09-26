// tests/reply-export.test.cjs — v-reply-export (٢٤ سبتمبر ٢٠٢٦): قائمة ⋮ تحت الردّ (PDF / Word / صورة / TXT).
// العرض: «الرسالة فاضية» و«الورد والـtxt والصور ما تشتغل» من تطبيق هواوي (WebView الاحتياطيّ).
// الجذور المثبتة بمسبار Playwright: (١) كلّ PDF أبيض — html-to-image ينسخ موضع الحاوية خارج الشاشة
// (fixed؛ left:-12000px) إلى نسختها فتُرسم خارج اللوحة. (٢) Word/TXT/صورة تنزّل blob مباشرة، وداخل
// التطبيق تخطفها مصيدة حفظ الصور وترفعها «صورة» image/jpeg بروابط مكسورة. (٣) غلاف WebView بلا
// DownloadListener فكلّ زرّ «تحميل» ميت.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const UI = read('js/app-05-ui.js');

/* يستخرج دالّة كاملة من المصدر بمطابقة الأقواس (بلا تنفيذ بقيّة الملفّ) */
function fnSource(src, name) {
  const m = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(src);
  assert.ok(m, 'الدالّة ' + name + ' موجودة');
  let i = src.indexOf('{', m.index), depth = 0;
  for (let k = i; k < src.length; k++) {
    const c = src[k];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(m.index, k + 1); }
  }
  throw new Error('لم تُغلق ' + name);
}

/* بيئة تشغيل وهميّة لمسار الحفظ: جوال/تطبيق/كمبيوتر، مشاركة مرفوضة أو غائبة، رفع يُسجَّل */
function makeEnv({ mobile = false, app = false, bridge = false, share = null } = {}) {
  const log = { fetch: [], sheets: [], downloads: [], bridge: [], shares: [] };
  const ctx = {
    console, Blob, File, URL: { createObjectURL: () => 'blob:local' }, setTimeout: () => 0,
    __swallow: () => {},
    omranNativeBridge: (n) => (bridge && n === 'omranShare') ? { postMessage: (m) => log.bridge.push(m) } : null,
    omranLikelyApp: () => app,
    omranMobileUA: () => mobile,
    omranPdfReadySheet: (url, file, name, kind) => { log.sheets.push({ url, name, kind, fileType: file && file.type }); return true; },
    msgDownloadBlob: (blob, name) => { log.downloads.push({ name, type: blob.type }); },
    FileReader: class { readAsDataURL(b) { b.arrayBuffer().then((ab) => { this.result = 'data:' + (b.type || '') + ';base64,' + Buffer.from(ab).toString('base64'); this.onload(); }); } },
    fetch: async (url, init) => { const body = JSON.parse(init.body); log.fetch.push({ url, body }); const pdf = /action=pdf/.test(url); return { ok: true, json: async () => ({ id: 'abc123', url: (pdf ? '/p/' : '/f/') + 'abc123' }) }; },
    navigator: share ? { canShare: () => true, share: async (d) => { log.shares.push(d.files[0].name); if (share !== 'ok') { const e = new Error('x'); e.name = share; throw e; } } } : {},
    document: { createElement: () => ({ style: {}, remove() {} }), body: { appendChild() {} }, getElementById: () => null },
  };
  vm.createContext(ctx);
  vm.runInContext([fnSource(UI, 'omranBlobToServerLink'), fnSource(UI, 'omranSaveBlob'), fnSource(UI, 'msgSaveExport')].join('\n') + '\nthis.msgSaveExport = msgSaveExport; this.omranSaveBlob = omranSaveBlob;', ctx);
  return { ctx, log };
}
const flush = () => new Promise((r) => setImmediate(r));
async function settle() { for (let i = 0; i < 10; i++) await flush(); }

test('PDF: toCanvas يرسم النسخة في مكانها (position:static) لا خارج اللوحة', () => {
  const body = fnSource(UI, 'omranExportHtmlAsPdfFile');
  assert.match(body, /toCanvas\(holder,\s*\{[^}]*style:\s*\{\s*position:\s*'static',\s*left:\s*'0',\s*top:\s*'0'\s*\}/);
});

test('Word/صورة/TXT تمرّ بـmsgSaveExport، ولا تنزّل blob مباشرة', () => {
  for (const n of ['exportReplyAsWord', 'exportReplyAsImage', 'exportReplyAsTxt']) {
    const body = fnSource(UI, n);
    assert.match(body, /msgSaveExport\(/, n);
    assert.doesNotMatch(body, /msgDownloadBlob\(/, n);
  }
});

test('الكمبيوتر: تنزيل مباشر كما كان — لا رفع ولا ورقة', async () => {
  const { ctx, log } = makeEnv();
  ctx.msgSaveExport(new Blob(['x'], { type: 'application/msword' }), 'omran-ai-reply.doc');
  await settle();
  assert.equal(log.downloads.length, 1);
  assert.equal(log.fetch.length, 0);
  assert.equal(log.sheets.length, 0);
});

test('تطبيق بلا مشاركة ولا جسر (WebView هواوي): Word/TXT تُرفع لنقطة الملفّات وورقة «الملف جاهز» بنوعها', async () => {
  for (const [name, type] of [['omran-ai-reply.doc', 'application/msword'], ['omran-ai-reply.txt', 'text/plain;charset=utf-8']]) {
    const { ctx, log } = makeEnv({ app: true, mobile: true });
    ctx.msgSaveExport(new Blob(['سطر عربي'], { type }), name);
    await settle();
    assert.equal(log.fetch.length, 1, name);
    assert.equal(log.fetch[0].url, '/api/media?action=file', name + ': لا يُرفع لنقطة الصور ولا PDF');
    assert.equal(log.fetch[0].body.mime, type);
    assert.equal(log.fetch[0].body.name, name);
    assert.equal(Buffer.from(log.fetch[0].body.data, 'base64').toString('utf8'), 'سطر عربي');
    assert.equal(log.sheets.length, 1);
    assert.deepEqual({ url: log.sheets[0].url, kind: log.sheets[0].kind, fileType: log.sheets[0].fileType }, { url: '/f/abc123', kind: 'file', fileType: type });
    assert.equal(log.downloads.length, 0, name + ': لا تنزيل blob يُخطف');
  }
});

test('تطبيق بلا مشاركة: PDF إلى نقطته بعنوان PDF، والصورة بعنوان الصورة', async () => {
  let e = makeEnv({ app: true });
  await e.ctx.omranSaveBlob(new Blob(['%PDF-1.3'], { type: 'application/pdf' }), 'omran-ai.pdf');
  assert.equal(e.log.fetch[0].url, '/api/media?action=pdf');
  assert.equal(e.log.sheets[0].kind, 'pdf');
  e = makeEnv({ app: true });
  await e.ctx.omranSaveBlob(new Blob(['png'], { type: 'image/png' }), 'omran-ai-reply.png');
  assert.equal(e.log.fetch[0].url, '/api/media?action=file');
  assert.equal(e.log.sheets[0].kind, 'image');
});

test('كروم الجوال: رفض مشاركة .doc (NotAllowedError) يسقط على ورقة الأزرار لا على شيء ميت', async () => {
  const { ctx, log } = makeEnv({ mobile: true, share: 'NotAllowedError' });
  await ctx.omranSaveBlob(new Blob(['x'], { type: 'application/msword' }), 'omran-ai-reply.doc');
  assert.deepEqual(log.shares, ['omran-ai-reply.doc']);
  assert.equal(log.sheets.length, 1);
  assert.equal(log.sheets[0].kind, 'file');
});

test('المشاركة الناجحة أو إلغاؤها بيد المستخدم لا يفتحان ورقة ثانية', async () => {
  for (const mode of ['ok', 'AbortError']) {
    const { ctx, log } = makeEnv({ mobile: true, share: mode });
    await ctx.omranSaveBlob(new Blob(['x'], { type: 'text/plain' }), 'omran-ai-reply.txt');
    assert.equal(log.sheets.length, 0, mode);
    assert.equal(log.fetch.length, 0, mode);
  }
});

test('جسر التطبيق (أندرويد/آيفون) يبقى أوّلًا، ونوع TXT يصله بلا معاملات charset', async () => {
  const { ctx, log } = makeEnv({ app: true, bridge: true });
  const src = fnSource(UI, 'msgDownloadBlob');
  vm.runInContext(src + '\nthis.msgDownloadBlob = msgDownloadBlob;', ctx);
  await ctx.omranSaveBlob(new Blob(['x'], { type: 'text/plain;charset=utf-8' }), 'omran-ai-reply.txt');
  await settle();
  assert.equal(log.fetch.length, 0);
  assert.equal(log.bridge.length, 1);
  assert.equal(log.bridge[0].mime, 'text/plain');
  assert.equal(log.bridge[0].name, 'omran-ai-reply.txt');
});

test('مصيدة حفظ الصور تخطف الصور وحدها — .doc/.txt/.pdf تُترك لمسارها', () => {
  let handler = null;
  const saved = [];
  const ctx = {
    console, navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 12; wv) AppleWebKit/537.36 Chrome/114 Mobile' },
    localStorage: { getItem: () => null }, lang: 'ar',
    document: { addEventListener: (type, fn, cap) => { if (type === 'click' && cap) handler = fn; }, getElementById: () => null },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('js/app-05-img-save.js'), ctx);
  assert.equal(typeof handler, 'function');
  ctx.window.omranSaveImage = (h, name) => { saved.push(name); };
  const click = (href, download) => {
    const a = { dataset: {}, getAttribute: (k) => (k === 'href' ? href : download) };
    let prevented = false;
    handler({ target: { closest: () => a }, preventDefault() { prevented = true; }, stopPropagation() {} });
    return prevented;
  };
  assert.equal(click('blob:x', 'omran-ai-reply.doc'), false, 'Word لا يُخطف');
  assert.equal(click('blob:x', 'omran-ai-reply.txt'), false, 'TXT لا يُخطف');
  assert.equal(click('blob:x', 'report.pdf'), false, 'PDF لا يُخطف');
  assert.equal(click('blob:x', 'omran-image.png'), true, 'PNG يُخطف كما كان');
  assert.equal(click('blob:x', 'photo.JPG'), true, 'JPG يُخطف كما كان');
  assert.equal(click('blob:x', 'omran-image'), true, 'اسم بلا امتداد يبقى صورة كما كان');
  assert.equal(click('data:image/png;base64,AAAA', 'card.txt'), true, 'data:image يُخطف مهما كان الاسم');
  assert.deepEqual(saved, ['omran-image.png', 'photo.JPG', 'omran-image', 'card.txt']);
});

test('نقطة الملفّات: النوع يُنظَّف قبل تخزينه وإرساله ترويسةً، والملفّ يرجع بنوعه واسمه', async () => {
  const store = new Map();
  const kvPath = require.resolve(path.join(root, 'api/_lib/kv.js'));
  const fsPath = require.resolve(path.join(root, 'api/_lib/file-share.js'));
  const saved = require.cache[kvPath];
  delete require.cache[fsPath];
  require.cache[kvPath] = { id: kvPath, filename: kvPath, loaded: true, exports: {
    kvSetIfAbsent: async (k, v) => { if (store.has(k)) return false; store.set(k, v); return true; },
    kvGetRaw: async (k) => store.get(k) || null,
  } };
  try {
    const handler = require(fsPath);
    const call = async (req) => {
      const res = { headers: {}, code: 0, body: null, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; } };
      await handler(req, res);
      return res;
    };
    const data = Buffer.from('سطر عربي').toString('base64');
    for (const [mime, want] of [
      ['text/plain;charset=utf-8', 'text/plain;charset=utf-8'],
      ['application/msword', 'application/msword'],
      ['text/html:evil', 'application/octet-stream'],
      ['text/plain\r\nSet-Cookie: a=b', 'application/octet-stream'],
      ['', 'application/octet-stream'],
    ]) {
      const up = await call({ method: 'POST', body: { data, name: 'omran-ai-reply.txt', mime } });
      assert.equal(up.code, 200, mime);
      assert.match(up.body.url, /^\/f\/[a-f0-9]{12}$/);
      const got = await call({ method: 'GET', query: { id: up.body.id } });
      assert.equal(got.code, 200);
      assert.equal(got.headers['content-type'], want, JSON.stringify(mime));
      assert.equal(got.headers['content-disposition'], 'attachment; filename="omran-ai-reply.txt"');
      assert.equal(got.headers['x-content-type-options'], 'nosniff');
      assert.equal(Buffer.from(got.body).toString('utf8'), 'سطر عربي');
    }
  } finally {
    if (saved) require.cache[kvPath] = saved; else delete require.cache[kvPath];
    delete require.cache[fsPath];
  }
});

test('/f/<id> موجَّه لنقطة الملفّات، وعامل الخدمة لا يلمسه', () => {
  const v = JSON.parse(read('vercel.json'));
  const r = (v.rewrites || []).find((x) => x.source === '/f/:id');
  assert.ok(r, 'إعادة كتابة /f/:id موجودة');
  assert.equal(r.destination, '/api/media?action=file&id=:id');
  assert.match(read('sw.js'), /\/\^\\\/\(p\|i\|f\)\\\//);
});

test('«الملف جاهز» مترجم بالـ١٤ لغة، ووسم ملفّات اللغة مرفوع', () => {
  const data = read('js/app-03-i18n-data.js');
  assert.equal((data.match(/fileReadyTitle: "/g) || []).length, 2, 'عربي + إنجليزي');
  for (const l of ['fr', 'hi', 'ur', 'bn', 'ne', 'ml', 'fil', 'id', 'zh', 'ru', 'tr', 'es']) {
    assert.match(read('i18n/' + l + '.js'), /"?fileReadyTitle"?: "✅ [^"]+"/, l);
  }
  assert.match(read('js/app-04-i18n-state.js'), /i18n\/' \+ lg \+ '\.js\?v=695'/);
});

test('غلاف أندرويد الاحتياطيّ: منزّل النظام في مساري إنشاء WebView، وصلاحيّة التخزين لأندرويد ≤٩ فقط', () => {
  const j = read('store/huawei/twa/app/src/main/java/com/omran/aibuilder/twa/MahaWebViewFallbackActivity.java');
  assert.equal((j.match(/attachDownloadListener\(mWebView\);/g) || []).length, 2, 'onCreate + onRenderProcessGone');
  assert.match(j, /setDownloadListener\(new DownloadListener\(\)/);
  assert.match(j, /DownloadManager\.Request request = new DownloadManager\.Request\(uri\)/);
  assert.match(j, /setDestinationInExternalPublicDir\(Environment\.DIRECTORY_DOWNLOADS, fileName\)/);
  const m = read('store/huawei/twa/app/src/main/AndroidManifest.xml');
  assert.match(m, /android\.permission\.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28"/);
});
