# Reader View 浏览器插件设计文档

## 目录

- [1. 背景与目标](#1-背景与目标)
  - [1.1 问题](#11-问题)
  - [1.2 启发](#12-启发)
  - [1.3 目标](#13-目标)
  - [1.4 非目标](#14-非目标)
- [2. 总体设计](#2-总体设计)
- [3. 设计决策](#3-设计决策)
  - [3.1 内容提取：为什么选 Defuddle 而非 Mozilla Readability](#31-内容提取为什么选-defuddle-而非-mozilla-readability)
  - [3.2 实现语言：为什么选 TypeScript 而非 JavaScript](#32-实现语言为什么选-typescript-而非-javascript)
  - [3.3 阅读视图渲染：为什么选 Content Script 注入而非新标签页](#33-阅读视图渲染为什么选-content-script-注入而非新标签页)
  - [3.4 样式方案：为什么选 CSS 变量而非 CSS-in-JS](#34-样式方案为什么选-css-变量而非-css-in-js)
  - [3.5 构建工具：为什么选 Webpack 而非 Vite](#35-构建工具为什么选-webpack-而非-vite)
- [4. 架构设计](#4-架构设计)
  - [4.1 核心分层](#41-核心分层)
  - [4.2 消息通信](#42-消息通信)
  - [4.3 存储架构](#43-存储架构)
- [5. 组件设计](#5-组件设计)
  - [5.1 Manifest（扩展配置）](#51-manifest扩展配置)
  - [5.2 Background Service Worker](#52-background-service-worker)
  - [5.3 Content Script（内容脚本）](#53-content-script内容脚本)
  - [5.4 Popup（弹出面板）](#54-popup弹出面板)
  - [5.5 Reader View（阅读视图）](#55-reader-view阅读视图)
  - [5.6 Defuddle 集成](#56-defuddle-集成)
- [6. 用户体验流程](#6-用户体验流程)
  - [6.1 安装](#61-安装)
  - [6.2 开启阅读模式](#62-开启阅读模式)
  - [6.3 工具栏操作](#63-工具栏操作)
  - [6.4 快捷键](#64-快捷键)
- [7. 主题与样式](#7-主题与样式)
- [8. 实现规划](#8-实现规划)
  - [8.1 目录结构](#81-目录结构)
  - [8.2 实现步骤](#82-实现步骤)
  - [8.3 测试要点](#83-测试要点)
- [9. 发布与分发](#9-发布与分发)
- [参考文献](#参考文献)

---

## 1. 背景与目标

### 1.1 问题

在使用浏览器阅读网页文章时，面临以下体验问题：

| 问题 | 说明 |
|------|------|
| **页面杂乱** | 广告、侧边栏、评论区、推荐链接等干扰阅读 |
| **排版不适** | 字体过小、行距过窄、配色刺眼 |
| **移动端体验差** | 响应式设计不佳，阅读需要频繁缩放 |
| **缺乏统一阅读体验** | 各网站阅读体验参差不齐 |

### 1.2 启发

业界已有的解决方案：

| 项目 | 特点 | 局限 |
|------|------|------|
| **Firefox 阅读模式** | 基于 Mozilla Readability，原生集成 | Firefox 独占 |
| **Edge/Chrome 阅读模式** | 原生支持，但功能有限 | 不可自定义，部分页面不支持 |
| **Mercury Reader** | Postlight Parser，界面美观 | 不开源，定制性差 |
| **Obsidian Web Clipper** | 基于 Defuddle，功能强大 | 主要用于剪藏，阅读模式非核心 |

### 1.3 目标

构建一个轻量级浏览器扩展 **Reader View**：

- **一键阅读**：点击图标或快捷键即可切换阅读模式
- **内容提取**：基于 Defuddle 提取网页正文，支持复杂页面
- **主题切换**：亮色/暗色/护眼色主题
- **个性化设置**：字体大小、字体样式、行宽调整
- **元数据展示**：标题、作者、发布日期、网站名称
- **导出功能**：复制 Markdown、复制 HTML
- **跨浏览器**：同时支持 Chrome 和 Edge

### 1.4 非目标

- **不做全文搜索**：不索引已读页面
- **不做稍后读列表**：不保存页面到云端
- **不做多设备同步**：不实现账号系统
- **不做页面编辑**：只读模式，不支持标注/高亮
- **不做 PDF 导出**：仅支持复制 Markdown/HTML

---

## 2. 总体设计

核心思路：**Content Script 注入 + Defuddle 内容提取 + CSS 变量主题系统**。

```
+----------------------------------------------------------------------+
|                           用户浏览器                                  |
+----------------------------------------------------------------------+
|                                                                      |
|  +----------------------------------------------------------------+  |
|  |  Browser UI                                                    |  |
|  |  +------------------+     +------------------+                 |  |
|  |  |  Extension Icon  |     |  Popup Panel     |                 |  |
|  |  |  (Toolbar)       |     |  • 主题切换      |                 |  |
|  |  |  • 点击切换      |     |  • 字体设置      |                 |  |
|  |  |  • 状态指示      |     |  • 导出选项      |                 |  |
|  |  +--------+---------+     +--------+---------+                 |  |
|  |           |                        |                            |  |
|  +-----------|------------------------|----------------------------+  |
|              |                        |                              |
|              v                        v                              |
|  +----------------------------------------------------------------+  |
|  |  Background Service Worker                                     |  |
|  |  • 管理扩展状态                                                 |  |
|  |  • 处理图标点击                                                 |  |
|  |  • 协调 Content Script                                         |  |
|  +-------------------------------+--------------------------------+  |
|                                  |                                   |
|                                  v                                   |
|  +----------------------------------------------------------------+  |
|  |  Content Script (注入到目标页面)                               |  |
|  |                                                                |  |
|  |  +----------------------------------------------------------+  |  |
|  |  |  Defuddle 内容提取                                        |  |  |
|  |  |  • 解析 DOM                                               |  |  |
|  |  |  • 提取正文内容                                           |  |  |
|  |  |  • 提取元数据（标题、作者、日期）                          |  |  |
|  |  +----------------------------------------------------------+  |  |
|  |                                                                |  |
|  |  +----------------------------------------------------------+  |  |
|  |  |  Reader View 渲染                                         |  |  |
|  |  |  • 原页面隐藏                                             |  |  |
|  |  |  • 注入阅读视图 DOM                                       |  |  |
|  |  |  • 应用主题样式                                           |  |  |
|  |  +----------------------------------------------------------+  |  |
|  |                                                                |  |
|  |  +----------------------------------------------------------+  |  |
|  |  |  工具栏                                                   |  |  |
|  |  |  • 主题选择器                                             |  |  |
|  |  |  • 字体大小调节                                           |  |  |
|  |  |  • 图片显示开关                                           |  |  |
|  |  |  • 复制 Markdown/HTML                                     |  |  |
|  |  |  • 退出阅读模式                                           |  |  |
|  |  +----------------------------------------------------------+  |  |
|  +----------------------------------------------------------------+  |
|                                                                      |
+----------------------------------------------------------------------+
```

关键设计决策：

| 决策 | 选择 | 核心理由 | 详见 |
|------|------|----------|------|
| 内容提取 | Defuddle（非 Readability） | 元数据丰富、HTML 标准化 | [3.1](#31-内容提取为什么选-defuddle-而非-mozilla-readability) |
| 实现语言 | TypeScript | 类型安全、开发体验好 | [3.2](#32-实现语言为什么选-typescript-而非-javascript) |
| 渲染方式 | Content Script 注入 | 无需新标签页、状态保持 | [3.3](#33-阅读视图渲染为什么选-content-script-注入而非新标签页) |
| 样式方案 | CSS 变量 | 轻量、主题切换简单 | [3.4](#34-样式方案为什么选-css-变量而非-css-in-js) |

---

## 3. 设计决策

### 3.1 内容提取：为什么选 Defuddle 而非 Mozilla Readability

| 维度 | Defuddle | Mozilla Readability |
|------|----------|---------------------|
| 元数据提取 | 丰富（作者、日期、网站、favicon、schema.org） | 基础（标题、作者） |
| HTML 标准化 | 是（脚注、代码块、数学公式） | 否 |
| Markdown 输出 | 内置支持 | 需额外库 |
| 容错性 | 高（不轻易删除不确定元素） | 中 |
| 成熟度 | 较新 | 非常成熟 |

**决策**：选择 Defuddle。

**理由**：
1. 元数据提取丰富，可显示作者、发布日期等信息
2. HTML 输出标准化，便于后续处理
3. 内置 Markdown 转换，减少依赖

**代价**：
1. 相比 Readability 较新，部分边缘 case 可能未覆盖
2. 体积稍大（但作为扩展可接受）

### 3.2 实现语言：为什么选 TypeScript 而非 JavaScript

| 维度 | TypeScript | JavaScript |
|------|------------|------------|
| 类型安全 | 编译期检查 | 无 |
| IDE 支持 | 极好（代码补全、重构） | 一般 |
| 学习曲线 | 稍高 | 低 |
| 构建需求 | 需要 | 无需 |

**决策**：选择 TypeScript。

**理由**：
1. 类型安全减少运行时错误
2. VS Code 开发体验极佳
3. Defuddle 本身是 TypeScript

### 3.3 阅读视图渲染：为什么选 Content Script 注入而非新标签页

| 维度 | Content Script 注入 | 新标签页 |
|------|---------------------|----------|
| 用户体验 | 原地切换，感知流畅 | 跳转新标签页，打断感 |
| 状态保持 | 页面状态保留 | 原页面状态丢失 |
| URL | 保持原 URL | 显示扩展内部 URL |
| 实现复杂度 | 中 | 低 |

**决策**：选择 Content Script 注入。

**理由**：
1. 用户体验更流畅
2. 可快速在原文和阅读模式间切换
3. 保持浏览器历史记录一致性

**代价**：
1. 需要处理与原页面 CSS 冲突
2. 需要正确管理 DOM 注入/移除

### 3.4 样式方案：为什么选 CSS 变量而非 CSS-in-JS

| 维度 | CSS 变量 | CSS-in-JS (Styled Components) |
|------|----------|-------------------------------|
| 包体积 | 极小 | 较大 |
| 运行时开销 | 无 | 有 |
| 主题切换 | 直接修改变量 | 需要重新渲染 |
| 兼容性 | 现代浏览器全支持 | 全支持 |

**决策**：选择 CSS 变量。

**理由**：
1. 主题切换只需修改 CSS 变量，无需重新渲染
2. 包体积极小，性能最优
3. 原生支持，无运行时开销

### 3.5 构建工具：为什么选 Webpack 而非 Vite

| 维度 | Webpack | Vite |
|------|---------|------|
| 浏览器扩展支持 | 成熟（很多插件） | 需要额外配置 |
| 热更新 | 支持（需配置） | 原生支持 |
| 构建速度 | 较慢 | 极快 |
| 生态 | 非常丰富 | 较新 |

**决策**：选择 Webpack。

**理由**：
1. 浏览器扩展构建场景下 Webpack 生态更成熟
2. 有现成的扩展构建配置可用
3. 稳定可靠

**代价**：
1. 构建速度比 Vite 慢
2. 配置相对复杂

---

## 4. 架构设计

### 4.1 核心分层

```
+----------------------------------------------------------------------+
|                        Reader View 架构                              |
+----------------------------------------------------------------------+
|                                                                      |
|  +----------------------------------------------------------------+  |
|  |  UI Layer (界面层)                                             |  |
|  |  +----------------------------------------------------------+  |  |
|  |  |  Popup                                                   |  |  |
|  |  |  • 设置面板                                               |  |  |
|  |  +----------------------------------------------------------+  |  |
|  |  +----------------------------------------------------------+  |  |
|  |  |  Toolbar (in Reader View)                                |  |  |
|  |  |  • 阅读模式内工具栏                                        |  |  |
|  |  +----------------------------------------------------------+  |  |
|  +----------------------------------------------------------------+  |
|                                                                      |
|  +----------------------------------------------------------------+  |
|  |  Logic Layer (逻辑层)                                          |  |
|  |  +----------------------------------------------------------+  |  |
|  |  |  Background Service Worker                               |  |  |
|  |  |  • 状态管理                                               |  |  |
|  |  |  • 消息路由                                               |  |  |
|  |  |  • 快捷键处理                                             |  |  |
|  |  +----------------------------------------------------------+  |  |
|  |  +----------------------------------------------------------+  |  |
|  |  |  Content Script Controller                               |  |  |
|  |  |  • 阅读模式开关                                           |  |  |
|  |  |  • 设置应用                                               |  |  |
|  |  +----------------------------------------------------------+  |  |
|  +----------------------------------------------------------------+  |
|                                                                      |
|  +----------------------------------------------------------------+  |
|  |  Content Layer (内容层)                                        |  |
|  |  +----------------------------------------------------------+  |  |
|  |  |  Defuddle Engine                                         |  |  |
|  |  |  • DOM 解析                                               |  |  |
|  |  |  • 内容提取                                               |  |  |
|  |  |  • 元数据提取                                             |  |  |
|  |  +----------------------------------------------------------+  |  |
|  |  +----------------------------------------------------------+  |  |
|  |  |  Markdown Converter                                      |  |  |
|  |  |  • HTML → Markdown                                        |  |  |
|  |  +----------------------------------------------------------+  |  |
|  +----------------------------------------------------------------+  |
|                                                                      |
|  +----------------------------------------------------------------+  |
|  |  Storage Layer (存储层)                                        |  |
|  |  +----------------------------------------------------------+  |  |
|  |  |  chrome.storage.sync                                     |  |  |
|  |  |  • 用户设置（主题、字体大小）                              |  |  |
|  |  +----------------------------------------------------------+  |  |
|  +----------------------------------------------------------------+  |
+----------------------------------------------------------------------+
```

### 4.2 消息通信

```
+------------------+                    +------------------+
|  Popup           |                    |  Background      |
|                  |                    |  Service Worker  |
|  +------------+  |   chrome.runtime   |  +------------+  |
|  | 用户操作   |--|------------------>|--|  消息分发   |  |
|  +------------+  |      .sendMessage  |  +------------+  |
|                  |                    |        |         |
+------------------+                    +--------|---------+
                                                 |
                                                 | chrome.tabs.sendMessage
                                                 v
                                        +------------------+
                                        |  Content Script  |
                                        |                  |
                                        |  +------------+  |
                                        |  | 执行操作   |  |
                                        |  +------------+  |
                                        +------------------+
```

**消息类型定义：**

```typescript
type MessageType = 
  | 'TOGGLE_READER'
  | 'GET_STATE'
  | 'UPDATE_SETTINGS'
  | 'COPY_CONTENT'
  | 'GET_CONTENT';

interface Message {
  type: MessageType;
  payload?: any;
}

interface Response {
  success: boolean;
  data?: any;
  error?: string;
}
```

### 4.3 存储架构

```typescript
interface StorageSchema {
  settings: {
    theme: 'light' | 'dark' | 'sepia';
    fontSize: number;           // 14-24
    fontFamily: 'serif' | 'sans-serif' | 'monospace';
    lineHeight: number;         // 1.4-2.0
    contentWidth: number;       // 600-900px
    showImages: boolean;
  };
}
```

使用 `chrome.storage.sync` 实现设置跨设备同步（用户开启同步时）。

---

## 5. 组件设计

### 5.1 Manifest（扩展配置）

```json
{
  "manifest_version": 3,
  "name": "Reader View",
  "version": "1.0.0",
  "description": "一键开启阅读模式，基于 Defuddle 提取网页正文",
  "permissions": [
    "activeTab",
    "storage",
    "clipboardWrite"
  ],
  "host_permissions": [
    "<all_urls>"
  ],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "css": ["reader.css"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_icon": {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    },
    "default_title": "Reader View"
  },
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  },
  "commands": {
    "_execute_action": {
      "suggested_key": {
        "default": "Alt+R"
      },
      "description": "切换阅读模式"
    }
  }
}
```

### 5.2 Background Service Worker

```typescript
// background.ts

const READER_VIEW_STATE = new Map<number, boolean>();

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  
  const isActive = READER_VIEW_STATE.get(tab.id) ?? false;
  
  await chrome.tabs.sendMessage(tab.id, {
    type: 'TOGGLE_READER',
    payload: { activate: !isActive }
  });
  
  READER_VIEW_STATE.set(tab.id, !isActive);
  updateIcon(tab.id, !isActive);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  READER_VIEW_STATE.delete(tabId);
});

function updateIcon(tabId: number, isActive: boolean) {
  const iconPath = isActive ? 'icons/icon-active-48.png' : 'icons/icon-48.png';
  chrome.action.setIcon({ tabId, path: iconPath });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_STATE') {
    const tabId = sender.tab?.id;
    if (tabId) {
      sendResponse({ isActive: READER_VIEW_STATE.get(tabId) ?? false });
    }
  }
  return true;
});
```

### 5.3 Content Script（内容脚本）

```typescript
// content.ts

import Defuddle from 'defuddle';

let readerContainer: HTMLElement | null = null;
let originalContent: HTMLElement | null = null;

interface ReaderState {
  isActive: boolean;
  content: string;
  title: string;
  author?: string;
  published?: string;
  site?: string;
}

const state: ReaderState = {
  isActive: false,
  content: '',
  title: ''
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'TOGGLE_READER':
      toggleReader(message.payload.activate);
      sendResponse({ success: true });
      break;
    case 'UPDATE_SETTINGS':
      applySettings(message.payload);
      sendResponse({ success: true });
      break;
    case 'GET_CONTENT':
      sendResponse({ 
        content: state.content, 
        title: state.title,
        author: state.author,
        published: state.published
      });
      break;
  }
  return true;
});

async function toggleReader(activate: boolean) {
  if (activate) {
    await enableReader();
  } else {
    disableReader();
  }
  state.isActive = activate;
}

async function enableReader() {
  try {
    const defuddle = new Defuddle(document);
    const result = defuddle.parse();
    
    state.content = result.content;
    state.title = result.title;
    state.author = result.author;
    state.published = result.published;
    state.site = result.site;
    
    originalContent = document.body.cloneNode(true) as HTMLElement;
    
    renderReaderView(result);
  } catch (error) {
    console.error('Reader View: Failed to parse page', error);
  }
}

function disableReader() {
  if (originalContent && readerContainer) {
    document.body.innerHTML = originalContent.innerHTML;
    readerContainer = null;
  }
}

function renderReaderView(result: DefuddleResult) {
  readerContainer = createReaderContainer(result);
  document.body.innerHTML = '';
  document.body.appendChild(readerContainer);
}
```

### 5.4 Popup（弹出面板）

```html
<!-- popup.html -->
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div class="popup-container">
    <header>
      <h1>Reader View</h1>
    </header>
    
    <section class="settings">
      <div class="setting-group">
        <label>主题</label>
        <div class="theme-buttons">
          <button data-theme="light" class="theme-btn">亮色</button>
          <button data-theme="dark" class="theme-btn">暗色</button>
          <button data-theme="sepia" class="theme-btn">护眼</button>
        </div>
      </div>
      
      <div class="setting-group">
        <label>字体大小</label>
        <input type="range" id="font-size" min="14" max="24" value="18">
        <span id="font-size-value">18px</span>
      </div>
      
      <div class="setting-group">
        <label>字体样式</label>
        <select id="font-family">
          <option value="serif">衬线</option>
          <option value="sans-serif">无衬线</option>
          <option value="monospace">等宽</option>
        </select>
      </div>
      
      <div class="setting-group">
        <label>显示图片</label>
        <input type="checkbox" id="show-images" checked>
      </div>
    </section>
    
    <footer>
      <button id="copy-markdown">复制 Markdown</button>
      <button id="copy-html">复制 HTML</button>
    </footer>
  </div>
  <script src="popup.js"></script>
</body>
</html>
```

```typescript
// popup.ts

import TurndownService from 'turndown';

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  setupEventListeners();
});

async function loadSettings() {
  const { settings } = await chrome.storage.sync.get('settings');
  if (settings) {
    applySettingsToUI(settings);
  }
}

function setupEventListeners() {
  // Theme buttons
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.getAttribute('data-theme');
      updateSetting('theme', theme);
    });
  });
  
  // Font size slider
  const fontSizeSlider = document.getElementById('font-size') as HTMLInputElement;
  fontSizeSlider.addEventListener('input', () => {
    updateSetting('fontSize', parseInt(fontSizeSlider.value));
  });
  
  // Copy buttons
  document.getElementById('copy-markdown')?.addEventListener('click', copyMarkdown);
  document.getElementById('copy-html')?.addEventListener('click', copyHTML);
}

async function copyMarkdown() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.id) return;
  
  const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_CONTENT' });
  if (response.content) {
    const turndown = new TurndownService();
    const markdown = turndown.turndown(response.content);
    await navigator.clipboard.writeText(markdown);
    showNotification('Markdown 已复制');
  }
}

async function copyHTML() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.id) return;
  
  const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_CONTENT' });
  if (response.content) {
    await navigator.clipboard.writeText(response.content);
    showNotification('HTML 已复制');
  }
}

function updateSetting(key: string, value: any) {
  chrome.storage.sync.get('settings', (data) => {
    const settings = { ...data.settings, [key]: value };
    chrome.storage.sync.set({ settings });
    
    // Notify content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'UPDATE_SETTINGS',
          payload: settings
        });
      }
    });
  });
}
```

### 5.5 Reader View（阅读视图）

```typescript
// reader.ts

interface ReaderViewOptions {
  content: string;
  title: string;
  author?: string;
  published?: string;
  site?: string;
}

export function createReaderContainer(options: ReaderViewOptions): HTMLElement {
  const container = document.createElement('div');
  container.id = 'reader-view-container';
  
  container.innerHTML = `
    <header class="reader-header">
      <div class="toolbar">
        <button id="close-reader" title="退出阅读模式">✕</button>
        <div class="toolbar-divider"></div>
        <select id="theme-select">
          <option value="light">亮色</option>
          <option value="dark">暗色</option>
          <option value="sepia">护眼</option>
        </select>
        <button id="decrease-font" title="减小字体">A-</button>
        <button id="increase-font" title="增大字体">A+</button>
        <button id="toggle-images" title="切换图片">图片</button>
        <div class="toolbar-divider"></div>
        <button id="copy-md" title="复制 Markdown">MD</button>
        <button id="copy-html" title="复制 HTML">HTML</button>
      </div>
    </header>
    
    <article class="reader-content">
      <h1 class="reader-title">${escapeHtml(options.title)}</h1>
      <div class="reader-meta">
        ${options.author ? `<span class="author">${escapeHtml(options.author)}</span>` : ''}
        ${options.site ? `<span class="site">${escapeHtml(options.site)}</span>` : ''}
        ${options.published ? `<span class="date">${escapeHtml(options.published)}</span>` : ''}
      </div>
      <div class="reader-body">${options.content}</div>
    </article>
  `;
  
  setupToolbarListeners(container);
  loadAndApplySettings(container);
  
  return container;
}

function setupToolbarListeners(container: HTMLElement) {
  container.querySelector('#close-reader')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'TOGGLE_READER', payload: { activate: false } });
  });
  
  container.querySelector('#theme-select')?.addEventListener('change', (e) => {
    const theme = (e.target as HTMLSelectElement).value;
    applyTheme(theme);
    saveSettings({ theme });
  });
  
  container.querySelector('#decrease-font')?.addEventListener('click', () => {
    adjustFontSize(-2);
  });
  
  container.querySelector('#increase-font')?.addEventListener('click', () => {
    adjustFontSize(2);
  });
  
  container.querySelector('#toggle-images')?.addEventListener('click', () => {
    toggleImages();
  });
  
  container.querySelector('#copy-md')?.addEventListener('click', copyMarkdown);
  container.querySelector('#copy-html')?.addEventListener('click', copyHTML);
}

function applyTheme(theme: string) {
  document.documentElement.setAttribute('data-theme', theme);
}
```

### 5.6 Defuddle 集成

Defuddle 需要打包进 content script。由于 Defuddle 是 ESM 模块，需要通过 Webpack 打包。

```javascript
// webpack.config.js
const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: {
    background: './src/background.ts',
    content: './src/content.ts',
    popup: './src/popup.ts',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'public', to: '.' },
        { from: 'src/reader/reader.css', to: 'reader.css' },
      ],
    }),
  ],
};
```

---

## 6. 用户体验流程

### 6.1 安装

```
+-------------------+
|  Chrome Web Store |
|  或 Edge Add-ons  |
+---------+---------+
          |
          | 点击"添加到 Chrome/Edge"
          v
+-------------------+
|  扩展安装完成     |
|  图标出现在工具栏 |
+-------------------+
```

### 6.2 开启阅读模式

```
+-------------------+                    +-------------------+
|  用户浏览网页     |                    |  点击扩展图标     |
|  如: 新闻文章     |                    |  或按 Alt+R       |
+---------+---------+                    +---------+---------+
          |                                        |
          | 页面加载完成                            v
          |                              +-------------------+
          +----------------------------->|  Content Script   |
                                         |  调用 Defuddle    |
                                         +---------+---------+
                                                   |
                                                   | 提取内容
                                                   v
                                         +-------------------+
                                         |  渲染阅读视图     |
                                         |  显示工具栏       |
                                         +-------------------+
```

### 6.3 工具栏操作

阅读模式下，顶部固定工具栏：

```
┌─────────────────────────────────────────────────────────────────┐
│ [✕] | [主题 ▼] | [A-] [A+] | [图片] | [MD] [HTML]              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                        文章标题                                  │
│                  作者 · 网站 · 日期                              │
│  ─────────────────────────────────                              │
│                                                                 │
│                        正文内容...                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 6.4 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Alt+R` | 切换阅读模式 |
| `Esc` | 退出阅读模式（阅读模式内） |

---

## 7. 主题与样式

使用 CSS 变量定义主题：

```css
/* reader.css */

:root {
  --reader-font-size: 18px;
  --reader-line-height: 1.8;
  --reader-content-width: 700px;
  --reader-font-family: Georgia, serif;
}

/* Light Theme (Default) */
:root,
[data-theme="light"] {
  --reader-bg-color: #ffffff;
  --reader-text-color: #1a1a1a;
  --reader-meta-color: #666666;
  --reader-border-color: #e0e0e0;
}

/* Dark Theme */
[data-theme="dark"] {
  --reader-bg-color: #1a1a1a;
  --reader-text-color: #e0e0e0;
  --reader-meta-color: #999999;
  --reader-border-color: #333333;
}

/* Sepia Theme */
[data-theme="sepia"] {
  --reader-bg-color: #f4ecd8;
  --reader-text-color: #5c4b37;
  --reader-meta-color: #8b7355;
  --reader-border-color: #d4c4a8;
}

#reader-view-container {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--reader-bg-color);
  color: var(--reader-text-color);
  font-size: var(--reader-font-size);
  line-height: var(--reader-line-height);
  font-family: var(--reader-font-family);
  overflow-y: auto;
  z-index: 2147483647;
}

.reader-header {
  position: sticky;
  top: 0;
  background: var(--reader-bg-color);
  border-bottom: 1px solid var(--reader-border-color);
  padding: 10px 20px;
  z-index: 10;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: var(--reader-content-width);
  margin: 0 auto;
}

.reader-content {
  max-width: var(--reader-content-width);
  margin: 0 auto;
  padding: 40px 20px;
}

.reader-title {
  font-size: 2em;
  margin-bottom: 0.5em;
}

.reader-meta {
  color: var(--reader-meta-color);
  font-size: 0.9em;
  margin-bottom: 2em;
}

.reader-meta span {
  margin-right: 1em;
}

.reader-body {
  margin-top: 2em;
}

.reader-body img {
  max-width: 100%;
  height: auto;
}

.reader-body a {
  color: inherit;
  text-decoration: underline;
}

.reader-body pre,
.reader-body code {
  font-family: 'SF Mono', Monaco, Consolas, monospace;
  background: var(--reader-border-color);
  padding: 2px 6px;
  border-radius: 4px;
}

.reader-body pre {
  padding: 16px;
  overflow-x: auto;
}

.reader-body blockquote {
  border-left: 3px solid var(--reader-border-color);
  margin-left: 0;
  padding-left: 1.5em;
  color: var(--reader-meta-color);
}
```

---

## 8. 实现规划

### 8.1 目录结构

```
reader-view/
├── src/
│   ├── background.ts           # Service Worker
│   ├── content.ts              # 内容脚本入口
│   ├── popup/
│   │   ├── popup.ts
│   │   ├── popup.html
│   │   └── popup.css
│   ├── reader/
│   │   ├── reader.ts           # 阅读视图组件
│   │   └── reader.css          # 阅读视图样式
│   ├── lib/
│   │   ├── defuddle.ts         # Defuddle 封装
│   │   ├── markdown.ts         # Markdown 转换
│   │   └── storage.ts          # 存储封装
│   └── types/
│       └── index.ts            # 类型定义
├── public/
│   ├── manifest.json
│   └── icons/
│       ├── icon-16.png
│       ├── icon-48.png
│       ├── icon-128.png
│       └── icon-active-48.png
├── dist/                       # 构建输出
├── package.json
├── tsconfig.json
├── webpack.config.js
└── README.md
```

### 8.2 实现步骤

| 步骤 | 任务 | 依赖 | 验证方式 |
|------|------|------|----------|
| 1 | 项目初始化 + TypeScript + Webpack 配置 | 无 | `npm run build` 成功 |
| 2 | manifest.json + 基础目录结构 | 步骤 1 | 扩展可加载到浏览器 |
| 3 | Background Service Worker | 步骤 2 | 点击图标可触发消息 |
| 4 | Content Script + Defuddle 集成 | 步骤 3 | 可解析页面内容 |
| 5 | Reader View 渲染 | 步骤 4 | 可显示阅读视图 |
| 6 | CSS 主题系统 | 步骤 5 | 主题切换正常 |
| 7 | 存储层实现 | 步骤 5 | 设置可持久化 |
| 8 | Popup 设置面板 | 步骤 7 | 设置面板可用 |
| 9 | Markdown/HTML 复制 | 步骤 4 | 复制功能正常 |
| 10 | 快捷键支持 | 步骤 5 | Alt+R 可用 |
| 11 | 图标状态指示 | 步骤 5 | 激活时图标变化 |
| 12 | 完整测试 + Bug 修复 | 步骤 1-11 | 所有功能正常 |

### 8.3 测试要点

| 测试项 | 测试方法 | 验证标准 |
|--------|----------|----------|
| 基础解析 | 在新闻网站点击图标 | 正确提取正文 |
| 复杂页面 | 在 Medium、知乎等测试 | 内容提取准确 |
| 主题切换 | 切换三种主题 | 样式正确应用 |
| 字体调整 | 调整字体大小 | 实时生效 |
| 图片开关 | 切换图片显示 | 图片正确显示/隐藏 |
| 复制 Markdown | 点击 MD 按钮 | 剪贴板内容正确 |
| 复制 HTML | 点击 HTML 按钮 | 剪贴板内容正确 |
| 设置持久化 | 重启浏览器 | 设置保持 |
| 快捷键 | 按 Alt+R | 阅读模式切换 |
| ESC 退出 | 阅读模式内按 ESC | 退出阅读模式 |
| 页面导航 | 阅读模式内点击链接 | 新页面正常加载 |
| 多标签页 | 在多个标签页使用 | 状态独立正确 |

---

## 9. 发布与分发

### 9.1 构建命令

```json
// package.json scripts
{
  "scripts": {
    "build": "webpack --mode production",
    "dev": "webpack --mode development --watch",
    "package": "npm run build && zip -r reader-view.zip dist/"
  }
}
```

### 9.2 发布渠道

| 渠道 | 要求 | 费用 |
|------|------|------|
| Chrome Web Store | 开发者账号 | $5 一次性 |
| Edge Add-ons | 微软账号 | 免费 |
| Firefox Add-ons | Firefox 账号 | 免费 |

### 9.3 发布清单

- [ ] 图标配齐（16/48/128px）
- [ ] 描述文案准备
- [ ] 截图准备（至少 1280x800）
- [ ] 隐私政策（如果收集数据）
- [ ] 版本号更新

---

## 参考文献

1. [Defuddle - Extract the main content from web pages](https://github.com/kepano/defuddle)
2. [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/mv3/)
3. [Mozilla Readability](https://github.com/mozilla/readability)
4. [Turndown - HTML to Markdown converter](https://github.com/mixmark-io/turndown)

---

**文档版本**: 1.0
**更新日期**: 2026-02-21

**修订记录**：
- v1.0: 初始版本 — 完成背景与目标、总体设计、设计决策、架构设计、组件设计、用户体验流程、主题样式、实现规划、发布与分发等章节
