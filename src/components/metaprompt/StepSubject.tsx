import type { MetaPromptQuestionnaire } from '../../types';

interface Props {
  data: MetaPromptQuestionnaire;
  onChange: (partial: Partial<MetaPromptQuestionnaire>) => void;
}

const FORMAT_OPTIONS = [
  { value: 'pdf', label: 'PDF' },
  { value: 'paper', label: '纸质' },
  { value: 'ebook', label: '电子书' },
  { value: 'none', label: '没有教材' },
] as const;

const CHAR_COUNT_OPTIONS = [
  { value: 1, label: '1 位', desc: '所有课由一位老师教，故事聚焦' },
  { value: 2, label: '2 位', desc: '两种教学风格交替（推荐）' },
  { value: 3, label: '3 位', desc: '三种视角轮值，叙事最丰富' },
] as const;

export default function StepSubject({ data, onChange }: Props) {
  const { subject, course, characterCount } = data;

  const setSubject = (partial: Partial<typeof subject>) =>
    onChange({ subject: { ...subject, ...partial } });

  const setCourse = (partial: Partial<typeof course>) =>
    onChange({ course: { ...course, ...partial } });

  return (
    <div className="space-y-8">
      <div>
        <h2 className="mb-1 text-2xl font-bold text-slate-800 dark:text-slate-100">📋 基础信息</h2>
        <p className="text-sm text-slate-500">告诉我们你想学什么</p>
      </div>

      {/* Subject */}
      <section className="space-y-4">
        <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">学科与教材</h3>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
            学科名称 <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={subject.subjectName}
            onChange={e => setSubject({ subjectName: e.target.value })}
            placeholder="例：AP Physics C: E&M、线性代数、日语 N2"
            className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
            教材名称（如有）
          </label>
          <input
            type="text"
            value={subject.textbook}
            onChange={e => setSubject({ textbook: e.target.value })}
            placeholder="例：Griffiths Introduction to Electrodynamics 4th"
            className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
          />
        </div>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">教材格式</label>
            <div className="flex flex-wrap gap-2">
              {FORMAT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setSubject({ textbookFormat: opt.value })}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    subject.textbookFormat === opt.value
                      ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-900/30 dark:text-blue-300'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-600 dark:text-slate-400'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={subject.hasWorkbook}
                onChange={e => setSubject({ hasWorkbook: e.target.checked })}
                className="rounded"
              />
              有配套练习册
            </label>
          </div>
        </div>
      </section>

      {/* Course structure */}
      <section className="space-y-4">
        <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">课程结构</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
              总章节数 <span className="text-red-400">*</span>
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={course.totalChapters || ''}
              onChange={e => setCourse({ totalChapters: parseInt(e.target.value) || 0 })}
              placeholder="如 30"
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">学习周期</label>
            <input
              type="text"
              value={course.learningPeriod}
              onChange={e => setCourse({ learningPeriod: e.target.value })}
              placeholder="一学期 / 三个月 / 不确定"
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
            已完成的章节（如有）
          </label>
          <input
            type="text"
            value={course.completedChapters}
            onChange={e => setCourse({ completedChapters: e.target.value })}
            placeholder="例：Ch.1-5 已完成"
            className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">主题概览</label>
          <textarea
            value={course.topicOverview}
            onChange={e => setCourse({ topicOverview: e.target.value })}
            placeholder="简要描述课程涵盖的主要主题..."
            rows={3}
            className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
          />
        </div>
      </section>

      {/* Character count */}
      <section className="space-y-4">
        <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">角色数量</h3>
        <div className="grid grid-cols-3 gap-3">
          {CHAR_COUNT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => onChange({
                characterCount: opt.value as 1 | 2 | 3,
                characters: data.characters.slice(0, opt.value),
              })}
              className={`rounded-xl border p-4 text-left transition-colors ${
                characterCount === opt.value
                  ? 'border-blue-300 bg-blue-50 dark:border-blue-600 dark:bg-blue-900/20'
                  : 'border-slate-200 hover:border-slate-300 dark:border-slate-600 dark:hover:border-slate-500'
              }`}
            >
              <div className="mb-1 text-lg font-bold text-slate-700 dark:text-slate-200">{opt.label}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{opt.desc}</div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
