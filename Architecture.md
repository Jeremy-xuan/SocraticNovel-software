# SocraticNovel Desktop Client — 架构设计文档

> **状态**：待审阅（v2，根据反馈重写）
> **版本**：v0.2 Draft
> **日期**：2026-03-22

---

## 1. 产品概述

### 是什么
一个桌面应用，让用户安装后就能使用 SocraticNovel 沉浸式 AI 教学系统。用户不需要懂 Claude Code、不需要命令行、不需要了解 prompt engineering。

### 核心体验
1. 安装 app → 填 API key 或 OAuth 登录
2. 选择"体验 AP Physics 案例"（零配置）或"从零创建"（Meta Prompt 引导）
3. 点击"开始上课"→ AI 自动加载文件、执行启动流程
4. 左面板：课堂教学对话 / 右面板：白板画布（AI 可视化辅助）
5. 点击"下课"→ AI 执行课后更新 → 右面板切换为群聊（解锁）
6. 课后可查看群聊、复习笔记、生成 Anki 卡片

### 目标用户
- 正在学习某学科的学生（主要受众）
- 想体验沉浸式 AI 教学的好奇者
- SocraticNovel 框架的创建者/维护者

### 核心约束
- AI 必须能读写本地文件（SocraticNovel 的灵魂）
- 数据全部本地存储，不出用户电脑
- 安装包轻量（目标 < 30MB）
- 支持多家 AI 提供商
- MVP 阶段仅支持 macOS

---

## 2. 核心架构

### 2.1 分层架构图

```
┌───────────────────────────────────────────────────────┐
│                   Presentation Layer                   │
│                                                       │
│  ┌───────────┬───────────────────┬─────────────────┐ │
│  │  Sidebar  │  Lesson Panel     │  Right Panel    │ │
│  │  (导航)    │  (课堂对话)       │  (白板/群聊)    │ │
│  └───────────┴───────────────────┴─────────────────┘ │
│                                                       │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐ │
│  │ Landing Page│  │  Settings   │  │ Setup Wizard │ │
│  └─────────────┘  └─────────────┘  └──────────────┘ │
├───────────────────────────────────────────────────────┤
│                    Tauri IPC Bridge                    │
├───────────────────────────────────────────────────────┤
│                   Application Layer                    │
│                                                       │
│  ┌──────────────────────────────────────────────┐    │
│  │            AI Agent Runtime                   │    │
│  │  ┌────────────┐ ┌────────────┐ ┌──────────┐ │    │
│  │  │ Context    │ │ Tool Use   │ │ Session  │ │    │
│  │  │ Builder    │ │ Executor   │ │ Manager  │ │    │
│  │  └────────────┘ └────────────┘ └──────────┘ │    │
│  └──────────────────────────────────────────────┘    │
│                                                       │
│  ┌────────────┐ ┌─────────────┐ ┌────────────────┐  │
│  │ Auth Mgr   │ │ PDF Convert │ │ Canvas Render  │  │
│  └────────────┘ └─────────────┘ └────────────────┘  │
│  ┌────────────┐ ┌─────────────┐ ┌────────────────┐  │
│  │ Anki Gen   │ │ Notes Gen   │ │  Config DB     │  │
│  └────────────┘ └─────────────┘ └────────────────┘  │
├───────────────────────────────────────────────────────┤
│                    Storage Layer                       │
│  ┌───────────┐  ┌───────────┐  ┌──────────────────┐ │
│  │ Workspaces│  │ SQLite DB │  │      Logs        │ │
│  └───────────┘  └───────────┘  └──────────────────┘ │
└───────────────────────────────────────────────────────┘
```

### 2.2 技术栈

| 组件 | 选型 | 理由 |
|------|------|------|
| 桌面框架 | **Tauri 2.0** | Rust 后端，~10MB 安装包，跨平台潜力 |
| 前端框架 | **React 19 + TypeScript** | 生态成熟，组件库丰富 |
| 状态管理 | **Zustand** | 轻量，适合中等复杂度 |
| 样式方案 | **Tailwind CSS** | 快速开发，一致性好 |
| 本地数据库 | **SQLite** (Tauri 插件) | 设置、会话元数据 |
| Markdown 渲染 | **react-markdown + rehype** | AI 输出渲染 |
| 数学公式 | **KaTeX** | 快速 LaTeX 渲染 |
| 图表渲染 | **SVG + Mermaid** | 准图像生成（详见 §4.6） |
| PDF 转换 | **pdftotext / poppler** | 教材 PDF 转 Markdown |
| AI API | **直接 HTTP 调用** | 不引入 SDK，统一接口 |

---

## 3. 前端设计

### 3.1 应用状态机

```
打开 App
    │
    ├─ 首次启动 → Setup Wizard → Landing Page
    │
    └─ 非首次 → Landing Page
                    │
                    ├─ 点击"开始上课" → 课堂模式
                    │                     │
                    │                     └─ 点击"下课" → 课后模式
                    │                                       │
                    │                                       └─ 返回 Landing Page
                    │
                    ├─ 点击"复习/刷题" → 复习模式（独立全页面）
                    │                     │
                    │                     └─ 结束复习 → 返回 Landing Page
                    │
                    ├─ 点击"创建新系统" → Meta Prompt 引导
                    │
                    └─ 点击"设置" → 设置页面
```

### 3.2 Landing Page（主页）

用户每次打开 app 看到的第一个画面。

