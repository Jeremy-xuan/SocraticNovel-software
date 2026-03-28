import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();

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
        <h2 className="mb-1 text-title leading-tight tracking-[0.04em] font-medium text-text-main dark:text-text-main-dark">{t('stepCharacters.title')}</h2>
        <p className="text-aux text-text-sub">{t('stepCharacters.desc', { count: data.characterCount })}</p>
      </div>

      {/* Character tabs */}
      <div className="flex gap-2">
        {Array.from({ length: data.characterCount }, (_, i) => (
          <button
            key={i}
            onClick={() => setActiveCharIdx(i)}
            className={`flex items-center gap-2 rounded-btn border px-4 py-2 text-aux font-medium transition-colors ${
              i === activeCharIdx
                ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-900/30 dark:text-blue-300'
                : characters[i]?.name
                  ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-900/20 dark:text-green-400'
                  : 'border-border-light text-text-sub dark:border-slate-600 dark:text-text-placeholder'
            }`}
          >
            {characters[i]?.name ? <><svg className="inline-block h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> {characters[i].name}</> : t('stepCharacters.characterN', { n: i + 1 })}
          </button>
        ))}
      </div>

      {/* Source mode tabs */}
      <div className="flex rounded-btn border border-border-light dark:border-slate-600">
        {([
          { mode: 'preset' as TabMode, label: t('stepCharacters.tabPreset'), desc: t('stepCharacters.tabPresetDesc') },
          { mode: 'custom-name' as TabMode, label: t('stepCharacters.tabCustomName'), desc: t('stepCharacters.tabCustomNameDesc') },
          { mode: 'original' as TabMode, label: t('stepCharacters.tabOriginal'), desc: t('stepCharacters.tabOriginalDesc') },
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
                : 'text-text-sub hover:bg-bg-light dark:text-text-placeholder dark:hover:bg-slate-700/50'
            }`}
          >
            <div className="text-aux font-medium">{tab.label}</div>
            <div className="text-tag tracking-[0.04em] opacity-60">{tab.desc}</div>
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
            placeholder={t('stepCharacters.searchPlaceholder')}
            className="w-full rounded-btn border border-border-light bg-surface-light px-4 py-2.5 text-aux dark:border-slate-600 dark:bg-slate-700 dark:text-text-main-dark"
          />
          <div className="max-h-[400px] space-y-6 overflow-y-auto pr-2">
            {Array.from(groupedPresets.entries()).map(([style, presets]) => (
              <div key={style}>
                <div className="mb-2 flex items-center gap-2 text-aux font-medium text-text-sub dark:text-text-main-dark">
                  <span>{TEACHING_STYLE_LABELS[style].icon}</span>
                  <span>{TEACHING_STYLE_LABELS[style].label}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {presets.map(preset => (
                    <button
                      key={preset.id}
                      onClick={() => applyPreset(preset.id)}
                      className={`rounded-btn border p-3 text-left transition-all hover:shadow-float ${
                        current.presetId === preset.id
                          ? 'border-blue-300 bg-blue-50 ring-1 ring-blue-200 dark:border-blue-600 dark:bg-blue-900/20'
                          : 'border-border-light hover:border-border-light dark:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-subtitle">{preset.icon}</span>
                        <div>
                          <div className="text-aux font-medium text-text-main dark:text-text-main-dark">
                            {preset.name}
                          </div>
                          <div className="text-tag tracking-[0.04em] text-text-placeholder">{preset.source}</div>
                        </div>
                      </div>
                      <div className="mt-1.5 line-clamp-2 text-tag tracking-[0.04em] text-text-sub dark:text-text-placeholder">
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
          <div className="rounded-btn border border-dashed border-border-light bg-bg-light p-6 text-center dark:border-slate-600 dark:bg-surface-dark">
            <p className="mb-4 text-aux text-text-sub dark:text-text-main-dark">
              {t('stepCharacters.customNameHint')}
            </p>
            <div className="mx-auto flex max-w-md gap-2">
              <input
                type="text"
                value={customSourceName}
                onChange={e => setCustomSourceName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyCustomName()}
                placeholder={t('stepCharacters.customNamePlaceholder')}
                className="flex-1 rounded-btn border border-border-light bg-surface-light px-4 py-2.5 text-aux dark:border-slate-600 dark:bg-slate-700 dark:text-text-main-dark"
              />
              <button
                onClick={applyCustomName}
                disabled={!customSourceName.trim()}
                className="rounded-btn bg-purple-600 px-4 py-2.5 text-aux font-medium text-white hover:bg-purple-700 disabled:opacity-40"
              >
                {t('common.confirm')}
              </button>
            </div>
          </div>
          {current.source === 'custom-name' && current.customSourceName && (
            <div className="rounded-btn border border-purple-200 bg-purple-50 p-4 dark:border-purple-700 dark:bg-purple-900/20">
              <p className="text-aux text-purple-700 dark:text-purple-300">
                {t('stepCharacters.customNameSelected', { name: current.customSourceName })}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Character detail form (always shown when a character is selected) */}
      {(current.name || tabMode === 'original') && (
        <div className="space-y-4 rounded-card border border-border-light bg-surface-light p-6 shadow-card dark:border-border-dark dark:bg-surface-dark">
          <h3 className="flex items-center gap-2 text-base font-medium text-text-main dark:text-text-main-dark">
            {current.name ? t('stepCharacters.charDetail', { name: current.name }) : t('stepCharacters.charDetailDefault')}
            {current.source === 'preset' && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-tag tracking-[0.04em] text-primary dark:bg-blue-900/30 dark:text-blue-300">
                {t('stepCharacters.presetBadge')}
              </span>
            )}
          </h3>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="mb-1 block text-tag tracking-[0.04em] font-medium text-text-sub">{t('stepCharacters.nameLabel')} <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={current.name}
                onChange={e => updateCharacter(activeCharIdx, { name: e.target.value })}
                className="w-full rounded-btn border border-border-light bg-surface-light px-3 py-2 text-aux dark:border-slate-600 dark:bg-slate-700 dark:text-text-main-dark"
              />
            </div>
            <div>
              <label className="mb-1 block text-tag tracking-[0.04em] font-medium text-text-sub">{t('stepCharacters.genderLabel')}</label>
              <input
                type="text"
                value={current.gender}
                onChange={e => updateCharacter(activeCharIdx, { gender: e.target.value })}
                placeholder={t('stepCharacters.genderPlaceholder')}
                className="w-full rounded-btn border border-border-light bg-surface-light px-3 py-2 text-aux dark:border-slate-600 dark:bg-slate-700 dark:text-text-main-dark"
              />
            </div>
            <div>
              <label className="mb-1 block text-tag tracking-[0.04em] font-medium text-text-sub">{t('stepCharacters.ageLabel')}</label>
              <input
                type="text"
                value={current.age}
                onChange={e => updateCharacter(activeCharIdx, { age: e.target.value })}
                className="w-full rounded-btn border border-border-light bg-surface-light px-3 py-2 text-aux dark:border-slate-600 dark:bg-slate-700 dark:text-text-main-dark"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-tag tracking-[0.04em] font-medium text-text-sub">{t('stepCharacters.appearanceLabel')}</label>
            <input
              type="text"
              value={current.appearanceKeywords}
              onChange={e => updateCharacter(activeCharIdx, { appearanceKeywords: e.target.value })}
              placeholder={t('stepCharacters.appearancePlaceholder')}
              className="w-full rounded-btn border border-border-light bg-surface-light px-3 py-2 text-aux dark:border-slate-600 dark:bg-slate-700 dark:text-text-main-dark"
            />
          </div>

          {/* Teaching style selector */}
          <div>
            <label className="mb-2 block text-tag tracking-[0.04em] font-medium text-text-sub">
              {t('stepCharacters.teachingStyle')} <span className="text-red-400">*</span>
            </label>
            <div className="grid grid-cols-5 gap-2">
              {(Object.entries(TEACHING_STYLE_LABELS) as [TeachingStyle, { label: string; desc: string; icon: string }][]).map(
                ([key, val]) => (
                  <button
                    key={key}
                    onClick={() => updateCharacter(activeCharIdx, { teachingStyle: key })}
                    className={`rounded-btn border p-2.5 text-center transition-colors ${
                      current.teachingStyle === key
                        ? 'border-blue-300 bg-blue-50 dark:border-blue-600 dark:bg-blue-900/20'
                        : 'border-border-light hover:border-border-light dark:border-slate-600'
                    }`}
                  >
                    <div className="text-subtitle">{val.icon}</div>
                    <div className="mt-1 text-tag tracking-[0.04em] font-medium text-text-main dark:text-text-main-dark">{val.label}</div>
                  </button>
                ),
              )}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-tag tracking-[0.04em] font-medium text-text-sub">{t('stepCharacters.personalityCore')}</label>
            <textarea
              value={current.personalityCore}
              onChange={e => updateCharacter(activeCharIdx, { personalityCore: e.target.value })}
              placeholder={t('stepCharacters.personalityPlaceholder')}
              rows={3}
              className="w-full rounded-btn border border-border-light bg-surface-light px-3 py-2 text-aux dark:border-slate-600 dark:bg-slate-700 dark:text-text-main-dark"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-tag tracking-[0.04em] font-medium text-text-sub">{t('stepCharacters.backstory')}</label>
              <label className="flex items-center gap-1.5 text-tag tracking-[0.04em] text-text-sub">
                <input
                  type="checkbox"
                  checked={current.backstoryAutoGenerate}
                  onChange={e => updateCharacter(activeCharIdx, { backstoryAutoGenerate: e.target.checked })}
                  className="rounded"
                />
                {t('stepCharacters.backstoryAuto')}
              </label>
            </div>
            <textarea
              value={current.backstoryHints}
              onChange={e => updateCharacter(activeCharIdx, { backstoryHints: e.target.value })}
              placeholder={current.backstoryAutoGenerate ? t('stepCharacters.backstoryAutoPlaceholder') : t('stepCharacters.backstoryManualPlaceholder')}
              rows={2}
              disabled={current.backstoryAutoGenerate && !current.backstoryHints}
              className="w-full rounded-btn border border-border-light bg-surface-light px-3 py-2 text-aux disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-text-main-dark"
            />
          </div>

          {/* Warmth slider */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-tag tracking-[0.04em] font-medium text-text-sub">{t('stepCharacters.warmth')}</label>
              <span className="text-tag tracking-[0.04em] text-text-placeholder">{current.initialWarmth}/10</span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              value={current.initialWarmth}
              onChange={e => updateCharacter(activeCharIdx, { initialWarmth: parseInt(e.target.value) })}
              className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-tag tracking-[0.04em] text-text-placeholder">
              <span>{t('stepCharacters.warmthCold')}</span>
              <span>{t('stepCharacters.warmthWarm')}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
