/**
 * Shared Mermaid initialization — ensures mermaid.initialize() is called exactly once,
 * with a polished academic theme that matches the app's design system.
 */
import mermaid from 'mermaid';

let initialized = false;
let currentIsDark: boolean | null = null;

const lightTheme = {
  theme: 'base' as const,
  themeVariables: {
    // Core palette — warm slate + indigo accent (matches app design system)
    primaryColor: '#EEF2FF',          // indigo-50
    primaryTextColor: '#1E1B4B',      // indigo-950
    primaryBorderColor: '#6366F1',    // indigo-500
    secondaryColor: '#F1F5F9',        // slate-100
    secondaryTextColor: '#334155',    // slate-700
    secondaryBorderColor: '#CBD5E1',  // slate-300
    tertiaryColor: '#FFF7ED',         // orange-50
    tertiaryTextColor: '#7C2D12',     // orange-900
    tertiaryBorderColor: '#F97316',   // orange-500

    // Graph background & edges
    background: '#FFFFFF',
    mainBkg: '#EEF2FF',
    nodeBorder: '#6366F1',
    clusterBkg: '#F8FAFC',
    clusterBorder: '#CBD5E1',
    edgeLabelBackground: '#F8FAFC',
    lineColor: '#6366F1',

    // Typography
    // fontFamily: "'Inter', 'PingFang SC', system-ui, sans-serif",
    fontSize: '14px',

    // Status colors
    errorBkgColor: '#FEF2F2',
    errorTextColor: '#991B1B',

    // Sequence diagram
    actorBkg: '#EEF2FF',
    actorBorder: '#6366F1',
    actorTextColor: '#1E1B4B',
    actorLineColor: '#A5B4FC',
    signalColor: '#4F46E5',
    signalTextColor: '#1E1B4B',
    labelBoxBkgColor: '#F8FAFC',
    labelBoxBorderColor: '#CBD5E1',
    labelTextColor: '#334155',
    loopTextColor: '#4F46E5',
    activationBorderColor: '#6366F1',
    activationBkgColor: '#E0E7FF',
    sequenceNumberColor: '#FFFFFF',

    // Git graph
    git0: '#6366F1',
    git1: '#EC4899',
    git2: '#10B981',
    git3: '#F59E0B',
    git4: '#3B82F6',
    git5: '#8B5CF6',
    git6: '#EF4444',
    git7: '#06B6D4',
    gitBranchLabel0: '#FFFFFF',
    gitBranchLabel1: '#FFFFFF',
    gitBranchLabel2: '#FFFFFF',
    gitBranchLabel3: '#FFFFFF',
    gitBranchLabel4: '#FFFFFF',
    gitBranchLabel5: '#FFFFFF',
    gitBranchLabel6: '#FFFFFF',
    gitBranchLabel7: '#FFFFFF',
    gitInv0: '#FFFFFF',
    gitInv1: '#FFFFFF',
    gitInv2: '#FFFFFF',

    // Pie chart
    pie1: '#6366F1',
    pie2: '#EC4899',
    pie3: '#10B981',
    pie4: '#F59E0B',
    pie5: '#3B82F6',
    pie6: '#8B5CF6',
    pie7: '#EF4444',
    pie8: '#06B6D4',
    pieSectionTextColor: '#FFFFFF',
    pieLegendTextColor: '#334155',

    // Class diagram
    classText: '#1E1B4B',

    // Fill / stroke
    fillType0: '#EEF2FF',
    fillType1: '#FFF7ED',
    fillType2: '#F0FDF4',
    fillType3: '#FEF9C3',
    fillType4: '#FCE7F3',
    fillType5: '#EFF6FF',
    fillType6: '#FFF1F2',
    fillType7: '#F0FDFA',
  },
};

