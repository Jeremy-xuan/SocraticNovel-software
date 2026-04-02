# Claude Code 架构研究报告
## 对比 SocraticNovel 项目，寻找可借鉴的架构改进点

**研究对象**: `ultraworkers/claw-code`（Claude Code 的 Rust+Python 逆向重写，作者声称对照真实 TypeScript 源码编写）  
**比较对象**: SocraticNovel（Tauri 2.0 桌面应用，`src-tauri/src/ai/` 目录）  
**研究目的**: 找出 AI 不调用 `render_canvas` 的根本原因，以及所有可以借鉴的架构改进点

---

## 第一章：根本原因确认——一行代码的致命 Bug

在进入宏观架构对比之前，必须先讲清楚那个已经被确认的 Bug。

### 1.1 问题现象

用户让 AI 画图表，AI 回复"环境限制无法绘图"，实际上 `render_canvas` 工具在前端已经实现，MiniMax MCP 也已配置，一切就绪。但 AI 根本不调用这个工具。

这不是提示词问题，不是 AI 的 RLHF 自我审查，不是工具描述写得不好。

### 1.2 根本原因：一行 Blacklist 过滤

```rust
// src-tauri/src/ai/openai.rs，第 177-191 行
let oai_tools: Option<Vec<serde_json::Value>> = tools.map(|defs| {
    defs.iter()
        .filter(|t| t.name != "render_canvas")  // ← 这一行！
        .map(|t| {
            serde_json::json!({
                "type": "function",
                "function": {
                    "name": t.name,
                    "description": t.description,
                    "parameters": t.input_schema,
                }
            })
        })
        .collect()
});
```

**`render_canvas` 在每一次 API 请求里都被过滤掉了。**

AI 从来没有在 `tools` 列表里看到过这个工具。你写再好的提示词也没用——LLM 只能调用它在 `tools` 数组里看到的工具。这个过滤发生在 OpenAI 格式的 API Client 里，而我们的项目对所有非 Claude 原生 API（OpenAI、DeepSeek、Google AI Studio、GitHub Models）都使用这个 Client。

### 1.3 同时存在的第二个问题：tool_choice = required

```rust
// 第 220-222 行
if !skip {
    request_body["tool_choice"] = serde_json::json!("required");
}
```

`tool_choice: "required"` 强迫模型每次都必须调用某个工具，不允许它输出纯文本。这对于需要随机应变的教学对话是有害的——AI 本该在无需工具时自由回复，却被强制召唤工具，导致行为异常。

**修复方案（一行）**：删除第 179 行的 `.filter(|t| t.name != "render_canvas")`，并将 `tool_choice` 改为 `"auto"`。

---

## 第二章：Claw Code 整体架构概览

`claw-code` 的 Rust 实现采用了极度清晰的分层架构，总计约 20,000+ 行代码，分布在以下 crate：

```
rust/crates/
├── api/          ← Anthropic API 客户端（HTTP、流式、类型定义）
├── runtime/      ← 对话核心逻辑（会话、提示、权限、Hook、压缩）
├── tools/        ← 工具注册表、执行器、子 Agent 系统
├── commands/     ← 斜杠命令处理（/help, /status, /compact 等）
├── plugins/      ← 插件管理
└── claw-cli/     ← CLI 入口（main.rs 5090 行）
```

各层职责严格分离：
- `api` crate 只负责 HTTP 通信，不知道工具是什么
- `runtime` crate 只负责对话循环，不知道具体工具实现
- `tools` crate 只负责工具注册和执行，不直接发 API 请求

这与 SocraticNovel 把所有逻辑堆在 `runtime.rs`（1528 行）里的设计形成鲜明对比。

---

## 第三章：核心运行时——ConversationRuntime

### 3.1 架构设计

Claw Code 的核心是 `ConversationRuntime<C, T>` 泛型结构体：

```rust
pub struct ConversationRuntime<C, T> {
    session: Session,
    api_client: C,           // 实现 ApiClient trait
    tool_executor: T,        // 实现 ToolExecutor trait
    permission_policy: PermissionPolicy,
    system_prompt: Vec<String>,
    max_iterations: usize,
    usage_tracker: UsageTracker,
    hook_runner: HookRunner,
}
```

通过泛型参数，`ConversationRuntime` 与具体的 API 提供商和工具实现完全解耦。在测试中可以注入 mock 客户端，在生产中注入真实客户端。

### 3.2 ApiRequest 的极简设计

