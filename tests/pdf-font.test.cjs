const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const ui = fs.readFileSync('js/app-05-ui.js', 'utf8');
const maha = fs.readFileSync('js/app-08-maha.js', 'utf8');
const fontsSource = fs.readFileSync('js/app-19-fonts.js', 'utf8');

const fontWindow = { Omran: {}, dispatchEvent(){} };
vm.runInNewContext(fontsSource, {
  window:fontWindow,
  document:{ readyState:'loading', addEventListener(){}, documentElement:{} },
  localStorage:{ getItem(){ return 'naskh'; } },
  console,
  CustomEvent:function(){}
});
assert.equal(fontWindow.Omran.fonts.current(), 'naskh');

const helperCode = ui.slice(ui.indexOf('function msgEscapeHtml'), ui.indexOf('function exportReplyAsWord'));
const exportTextCode = maha.slice(maha.indexOf('function exportTextAsPdf'), maha.indexOf('function isPureGreeting'));
function makePrintView(){
  const events = {};
  const link = { sheet:null, addEventListener(type, fn){ events[type] = fn; } };
  const state = { html:'', printed:0, requested:'' };
  const document = {
    open(){}, close(){}, write(html){ state.html = html; },
    querySelector(){ return link; },
    fonts:{ load(spec){ state.requested = spec; return Promise.resolve(); }, ready:Promise.resolve() }
  };
  return { view:{ document, focus(){}, print(){ state.printed++; } }, events, state };
}

(async function(){
  const reply = makePrintView();
  const iframePrint = makePrintView();
  let iframe;
  const context = {
    window:Object.assign(fontWindow, { open(){ return reply.view; } }),
    document:{
      createElement(){ iframe = { style:{}, contentWindow:iframePrint.view }; return iframe; },
      body:{ appendChild(){} }
    },
    setTimeout(fn, ms){ return ms > 10000 ? 0 : setTimeout(fn, ms); },
    clearTimeout, __swallow(){}, console
  };
  vm.runInNewContext(helperCode + '\n' + exportTextCode, context);

  context.exportReplyAsPdf('نص عربي');
  assert.match(reply.state.html, /family=Amiri/);
  assert.match(reply.state.html, /body\{font-family:'Amiri'/);
  assert.equal(reply.state.printed, 0, 'reply PDF must wait for its font stylesheet');
  reply.events.load();

  context.exportTextAsPdf('عنوان عربي');
  assert.match(iframe.srcdoc, /family=Amiri/);
  assert.match(iframe.srcdoc, /body\{font-family:'Amiri'/);
  iframe.onload();
  assert.equal(iframePrint.state.printed, 0, 'chat PDF must wait for its font stylesheet');
  iframePrint.events.load();
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(reply.state.printed, 1);
  assert.equal(iframePrint.state.printed, 1);
  assert.match(reply.state.requested, /Amiri/);
  assert.match(iframePrint.state.requested, /Amiri/);
  console.log('PDF export preserves and waits for the selected chat font');
})().catch(err => { console.error(err); process.exitCode = 1; });