const darkTheme = {
  theme: 'base' as const,
  themeVariables: {
    darkMode: true,

    // Core palette — deep slate + indigo (dark)
    primaryColor: '#1E1B4B',          // indigo-950
    primaryTextColor: '#E0E7FF',      // indigo-100
    primaryBorderColor: '#818CF8',    // indigo-400
    secondaryColor: '#1E293B',        // slate-800
    secondaryTextColor: '#CBD5E1',    // slate-300
    secondaryBorderColor: '#475569',  // slate-600
    tertiaryColor: '#1C1917',         // stone-900
    tertiaryTextColor: '#FDE68A',     // amber-200
    tertiaryBorderColor: '#F59E0B',   // amber-500

    // Graph background & edges
    background: '#0F172A',
    mainBkg: '#1E1B4B',
    nodeBorder: '#818CF8',
    clusterBkg: '#1E293B',
    clusterBorder: '#475569',
    edgeLabelBackground: '#1E293B',
    lineColor: '#818CF8',

    // Typography
    // fontFamily: "'Inter', 'PingFang SC', system-ui, sans-serif",
    fontSize: '14px',

    // Status colors
    errorBkgColor: '#450A0A',
    errorTextColor: '#FCA5A5',

    // Sequence diagram
    actorBkg: '#1E1B4B',
    actorBorder: '#818CF8',
    actorTextColor: '#E0E7FF',
    actorLineColor: '#4338CA',
    signalColor: '#A5B4FC',
    signalTextColor: '#E0E7FF',
    labelBoxBkgColor: '#1E293B',
    labelBoxBorderColor: '#475569',
    labelTextColor: '#CBD5E1',
    loopTextColor: '#A5B4FC',
    activationBorderColor: '#818CF8',
    activationBkgColor: '#312E81',
    sequenceNumberColor: '#E0E7FF',

    // Git graph
    git0: '#818CF8',
    git1: '#F472B6',
    git2: '#34D399',
    git3: '#FBBF24',
    git4: '#60A5FA',
    git5: '#A78BFA',
    git6: '#F87171',
    git7: '#22D3EE',
    gitBranchLabel0: '#1E1B4B',
    gitBranchLabel1: '#4A1942',
    gitBranchLabel2: '#022C22',
    gitBranchLabel3: '#451A03',
    gitBranchLabel4: '#172554',
    gitBranchLabel5: '#2E1065',
    gitBranchLabel6: '#450A0A',
    gitBranchLabel7: '#083344',
    gitInv0: '#E0E7FF',
    gitInv1: '#FCE7F3',
    gitInv2: '#D1FAE5',

    // Pie chart
    pie1: '#818CF8',
    pie2: '#F472B6',
    pie3: '#34D399',
    pie4: '#FBBF24',
    pie5: '#60A5FA',
    pie6: '#A78BFA',
    pie7: '#F87171',
    pie8: '#22D3EE',
    pieSectionTextColor: '#0F172A',
    pieLegendTextColor: '#CBD5E1',

    // Class diagram
    classText: '#E0E7FF',

    // Fill / stroke
    fillType0: '#1E1B4B',
    fillType1: '#292524',
    fillType2: '#052E16',
    fillType3: '#422006',
    fillType4: '#3D0A35',
    fillType5: '#172554',
    fillType6: '#450A0A',
    fillType7: '#042F2E',
  },
};

export function initMermaid(): void {
  const isDark = document.documentElement.classList.contains('dark');

  // Re-initialize if theme changed
  if (initialized && currentIsDark === isDark) return;

  const config = isDark ? darkTheme : lightTheme;
  try {
    mermaid.initialize({
      ...config,
      startOnLoad: false,
      securityLevel: 'loose',
      flowchart: {
        useMaxWidth: true,
        htmlLabels: true,
        curve: 'basis',        // smooth bezier curves
        padding: 20,
        rankSpacing: 50,
        nodeSpacing: 40,
      },
      sequence: {
        useMaxWidth: true,
        diagramMarginX: 20,
        diagramMarginY: 10,
        actorMargin: 60,
        boxMargin: 10,
        boxTextMargin: 5,
        noteMargin: 10,
        messageMargin: 35,
        mirrorActors: true,
        bottomMarginAdj: 1,
        rightAngles: false,
        showSequenceNumbers: false,
        // fontFamily: "'Inter', 'PingFang SC', system-ui, sans-serif",
      },
      gantt: {
        useMaxWidth: true,
        topPadding: 50,
        leftPadding: 75,
        gridLineStartPadding: 35,
        fontSize: 13,
        // fontFamily: "'Inter', 'PingFang SC', system-ui, sans-serif",
      },
      pie: {
        useMaxWidth: true,
        textPosition: 0.75,
      },
    });
  } catch (e) {
    console.warn('[Mermaid] initialize failed:', e);
  }

  initialized = true;
  currentIsDark = isDark;
}

/**
 * Force re-initialization on theme change.
 * Call this when switching between light/dark mode.
 */
export function resetMermaidInit(): void {
  initialized = false;
  currentIsDark = null;
}

// 主题切换后重新渲染已存在的图表
export const reRenderMermaidDiagrams = () => {
  const diagrams = document.querySelectorAll('.mermaid');
  if (diagrams.length === 0) return;
  try {
    mermaid.run({ nodes: Array.from(diagrams) as HTMLElement[] });
  } catch {
    // Silently ignore
  }
};
