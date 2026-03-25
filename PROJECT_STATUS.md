# SocraticNovel — 项目状态文档

> 最后更新：2026-07-22
> 当前版本：Phase 2 ✅ 完成 + 问卷化改造（练习模式 + 笔记系统 + 学习进度页 + Meta Prompt 问卷 + 间隔复习 + PDF 导入 + 章节大纲）

## 项目概述

SocraticNovel 是一个开源桌面应用，将苏格拉底式教学法与轻小说叙事结合，创造沉浸式 AI 家教体验。学习者通过与虚拟角色的对话学习 AP Physics C: EM，教学过程被文学性的环境描写、角色情感和故事线包裹。

**核心理念**：教学不是信息传递——是四个人共享空间、共同成长的故事。

## 技术架构

### 技术栈
- **桌面框架**：Tauri 2.0（Rust 后端 + WebView 前端）
- **前端**：React 19 + TypeScript + Tailwind CSS 4 + Zustand
- **AI**：多提供商支持（Claude / DeepSeek / OpenAI / Google）
- **渲染**：react-markdown + remark-math + rehype-katex（数学公式）+ SVG（白板）
- **存储**：macOS Keychain（API Key）+ localStorage（设置 + 会话）+ 文件系统（workspace + 后端会话）

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
| **AI Runtime** | `ai/runtime.rs` | Tool-use 循环引擎 + SSE 流式处理 + respond_to_student 增量内容提取 |
| **Claude Client** | `ai/claude.rs` | Anthropic Messages API 客户端（流式 + 非流式） |
| **OpenAI Client** | `ai/openai.rs` | OpenAI 兼容客户端（流式 + 非流式，支持 DeepSeek/OpenAI/Google） |
| **Tools** | `ai/tools.rs` | 工具定义 + 执行器（9 个工具，含 respond_to_student） |
| **Types** | `ai/types.rs` | 共享类型（Message, ContentBlock, StreamEvent 等） |
| **AI Commands** | `commands/ai_commands.rs` | Tauri 命令 + 会话持久化（save/restore/clear） |
| **FS Commands** | `commands/fs_commands.rs` | 沙箱化文件操作 + workspace 初始化 |
| **Settings** | `commands/settings_commands.rs` | macOS Keychain 存取 API Key |
| **Review Engine** | `commands/review_commands.rs` | SM-2 间隔复习引擎（卡片管理、调度、JSON 持久化） |
| **PDF Import** | `commands/pdf_commands.rs` | PDF 文本提取 + PDFium 页面渲染 + AI 增强 |
| **CLI Practice** | `bin/cli_practice.rs` | 交互式命令行练习模式（无 GUI 测试用） |
| **Dev Test** | `bin/dev_test.rs` | 后端单元测试二进制 |

### 前端模块（TypeScript, src/）

