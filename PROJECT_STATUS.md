# SocraticNovel Desktop — 项目状态文档

> 面向 AI 的上下文文档。用于在新会话中快速恢复项目状态。
> 最后更新：2026-07-26

---

## 项目简介

SocraticNovel Desktop 是一个桌面应用，让用户安装后就能使用 SocraticNovel 沉浸式 AI 教学系统。核心特点：

- **AI 驱动的苏格拉底教学**：AI 扮演轻小说角色，通过苏格拉底问答法教授学科知识
- **文件系统即状态**：15+ 个 Markdown 文件构成教学系统的持久状态（角色记忆、进度、故事线等）
- **Tool Use 架构**：AI 通过 tool_use API 读写本地文件，而非解析文本指令
- **完全本地**：数据不出用户电脑，用户自带 API Key

### 技术栈

| 组件 | 选型 |
|------|------|
| 桌面框架 | Tauri 2.0 (Rust 后端) |
| 前端 | React 19 + TypeScript + Tailwind CSS 4 |
| 状态管理 | Zustand |
| 路由 | React Router DOM |
| AI API | Claude Messages API (reqwest, 直接 HTTP) |
| 本地存储 | 文件系统 (workspaces) + macOS Keychain (API Key) |
| 渲染 | react-markdown + remark-math + rehype-katex + @tailwindcss/typography |

### 关键架构决策

1. **App 不硬编码加载逻辑**：CLAUDE.md 作为 system prompt 注入，AI 自己通过 read_file 决定读什么
2. **沙箱化文件访问**：所有文件操作限制在 workspace 目录内，路径验证防止目录穿越
3. **Tool-use 循环引擎**：用户消息 → Claude API → tool_call? → 执行 → 结果喂回 → 继续循环 → text? → 展示
4. **Tauri 事件系统**：Rust 后端通过 `app.emit()` 向前端推送 agent-event / canvas-event
5. **API Key 存储**：macOS Keychain（通过 `security` CLI 命令），不使用 Tauri Stronghold

---

## 项目位置

```
~/socratic-novel/           ← 项目根目录
├── src/                    ← 前端 (React + TS)
├── src-tauri/              ← 后端 (Rust)
├── package.json
├── tsconfig.json
├── vite.config.ts
└── PROJECT_STATUS.md       ← 本文件
```

### 架构设计文档

完整的产品和技术架构设计在：
```
~/Desktop/SocraticNovel_Desktop_Architecture.md
```
这份文档 (~1000+ 行) 包含：产品概述、分层架构、UI 设计、AI Agent Runtime 设计、复习模式设计、文件结构、数据库 Schema、开发路线图、已确认事项等。

---

## 文件结构

### 前端 (src/)

```
src/
├── App.tsx                     # 路由入口 (BrowserRouter)
├── App.css                     # Tailwind v4 入口 (@import "tailwindcss" + @plugin typography)
├── main.tsx                    # React 挂载点
├── pages/
│   ├── LandingPage.tsx         # 首页：自动初始化 workspace + API Key 检测 + 双卡片
│   ├── LessonPage.tsx          # 课堂：三栏布局 (导航|对话|白板)
│   └── SettingsPage.tsx        # 设置：API Key (Keychain) + 主题 + Workspace
├── components/
│   ├── chat/
│   │   ├── ChatMessageBubble.tsx  # Markdown/KaTeX 渲染 (react-markdown + remark-math + rehype-katex)
│   │   └── ChatInput.tsx          # 输入框 (Enter 发送, Shift+Enter 换行)
│   └── canvas/
│       └── CanvasPanel.tsx        # 白板面板 (SVG 渲染)
├── hooks/
│   └── useAiAgent.ts           # AI Agent hook (监听事件, 管理会话, Keychain API Key)
├── stores/
│   └── appStore.ts             # Zustand 全局状态 (session, messages, canvas, settings)
├── lib/
│   ├── tauri.ts                # Tauri IPC 封装 (文件系统 + workspace + Keychain)
│   └── ai.ts                   # AI 命令封装 (startSession, sendMessage, events)
└── types/
    └── index.ts                # TypeScript 类型定义
```

### 后端 (src-tauri/src/)

```
src-tauri/src/
├── main.rs                     # 入口
├── lib.rs                      # Tauri Builder 配置 (插件, 命令注册, 状态管理)
├── commands/
│   ├── mod.rs                  # 模块导出
│   ├── fs_commands.rs          # 文件系统命令 (沙箱化) + workspace 管理
│   │   ├── read_file, write_file, append_file, list_files, search_file
│   │   ├── list_workspaces, create_workspace
│   │   └── init_builtin_workspace  # 从 ~/AP_Physics_EM 复制 1.3MB MD 文件
│   ├── ai_commands.rs          # AI 会话命令
│   │   ├── start_ai_session    # 初始化会话 (设 system prompt + workspace)
│   │   ├── send_chat_message   # 发送消息 (触发 agent loop)
│   │   └── get_conversation_history
│   └── settings_commands.rs    # macOS Keychain 命令
│       ├── set_api_key, get_api_key, has_api_key, delete_api_key
│       └── (通过 `security` CLI 操作 Keychain)
└── ai/
    ├── mod.rs                  # 模块导出
    ├── types.rs                # Claude API 类型定义
    ├── claude.rs               # Claude API 客户端 (非流式 + 流式)
    ├── tools.rs                # 6 个工具定义 + 执行器
    └── runtime.rs              # Agent 循环引擎 (最多 20 轮)
```

