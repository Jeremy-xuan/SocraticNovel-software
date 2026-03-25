import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';
import { initBuiltinWorkspace, listWorkspaces, createWorkspace, deleteWorkspace, updateWorkspaceMeta, hasApiKey, getReviewStats } from '../lib/tauri';
import type { ReviewStats } from '../types';

export default function LandingPage() {
  const navigate = useNavigate();
  const { settings, updateSettings } = useAppStore();

  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [reviewStats, setReviewStats] = useState<ReviewStats | null>(null);

  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        let wsList = await listWorkspaces();
        if (wsList.length === 0) {
          await initBuiltinWorkspace();
          wsList = await listWorkspaces();
        }
        setWorkspaces(wsList);

        let activeWs = wsList.find((w: any) => w.id === settings.currentWorkspaceId);
        if (!activeWs && wsList.length > 0) {
          activeWs = wsList[0];
          updateSettings({ currentWorkspaceId: activeWs.id, currentWorkspacePath: activeWs.path });
        }

        const keyOk = await hasApiKey(settings.aiProvider);
        updateSettings({ apiKeyConfigured: keyOk });

        if (activeWs) {
          try {
            const rs = await getReviewStats(activeWs.path);
            setReviewStats(rs);
          } catch { }
        }
      } catch (err) {
        setInitError(String(err));
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const activeWorkspace = workspaces.find(w => w.id === settings.currentWorkspaceId) || workspaces[0];

  const handleSwitchWorkspace = async (ws: any) => {
    updateSettings({ currentWorkspaceId: ws.id, currentWorkspacePath: ws.path });
    setShowWorkspaceMenu(false);
    try {
      await updateWorkspaceMeta(ws.id);
    } catch { /* ignore */ }
    try {
      const rs = await getReviewStats(ws.path);
      setReviewStats(rs);
    } catch {
      setReviewStats(null);
    }
  };

  const handleDeleteWorkspace = async (ws: any) => {
    if (ws.id === 'ap-physics-em') return;
    if (!confirm(`确定要删除工作区 '${ws.name}' 吗？此操作不可撤销。`)) return;
    try {
      setIsDeleting(true);
      await deleteWorkspace(ws.id);
      const wsList = await listWorkspaces();
      setWorkspaces(wsList);
      if (settings.currentWorkspaceId === ws.id) {
        const next = wsList[0];
        if (next) {
          updateSettings({ currentWorkspaceId: next.id, currentWorkspacePath: next.path });
          try {
            const rs = await getReviewStats(next.path);
            setReviewStats(rs);
          } catch { setReviewStats(null); }
        } else {
          updateSettings({ currentWorkspaceId: null, currentWorkspacePath: null });
          setReviewStats(null);
        }
      }
    } catch (err) {
      alert("删除失败: " + String(err));
    } finally {
      setIsDeleting(false);
    }
  };

  const formatLastOpened = (ts: string | null | undefined) => {
    if (!ts) return null;
    try {
      const d = new Date(ts);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return '刚刚';
      if (diffMin < 60) return `${diffMin}分钟前`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr}小时前`;
      const diffDay = Math.floor(diffHr / 24);
      if (diffDay < 30) return `${diffDay}天前`;
      return d.toLocaleDateString('zh-CN');
    } catch { return null; }
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;
    try {
      setIsCreating(true);
      const newWs = await createWorkspace(newWorkspaceName.trim());
      const wsList = await listWorkspaces();
      setWorkspaces(wsList);
      await handleSwitchWorkspace(newWs);
      setNewWorkspaceName('');
    } catch (err) {
      alert("创建失败: " + String(err));
    } finally {
      setIsCreating(false);
    }
  };

  const handleStartLesson = () => {
    if (!settings.apiKeyConfigured) {
      navigate('/settings');
      return;
    }
    navigate('/lesson');
  };

  const handleStartReview = () => {
    if (!settings.apiKeyConfigured) {
      navigate('/settings');
      return;
    }
    navigate('/review');
  };

  return (
    <div className="flex h-screen flex-col bg-bg-light dark:bg-bg-dark font-sans text-text-main dark:text-text-main-dark selection:bg-primary/20 overflow-hidden relative">

      {/* Top Absolute Controls */}
      <div className="absolute top-8 w-full px-8 z-20 flex justify-between items-center pointer-events-none">

        {/* Workspace Switcher Component (Left) */}
        {!loading && activeWorkspace && (
          <div className="relative z-30 pointer-events-auto">
            <button
              onClick={() => setShowWorkspaceMenu(!showWorkspaceMenu)}
              className="group flex flex-row items-center gap-2 rounded-full border border-black/5 bg-surface-light px-4 py-1.5 text-[12px] font-medium text-text-sub transition-colors hover:bg-black/5 hover:text-text-main dark:border-white/5 dark:bg-surface-dark dark:text-text-placeholder dark:hover:bg-white/5 dark:hover:text-text-main-dark shadow-sm"
            >
              <div className="h-2 w-2 rounded-full bg-success/80"></div>
              <span className="max-w-[140px] truncate pr-1">{activeWorkspace.name}</span>
              <svg className={`transition-transform duration-300 ${showWorkspaceMenu ? 'rotate-180' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </button>

            {showWorkspaceMenu && (
              <>
                <div className="fixed inset-0 z-40 bg-black/5 backdrop-blur-[1px] dark:bg-white/5" onClick={() => setShowWorkspaceMenu(false)}></div>
                <div className="absolute left-0 top-full mt-3 w-64 z-50 overflow-hidden rounded-[16px] border border-border-light bg-surface-light p-2 shadow-2xl dark:border-border-dark dark:bg-surface-dark animate-fade-in origin-top-left">
                  <div className="max-h-56 overflow-y-auto">
                    {workspaces.map((ws) => (
                      <div key={ws.id} className="group/item flex items-center gap-1">
                        <button
                          onClick={() => handleSwitchWorkspace(ws)}
                          className={`flex-1 flex items-center justify-between rounded-[8px] px-3 py-2.5 text-left text-[13px] transition-colors ${activeWorkspace.id === ws.id ? 'bg-black/5 text-text-main font-medium dark:bg-white/10 dark:text-white' : 'text-text-sub hover:bg-black/5 dark:text-text-placeholder dark:hover:bg-white/5'}`}
                        >
                          <div className="flex flex-col gap-0.5 min-w-0 pr-2">
                            <span className="truncate">{ws.name}</span>
                            {ws.lastOpened && (
                              <span className="text-[10px] text-text-placeholder truncate">最近打开: {formatLastOpened(ws.lastOpened)}</span>
                            )}
                          </div>
                          {activeWorkspace.id === ws.id && <svg className="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
                        </button>
                        {ws.id === 'ap-physics-em' ? (
                          <div className="shrink-0 w-7 h-7 flex items-center justify-center" title="内置工作区不可删除">
                            <span className="text-[12px] text-text-placeholder/40 cursor-not-allowed">🔒</span>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteWorkspace(ws); }}
                            disabled={isDeleting}
                            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-text-placeholder/60 opacity-0 group-hover/item:opacity-100 hover:text-danger hover:bg-danger/10 transition-all"
                            title="删除工作区"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="my-2 h-[1px] w-full bg-border-light dark:bg-border-dark"></div>
                  <form onSubmit={handleCreateWorkspace} className="flex flex-col gap-2 px-1 pb-1">
                    <input
                      type="text"
                      placeholder="新学科 (如 ap-chem)"
                      value={newWorkspaceName}
                      onChange={(e) => setNewWorkspaceName(e.target.value)}
                      className="w-full rounded-[8px] bg-bg-light px-3 py-2 text-[12px] text-text-main outline-none focus:ring-1 focus:ring-black/20 dark:focus:ring-white/20 dark:bg-bg-dark"
                    />
                    <button
                      type="submit"
                      disabled={isCreating || !newWorkspaceName.trim()}
                      className="w-full rounded-[8px] bg-black/80 py-1.5 text-[12px] font-medium text-white transition-all hover:bg-black disabled:opacity-50 dark:bg-white/80 dark:text-black dark:hover:bg-white"
                    >
                      {isCreating ? '创建中...' : '+ 新建档案'}
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        )}

        {/* Right Settings */}
        <div className="flex items-center gap-4 pointer-events-auto">
          {initError && (
            <div className="flex items-center gap-2 rounded-full border border-danger/10 bg-danger/5 px-3 py-1.5 text-[11px] font-medium text-danger">
              ! {initError}
            </div>
          )}
          {!loading && !settings.apiKeyConfigured && (
            <div className="flex cursor-pointer items-center gap-2 rounded-full border border-danger/10 bg-danger/5 px-3 py-1.5 text-[11px] font-medium text-danger transition-colors hover:bg-danger/10" onClick={() => navigate('/settings')}>
              <span className="h-1.5 w-1.5 rounded-full bg-danger animate-pulse"></span>
              API Key 缺失
            </div>
          )}
          <button
            onClick={() => navigate('/settings')}
            className="text-text-placeholder hover:text-text-main transition-colors dark:hover:text-text-main-dark"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
          </button>
        </div>
      </div>

      {/* Main Container */}
      <main className="flex-1 flex flex-col items-center justify-center w-full px-6 sm:px-12 relative z-10 pb-12">

        {/* Giant SocraticNovel Header */}
        <div className="flex flex-col items-center text-center w-full mb-14">
          <h1 className="text-[44px] sm:text-[56px] font-[400] tracking-tight text-text-main dark:text-text-main-dark mb-1 font-serif">
            SocraticNovel
          </h1>
          <p className="text-[15px] sm:text-[16px] text-text-placeholder dark:text-text-placeholder tracking-widest uppercase">
            让学习不再孤独
          </p>
        </div>

        {/* The Claude Cards Row */}
        <div className="w-full max-w-[800px] grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-12">

          {/* Card 1: Main Story */}
          <button
            onClick={handleStartLesson}
            className="group relative flex flex-col items-start rounded-[20px] bg-surface-light dark:bg-surface-dark p-7 sm:p-8 border border-black/5 dark:border-white/5 shadow-sm hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] transition-all duration-400 text-left w-full h-full transform hover:-translate-y-1"
          >
            <div className="w-full flex justify-between items-start mb-10">
              {/* Hand-drawn SVG mimicking Claude */}
              <svg className="opacity-80 group-hover:opacity-100 transition-opacity" width="40" height="40" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Beige fill off-set */}
                <path d="M12 9h12v18H12z" fill="#F0ECE1" className="dark:fill-[#38332C]" />
                <path d="M6 11h10v16H6z" fill="#EAE5DF" className="dark:fill-[#464038]" />
                {/* Stroke */}
                <path d="M6 8h20v18H6V8z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M16 8v18" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M10 12h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M10 15h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M20 12h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>

              <span className="rounded-full bg-black/5 dark:bg-white/5 px-2.5 py-1 text-[11px] font-medium text-text-sub dark:text-text-placeholder tracking-wide">
                核心伴读
              </span>
            </div>

            <h2 className="font-serif text-[28px] sm:text-[32px] text-text-main dark:text-text-main-dark mb-2 tracking-tight group-hover:text-primary transition-colors">
              学习模式
            </h2>
            <p className="text-[14px] leading-relaxed text-text-sub dark:text-text-placeholder">
              苏格拉底式学习+轻小说式叙述，让AI像人一样陪伴你学习。
            </p>
          </button>

          {/* Card 2: Practice */}
          <button
            onClick={handleStartReview}
            className="group relative flex flex-col items-start rounded-[20px] bg-surface-light dark:bg-surface-dark p-7 sm:p-8 border border-black/5 dark:border-white/5 shadow-sm hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] transition-all duration-400 text-left w-full h-full transform hover:-translate-y-1"
          >
            <div className="w-full flex justify-between items-start mb-10">
              {/* Hand-drawn Target/Clipboard SVG mimicking Claude */}
              <svg className="opacity-80 group-hover:opacity-100 transition-opacity" width="40" height="40" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 8h12v18H12z" fill="#E8EDEB" className="dark:fill-[#2B3A36]" />
                <path d="M8 10h16v18H8V10z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M12 7h8v4h-8V7z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M12 16l2 2 4-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M12 22l2 2 4-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>

              <span className="rounded-full bg-black/5 dark:bg-white/5 px-2.5 py-1 text-[11px] font-medium text-text-sub dark:text-text-placeholder tracking-wide">
                沉浸复习
              </span>
            </div>

            <h2 className="font-serif text-[28px] sm:text-[32px] text-text-main dark:text-text-main-dark mb-2 tracking-tight group-hover:text-success transition-colors">
              刷题模式
            </h2>
            <p className="text-[14px] leading-relaxed text-text-sub dark:text-text-placeholder">
              沉浸式辅导协议，在读轻小说之余把题给刷完，独立于学习模式存在。
            </p>
          </button>

        </div>

        {/* Bottom subtle links (Pills) */}
        <div className="flex gap-4 sm:gap-6 mt-2">
          <button
            onClick={() => navigate('/spaced-review')}
            className="relative flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium text-text-sub transition-colors hover:bg-black/5 hover:text-text-main dark:text-text-placeholder dark:hover:bg-white/5 dark:hover:text-text-main-dark"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="16" height="16"><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>
            间隔复习
            {reviewStats && reviewStats.dueToday > 0 && (
              <span className="absolute top-1.5 right-1.5 flex h-2 w-2 rounded-full bg-primary/80 animate-pulse"></span>
            )}
          </button>

          <button
            onClick={() => navigate('/meta-prompt')}
            className="flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium text-text-sub transition-colors hover:bg-black/5 hover:text-text-main dark:text-text-placeholder dark:hover:bg-white/5 dark:hover:text-text-main-dark"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="16" height="16"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
            构建系统
          </button>
        </div>

      </main>

      {/* Discrete Ghost Footer */}
      <div className="absolute bottom-8 w-full px-12 flex justify-between items-center text-text-placeholder z-20 pointer-events-none">
        <div className="flex gap-8 pointer-events-auto opacity-70 hover:opacity-100 transition-opacity duration-300">
          <button onClick={() => navigate('/notes')} className="text-[12px] font-medium hover:text-text-main transition-colors dark:hover:text-text-main-dark">课程笔记</button>
          <button onClick={() => navigate('/pdf-import')} className="text-[12px] font-medium hover:text-text-main transition-colors dark:hover:text-text-main-dark">提取教材</button>
        </div>
        <div className="pointer-events-auto opacity-70 hover:opacity-100 transition-opacity duration-300">
          <button onClick={() => navigate('/progress')} className="text-[12px] font-medium hover:text-text-main flex items-center gap-1 transition-colors dark:hover:text-text-main-dark">
            学习档案 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17l9.2-9.2M17 17V7H7" /></svg>
          </button>
        </div>
      </div>

    </div>
  );
}
