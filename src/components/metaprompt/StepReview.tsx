import type { MetaPromptQuestionnaire } from '../../types';
import { TEACHING_STYLE_LABELS } from '../../types';

interface Props {
  data: MetaPromptQuestionnaire;
}

export default function StepReview({ data }: Props) {
  const { subject, course, characters, world, story } = data;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-1 text-title leading-tight tracking-[0.04em] font-medium text-text-main dark:text-text-main-dark">✅ 确认总览</h2>
        <p className="text-aux text-text-sub">请检查以下设计，确认无误后点击"开始生成"</p>
      </div>

      {/* Subject & Course */}
      <Section title="📋 基础信息">
        <Row label="学科" value={subject.subjectName} />
        <Row label="教材" value={subject.textbook || '（未指定）'} />
        <Row label="教材格式" value={subject.textbookFormat} />
        <Row label="练习册" value={subject.hasWorkbook ? '有' : '无'} />
        <Row label="总章节" value={`${course.totalChapters} 章`} />
        {course.completedChapters && <Row label="已完成" value={course.completedChapters} />}
        {course.learningPeriod && <Row label="学习周期" value={course.learningPeriod} />}
        {course.topicOverview && <Row label="主题" value={course.topicOverview} />}
      </Section>

      {/* Characters */}
      <Section title="🎭 角色设计">
        {characters.map((char, i) => (
          <div key={i} className="mb-4 rounded-btn border border-slate-100 bg-bg-light p-4 last:mb-0 dark:border-slate-600 dark:bg-slate-700/50">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-subtitle font-medium text-text-main dark:text-text-main-dark">{char.name}</span>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-tag tracking-[0.04em] text-primary dark:bg-blue-900/30 dark:text-blue-300">
                {TEACHING_STYLE_LABELS[char.teachingStyle].icon} {TEACHING_STYLE_LABELS[char.teachingStyle].label}
              </span>
              {char.source === 'preset' && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-tag tracking-[0.04em] text-green-600 dark:bg-green-900/30 dark:text-green-300">
                  预设
                </span>
              )}
            </div>
            <div className="space-y-1 text-aux text-text-sub dark:text-text-main-dark">
              <div><span className="text-text-placeholder">性别/年龄：</span>{char.gender} / {char.age}</div>
              <div><span className="text-text-placeholder">外貌：</span>{char.appearanceKeywords}</div>
              <div><span className="text-text-placeholder">性格：</span>{char.personalityCore.slice(0, 80)}{char.personalityCore.length > 80 ? '...' : ''}</div>
              <div><span className="text-text-placeholder">暗线：</span>{char.backstoryAutoGenerate ? '🤖 AI 自动设计' : (char.backstoryHints || '（未填写）')}</div>
              <div><span className="text-text-placeholder">关系温度：</span>{'❄️'.repeat(Math.max(0, 5 - Math.round(char.initialWarmth / 2)))}{'🔥'.repeat(Math.round(char.initialWarmth / 2))}</div>
            </div>
          </div>
        ))}
      </Section>

      {/* World */}
      <Section title="🌍 世界观">
        <Row label="地点风格" value={{
          enclosed: '封闭空间 🏔️', 'semi-open': '半开放空间 🏡',
          everyday: '日常空间 🏙️', custom: '自定义 ✨',
        }[world.locationStyle]} />
        <Row label="地点描述" value={world.location} />
        <Row label="到来方式" value={{
          arranged: '被安排的 📋', 'self-sought': '自己找来的 🔍', accidental: '意外的 🎲',
        }[world.arrivalType]} />
        {world.arrivalReason && <Row label="到来原因" value={world.arrivalReason} />}
        {world.characterRelations && <Row label="角色关系" value={world.characterRelations} />}
        <Row label="超自然设定" value={world.hasSupernatural ? world.supernaturalElement : '无'} />
      </Section>

      {/* Story */}
      <Section title="📖 故事设计">
        <div className="mb-3">
          <span className="text-tag tracking-[0.04em] font-medium text-text-sub">情感阶段</span>
          <div className="mt-1 space-y-1">
            {story.emotionalPhases.map((phase, i) => (
              <div key={i} className="flex items-center gap-2 text-aux text-text-sub dark:text-text-main-dark">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-tag tracking-[0.04em] dark:bg-slate-600">{i + 1}</span>
                <span className="font-medium">{phase.name}</span>
                <span className="text-text-placeholder">({phase.coveragePercent})</span>
              </div>
            ))}
          </div>
        </div>
        {data.characterCount > 1 && (
          <Row label="轮值方式" value={story.rotationStyle === 'round-robin' ? '等距轮换 🔄' : '专题分组 📚'} />
        )}
        <Row label="群聊" value={story.enableGroupChat ? `启用「${story.groupChatName || '未命名'}」` : '不启用'} />
        {story.keyEvents && <Row label="关键事件" value={story.keyEvents} />}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-border-light bg-surface-light p-5 dark:border-border-dark dark:bg-surface-dark">
      <h3 className="mb-3 text-base font-medium text-text-main dark:text-text-main-dark">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-aux">
      <span className="min-w-[5rem] shrink-0 text-text-placeholder">{label}</span>
      <span className="text-text-main dark:text-text-main-dark">{value}</span>
    </div>
  );
}