```rust
pub struct ApiRequest {
    pub system_prompt: Vec<String>,
    pub messages: Vec<ConversationMessage>,
}
```

注意：**`ApiRequest` 里根本没有 `tools` 字段！**

这是关键设计决策：工具列表由实现了 `ApiClient` trait 的具体客户端自行管理，而不是在 `ApiRequest` 里传递。这意味着：

1. `ConversationRuntime` 本身不需要知道工具列表
2. 不同的 API 客户端可以有完全不同的工具过滤策略
3. 工具可见性是 API 客户端的职责，不是对话循环的职责

对比我们的项目：工具列表在 `openai.rs` 的 `build_request_body()` 方法里被构造，并且在那里被错误地过滤了。

### 3.3 run_turn 的完整执行流程

```
用户输入
    ↓
push 到 session.messages
    ↓
loop (最多 max_iterations 次):
    构造 ApiRequest { system_prompt, messages }
    ↓
    api_client.stream(request) → Vec<AssistantEvent>
    ↓
    build_assistant_message(events) → (ConversationMessage, Option<TokenUsage>)
    ↓
    usage_tracker.record(usage)
    ↓
    从 assistant_message 提取所有 ToolUse blocks
    ↓
    if pending_tool_uses.is_empty() → break（AI 纯文本回复，循环结束）
    ↓
    for each (tool_use_id, tool_name, input):
        permission_policy.authorize(tool_name, input, prompter?) 
            → PermissionOutcome::Allow | Deny
        ↓
        if Allow:
            hook_runner.run_pre_tool_use(tool_name, input)
                → HookRunResult (allowed/denied + messages)
            ↓
            if pre_hook denied → 返回 error tool_result，跳过执行
            ↓
            tool_executor.execute(tool_name, input) → Ok(output) | Err(error)
            ↓
            merge pre_hook feedback into output
            ↓
            hook_runner.run_post_tool_use(tool_name, input, output, is_error)
            ↓
            merge post_hook feedback into output (可能覆盖为 error)
            ↓
            push tool_result 到 session.messages
        ↓
        if Deny → 直接返回 error tool_result
    ↓
    继续循环（AI 看到 tool_result，继续生成）
↓
返回 TurnSummary { assistant_messages, tool_results, iterations, usage }
```

这个流程清晰、可测试、可扩展。每个步骤都有明确的职责边界。

### 3.4 对比我们项目的 run_agent_turn

我们的 `run_agent_turn`（`runtime.rs` 第 586 行）逻辑相似但有几个关键差异：

1. **没有权限系统**：工具调用不经过任何授权检查
2. **没有 Hook 系统**：工具执行前后没有拦截点
3. **没有 UsageTracker**：不追踪 token 消耗
4. **混合了 Legacy/Phase 逻辑**：`run_phase_loop` 把多个 Phase 的特殊逻辑塞进同一个循环里
5. **tool_choice: required**：强制 AI 每轮必须调用工具，而 Claw Code 使用 `ToolChoice::Auto`

---

## 第四章：工具系统——Whitelist vs Blacklist

### 4.1 Claw Code 的白名单模式

```rust
// tools/src/lib.rs，第 141-160 行
pub fn definitions(&self, allowed_tools: Option<&BTreeSet<String>>) -> Vec<ToolDefinition> {
    self.specs
        .iter()
        .filter(|spec| {
            allowed_tools.is_none_or(|allowed| allowed.contains(spec.name))
        })
        // ...
}
```

逻辑：**`allowed_tools` 为 None → 包含所有工具；为 Some(set) → 只包含 set 中的工具。**

这是白名单（opt-in）模式。新增工具无需修改过滤逻辑——只需加到注册表，默认就可用。

### 4.2 ProviderRuntimeClient 的工具管理

```rust
impl ApiClient for ProviderRuntimeClient {
    fn stream(&mut self, request: ApiRequest) -> Result<Vec<AssistantEvent>, RuntimeError> {
        let tools = tool_specs_for_allowed_tools(Some(&self.allowed_tools))
            .into_iter()
            .map(|spec| ToolDefinition { ... })
            .collect::<Vec<_>>();

        let message_request = MessageRequest {
            // ...
            tools: (!tools.is_empty()).then_some(tools),
            tool_choice: (!self.allowed_tools.is_empty()).then_some(ToolChoice::Auto),
            // ...
        };
    }
}
```

