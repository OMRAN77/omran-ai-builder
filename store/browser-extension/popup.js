const APP = 'https://omran-ai-builder.vercel.app/';
const msg = (k) => chrome.i18n.getMessage(k) || '';

document.documentElement.lang = msg('@@ui_locale').replace('_', '-') || 'en';
document.documentElement.dir = msg('@@bidi_dir') || 'ltr';
document.querySelectorAll('[data-msg]').forEach((el) => { el.textContent = msg(el.dataset.msg) || el.textContent; });
document.querySelectorAll('[data-msg-placeholder]').forEach((el) => { el.placeholder = msg(el.dataset.msgPlaceholder); });

function open(text) {
  const q = String(text || '').trim().slice(0, 4000);
  chrome.tabs.create({ url: q ? APP + '?q=' + encodeURIComponent(q) : APP });
  window.close();
}

document.getElementById('ask').addEventListener('submit', (e) => {
  e.preventDefault();
  open(document.getElementById('q').value);
});
document.getElementById('q').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    open(e.target.value);
  }
});
document.getElementById('open').addEventListener('click', () => open(''));
