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
  lines.push(`- **学习者到来方式**: ${formatArrivalType(q.world.arrivalType)}`);
  lines.push(`- **角色教学动机**: ${formatTeachingMotivation(q.world.teachingMotivation)}`);
  lines.push(`- **角色关系**: （由 AI 根据角色性格、教学风格和到来方式自动设计初始关系动态）`);
  if (q.world.hasSupernatural) {
    lines.push(`- **超自然设定**: ${q.world.supernaturalElement}`);
  } else {
    lines.push('- **超自然设定**: 无');
  }
  lines.push('');

  // ─── Story ──────────────────────────────
  lines.push('## 4. 故事与教学设计');
  lines.push('');

  lines.push(`### 模式: ${q.storyMode === 'novel' ? '小说模式 (Beta)' : '标准教学模式'}`);
  lines.push('');

  if (q.storyMode === 'novel') {
    if (q.story.novelReferenceType === 'existing-work' && q.story.existingWorkName) {
      lines.push(`### 参考作品: 《${q.story.existingWorkName}》`);
      lines.push('');
      lines.push(`> AI 请直接使用《${q.story.existingWorkName}》的世界观设定和剧情框架，结合已有角色设计（暗线等），设计故事线、情感阶段和关键事件。遵循现有模板规则。`);
      lines.push('');
    } else if (q.story.storyReference) {
      lines.push('### 体验描述');
      lines.push('');
      lines.push(q.story.storyReference);
      lines.push('');
      lines.push('> AI 请根据以上描述，结合已有角色设计（暗线等），从头设计故事线、情感阶段和关键事件。遵循现有模板规则。');
      lines.push('');
    }
  } else {
    lines.push('> 标准模式：无固定故事线。AI 按教学进度自然推进，专注学科知识传递。角色暗线仍按模板规则隐含推进。');
    lines.push('');
  }

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

  if (q.storyMode === 'novel' && q.story.keyEvents) {
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

function formatArrivalType(t: string): string {
  return {
    arranged: '被安排/转来的（初始距离远，信任需要建立）',
    'self-sought': '主动找来的（有明确目的，初始好感较高）',
    accidental: '偶然到来的（意外相遇，关系发展不可预测）',
    fated: '命运使然（特殊契机，暗含深层联系）',
  }[t] || t;
}

function formatTeachingMotivation(m: string): string {
  return {
    professional: '职业教师（教学是本职，关系从工作开始）',
    'personal-secret': '各有隐情（每位老师有自己的秘密和教学动机）',
    'assigned-mentor': '专属导师（被指派或自愿成为你的导师）',
    'shared-goal': '共同目标（因某个事件或目标聚在一起）',
  }[m] || m;
}