| 模块 | 文件 | 功能 |
|------|------|------|
| **路由** | `App.tsx` | 首次启动检测 → Setup Wizard / Landing / Lesson / Settings |
| **Landing** | `pages/LandingPage.tsx` | 主页：workspace 状态、开始上课、API Key 检查 |
| **Lesson** | `pages/LessonPage.tsx` | 三栏布局：对话 + 白板/群聊 + 会话恢复 |
| **Settings** | `pages/SettingsPage.tsx` | API Key 管理、提供商切换 |
| **Setup Wizard** | `pages/SetupWizardPage.tsx` | 5 步首次启动向导 |
| **Chat UI** | `components/chat/` | 消息气泡（Markdown + KaTeX）+ 输入框 |
| **Canvas** | `components/canvas/CanvasPanel.tsx` | SVG 白板渲染 |
| **AI Hook** | `hooks/useAiAgent.ts` | 事件监听 + 会话保存 |
| **Store** | `stores/appStore.ts` | Zustand 全局状态 + localStorage 持久化 + 会话管理 |
| **AI Lib** | `lib/ai.ts` + `lib/tauri.ts` | Tauri invoke 封装 + 会话持久化 API |
| **Notes Templates** | `lib/notesTemplates.ts` | PDF 导出模板（手记风 / 极简风） |
| **Practice** | `pages/PracticePage.tsx` | 练习/刷题模式页面 |
| **Notes** | `pages/NotesPage.tsx` | AI 笔记生成 + Anki 导出 + PDF 导出 |
| **Review** | `pages/ReviewPage.tsx` | SM-2 间隔复习卡片翻转 UI + 键盘快捷键 |
| **PDF Import** | `pages/PdfImportPage.tsx` | PDF 导入：文件选择 → 预览 → AI 增强 → 保存 |
| **Chapter Outline** | `components/layout/ChapterOutline.tsx` | LessonPage 左侧课程大纲树 |
| **Curriculum Parser** | `lib/curriculumParser.ts` | 解析 curriculum.md / progress.md 为结构化数据 |
| **Agent Log** | `components/debug/AgentLogPanel.tsx` | Agent 活动日志查看器 |
| **Meta Prompt 问卷** | `components/metaprompt/` | 5 步问卷向导（基础→角色→世界观→故事→确认） |
| **角色预设库** | `data/characterPresets.ts` | 20 个动漫角色预设（折木/五条/利威尔/杀老师等） |
| **问卷序列化** | `lib/questionnaireSerializer.ts` | 问卷数据 → Markdown 格式给 AI |

### 可用工具（AI Agent）

| 工具名 | 用途 |
|--------|------|
| `respond_to_student` | **必用** — AI 通过此工具发送所有可见内容给学生 |
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

### 新增功能 — ✅ 高优先级问题修复

14. **✅ respond_to_student 工具** — AI 必须通过此工具发送可见内容，直接文本输出视为内部思考（静默）
    - 系统 prompt 自动增强：强制要求使用 respond_to_student
    - 输出型工具优化：respond_to_student/think/render_canvas/show_group_chat 不触发额外 API 调用
    - 后备机制：AI 若未使用该工具但产生了文本，仍会显示原始文本
15. **✅ 流式输出（Claude）** — SSE 流式 + RespondContentStreamer 增量 JSON 内容提取
    - respond_to_student 内容逐字符推送到前端（不等待完整 JSON 解析）
    - 文本块（内部思考）流式累积但不显示
    - 工具调用块完成后立即处理（canvas/group_chat 事件）
16. **✅ 流式输出（OpenAI/DeepSeek/Google）** — OpenAI 格式 SSE 流式
    - tool_calls delta 累积 + 增量 respond_to_student 流式
    - DeepSeek-reasoner reasoning_content 自动忽略
    - finish_reason 映射（stop → end_turn, tool_calls → tool_use）
17. **✅ 会话持久化** — 关闭 app 后对话不丢失
    - 后端：每轮完成后保存到 `{workspace}/.app_session.json`
    - 前端：ChatMessage/CanvasItem/GroupChatMessage 保存到 localStorage
    - LessonPage 启动自动恢复、"下课"清空会话
18. **✅ AI 输出长度控制** — 防止 AI 一次讲太多
    - 系统 prompt 增强：300 字符/次限制、提问后必须停止、单次单问题
    - 运行时监控：超 1500 字符或提问后继续 >200 字符触发警告日志

### 教学系统 Prompt 更新

- ✅ 移除 `temp_math.md` 引用（app 有 KaTeX，不需要临时文件）
- ✅ 移除 `pdftotext` 引用（教材已转 Markdown）
- ✅ 添加桌面应用环境说明（system.md 顶部）
- ✅ 群聊通过 `show_group_chat` 工具发送
- ✅ 内部准备通过 `think` 工具完成
- ✅ 苏格拉底规则强化：提问后必须停止
- ✅ 首次破冰改为叙事场景（不在群聊中）
- ✅ respond_to_student 指令自动注入（runtime.rs 层面）
- ✅ 输出长度规则注入（300 字符限制 + 单次单问题）

### 多 Agent 架构 — ✅ 三阶段流水线

