import type { MetaPromptQuestionnaire, EmotionalPhase } from '../../types';

interface Props {
  data: MetaPromptQuestionnaire;
  onChange: (partial: Partial<MetaPromptQuestionnaire>) => void;
}

const DEFAULT_FOUR_STAGES: EmotionalPhase[] = [
  { name: '初期 — 距离', coveragePercent: '前25%', tone: '各占各的空间，教学是交易。节奏慢，日常占比高' },
  { name: '中期 — 裂隙', coveragePercent: '25-60%', tone: '距离在缩短但没人承认。过往碎片渗出' },
  { name: '后期 — 重力', coveragePercent: '60-85%', tone: '在意藏不住。教学的耐心本身就是情感' },
  { name: '备考期 — 沉淀', coveragePercent: '最后15%', tone: '离别的影子。所有积累沉淀' },
];

export default function StepStory({ data, onChange }: Props) {
  const { story } = data;

  const setStory = (partial: Partial<typeof story>) =>
    onChange({ story: { ...story, ...partial } });

  const updatePhase = (idx: number, partial: Partial<EmotionalPhase>) => {
    const phases = [...story.emotionalPhases];
    phases[idx] = { ...phases[idx], ...partial };
    setStory({ emotionalPhases: phases });
  };

  const addPhase = () => {
    setStory({
      emotionalPhases: [...story.emotionalPhases, { name: '', coveragePercent: '', tone: '' }],
    });
  };

  const removePhase = (idx: number) => {
    setStory({ emotionalPhases: story.emotionalPhases.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="mb-1 text-2xl font-bold text-slate-800 dark:text-slate-100">📖 故事设计</h2>
        <p className="text-sm text-slate-500">设计学习体验的情感弧度</p>
      </div>

      {/* Emotional phases */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">情感阶段</h3>
          <div className="flex gap-2">
            <button
              onClick={() => setStory({ emotionalTemplate: 'four-stage', emotionalPhases: DEFAULT_FOUR_STAGES })}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                story.emotionalTemplate === 'four-stage'
                  ? 'border-blue-300 bg-blue-50 text-blue-600 dark:border-blue-600 dark:bg-blue-900/30'
                  : 'border-slate-200 text-slate-500 dark:border-slate-600'
              }`}
            >
              四阶段模板（推荐）
            </button>
            <button
              onClick={() => setStory({ emotionalTemplate: 'custom' })}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                story.emotionalTemplate === 'custom'
                  ? 'border-blue-300 bg-blue-50 text-blue-600 dark:border-blue-600 dark:bg-blue-900/30'
                  : 'border-slate-200 text-slate-500 dark:border-slate-600'
              }`}
            >
              自定义
            </button>
          </div>
        </div>
        <div className="space-y-3">
          {story.emotionalPhases.map((phase, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-600 dark:bg-slate-700"
            >
              <span className="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500 dark:bg-slate-600 dark:text-slate-300">
                {idx + 1}
              </span>
              <div className="flex-1 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={phase.name}
                    onChange={e => updatePhase(idx, { name: e.target.value })}
                    placeholder="阶段名"
                    className="rounded border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-500 dark:bg-slate-600 dark:text-slate-200"
                  />
                  <input
                    type="text"
                    value={phase.coveragePercent}
                    onChange={e => updatePhase(idx, { coveragePercent: e.target.value })}
                    placeholder="覆盖范围（如 前25%）"
                    className="rounded border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-500 dark:bg-slate-600 dark:text-slate-200"
                  />
                </div>
                <input
                  type="text"
                  value={phase.tone}
                  onChange={e => updatePhase(idx, { tone: e.target.value })}
                  placeholder="基调描述"
                  className="w-full rounded border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-500 dark:bg-slate-600 dark:text-slate-200"
                />
              </div>
              {story.emotionalTemplate === 'custom' && (
                <button
                  onClick={() => removePhase(idx)}
                  className="mt-1 text-sm text-red-400 hover:text-red-600"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {story.emotionalTemplate === 'custom' && (
            <button
              onClick={addPhase}
              className="w-full rounded-lg border border-dashed border-slate-300 py-2 text-sm text-slate-400 hover:border-slate-400 hover:text-slate-500 dark:border-slate-600"
            >
              + 添加阶段
            </button>
          )}
        </div>
      </section>

      {/* Rotation style */}
      {data.characterCount > 1 && (
        <section className="space-y-4">
          <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">教师轮值方式</h3>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setStory({ rotationStyle: 'round-robin' })}
              className={`rounded-xl border p-4 text-left ${
                story.rotationStyle === 'round-robin'
                  ? 'border-blue-300 bg-blue-50 dark:border-blue-600 dark:bg-blue-900/20'
                  : 'border-slate-200 dark:border-slate-600'
              }`}
            >
              <div className="text-sm font-medium text-slate-700 dark:text-slate-200">🔄 等距轮换（推荐）</div>
              <div className="text-xs text-slate-500">A → B → C → A → B → C...</div>
            </button>
            <button
              onClick={() => setStory({ rotationStyle: 'thematic' })}
              className={`rounded-xl border p-4 text-left ${
                story.rotationStyle === 'thematic'
                  ? 'border-blue-300 bg-blue-50 dark:border-blue-600 dark:bg-blue-900/20'
                  : 'border-slate-200 dark:border-slate-600'
              }`}
            >
              <div className="text-sm font-medium text-slate-700 dark:text-slate-200">📚 专题分组</div>
              <div className="text-xs text-slate-500">按单元/主题分配给不同老师</div>
            </button>
          </div>
          <input
            type="text"
            value={story.rotationNotes}
            onChange={e => setStory({ rotationNotes: e.target.value })}
            placeholder="轮值备注（如有特殊安排）"
            className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
          />
        </section>
      )}

      {/* Group chat */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">群聊系统</h3>
          <label className="flex items-center gap-2 text-sm text-slate-500">
            <input
              type="checkbox"
              checked={story.enableGroupChat}
              onChange={e => setStory({ enableGroupChat: e.target.checked })}
              className="rounded"
            />
            启用
          </label>
        </div>
        {story.enableGroupChat && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">群聊名称</label>
              <input
                type="text"
                value={story.groupChatName}
                onChange={e => setStory({ groupChatName: e.target.value })}
                placeholder="例：观测站生活群"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">群聊风格</label>
              <input
                type="text"
                value={story.groupChatStyle}
                onChange={e => setStory({ groupChatStyle: e.target.value })}
                placeholder="纯文字 / 偶尔 emoji / ..."
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
              />
            </div>
          </div>
        )}
      </section>

      {/* Key events */}
      <section className="space-y-4">
        <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">关键事件（可选）</h3>
        <p className="text-xs text-slate-500">
          只需要确定骨架事件（3-5 个最重要的），剩下的 AI 会在生成时补完
        </p>
        <textarea
          value={story.keyEvents}
          onChange={e => setStory({ keyEvents: e.target.value })}
          placeholder="描述必须发生的关键事件...&#10;如：Ch.10 某角色第一次展露过去的碎片、Ch.20 群聊名称改变"
          rows={4}
          className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
        />
      </section>
    </div>
  );
}
