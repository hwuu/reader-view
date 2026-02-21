// Content Script
// 职责：接收 background 消息、调用 Defuddle 解析页面、DOMPurify 消毒、管理阅读模式生命周期
// 顶层同步注册消息监听器，确保 executeScript 后立即可接收消息

import Defuddle from 'defuddle/full';
import DOMPurify from 'dompurify';
import { createReaderContainer } from './reader/reader';
import readerCSS from './reader/reader.css?inline';

let isActive = false;
let shadowHost: HTMLElement | null = null;
let originalOverflow = '';

// 解析结果缓存
let parsedContent = '';
let parsedMarkdown = '';
let parsedTitle = '';
let parsedAuthor: string | undefined;
let parsedPublished: string | undefined;
let parsedSite: string | undefined;

// DOMPurify 白名单配置：只保留阅读所需的标签和属性
const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'blockquote', 'pre', 'code',
    'a', 'img', 'figure', 'figcaption',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'strong', 'em', 'b', 'i', 'u', 's', 'del',
    'br', 'hr', 'div', 'span',
    'sup', 'sub', 'abbr', 'mark',
    'dl', 'dt', 'dd',
    'details', 'summary',
  ],
  ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'width', 'height', 'class', 'id'],
  ALLOW_DATA_ATTR: false,
};

// 顶层同步注册，避免竞态
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'TOGGLE_READER') {
    toggleReader();
    sendResponse({ success: true });
  }
  return true;
});

// ESC 退出阅读模式
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isActive) {
    disableReader();
  }
});

function toggleReader() {
  if (isActive) {
    disableReader();
  } else {
    enableReader();
  }
}

async function enableReader() {
  try {
    const defuddle = new Defuddle(document, { separateMarkdown: true });
    const result = defuddle.parse();

    parsedContent = DOMPurify.sanitize(result.content, PURIFY_CONFIG);
    parsedMarkdown = result.contentMarkdown ?? '';
    parsedTitle = result.title;
    parsedAuthor = result.author ?? undefined;
    parsedPublished = result.published ?? undefined;
    parsedSite = result.site ?? undefined;

    if (!parsedContent.trim()) {
      console.warn('Reader View: No content extracted from page');
      return;
    }

    await renderReaderView();
    originalOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    isActive = true;
    notifyStateChanged(true);
  } catch (error) {
    console.error('Reader View: Failed to parse page', error);
  }
}

function disableReader() {
  if (shadowHost) {
    shadowHost.remove();
    shadowHost = null;
  }
  document.documentElement.style.overflow = originalOverflow;
  originalOverflow = '';
  parsedContent = '';
  parsedMarkdown = '';
  parsedTitle = '';
  parsedAuthor = undefined;
  parsedPublished = undefined;
  parsedSite = undefined;
  isActive = false;
  notifyStateChanged(false);
}

async function renderReaderView() {
  // 创建 Shadow DOM host
  shadowHost = document.createElement('reader-view-host');
  shadowHost.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483647;';

  const shadowRoot = shadowHost.attachShadow({ mode: 'open' });

  // 注入样式到 Shadow DOM
  const style = document.createElement('style');
  style.textContent = readerCSS;
  shadowRoot.appendChild(style);

  // 创建阅读视图
  const container = await createReaderContainer({
    content: parsedContent,
    contentMarkdown: parsedMarkdown,
    title: parsedTitle,
    author: parsedAuthor,
    published: parsedPublished,
    site: parsedSite,
    onClose: disableReader,
  });
  shadowRoot.appendChild(container);

  document.body.appendChild(shadowHost);
}

function notifyStateChanged(active: boolean) {
  chrome.runtime.sendMessage({
    type: 'READER_STATE_CHANGED',
    payload: { isActive: active },
  });
}