19. **✅ system.md 拆分** — 原 19K 单文件拆为 6 个专用文件
    - system_core.md（教学规则 → Teaching Agent）
    - system_narrative.md（叙事规则 → Teaching Agent）
    - system_prep.md（课前准备 → Prep Agent）
    - system_post.md（课后更新 → Post Agent）
    - system_review.md（复习系统 → 共享）
    - system_chat.md（群聊规则 → Post Agent）
20. **✅ Prep Agent（Phase 1）** — 课前读取所有文件，生成结构化 lesson_brief
    - 工具：read_file, list_files, search_file, think, submit_lesson_brief
    - lesson_brief 包含：老师、章节、关键概念、知识漏洞、故事节点、教学计划
21. **✅ Teaching Agent（Phase 2）** — 精简 prompt（~5K tokens）+ lesson_brief 上下文
    - 工具：respond_to_student, show_group_chat, render_canvas, think（无文件 I/O）
    - 教学指令遵循度大幅提升（上下文不再被教材 PDF 稀释）
22. **✅ Post-Lesson Agent（Phase 3）** — 课后自动更新运行时文件
    - 工具：read/write/append_file, show_group_chat, think
    - 自动生成对话摘要作为 Post Agent 输入
23. **✅ 通用 Phase Loop** — `run_phase_loop()` 统一处理所有阶段
    - Grace period 机制（respond_to_student 后 1 轮停）
    - **respond_to_student 去重**：调用后立即从工具列表中移除，防止 AI 在 grace 期间重复调用
    - submit_lesson_brief 触发立即停止
    - 错误状态不污染共享会话（user message 延迟提交）
24. **✅ Legacy 降级** — 无 lesson_brief 时自动退回单 Agent 模式

### Bug 修复 — ✅ Teaching Agent 重复发言

25. **✅ respond_to_student 重复调用 Bug 修复** — AI 在一个教学回合中多次调用 respond_to_student，导致学生没机会回答
    - **根因**：Grace period=3 意味着 respond_to_student 后 AI 还有 3 轮迭代机会。DeepSeek 在这些迭代中再次调用 respond_to_student（因为没看到学生新消息），导致一个 turn 输出 3-4 段内容
    - **修复**：respond_to_student 调用后立即从 `active_tools` 中移除（`retain()`），AI 下一轮迭代只能用 think/show_group_chat/render_canvas
    - **Grace period 降为 1**：respond 后最多 1 轮额外迭代（给 group_chat/canvas 机会），然后强制停止
    - 文件：`src-tauri/src/ai/runtime.rs`（`run_phase_loop()` 函数）

### Phase 2 — ✅ 练习模式 + 笔记系统

26. **✅ 练习/刷题模式（AnimaTutor 方案）** — 学生甩题 → AI 角色在極光走廊场景中苏格拉底式引导解题
    - 新增 `AgentPhase::Practice`，复用 `run_phase_loop()` 引擎
    - 练习工具集：respond_to_student + render_canvas + think + read_file + search_file
    - AnimaTutor 风格 prompt：叙事场景化教学 + 文学性规则 + 反廉价角色扮演规则
    - Tauri 命令：`send_practice_message` + `set_practice_prompt`
    - 前端：PracticePage（简化版 LessonPage，无 Prep 阶段，即时对话）
    - 路由：Landing Page → /review → PracticePage
27. **✅ Agent 活动日志查看器** — 实时查看所有 Agent 阶段的工具调用
    - AgentLogPanel 组件，监听 `agent-event` 事件流
    - 显示 tool_call_start / tool_call_result / phase_change 等事件
    - 集成到 LessonPage 右侧面板 tab
28. **✅ 笔记生成系统** — AI 分析对话内容，生成结构化学习笔记
    - 后端：`generate_notes()` + `generate_anki_cards()`，使用 `call_ai_simple()` 非流式调用
    - 笔记 Prompt 包含 5 个板块：核心概念、关键公式、解题方法、**你的弱点**（个人错误分析）、**举一反三**（针对性练习题）
    - 前端：NotesPage，ReactMarkdown + KaTeX 数学公式渲染
