# Reader View

一键开启阅读模式的 Chrome 扩展，基于 [Defuddle](https://github.com/nicholasgasior/defuddle) 提取网页正文，[DOMPurify](https://github.com/cure53/DOMPurify) 消毒 HTML，Shadow DOM 隔离渲染。

## 功能

- 点击图标或 `Alt+R` 切换阅读模式
- 三套主题：亮色 / 暗色 / 护眼
- 字体大小调节（14-24px）
- 图片显示开关
- 一键复制 Markdown / HTML
- ESC 退出阅读模式
- 设置自动保存，跨设备同步

## 开发

```bash
npm install
npm run build
```

构建产物在 `dist/` 目录。

## 安装

1. 打开 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `dist/` 目录

## 技术栈

- TypeScript + Vite
- Chrome Extension Manifest V3
- Defuddle（正文提取）
- DOMPurify（HTML 消毒）
- Shadow DOM（样式隔离）
- chrome.storage.sync（设置持久化）