```
┌──────────────────────────────────────────────────┐
│                                                  │
│              SocraticNovel                        │
│                                                  │
│          AP Physics C: E&M                       │
│          上次学习：2026-03-21                      │
│                                                  │
│   ┌───────────────────┐ ┌───────────────────┐    │
│   │                   │ │                   │    │
│   │   📖 上课          │ │   🔄 复习/刷题     │    │
│   │                   │ │                   │    │
│   │  Ch.23 — 朔       │ │  待复习: 12 项     │    │
│   │  "接着昨天的       │ │  错题本: 3 题      │    │
│   │   库仑定律..."     │ │  今日推荐: 电场    │    │
│   │                   │ │                   │    │
│   │   ▶ 开始上课       │ │   ▶ 开始复习       │    │
│   │                   │ │  (首次: 选择角色)  │    │
│   └───────────────────┘ └───────────────────┘    │
│                                                  │
│   ┌────────────┐ ┌────────────┐ ┌────────────┐  │
│   │ 📝 课后笔记 │ │ 💬 查看群聊  │ │ 📊 学习进度 │  │
│   └────────────┘ └────────────┘ └────────────┘  │
│                                                  │
│   ┌──────────────────────────────────────┐       │
│   │ ＋ 创建新教学系统（Meta Prompt）       │       │
│   └──────────────────────────────────────┘       │
│                                                  │
│                              ⚙️ 设置              │
└──────────────────────────────────────────────────┘
```

**Landing Page 功能**：
- 显示当前 workspace 信息（学科、进度）
- **两个并列主入口**：
  - **"上课"卡片** → 显示当前章节、老师，点击进入课堂模式
  - **"复习/刷题"卡片** → 显示待复习数、错题数，点击进入独立的复习模式全页面
- **"课后笔记"** → 查看/导出上课笔记
- **"查看群聊"** → 只读浏览群聊历史（非课后状态下不可回复）
- **"学习进度"** → 可视化进度总览
- **"创建新教学系统"** → 启动 Meta Prompt 流程
- **"设置"** → API key、模型、切换 workspace 等

### 3.3 课堂模式（上课中）

```
┌──────────────────────────────────────────────────────────┐
│  SocraticNovel     AP Physics EM — Ch.23 (朔)    🔴 上课中│
├─────────┬──────────────────────────┬─────────────────────┤
│         │                          │                     │
│ 📖 大纲  │     [课堂对话区域]        │    🎨 白板           │
│         │                          │                     │
│ Ch.21 ✅│  窗外的光线很低。朔站在    │  ┌───────────────┐ │
│ Ch.22 ✅│  白板前，手里拿着一支黑色  │  │               │ │
│ Ch.23 ◀│  马克笔。                 │  │   [AI 生成的    │ │
│ Ch.24   │                          │  │    SVG 图表]   │ │
│ Ch.25   │  "告诉我，这个电荷周围    │  │               │ │
│ Ch.26   │   的空间发生了什么。"      │  │  ⊕ ───→ ...  │ │
│ ...     │                          │  │               │ │
│         │  你：是不是像引力场一样... │  └───────────────┘ │
│         │                          │                     │
│         ├──────────────────────────┤  上一张 / 下一张     │
│ ⚙️ 设置  │  [输入框]         发送 📎│                     │
│         │                          │  ┌───────────────┐ │
│ 🔴 下课  │                          │  │  [下课] 按钮   │ │
└─────────┴──────────────────────────┴─────────────────────┘
```

**三栏布局**：
- **左侧栏（窄）**：课程大纲/章节导航 + 设置入口 + **下课按钮**
- **中间（主面板）**：课堂教学对话
- **右侧（白板面板）**：AI 生成的可视化内容

**左侧栏说明**：
- 显示章节大纲，已完成的章节标 ✅
- 当前章节高亮标记
- 底部固定放"下课"按钮（红色，醒目）
- 下方放设置入口

**课堂对话面板**：
- 渲染 AI 输出：Markdown + KaTeX（数学公式）
- 支持流式输出（逐字显示）
- 用户输入区支持文本 + 拖入图片/文件

**白板面板**（课中激活，群聊锁定）：
- 展示 AI 通过 `render_canvas` 工具生成的图表/示意图
- 支持多页浏览（上一张/下一张）
- 课中不显示群聊（群聊在下课后才解锁）
- 详见 §4.6 准图像生成

### 3.4 课后模式（下课后）

点击"下课"按钮后：

1. AI 执行课后更新（写入 8 个运行时文件）
2. 右侧白板面板 → **自动切换为群聊面板**
3. 群聊面板解锁，用户可以查看新消息并回复

```
┌─────────┬──────────────────────────┬─────────────────────┐
│         │                          │                     │
│ 📖 大纲  │  课后更新中...            │    💬 群聊面板       │
│         │                          │                     │
│ ...     │  ✅ 进度已更新            │  [没有名字的群]      │
│         │  ✅ 课堂摘要已写入        │                     │
│         │  ✅ 复习队列已更新        │  朔：厨房水龙头      │
│         │  ✅ 群聊消息已生成        │  又漏了。            │
│         │                          │                     │
│         │  📝 生成课后笔记          │  律：我看看。        │
│         │  🗂️ 生成 Anki 卡片        │                     │
│         │                          │  凛：……别又拆       │
│         │  ← 返回主页              │  成零件。            │
│         │                          │                     │
│         │                          │  [群聊输入框]  发送  │
│ ⚙️ 设置  │                          │                     │
└─────────┴──────────────────────────┴─────────────────────┘
```

**课后面板功能**：
- 显示课后更新进度（checklist 风格）
- **"生成课后笔记"** 按钮 → 触发 AI 生成本课学习笔记
- **"生成 Anki 卡片"** 按钮 → 触发 AI 生成可导入 Anki 的卡片
- 返回主页按钮

### 3.5 复习/刷题模式（独立全页面 + 独立世界观）

从 Landing Page 进入。**和课堂模式完全平级**——有独立的全屏页面、独立的 AI 会话、**独立的叙事世界**。

#### 核心原则：复习模式不是课堂的附属品

课堂模式和复习模式是两个**完全独立的系统**，共享的只是数据接口（哪些知识点需要复习、哪些题做错了）。它们的叙事世界、角色状态、情感弧线、甚至文件系统结构，都是独立的。

参照"幽鬼"和 Universal Prompt Template v2.3 的设计模式：

