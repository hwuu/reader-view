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
  - [3.3 阅读视图渲染：为什么选 Shadow DOM 而非直接操作 DOM](#33-阅读视图渲染为什么选-shadow-dom-而非直接操作-dom)
  - [3.4 样式方案：为什么选 CSS 变量而非 CSS-in-JS](#34-样式方案为什么选-css-变量而非-css-in-js)
  - [3.5 构建工具：为什么选 Vite 而非 Webpack](#35-构建工具为什么选-vite-而非-webpack)
  - [3.6 注入方式：为什么选按需注入而非预注入](#36-注入方式为什么选按需注入而非预注入)
  - [3.7 安全：为什么需要 DOMPurify](#37-安全为什么需要-dompurify)
- [4. 架构设计](#4-架构设计)
  - [4.1 核心分层](#41-核心分层)
  - [4.2 消息通信](#42-消息通信)
  - [4.3 存储架构](#43-存储架构)
- [5. 组件设计](#5-组件设计)
  - [5.1 Manifest（扩展配置）](#51-manifest扩展配置)
  - [5.2 Background Service Worker](#52-background-service-worker)
  - [5.3 Content Script（内容脚本）](#53-content-script内容脚本)
  - [5.4 Reader View（阅读视图）](#54-reader-view阅读视图)
  - [5.5 Defuddle 集成](#55-defuddle-集成)
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
- [10. 测试指南](#10-测试指南)
  - [10.1 测试网站](#101-测试网站)
  - [10.2 测试清单](#102-测试清单)
  - [10.3 已知限制](#103-已知限制)
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

核心思路：**按需注入 Content Script + Defuddle 内容提取 + Shadow DOM 隔离渲染 + CSS 变量主题系统**。

```
+----------------------------------------------------------------------+
|                           用户浏览器                                  |
+----------------------------------------------------------------------+
|                                                                      |
|  +----------------------------------------------------------------+  |
|  |  Browser UI                                                    |  |
|  |  +------------------+                                          |  |
|  |  |  Extension Icon  |                                          |  |
|  |  |  (Toolbar)       |                                          |  |
|  |  |  • 点击切换      |                                          |  |
|  |  |  • 状态指示      |                                          |  |
|  |  +--------+---------+                                          |  |
|  |           |                                                    |  |
|  +-----------|----------------------------------------------------+  |
|              |                                                       |
|              v                                                       |
|  +----------------------------------------------------------------+  |
|  |  Background Service Worker                                     |  |
|  |  • 处理图标点击                                                 |  |
|  |  • 按需注入 Content Script                                     |  |
|  |  • 更新图标状态                                                 |  |
|  |  • URL 黑名单过滤                                              |  |
|  +-------------------------------+--------------------------------+  |
|                                  |                                   |
|                                  | chrome.scripting.executeScript    |
|                                  v                                   |
|  +----------------------------------------------------------------+  |
|  |  Content Script (按需注入到目标页面)                           |  |
|  |                                                                |  |
|  |  +----------------------------------------------------------+  |  |
|  |  |  Defuddle 内容提取 (defuddle/full)                       |  |  |
|  |  |  • 解析 DOM                                               |  |  |
|  |  |  • 提取正文内容 (HTML + Markdown)                         |  |  |
|  |  |  • 提取元数据（标题、作者、日期）                          |  |  |
|  |  +----------------------------------------------------------+  |  |
|  |                                                                |  |
|  |  +----------------------------------------------------------+  |  |
|  |  |  DOMPurify 内容消毒                                      |  |  |
|  |  |  • 过滤危险标签和属性                                     |  |  |
|  |  +----------------------------------------------------------+  |  |
|  |                                                                |  |
|  |  +----------------------------------------------------------+  |  |
|  |  |  Shadow DOM Host                                         |  |  |
|  |  |  +------------------------------------------------------+  |  |
|  |  |  |  Shadow Root (open)                                  |  |  |
|  |  |  |  • Reader View 渲染                                  |  |  |
|  |  |  |  • CSS 样式隔离                                      |  |  |
|  |  |  |  • 工具栏（主题/字体/导出/退出）                      |  |  |
|  |  |  +------------------------------------------------------+  |  |
|  |  +----------------------------------------------------------+  |  |
|  +----------------------------------------------------------------+  |
|                                                                      |
+----------------------------------------------------------------------+
```

关键设计决策：

| 决策 | 选择 | 核心理由 | 详见 |
|------|------|----------|------|
| 内容提取 | Defuddle（非 Readability） | 元数据丰富、内置 Markdown | [3.1](#31-内容提取为什么选-defuddle-而非-mozilla-readability) |
| 实现语言 | TypeScript | 类型安全、开发体验好 | [3.2](#32-实现语言为什么选-typescript-而非-javascript) |
| 渲染方式 | Shadow DOM 隔离 | CSS 隔离、不破坏原页面 | [3.3](#33-阅读视图渲染为什么选-shadow-dom-而非直接操作-dom) |
| 样式方案 | CSS 变量 | 轻量、主题切换简单 | [3.4](#34-样式方案为什么选-css-变量而非-css-in-js) |
| 构建工具 | Vite | 配置简单、构建快 | [3.5](#35-构建工具为什么选-vite-而非-webpack) |
| 注入方式 | 按需注入 | 权限最小化、节省资源 | [3.6](#36-注入方式为什么选按需注入而非预注入) |
| 安全 | DOMPurify | 防止 XSS | [3.7](#37-安全为什么需要-dompurify) |

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

### 3.3 阅读视图渲染：为什么选 Shadow DOM 而非直接操作 DOM

| 维度 | Shadow DOM 隔离 | 直接操作 DOM（cloneNode + innerHTML） |
|------|-----------------|---------------------------------------|
| CSS 隔离 | 天然隔离，不受原页面样式影响 | 需要手动处理，原页面全局 CSS 可能渗透 |
| 原页面状态 | 完整保留（DOM、事件监听、JS 状态） | 全部丢失（SPA 页面直接废掉） |
| 动态元素干扰 | 不受影响，渲染在 shadow 内 | 原页面 JS 动态追加的元素会干扰 |
| Ctrl+F 搜索 | 正常（Chromium 127+，open mode） | 正常 |
| 实现复杂度 | 中（样式需通过 `<style>` 标签注入） | 低 |

**决策**：选择 Shadow DOM 隔离。

**理由**：
1. CSS 天然隔离，不需要处理与原页面的样式冲突
2. 原页面 DOM 完全不动，事件监听和 JS 状态全部保留
3. 退出阅读模式只需移除 shadow host，干净利落

**实现方式**：
- 进入阅读模式：在 `document.body` 上 append 一个 shadow host 元素，通过 `attachShadow({ mode: 'open' })` 创建 shadow root，reader view 渲染在 shadow root 内
- 退出阅读模式：移除 shadow host 元素即可

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

### 3.5 构建工具：为什么选 Vite 而非 Webpack

| 维度 | Vite | Webpack |
|------|------|---------|
| 配置复杂度 | 低（开箱即用 TS 支持） | 高（需手动配 ts-loader、CopyPlugin 等） |
| 构建速度 | 极快（esbuild 预构建） | 较慢 |
| 浏览器扩展支持 | `vite-plugin-web-extension` 自动处理 | 需要手动拼 manifest、多入口 |
| HMR 开发体验 | 原生支持 | 需要额外配置 |

**决策**：选择 Vite。

**理由**：
1. 项目轻量（无 Popup，只有 background + content script + CSS），Vite 配置简单匹配度高
2. 构建速度快，开发体验好
3. `vite-plugin-web-extension` 已成熟，自动处理扩展构建

### 3.6 注入方式：为什么选按需注入而非预注入

| 维度 | 按需注入 | 预注入（manifest content_scripts） |
|------|----------|-------------------------------------|
| 注入方式 | 用户触发时通过 `chrome.scripting.executeScript` 动态注入 | manifest 声明，页面加载时自动注入 |
| 资源消耗 | 仅在使用时加载 | 每个页面都加载 JS |
| 权限需求 | `activeTab` + `scripting`，无需 `host_permissions` | 需要 `host_permissions: ["<all_urls>"]` |
| 用户信任 | 安装时无"读取所有网站数据"警告 | 安装时弹出权限警告 |

**决策**：选择按需注入。

**理由**：
1. 权限最小化，`activeTab` 只在用户主动点击时授权当前标签页
2. 不浪费资源，不使用阅读模式的页面不加载任何 JS
3. 无需 `host_permissions`，安装体验更友好

### 3.7 安全：为什么需要 DOMPurify

Defuddle 提取的 HTML 内容直接渲染到 reader view 中。虽然 Defuddle 会做 HTML 标准化，但不保证完全消毒——原页面中的恶意内容（如 `<img onerror="alert(1)">`）可能残留。Shadow DOM 只隔离样式，不阻止脚本执行。

**决策**：引入 DOMPurify（~15KB minified）。

**理由**：
1. 在渲染前对 Defuddle 输出的 HTML 进行消毒
2. 配置白名单保留正文需要的标签，去掉危险属性（`onerror`、`onclick` 等）
3. 安全相关不应依赖上游库的隐式保证

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
|  |  |  Toolbar (in Shadow DOM)                                 |  |  |
|  |  |  • 主题切换、字体调节、导出、退出                         |  |  |
|  |  +----------------------------------------------------------+  |  |
|  +----------------------------------------------------------------+  |
|                                                                      |
|  +----------------------------------------------------------------+  |
|  |  Logic Layer (逻辑层)                                          |  |
|  |  +----------------------------------------------------------+  |  |
|  |  |  Background Service Worker                               |  |  |
|  |  |  • 图标点击处理                                           |  |  |
|  |  |  • 按需注入 Content Script                                |  |  |
|  |  |  • URL 黑名单过滤                                        |  |  |
|  |  |  • 图标状态更新                                           |  |  |
|  |  +----------------------------------------------------------+  |  |
|  |  +----------------------------------------------------------+  |  |
|  |  |  Content Script Controller                               |  |  |
|  |  |  • 阅读模式开关（内部闭环）                               |  |  |
|  |  |  • Shadow DOM 管理                                       |  |  |
|  |  |  • 设置应用                                               |  |  |
|  |  |  • ESC 快捷键监听                                        |  |  |
|  |  +----------------------------------------------------------+  |  |
|  +----------------------------------------------------------------+  |
|                                                                      |
|  +----------------------------------------------------------------+  |
|  |  Content Layer (内容层)                                        |  |
|  |  +----------------------------------------------------------+  |  |
|  |  |  Defuddle Engine (defuddle/full)                         |  |  |
|  |  |  • DOM 解析                                               |  |  |
|  |  |  • 内容提取 (HTML + Markdown)                             |  |  |
|  |  |  • 元数据提取                                             |  |  |
|  |  +----------------------------------------------------------+  |  |
|  |  +----------------------------------------------------------+  |  |
|  |  |  DOMPurify                                               |  |  |
|  |  |  • HTML 内容消毒                                          |  |  |
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
|  Extension Icon  |                    |  Background      |
|  (用户点击)      |                    |  Service Worker   |
|                  |  chrome.action     |                  |
|                  |--onClicked-------->|  1. URL 黑名单   |
|                  |                    |     过滤         |
+------------------+                    |  2. 按需注入     |
                                        |     Content Script|
                                        +--------+---------+
                                                 |
                                                 | chrome.scripting
                                                 |   .executeScript
                                                 v
                                        +------------------+
                                        |  Content Script  |
                                        |                  |
                                        |  • 解析内容      |
                                        |  • 渲染/移除     |
                                        |    Shadow DOM    |
                                        |  • 通知 BG 更新  |
                                        |    图标状态      |
                                        +------------------+
```

消息流说明：
- **进入阅读模式**：用户点击图标 → Background 检查 URL → 注入 Content Script → Content Script 解析内容、创建 Shadow DOM → 通知 Background 更新图标为激活态
- **退出阅读模式**：用户点击关闭按钮或按 ESC → Content Script 直接移除 Shadow DOM → 通知 Background 更新图标为默认态
- **设置变更**：Content Script 内的 toolbar 操作 → 直接修改 Shadow DOM 内样式 + 写入 `chrome.storage.sync`

**消息类型定义：**

```typescript
// Content Script -> Background
type MessageType =
  | 'READER_STATE_CHANGED';  // 通知 Background 更新图标状态

interface Message {
  type: MessageType;
  payload?: {
    isActive: boolean;
  };
}

// Background -> Content Script (通过 chrome.tabs.sendMessage)
type CommandType =
  | 'TOGGLE_READER';         // 切换阅读模式

interface Command {
  type: CommandType;
}

interface Response {
  success: boolean;
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
    "scripting"
  ],
  "background": {
    "service_worker": "src/background.js",
    "type": "module"
  },
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

与原版的关键差异：
- 去掉 `host_permissions`（不需要 `<all_urls>`）
- 去掉 `content_scripts`（改为按需注入）
- 去掉 `clipboardWrite`（现代浏览器 `navigator.clipboard.writeText` 不需要此权限）
- 增加 `scripting` 权限（用于 `chrome.scripting.executeScript`）
- 去掉 `action.default_popup`（无 Popup）

### 5.2 Background Service Worker

Background 不维护任何状态（无 `Map`），只做事件响应。Service Worker 被浏览器回收后重启不影响功能。

```typescript
// background.ts

const BLOCKED_URL_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'about:',
  'file://',
  'edge://',
  'devtools://',
];

function isBlockedUrl(url: string): boolean {
  return BLOCKED_URL_PREFIXES.some(prefix => url.startsWith(prefix));
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) return;

  // URL 黑名单过滤
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
    // 注入后发送切换消息
    // content script 在顶层同步注册消息监听器，executeScript 完成后即可接收消息
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
```

### 5.3 Content Script（内容脚本）

Content Script 按需注入，内部管理阅读模式的完整生命周期。退出逻辑在 content script 内部闭环，不依赖 background 转发。

关键实现细节：消息监听器在模块顶层同步注册，确保 `executeScript` 完成后 background 立即可以发送消息，避免竞态。

```typescript
// content.ts

import Defuddle from 'defuddle/full';
import DOMPurify from 'dompurify';
import { createReaderContainer } from './reader/reader';
import readerCSS from './reader/reader.css?inline';

let isActive = false;
let shadowHost: HTMLElement | null = null;

// 解析结果缓存
let parsedContent = '';
let parsedMarkdown = '';
let parsedTitle = '';
let parsedAuthor: string | undefined;
let parsedPublished: string | undefined;
let parsedSite: string | undefined;

// DOMPurify 白名单配置
const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
    'a', 'img', 'figure', 'figcaption',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'strong', 'em', 'b', 'i', 'u', 's', 'del',
    'br', 'hr', 'div', 'span',
    'sup', 'sub', 'abbr', 'mark',
    'dl', 'dt', 'dd', 'details', 'summary',
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
  document.documentElement.style.overflow = '';
  isActive = false;
  notifyStateChanged(false);
}

async function renderReaderView() {
  // 创建 Shadow DOM host
  shadowHost = document.createElement('reader-view-host');
  shadowHost.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483647;';

  const shadowRoot = shadowHost.attachShadow({ mode: 'open' });

  // CSS 通过 Vite 的 ?inline 导入为字符串，注入 <style> 标签到 Shadow DOM
  const style = document.createElement('style');
  style.textContent = readerCSS;
  shadowRoot.appendChild(style);

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

function notifyStateChanged(isActive: boolean) {
  chrome.runtime.sendMessage({
    type: 'READER_STATE_CHANGED',
    payload: { isActive },
  });
}
```

### 5.4 Reader View（阅读视图）

所有设置和导出功能集中在阅读模式内的 toolbar，无独立 Popup。`createReaderContainer` 是 async 函数，内部加载已保存的设置并应用。

v1.0 暴露的设置项：主题、字体大小、图片开关。`fontFamily`、`lineHeight`、`contentWidth` 已在 Settings 接口中定义并支持持久化，但 v1.0 不暴露 UI 入口，后续版本按需添加。

```typescript
// reader.ts

import { loadSettings, saveSettings, type Settings } from '../lib/storage';

interface ReaderViewOptions {
  content: string;           // 已经过 DOMPurify 消毒的 HTML
  contentMarkdown: string;   // Defuddle 内置 Markdown 输出
  title: string;
  author?: string;
  published?: string;
  site?: string;
  onClose: () => void;       // 退出回调，由 content.ts 的 disableReader 传入
}

export async function createReaderContainer(options: ReaderViewOptions): Promise<HTMLElement> {
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

  const settings = await loadSettings();
  applySettings(container, settings);
  setupToolbarListeners(container, options, settings);

  return container;
}

function setupToolbarListeners(container: HTMLElement, options: ReaderViewOptions, settings: Settings) {
  let currentSettings = { ...settings };

  // 退出按钮 —— 通过 onClose 回调闭环
  container.querySelector('#close-reader')?.addEventListener('click', options.onClose);

  container.querySelector('#theme-select')?.addEventListener('change', async (e) => {
    const theme = (e.target as HTMLSelectElement).value as Settings['theme'];
    container.setAttribute('data-theme', theme);
    currentSettings = await saveSettings({ theme });
  });

  container.querySelector('#decrease-font')?.addEventListener('click', async () => {
    const newSize = Math.max(14, currentSettings.fontSize - 2);
    container.style.setProperty('--reader-font-size', `${newSize}px`);
    currentSettings = await saveSettings({ fontSize: newSize });
  });

  container.querySelector('#increase-font')?.addEventListener('click', async () => {
    const newSize = Math.min(24, currentSettings.fontSize + 2);
    container.style.setProperty('--reader-font-size', `${newSize}px`);
    currentSettings = await saveSettings({ fontSize: newSize });
  });

  container.querySelector('#toggle-images')?.addEventListener('click', async () => {
    const show = !currentSettings.showImages;
    container.classList.toggle('hide-images', !show);
    currentSettings = await saveSettings({ showImages: show });
  });

  // 复制 Markdown —— 直接使用 Defuddle 内置输出
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
```

### 5.5 Defuddle 集成

使用 `defuddle/full` bundle（包含 Markdown 支持），通过 Vite 打包进 content script。

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import webExtension from 'vite-plugin-web-extension';

export default defineConfig({
  plugins: [
    webExtension({
      additionalInputs: ['src/content.ts'],
    }),
  ],
  build: {
    outDir: 'dist',
  },
  esbuild: {
    charset: 'ascii',  // 避免非 ASCII 字符导致 Chrome executeScript 报 UTF-8 编码错误
  },
});
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
          |                              |  Background       |
          |                              |  1. URL 黑名单    |
          |                              |     过滤          |
          |                              |  2. 按需注入      |
          |                              |     Content Script|
          |                              +---------+---------+
          |                                        |
          +----------------------------------------+
                                                   |
                                                   v
                                         +-------------------+
                                         |  Content Script   |
                                         |  1. Defuddle 解析 |
                                         |  2. DOMPurify     |
                                         |     消毒          |
                                         |  3. 创建 Shadow   |
                                         |     DOM           |
                                         |  4. 渲染阅读视图  |
                                         +---------+---------+
                                                   |
                                                   v
                                         +-------------------+
                                         |  通知 Background  |
                                         |  更新图标为激活态 |
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

使用 CSS 变量定义主题。由于采用 Shadow DOM，所有样式定义在 shadow root 内，天然与原页面隔离，CSS 变量作用域限定在 `#reader-view-container` 上。

```css
/* reader.css — 注入到 Shadow DOM 内 */

#reader-view-container {
  --reader-font-size: 18px;
  --reader-line-height: 1.8;
  --reader-content-width: 700px;
  --reader-font-family: Georgia, serif;
}

/* Light Theme (Default) */
#reader-view-container,
#reader-view-container[data-theme="light"] {
  --reader-bg-color: #ffffff;
  --reader-text-color: #1a1a1a;
  --reader-meta-color: #666666;
  --reader-border-color: #e0e0e0;
}

/* Dark Theme */
#reader-view-container[data-theme="dark"] {
  --reader-bg-color: #1a1a1a;
  --reader-text-color: #e0e0e0;
  --reader-meta-color: #999999;
  --reader-border-color: #333333;
}

/* Sepia Theme */
#reader-view-container[data-theme="sepia"] {
  --reader-bg-color: #f4ecd8;
  --reader-text-color: #5c4b37;
  --reader-meta-color: #8b7355;
  --reader-border-color: #d4c4a8;
}

#reader-view-container {
  background-color: var(--reader-bg-color);
  color: var(--reader-text-color);
  font-size: var(--reader-font-size);
  line-height: var(--reader-line-height);
  font-family: var(--reader-font-family);
  width: 100%;
  height: 100%;
  overflow-y: auto;
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
  color: var(--reader-link-color);
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
│   ├── reader/
│   │   ├── reader.ts           # 阅读视图组件
│   │   └── reader.css          # 阅读视图样式（注入 Shadow DOM）
│   └── lib/
│       └── storage.ts          # 存储封装
├── public/
│   └── icons/
│       ├── icon-16.png
│       ├── icon-48.png
│       ├── icon-128.png
│       ├── icon-active-16.png
│       ├── icon-active-48.png
│       └── icon-active-128.png
├── dist/                       # 构建输出
├── manifest.json               # 扩展配置（根目录）
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

### 8.2 实现步骤

| 步骤 | 任务 | 依赖 | 验证方式 |
|------|------|------|----------|
| 1 | 项目初始化 + TypeScript + Vite 配置 | 无 | `npm run build` 成功 |
| 2 | manifest.json + 基础目录结构 | 步骤 1 | 扩展可加载到浏览器 |
| 3 | Background Service Worker（图标点击 + URL 过滤 + 按需注入） | 步骤 2 | 点击图标可注入脚本 |
| 4 | Content Script + Defuddle 集成 + DOMPurify 消毒 | 步骤 3 | 可解析页面内容 |
| 5 | Shadow DOM + Reader View 渲染 | 步骤 4 | 可显示阅读视图，原页面状态保留 |
| 6 | CSS 主题系统（Shadow DOM 内） | 步骤 5 | 主题切换正常 |
| 7 | 存储层实现 | 步骤 5 | 设置可持久化 |
| 8 | Toolbar 设置功能（字体、图片开关等） | 步骤 7 | 设置面板可用 |
| 9 | Markdown/HTML 复制（Defuddle 内置 Markdown） | 步骤 4 | 复制功能正常 |
| 10 | ESC 退出 + 图标状态指示 | 步骤 5 | ESC/Alt+R 可用，图标状态正确 |
| 11 | 完整测试 + Bug 修复 | 步骤 1-10 | 所有功能正常 |

### 8.3 测试要点

| 测试项 | 测试方法 | 验证标准 |
|--------|----------|----------|
| 基础解析 | 在新闻网站点击图标 | 正确提取正文 |
| 复杂页面 | 在 Medium、知乎等测试 | 内容提取准确 |
| Shadow DOM 隔离 | 在 CSS 复杂的页面测试 | 阅读视图样式不受原页面影响 |
| 原页面状态保留 | 在 SPA 页面（如 React 应用）退出阅读模式 | 原页面功能正常，事件监听未丢失 |
| 主题切换 | 切换三种主题 | 样式正确应用 |
| 字体调整 | 调整字体大小 | 实时生效 |
| 图片开关 | 切换图片显示 | 图片正确显示/隐藏 |
| 复制 Markdown | 点击 MD 按钮 | 剪贴板内容正确（Defuddle 内置输出） |
| 复制 HTML | 点击 HTML 按钮 | 剪贴板内容正确（经 DOMPurify 消毒） |
| XSS 防护 | 构造含 `onerror` 等属性的页面 | 恶意属性被 DOMPurify 过滤 |
| 设置持久化 | 重启浏览器 | 设置保持 |
| 快捷键 | 按 Alt+R | 阅读模式切换 |
| ESC 退出 | 阅读模式内按 ESC | 退出阅读模式 |
| URL 黑名单 | 在 chrome://、about:blank 等页面点击图标 | 不注入，无报错 |
| 按需注入 | 首次点击图标 | Content Script 正确注入并执行 |
| 页面导航 | 阅读模式内点击链接 | 新页面正常加载 |
| 多标签页 | 在多个标签页使用 | 状态独立正确 |
| Ctrl+F 搜索 | 阅读模式内使用浏览器搜索 | 可搜索到阅读视图内容 |

---

## 9. 发布与分发

### 9.1 构建命令

构建产物输出到 `dist/` 目录，可直接加载到浏览器。

```json
// package.json scripts
{
  "scripts": {
    "build": "vite build",
    "dev": "vite build --watch",
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

## 10. 测试指南

### 10.1 测试网站

覆盖不同页面结构，确保兼容性。

**新闻/博客类**

| 网站 | 特点 |
|------|------|
| https://www.cnblogs.com | 中文博客，简单排版 |
| https://juejin.cn | 技术博客，代码块多 |
| https://zhuanlan.zhihu.com | 中文长文，图文混排 |
| https://medium.com | 英文博客，标准排版 |
| https://dev.to | 英文技术博客，Markdown 渲染 |

**技术文档类**

| 网站 | 特点 |
|------|------|
| https://developer.mozilla.org | 多级标题、代码示例、表格 |
| https://docs.github.com | 侧边栏导航、代码块 |

**长文/复杂排版**

| 网站 | 特点 |
|------|------|
| https://www.nytimes.com | 大图、视频占位、广告多 |
| https://en.wikipedia.org | 表格、引用、脚注、目录 |

### 10.2 测试清单

每个网站检查以下项目：

| # | 检查项 | 预期结果 |
|---|--------|----------|
| 1 | 正文提取 | 完整提取，无丢段落、丢图片 |
| 2 | 元信息识别 | 标题/作者/日期正确显示 |
| 3 | 主题切换 | 亮色/暗色/护眼三套主题正常切换 |
| 4 | 字体大小 | A-/A+ 调节生效，范围 14-24px |
| 5 | 图片开关 | 点击后图片隐藏/显示，按钮文字同步 |
| 6 | 复制 Markdown | 内容正确，toast 提示显示 |
| 7 | 复制 HTML | 内容正确，toast 提示显示 |
| 8 | 退出恢复 | ESC/关闭按钮退出后，原页面滚动位置和滚动条恢复 |
| 9 | 图标状态 | 开启时蓝色，关闭时灰色 |
| 10 | 再次开启 | 退出后再次点击图标，阅读模式正常开启 |

---

### 10.3 已知限制

| 限制 | 说明 | 计划 |
|------|------|------|
| SPA 页面 | 在 SPA 页面导航后点击阅读模式，DOM 可能尚未更新完成，Defuddle 可能提取到不完整内容 | 后续版本考虑 MutationObserver 等待 DOM 稳定 |
| 错误提示 | 解析失败或空内容时仅 console 输出，用户无可见反馈 | 后续版本添加 toast 提示 |
| 无障碍 | v1.0 未添加 ARIA 标签和屏幕阅读器支持 | 后续版本补充 |
| 自动化测试 | v1.0 仅手动测试，无单元测试或 E2E 测试 | 后续版本引入 Vitest + Chrome Extension Testing |

---

## 参考文献

- [Defuddle - Extract the main content from web pages](https://github.com/kepano/defuddle)
- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/mv3/)
- [Mozilla Readability](https://github.com/mozilla/readability)
- [DOMPurify - DOM-only XSS sanitizer](https://github.com/cure53/DOMPurify)
- [vite-plugin-web-extension](https://github.com/nicedoc/vite-plugin-web-extension)

---

**文档版本**: 1.3
**更新日期**: 2026-02-24

**修订记录**：
- v1.3 (2026-02-24): 同步代码示例与实际实现（修正文件路径、CSS 注入方式、async 函数签名、onClose 回调、DOMPurify 白名单、updateIcon 完整路径、vite.config.ts 配置）；补充已知限制；补充设置项 UI 说明；修正目录结构和参考文献格式
- v1.2 (2026-02-24): 添加测试指南章节
- v1.1 (2026-02-21): Review 修订 — 按需注入替代预注入、Shadow DOM 隔离替代 cloneNode、去掉 Popup 集中到 toolbar、Vite 替代 Webpack、DOMPurify 消毒、Defuddle/full 内置 Markdown 替代 Turndown、Background 去状态化、URL 黑名单过滤、ESC 退出支持（详见 `docs/v1.0-review.md`）
- v1.0 (2026-02-21): 初始版本 — 完成背景与目标、总体设计、设计决策、架构设计、组件设计、用户体验流程、主题样式、实现规划、发布与分发等章节
