# GitHub Copilot Instructions

## Agent Skills

Read and follow the PUA skill to enforce high-agency, exhaustive problem-solving:

```
~/.agents/skills/pua/SKILL.md
```

The PUA skill auto-triggers when:
- Tasks fail 2+ consecutive times
- About to say "I cannot solve this"
- User says phrases like: "换个方法", "为什么还不行", "加油", "try harder", "/pua"

Default flavor: 🟠 阿里味. Switch with `/pua:flavor <name>`.

## Project Context

This is **SocraticNovel** — a Tauri 2.0 + React 19 + TypeScript desktop app for AI tutoring.
Current version: v0.4.1. Phase 4 in progress.