| 维度 | 课堂模式 | 复习/刷题模式 |
|------|---------|-------------|
| **目标** | 教新知识，推动主线故事 | 巩固旧知，消灭盲区 |
| **叙事世界** | 主线世界观（如：学校/观测站） | **完全独立的世界观**（不同场景、不同设定） |
| **角色状态** | 主线角色弧线（阶段性变化） | 独立的角色状态和情感距离 |
| **故事容器** | story.md + story_progression.md | review_story.md + review_progression.md |
| **system prompt** | CLAUDE.md → system.md | REVIEW_BOOT.md → review_system.md |
| **节奏** | 苏格拉底引导，从容展开 | 更紧凑，场景化复习 + 刷题穿插 |
| **触发** | 按课程表顺序推进 | review_queue.md 到期 + 用户选题 |
| **文件系统** | teacher/ 目录 | teacher/review/ 目录（独立子系统） |

#### 为什么完全独立？

1. **叙事污染**：如果复习借用主线场景，主线的情感节奏会被打乱（比如主线正在"冷战"，复习时角色却要热情辅导——矛盾）
2. **架构灵活性**：复习系统可以用完全不同的叙事框架（参考幽鬼的庄园设定），甚至可以用不同的角色阵容
3. **可独立演进**：用户可以不上新课，只做复习——复习系统需要自己能撑起完整体验
4. **符合 Universal Template 的多文件架构**：每个模式有自己的 BOOT → system → story → character → state 文件链

#### 复习模式的多文件架构

参照 Universal Prompt Template v2.3 的文件系统设计：

```
teacher/review/
├── REVIEW_BOOT.md              # 复习模式启动文档（初始化后不再引用）
├── review_system.md            # 复习模式运行规则（红线、自检、校准）
├── review_story.md             # 复习世界观 + 序章（独立于主线）
├── review_characters.md        # 复习模式下的角色设定（可能与主线不同）
├── review_scene_mechanics.md   # 复习场景的教学隐喻系统
├── review_progression.md       # 复习模式故事锚点（情感弧线）
└── review_state.md             # 复习会话状态追踪（AI 每轮更新）
```

**与课堂系统的数据接口**（共享的数据，但不共享叙事）：

```
共享读取：
├── teacher/runtime/review_queue.md      # ← 课堂写入，复习读取
├── teacher/runtime/mistake_log.md       # ← 课堂写入，复习读取+写入
├── teacher/config/knowledge_points.md   # ← 课堂写入，复习读取
├── teacher/runtime/progress.md          # ← 只读，确定可复习范围
└── materials/练习册_md/                  # ← 题目来源

共享写入：
├── teacher/runtime/review_queue.md      # 复习后更新间隔
└── teacher/runtime/mistake_log.md       # 新错题
```

#### 复习模式全页面布局

```
┌──────────────────────────────────────────────────────────┐
│  SocraticNovel     复习模式 — AP Physics EM       ← 返回 │
├─────────┬──────────────────────────┬─────────────────────┤
│         │                          │                     │
│ 📋 复习  │     [复习对话区域]        │    🎨 白板           │
│  队列    │                          │                     │
│         │  [独立的叙事场景]          │  ┌───────────────┐ │
│ ⏰ 到期   │                          │  │               │ │
│ □ 电场   │  AI 在独立世界观中，以    │  │  [AI 生成的    │ │
│ □ 高斯定律│  场景化方式复习旧知识。  │  │   复习图表]   │ │
│ □ 电势   │  不是干巴巴的问答，      │  │               │ │
│ ────── │  而是在新情境中             │  └───────────────┘ │
│ 📝 刷题   │  重新应用旧概念。         │                     │
│ □ FRQ #3 │                          │  ┌───────────────┐ │
│ □ 练习册  │  用户回答 / AI 引导      │  │  📊 本次统计    │ │
│   Ch.22  │                          │  │  答对: 5/7     │ │
│         │                          │  │  薄弱: 电势    │ │
│         ├──────────────────────────┤  └───────────────┘ │
│ ⚙️ 设置  │  [输入框]         发送 📎│                     │
│         │                          │                     │
│ 🏁 结束  │                          │                     │
└─────────┴──────────────────────────┴─────────────────────┘
```

**三栏布局（与课堂一致）**：
- **左侧栏**：复习队列 + 刷题列表 + 设置 + 结束按钮
  - "到期"区：review_queue.md 中到期的复习项（App 端计算到期日期）
  - "刷题"区：可选的练习题来源
- **中间**：复习对话面板（AI + 用户，在独立世界观中展开）
- **右侧**：白板（复习图表 + render_canvas）+ 本次统计面板

#### 两种子模式

**间隔复习（Spaced Review）**：
- 读取 `review_queue.md` 中到期的复习项
- AI 在**复习模式的叙事世界**中考察旧知识
- 不是背诵检查——而是在新场景/新情境中应用旧概念（参照幽鬼的"场景化教学"）
- 白板同步展示：知识点关系图、对比图表
- 复习后更新 `review_queue.md`：
  - 回答正确 → 延长间隔（1天→3天→7天→14天→30天）
  - 回答错误 → 重置为最短间隔 + 记入 `mistake_log.md`

**刷题模式（Practice）**：
- 从 `materials/练习册_md/` 或 FRQ 题库中选题
- AI 引导解题，不直接给答案（苏格拉底法依然适用）
- 题目讲解同样在场景内完成（参照幽鬼的"场景内推导机制"）
- 同类题连对 3 题算过关
- 错题记入 `mistake_log.md`

#### 复习模式的叙事架构

复习不是枯燥的问答。参照幽鬼 v6 和 Universal Template 的设计思路，复习模式有自己完整的叙事世界：

**世界观（review_story.md）**：
- 完全独立于课堂的叙事空间
- 有自己的序章（~1500字微型小说，建立新的叙事容器）
- 自己的空间设定（五感：光线、温度、材质、声音、气味）
- 自己的角色关系和互动规则

**角色设定（review_characters.md）**：
- **由 Review Onboarding 生成**——用户自选角色，可以与课堂完全不同
- 课堂可能用凛/律/朔 + 观测站，复习可能用幽鬼 + 庄园，或任何用户喜欢的角色
- 四维度描写：表层身份、内在经历、人格内核、核心矛盾
- 遵循 Universal Template v2.3 的角色设定规范

