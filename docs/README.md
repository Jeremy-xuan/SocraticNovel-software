# docs — SocraticNovel 知识库

> **接手项目从这里开始。** 本目录包含接手和开发 SocraticNovel 所需的所有背景知识。

---

## 入口文档

| 文件 | 适合谁读 | 内容 |
|------|---------|------|
| **[ONBOARDING.md](ONBOARDING.md)** | 所有新加入者 | 项目介绍、快速上手、目录结构、最近修复 |
| **[AI_SUBSYSTEM.md](AI_SUBSYSTEM.md)** | 修改 AI 逻辑的开发者 | AI 子系统深度文档（类型/流程/工具/Provider） |
| **[CLAUDE_CODE_RESEARCH.md](CLAUDE_CODE_RESEARCH.md)** | 想理解 P0-P3 改进依据 | Claude Code 架构研究报告（33KB，14章） |

## 根目录文档（完整版）

| 文件 | 内容 | 大小 |
|------|------|------|
| `../PROJECT_STATUS.md` | 完整功能列表 + P3 待办 + 34条设计决策 | ~46KB |
| `../Architecture.md` | 完整架构设计文档 | ~55KB |
| `../research.md` | 系统研究报告 | 大型 |

## 内部流程文档

| 文件 | 内容 |
|------|------|
| [agent-team-workflow.md](agent-team-workflow.md) | Agent 团队协作工作流（P7/P9 角色） |
| [sandbox-format.md](sandbox-format.md) | AI 生成 InteractiveSandbox HTML 格式约定 |
| [research_ai_manim_edtech.md](research_ai_manim_edtech.md) | Manim 动画教学研究 |

---

## 当前状态速览

- **Phase 4.5** — AI 架构对齐完成（参考 Claude Code 源码）
- **P0/P1/P2 已完成**：render_canvas Bug 修复 + 提示词重构 + ApiBackend 工厂
- **P3 待规划**：会话持久化、Token 追踪、上下文压缩
- **构建状态**：✅ 0 errors, 2 warnings（`cargo check` 通过）