两个关键决策：
1. `tools: (!tools.is_empty()).then_some(tools)` — 没有工具时不发送 tools 字段，避免无效字段
2. `tool_choice: ToolChoice::Auto` — **Auto 而非 Required**，AI 自行决定何时调用工具

### 4.3 子 Agent 的专用工具集

```rust
fn allowed_tools_for_subagent(subagent_type: &str) -> BTreeSet<String> {
    match subagent_type {
        "Explore" => vec!["read_file", "glob_search", "grep_search", "WebFetch", "WebSearch", ...],
        "Plan"    => vec!["read_file", "glob_search", "grep_search", "TodoWrite", "SendUserMessage", ...],
        "Verification" => vec!["bash", "read_file", "write_file", "TodoWrite", ...],
        _ => vec!["bash", "read_file", "write_file", "edit_file", ...], // 通用 Agent
    }
}
```

不同职责的 Agent 获得不同的工具子集。Explore Agent 没有写文件权限，Verification Agent 有 bash 但没有 Skill 工具。这种设计：
- 降低 Agent 误操作风险
- 减少 AI 的工具选择噪音（工具越少，AI 选择越精准）
- 清晰表达每种 Agent 的权限边界

对比我们的项目：所有 Phase（Prep/Teaching/PostLesson/Practice/MetaPrompt）共用同一套工具集，只在循环内部用注释区分。这导致 Teaching Phase 的 AI 也能看到 `submit_lesson_brief` 等本不应该在 Teaching 阶段出现的工具。

### 4.4 工具描述的质量标准

Claw Code 的工具描述遵循「动词优先、精确行动」原则。我们来对比几个例子：

**Claw Code 风格（基于 PARITY.md 中真实 TypeScript 源码的参考）：**
```
"Read the contents of a file at the given path."
"Search file contents using ripgrep. Returns matching lines with context."  
"Execute a bash command. Use for running tests, builds, or other shell operations."
```

**我们项目的 render_canvas 描述（tools.rs 第 122-169 行）：**
```
"Render a visual element on the canvas. Use this tool to display charts, 
diagrams, or other visual content when the user requests them. The canvas 
is a dedicated display area in the UI..."
```

问题出在"Use this tool when..."这种条件触发语句——这会导致 AI 在判断"条件是否满足"时产生犹豫。更好的描述是直接描述工具做什么，不解释何时用。另外"visual element"这个表述可能触发 AI 的 RLHF 敏感词（"drawing"/"rendering"等视觉生成词汇被训练为谨慎）。

---

## 第五章：系统提示词——SystemPromptBuilder

### 5.1 Section-Based 架构

Claw Code 的系统提示词不是一个巨大的字符串，而是用 `SystemPromptBuilder` 构建的**分节结构**：

```rust
pub fn build(&self) -> Vec<String> {
    let mut sections = Vec::new();
    sections.push(get_simple_intro_section(...));    // 1. 角色介绍
    sections.push(get_simple_system_section());      // 2. 核心系统规则
    sections.push(get_simple_doing_tasks_section()); // 3. 任务执行原则
    sections.push(get_actions_section());            // 4. 可用动作说明
    sections.push(SYSTEM_PROMPT_DYNAMIC_BOUNDARY);  // 5. 静态/动态分界线
    sections.push(self.environment_section());       // 6. 运行环境（动态）
    if let Some(ctx) = &self.project_context {
        sections.push(render_project_context(ctx));  // 7. 项目上下文（动态）
        if !ctx.instruction_files.is_empty() {
            sections.push(render_instruction_files(...)); // 8. CLAW.md 内容（动态）
        }
    }
    if let Some(config) = &self.config {
        sections.push(render_config_section(config)); // 9. 运行时配置（动态）
    }
    sections.extend(self.append_sections.iter().cloned()); // 10. 自定义扩展（动态）
    sections
}
```

返回的是 `Vec<String>`——每个 section 独立，可以被 API 用 `\n\n` 连接，也可以单独操作。

### 5.2 SYSTEM_PROMPT_DYNAMIC_BOUNDARY

```rust
pub const SYSTEM_PROMPT_DYNAMIC_BOUNDARY: &str = "__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__";
```

这个常量字符串是**分界线**，用于区分提示词的静态部分（不依赖运行时状态）和动态部分（包含当前工作目录、日期、Git 状态等）。

在上下文压缩时，压缩算法可以：
1. **保留分界线以上的静态部分**（AI 的核心行为规范，必须保留）
2. **压缩分界线以下的动态部分**（具体的项目上下文，可以摘要替代）

