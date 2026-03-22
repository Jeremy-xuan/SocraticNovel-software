# SocraticNovel Desktop — 项目状态文档

> 面向 AI 的上下文文档。用于在新会话中快速恢复项目状态。
> 最后更新：2026-03-22

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
| 本地存储 | SQLite (计划) + 文件系统 |
| 渲染 | react-markdown + KaTeX (已安装，未接入) |

### 关键架构决策

1. **App 不硬编码加载逻辑**：CLAUDE.md 作为 system prompt 注入，AI 自己通过 read_file 决定读什么
2. **沙箱化文件访问**：所有文件操作限制在 workspace 目录内，路径验证防止目录穿越
3. **Tool-use 循环引擎**：用户消息 → Claude API → tool_call? → 执行 → 结果喂回 → 继续循环 → text? → 展示
4. **Tauri 事件系统**：Rust 后端通过 `app.emit()` 向前端推送 agent-event / canvas-event

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
├── App.css                     # Tailwind v4 入口 (@import "tailwindcss")
├── main.tsx                    # React 挂载点
├── pages/
│   ├── LandingPage.tsx         # 首页：双卡片 (上课/复习) + 底部导航
│   ├── LessonPage.tsx          # 课堂：三栏布局 (导航|对话|白板)
│   └── SettingsPage.tsx        # 设置：API Key + 主题 + Workspace
├── components/
│   ├── chat/
│   │   ├── ChatMessageBubble.tsx  # 消息气泡 (用户/助手/系统)
│   │   └── ChatInput.tsx          # 输入框 (Enter 发送, Shift+Enter 换行)
│   └── canvas/
│       └── CanvasPanel.tsx        # 白板面板 (SVG 渲染)
├── hooks/
│   └── useAiAgent.ts           # AI Agent hook (监听事件, 管理会话)
├── stores/
│   └── appStore.ts             # Zustand 全局状态 (session, messages, canvas, settings)
├── lib/
│   ├── tauri.ts                # Tauri IPC 封装 (文件系统 + workspace)
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
│   ├── fs_commands.rs          # 文件系统命令 (沙箱化)
│   │   ├── read_file           # 读文件
│   │   ├── write_file          # 写文件
│   │   ├── append_file         # 追加文件
│   │   ├── list_files          # 列目录
│   │   ├── search_file         # 搜索文件内容
│   │   ├── list_workspaces     # 列出所有 workspace
│   │   ├── create_workspace    # 创建新 workspace
│   │   └── init_builtin_workspace  # 初始化内置 AP Physics
│   └── ai_commands.rs          # AI 会话命令
│       ├── start_ai_session    # 初始化会话 (设 system prompt + workspace)
│       ├── send_chat_message   # 发送消息 (触发 agent loop)
│       └── get_conversation_history  # 获取对话历史
└── ai/
    ├── mod.rs                  # 模块导出
    ├── types.rs                # Claude API 类型定义
    │   ├── MessagesRequest     # 请求体
    │   ├── Message / ContentBlock  # 消息/内容块 (text, tool_use, tool_result)
    │   ├── StreamEvent         # SSE 流事件
    │   └── AgentEvent          # 前端事件类型
    ├── claude.rs               # Claude API 客户端
    │   ├── send_message        # 非流式请求 (用于 tool-use 循环)
    │   └── send_message_streaming  # 流式请求 (已实现，暂未使用)
    ├── tools.rs                # 工具定义 + 执行器
    │   ├── get_tool_definitions()  # 6 个工具: read_file, write_file, append_file, list_files, search_file, render_canvas
    │   └── execute_tool()      # 工具路由执行
    └── runtime.rs              # Agent 循环引擎
        └── run_agent_turn()    # 完整的 tool-use 循环 (最多 20 轮)
