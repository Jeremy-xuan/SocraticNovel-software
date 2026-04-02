# SocraticNovel 系统调研报告

> 调研时间：2026-03-29
> 调研人：Claude Code Agent
> 项目版本：v0.4.2 (Phase 4.3 进行中)

---

## 一、项目概述

### 1.1 是什么
SocraticNovel 是一个开源桌面应用，将苏格拉底式教学法与轻小说叙事结合，创造沉浸式 AI 家教体验。学习者通过与虚拟角色的对话学习 AP Physics C: EM，教学过程被文学性的环境描写、角色情感和故事线包裹。

### 1.2 核心理念
> "教学不是信息传递——是四个人共享空间、共同成长的故事。"

### 1.3 目标用户
- 正在学习某学科的学生（主要受众）
- 想体验沉浸式 AI 教学的好奇者
- SocraticNovel 框架的创建者/维护者

---

## 二、技术架构

### 2.1 技术栈

| 组件 | 选型 | 说明 |
|------|------|------|
| 桌面框架 | **Tauri 2.0** | Rust 后端 + WebView 前端，~10MB 安装包 |
| 前端框架 | **React 19 + TypeScript** | 生态成熟，组件库丰富 |
| 状态管理 | **Zustand** | 轻量级全局状态管理 |
| 样式方案 | **Tailwind CSS v4** | class-based dark variant |
| AI 集成 | **直接 HTTP 调用** | 不引入 SDK，统一接口 |
| 数学公式 | **KaTeX** | 快速 LaTeX 渲染 |
| 图表渲染 | **SVG + Mermaid** | AI 生成结构化图形代码 |
| PDF 转换 | **pdftotext + AI Vision** | 教材 PDF 转 Markdown |
| 国际化 | **react-i18next** | 中/英双语支持 |

### 2.2 分层架构

```
┌───────────────────────────────────────────────────────┐
│                   Presentation Layer                   │
│  ┌───────────┬───────────────────┬─────────────────┐ │
│  │  Sidebar  │  Lesson Panel     │  Right Panel    │ │
│  │  (导航)    │  (课堂对话)       │  (白板/群聊)   │ │
│  └───────────┴───────────────────┴─────────────────┘ │
├───────────────────────────────────────────────────────┤
│                    Tauri IPC Bridge                    │
├───────────────────────────────────────────────────────┤
│                   Application Layer                    │
│  ┌──────────────────────────────────────────────┐    │
│  │            AI Agent Runtime                   │    │
│  │  Context Builder + Tool Use Executor + Session Manager  │    │
│  └──────────────────────────────────────────────┘    │
│  ┌────────────┐ ┌─────────────┐ ┌────────────────┐  │
│  │ Auth Mgr   │ │ PDF Convert │ │ Canvas Render   │  │
│  └────────────┘ └─────────────┘ └────────────────┘  │
├───────────────────────────────────────────────────────┤
│                    Storage Layer                       │
│  ┌───────────┐  ┌───────────┐  ┌──────────────────┐ │
│  │ Workspaces│  │ localStor │  │   Keychain       │ │
│  └───────────┘  └───────────┘  └──────────────────┘ │
└───────────────────────────────────────────────────────┘
```

### 2.3 三层架构（教学系统设计）

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

---

## 三、前端架构 (React + TypeScript)

### 3.1 路由结构

```
App.tsx (BrowserRouter)
├── /           → LandingPage (非首次启动)
├── /setup      → SetupWizardPage (首次启动)
├── /lesson     → LessonPage (课堂模式)
├── /review     → PracticePage (复习模式)
├── /notes      → NotesPage (笔记生成)
├── /progress   → ProgressPage (学习进度)
├── /settings   → SettingsPage (设置)
├── /meta-prompt → MetaPromptPage (创建教学系统)
├── /spaced-review → ReviewPage (间隔复习卡片)
├── /pdf-import  → PdfImportPage (PDF导入)
├── /history     → HistoryPage (课堂历史)
└── /demo-canvas → DemoCanvasPage (Canvas演示)
```

### 3.2 状态管理 (Zustand)

**appStore.ts** 管理全局状态：
- `messages: ChatMessage[]` - 对话消息
- `canvasItems: CanvasItem[]` - 白板内容
- `groupChatMessages: GroupChatMessage[]` - 群聊消息
- `agentLogs: AgentLogEntry[]` - Agent活动日志
- `reviewCards: ReviewCard[]` - 复习卡片
- `settings: AppSettings` - 应用设置（含API Key、主题、语言等）
- **持久化**：localStorage 存储会话和设置

