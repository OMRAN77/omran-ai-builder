// إضافة «Om ai» للمتصفّح: تفتح التطبيق من أيّ صفحة، والسؤال يصل صندوق المحادثة عبر ?q=
// (يقرؤه js/app-22-session-new.js). لا تقرأ الإضافة أيّ صفحة ولا تحتاج صلاحيّة مواقع.
const APP_URL = 'https://omran-ai-builder.vercel.app/';
// الرابط الطويل جدًّا يُرفض عند بعض الخوادم والمتصفّحات — التطبيق نفسه يقصّ عند ٤٠٠٠.
const MAX_Q = 1800;

function appUrl(text) {
  const q = String(text || '').trim().slice(0, MAX_Q);
  return q ? APP_URL + '?q=' + encodeURIComponent(q) : APP_URL;
}

function openApp(text, tab) {
  const props = { url: appUrl(text) };
  if (tab && typeof tab.index === 'number' && tab.index >= 0) props.index = tab.index + 1;
  chrome.tabs.create(props);
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'om-ask', title: chrome.i18n.getMessage('menuAsk'), contexts: ['selection'] });
    chrome.contextMenus.create({ id: 'om-summarize', title: chrome.i18n.getMessage('menuSummarize'), contexts: ['page'] });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'om-ask') openApp(info.selectionText, tab);
  else if (info.menuItemId === 'om-summarize') {
    const pageUrl = info.pageUrl || (tab && tab.url) || '';
    openApp(chrome.i18n.getMessage('summarizePrompt', [pageUrl]), tab);
  }
});

chrome.action.onClicked.addListener((tab) => openApp('', tab));

chrome.omnibox.setDefaultSuggestion({ description: chrome.i18n.getMessage('omniboxHint') });
chrome.omnibox.onInputEntered.addListener((text, disposition) => {
  const url = appUrl(text);
  if (disposition === 'currentTab') chrome.tabs.update({ url });
  else chrome.tabs.create({ url, active: disposition === 'newForegroundTab' });
});
