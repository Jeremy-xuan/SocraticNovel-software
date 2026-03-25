import type { CurriculumUnit, CurriculumChapter, CurriculumOutline } from '../types';

/**
 * Parse curriculum.md into a structured outline.
 *
 * Expected format for each unit:
 *   ### Unit N — Title
 *   | 课次 | 章节 | 主题 | 教材文件 |
 *   |------|------|------|----------|
 *   | 1 | Ch.21 | 库仑定律、电荷守恒 | `materials/textbook/21_Coulomb_s_Law.pdf` |
 */
export function parseCurriculum(markdown: string): CurriculumOutline {
  const units: CurriculumUnit[] = [];

  // Split into unit sections by ### Unit N headers
  const unitPattern = /###\s+Unit\s+(\d+)\s*[—–-]\s*(.+)/g;
  const unitMatches = [...markdown.matchAll(unitPattern)];

  for (let i = 0; i < unitMatches.length; i++) {
    const match = unitMatches[i];
    const unitNumber = parseInt(match[1], 10);
    const title = match[2].trim();
    const startIdx = match.index! + match[0].length;
    const endIdx = i + 1 < unitMatches.length ? unitMatches[i + 1].index! : markdown.length;
    const section = markdown.slice(startIdx, endIdx);

    const chapters = parseUnitTable(section);

    units.push({
      unitId: `unit-${unitNumber}`,
      unitNumber,
      title,
      chapters,
    });
  }

  // Determine current chapter from progress section (下节课排班)
  let currentChapter: string | null = null;
  const nextLessonMatch = markdown.match(/章节：(Ch\.\d+)/);
  if (nextLessonMatch) {
    currentChapter = nextLessonMatch[1];
  }

  return { units, currentChapter };
}

function parseUnitTable(section: string): CurriculumChapter[] {
  const chapters: CurriculumChapter[] = [];
  const lines = section.split('\n');

  let inTable = false;
  for (const line of lines) {
    const trimmed = line.trim();

    // Detect table rows (starts and ends with |)
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      // Skip header row and separator row
      if (trimmed.includes('课次') || trimmed.includes('---')) {
        inTable = true;
        continue;
      }

      if (inTable) {
        const cells = trimmed.split('|').map(c => c.trim()).filter(c => c.length > 0);
        if (cells.length >= 3) {
          const lesson = cells[0];
          const chapter = cells[1];
          const title = cells[2];
          const materialFile = cells[3]?.replace(/`/g, '') || '';

          chapters.push({
            lesson,
            chapter,
            title,
            materialFile,
            status: 'not_started',
          });
        }
      }
    } else if (inTable && trimmed === '') {
      // Table ended
      inTable = false;
    }
  }

  return chapters;
}

/**
 * Parse progress.md to determine which chapters have been completed.
 * Returns a set of completed chapter identifiers (e.g. "Ch.21").
 */
export function parseProgressForChapters(progressMd: string): Set<string> {
  const completed = new Set<string>();
  const lines = progressMd.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('|') && !trimmed.includes('日期') && !trimmed.includes('---')) {
      const cells = trimmed.split('|').map(c => c.trim()).filter(c => c.length > 0);
      // cells: [日期, 章节, 主题, 老师, 概念掌握度, 计算掌握度, 备注]
      if (cells.length >= 2 && cells[1].startsWith('Ch.')) {
        completed.add(cells[1]);
      }
    }
  }

  return completed;
}

/**
 * Determine the "current" chapter — first non-completed chapter, or from progress.md hint.
 */
export function findCurrentChapter(
  outline: CurriculumOutline,
  progressHint: string | null,
): string | null {
  // If progress.md specifies the next chapter, use it
  if (progressHint) return progressHint;

  // Otherwise find first not_started chapter with a real chapter number
  for (const unit of outline.units) {
    for (const ch of unit.chapters) {
      if (ch.status === 'not_started' && ch.chapter.startsWith('Ch.')) {
        return ch.chapter;
      }
    }
  }

  return null;
}

/**
 * Apply completed chapters from progress.md onto the outline, marking statuses.
 */
export function applyProgress(
  outline: CurriculumOutline,
  completedChapters: Set<string>,
  currentChapter: string | null,
): CurriculumOutline {
  const updatedUnits = outline.units.map(unit => ({
    ...unit,
    chapters: unit.chapters.map(ch => {
      let status = ch.status;
      if (completedChapters.has(ch.chapter)) {
        status = 'completed' as const;
      } else if (ch.chapter === currentChapter) {
        status = 'in_progress' as const;
      }
      return { ...ch, status };
    }),
  }));

  return { units: updatedUnits, currentChapter };
}
