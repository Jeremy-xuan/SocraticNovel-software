import { useTranslation } from 'react-i18next';
import type { MetaPromptQuestionnaire } from '../../types';
import { TEACHING_STYLE_LABELS } from '../../types';

interface Props {
  data: MetaPromptQuestionnaire;
}

export default function StepReview({ data }: Props) {
  const { subject, course, characters, world, story } = data;
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-1 text-title leading-tight tracking-[0.04em] font-medium text-text-main dark:text-text-main-dark">{t('stepReview.title')}</h2>
        <p className="text-aux text-text-sub">{t('stepReview.desc')}</p>
      </div>

      {/* Subject & Course */}
      <Section title={t('stepReview.basicInfo')}>
        <Row label={t('stepReview.subject')} value={subject.subjectName} />
        <Row label={t('stepReview.textbook')} value={subject.textbook || t('stepReview.notSpecified')} />
        <Row label={t('stepReview.textbookFormat')} value={subject.textbookFormat} />
        <Row label={t('stepReview.workbook')} value={subject.hasWorkbook ? t('stepReview.workbookYes') : t('stepReview.workbookNo')} />
        <Row label={t('stepReview.totalChapters')} value={t('stepReview.chaptersUnit', { count: course.totalChapters })} />
        {course.uploadedMaterials.length > 0 && (
          <div className="flex gap-2 text-aux">
            <span className="min-w-[5rem] shrink-0 text-text-placeholder">{t('stepReview.uploadedMaterials')}</span>
            <div className="space-y-1">
              {course.uploadedMaterials.map((mat, i) => (
                <div key={i} className="text-text-main dark:text-text-main-dark">
                  <svg className="inline-block h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg> {mat.originalName} ({t('stepReview.chaptersUnit', { count: mat.pageCount }).replace(/章/, '页')})
                </div>
              ))}
            </div>
          </div>
        )}
        {course.uploadedMaterials.length === 0 && (
          <div className="flex gap-2 text-aux">
            <span className="min-w-[5rem] shrink-0 text-text-placeholder">{t('stepReview.uploadedMaterials')}</span>
            <span className="text-amber-500 dark:text-amber-400"><svg className="inline-block h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg> {t('stepReview.noMaterialsUploaded')}</span>
          </div>
        )}
        {course.completedChapters && <Row label={t('stepReview.completed')} value={course.completedChapters} />}
        {course.learningPeriod && <Row label={t('stepReview.learningPeriod')} value={course.learningPeriod} />}
        {course.topicOverview && <Row label={t('stepReview.topic')} value={course.topicOverview} />}
      </Section>

      {/* Characters */}
      <Section title={t('stepReview.characterDesign')}>
        {characters.map((char, i) => (
          <div key={i} className="mb-4 rounded-btn border border-slate-100 bg-bg-light p-4 last:mb-0 dark:border-slate-600 dark:bg-slate-700/50">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-subtitle font-medium text-text-main dark:text-text-main-dark">{char.name}</span>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-tag tracking-[0.04em] text-primary dark:bg-blue-900/30 dark:text-blue-300">
                {TEACHING_STYLE_LABELS[char.teachingStyle].icon} {TEACHING_STYLE_LABELS[char.teachingStyle].label}
              </span>
              {char.source === 'preset' && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-tag tracking-[0.04em] text-green-600 dark:bg-green-900/30 dark:text-green-300">
                  {t('stepReview.presetBadge')}
                </span>
              )}
            </div>
            <div className="space-y-1 text-aux text-text-sub dark:text-text-main-dark">
              <div><span className="text-text-placeholder">{t('stepReview.genderAge')}</span>{char.gender} / {char.age}</div>
              <div><span className="text-text-placeholder">{t('stepReview.appearance')}</span>{char.appearanceKeywords}</div>
              <div><span className="text-text-placeholder">{t('stepReview.personality')}</span>{char.personalityCore.slice(0, 80)}{char.personalityCore.length > 80 ? '...' : ''}</div>
              <div><span className="text-text-placeholder">{t('stepReview.backstory')}</span>{char.backstoryAutoGenerate ? t('stepReview.backstoryAuto') : (char.backstoryHints || t('stepReview.backstoryEmpty'))}</div>
              <div className="flex items-center"><span className="text-text-placeholder">{t('stepReview.warmthLabel')}</span>{Array.from({ length: Math.max(0, 5 - Math.round(char.initialWarmth / 2)) }, (_, i) => <svg key={`cold-${i}`} className="inline-block h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18m0-18l-4 4m4-4l4 4m-4 14l-4-4m4 4l4-4M3 12h18M3 12l4-4m-4 4l4 4m14-4l-4-4m4 4l-4 4" /></svg>)}{Array.from({ length: Math.round(char.initialWarmth / 2) }, (_, i) => <svg key={`warm-${i}`} className="inline-block h-4 w-4 text-orange-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z" /></svg>)}</div>
            </div>
          </div>
        ))}
      </Section>

      {/* World */}
      <Section title={t('stepReview.worldSection')}>
        <Row label={t('stepReview.locationStyle')} value={{
          enclosed: t('stepReview.locationStyleEnclosed'), 'semi-open': t('stepReview.locationStyleSemiOpen'),
          everyday: t('stepReview.locationStyleEveryday'), custom: t('stepReview.locationStyleCustom'),
        }[world.locationStyle]} />
        {world.characterRelations && <Row label={t('stepReview.characterRelations')} value={world.characterRelations} />}
        <Row label={t('stepReview.supernatural')} value={world.hasSupernatural ? world.supernaturalElement : t('stepReview.supernaturalNone')} />
      </Section>

      {/* Story */}
      <Section title={t('stepReview.storySection')}>
        <div className="mb-3">
          <span className="text-tag tracking-[0.04em] font-medium text-text-sub">{t('stepReview.emotionalPhases')}</span>
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
          <Row label={t('stepReview.rotationStyle')} value={story.rotationStyle === 'round-robin' ? t('stepReview.rotationRoundRobin') : t('stepReview.rotationThematic')} />
        )}
        <Row label={t('stepReview.groupChat')} value={story.enableGroupChat ? t('stepReview.groupChatEnabled', { name: story.groupChatName || t('stepReview.groupChatUnnamed') }) : t('stepReview.groupChatDisabled')} />
        {story.keyEvents && <Row label={t('stepReview.keyEvents')} value={story.keyEvents} />}
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
