# AI 子系统深度文档

> 本文档聚焦于 `src-tauri/src/ai/` 目录，供需要理解或修改 AI 核心逻辑的开发者阅读。

---

## 模块概览

```
src-tauri/src/ai/
├── mod.rs          # 模块声明 + 公共类型（ConversationState, AgentPhase 等）
├── runtime.rs      # ⭐ 主 Agent 循环（最核心）
├── tools.rs        # ⭐ 工具定义 + 分阶段工具集 + execute_tool()
├── prompt.rs       # ⭐ SocraticPromptBuilder（P2 新增）
├── client.rs       # ⭐ ApiBackend 工厂（P2 新增）
├── openai.rs       # OpenAI/DeepSeek/Google/GitHub 流式客户端
├── claude.rs       # Anthropic 原生流式客户端
└── meta_prompt.md  # include_str! 嵌入的 meta_prompt 提示词文件
```

---

## 核心类型

### `ConversationState`（mod.rs 或 runtime.rs）
```rust
pub struct ConversationState {
    pub messages: Vec<Message>,        // 完整对话历史
    pub workspace_path: String,        // AI 读写的工作区路径
    pub tools: Vec<ToolSpec>,          // 当前阶段可用工具列表
    pub provider: String,              // "anthropic" / "openai" / "deepseek" / ...
    pub model: String,                 // 模型名称（如 "deepseek-reasoner"）
    pub api_key: String,
}
```

### `AgentPhase`（runtime.rs）
```rust
pub enum AgentPhase {
    Legacy,    // 旧版单循环（向后兼容）
    Prep,      // 备课阶段（读教材、生成 lesson_brief）
    Teaching,  // 教学阶段（苏格拉底提问）
    Post,      // 课后总结（卡片/进度更新）
    Practice,  // 练习模式
    MetaPrompt, // Workspace 问卷初始化
}
```

### `Message`（内部 Claude 格式）
```rust
pub struct Message {
    pub role: String,                   // "user" | "assistant"
    pub content: Vec<ContentBlock>,
}

pub enum ContentBlock {
    Text(String),
    ToolUse { id, name, input: Value },
    ToolResult { tool_use_id, content: Vec<ContentBlock> },
    Image { source: ImageSource },
}
```
OpenAI 客户端在发送时自动将此格式翻译为 OpenAI API 格式。

---

## runtime.rs — 主循环详解

### `run_phase_loop(state, phase, app, window)` — 核心函数
```
入参：ConversationState（带 messages 历史）+ AgentPhase
出参：无（通过 Tauri 事件 emit 到前端）

流程：
1. 根据 phase 选择系统提示词（SocraticPromptBuilder）
2. 根据 phase 选择工具集（get_*_tools()）
3. 循环（最多 max_loops 次）：
   a. 调用 ApiBackend.send_message()（流式）
   b. 收集响应 ContentBlock
   c. 如果有 ToolUse → execute_tool() → 追加 ToolResult → 继续循环
   d. 如果触发 stop_trigger（如 respond_to_student）→ 进入 grace period
   e. grace period 结束 → 结束阶段
4. emit phase_complete 事件到前端
```

### Grace Period 机制
Teaching Phase 中，`respond_to_student` 工具调用后：
1. 该工具从 `active_tools` 中**移除**（防止重复调用）
2. 进入 1 轮 grace period（允许 AI 继续调用 `render_canvas` / `show_group_chat` 等输出工具）
3. Grace period 结束 → 发出 `student_turn` 事件 → 前端展示学生输入框

---

## tools.rs — 工具系统

### 分阶段工具集
```rust
pub fn get_prep_tools()     -> Vec<ToolSpec>  // 备课：read_file, write_file, think
pub fn get_teaching_tools() -> Vec<ToolSpec>  // 教学：respond_to_student, render_canvas, show_group_chat, think
pub fn get_post_tools()     -> Vec<ToolSpec>  // 课后：write_file, think
pub fn get_practice_tools() -> Vec<ToolSpec>  // 练习：respond_to_student, think
pub fn get_meta_prompt_tools() -> Vec<ToolSpec> // Meta：write_file
```

**重要**：`get_teaching_tools()` 中必须包含 `render_canvas`，否则 AI 永远无法调用它。这是 Phase 4.5 P0 Bug 的根本所在。

### execute_tool(workspace_path, tool_name, input) -> (String, bool)
3 个参数（注意：之前存在 4 参数调用的编译错误，已在 P0 修复）。

