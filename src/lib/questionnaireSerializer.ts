import type { MetaPromptQuestionnaire } from '../types';
import { TEACHING_STYLE_LABELS } from '../types';

/**
 * Serialize the questionnaire into a structured Markdown document
 * that the AI can consume to skip Phase 1-4 and jump to file generation.
 */
export function serializeQuestionnaire(q: MetaPromptQuestionnaire): string {
  const lines: string[] = [];

  lines.push('# 用户设计决策总览');
  lines.push('');
  lines.push('> 以下信息由用户在问卷中填写完毕，无需再次询问。请直接基于这些决策进入 Phase 5（文件生成）。');
  lines.push('');

  // ─── Subject ──────────────────────────────
  lines.push('## 1. 基本信息');
  lines.push('');
  lines.push(`- **学科**: ${q.subject.subjectName}`);
  if (q.subject.textbook) {
    lines.push(`- **教材**: ${q.subject.textbook} (${formatTextbookFormat(q.subject.textbookFormat)})`);
  }
  if (q.subject.hasWorkbook) {
    lines.push('- **练习册**: 有配套练习册');
  }
  lines.push(`- **总章节数**: ${q.course.totalChapters}`);
  if (q.course.completedChapters) {
    lines.push(`- **已完成**: ${q.course.completedChapters}`);
  }
  if (q.course.learningPeriod) {
    lines.push(`- **学习周期**: ${q.course.learningPeriod}`);
  }
  if (q.course.topicOverview) {
    lines.push(`- **主题概览**: ${q.course.topicOverview}`);
  }
  lines.push(`- **角色数量**: ${q.characterCount} 位`);
  lines.push(`- **目标平台**: 桌面应用（本地文件系统，完整功能）`);
  lines.push('');

  // ─── Characters ──────────────────────────────
  lines.push('## 2. 角色设计');
  lines.push('');
  q.characters.forEach((char, i) => {
    const styleInfo = TEACHING_STYLE_LABELS[char.teachingStyle];
    lines.push(`### 角色 ${i + 1}: ${char.name}`);
    lines.push('');
    lines.push(`- **名字**: ${char.name}`);
    lines.push(`- **性别**: ${char.gender}`);
    lines.push(`- **年龄**: ${char.age}`);
    lines.push(`- **外貌关键词**: ${char.appearanceKeywords}`);
    lines.push(`- **教学风格**: ${styleInfo.icon} ${styleInfo.label} — ${styleInfo.desc}`);
    lines.push(`- **性格核心**: ${char.personalityCore}`);
    if (char.backstoryAutoGenerate) {
      lines.push(`- **暗线**: 请 AI 根据角色性格自动设计暗线方向`);
      if (char.backstoryHints) {
        lines.push(`  - 用户补充: ${char.backstoryHints}`);
      }
    } else if (char.backstoryHints) {
      lines.push(`- **暗线碎片**: ${char.backstoryHints}`);
    }
    lines.push(`- **初始关系温度**: ${char.initialWarmth}/10`);
    if (char.source === 'preset') {
      lines.push(`- **来源**: 预设角色库 (${char.presetId})`);
    } else if (char.source === 'custom-name') {
      lines.push(`- **来源**: 用户指定角色「${char.customSourceName}」，以上设定参考原作但可微调`);
    }
    lines.push('');
  });

  // ─── World ──────────────────────────────
  lines.push('## 3. 世界观');
  lines.push('');
  lines.push(`- **场景类型**: ${formatLocationStyle(q.world.locationStyle)}`);
  lines.push(`- **具体场景描述**: （由 AI 根据角色和场景类型生成）`);
  if (q.world.characterRelations) {
    lines.push(`- **角色关系**: ${q.world.characterRelations}`);
  }
  if (q.world.hasSupernatural) {
    lines.push(`- **超自然设定**: ${q.world.supernaturalElement}`);
  } else {
    lines.push('- **超自然设定**: 无');
  }
  lines.push('');

  // ─── Story ──────────────────────────────
  lines.push('## 4. 故事设计');
  lines.push('');
  lines.push('### 情感阶段');
  lines.push('');
  lines.push('| 阶段 | 覆盖范围 | 基调 |');
  lines.push('|------|---------|------|');
  q.story.emotionalPhases.forEach(phase => {
    lines.push(`| ${phase.name} | ${phase.coveragePercent} | ${phase.tone} |`);
  });
  lines.push('');

  if (q.characterCount > 1) {
    lines.push(`### 教师轮值: ${q.story.rotationStyle === 'round-robin' ? '等距轮换' : '专题分组'}`);
    if (q.story.rotationNotes) {
      lines.push(`- 备注: ${q.story.rotationNotes}`);
    }
    lines.push('');
  }

  lines.push(`### 群聊: ${q.story.enableGroupChat ? '启用' : '不启用'}`);
  if (q.story.enableGroupChat) {
    if (q.story.groupChatName) lines.push(`- 群名: ${q.story.groupChatName}`);
    if (q.story.groupChatStyle) lines.push(`- 风格: ${q.story.groupChatStyle}`);
  }
  lines.push('');

  if (q.story.keyEvents) {
    lines.push('### 关键事件');
    lines.push('');
    lines.push(q.story.keyEvents);
    lines.push('');
  }

  // ─── Instructions ──────────────────────────────
  lines.push('---');
  lines.push('');
  lines.push('## 请开始 Phase 5（文件生成）');
  lines.push('');
  lines.push('以上设计已经过用户确认。请严格基于这些决策，按照 META_PROMPT 中 Phase 5 的生成规则和顺序，开始逐个生成文件。');
  lines.push('每生成一个关键文件后暂停，让用户确认或修改。');

  return lines.join('\n');
}

function formatTextbookFormat(f: string): string {
  return { pdf: 'PDF', paper: '纸质', ebook: '电子书', none: '无教材' }[f] || f;
}

function formatLocationStyle(s: string): string {
  return {
    enclosed: '封闭空间', 'semi-open': '半开放空间',
    everyday: '日常空间', custom: '自定义',
  }[s] || s;
}