### 3.3 AI Agent Hook (useAiAgent.ts)

核心钩子，负责：
1. 监听 Rust 后端事件 (`onAgentEvent`, `onCanvasEvent`, `onGroupChatEvent`)
2. 事件处理：text_delta、tool_call_start/result、message_done、turn_complete
3. 调用 Tauri 命令：startAiSession、sendTeachingMessage、runPrepPhase 等
4. 会话管理：initSession、sendTeaching、sendPractice、runPrep、runPostLesson

### 3.4 核心页面

#### LessonPage.tsx (课堂模式)
- 三栏布局：左侧章节大纲 + 中间对话 + 右侧白板/群聊
- 状态管理：isInClass、prepComplete、sessionStartTime
- 生命周期：startClass → 进行中 → endClass → 保存历史

#### PracticePage.tsx (练习模式)
- 独立全屏页面
- 状态机：select → yuuki-setup → animatutor-wizard → generating → active

#### CanvasPanel.tsx (白板面板)
- SVG 渲染 + Mermaid 渲染
- 流式"长出来"效果
- 用户标注覆盖层 (AnnotationLayer)

---

## 四、后端架构 (Rust + Tauri)

### 4.1 模块划分

```
src-tauri/src/
├── main.rs                     # Tauri 入口
├── lib.rs                      # 模块导出
├── ai/
│   ├── mod.rs                  # AI 模块导出
│   ├── runtime.rs              # ★ 核心：Agent 循环引擎
│   ├── claude.rs               # Claude API 客户端
│   ├── openai.rs               # OpenAI/DeepSeek/Google 客户端
│   ├── tools.rs                # 工具定义 + 执行器
│   └── types.rs                # 共享类型定义
└── commands/
    ├── mod.rs                  # 命令模块导出
    ├── ai_commands.rs          # ★ AI 会话命令
    ├── fs_commands.rs           # 文件系统命令
    ├── settings_commands.rs     # 设置命令
    ├── review_commands.rs       # 复习引擎命令
    ├── pdf_commands.rs          # PDF 处理命令
    ├── oauth_commands.rs         # GitHub OAuth 命令
    └── history_commands.rs      # 课堂历史命令
```

### 4.2 AI Runtime 核心 (runtime.rs)

#### 4.2.1 事件驱型流式处理

```rust
// SSE 解析
fn parse_sse_events(buffer: &mut String) -> Vec<StreamEvent>

// Claude 流式处理
async fn process_claude_streaming(...) -> Result<(Vec<ContentBlock>, Option<String>), String>

// OpenAI 兼容流式处理
async fn process_openai_streaming(...) -> Result<(Vec<ContentBlock>, Option<String>), String>
```

#### 4.2.2 Agent Phase 系统

```rust
pub enum AgentPhase {
    Legacy,      // 单Agent向后兼容
    Prep,        // 课前准备 - 读文件生成lesson_brief
    Teaching,    // 课堂教学 - respond_to_student only
    PostLesson,  // 课后更新 - 写8个运行时文件
    Practice,    // 练习/刷题 - 学生甩题AI引导
    MetaPrompt,  // Meta Prompt - AI引导创建教学系统
}
```

#### 4.2.3 工具集

| Phase | 工具集 |
|-------|--------|
| Prep | read_file, list_files, search_file, think, submit_lesson_brief |
| Teaching | respond_to_student, show_group_chat, render_canvas, think, read_teaching_material |
| PostLesson | read_file, write_file, append_file, list_files, show_group_chat, think |
| Practice | respond_to_student, render_canvas, think, read_file, search_file |
| MetaPrompt | respond_to_student, write_file, read_file, list_files, append_file, think |

#### 4.2.4 respond_to_student 去重机制

 Teaching Phase 中，respond_to_student 调用后立即从 `active_tools` 中移除：
```rust
active_tools.retain(|t| t.name != "respond_to_student");
```
Grace period = 1，仅给 show_group_chat/render_canvas 机会

#### 4.2.5 OutputLimiter 四层防护

