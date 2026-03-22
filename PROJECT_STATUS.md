# SocraticNovel — 项目状态文档

> 最后更新：2025-03-22
> 当前版本：Phase 1 MVP（开发中）

## 项目概述

SocraticNovel 是一个开源桌面应用，将苏格拉底式教学法与轻小说叙事结合，创造沉浸式 AI 家教体验。学习者通过与虚拟角色的对话学习 AP Physics C: EM，教学过程被文学性的环境描写、角色情感和故事线包裹。

**核心理念**：教学不是信息传递——是四个人共享空间、共同成长的故事。

## 技术架构

### 技术栈
- **桌面框架**：Tauri 2.0（Rust 后端 + WebView 前端）
- **前端**：React 19 + TypeScript + Tailwind CSS 4 + Zustand
- **AI**：多提供商支持（Claude / DeepSeek / OpenAI / Google）
- **渲染**：react-markdown + remark-math + rehype-katex（数学公式）+ SVG（白板）
- **存储**：macOS Keychain（API Key）+ localStorage（设置）+ 文件系统（workspace）

### 三层架构（源自教学系统设计）
```
┌─────────────────────────────────┐
│        叙事层 (Narrative)        │  story.md, characters/, story_progression.md
│   角色、环境、情感、故事线推进     │
├─────────────────────────────────┤
│        教学层 (Teaching)         │  system.md, curriculum.md, knowledge_points.md
│   苏格拉底教学法、知识点覆盖      │
├─────────────────────────────────┤
│        运行时层 (Runtime)        │  progress.md, session_log.md, wechat_group.md
│   进度追踪、复习队列、群聊历史     │
└─────────────────────────────────┘
```

### 后端模块（Rust, src-tauri/src/）

| 模块 | 文件 | 功能 |
|------|------|------|
| **AI Runtime** | `ai/runtime.rs` | Tool-use 循环引擎：发送消息 → 处理工具调用 → 喂回结果 → 重复 |
| **Claude Client** | `ai/claude.rs` | Anthropic Messages API 客户端（非流式） |
| **OpenAI Client** | `ai/openai.rs` | OpenAI 兼容客户端（DeepSeek/OpenAI/Google） |
| **Tools** | `ai/tools.rs` | 工具定义 + 执行器（8 个工具） |
| **Types** | `ai/types.rs` | 共享类型（Message, ContentBlock, ToolDefinition 等） |
| **AI Commands** | `commands/ai_commands.rs` | Tauri 命令：start_ai_session, send_chat_message |
| **FS Commands** | `commands/fs_commands.rs` | 沙箱化文件操作 + workspace 初始化 |
| **Settings** | `commands/settings_commands.rs` | macOS Keychain 存取 API Key |

### 前端模块（TypeScript, src/）

| 模块 | 文件 | 功能 |
|------|------|------|
| **路由** | `App.tsx` | 首次启动检测 → Setup Wizard / Landing / Lesson / Settings |
| **Landing** | `pages/LandingPage.tsx` | 主页：workspace 状态、开始上课、API Key 检查 |
| **Lesson** | `pages/LessonPage.tsx` | 三栏布局：对话 + 白板/群聊 |
| **Settings** | `pages/SettingsPage.tsx` | API Key 管理、提供商切换 |
| **Setup Wizard** | `pages/SetupWizardPage.tsx` | 5 步首次启动向导 |
| **Chat UI** | `components/chat/` | 消息气泡（Markdown + KaTeX）+ 输入框 |
| **Canvas** | `components/canvas/CanvasPanel.tsx` | SVG 白板渲染 |
| **AI Hook** | `hooks/useAiAgent.ts` | 事件监听（agent/canvas/group-chat）+ 会话管理 |
| **Store** | `stores/appStore.ts` | Zustand 全局状态 + localStorage 持久化 |
| **AI Lib** | `lib/ai.ts` | Tauri invoke 封装 + 事件订阅 |

### 可用工具（AI Agent）

| 工具名 | 用途 |
|--------|------|
| `read_file` | 读取 workspace 内文件 |
| `write_file` | 写入文件（创建或覆盖） |
| `append_file` | 追加内容到文件末尾 |
| `list_files` | 列出目录内容 |
| `search_file` | 在文件中搜索文本 |
| `render_canvas` | 在白板面板渲染 SVG 图表 |
| `show_group_chat` | 在右侧群聊面板显示微信消息 |
| `think` | AI 内部笔记（静默消费，不显示给用户） |

## 已完成的功能

### Phase 1 MVP — ✅ 核心流程可用

1. **✅ 项目搭建** — Tauri 2.0 + React 19 + TW4 + Zustand，基础路由
2. **✅ 文件系统** — 沙箱化读写、路径验证（防目录穿越）、workspace 管理
3. **✅ AI Agent Runtime** — Tool-use 循环引擎，多轮工具调用
4. **✅ 多提供商支持** — Claude / DeepSeek(reasoner) / OpenAI / Google
5. **✅ 设置管理** — API Key Keychain 存储、localStorage 持久化
6. **✅ Landing Page** — workspace 信息、API Key 状态、自动初始化
7. **✅ 课堂面板** — 三栏布局、对话 + 白板 + 群聊
8. **✅ Markdown + KaTeX** — 数学公式渲染、prose 排版
9. **✅ Setup Wizard** — 5 步首次启动向导
10. **✅ 内置 workspace** — AP Physics EM 从 ~/AP_Physics_EM 递归复制
11. **✅ 群聊面板** — show_group_chat 工具路由到右侧面板，WeChat 风格气泡
12. **✅ think 工具** — AI 内部笔记不显示给用户
13. **✅ 错误恢复** — 网络断开后 UI 不卡死，5 分钟超时安全网

