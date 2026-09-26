// إضافة عمران AI — كلّ ما تفعله فتح التطبيق في تبويب، ومعه النصّ المحدّد أو ما كُتب بعد «om»
// في شريط العنوان. التطبيق يعبّئ صندوق المحادثة من ?q= ولا يرسل؛ الإضافة لا تقرأ الصفحات ولا تجمع شيئًا.
const APP = 'https://omran-ai-builder.vercel.app/';
const MAX = 4000;

function appUrl(text) {
  const q = String(text || '').trim().slice(0, MAX);
  return q ? APP + '?q=' + encodeURIComponent(q) : APP;
}

function openApp(text) {
  chrome.tabs.create({ url: appUrl(text) });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'omran-ask', title: chrome.i18n.getMessage('ctxAsk'), contexts: ['selection'] });
    chrome.contextMenus.create({ id: 'omran-open', title: chrome.i18n.getMessage('popupOpen'), contexts: ['action'] });
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'omran-ask') openApp(info.selectionText);
  else if (info.menuItemId === 'omran-open') openApp('');
});

chrome.omnibox.setDefaultSuggestion({ description: chrome.i18n.getMessage('omniboxHint') });
chrome.omnibox.onInputEntered.addListener((text) => openApp(text));