| 层级 | 机制 | 触发条件 |
|------|------|---------|
| Prompt 层 | 三铁律 + B/C 盲测 + 5轮自检 | 始终生效 |
| Runtime 层 | OutputLimiter | 问号后200字/硬限1500字 |
| Tool 层 | respond_to_student 去重 | 调用一次后移除 |
| Reminder 层 | 铁律周期注入 | 每10条消息 |

### 4.3 AI 命令 (ai_commands.rs)

#### 4.3.1 ConversationState

```rust
pub struct ConversationState {
    pub messages: Mutex<Vec<Message>>,
    pub system_prompt: Mutex<String>,
    pub workspace_path: Mutex<String>,
    pub provider: Mutex<String>,
    pub model: Mutex<String>,
    pub lesson_brief: Mutex<Option<String>>,      // Prep生成
    pub teaching_prompt: Mutex<String>,
    pub practice_prompt: Mutex<String>,
    pub meta_prompt_prompt: Mutex<String>,
}
```

#### 4.3.2 核心命令

| 命令 | 功能 |
|------|------|
| start_ai_session | 初始化会话，清空历史 |
| send_chat_message | 发送消息，运行Legacy Agent循环 |
| run_prep_phase | Phase 1: Prep Agent生成lesson_brief |
| send_teaching_message | Phase 2: Teaching Agent教学回合 |
| run_post_lesson | Phase 3: Post Agent课后更新 |
| send_practice_message | 练习模式消息 |
| send_meta_prompt_message | Meta Prompt模式消息 |
| generate_lesson_notes | 生成结构化复习笔记 |
| generate_anki_cards | 生成Anki卡片(TSV) |
| simple_chat | 无状态非流式聊天(用于WorldChat) |

### 4.4 文件系统命令 (fs_commands.rs)

沙箱化文件操作：
- `read_file` - 读取文件（限制512KB）
- `write_file` - 写入文件
- `append_file` - 追加内容
- `list_files` - 列出目录
- `search_file` - 搜索文件
- **路径验证**：拒绝 `../` 逃逸

---

## 五、数据流分析

### 5.1 课堂启动流程

```
用户点击"开始上课"
    ↓
LessonPage.handleStartClass()
    ↓
1. 读取 wechat_group.md 检测首次启动
2. 读取 CLAUDE.md 作为 system_prompt
    ↓
initSession(workspacePath, systemPrompt)
    ↓
[start_ai_session] 命令 → 清空状态，保存 system_prompt
    ↓
runPrep(workspacePath) → [run_prep_phase]
    ↓
Prep Agent 运行 → read_file → submit_lesson_brief
    ↓
lesson_brief 存入 ConversationState
    ↓
sendTeaching('请开始今天的课程') → [send_teaching_message]
    ↓
Teaching Agent 运行 → respond_to_student → 流式推送到前端
```

### 5.2 流式输出数据流

```
Rust Backend (runtime.rs)
    ↓ SSE stream
process_claude_streaming()
    ↓ 解析 JSON增量
RespondContentStreamer.feed()
    ↓
app.emit("agent-event", AgentEvent::TextDelta { text })
    ↓
React Frontend (useAiAgent.ts)
    ↓
onAgentEvent callback
    ↓
updateLastAssistantMessage(text)
    ↓
Zustand Store → React re-render
```

### 5.3 工具调用数据流

```
AI 返回 tool_call
    ↓
process_*_streaming() 检测 ContentBlockStart
    ↓
app.emit("agent-event", AgentEvent::ToolCallStart { id, name })
    ↓
前端显示 "正在读取文件..."
    ↓
execute_tool() 执行 Rust 端文件操作
    ↓
app.emit("agent-event", AgentEvent::ToolCallResult { id, result, is_error })
    ↓
tool_result 追加到 messages
    ↓
继续下一轮迭代
```

---

## 六、关键设计决策

### 6.1 respond_to_student 工具
**必须通过此工具发送可见内容**。直接文本输出视为内部思考。这从根本上解决了内部准备内容泄露问题。

### 6.2 双层持久化
- **后端**：完整 AI 上下文 (Message[]) 保存到 `{workspace}/.app_session.json`
- **前端**：UI 状态 (messages + canvasItems + groupChatMessages) 保存到 localStorage
- 恢复时两层同步加载