### 教学系统 Prompt 更新

- ✅ 移除 `temp_math.md` 引用（app 有 KaTeX，不需要临时文件）
- ✅ 移除 `pdftotext` 引用（教材已转 Markdown）
- ✅ 添加桌面应用环境说明（system.md 顶部）
- ✅ 群聊通过 `show_group_chat` 工具发送
- ✅ 内部准备通过 `think` 工具完成
- ✅ 苏格拉底规则强化：提问后必须停止
- ✅ 首次破冰改为叙事场景（不在群聊中）

## 未完成 / 需要改进

### 优先级高（影响使用体验）

1. **AI 一次性讲完问题** — 尽管 prompt 已强化"提问后停止"规则，deepseek-reasoner 仍可能一次输出过多内容。可能需要：
   - 在 runtime.rs 中加入输出长度检测，超过阈值时强制截断
   - 或在 system prompt 的 JSON schema 中限制单次输出
   - 或切换到更遵循指令的模型

2. **内部准备内容泄露** — AI 有时仍将课前准备（读文件列表、知识点清单）输出为文本。`think` 工具已添加但 AI 不一定用它。可能需要：
   - 在 runtime.rs 中过滤以特定模式开头的文本（如"正在读取"、"课前准备"）
   - 或在 OpenAI client 中对 reasoning_content 做更彻底的过滤

3. **流式输出** — 目前是非流式（整个回复生成完才显示）。用户体验差，尤其是 deepseek-reasoner 生成时间长。需要：
   - 实现 SSE 流式解析
   - 前端逐字显示
   - 工具调用中间状态展示

4. **会话持久化** — 当前关闭 app 后对话历史丢失。需要：
   - 将 ConversationState 序列化到文件或 SQLite
   - 启动时恢复上次对话

### 优先级中

5. **复习功能** — Landing Page 的"复习"卡片是占位符
6. **课后笔记 / 日记查看** — 底部 tab 未实现
7. **学习进度展示** — progress.md 解析 + 可视化
8. **深色模式** — TW4 dark: 变体已准备，但未实现切换
9. **Workspace 选择器** — 目前硬编码路径，需要 UI 选择
10. **模型选择器** — 用户应能在设置中选择具体模型（不只是提供商）

### 优先级低

11. **Windows/Linux 适配** — API Key 存储需适配（目前仅 macOS Keychain）
12. **打包发布** — Tauri bundle 配置
13. **教材 PDF 支持** — 如果 workspace 包含 PDF，需要 pdftotext 集成
14. **多 workspace 管理** — 创建、导入、删除
15. **课后自动更新** — "下课"按钮触发 AI 更新 progress/session_log 等
16. **render_canvas 改进** — 更丰富的图表类型、交互式图表

## 关键文件路径

### 应用代码
```
~/socratic-novel/                    # 项目根目录
├── src/                             # 前端 (React + TS)
├── src-tauri/src/                   # 后端 (Rust)
├── package.json                     # 前端依赖
├── src-tauri/Cargo.toml             # 后端依赖
└── PROJECT_STATUS.md                # 本文件
```

### 教学系统 Workspace
```
~/SocraticNovel/workspaces/ap-physics-em/    # 运行时 workspace（AI 读写此目录）
~/AP_Physics_EM/                             # 源模板（init_builtin_workspace 复制源）
```

### 关键配置
```
~/SocraticNovel/workspaces/ap-physics-em/
├── CLAUDE.md                        # AI 启动入口（启动顺序 + 桌面环境说明）
├── teacher/config/system.md         # 系统总指令（~550 行，核心 prompt）
├── teacher/config/curriculum.md     # 课程大纲
├── teacher/config/learner_profile.md # 学习者档案
├── teacher/story.md                 # 故事背景（序章 + 世界观）
├── teacher/story_progression.md     # 故事进度表
├── teacher/characters/*.md          # 角色文档（凛/律/朔）
└── teacher/runtime/*.md             # 运行时状态（进度/日志/群聊等）
```

## 开发环境

```bash
# 启动开发服务器
export PATH="$HOME/.cargo/bin:$PATH"
cd ~/socratic-novel
npm run tauri dev

# 仅前端
npm run dev

# 仅后端检查
cd src-tauri && ~/.cargo/bin/cargo check

# TypeScript 类型检查
npx tsc --noEmit
```

- Vite dev server: http://localhost:1420
- Tauri 监听 src-tauri/ 变化自动重编译 Rust（增量 ~5s）
- Vite HMR 前端热更新

## 设计决策记录

1. **非流式 API 调用** — 为了 tool-use 可靠性选择非流式。流式 + tool-use 组合处理复杂，MVP 阶段先用非流式。
2. **文件系统即状态** — 所有教学状态存储为 Markdown 文件，AI 通过工具读写。不用数据库，保持简单透明。
3. **Provider 抽象** — 内部类型统一为 Claude 格式（ContentBlock::Text/ToolUse/ToolResult），OpenAI 客户端负责双向翻译。
4. **think 工具** — 让 AI 有明确的"内部笔记"通道，避免准备过程泄露到对话中。
5. **show_group_chat 工具** — 群聊路由到专用面板，保持主对话区纯粹。
6. **deepseek-reasoner** — 用户选择的默认模型。reasoning_content 被过滤不显示。
7. **macOS Keychain** — API Key 不存文件，通过 `security` CLI 命令存取。