29. **✅ Anki 卡片导出** — 从对话生成间隔复习卡片
    - TSV 格式下载（可直接导入 Anki）
    - AnkiConnect 一键推送（需本地运行 Anki + AnkiConnect 插件）
30. **✅ PDF 笔记导出** — 两种风格模板
    - 手记风（✒️）：笔记本纸背景 + 手写字体（Long Cang / Ma Shan Zheng）+ 荧光笔高亮
    - 极简风（📐）：大留白 + 衬线标题（Source Serif 4）+ 灰阶层级
    - 导出流程：提取渲染 HTML → 包裹模板样式 → 新窗口打印为 PDF
31. **✅ CLI 交互式练习模式** — 无 GUI 环境下的完整练习体验
    - `cli_practice.rs` 二进制：终端交互 + 非流式 API 调用
    - 支持 /notes, /anki, /debug, /quit 命令
    - 已通过端到端测试（3 轮高斯定律对话 + 笔记 + Anki 生成）
36. **✅ 学习进度页（ProgressPage）** — 解析 workspace 运行时文件，可视化展示学习全貌
    - 解析 progress.md → 课程记录表格（日期 / 章节 / 老师 / 掌握度）
    - 解析 knowledge_points.md → 知识点覆盖状态（done / partial / todo），按章聚合
    - 解析 session_log.md → 课堂摘要列表
    - 解析 diary.md → 学习日记条目
    - 路由：Landing Page → /progress → ProgressPage

### Bug 修复 — ✅ Phase 2 相关

32. **✅ 流式光标残留修复** — `message.isStreaming` 在流式完成后未被设为 false
    - 修复：在 `turn_complete` 和 `error` 事件处理中显式清除 isStreaming 状态
33. **✅ PracticePage 会话清理时机** — "结束练习"按钮过早清空状态导致 UI 异常
    - 修复：移除 handleEnd 中的 clearSession() 调用
34. **✅ UTF-8 边界 panic** — `&notes[..300]` 在中文文本上切到多字节字符中间
    - 修复：改用 `notes.chars().take(300).collect()`
35. **✅ Cargo default-run** — 添加二进制后 cargo run 歧义
    - 修复：Cargo.toml 添加 `default-run = "socratic-novel"`

### Phase 2 续 — ✅ Meta Prompt + 间隔复习 + PDF 导入 + 章节大纲

37. **✅ Meta Prompt 引导式 Workspace 创建** — AI 引导用户创建自定义教学系统
    - 新增 `AgentPhase::MetaPrompt`，复用 `run_phase_loop()` 引擎
    - MetaPrompt Agent 工具集：respond_to_student + think + write_file + list_files + read_file
    - 多轮对话引导用户定义：学科/教学风格/角色/课程大纲
    - AI 自动生成完整 workspace 文件（system.md / curriculum.md / characters / story.md 等）
    - 前端集成到 LandingPage "🔨创建教学系统" 入口
38. **✅ SM-2 间隔复习引擎** — 基于 SM-2 算法的智能复习调度系统
    - `review_commands.rs`：卡片 CRUD + SM-2 调度（1→3→7→14→30 天间隔）
    - JSON 持久化：`{workspace}/teacher/runtime/review_queue.json`
    - 四级评分：😣忘了(reset) / 😰模糊(×0.8) / 🤔想起来了(保持) / 😊容易(×1.3+ease)
    - 6 次成功复习后自动标记为 "mastered"
    - ReviewPage：卡片翻转 UI + 键盘快捷键（Space=翻转, 1-4=评分）
    - LandingPage 显示今日到期卡片数量徽章
    - 5 个 Tauri 命令：get_review_queue / get_review_stats / get_due_cards / update_review_card / add_review_cards
