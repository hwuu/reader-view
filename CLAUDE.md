## 开发规范

### 流程控制

1. 方案讨论阶段不要修改代码，方案确定后才可以动手
2. 方案讨论需要双方都没疑问才输出具体方案文档
3. 严格按步骤执行，每次只专注当前步骤。不允许跨步骤实现或"顺便"完成其他任务。每步完成后汇报，等待 Review 确认后进入下一步
4. 没有我的明确指令不许 commit / push

### 方案设计

5. 方案评估主动思考需求边界，合理质疑方案完善性。方案需包含：重要逻辑的实现思路、按依赖关系拆解排序、修改/新增文件路径、测试要点
6. 遇到争议或不确定性主动告知我，让我决策而不是默认采用一种方案
7. 文档中流程框图文字用英文，框线要对齐；其余内容保持中文

### 编码规范

8. 最小改动原则，除非我主动要求优化或重构
9. 优先参考和复用现有代码风格，避免重复造轮子
10. 不要在源码中插入 mock 的硬编码数据
11. 使用中文回答
12. 同步更新相关文档

### 提交规范

13. 提交前先梳理内容，等待 Review 确认后才能提交
14. commit message 使用英文 conventional commits 格式
15. 每个 commit 必须添加 `Co-Authored-By` trailer：
    - OpenCode 实现：`Co-Authored-By: OpenCode (GLM-5) <noreply@opencode.ai>`
    - Claude Code 实现：Claude Code 默认

### Code Review

16. 完成一个编码步骤后，使用 OpenCode review 代码：

```
opencode run "<prompt>"
```

prompt 示例：

```
Claude Code 完成了编码工作，请你 review，看看是否符合设计、是否有潜在 bug、是否有不完善的地方、现有架构是否没有冲突、没有引入冗余实现。

设计：...

实现代码 (diff)：...
```

### 踩坑记录

17. 重试过 2 次以上的环境配置问题或重复犯错的问题，记录在本文件

---

## 环境配置备忘

### 常用命令

```bash
# 构建
npm run build

# 开发模式（手动在终端运行）
npm run dev
```

### 已知问题

1. **content.js UTF-8 编码报错**：DOMPurify 内含大量非 ASCII 字符，Chrome `executeScript` 拒绝加载。解决：`vite.config.ts` 中设置 `esbuild: { charset: 'ascii' }`，将非 ASCII 转义为 `\uXXXX`
2. **setIcon Failed to fetch**：Service Worker 中 `setIcon` 使用相对路径无法 fetch 图标文件。解决：改用 `chrome.runtime.getURL()` 获取完整路径