---

## 已完成 (Phase 1 — 8/9)

### 1. ✅ 项目搭建 (scaffold)
- Tauri 2.0 + React + TypeScript 脚手架
- Tailwind CSS 4 (via @tailwindcss/vite 插件) + @tailwindcss/typography
- React Router DOM 路由
- Zustand 状态管理
- Release build 成功 (binary 8.3MB)

### 2. ✅ 文件系统操作 (fs-ops)
- 8 个 Tauri 命令，全部沙箱化
- 路径验证：canonicalize + starts_with 检查，防止目录穿越
- Workspace 管理：list / create / init_builtin（真实复制逻辑）

### 3. ✅ AI Agent Runtime (agent-runtime)
- Claude Messages API 集成 (reqwest HTTP 客户端)
- 非流式 + 流式两种模式 (当前 tool-use 循环用非流式)
- 6 个工具定义 (read_file, write_file, append_file, list_files, search_file, render_canvas)
- Tool-use 循环引擎 (最多 20 轮自动循环)
- Tauri 事件推送 (agent-event + canvas-event)

### 4. ✅ 设置与存储 (settings)
- macOS Keychain 集成 (通过 `security` CLI 命令)
- API Key 加密存取 (set/get/has/delete)
- 前端 SettingsPage 接通 Keychain

### 5. ✅ Landing Page (landing)
- 双卡片 (📖上课 / 🔄复习) + 底部导航 + 设置入口
- 自动初始化 builtin workspace + API Key 状态检测
- API Key 缺失时显示警告 banner

### 6. ✅ 课堂面板 (lesson-panel)
- 三栏布局 (导航|对话|白板/群聊)
- Markdown + KaTeX 数学公式渲染 (react-markdown + remark-math + rehype-katex)
- prose 排版样式 (@tailwindcss/typography)
- "开始上课" → 读 CLAUDE.md → initSession → sendMessage 完整流程
- Canvas SVG 白板 + 群聊 tab

### 7. ✅ 设置页 (settings-page)
- AI 提供商选择 (Anthropic / OpenAI / Google / DeepSeek)
- API Key 输入/保存到 Keychain
- 主题切换 (浅色/深色/跟随系统)
- Workspace 信息展示

### 8. ✅ 内置 AP Physics (builtin)
- init_builtin_workspace: 从 ~/AP_Physics_EM/ 递归复制所有 Markdown 文件
- 过滤 .git / .claude / .vscode / .pdf / MAINTAINER.md / 参考资料
- 目标: ~/SocraticNovel/workspaces/ap-physics-em/ (~1.3MB)
- 已存在时跳过 (幂等)

---

## 未完成

### 9. 🔲 Setup Wizard (wizard) — Phase 1 最后一项
- [ ] 首次启动检测 (localStorage/store 标记)
- [ ] 引导流程: 欢迎 → 选 AI 提供商 → 输 API Key → 选 workspace 来源
- [ ] "体验 AP Physics" / "从零创建" / "导入" 三选一

### 待做 (Phase 2+)
- [ ] 流式输出优化 (streaming 已实现但未启用)
- [ ] 下课流程 (发结束信号 → AI 写 8 个运行时文件 → 切群聊)
- [ ] 群聊面板 (读 wechat_group.md, 独立会话)
- [ ] 深色模式切换逻辑
- [ ] 对话历史持久化 (SQLite)
- [ ] 复习模式 (Review page + onboarding)
- [ ] Meta Prompt 创建向导
- [ ] 自动更新
- [ ] workspace path 动态获取 (当前部分硬编码)

---

## 如何继续开发

### 端到端跑通的最短路径

1. 设置 → 输入 Claude API Key (保存到 Keychain)
2. 回首页 → 点"开始上课"
3. 验证 AI 能读 CLAUDE.md、通过 tool_use 读写文件、教学、写白板

### 开发命令

```bash
cd ~/socratic-novel
export PATH="/opt/homebrew/bin:$HOME/.cargo/bin:$PATH"

# 开发模式 (首次编译 ~5min, 增量 ~6s)
npm run tauri dev

# 构建 release
npm run tauri build -- --no-bundle

# 只检查 TypeScript
npx tsc --noEmit

# 只构建 Rust
cd src-tauri && cargo build

# 只构建前端
npx vite build
```

### Git

```
main branch, 2 commits:
- bee094c: Initial scaffolding + full Phase 1 implementation
- ec00e2d: Markdown/KaTeX rendering, real workspace copy, landing page init flow
```

### 关键依赖版本

```
Node.js: v25.8.0
Rust: 1.94.0
Tauri: 2.x
React: 19.x
TypeScript: 5.x
Tailwind CSS: 4.x
```