这是一个精妙的工程决策：通过一个字符串常量，把"必须保留的"和"可以压缩的"分开。

### 5.3 append_section 动态注入机制

```rust
#[must_use]
pub fn append_section(mut self, section: impl Into<String>) -> Self {
    self.append_sections.push(section.into());
    self
}

// 使用示例（在 main.rs 或调用方）
let prompt = SystemPromptBuilder::new()
    .with_project_context(project_ctx)
    .append_section("# Canvas Reminder\nYou can call render_canvas to draw diagrams.")
    .build();
```

这个机制允许调用方在不修改基础系统提示的情况下注入运行时特定的提示内容。例如：
- 注入当前课程的简报（lesson_brief）
- 注入用户的偏好设置
- 注入特定 Phase 的行为约束
- **注入 canvas 提醒**

对比我们的项目：系统提示词是一个在代码里写死的巨大字符串拼接，每次改动都需要修改核心逻辑文件。

### 5.4 CLAW.md 指令文件系统

Claw Code 的 `discover_instruction_files()` 会自动在工作目录及所有父目录中寻找：
- `CLAW.md`
- `CLAW.local.md`（本地 override，不提交 git）
- `.claw/CLAW.md`
- `.claw/instructions.md`

这等价于 Claude Code 的 `CLAUDE.md` 系统。用户可以在项目根目录放一个 `CLAW.md`，里面写针对这个项目的特定指令，AI 会自动读取并遵从。

每个文件的最大字符数为 4000，全部文件总计 12000 字符的预算，超出会截断并注明。

对比我们的项目：没有类似机制，用户无法自定义 AI 的行为规则。

---

## 第六章：权限系统——PermissionPolicy

### 6.1 五级权限模式

```rust
pub enum PermissionMode {
    ReadOnly,           // 只读：只能读文件、搜索等
    WorkspaceWrite,     // 工作区写入：可以写文件，但不能执行 bash
    DangerFullAccess,   // 完全访问：包括 bash、网络、系统操作
    Prompt,             // 提示用户：每次执行危险操作都弹窗确认
    Allow,              // 无限制：绕过所有检查（测试/CI 环境）
}
```

每个工具都被分配一个所需权限级别（`tool_requirements`），当前活动模式必须 `>=` 所需模式才能执行。

### 6.2 权限检查流程

```rust
// 从 conversation.rs 的 run_turn 调用
let permission_outcome = self.permission_policy.authorize(&tool_name, &input, prompter);

match permission_outcome {
    PermissionOutcome::Allow => { /* 执行工具 */ }
    PermissionOutcome::Deny { reason } => {
        // 返回 error tool_result，AI 看到错误信息后可以调整策略
        ConversationMessage::tool_result(tool_use_id, tool_name, reason, true)
    }
}
```

当模式是 `Prompt` 时，系统会调用 `PermissionPrompter::decide()` 弹窗询问用户是否允许。当模式是 `WorkspaceWrite` 且工具需要 `DangerFullAccess` 时，也会触发 prompt。

这套系统让用户对 AI 的行为有完全的掌控权，也是 Claude Code 用于安全部署的核心机制。

### 6.3 我们项目的现状

我们的项目**没有权限系统**。所有工具执行都是直接调用，没有任何拦截机制。这意味着：
- 无法限制 AI 只能读文件
- 无法提示用户"AI 即将执行某个敏感操作"
- 无法按环境（开发/生产）切换权限级别

对于教学应用，至少应该实现 `ReadOnly` 模式，确保 AI 不会意外修改学生的文件。

---

## 第七章：Hook 系统——PreToolUse / PostToolUse

### 7.1 Hook 的设计理念

Hook 是在工具执行**前后**插入的拦截点，允许外部脚本（或内置代码）干预工具执行的结果。这是 Claude Code 实现"可观测性"和"可干预性"的核心机制。

```rust
pub struct HookRunner {
    pre_tool_use_commands: Vec<String>,
    post_tool_use_commands: Vec<String>,
}
```

### 7.2 PreToolUse Hook

在工具执行**之前**运行。可以：
1. **允许执行**（exit code 0）：把 stdout 作为额外上下文合并到工具结果里
2. **拒绝执行**（exit code 2）：工具不执行，stdout 内容作为拒绝理由返回给 AI

