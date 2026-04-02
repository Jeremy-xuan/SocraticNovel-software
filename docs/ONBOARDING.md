# SocraticNovel — 接手指南

> 本文档是接手项目的第一入口。读完本文你应该能理解整个系统并开始开发。

---

## 一、项目是什么

**SocraticNovel** 是一个 AI 驱动的「新颖式教学」桌面应用，用 Tauri 2.0（Rust 后端 + React 前端）构建。

核心理念：AI 扮演奇幻世界中的角色，用苏格拉底式提问引导学生学习（AP Physics/数学/化学等），同时推进一个沉浸式故事情节。

### 关键特性
- **多 Agent 流水线**：Prep（备课）→ Teaching（教学）→ Post（课后总结）三阶段，各自有独立工具集和 Prompt
- **沉浸式输出**：`render_canvas`（SVG/Mermaid 图表）、`show_group_chat`（群聊气泡）、`render_interactive_sandbox`（HTML 交互组件）
- **多提供商 AI**：Anthropic/OpenAI/DeepSeek/Google/GitHub Models，统一通过 `ApiBackend` 抽象
- **文件系统即状态**：所有教学状态（进度、角色、故事）存储为 Markdown 文件，AI 通过工具读写

---

## 二、快速上手（本地开发）

```bash
# 1. 安装 Rust（如未安装）
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 2. 安装前端依赖
cd ~/socratic-novel-软件开发
npm install

# 3. 下载 PDFium（PDF 渲染需要）
bash scripts/download-pdfium.sh

# 4. 启动开发模式
npm run tauri dev
# Vite: http://localhost:1420
# Rust 后端增量编译约 5-10 秒

# 5. 只检查后端是否编译通过
cd src-tauri && ~/.cargo/bin/cargo check

# 6. 运行后端集成测试（无需 API Key）
cd src-tauri && cargo test --test e2e_flow -- --nocapture
```

### 设置 API Key
1. 打开应用 → Settings → 选择 Provider（推荐 DeepSeek/deepseek-reasoner，便宜且支持推理）
2. 填入 API Key，自动存储到 macOS Keychain

---

## 三、项目结构（最重要的文件）

```
socratic-novel-软件开发/
├── src/                          # 前端 React + TypeScript
│   ├── pages/                    # 各页面组件
│   ├── lib/providerModels.ts     # 所有 AI 提供商模型列表（共享数据源）
│   └── i18n/                     # 国际化（zh/en）
│
├── src-tauri/src/                # 后端 Rust
│   ├── ai/                       # ⭐ 核心 AI 子系统（重点读这里）
│   │   ├── runtime.rs            # 主 Agent 循环（最复杂，1000+ 行）
│   │   ├── tools.rs              # 工具定义 + execute_tool() + 分阶段工具集
│   │   ├── prompt.rs             # SocraticPromptBuilder（分阶段系统提示词）
│   │   ├── client.rs             # ApiBackend enum（多提供商工厂）
│   │   ├── openai.rs             # OpenAI/DeepSeek/Google/GitHub 客户端
│   │   └── claude.rs             # Anthropic 原生客户端
│   ├── commands/                 # Tauri 命令（前端调用的 #[tauri::command]）
│   └── libs/                     # PDFium 共享库
│
├── workspaces/ap-physics-em/     # AI 读写的运行时目录
│   ├── CLAUDE.md                 # AI 启动入口（告诉 AI 该做什么）
│   ├── teacher/config/system.md  # 核心系统 Prompt（~550 行）
│   ├── materials/                # 用户上传的 PDF 教材（提取为 txt）
│   └── teacher/runtime/          # 运行时状态（课堂进度/日志等）
│
├── docs/                         # ⭐ 本文档所在目录
│   ├── ONBOARDING.md             # 你正在读的文件
│   ├── AI_SUBSYSTEM.md           # AI 子系统深度文档
│   └── CLAUDE_CODE_RESEARCH.md   # Claude Code 架构研究报告（P0-P3 依据）
│
├── PROJECT_STATUS.md             # 完整功能列表 + P3 待办 + 设计决策（46KB）
├── Architecture.md               # 完整架构文档（55KB）
└── research.md                   # 系统研究报告
```

---

## 四、AI 子系统核心流程

```
前端发起开始教学
       │
       ▼
run_phase_loop(AgentPhase::Prep)
  │  准备阶段：AI 读取教材、学习者档案，生成 lesson_brief
  │  最多 MAX_PREP_LOOPS=25 轮
       │
       ▼
run_phase_loop(AgentPhase::Teaching)
  │  教学阶段：AI 用 respond_to_student 向学生提问（苏格拉底式）
  │  最多 MAX_TEACHING_LOOPS=10 轮（每轮包含 grace period）
  │  工具集：get_teaching_tools() — 包含 render_canvas / show_group_chat
       │
       ▼
run_phase_loop(AgentPhase::Post)
  │  课后阶段：AI 生成复习卡片、更新进度档案
       │
       ▼
前端接收 complete 事件
```

