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
                  📄 {mat.originalName} ({t('stepReview.chaptersUnit', { count: mat.pageCount }).replace(/章/, '页')})
                </div>
              ))}
            </div>
          </div>
        )}
        {course.uploadedMaterials.length === 0 && (
          <div className="flex gap-2 text-aux">
            <span className="min-w-[5rem] shrink-0 text-text-placeholder">{t('stepReview.uploadedMaterials')}</span>
            <span className="text-amber-500 dark:text-amber-400">⚠️ {t('stepReview.noMaterialsUploaded')}</span>
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
              <div><span className="text-text-placeholder">{t('stepReview.warmthLabel')}</span>{'❄️'.repeat(Math.max(0, 5 - Math.round(char.initialWarmth / 2)))}{'🔥'.repeat(Math.round(char.initialWarmth / 2))}</div>
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
        <Row label={t('stepReview.locationDesc')} value={world.location} />
        <Row label={t('stepReview.arrivalType')} value={{
          arranged: t('stepReview.arrivalArranged'), 'self-sought': t('stepReview.arrivalSelfSought'), accidental: t('stepReview.arrivalAccidental'),
        }[world.arrivalType]} />
        {world.arrivalReason && <Row label={t('stepReview.arrivalReason')} value={world.arrivalReason} />}
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
