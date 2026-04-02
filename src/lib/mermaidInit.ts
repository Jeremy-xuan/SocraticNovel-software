/**
 * Shared Mermaid initialization — ensures mermaid.initialize() is called exactly once,
 * with 'base' theme and themeVariables for academic-clean styling.
 */
import mermaid from 'mermaid';

let initialized = false;

const lightTheme = {
  theme: 'base' as const,
  themeVariables: {
    primaryColor: '#eff6ff',
    primaryTextColor: '#1e3a8a',
    primaryBorderColor: '#3b82f6',
    secondaryColor: '#f1f5f9',
    lineColor: '#64748b',
    background: '#ffffff',
    edgeLabelBackground: '#ffffff',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: '14px',
    nodeBorder: '#3b82f6',
    clusterBkg: '#f8fafc',
    clusterBorder: '#cbd5e1',
  },
};

const darkTheme = {
  theme: 'base' as const,
  themeVariables: {
    darkMode: true,
    primaryColor: '#1e293b',
    primaryTextColor: '#f1f5f9',
    primaryBorderColor: '#3b82f6',
    secondaryColor: '#334155',
    lineColor: '#94a3b8',
    background: '#0f172a',
    edgeLabelBackground: '#1e293b',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: '14px',
    nodeBorder: '#3b82f6',
    clusterBkg: '#1e293b',
    clusterBorder: '#475569',
  },
};

export function initMermaid(): void {
  if (initialized) return;
  const isDark = document.documentElement.classList.contains('dark');
  try {
    mermaid.initialize(isDark ? darkTheme : lightTheme);
  } catch (e) {
    console.warn('[Mermaid] initialize failed:', e);
  }
  initialized = true;
}

// 主题切换后重新渲染已存在的图表（否则旧图表不更新）
export const reRenderMermaidDiagrams = () => {
  const diagrams = document.querySelectorAll('.mermaid');
  if (diagrams.length === 0) return;
  try {
    // Mermaid v11+ API
    mermaid.run({ nodes: Array.from(diagrams) as HTMLElement[] });
  } catch {
    // Mermaid v10 fallback：重新初始化
    const currentTheme = document.querySelector('.mermaid')?.getAttribute('data-theme');
    if (currentTheme) {
      mermaid.initialize({ theme: currentTheme as any });
    }
  }
};