**场景化复习（review_scene_mechanics.md）**：
- 每个学科有自己的"复习场景隐喻"（区别于课堂的教学隐喻）
- 旧知识不是被"背出来"，而是在新场景中"自然发生"
- 参照 Universal Template 的"场景内推导机制"：复杂推导也在场景内完成

**故事锚点（review_progression.md）**：
- 复习模式有自己的情感阶段（可能更轻、更日常）
- 锚点密度低于课堂（复习不需要每次都有情感事件）
- 保持"锚点必达，路径自由"原则

**状态追踪（review_state.md）**：
- AI 每轮更新，参照 Universal Template 的状态追踪模板
- 包含：当前复习进度、角色对用户的感知变化、已播种的暗线
- 每 5 轮执行校准检查点（防漂移）

#### 复习模式的生命周期

```
[用户点击"开始复习"]
  │
  ▼ App 检查
  ├ teacher/review/ 存在？
  │   ├ 否 → 启动 Review Onboarding（见上文）
  │   └ 是 → 继续 ↓
  │
  ▼ App 操作
  ├ 创建新复习会话
  ├ 解析 review_queue.md，计算到期项
  ├ 左侧栏显示复习队列 + 刷题列表
  ├ System prompt = REVIEW_BOOT.md 内容
  ├ 显示系统消息"正在启动复习..."（用户可见）
  ├ 自动发送隐藏用户消息触发 AI 回复
  │
  ▼ AI 自主操作
  ├ read_file("teacher/review/review_system.md")
  ├ read_file("teacher/review/review_story.md")
  ├ read_file("teacher/review/review_characters.md")
  ├ read_file("teacher/review/review_state.md")
  ├ read_file("teacher/runtime/review_queue.md")   # 共享数据
  ├ read_file("teacher/runtime/mistake_log.md")     # 共享数据
  ├ 生成复习场景开场 → 开始复习
  │
  ▼ 复习循环
  └ AI 从队列中选择到期项 → 场景化复习 → 用户回答
    ├ 答对 → AI 更新 review_queue.md（延长间隔）→ 下一项
    ├ 答错 → AI 记入 mistake_log.md → 引导纠正 → 下一项
    └ 穿插刷题：用户选题 → AI 在场景中引导解题

[用户点击"结束复习"]
  │
  ▼ App 操作
  ├ 向 AI 发送结束信号
  ├ AI 写入 review_state.md（保存进度）
  ├ 右侧面板显示本次复习统计
  └ 返回 Landing Page
```

#### 复习模式 Onboarding（首次进入）

**复习模式与课堂模式完全解耦。** 第一次点击"开始复习"时，不会直接进入复习，而是启动一个独立的 onboarding 流程，基于 **Universal Prompt Template v2.3** 生成复习系统的全部文件。

```
[用户第一次点击"复习/刷题"]
  │
  ├─ 检测 teacher/review/ 目录是否存在
  │
  ├─ 不存在 → 启动 Review Onboarding
  │    │
  │    ▼
  │    Review Setup Wizard（独立的引导流程）
  │    │
  │    ├ Step 1: "选择你的复习伙伴"
  │    │   - 输入角色名 + 来源作品
  │    │   - 简短描述角色（3-5句话）
  │    │   - 或选择"让 AI 推荐"
  │    │
  │    ├ Step 2: 偏好设置
  │    │   - 故事场景偏好（现代/奇幻/校园/日常...）
  │    │   - 情感基调偏好（治愈/热血/催泪...）
  │    │   - 补充要求（可选）
  │    │
  │    ├ Step 3: AI 生成
  │    │   - 将用户输入 + Universal Template v2.3 规范 → 喂给 AI
  │    │   - AI 一次性生成 teacher/review/ 下全部 7 个文件
  │    │   - 显示进度条 + 预览
  │    │
  │    ├ Step 4: 确认
  │    │   - 展示角色预览 + 序章开头
  │    │   - 用户确认 or 重新生成
  │    │
  │    └ Step 5: 完成 → 进入复习模式（输出序章 → 开始第一次复习）
  │
  └─ 已存在 → 正常启动复习会话
```

**关键设计**：
- 复习的角色/世界观可以与课堂**完全不同**——课堂用凛/律/朔+观测站，复习可以选幽鬼+庄园
- Universal Template v2.3 作为生成器，确保输出的文件结构标准化
- 用户只需要填写极少信息（角色名、来源、几句描述），AI 自动扩展
- 生成的文件存入 `teacher/review/`，之后每次进入复习模式自动加载
- 可以在设置中"重置复习角色"→ 删除 review/ 目录 → 重新 onboard

**为什么不预装复习系统？**
- 课堂系统的角色（凛/律/朔）是 SocraticNovel 框架的一部分，精心设计过
- 但复习应该是用户的**个人选择**——你喜欢什么角色就选什么角色
- 这也是复习模式的差异化卖点：课堂是框架提供的，复习是你自己定制的

### 3.6 Setup Wizard（首次启动引导）

```
Step 1: 欢迎
  "欢迎使用 SocraticNovel"

Step 2: 选择 AI 提供商
  ○ Anthropic (Claude)
  ○ OpenAI
  ○ Google (Gemini)
  ○ DeepSeek
  ○ 自定义 endpoint

Step 3: 认证
  [输入 API Key] 或 [OAuth 登录]
  [测试连接 ✅]

Step 4: 选择体验方式
  ○ "体验 AP Physics 案例"（推荐，零配置）
  ○ "从零创建我的教学系统"（Meta Prompt 引导）
  ○ "导入已有 workspace"

Step 5: 完成 → 进入 Landing Page
```

---

## 4. 后端设计 (Tauri / Rust)

### 4.1 模块划分