```

---

## 已完成

### 1. ✅ 项目搭建 (scaffold)
- Tauri 2.0 + React + TypeScript 脚手架
- Tailwind CSS 4 (via @tailwindcss/vite 插件)
- React Router DOM 路由
- Zustand 状态管理
- Vite 开发服务器配置
- Release build 成功 (binary 8.3MB)

### 2. ✅ 文件系统操作 (fs-ops)
- 8 个 Tauri 命令，全部沙箱化
- 路径验证：canonicalize + starts_with 检查，防止目录穿越
- Workspace 管理：list / create / init_builtin
- 自动创建父目录

### 3. ✅ AI Agent Runtime (agent-runtime)
- Claude Messages API 集成 (reqwest HTTP 客户端)
- 非流式 + 流式两种模式 (当前 tool-use 循环用非流式)
- 6 个工具定义 (read_file, write_file, append_file, list_files, search_file, render_canvas)
- Tool-use 循环引擎 (最多 20 轮自动循环)
- Tauri 事件推送 (agent-event: text_delta, tool_call_start, tool_call_result, message_done, error, turn_complete)
- Canvas 事件推送 (canvas-event: title + SVG content)
- 对话状态管理 (Mutex<Vec<Message>> in Tauri managed state)

### 4. ✅ 前端页面 (UI)
- **LandingPage**: 双卡片 (📖上课 / 🔄复习), 底部导航, 设置入口
- **LessonPage**: 三栏布局, Chat UI (气泡样式), Canvas 面板, 开始上课/下课按钮
- **SettingsPage**: AI 提供商选择, API Key 输入, 主题切换, Workspace 展示
- **ChatMessageBubble**: 用户/助手/系统三种样式, tool call 指示器, streaming 光标
- **ChatInput**: 自动高度 textarea, Enter/Shift+Enter, disabled 状态
- **CanvasPanel**: SVG 渲染 (dangerouslySetInnerHTML), 空状态提示

### 5. ✅ 前端-后端连接
- `useAiAgent` hook: 监听 agent-event / canvas-event, 管理消息流
- `lib/ai.ts`: startAiSession + sendChatMessage 封装
- `lib/tauri.ts`: 文件系统操作封装
- LessonPage: 点击"开始上课" → 读 CLAUDE.md → initSession → sendMessage 完整流程

---

## 未完成

### 6. 🔲 设置与存储 (settings) — 优先级高
- [ ] SQLite 数据库初始化 (settings 表、sessions 表)
- [ ] macOS Keychain 集成 (API Key 加密存取)
- [ ] 前端 SettingsPage 接通后端 (当前 API Key 用 localStorage 临时方案)
- [ ] Workspace 切换功能接通

### 7. 🔲 课堂面板完善 (lesson-panel)
- [ ] Markdown 渲染 (react-markdown 已安装，未接入 ChatMessageBubble)
- [ ] KaTeX 数学公式渲染 (katex 已安装，未接入)
- [ ] 流式输出优化 (当前是非流式，一次性返回全文)
- [ ] 下课流程 (发送结束信号, AI 写入 8 个运行时文件, 切换群聊)
- [ ] 群聊面板 (读取 wechat_group.md, 独立会话)

### 8. 🔲 Setup Wizard (wizard)
- [ ] 首次启动检测
- [ ] 引导流程: 选 AI 提供商 → 输 API Key → 选 workspace 来源
- [ ] "体验 AP Physics" / "从零创建" / "导入" 三选一

### 9. 🔲 内置 AP Physics Workspace (builtin)
- [ ] 从 ~/AP_Physics_EM/ 复制完整教学系统文件到 app 资源
- [ ] 或者从 ~/SocraticNovel/ 仓库复制
- [ ] init_builtin_workspace 命令已有骨架，需要填充实际文件

### 10. 🔲 其他待做
- [ ] 深色模式 (Tailwind dark: 类已预置，需切换逻辑)
- [ ] 对话历史持久化 (SQLite 存储)
- [ ] 错误处理完善 (API 限流、网络断开等)
- [ ] workspace path 动态获取 (当前硬编码 /Users/wujunjie/)

---

## 已确认的设计决策

（来自架构文档 §10）

| # | 问题 | 决定 |
|---|------|------|
| 1 | App 名称 | SocraticNovel |
| 2 | 课堂启动消息 | App 显示系统消息"正在启动课堂..."，隐藏消息触发 AI |
| 3 | 群聊 Prompt | 单独 group_chat.md 文件 |
| 4 | SVG 生成 | 先假设 AI 直接生成，MVP 后验证 |
| 5 | 收费模式 | 免费 + API Key，预留代理/订阅 |
| 6 | Review Onboarding | 一次性 token 成本可接受 |
| 7 | Meta Prompt 联动 | 分两次 onboard，复习延迟创建 |

---

## 如何继续开发

### 端到端跑通的最短路径

1. **settings** — 实现 API Key 持久化 (Keychain 或至少 SQLite)
2. **builtin** — 复制 AP Physics workspace 文件到 ~/SocraticNovel/workspaces/ap-physics-em/
3. 启动 dev → 输入 API Key → 开始上课 → 验证 AI 能读文件、教学、写文件

### 开发命令

```bash
cd ~/socratic-novel
export PATH="/opt/homebrew/bin:$HOME/.cargo/bin:$PATH"

# 开发模式
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

### 关键依赖版本

```
Node.js: v25.8.0
Rust: 1.94.0
Tauri: 2.x
React: 19.x
TypeScript: 5.x
Tailwind CSS: 4.x
```