```rust
let pre_hook_result = self.hook_runner.run_pre_tool_use(&tool_name, &input);
if pre_hook_result.is_denied() {
    // 工具被拦截，AI 会看到"PreToolUse hook denied tool `xxx`"
    return error_tool_result(...);
}
// Hook 允许执行，把 hook 的 stdout 附加到工具输出里
output = merge_hook_feedback(pre_hook_result.messages(), output, false);
```

Hook 命令通过 stdin 接收 JSON payload（包含 tool_name 和 input），通过 exit code 表达决策。

### 7.3 PostToolUse Hook

在工具执行**之后**运行。可以：
1. **正常通过**（exit code 0）：把 stdout 附加到工具输出后面（作为额外反馈给 AI）
2. **标记为失败**（exit code 2）：即使工具成功，也把结果标记为 error，阻止 AI 信任这个结果

### 7.4 Hook 的实际用途

在 Claude Code 的实际使用场景中，Hook 被用于：
- **安全审计**：PreToolUse 检查 bash 命令是否包含危险操作，拒绝 `rm -rf` 等
- **格式验证**：PostToolUse 验证代码编辑结果是否符合项目规范
- **日志记录**：PostToolUse 把所有工具调用记录到审计日志
- **测试驱动**：PostToolUse 在文件编辑后自动运行相关测试

### 7.5 我们项目的现状与机会

我们的项目**没有 Hook 系统**。对于 SocraticNovel，Hook 有几个非常有用的应用场景：

1. **Canvas PreToolUse Hook**：在 `render_canvas` 被调用时记录日志，方便调试
2. **respond_to_student PostToolUse Hook**：验证 AI 的教学响应是否符合 Socratic 格式
3. **文件写入 PreToolUse Hook**：防止 AI 在教学模式下意外修改学生文件
4. **answer_verification PostToolUse Hook**：在验证答案后自动更新学习进度

---

## 第八章：会话持久化——Session

### 8.1 Session 的数据模型

```rust
pub struct Session {
    pub version: u32,
    pub messages: Vec<ConversationMessage>,
}

pub struct ConversationMessage {
    pub role: MessageRole,    // User | Assistant | ToolResult
    pub blocks: Vec<ContentBlock>,
}

pub enum ContentBlock {
    Text { text: String },
    ToolUse { id: String, name: String, input: String },
    ToolResult { tool_use_id: String, tool_name: String, output: String, is_error: bool },
}
```

Session 完全可序列化为 JSON，并持久化到磁盘。每次对话结束后写入文件，每次启动时从文件恢复。这实现了：
- **多会话恢复**：用 `--resume` 参数继续上次的对话
- **会话检查点**：可以保存多个会话快照
- **离线分析**：会话历史可以被外部工具分析

### 8.2 我们项目的现状

我们的项目使用 `Vec<Message>` 在内存中管理对话历史（`runtime.rs`），进程退出后全部丢失。每次重启都是全新开始。

对于 SocraticNovel，会话持久化意味着：
- 学生可以在第二天继续昨天未完成的课程
- AI 记得之前问了哪些问题，不会重复
- 可以分析学生的学习历史，优化教学策略

---

## 第九章：上下文压缩——compact_session

### 9.1 压缩的必要性

所有 LLM 都有上下文窗口限制。长时间对话会超出限制，如果不处理，要么截断历史（AI 失忆），要么报错崩溃。

### 9.2 CompactionConfig

```rust
pub struct CompactionConfig {
    pub preserve_recent_messages: usize,  // 默认 4：保留最近 4 条消息
    pub max_estimated_tokens: usize,      // 默认 10,000：触发压缩的 token 阈值
}
```

### 9.3 压缩流程

```rust
pub fn compact_session(session: &Session, config: CompactionConfig) -> CompactionResult {
    // 1. 检查是否需要压缩
    if !should_compact(session, config) {
        return CompactionResult { removed_message_count: 0, ... };
    }
    
    // 2. 保留最近 N 条消息（这些消息原样保留）
    let recent = &session.messages[session.messages.len() - config.preserve_recent_messages..];
    
    // 3. 对其余消息生成摘要（通过另一个 AI 调用）
    let summary = generate_summary(old_messages)?;
    
    // 4. 构建新的压缩 Session：
    //    [摘要消息（作为 user 消息）] + [最近 N 条消息]
    let compacted = Session {
        messages: vec![summary_message] + recent.to_vec(),
        ..
    }
}
```

压缩后的 continuation preamble（继续提示词）：

