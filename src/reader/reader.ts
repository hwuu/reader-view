// Reader View 组件
// 职责：构建阅读视图 DOM 结构、绑定 toolbar 事件、应用/保存设置

import { loadSettings, saveSettings, type Settings } from '../lib/storage';

export interface ReaderViewOptions {
  content: string;
  contentMarkdown: string;
  title: string;
  author?: string;
  published?: string;
  site?: string;
  onClose: () => void;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export async function createReaderContainer(options: ReaderViewOptions): Promise<HTMLElement> {
  const container = document.createElement('div');
  container.id = 'reader-view-container';

  const metaParts: string[] = [];
  if (options.author) metaParts.push(`<span class="author">${escapeHtml(options.author)}</span>`);
  if (options.site) metaParts.push(`<span class="site">${escapeHtml(options.site)}</span>`);
  if (options.published) metaParts.push(`<span class="date">${escapeHtml(options.published)}</span>`);

  container.innerHTML = `
    <header class="reader-header">
      <div class="toolbar">
        <button id="close-reader" class="toolbar-btn" title="退出阅读模式">✕</button>
        <div class="toolbar-divider"></div>
        <select id="theme-select" class="toolbar-select" title="主题">
          <option value="light">亮色</option>
          <option value="dark">暗色</option>
          <option value="sepia">护眼</option>
        </select>
        <button id="decrease-font" class="toolbar-btn" title="减小字体">A-</button>
        <span id="font-size-label" class="toolbar-label"></span>
        <button id="increase-font" class="toolbar-btn" title="增大字体">A+</button>
        <button id="toggle-images" class="toolbar-btn" title="切换图片显示">图片</button>
        <div class="toolbar-divider"></div>
        <button id="copy-md" class="toolbar-btn" title="复制 Markdown">MD</button>
        <button id="copy-html" class="toolbar-btn" title="复制 HTML">HTML</button>
      </div>
    </header>
    <article class="reader-content">
      <h1 class="reader-title">${escapeHtml(options.title)}</h1>
      ${metaParts.length > 0 ? `<div class="reader-meta">${metaParts.join(' · ')}</div>` : ''}
      <div class="reader-body">${options.content}</div>
    </article>
  `;

  const settings = await loadSettings();
  applySettings(container, settings);
  setupToolbarListeners(container, options, settings);

  return container;
}

function applySettings(container: HTMLElement, settings: Settings) {
  // 主题
  container.setAttribute('data-theme', settings.theme);
  const themeSelect = container.querySelector('#theme-select') as HTMLSelectElement | null;
  if (themeSelect) themeSelect.value = settings.theme;

  // 字体
  container.style.setProperty('--reader-font-size', `${settings.fontSize}px`);
  container.style.setProperty('--reader-font-family', getFontFamily(settings.fontFamily));
  container.style.setProperty('--reader-line-height', `${settings.lineHeight}`);
  container.style.setProperty('--reader-content-width', `${settings.contentWidth}px`);

  // 字体大小标签
  const label = container.querySelector('#font-size-label');
  if (label) label.textContent = `${settings.fontSize}`;

  // 图片
  container.classList.toggle('hide-images', !settings.showImages);
  const imgBtn = container.querySelector('#toggle-images');
  if (imgBtn) imgBtn.textContent = settings.showImages ? '图片' : '无图';
}

function getFontFamily(key: string): string {
  switch (key) {
    case 'sans-serif': return '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    case 'monospace': return '"SF Mono", Monaco, Consolas, monospace';
    default: return 'Georgia, "Times New Roman", serif';
  }
}

function setupToolbarListeners(container: HTMLElement, options: ReaderViewOptions, settings: Settings) {
  let currentSettings = { ...settings };

  // 退出
  container.querySelector('#close-reader')?.addEventListener('click', options.onClose);

  // 主题
  container.querySelector('#theme-select')?.addEventListener('change', async (e) => {
    const theme = (e.target as HTMLSelectElement).value as Settings['theme'];
    container.setAttribute('data-theme', theme);
    currentSettings = await saveSettings({ theme });
  });

  // 字体大小
  const MIN_FONT_SIZE = 14;
  const MAX_FONT_SIZE = 24;
  const FONT_STEP = 2;

  container.querySelector('#decrease-font')?.addEventListener('click', async () => {
    const newSize = Math.max(MIN_FONT_SIZE, currentSettings.fontSize - FONT_STEP);
    container.style.setProperty('--reader-font-size', `${newSize}px`);
    const label = container.querySelector('#font-size-label');
    if (label) label.textContent = `${newSize}`;
    currentSettings = await saveSettings({ fontSize: newSize });
  });

  container.querySelector('#increase-font')?.addEventListener('click', async () => {
    const newSize = Math.min(MAX_FONT_SIZE, currentSettings.fontSize + FONT_STEP);
    container.style.setProperty('--reader-font-size', `${newSize}px`);
    const label = container.querySelector('#font-size-label');
    if (label) label.textContent = `${newSize}`;
    currentSettings = await saveSettings({ fontSize: newSize });
  });

  // 图片开关
  container.querySelector('#toggle-images')?.addEventListener('click', async () => {
    const show = !currentSettings.showImages;
    container.classList.toggle('hide-images', !show);
    const imgBtn = container.querySelector('#toggle-images');
    if (imgBtn) imgBtn.textContent = show ? '图片' : '无图';
    currentSettings = await saveSettings({ showImages: show });
  });

  // 复制 Markdown
  container.querySelector('#copy-md')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(options.contentMarkdown);
      showNotification(container, 'Markdown 已复制');
    } catch {
      showNotification(container, '复制失败');
    }
  });

  // 复制 HTML
  container.querySelector('#copy-html')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(options.content);
      showNotification(container, 'HTML 已复制');
    } catch {
      showNotification(container, '复制失败');
    }
  });
}

function showNotification(container: HTMLElement, message: string) {
  // 移除已有通知
  container.querySelector('.reader-notification')?.remove();

  const notification = document.createElement('div');
  notification.className = 'reader-notification';
  notification.textContent = message;
  container.appendChild(notification);

  setTimeout(() => notification.remove(), 2000);
}