```
src-tauri/src/
├── main.rs                     # Tauri 入口
├── agent/
│   ├── runtime.rs              # AI Agent 核心循环
│   ├── context_builder.rs      # System prompt 构建
│   ├── tool_executor.rs        # Tool call 执行器
│   └── session.rs              # 会话管理（课堂/群聊/复习）
├── ai/
│   ├── provider.rs             # AI 提供商抽象接口
│   ├── claude.rs               # Claude API
│   ├── openai.rs               # OpenAI API
│   ├── google.rs               # Gemini API
│   └── deepseek.rs             # DeepSeek API
├── auth/
│   ├── apikey.rs               # API Key 管理
│   └── oauth.rs                # OAuth 流程
├── workspace/
│   ├── manager.rs              # Workspace CRUD
│   ├── file_ops.rs             # 沙箱化文件操作
│   └── pdf_converter.rs        # PDF → Markdown
├── canvas/
│   └── renderer.rs             # SVG/Mermaid 图表预处理
├── export/
│   ├── notes.rs                # 课后笔记生成
│   └── anki.rs                 # Anki 卡片导出
├── db/
│   └── store.rs                # SQLite
└── commands/
    └── mod.rs                  # Tauri IPC 命令
```

### 4.2 AI Agent Runtime（核心引擎）

#### Tool 定义

```json
[
  {
    "name": "read_file",
    "description": "读取 workspace 中的文件内容",
    "parameters": {
      "path": "string — 相对于 workspace 根目录的路径"
    }
  },
  {
    "name": "write_file",
    "description": "写入/覆盖 workspace 中的文件",
    "parameters": {
      "path": "string",
      "content": "string"
    }
  },
  {
    "name": "append_file",
    "description": "在文件末尾追加内容",
    "parameters": {
      "path": "string",
      "content": "string"
    }
  },
  {
    "name": "list_files",
    "description": "列出目录中的文件和子目录",
    "parameters": {
      "path": "string（可选，默认根目录）"
    }
  },
  {
    "name": "search_file",
    "description": "在文件中搜索指定文本",
    "parameters": {
      "path": "string",
      "query": "string"
    }
  },
  {
    "name": "render_canvas",
    "description": "在白板面板上渲染图表/示意图。支持 SVG 代码和 Mermaid 语法。",
    "parameters": {
      "type": "string — 'svg' | 'mermaid'",
      "content": "string — SVG 代码或 Mermaid 图表定义",
      "title": "string（可选）— 图表标题"
    }
  }
]
```

#### Agent 循环

```
用户发送消息 / App 发送启动指令
      │
      ▼
构建请求 payload
  ├ system prompt（CLAUDE.md 内容）
  ├ 对话历史
  ├ 用户消息
  └ tool 定义（含 render_canvas）
      │
      ▼
调用 AI API ─────────────────────────┐
      │                               │
      ▼                               │
AI 返回响应                            │
      │                               │
      ├─ 包含 tool_call?              │
      │    │                          │
      │    ├─ read/write/append_file  │
      │    │   → 执行文件操作          │
      │    │                          │
      │    ├─ render_canvas           │
      │    │   → 渲染到白板面板        │
      │    │                          │
      │    └─ 返回 tool_result        │
      │       → 追加到对话 ───────────┘
      │
      ├─ 只有 text?
      │    → 流式输出到课堂面板
      │
      └─ 结束
```

#### 安全边界

- **路径沙箱**：所有文件操作限制在当前 workspace 目录内，拒绝 `../` 逃逸
- **大小限制**：单文件读取上限 512KB
- **写入审计**：所有 write 操作记录到日志
- **无执行权限**：不提供 `execute_command` 工具

#### 教学质量运行时强制（四层防护）

苏格拉底教学法不仅依靠 prompt 指令，更通过架构层面的四个独立机制强制执行：

| 层级 | 机制 | 触发条件 | 效果 |
|------|------|---------|------|
| **Prompt 层** | 三铁律 + B/C 盲测 + 5 轮自检 | 始终生效 | AI 自我约束 |
| **Runtime 层** | `OutputLimiter` | 问号（?/？）后 200 字 / 硬限 1500 字 | 截断 AI 输出，物理阻止过度解释 |
| **Tool 层** | `respond_to_student` 去重 | 调用一次后移除 | 每轮只能回复一次 |
| **Reminder 层** | 铁律周期注入 | 每 10 条消息 | 隐式提醒对抗上下文漂移 |

**OutputLimiter** 在 Teaching/Practice Phase 自动创建，传入流式处理函数：
- Claude 路径：`process_claude_streaming()` 在 `TextDelta` emit 前检查
- OpenAI 路径：`process_openai_streaming()` 同样检查
- 截断后 `student_text` 仍完整保留（用于课后分析），仅前端显示被截断

**动态教学节奏**：`build_teaching_prompt()` 从 `lesson_brief` 检测学习者水平关键词：
- `进阶` / `advanced` → 1-2 rounds per idea
- `中等` / `intermediate` → 2-3 rounds per idea
- 默认 → 3-5 rounds per idea

**教材临时查阅**：Teaching Phase 提供 `read_teaching_material` 工具（只读，限 `materials/` 目录），AI 可临时查阅课本但无法读取教案文件。

### 4.3 会话管理

App 管理三种独立会话类型：

| 会话类型 | 触发方式 | System Prompt 链 | 可用工具 | 叙事世界 |
|---------|---------|-----------------|---------|---------|
| **课堂会话** | Landing Page → "开始上课" | CLAUDE.md → system.md → story.md | 全部（含 render_canvas） | 主线世界观 |
| **复习会话** | Landing Page → "复习/刷题" | REVIEW_BOOT.md → review_system.md → review_story.md | 全部（含 render_canvas） | **独立世界观** |
| **群聊会话** | 课后 → 右面板自动切换 | `group_chat.md` 内容 | read_file, write_file | 群聊人格 |

- 每种会话有独立的对话历史和 system prompt
- **课堂和复习是平级模式**，都有完整的三栏布局、白板支持、独立叙事世界
- 复习模式有自己的多文件架构（`teacher/review/` 目录下 7 个文件）
- 课堂会话在点击"下课"时结束，触发课后更新
- 复习会话在点击"结束复习"时结束，更新 review_queue.md、mistake_log.md 和 review_state.md