```
"This session is being continued from a previous conversation that ran out 
of context. The summary below covers the earlier portion of the conversation.

[摘要内容]

Recent messages are preserved verbatim.
Continue the conversation from where it left off without asking the user 
any further questions. Resume directly — do not acknowledge the summary..."
```

### 9.4 SYSTEM_PROMPT_DYNAMIC_BOUNDARY 与压缩的协作

在压缩时，只有 `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` 以下的动态部分（项目上下文、Git 状态等）会被重新生成，而静态部分（AI 的行为规范）会原样保留。这避免了压缩导致 AI 忘记基本规则的问题。

### 9.5 我们项目的现状

我们的项目**没有上下文压缩**。当对话进行到一定程度后，`MAX_TOOL_LOOPS: usize = 50` 会强制终止循环，或者 API 会因为 token 超限报错。

对于长课程的 SocraticNovel，这是一个实际的用户体验问题。

---

## 第十章：Token 追踪——UsageTracker

### 10.1 数据结构

```rust
pub struct TokenUsage {
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub cache_creation_input_tokens: u32,
    pub cache_read_input_tokens: u32,
}

pub struct ModelPricing {
    pub input_cost_per_million: f64,
    pub output_cost_per_million: f64,
    pub cache_creation_cost_per_million: f64,
    pub cache_read_cost_per_million: f64,
}
```

Claw Code 对每次 API 响应都记录 token 使用量，并根据模型定价计算成本。

### 10.2 默认定价

```rust
// 默认 Sonnet 级别
input:           15.0 USD/M tokens
output:          75.0 USD/M tokens
cache_creation:  18.75 USD/M tokens
cache_read:       1.5 USD/M tokens
```

Haiku 和 Opus 分别有独立的定价档位。

### 10.3 我们项目的现状

我们的项目**没有 token 追踪**。用户和开发者都不知道每次对话花了多少钱。对于 SocraticNovel 这种计划商业化的产品，成本追踪是必须的功能。

---

## 第十一章：多 Provider 抽象——ApiClient Trait

### 11.1 接口设计

```rust
pub trait ApiClient {
    fn stream(&mut self, request: ApiRequest) -> Result<Vec<AssistantEvent>, RuntimeError>;
}
```

这个 trait 只有一个方法。任何实现了这个 trait 的类型都可以作为 API 客户端注入到 `ConversationRuntime`。

### 11.2 具体实现

Claw Code 在 `api` crate 中实现了针对 Anthropic API 的 `ClawApiClient`，在 `tools/src/lib.rs` 中实现了 `ProviderRuntimeClient`（支持多 Provider）。

### 11.3 我们项目的现状

我们的项目有两个独立的 API 客户端：
- `openai.rs`：处理 OpenAI、DeepSeek、Google AI Studio、GitHub Models（OpenAI 兼容格式）
- `claude.rs`：处理 Anthropic 原生 API

这两个客户端**没有统一的 trait 抽象**。`runtime.rs` 通过条件判断选择使用哪个客户端：

```rust
// runtime.rs 中
if provider == "anthropic" {
    let claude_client = ClaudeClient::new(...);
    // 调用 claude.rs 的逻辑
} else {
    let oai_client = OpenAiClient::new(...);
    // 调用 openai.rs 的逻辑
}
```

这导致代码重复，Bug（比如 render_canvas 过滤）只出现在一个客户端里，而另一个客户端没有问题，给调试带来困难。

---

## 第十二章：全面对比表

