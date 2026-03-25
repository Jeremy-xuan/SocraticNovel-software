# SocraticNovel 🎓

> 沉浸式 AI 教学桌面应用 — 基于苏格拉底教学法的智能学习伙伴

SocraticNovel 是一个本地优先的桌面应用，通过 AI 驱动的苏格拉底式对话，为学生提供沉浸式的个性化教学体验。所有数据存储在本地，保护你的隐私。

## ✨ 核心功能

- 🎭 **沉浸式课堂** — AI 教师通过角色扮演进行苏格拉底式对话教学
- 🎨 **智能白板** — AI 实时生成 SVG/Mermaid 图表辅助教学 + 用户手绘标注
- 📝 **课后笔记** — AI 自动生成结构化课堂笔记
- 🧠 **间隔复习** — SM-2 算法驱动的智能复习卡片系统
- 💬 **虚拟群聊** — 课后与多个 AI 角色讨论互动
- 🔬 **练习模式** — 支持幽鬼α / AnimaTutor 等多种教学协议
- 📄 **PDF 导入** — 教材 PDF 自动转换为 Markdown 课程内容
- 🌐 **多语言** — 中文/英文 UI 自动适配
- 🗂️ **多 Workspace** — 创建/切换/导入/导出不同学科的学习空间

## 📦 安装

### macOS

从 [GitHub Releases](https://github.com/Jeremy-xuan/SocraticNovel-software/releases) 下载最新的 `.dmg` 文件（支持 Apple Silicon 和 Intel）。

> ⚠️ **首次打开提示"文件损坏"？**
>
> 由于应用未经 Apple 签名，macOS Gatekeeper 会拦截。请使用以下任一方式解决：
>
> **方法一（推荐）**：右键点击应用 → 选择"打开" → 在弹窗中点击"打开"
>
> **方法二（终端）**：
> ```bash
> xattr -cr /Applications/socratic-novel.app
> ```

### Windows

从 [GitHub Releases](https://github.com/Jeremy-xuan/SocraticNovel-software/releases) 下载最新的 `.exe` 安装程序。

## 🚀 快速开始

1. 安装并打开应用
2. 在设置页面输入你的 AI API Key（支持 Claude / OpenAI / Gemini / DeepSeek）
3. 选择内置的 AP Physics 案例体验，或通过 Meta Prompt 从零创建你自己的教学系统
4. 点击"开始上课"，享受 AI 教学之旅！

## 🛠️ 开发

### 环境要求

- Node.js 20+
- Rust 1.75+
- [Tauri 2.0 前置依赖](https://v2.tauri.app/start/prerequisites/)

### 本地开发

```bash
npm install
npm run tauri dev
```

### 构建

```bash
npm run tauri build
```

## 🏗️ 技术栈

- **框架**: Tauri 2.0 (Rust) + React 19 + TypeScript
- **UI**: Tailwind CSS 4 + Zustand
- **AI**: Claude / OpenAI / Gemini / DeepSeek（多提供商）
- **构建**: Vite + GitHub Actions CI/CD

## 📄 文档

- [架构设计文档](./Architecture.md) — 完整的技术架构说明
- [项目状态](./PROJECT_STATUS.md) — 开发进度跟踪

## 📜 License

MIT