### 4.4 课堂生命周期

```
[点击"开始上课"]
  │
  ▼ App 操作
  ├ 创建新课堂会话
  ├ 清空 temp_math.md
  ├ 设置 system prompt = CLAUDE.md 内容
  ├ 显示系统消息"正在启动课堂..."（用户可见）
  ├ 自动发送隐藏用户消息触发 AI 回复
  │
  ▼ AI 自主操作
  ├ read_file("teacher/runtime/progress.md")
  ├ read_file("teacher/runtime/review_queue.md")
  ├ read_file("teacher/characters/saku.md")  // 当课老师
  ├ read_file("teacher/story_progression.md")
  ├ read_file("materials/textbook/ch23.md")
  ├ 生成课前过渡场景 → 开始教学
  │
  ▼ 教学循环
  └ 用户 ↔ AI 苏格拉底对话
    ├ AI 可能调用 render_canvas 展示图表
    ├ AI 可能调用 read_file 加载练习题
    └ 持续直到...

[用户点击"下课"按钮]
  │
  ▼ App 发送信号
  ├ 向 AI 发送："今天的课到这里。请执行课后更新流程。"
  │
  ▼ AI 执行课后更新
  ├ write_file("teacher/runtime/progress.md", ...)
  ├ write_file("teacher/runtime/session_log.md", ...)
  ├ write_file("teacher/config/knowledge_points.md", ...)
  ├ write_file("teacher/runtime/review_queue.md", ...)
  ├ write_file("teacher/runtime/mistake_log.md", ...)
  ├ write_file("teacher/runtime/wechat_unread.md", ...)
  ├ write_file("teacher/runtime/diary.md", ...)
  │
  ▼ App 操作
  ├ 将 wechat_unread.md 追加到 wechat_group.md
  ├ 右侧面板切换为群聊
  ├ 显示课后操作按钮（笔记、Anki）
  └ 课堂会话结束
```

### 4.5 Context Builder

**核心设计**：App 不硬编码加载逻辑。

- System prompt = CLAUDE.md 的完整内容
- CLAUDE.md 自身定义了"先读 progress.md，再读当课角色文件……"
- AI 通过 `read_file` 工具自主加载它需要的文件
- **好处**：换学科（有机化学）时，CLAUDE.md 不同，加载策略自然不同。App 是通用的。

### 4.6 准图像生成（Canvas System）

#### 问题
教学中很多概念必须有图才讲得清楚：电场线分布、电路图、PPF 曲线、矢量分解示意图……但不调用图像生成 API。

#### 解决方案
AI 通过 `render_canvas` 工具生成**结构化图形代码**，App 在白板面板中渲染。

**支持的格式**：

| 格式 | 适用场景 | 示例 |
|------|---------|------|
| **SVG** | 精确图形：电场线、电路图、矢量分解 | 点电荷周围的径向场线 |
| **Mermaid** | 流程图、关系图、状态机 | 解题思路流程图 |

**SVG 为什么合适**：
- AI（尤其是 Claude/GPT）已经能生成合理的 SVG 代码
- SVG 是矢量格式，缩放不失真
- 可以表达物理图形：场线、箭头、标注、坐标系
- 不需要任何外部 API
- 渲染零延迟

**示例——AI 调用 render_canvas**：
```json
{
  "name": "render_canvas",
  "parameters": {
    "type": "svg",
    "title": "点电荷的电场线",
    "content": "<svg viewBox='0 0 400 400'>...（AI 生成的 SVG 代码）...</svg>"
  }
}
```

白板面板接收到后直接渲染 SVG。用户看到一张点电荷电场线的示意图。

**白板面板的交互**：
- 支持多页浏览（AI 可能在一课中生成多张图）
- 点击放大/缩小
- MVP 不做手动绘图，只展示 AI 生成的内容
- Phase 3 可以考虑用户在白板上标注

### 4.7 PDF 转换

```
用户在 Settings 中导入 PDF
  → 调用 pdftotext (poppler)
  → 生成 Markdown
  → 存入 workspace/materials/
  → AI 通过 read_file 访问
```

macOS 可通过 `brew install poppler` 获取 pdftotext。App 首次使用 PDF 功能时检测并提示安装。

---

## 5. 认证与 API 集成

### 5.1 统一 Provider 接口

```rust
trait AIProvider {
    fn name(&self) -> &str;
    fn send_message(&self, messages: Vec<Message>, tools: Vec<Tool>, stream: bool) -> Result<Response>;
    fn supports_tool_use(&self) -> bool;
    fn supports_streaming(&self) -> bool;
}
```

所有提供商实现同一接口，Agent Runtime 不关心底层用的是哪家 API。

### 5.2 支持的提供商

| 提供商 | API Key | OAuth | Tool Use | 流式输出 |
|--------|---------|-------|----------|---------|
| Anthropic (Claude) | ✅ | ✅ (Phase 3) | ✅ | ✅ |
| OpenAI | ✅ | ✅ (Phase 3) | ✅ | ✅ |
| Google (Gemini) | ✅ | ✅ (Phase 3) | ✅ | ✅ |
| DeepSeek | ✅ | ❌ | ✅ | ✅ |
| 自定义 Endpoint | ✅ | ❌ | 取决于后端 | 取决于后端 |

### 5.3 OAuth 流程（Phase 3）

```
用户点击 "OAuth 登录"
  → 打开系统浏览器跳转授权页
  → 用户授权
  → 回调 deep link (socraticnovel://auth/callback)
  → 获取 access token
  → 存入 macOS Keychain
```

### 5.4 密钥存储

- 使用 macOS **Keychain** 加密存储
- 不存明文，不写数据库
- 卸载 App 不删除密钥（保护用户数据）

---

## 6. 课后扩展功能

### 6.1 课后笔记

课后点击"生成笔记"，触发专门的 AI 请求：

- 输入：本课对话历史 + session_log.md
- 输出：结构化的学习笔记（Markdown）
  - 今日学习的知识点总结
  - 关键公式/概念
  - 易错点提醒
  - 与前课知识的关联
