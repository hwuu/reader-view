// Background Service Worker
// 职责：图标点击处理、URL 黑名单过滤、按需注入 Content Script、图标状态更新
// 不维护任何内存状态，Service Worker 重启不影响功能

const BLOCKED_URL_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'about:',
  'file://',
  'edge://',
  'devtools://',
];

function isBlockedUrl(url: string): boolean {
  return BLOCKED_URL_PREFIXES.some((prefix) => url.startsWith(prefix));
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) return;

  if (isBlockedUrl(tab.url)) return;

  // 尝试向已注入的 content script 发消息
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_READER' });
  } catch {
    // content script 未注入，按需注入
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['src/content.js'],
    });
    // 注入后发送切换消息（content script 顶层同步注册监听器，此时应已就绪）
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_READER' });
    } catch {
      console.error('Reader View: Failed to send message after injection');
    }
  }
});

// 接收 content script 的状态同步消息，更新图标
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'READER_STATE_CHANGED' && sender.tab?.id) {
    updateIcon(sender.tab.id, message.payload.isActive);
  }
});

function updateIcon(tabId: number, isActive: boolean) {
  const prefix = isActive ? 'icons/icon-active' : 'icons/icon';
  const path = {
    16: chrome.runtime.getURL(`${prefix}-16.png`),
    48: chrome.runtime.getURL(`${prefix}-48.png`),
    128: chrome.runtime.getURL(`${prefix}-128.png`),
  };
  chrome.action.setIcon({ tabId, path }).catch(() => {});
}