39. **✅ PDF→Markdown 导入** — 将 PDF 教材导入 workspace 并转为 Markdown
    - `pdf-extract` crate 全文提取（按 form-feed 分页）
    - `tauri-plugin-dialog` 原生文件选择器
    - 自动清理文本 + 生成结构化 Markdown
    - 保存到 `{workspace}/materials/imported_md/`
40. **✅ AI 增强 PDF 导入** — 两种 AI 增强模式
    - **文本优化模式**：原始文本 → AI → 格式化 Markdown + LaTeX 公式
    - **Vision OCR 模式**：PDF 页面图片 → Vision API → 完整内容识别
    - `ContentBlock::Image` 变体支持：Claude 原生 / OpenAI image_url 格式
    - 逐页增强进度条 + 原始/增强对比预览
41. **✅ PDFium 页面渲染引擎** — Google PDFium 集成用于 PDF 页面转图片
    - `pdfium-render` crate 动态加载（编译不需要库文件）
    - 自动搜索：app bundle → 项目 libs/ → Homebrew → 系统路径
    - `pdftoppm` 自动 fallback（系统安装 poppler 即可）
    - `scripts/download-pdfium.sh`：从 `bblanchon/pdfium-binaries` 下载
    - Tauri bundling 配置：`tauri.conf.json` resources 打包 libs/
42. **✅ 左侧栏章节大纲** — LessonPage 左侧动态课程大纲替代硬编码占位
    - 解析 `curriculum.md`：按 Unit 分组，提取课次/章节/主题/教材文件
    - 解析 `progress.md`：标记已完成章节 ✅，识别当前章节 📖
    - `ChapterOutline` 组件：可折叠单元树 + 全局/单元进度条
    - 当前章节蓝色高亮，自动展开所在单元
    - 无 curriculum.md 时显示简化状态信息（兼容自定义 workspace）
    - `curriculumParser.ts`：通用 Markdown 表格解析器

### UX 改善 — ✅ 问卷化改造 + 冲突检测

43. **✅ Meta Prompt 问卷化改造** — 长对话式引导改为前端 5 步问卷向导
    - 旧流程：AI 逐一提问 Phase 1-4 → 用户逐个回答 → 耗时多轮
    - 新流程：前端问卷收集全部信息 → 一次性提交 → AI 直接进入 Phase 5 生成
    - **5 步向导**：基础信息 → 角色创建 → 世界观 → 故事设计 → 确认总览
    - **3 种角色创建模式**：预设库选择 / 输入角色名（AI 补全）/ 原创角色
    - **20 个动漫角色预设**：按教学风格分 5 类（理论精确/直觉类比/工程实战/哲学引导/陪伴鼓励）
    - 预设角色：折木奉太郎、槙岛圣护、利威尔、白银御行、石神千空、五条悟、杀老师、�的杏寿郎、鲁路修、坂本、布尔玛、渚薰、本田透、西宫�的花、02、赫萝、薇尔莉特、旗木卡卡西、蕾姆
    - 问卷序列化为 Markdown（`# 用户设计决策总览`），meta_prompt.md 识别并跳过提问直接生成
    - meta_prompt.md 精简：1259→1042 行（删除 Phase 1-4 提问 + 平台选择 + 知识库适配）
    - 组件：`QuestionnaireWizard` + `StepSubject/Characters/World/Story/Review`
44. **✅ Workspace 名称冲突友好提示** — 创建 workspace 时重名不再报错
    - 预提交检测：提交前调用 `listWorkspaces()` 检查重名
    - 琥珀色 ⚠️ 内联警告（非弹窗）
    - 后备 catch：捕获 "already exists" 错误，自动返回名称输入界面

## 未完成 / 需要改进

### 优先级高

0. **✅ Prep Agent 后台进度查看器** — 已通过 AgentLogPanel 实现（agent-event 事件流实时显示）

### 优先级中