### 关键常量（runtime.rs）
| 常量 | 值 | 含义 |
|------|----|------|
| `MAX_TOOL_LOOPS` | 50 | 单阶段最大 AI 轮次 |
| `MAX_PREP_LOOPS` | 25 | Prep 阶段上限 |
| `MAX_TEACHING_LOOPS` | 10 | Teaching 阶段上限 |
| `GRACE_PERIOD` | 1 | respond_to_student 后再允许1轮（供 render_canvas / show_group_chat 后续调用） |

---

## 五、最近重大修复（Phase 4.5）

### 根本原因：render_canvas 从未被调用

**问题**：AI 调用了 `render_canvas`，但前端什么都收不到。

**根本原因**（发现于 2025）：`openai.rs` 的 `build_request_body()` 中有一行黑名单过滤：
```rust
// 修复前（已删除！）：
.filter(|t| t.name != "render_canvas")
```
这行代码把 `render_canvas` 从发送给 API 的 `tools` 数组中过滤掉，AI 根本看不到这个工具，所以永远不会调用它。

**修复**：删除这行，改 `tool_choice: required` 为 `tool_choice: auto`。

详见 commit `2343c3f` 和 `docs/CLAUDE_CODE_RESEARCH.md`。

---

## 六、新增文件（Phase 4.5）

### `src-tauri/src/ai/prompt.rs` — 系统提示词构建器

```rust
let prompt = SocraticPromptBuilder::new(&config)
    .build_teaching()  // 返回 String
```

支持 6 个方法：`build_legacy()`, `build_prep()`, `build_teaching()`, `build_post()`, `build_practice()`, `build_meta_prompt()`。

`DYNAMIC_BOUNDARY` 常量标记提示词中「静态区（必须保留）」和「动态区（上下文压缩时可以压缩）」的分界线。

### `src-tauri/src/ai/client.rs` — 多提供商工厂

```rust
let backend = ApiBackend::from_provider("deepseek", api_key, model, None)?;
// 映射规则：
// "anthropic" / "custom-anthropic"  →  ApiBackend::Claude(ClaudeClient)
// "openai" / "deepseek" / "google" / "github" / "custom-openai"  →  ApiBackend::OpenAI(OpenAiClient)
```

---

## 七、P3 下一步工作

参见 `PROJECT_STATUS.md` 的 **P3 待办** 章节，四个主要方向：

1. **P3.1 会话持久化** — 教学会话 JSON 序列化到磁盘，重启后继续
2. **P3.2 Token 追踪** — `UsageTracker`，记录每轮成本
3. **P3.3 上下文压缩** — 超过 ~8000 tokens 时自动压缩旧消息
4. **P3.4 ApiClient Trait** — 完整 trait 抽象，消除 client.rs 中的 if/else dispatch

---

## 八、常见问题

**Q: AI 不调用某个工具怎么排查？**
1. 检查 `tools.rs` 中对应阶段的工具集函数（`get_teaching_tools()` 等），确认工具在列表中
2. 检查 `openai.rs` `build_request_body()`，确认没有过滤逻辑
3. 检查工具描述是否用了条件语言（"如果需要则..."），改为动词优先

**Q: 前端修改怎么看效果？**
Vite HMR 热更新，保存即生效。Rust 后端需要 `cargo check` 确认编译，`npm run tauri dev` 会自动重编译。

**Q: 添加新工具的步骤？**
1. `tools.rs` 中添加 `ToolSpec { name, description, input_schema }`
2. `execute_tool()` 添加对应 match 分支
3. 在需要的阶段函数（如 `get_teaching_tools()`）中添加工具名
4. 更新系统 Prompt（`workspaces/ap-physics-em/teacher/config/system.md`）中的工具说明

**Q: 如何切换 AI Provider？**
应用 Settings 页面 → 修改 Provider 和 API Key。代码层面：`ApiBackend::from_provider()` 处理映射。

---

## 九、更多资料

| 文档 | 内容 |
|------|------|
| `docs/AI_SUBSYSTEM.md` | AI 子系统深度文档（数据流、类型、工具系统） |
| `docs/CLAUDE_CODE_RESEARCH.md` | Claude Code 架构研究报告（P0-P3 改进依据） |
| `PROJECT_STATUS.md` | 完整功能历史 + P3 待办 + 34 条设计决策 |
| `Architecture.md` | 完整架构设计文档 |