- 保存到 workspace/notes/ 目录
- 支持导出为 PDF

### 6.2 Anki 卡片生成

课后点击"生成 Anki 卡片"，触发 AI 生成：

- 输入：本课知识点 + mistake_log.md 中的错题
- 输出：Anki 兼容格式（CSV 或 .apkg）
  - 正面：问题/概念
  - 背面：答案/解释
  - 标签：学科、章节、难度
- 导出文件用户可直接导入 Anki

### 6.3 复习/刷题模式

> 复习/刷题的详细设计见 **§3.5**。这里补充后端相关的设计要点。

复习模式是**与课堂完全平级的独立系统**，有自己的全页面、三栏布局、AI 会话、多文件架构和独立叙事世界。

**后端要点**：
- 独立的 System Prompt 链：REVIEW_BOOT.md → review_system.md → review_story.md → review_characters.md
- 复习会话读取 `teacher/review/` 下的独立文件，不触碰主线 story.md / story_progression.md
- 通过 `teacher/runtime/review_queue.md` 和 `mistake_log.md` 与课堂系统交换数据
- 间隔复习算法在 App 端实现（解析 review_queue.md 的日期字段），减轻 AI 负担
- 刷题的"连对 3 题算过关"逻辑也由 App 追踪
- 复习 AI 会话每轮更新 `review_state.md`（状态追踪 + 校准检查点）
- Meta Prompt 需要同时生成课堂和复习两套文件

---

## 7. 本地数据结构

### 7.1 文件系统

```
~/SocraticNovel/
├── workspaces/
│   ├── ap-physics-em/                # SocraticNovel 标准结构
│   │   ├── CLAUDE.md                 # 课堂模式启动文档
│   │   ├── group_chat.md             # 🆕 群聊模式 system prompt
│   │   ├── teacher/
│   │   │   ├── story.md              # 课堂主线故事
│   │   │   ├── story_progression.md  # 课堂故事锚点
│   │   │   ├── config/
│   │   │   ├── characters/           # 角色基底（两种模式共享）
│   │   │   ├── runtime/              # 运行时状态（含共享数据）
│   │   │   │   ├── progress.md
│   │   │   │   ├── review_queue.md   # ← 课堂写入，复习读取+写入
│   │   │   │   ├── mistake_log.md    # ← 两种模式共享
│   │   │   │   └── ...
│   │   │   └── review/               # 🆕 复习模式独立文件系统
│   │   │       ├── REVIEW_BOOT.md    # 复习模式启动文档
│   │   │       ├── review_system.md  # 复习运行规则
│   │   │       ├── review_story.md   # 复习世界观 + 序章
│   │   │       ├── review_characters.md  # 复习模式角色设定
│   │   │       ├── review_scene_mechanics.md  # 场景化复习机制
│   │   │       ├── review_progression.md  # 复习故事锚点
│   │   │       └── review_state.md   # 复习会话状态追踪
│   │   ├── materials/
│   │   └── notes/                    # 课后笔记（App 生成）
│   │       ├── ch23-notes.md
│   │       └── ch23-anki.csv
│   │
│   └── my-organic-chem/
│
├── app-data/
│   ├── settings.db
│   ├── meta-prompt.md                # 内置 Meta Prompt（含复习系统生成规范）
│   └── builtin-workspaces/           # 内置案例（只读模板）
│       └── ap-physics-em/
│
└── logs/
```

### 7.2 SQLite Schema

```sql
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_opened_at TEXT,
    subject TEXT,
    current_chapter TEXT,
    current_teacher TEXT
);

-- 对话历史（用于 UI 回显，不影响 AI context）
CREATE TABLE chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id TEXT NOT NULL,
    session_type TEXT NOT NULL,  -- 'lesson' | 'group_chat' | 'review'
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,          -- 'user' | 'assistant' | 'system' | 'tool'
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- 白板面板历史
CREATE TABLE canvas_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    type TEXT NOT NULL,          -- 'svg' | 'mermaid'
    title TEXT,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
);
```

---

## 8. 安全考虑

| 风险 | 对策 |
|------|------|
| API Key 泄露 | macOS Keychain 加密存储 |
| AI 路径逃逸 | Tool executor 限制在 workspace 内，拒绝 `../` |
| 大文件读取 | read_file 上限 512KB |
| XSS（SVG 注入） | 白板渲染 SVG 前做安全过滤（移除 script 标签等） |
| 数据本地化 | 所有数据本地存储，不上传 |
| 写入审计 | 所有 write_file 记录到日志 |

---

## 9. 开发路线图

### Phase 1: 核心 MVP

**目标**：能上一堂完整的课。

| 任务 | 说明 |
|------|------|
| Tauri + React 项目搭建 | 基础框架 |
| AI Agent Runtime | tool-use 循环引擎 |
| Claude API 集成（API Key） | 先接 Claude 一家 |
| 文件系统操作 | read/write/list（沙箱化） |
| Landing Page | 主页 + "开始上课"/"下课"按钮 |
| 课堂面板 | Chat UI + Markdown 渲染 |
| 白板面板 | SVG 渲染（render_canvas） |
| 下课流程 | 触发课后更新 + 切换到群聊 |
| 群聊面板 | 显示 wechat_group.md + 可回复 |
| 设置页（API Key + workspace 切换） | 基础设置 |
| 内置 AP Physics workspace | 开箱可用 |
| Setup Wizard | 首次启动引导 |

**验收标准**：
- 安装 App → 输入 API Key → 选 AP Physics → 点击"开始上课"
- AI 成功读取文件、开始教学、白板能显示图表
- 点击"下课"→ AI 更新文件 → 群聊解锁 → 可以互动
- 返回主页，下次"开始上课"AI 能接上进度

### Phase 2: 完整体验

