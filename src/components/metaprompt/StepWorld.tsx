import type { MetaPromptQuestionnaire } from '../../types';

interface Props {
  data: MetaPromptQuestionnaire;
  onChange: (partial: Partial<MetaPromptQuestionnaire>) => void;
}

const LOCATION_STYLES = [
  { value: 'enclosed', label: '封闭空间', icon: '🏔️', examples: '山顶观测站、海边灯塔、老宅改的工作室' },
  { value: 'semi-open', label: '半开放空间', icon: '🏡', examples: '森林小屋群、顶层天台、岛屿研究站' },
  { value: 'everyday', label: '日常空间', icon: '🏙️', examples: '合租公寓、大学附近独栋、乡下老房子' },
  { value: 'custom', label: '自定义', icon: '✨', examples: '你来设计' },
] as const;

const ARRIVAL_TYPES = [
  { value: 'arranged', label: '被安排的', desc: '家长报名、学校分配 → 初始距离远', icon: '📋' },
  { value: 'self-sought', label: '自己找来的', desc: '口碑、推荐、主动寻求 → 距离中等', icon: '🔍' },
  { value: 'accidental', label: '意外的', desc: '搬家、转学、偶然发现 → 距离不确定', icon: '🎲' },
] as const;

export default function StepWorld({ data, onChange }: Props) {
  const { world } = data;

  const setWorld = (partial: Partial<typeof world>) =>
    onChange({ world: { ...world, ...partial } });

  return (
    <div className="space-y-8">
      <div>
        <h2 className="mb-1 text-2xl font-bold text-slate-800 dark:text-slate-100">🌍 世界观构建</h2>
        <p className="text-sm text-slate-500">设计故事发生的空间和关系</p>
      </div>

      {/* Location style */}
      <section className="space-y-4">
        <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">故事发生在哪里？</h3>
        <p className="text-xs text-slate-500">
          不是"线上教室"——是一个你能闻到气味、听到声音的地方
        </p>
        <div className="grid grid-cols-2 gap-3">
          {LOCATION_STYLES.map(ls => (
            <button
              key={ls.value}
              onClick={() => setWorld({ locationStyle: ls.value })}
              className={`rounded-xl border p-4 text-left transition-colors ${
                world.locationStyle === ls.value
                  ? 'border-blue-300 bg-blue-50 dark:border-blue-600 dark:bg-blue-900/20'
                  : 'border-slate-200 hover:border-slate-300 dark:border-slate-600'
              }`}
            >
              <div className="mb-1 flex items-center gap-2">
                <span className="text-lg">{ls.icon}</span>
                <span className="font-medium text-slate-700 dark:text-slate-200">{ls.label}</span>
              </div>
              <div className="text-xs text-slate-500">{ls.examples}</div>
            </button>
          ))}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
            地点描述 <span className="text-red-400">*</span>
          </label>
          <textarea
            value={world.location}
            onChange={e => setWorld({ location: e.target.value })}
            placeholder="描述具体的地点：有什么子空间？气候如何？光线条件？&#10;好的地点至少有 3 个子空间（教学区、生活区、私人区域）+ 一个共用空间"
            rows={4}
            className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
          />
        </div>
      </section>

      {/* Arrival reason */}
      <section className="space-y-4">
        <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">学习者为什么来到这里？</h3>
        <div className="grid grid-cols-3 gap-3">
          {ARRIVAL_TYPES.map(at => (
            <button
              key={at.value}
              onClick={() => setWorld({ arrivalType: at.value })}
              className={`rounded-xl border p-4 text-left transition-colors ${
                world.arrivalType === at.value
                  ? 'border-blue-300 bg-blue-50 dark:border-blue-600 dark:bg-blue-900/20'
                  : 'border-slate-200 hover:border-slate-300 dark:border-slate-600'
              }`}
            >
              <div className="mb-1 text-lg">{at.icon}</div>
              <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{at.label}</div>
              <div className="text-xs text-slate-500">{at.desc}</div>
            </button>
          ))}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">到来原因详情</label>
          <input
            type="text"
            value={world.arrivalReason}
            onChange={e => setWorld({ arrivalReason: e.target.value })}
            placeholder="简要描述学习者来到这个地方的具体原因"
            className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
          />
        </div>
      </section>

      {/* Character relations */}
      {data.characterCount > 1 && (
        <section className="space-y-4">
          <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">角色之间的关系</h3>
          <p className="text-xs text-slate-500">
            他们不只是"同事"——他们有前史。谁先来的？有没有紧张关系或默契？
          </p>
          <textarea
            value={world.characterRelations}
            onChange={e => setWorld({ characterRelations: e.target.value })}
            placeholder="描述角色之间的关系和前史...&#10;不需要完整故事——几句关键信息就够"
            rows={3}
            className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
          />
        </section>
      )}

      {/* Supernatural element */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">特殊设定（可选）</h3>
          <label className="flex items-center gap-2 text-sm text-slate-500">
            <input
              type="checkbox"
              checked={world.hasSupernatural}
              onChange={e => setWorld({ hasSupernatural: e.target.checked })}
              className="rounded"
            />
            启用超自然元素
          </label>
        </div>
        {world.hasSupernatural && (
          <>
            <p className="text-xs text-slate-500">
              最多只属于一个角色。稀缺性创造重量。超自然元素应该让角色更脆弱，而不是更强大
            </p>
            <textarea
              value={world.supernaturalElement}
              onChange={e => setWorld({ supernaturalElement: e.target.value })}
              placeholder="描述超自然设定...&#10;参考类型：感知型（能看见某种东西）/ 记忆型 / 空间型"
              rows={3}
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
            />
          </>
        )}
      </section>
    </div>
  );
}