1. **✅ 学习进度展示** — ProgressPage.tsx 已实现：解析 progress.md / knowledge_points.md / session_log.md / diary.md，可视化展示课程记录、知识点覆盖、日志、日记
2. **✅ 深色模式** — `ThemeProvider` 组件（App.tsx）监听 store 中的 `theme` 设置，动态给 `document.documentElement` 加/移除 `dark` class；`system` 模式跟随 OS `prefers-color-scheme`，含 MediaQueryList 监听器
3. **Workspace 选择器** — 路径现已从 Rust 动态返回（不再硬编码），但 UI 仍无法手动切换 workspace
4. **✅ 模型选择器** — Settings 页面按提供商显示可选模型列表（Anthropic×4 / OpenAI×4 / DeepSeek×2 / Google×3）；切换提供商自动重置模型；`null` 表示使用 Rust 侧默认值；model 通过 `startAiSession` payload 传入后端
5. **极简风笔记模板重新设计** — 当前极简风用户不太满意，需要重新设计
6. **课后自动生成复习卡片** — Post Agent 课后自动向间隔复习队列添加卡片

### 优先级低

7. **Windows/Linux 适配** — API Key 存储需适配（目前仅 macOS Keychain）
8. **打包发布** — Tauri bundle 配置
9. **多 workspace 管理** — 创建、导入、删除
10. **render_canvas 改进** — 更丰富的图表类型、交互式图表

## 关键文件路径

### 应用代码
```
~/socratic-novel-软件开发/                   # 项目根目录
├── src/                             # 前端 (React + TS)
├── src-tauri/src/                   # 后端 (Rust)
├── src-tauri/libs/                  # PDFium 共享库（运行时需要）
├── scripts/                         # 工具脚本（download-pdfium.sh）
├── workspaces/ap-physics-em/        # AI 读写的 workspace
├── package.json                     # 前端依赖
├── src-tauri/Cargo.toml             # 后端依赖
└── PROJECT_STATUS.md                # 本文件
```

### 教学系统 Workspace
```
~/socratic-novel-软件开发/workspaces/ap-physics-em/    # 运行时 workspace（AI 读写此目录）
~/AP_Physics_EM- 学习系统/                              # 源模板（init_builtin_workspace 复制源）
```

### 关键配置
```
~/socratic-novel-软件开发/workspaces/ap-physics-em/
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
cd ~/socratic-novel-软件开发
npm run tauri dev

# 仅前端
npm run dev

# 仅后端检查
cd src-tauri && ~/.cargo/bin/cargo check

# TypeScript 类型检查
npx tsc --noEmit

# 下载 PDFium 库（PDF 页面渲染需要）
bash scripts/download-pdfium.sh

# CLI 练习模式（无 GUI 测试）
cd src-tauri
API_KEY=<your-key> PROVIDER=deepseek cargo run --bin cli_practice

# 后端单元测试
API_KEY=<your-key> PROVIDER=deepseek cargo run --bin dev_test
```

- Vite dev server: http://localhost:1420
- Tauri 监听 src-tauri/ 变化自动重编译 Rust（增量 ~5s）
- Vite HMR 前端热更新

## 设计决策记录