| 任务 | 说明 |
|------|------|
| **复习/刷题全页面** | 独立模式，三栏布局，独立 AI 会话 + 叙事线 |
| **复习 System Prompt** | review_system.md 或 CLAUDE.md 复习段，定义复习模式行为 |
| **间隔复习引擎** | App 端解析 review_queue.md 到期项 + 复习后更新间隔 |
| Meta Prompt 引导流程 | 从零创建新系统 |
| KaTeX 数学公式渲染 | 课堂面板内 LaTeX |
| PDF → Markdown | 教材导入 |
| OpenAI / Gemini / DeepSeek 集成 | 多提供商 |
| 课后笔记生成 | AI 生成结构化笔记 |
| Anki 卡片导出 | 可导入 Anki |
| 深色模式 | UI 偏好 |
| 左侧栏：章节大纲 + 进度 | 课程导航 |

### Phase 3: 打磨与分发 ✅ (v0.3.1)

| 任务 | 状态 | 说明 |
|------|------|------|
| 多 Workspace 管理 | ✅ | 创建/切换/删除 workspace，Landing Page 卡片/输入双模式 |
| 课后自动复习卡片 | ✅ | Post Agent 完成后自动提取 3-5 张 SM-2 卡片 |
| Mermaid 图表支持 | ✅ | render_canvas type=mermaid，前端 mermaid.js 渲染 |
| 极简风笔记模板 | ✅ | Notion/Craft 风格重新设计 |
| Workspace 导入/导出 | ✅ | .snworkspace zip 格式，支持名称冲突处理 |
| 多语言 UI（中/英） | ✅ | react-i18next，609 翻译键，跟随系统语言 |
| CI/CD + macOS DMG | ✅ | GitHub Actions 自动构建，Universal Binary (ARM64+Intel) |
| Windows 支持 | ✅ | keyring 跨平台凭证存储，跨平台路径适配 |
| 白板用户标注 | ✅ | 画笔/文字/箭头/高亮/橡皮擦，5 色选择 |
| 练习模式增强 | ✅ | 幽鬼α + AnimaTutor v2.3 双协议选择 |
| OAuth 登录 | ⏭️ 跳过 | Anthropic 无公开 OAuth，ROI 不足 |
| 社区 Workspace 分享 | ⏭️ 延后 | 需要后端服务，架构变更大 |
| DMG 签名公证 | ⏭️ 延后 | 需 Apple Developer $99/年 |

### Phase 3.5: 教学质量优化补丁 ✅

| 任务 | 状态 | 说明 |
|------|------|------|
| OutputLimiter 接入 | ✅ | 运行时截断：问号后 200 字 / 硬限 1500 字，Teaching+Practice 生效 |
| 铁律周期提醒 | ✅ | 每 10 条消息注入隐式三铁律自检，对抗长上下文漂移 |
| 教材只读访问 | ✅ | `read_teaching_material` 工具，限 materials/ 目录 |
| 动态教学节奏 | ✅ | learner_profile → lesson_brief → 自动调节 rounds/idea |
| Runtime Bug 修复 | ✅ | localStorage 键统一 + workspaces_dir Result + useEffect 依赖 |
| E2E 集成测试 | ✅ | 15 步完整流程，`cargo test --test e2e_flow` |
| 分发改善 | ✅ | Ad-hoc 签名 + install.sh + Homebrew Cask |
| 跨项目同步 | ✅ | SYNC_GUIDE.md（Framework↔Desktop 同步矩阵） |

### Phase 4: 深度优化与用户增长 (v0.4.0+)

#### 4.1 — UX 深度优化

| 任务 | 状态 | 说明 |
|------|------|------|
| 全局键盘快捷键系统 | 🔲 | LessonPage 快捷键 + 全局 Cmd+,/Cmd+N + tooltip 提示 |
| 白板增强（缩略图 + 全屏） | 🔲 | SVG 缩略图预览、全屏模式、缩放平移、Mermaid 导出 |
| 对话体验优化 | 🔲 | 虚拟滚动、对话搜索、消息复制、长回复折叠 |
| 课程会话历史 | ✅ | `HistoryPage.tsx` + `history_commands.rs`，自动保存/按日期浏览/只读回顾 |

#### 4.2 — 性能与稳定性

| 任务 | 说明 |
|------|------|
| Review Queue SQLite 迁移 | SM-2 从 JSON → SQLite，支持 10K+ 卡片 |
| 会话状态韧性 | 自动 checkpoint、意外退出恢复、AI 超时重试 |
| Gemini Vision 适配 | PDF AI 增强支持 Gemini Vision inline_data 格式 |

#### 4.3 — 内容生态

| 任务 | 说明 |
|------|------|
| 教学协议市场 | 3-5 个预设协议 + 浏览界面 + 用户自定义保存 |
| Workspace 模板库 | 预设学科模板（数学/化学/编程/语言） |
| 学习数据分析仪表板 | 学习时间统计、知识点热力图、SM-2 趋势、连续打卡 |

#### 4.4 — 安全与分发

| 任务 | 说明 |
|------|------|
| Tauri 自动更新 | plugin-updater + GitHub Releases 更新源 |
| 数据导出与备份 | 全量加密导出、定时自动备份 |

---

## 10. 已确认事项

| # | 问题 | 决定 |
|---|------|------|
| 1 | App 名称 | **SocraticNovel**，不改 |
| 2 | 课堂启动消息 | App 自动发送系统消息"正在启动课堂..."（用户可见），触发 AI 自主读文件并开讲 |
| 3 | 群聊 System Prompt | 单独维护 `group_chat.md` 文件，由教学系统定义 |
| 4 | SVG 生成质量 | 先假设 AI 直接生成 SVG，MVP 后验证质量；不行再引入模板库 |
| 5 | 收费模式 | MVP 免费 + 用户自带 API Key；架构预留代理/订阅扩展点 |
| 6 | Review Onboarding AI 消耗 | 可接受（一次性 ~$0.10-0.25），用户首次进入复习时触发 |
| 7 | Meta Prompt 联动 | 分两次 onboard：Meta Prompt 先生成课堂系统；复习系统延迟到用户首次进入复习模式时单独创建 |