| 维度 | Claw Code | SocraticNovel | 差距影响 |
|------|-----------|---------------|---------|
| **工具过滤策略** | 白名单（`BTreeSet<String>`） | 黑名单（`.filter(t != "render_canvas")`） | **根本 Bug：AI 看不到 render_canvas** |
| **tool_choice** | `Auto`（AI 自主决定） | `required`（强制调用工具） | AI 在无需工具时无法纯文本回复 |
| **API 请求中的 tools** | 由 ApiClient 实现管理，ApiRequest 不含 tools | 在 build_request_body 里硬编码过滤 | 耦合度高，难以测试 |
| **系统提示词结构** | `SystemPromptBuilder` + Section + `DYNAMIC_BOUNDARY` | 字符串拼接，无结构 | 无法独立更新各部分，无法支持压缩 |
| **动态提示注入** | `append_section()` | 需修改核心字符串 | 扩展性差 |
| **项目指令文件** | `CLAW.md` 自动发现（多级目录） | 无 | 无法用户自定义 AI 行为 |
| **权限系统** | `PermissionPolicy` 五级模式 | 无 | 无法限制危险操作 |
| **Hook 系统** | `PreToolUse`/`PostToolUse`（exit code 协议） | 无 | 无法拦截工具执行 |
| **会话持久化** | JSON 文件，进程间恢复 | 内存，进程退出即丢失 | 不支持跨会话记忆 |
| **上下文压缩** | `compact_session()` + AI 摘要 | 无（50次循环后强制终止）| 长课程必崩 |
| **Token 追踪** | `UsageTracker` + 定价估算 | 无 | 不知道成本 |
| **ApiClient 抽象** | `ApiClient` trait + 泛型 | 两个独立客户端，无统一接口 | 同一 Bug 可能只在部分 Provider 出现 |
| **子 Agent 工具集** | 每种 Agent 类型专用工具集 | 所有 Phase 共用工具集 | Teaching Phase 可看到不应看到的工具 |
| **Agent 迭代上限** | `DEFAULT_AGENT_MAX_ITERATIONS = 32` | `MAX_TOOL_LOOPS = 50` | 我们限制更宽松但更随意 |
| **错误返回机制** | tool_result 带 `is_error: true`，AI 自动感知 | 类似，但没有 hook 的二次处理 | 缺少 PostToolUse 验证层 |
| **多 Phase 架构** | 子 Agent 模式（每种 Agent 独立构建） | 单一循环内分支 | Phase 逻辑混杂，难以维护 |

---

## 第十三章：可立即借鉴的改进点

### 13.1 优先级 P0（直接修复 Bug）

**删除 render_canvas 黑名单过滤（1行改动）**

```rust
// openai.rs 第 177-191 行，当前代码：
let oai_tools: Option<Vec<serde_json::Value>> = tools.map(|defs| {
    defs.iter()
        .filter(|t| t.name != "render_canvas")  // ← 删除这一行
        .map(|t| { ... })
        .collect()
});

// 修复后：
let oai_tools: Option<Vec<serde_json::Value>> = tools.map(|defs| {
    defs.iter()
        .map(|t| { ... })
        .collect()
});
```

**将 tool_choice 改为 auto（1行改动）**

```rust
// 第 221 行，当前：
request_body["tool_choice"] = serde_json::json!("required");

// 修复后：
request_body["tool_choice"] = serde_json::json!("auto");
```

### 13.2 优先级 P1（高价值，中等工作量）

**改善 render_canvas 工具描述**

```rust
// tools.rs 中，当前描述（有条件触发语句，可能触发 RLHF 谨慎）：
"Render a visual element on the canvas. Use this tool to display charts, 
diagrams, or other visual content when the user requests them..."

// 建议改为（动词优先，简洁直接，无条件语句）：
"Draw a diagram, chart, or visual on the canvas. Accepts Mermaid syntax for 
flowcharts and sequence diagrams, or JSON for data charts. Always prefer 
this tool over textual descriptions when visualizing concepts."
```

**为不同 Phase 分配专用工具集**

仿照 Claw Code 的 `allowed_tools_for_subagent()`，为每个教学 Phase 定义专用工具集：

```rust
fn tools_for_phase(phase: &AgentPhase) -> Vec<&str> {
    match phase {
        AgentPhase::Prep => vec!["read_file", "submit_lesson_brief", "render_canvas"],
        AgentPhase::Teaching => vec!["respond_to_student", "render_canvas", "group_chat"],
        AgentPhase::PostLesson => vec!["write_file", "read_file"],
        AgentPhase::Practice => vec!["respond_to_student", "check_answer", "render_canvas"],
        AgentPhase::MetaPrompt => vec!["respond_to_student", "write_file"],
        AgentPhase::Legacy => vec![], // 空 = 所有工具
    }
}
```

这样 Teaching Phase 的 AI 就无法调用 `submit_lesson_brief`，减少误操作。

### 13.3 优先级 P2（中等价值，较大工作量）

**引入 SystemPromptBuilder**

仿照 Claw Code，把系统提示词拆成独立 section：

