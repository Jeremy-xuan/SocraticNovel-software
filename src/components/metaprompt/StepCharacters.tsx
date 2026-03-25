import { useState } from 'react';
import type { MetaPromptQuestionnaire, CharacterDesign, TeachingStyle } from '../../types';
import { TEACHING_STYLE_LABELS } from '../../types';
import { CHARACTER_PRESETS } from '../../data/characterPresets';

interface Props {
  data: MetaPromptQuestionnaire;
  onChange: (partial: Partial<MetaPromptQuestionnaire>) => void;
}

const EMPTY_CHARACTER: CharacterDesign = {
  source: 'original',
  name: '',
  gender: '',
  age: '',
  appearanceKeywords: '',
  teachingStyle: 'intuition-analogy',
  personalityCore: '',
  backstoryHints: '',
  backstoryAutoGenerate: false,
  initialWarmth: 5,
};

type TabMode = 'preset' | 'custom-name' | 'original';

export default function StepCharacters({ data, onChange }: Props) {
  const [activeCharIdx, setActiveCharIdx] = useState(0);
  const [tabMode, setTabMode] = useState<TabMode>('preset');
  const [searchQuery, setSearchQuery] = useState('');
  const [customSourceName, setCustomSourceName] = useState('');

  // Ensure characters array has the right length
  const ensureCharacters = (): CharacterDesign[] => {
    const chars = [...data.characters];
    while (chars.length < data.characterCount) {
      chars.push({ ...EMPTY_CHARACTER });
    }
    return chars.slice(0, data.characterCount);
  };

  const characters = ensureCharacters();
  const current = characters[activeCharIdx] || { ...EMPTY_CHARACTER };

  const updateCharacter = (idx: number, partial: Partial<CharacterDesign>) => {
    const chars = ensureCharacters();
    chars[idx] = { ...chars[idx], ...partial };
    onChange({ characters: chars });
  };

  const applyPreset = (presetId: string) => {
    const preset = CHARACTER_PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    updateCharacter(activeCharIdx, {
      source: 'preset',
      presetId: preset.id,
      name: preset.name,
      gender: preset.gender,
      age: preset.age,
      appearanceKeywords: preset.appearanceKeywords,
      teachingStyle: preset.teachingStyle,
      personalityCore: preset.personalityCore,
      backstoryHints: preset.backstoryHints,
      backstoryAutoGenerate: false,
      initialWarmth: preset.initialWarmth,
    });
  };

  const applyCustomName = () => {
    if (!customSourceName.trim()) return;
    updateCharacter(activeCharIdx, {
      source: 'custom-name',
      customSourceName: customSourceName.trim(),
      name: customSourceName.trim(),
      backstoryAutoGenerate: true,
    });
    setCustomSourceName('');
  };

  const startOriginal = () => {
    updateCharacter(activeCharIdx, {
      ...EMPTY_CHARACTER,
      source: 'original',
    });
  };

  const filteredPresets = searchQuery
    ? CHARACTER_PRESETS.filter(p =>
        p.name.includes(searchQuery) || p.source.includes(searchQuery) ||
        p.personalityCore.includes(searchQuery))
    : CHARACTER_PRESETS;

  // Group presets by teaching style
  const groupedPresets = new Map<TeachingStyle, typeof CHARACTER_PRESETS>();
  filteredPresets.forEach(p => {
    const arr = groupedPresets.get(p.teachingStyle) || [];
    arr.push(p);
    groupedPresets.set(p.teachingStyle, arr);
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-1 text-2xl font-bold text-slate-800 dark:text-slate-100">🎭 角色创建</h2>
        <p className="text-sm text-slate-500">为你的 {data.characterCount} 位老师设计角色</p>
      </div>

      {/* Character tabs */}
      <div className="flex gap-2">
        {Array.from({ length: data.characterCount }, (_, i) => (
          <button
            key={i}
            onClick={() => setActiveCharIdx(i)}
            className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
              i === activeCharIdx
                ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-900/30 dark:text-blue-300'
                : characters[i]?.name
                  ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-900/20 dark:text-green-400'
                  : 'border-slate-200 text-slate-500 dark:border-slate-600 dark:text-slate-400'
            }`}
          >
            {characters[i]?.name ? `✅ ${characters[i].name}` : `角色 ${i + 1}`}
          </button>
        ))}
      </div>

      {/* Source mode tabs */}
      <div className="flex rounded-lg border border-slate-200 dark:border-slate-600">
        {([
          { mode: 'preset' as TabMode, label: '🎬 从动漫选择', desc: '内置角色库' },
          { mode: 'custom-name' as TabMode, label: '✏️ 输入角色名', desc: 'AI 自动填充' },
          { mode: 'original' as TabMode, label: '🆕 原创角色', desc: '手动填写' },
        ]).map(tab => (
          <button
            key={tab.mode}
            onClick={() => {
              setTabMode(tab.mode);
              if (tab.mode === 'original') startOriginal();
            }}
            className={`flex-1 border-r px-4 py-3 text-center last:border-r-0 ${
              tabMode === tab.mode
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-700/50'
            }`}
          >
            <div className="text-sm font-medium">{tab.label}</div>
            <div className="text-xs opacity-60">{tab.desc}</div>
          </button>
        ))}
      </div>

      {/* Preset selection grid */}
      {tabMode === 'preset' && (
        <div className="space-y-4">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索角色名或作品名..."
            className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
          />
          <div className="max-h-[400px] space-y-6 overflow-y-auto pr-2">
            {Array.from(groupedPresets.entries()).map(([style, presets]) => (
              <div key={style}>
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
                  <span>{TEACHING_STYLE_LABELS[style].icon}</span>
                  <span>{TEACHING_STYLE_LABELS[style].label}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {presets.map(preset => (
                    <button
                      key={preset.id}
                      onClick={() => applyPreset(preset.id)}
                      className={`rounded-lg border p-3 text-left transition-all hover:shadow-sm ${
                        current.presetId === preset.id
                          ? 'border-blue-300 bg-blue-50 ring-1 ring-blue-200 dark:border-blue-600 dark:bg-blue-900/20'
                          : 'border-slate-200 hover:border-slate-300 dark:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{preset.icon}</span>
                        <div>
                          <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                            {preset.name}
                          </div>
                          <div className="text-xs text-slate-400">{preset.source}</div>
                        </div>
                      </div>
                      <div className="mt-1.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                        {preset.personalityCore.slice(0, 50)}...
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Custom name input */}
      {tabMode === 'custom-name' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center dark:border-slate-600 dark:bg-slate-800">
            <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
              输入任何你喜欢的角色名，AI 会自动填充角色设定
            </p>
            <div className="mx-auto flex max-w-md gap-2">
              <input
                type="text"
                value={customSourceName}
                onChange={e => setCustomSourceName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyCustomName()}
                placeholder="如：折木奉太郎、哈利波特、孙悟空..."
                className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
              />
              <button
                onClick={applyCustomName}
                disabled={!customSourceName.trim()}
                className="rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-40"
              >
                确认
              </button>
            </div>
          </div>
          {current.source === 'custom-name' && current.customSourceName && (
            <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 dark:border-purple-700 dark:bg-purple-900/20">
              <p className="text-sm text-purple-700 dark:text-purple-300">
                ✅ 已选择角色「{current.customSourceName}」— AI 将在生成阶段自动填充详细设定。
                你也可以在下方手动调整。
              </p>
            </div>
          )}
        </div>
      )}

      {/* Character detail form (always shown when a character is selected) */}
      {(current.name || tabMode === 'original') && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-700 dark:text-slate-200">
            {current.name ? `角色详情 — ${current.name}` : '角色详情'}
            {current.source === 'preset' && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
                预设
              </span>
            )}
          </h3>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">名字 <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={current.name}
                onChange={e => updateCharacter(activeCharIdx, { name: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">性别</label>
              <input
                type="text"
                value={current.gender}
                onChange={e => updateCharacter(activeCharIdx, { gender: e.target.value })}
                placeholder="男/女/..."
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">年龄</label>
              <input
                type="text"
                value={current.age}
                onChange={e => updateCharacter(activeCharIdx, { age: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">外貌关键词</label>
            <input
              type="text"
              value={current.appearanceKeywords}
              onChange={e => updateCharacter(activeCharIdx, { appearanceKeywords: e.target.value })}
              placeholder="如：棕发、慵懒的眼神、校服外套搭在肩上"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
            />
          </div>

          {/* Teaching style selector */}
          <div>
            <label className="mb-2 block text-xs font-medium text-slate-500">
              教学风格 <span className="text-red-400">*</span>
            </label>
            <div className="grid grid-cols-5 gap-2">
              {(Object.entries(TEACHING_STYLE_LABELS) as [TeachingStyle, { label: string; desc: string; icon: string }][]).map(
                ([key, val]) => (
                  <button
                    key={key}
                    onClick={() => updateCharacter(activeCharIdx, { teachingStyle: key })}
                    className={`rounded-lg border p-2.5 text-center transition-colors ${
                      current.teachingStyle === key
                        ? 'border-blue-300 bg-blue-50 dark:border-blue-600 dark:bg-blue-900/20'
                        : 'border-slate-200 hover:border-slate-300 dark:border-slate-600'
                    }`}
                  >
                    <div className="text-lg">{val.icon}</div>
                    <div className="mt-1 text-xs font-medium text-slate-700 dark:text-slate-200">{val.label}</div>
                  </button>
                ),
              )}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">性格核心</label>
            <textarea
              value={current.personalityCore}
              onChange={e => updateCharacter(activeCharIdx, { personalityCore: e.target.value })}
              placeholder="描述角色的核心性格特征..."
              rows={3}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium text-slate-500">暗线碎片（角色背后的故事）</label>
              <label className="flex items-center gap-1.5 text-xs text-slate-500">
                <input
                  type="checkbox"
                  checked={current.backstoryAutoGenerate}
                  onChange={e => updateCharacter(activeCharIdx, { backstoryAutoGenerate: e.target.checked })}
                  className="rounded"
                />
                让 AI 自动设计
              </label>
            </div>
            <textarea
              value={current.backstoryHints}
              onChange={e => updateCharacter(activeCharIdx, { backstoryHints: e.target.value })}
              placeholder={current.backstoryAutoGenerate ? 'AI 会根据角色性格自动设计暗线...' : '描述角色过去的碎片，不需要完整故事...'}
              rows={2}
              disabled={current.backstoryAutoGenerate && !current.backstoryHints}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
            />
          </div>

          {/* Warmth slider */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium text-slate-500">初始关系温度</label>
              <span className="text-xs text-slate-400">{current.initialWarmth}/10</span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              value={current.initialWarmth}
              onChange={e => updateCharacter(activeCharIdx, { initialWarmth: parseInt(e.target.value) })}
              className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-xs text-slate-400">
              <span>❄️ 冷淡</span>
              <span>🔥 热情</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
