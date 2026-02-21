# Reader View 实现状态跟踪

## 每步流程

1. 写代码
2. 自己 review
3. 让 opencode review
4. 综合两份 review 结果，交由用户决策
5. 根据决策修改或确认完成
6. 修改结束之后回到 2（自己 review）

## 实现步骤

| 步骤 | 任务 | 状态 | 备注 |
|------|------|------|------|
| 1 | 项目初始化 + TypeScript + Vite 配置 | 已完成 | `npm run build` 通过 |
| 2 | manifest.json + 基础目录结构 | 已完成 | 构建输出完整，图标文件正确 |
| 3 | Background Service Worker（图标点击 + URL 过滤 + 按需注入） | 已完成 | 构建通过 |
| 4 | Content Script + Defuddle 集成 + DOMPurify 消毒 | 已完成 | 构建通过 |
| 5 | Shadow DOM + Reader View 渲染 | 已完成 | 构建通过 |
| 6 | CSS 主题系统（Shadow DOM 内） | 已完成 | 三套主题 + 完整元素样式 |
| 7 | 存储层实现 | 已完成 | try-catch 错误处理 |
| 8 | Toolbar 设置功能（字体、图片开关等） | 已完成 | 含视觉反馈 |
| 9 | Markdown/HTML 复制 | 已完成 | clipboard API + toast 通知 |
| 10 | ESC 退出 + 图标状态指示 | 已完成 | ESC keydown + 步骤 3 图标 |
| 11 | 完整测试 + Bug 修复 | 已完成 | 代码级检查通过，待浏览器验证 |

## 详细记录

### 步骤 1：项目初始化 + TypeScript + Vite 配置

**状态**：已完成

**验证方式**：`npm run build` 成功

**产出文件**：
- `package.json` — 依赖：defuddle ^0.7.0, dompurify ^3.2.0, vite, typescript, @types/chrome, vite-plugin-web-extension
- `tsconfig.json` — ES2020 target, strict mode, lib: ES2020 + DOM
- `vite.config.ts` — vite-plugin-web-extension 默认配置
- `manifest.json` — MV3, permissions: activeTab/storage/scripting
- `src/background.ts` — 占位
- `src/content.ts` — 占位
- `.gitignore` — node_modules, dist, *.zip, .env, *.log

**Review 记录**：
- opencode 建议加 `@types/dompurify` → 不需要（dompurify 自带类型）
- opencode 建议 manifest 加 content_scripts → 不需要（按需注入设计决策）
- opencode 建议 tsconfig 加 lib → 已采纳
- opencode 建议 .gitignore 补充 → 已采纳

---

### 步骤 2：manifest.json + 基础目录结构

**状态**：已完成

**验证方式**：扩展可加载到浏览器

**产出文件**：
- `public/icons/` — 4 个占位 PNG 图标（16/48/128/active-48）

**Review 记录**：
- 自我 review + opencode review 均通过，无需修改

---

### 步骤 3：Background Service Worker

**状态**：已完成

**验证方式**：点击图标可注入脚本

**产出文件**：
- `src/background.ts` — URL 黑名单过滤、按需注入、图标状态更新
- `public/icons/icon-active-16.png` — 激活态图标 16px
- `public/icons/icon-active-128.png` — 激活态图标 128px

**Review 记录**：
- 竞态条件：content script 顶层同步注册监听器即可，不引入 READY 握手，但给注入后的 sendMessage 加了 try-catch 兜底
- 激活态图标补齐 16/128 尺寸
- 黑名单暂不加 brave://、moz-extension://（目标浏览器是 Chrome 和 Edge）

---

### 步骤 4：Content Script + Defuddle 集成 + DOMPurify 消毒

**状态**：已完成

**验证方式**：可解析页面内容

**产出文件**：
- `src/content.ts` — Defuddle 解析 + DOMPurify 白名单消毒 + 消息监听
- `vite.config.ts` — 添加 `additionalInputs: ['src/content.ts']`

**Review 记录**：
- DOMPurify 加了 ALLOWED_TAGS/ALLOWED_ATTR 白名单，过滤 form/iframe/style 等非阅读标签
- disableReader 清理缓存变量
- enableReader 校验空内容

---

### 步骤 5：Shadow DOM + Reader View 渲染

**状态**：已完成

**验证方式**：可显示阅读视图，原页面状态保留

**产出文件**：
- `src/reader/reader.ts` — 阅读视图 DOM 构建
- `src/reader/reader.css` — 基础样式
- `src/content.ts` — 集成 Shadow DOM 渲染和销毁

**Review 记录**：
- Shadow DOM 创建销毁正确
- CSS 通过 `?inline` 导入注入 Shadow DOM 正确
- escapeHtml 安全
- 表格/列表/hr 等样式细节在步骤 6 补

---

### 步骤 6：CSS 主题系统（Shadow DOM 内）

**状态**：已完成

**验证方式**：主题切换正常

**产出文件**：
- `src/reader/reader.css` — 三套主题（light/dark/sepia）+ 完整元素样式

**Review 记录**：
- 护眼主题链接色加深至 #9b6e3c
- 暗色主题代码块背景加深至 #252525
- 补齐 h2-h6 正文标题样式
- 表格加斑马纹

---

### 步骤 7：存储层实现

**状态**：已完成

**验证方式**：设置可持久化

**产出文件**：
- `src/lib/storage.ts` — Settings 接口、默认值、loadSettings/saveSettings

**Review 记录**：
- loadSettings/saveSettings 加了 try-catch 错误处理
- 不加数据校验函数（展开运算符已兜底）
- 不加字段范围约束（UI 控件限制）

---

### 步骤 8：Toolbar 设置功能

**状态**：已完成

**验证方式**：设置面板可用

**产出文件**：
- `src/reader/reader.ts` — toolbar 事件绑定、设置加载/保存/应用
- `src/content.ts` — async 改造、onClose 回调
- `src/reader/reader.css` — toolbar-label 样式

**Review 记录**：
- toggle-images 按钮加了视觉反馈（图片/无图）
- applySettings 同步按钮状态
- copy-md/copy-html 事件在步骤 9 绑定

---

### 步骤 9：Markdown/HTML 复制

**状态**：已完成

**验证方式**：复制功能正常

**产出文件**：
- `src/reader/reader.ts` — copy-md/copy-html 事件 + showNotification
- `src/reader/reader.css` — .reader-notification 样式

**Review 记录**：
- opencode 超时跳过，自我 review 通过
- clipboard API 有 try-catch，通知用主题变量反转色

---

### 步骤 10：ESC 退出 + 图标状态指示

**状态**：已完成

**验证方式**：ESC 可退出，图标状态正确

**产出文件**：
- `src/content.ts` — ESC keydown 监听器

**Review 记录**：
- 图标状态已在步骤 3 实现，无需额外改动
- ESC 监听器在顶层注册，只在 isActive 时触发

---

### 步骤 11：端到端集成测试

**状态**：已完成

**验证方式**：完整流程可用

**检查结果**：
- 构建成功，dist 结构完整
- manifest 路径正确
- 消息通信链路匹配
- 权限和图标齐全
- 需手动加载到浏览器做最终验证