1. **respond_to_student 工具** — AI 必须通过此工具发送可见内容。直接文本输出视为内部思考。这从根本上解决了内部准备内容泄露问题，比正则过滤更可靠。
2. **流式 API** — Claude 用原生 SSE 格式，OpenAI/DeepSeek/Google 用 OpenAI 兼容 SSE 格式。RespondContentStreamer 实现增量 JSON 内容提取，在部分 JSON 到达时就能逐字符推送到前端。
3. **文件系统即状态** — 所有教学状态存储为 Markdown 文件，AI 通过工具读写。不用数据库，保持简单透明。
4. **Provider 抽象** — 内部类型统一为 Claude 格式（ContentBlock::Text/ToolUse/ToolResult），OpenAI 客户端负责双向翻译。
5. **输出型工具优化** — respond_to_student/think/render_canvas/show_group_chat 不触发额外 API 调用，减少延迟和成本。
6. **会话双层持久化** — 后端保存完整 AI 上下文（Message[]）到 JSON 文件，前端保存 UI 状态到 localStorage。恢复时两层同步加载。
7. **deepseek-reasoner** — 用户选择的默认模型。reasoning_content 被过滤不显示。
8. **macOS Keychain** — API Key 不存文件，通过 `security` CLI 命令存取。
9. **多 Agent 架构** — Prep → Teaching → Post 三阶段流水线。Teaching Agent 只有 ~5K tokens prompt（不含教材/文件内容），教学指令遵循度大幅提升。Prep Agent 负责读文件并生成 lesson_brief，Post Agent 负责课后更新。各阶段有独立工具集，互不干扰。
10. **Phase Loop 复用** — `run_phase_loop()` 通用循环函数，通过 `AgentPhase` enum 控制阶段行为（grace period、stop trigger、event emission），避免代码重复。
11. **respond_to_student 去重机制** — Teaching Phase 中，respond_to_student 调用后立即从可用工具列表（`active_tools`）中移除。这从根本上防止 AI 在 grace period 期间重复调用，确保每个教学回合只有一次学生可见输出。Grace period 从 3 降至 1，仅保留给 show_group_chat/render_canvas 等后续操作。
12. **Practice Mode 复用架构** — 练习模式直接复用 `run_phase_loop()` + `AgentPhase::Practice`，仅需新增 tools 和 prompt 函数，不需要新循环逻辑。CLI 二进制进一步验证了后端与 UI 的解耦。
13. **笔记生成策略** — 使用 `call_ai_simple()` 非流式调用生成结构化 Markdown，前端用 ReactMarkdown + KaTeX 渲染。PDF 导出采用 HTML 模板 + 新窗口打印方案（比 headless Chrome CLI 更可靠，不需要额外依赖）。
14. **个性化错误分析** — NOTES_PROMPT 包含「你的弱点」和「举一反三」板块，AI 分析学生在对话中的具体错误并生成针对性练习题，使笔记不只是知识总结而是个人学习诊断报告。
15. **SM-2 间隔复习** — 使用经典 SM-2 算法变体：初始间隔 1→3→7→14→30 天，ease factor 按评分动态调整（忘记重置、困难×0.8、简单×1.3+ease+0.1）。卡片以 JSON 存储在 workspace 中（`review_queue.json`），保持文件系统即状态的设计原则。
16. **PDF 导入分层架构** — 三层设计：(1) `pdf-extract` 文本提取作为基础层，(2) PDFium/pdftoppm 页面渲染作为可选增强，(3) AI Vision/文本优化作为最高层。每层独立可用，逐级增强。
17. **PDFium 动态加载** — 使用 `pdfium-render` 的运行时动态绑定（dlopen），编译不需要 PDFium 库文件。运行时按优先级搜索：app bundle → 项目 libs/ → Homebrew → 系统路径。找不到时自动 fallback 到 pdftoppm。这比静态链接更灵活，避免编译复杂度。
18. **ContentBlock::Image 多平台适配** — AI 图像内容块统一为 Claude 格式（ImageSource::Base64），OpenAI 客户端在 `build_request_body()` 中自动转换为 `image_url` data URI 格式。单纯文本消息保持 string 简单格式以兼容旧 API。
19. **Meta Prompt 问卷化** — 将 AI 逐步提问（Phase 1-4）改为前端 5 步向导。用户填完问卷后，`serializeQuestionnaire()` 将数据序列化为结构化 Markdown（`# 用户设计决策总览`），作为 AI 的第一条 user message 发送。meta_prompt.md 中 Phase 1-4 被替换为"接收用户设计决策并直接进入 Phase 5"的指令。这将 10+ 轮对话压缩为 0 轮，同时保证 AI 获得的信息量不减。
20. **角色预设库架构** — 20 个动漫角色按教学风格分 5 类（theory-precise / intuition-analogy / engineering / philosophy / companion），每个预设包含 name / gender / age / appearance / teachingStyle / personalityCore / backstoryHints / initialWarmth。三种创建模式（preset / custom-name / original）通过 `CharacterDesign.source` 字段区分。预设选中后所有字段可编辑微调，不锁死。