返回 `(output_string, is_output_type_tool)`。
`is_output_type_tool = true` 的工具（如 `respond_to_student` / `render_canvas`）不触发额外 API 调用。

---

## prompt.rs — 系统提示词

### `SocraticPromptBuilder<'a>`
```rust
pub struct SocraticPromptBuilder<'a> {
    config: &'a WorkspaceConfig,
}

impl<'a> SocraticPromptBuilder<'a> {
    pub fn new(config: &'a WorkspaceConfig) -> Self
    pub fn build_legacy(&self)     -> String
    pub fn build_prep(&self)       -> String
    pub fn build_teaching(&self)   -> String
    pub fn build_post(&self)       -> String
    pub fn build_practice(&self)   -> String
    pub fn build_meta_prompt(&self) -> String
}
```

### `DYNAMIC_BOUNDARY` 常量
```
────────────── 以上为静态区（上下文压缩时必须保留）──────────────
────────────── 以下为动态区（上下文压缩时可以摘要替换）──────────────
```
用于 P3.3 上下文压缩：静态区包含角色设定/世界观/铁律，动态区包含当前课堂状态/历史。

---

## client.rs — 多提供商抽象

### `ApiBackend` enum
```rust
pub enum ApiBackend {
    Claude(ClaudeClient),
    OpenAI(OpenAiClient),
}

impl ApiBackend {
    pub fn from_provider(
        provider: &str,
        api_key: &str,
        model: &str,
        custom_url: Option<&str>,
    ) -> Result<Self, String>
}
```

### Provider 映射
| provider 字段 | 映射到 |
|--------------|--------|
| `"anthropic"` | `ApiBackend::Claude` |
| `"custom-anthropic"` | `ApiBackend::Claude`（自定义 base_url） |
| `"openai"` / `"deepseek"` / `"google"` / `"github"` | `ApiBackend::OpenAI` |
| `"custom-openai"` / `"custom"` | `ApiBackend::OpenAI`（自定义 base_url） |

---

## openai.rs — 关键实现细节

### build_request_body() 中的历史 Bug（已修复）
```rust
// P0 修复前（已删除）：
let tools: Vec<_> = tools.iter()
    .filter(|t| t.name != "render_canvas")  // ← 这行黑名单导致 AI 永远看不到 render_canvas
    .collect();

// P0 修复后：
let tools: Vec<_> = tools.iter().collect();  // 不过滤

// P0 修复：tool_choice 改为 auto
"tool_choice": "auto"   // 之前是 "required"，强制每轮必须调用工具
```

### GPT-5.x 兼容性
`build_request_body()` 中自动检测 model prefix：
```rust
if model.starts_with("gpt-5") || model.starts_with("o1") || model.starts_with("o3") {
    body["max_completion_tokens"] = json!(max_tokens);
} else {
    body["max_tokens"] = json!(max_tokens);
}
```

---

## P3 实现指引

### P3.1 会话持久化
```rust
// 新建 ai/session_store.rs
pub fn save_session(workspace_path: &str, messages: &[Message]) -> Result<()>
pub fn load_session(workspace_path: &str) -> Result<Option<Vec<Message>>>
// 存储路径：{workspace_path}/session_state.json
```

### P3.2 Token 追踪
```rust
// 新建 ai/token_tracker.rs
pub struct UsageTracker {
    pub total_input_tokens: u64,
    pub total_output_tokens: u64,
}
// Claude API 响应中 usage.input_tokens / usage.output_tokens
// OpenAI API 响应中 usage.prompt_tokens / usage.completion_tokens
```

### P3.3 上下文压缩
```rust
// 新建 ai/compaction.rs
pub async fn compact_if_needed(
    messages: &mut Vec<Message>,
    backend: &ApiBackend,
    threshold_tokens: usize,  // 建议 8000
    preserve_recent: usize,   // 建议 4
) -> Result<bool>  // 返回是否进行了压缩
// 参考 claw-code compact.rs COMPACT_CONTINUATION_PREAMBLE 常量
```

### P3.4 ApiClient Trait（更深层重构）
```rust
// 修改 ai/client.rs
#[async_trait]
pub trait ApiClient: Send + Sync {
    async fn send_message(
        &self,
        messages: &[Message],
        system: &str,
        tools: &[ToolSpec],
        on_chunk: impl Fn(ContentBlock) + Send,
    ) -> Result<Vec<ContentBlock>>;
}
```