### 6.3 多 Agent 架构
- **Prep Agent**：读取文件，生成结构化 lesson_brief
- **Teaching Agent**：精简 prompt (~5K tokens)，教学指令遵循度大幅提升
- **Post Agent**：课后更新8个运行时文件
- 通用 `run_phase_loop()` 统一处理所有阶段

### 6.4 Provider 抽象
内部类型统一为 Claude 格式 (ContentBlock::Text/ToolUse/ToolResult)，OpenAI 客户端负责双向翻译。

### 6.5 动态教学节奏
从 `learner_profile.md` 的"学习水平"字段驱动：
- 进阶 → 1-2轮/概念
- 中等 → 2-3轮/概念
- 默认 → 3-5轮/概念

---

## 七、Workspace 结构

```
workspaces/ap-physics-em/
├── CLAUDE.md                    # 课堂模式启动文档
├── teacher/
│   ├── config/
│   │   ├── system_core.md      # 教学规则
│   │   ├── system_narrative.md # 叙事规则
│   │   ├── system_prep.md      # Prep Agent 规则
│   │   ├── system_post.md      # Post Agent 规则
│   │   ├── system_chat.md      # 群聊规则
│   │   ├── curriculum.md        # 课程大纲
│   │   ├── learner_profile.md   # 学习者档案
│   │   └── characters/          # 角色文档
│   ├── runtime/
│   │   ├── progress.md          # 学习进度
│   │   ├── review_queue.md      # 复习队列
│   │   ├── mistake_log.md       # 错题记录
│   │   ├── session_log.md       # 课堂日志
│   │   ├── diary.md            # 学习日记
│   │   └── wechat_group.md     # 群聊记录
│   └── story.md               # 故事背景
├── materials/
│   └── textbook/              # 教材PDF/Markdown
└── notes/                    # 生成的笔记
```

---

## 八、已识别的重要文件

| 文件路径 | 功能 |
|---------|------|
| src-tauri/src/ai/runtime.rs | Agent循环引擎核心 |
| src-tauri/src/ai/tools.rs | 工具定义+执行器 |
| src-tauri/src/ai/claude.rs | Claude API客户端 |
| src-tauri/src/ai/openai.rs | OpenAI/DeepSeek/Google客户端 |
| src-tauri/src/commands/ai_commands.rs | AI会话命令 |
| src-tauri/src/commands/fs_commands.rs | 文件系统命令 |
| src-tauri/src/commands/review_commands.rs | SM-2复习引擎 |
| src/App.tsx | 前端路由入口 |
| src/stores/appStore.ts | Zustand全局状态 |
| src/hooks/useAiAgent.ts | AI事件监听+命令调用 |
| src/pages/LessonPage.tsx | 课堂模式页面 |
| src/pages/PracticePage.tsx | 练习模式页面 |
| src/components/canvas/CanvasPanel.tsx | 白板面板 |

---

## 九、依赖关系图

```
前端 (React)
    ↓ invoke()
src/lib/ai.ts
    ↓ Tauri IPC
src-tauri/src/commands/ai_commands.rs
    ↓ 调用
src-tauri/src/ai/runtime.rs
    ↓ HTTP 请求
├── src-tauri/src/ai/claude.rs (Anthropic API)
└── src-tauri/src/ai/openai.rs (OpenAI/DeepSeek/Google API)
    ↓ emit()
前端事件监听器
    ↓
Zustand Store 更新 → React re-render
```

---

## 十、调研结论

### 10.1 系统特点
1. **事件驱动**：Rust 后端通过 Tauri 事件流将 AI 输出实时推送到前端
2. **多阶段管道**：Prep → Teaching → Post 三阶段各有独立工具集和 prompt
3. **文件系统即状态**：所有教学状态存储为 Markdown 文件，AI 通过工具读写
4. **安全沙箱**：文件操作限制在 workspace 目录内，拒绝路径逃逸

### 10.2 核心创新
1. **respond_to_student 去重机制**：从根本上防止 AI 重复发言
2. **OutputLimiter 四层防护**：从架构层面强制苏格拉底式"问完即停"
3. **双层持久化**：后端 JSON + 前端 localStorage，保证会话不丢失
4. **流式增量解析**：RespondContentStreamer 实现字符级流式输出

### 10.3 待优化项（从代码中观察）
1. 会话状态韧性：无自动 checkpoint/意外退出恢复
2. E2E 测试覆盖：仅有基础流程测试
3. 错误处理：部分错误未完全处理可能导致状态不一致