```rust
pub struct SocraticPromptBuilder {
    phase: AgentPhase,
    lesson_brief: Option<String>,
    student_profile: Option<String>,
    append_sections: Vec<String>,
}

impl SocraticPromptBuilder {
    pub fn build(&self) -> String {
        let mut sections = vec![
            self.base_role_section(),      // AI 角色定义
            self.socratic_rules_section(), // Socratic 教学规则（静态）
            "<!-- DYNAMIC_BOUNDARY -->".to_string(),
            self.phase_section(),          // Phase 特定指令（动态）
            self.student_context_section(), // 学生信息（动态）
        ];
        if let Some(brief) = &self.lesson_brief {
            sections.push(format!("# Lesson Brief\n{brief}"));
        }
        sections.extend(self.append_sections.iter().cloned());
        sections.join("\n\n")
    }
    
    pub fn inject_canvas_reminder(mut self) -> Self {
        self.append_sections.push(
            "# Canvas Usage\nAlways use render_canvas when explaining visual concepts. \
             Never describe a diagram in text when you can draw it.".to_string()
        );
        self
    }
}
```

**统一 ApiClient Trait**

```rust
// 新建 src-tauri/src/ai/client.rs
#[async_trait]
pub trait AiClient: Send + Sync {
    async fn stream_message(
        &self,
        messages: Vec<Message>,
        tools: Vec<ToolDefinition>,
        system: &str,
    ) -> Result<impl Stream<Item = AgentEvent>, AiError>;
}

// openai.rs 和 claude.rs 都实现这个 trait
impl AiClient for OpenAiClient { ... }
impl AiClient for ClaudeClient { ... }
```

### 13.4 优先级 P3（长期投资）

**会话持久化**

```rust
// 在 Session 上派生 Serialize/Deserialize
#[derive(Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub created_at: DateTime<Utc>,
    pub messages: Vec<Message>,
    pub phase_history: Vec<PhaseRecord>,
}

// 每次 phase 切换时序列化到磁盘
// 启动时从磁盘恢复
```

**Token 追踪与成本估算**

仿照 Claw Code 的 `UsageTracker`，在每次 API 响应后记录 usage，并在 UI 里显示本课程的 token 消耗和估算成本。

**上下文压缩**

当 session messages 估算超过 8000 tokens 时，调用一个轻量 AI（如 gpt-4.1-mini）对老消息生成摘要，保留最近 4 条原始消息，其余替换为摘要。

---

## 第十四章：总结

### 14.1 最重要的发现

这次研究最重要的发现是：**SocraticNovel 的 canvas 问题不是 AI 的问题，而是代码 Bug**。

`openai.rs` 第 179 行用黑名单过滤掉了 `render_canvas`。AI 从未在 tools 数组里看到这个工具，自然不会调用它。一行代码，导致了长达数月（推测）的调试困惑。

这个 Bug 揭示了一个架构问题：工具过滤逻辑分散在不该出现的地方（API 请求构建函数里），没有清晰的"工具注册表→工具过滤→API 请求"的分层。

### 14.2 Claw Code 最值得学习的三个模式

**第一：白名单工具管理**  
永远不要用黑名单过滤工具。维护黑名单是危险的——任何人新增工具时都不会想到要去更新那个黑名单。白名单强制你明确声明"这个 Agent 应该有哪些能力"。

**第二：SystemPromptBuilder + DYNAMIC_BOUNDARY**  
系统提示词应该是结构化的，而不是字符串拼接。静态规范和动态上下文应该被清晰分离，这样才能独立更新、独立压缩。

**第三：ApiRequest 不含 tools**  
工具列表是 API 客户端的职责，不是对话循环的职责。对话循环只负责把用户输入和历史消息传给客户端，工具的选择和过滤由客户端决定。这个职责分离是防止 render_canvas 这类 Bug 的根本。

### 14.3 行动计划

1. **今天（15分钟）**：删除第 179 行的黑名单过滤，把 tool_choice 改为 auto，解决根本 Bug
2. **本周（2小时）**：改善 render_canvas 工具描述，为各 Phase 分配专用工具集
3. **下个月（1-2天）**：引入 SystemPromptBuilder，统一 ApiClient Trait
4. **季度计划（1周）**：会话持久化、Token 追踪、上下文压缩

---

*研究基于 `ultraworkers/claw-code`（Rust 重写，作者声称对照真实 TypeScript 源码编写）。真实 TypeScript 源码 `instructkr/claude-code` 已被 Anthropic DMCA 下架。本报告中涉及的所有代码片段均来自 Claw Code 的 Rust 实现，不包含 Anthropic 的原始代码。*

*研究时间：2025年*  
*研究者：GitHub Copilot CLI*
