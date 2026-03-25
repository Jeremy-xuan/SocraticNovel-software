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

  const [activeTab, setActiveTab] = useState<'lesson' | 'review'>('lesson');

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

      {/* Top Controls */}
      <div className="absolute top-8 right-8 z-20 flex items-center gap-5">
        {initError && (
          <div className="flex items-center gap-2 rounded-full border border-danger/10 bg-danger/5 px-3 py-1.5 text-[12px] font-medium text-danger backdrop-blur-md">
            ! {initError}
          </div>
        )}
        {!loading && !settings.apiKeyConfigured && (
          <div className="flex cursor-pointer items-center gap-2 rounded-full border border-danger/10 bg-danger/5 px-3 py-1.5 text-[12px] font-medium text-danger backdrop-blur-md transition-colors hover:bg-danger/10" onClick={() => navigate('/settings')}>
            <span className="h-1.5 w-1.5 rounded-full bg-danger animate-pulse"></span>
            未配置 API Key
          </div>
        )}
        <button
          onClick={() => navigate('/settings')}
          className="text-text-placeholder hover:text-text-main transition-colors duration-300 dark:hover:text-text-main-dark"
          aria-label="Settings"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>

      {/* Primary Centered Action Area */}
      <main className="flex-1 flex flex-col items-center justify-center w-full px-6 sm:px-12 relative z-10">

        {/* Workspace Pillar (Subtle Breadcrumb style) */}
        {!loading && activeWorkspace && (
          <div className="relative mb-6 z-30">
            <button
              onClick={() => setShowWorkspaceMenu(!showWorkspaceMenu)}
              className="group flex flex-row items-center gap-2 rounded-full border border-black/[0.04] bg-black/[0.01] px-4 py-1.5 text-[12px] font-medium text-text-sub transition-colors hover:bg-black/[0.04] hover:text-text-main dark:border-white/5 dark:text-text-placeholder dark:hover:bg-white/5 dark:hover:text-text-main-dark"
            >
              <div className="h-1.5 w-1.5 rounded-full bg-success opacity-80"></div>
              <span className="max-w-[140px] truncate pr-1">{activeWorkspace.name}</span>
              <svg className={`transition-transform duration-300 ${showWorkspaceMenu ? 'rotate-180' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </button>

            {showWorkspaceMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowWorkspaceMenu(false)}></div>
                <div className="absolute left-1/2 top-full mt-2 w-56 -translate-x-1/2 z-50 overflow-hidden rounded-[14px] border border-border-light bg-surface-light p-2 shadow-xl dark:border-border-dark dark:bg-surface-dark origin-top animate-fade-in">
                  <div className="max-h-48 overflow-y-auto">
                    {workspaces.map((ws) => (
                      <div key={ws.id} className="group/item flex items-center gap-1">
                        <button
                          onClick={() => handleSwitchWorkspace(ws)}
                          className={`flex-1 flex items-center justify-between rounded-[8px] px-3 py-2.5 text-left text-[13px] transition-colors ${activeWorkspace.id === ws.id ? 'bg-primary/10 text-primary font-medium' : 'text-text-main hover:bg-black/5 dark:text-text-main-dark dark:hover:bg-white/5'}`}
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
                      placeholder="新学科域 (如 default)"
                      value={newWorkspaceName}
                      onChange={(e) => setNewWorkspaceName(e.target.value)}
                      className="w-full rounded-[8px] bg-bg-light px-3 py-2 text-[12px] text-text-main outline-none focus:ring-1 focus:ring-primary dark:bg-bg-dark"
                    />
                    <button
                      type="submit"
                      disabled={isCreating || !newWorkspaceName.trim()}
                      className="w-full rounded-[8px] bg-text-main py-1.5 text-[12px] font-medium text-surface-light transition-all hover:bg-black disabled:opacity-50 dark:bg-text-main-dark dark:text-surface-dark dark:hover:bg-white"
                    >
                      {isCreating ? '创建中...' : '+ 新建档案'}
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        )}

        {/* Vintage Elegant Greeting */}
        <div className="flex flex-col items-center text-center w-full mb-10">
          <div className="mb-4 text-primary opacity-80 animate-pulse">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          </div>
          <h1 className="text-[40px] sm:text-[50px] font-serif tracking-tight text-text-main dark:text-text-main-dark mb-1">
            SocraticNovel
          </h1>
          <p className="text-[15px] sm:text-[17px] text-text-sub dark:text-text-placeholder font-serif italic tracking-wide">
            让学习不再孤独。
          </p>
        </div>

        {/* Form-styled Primary Input CTA with Tabs */}
        <div className="w-full max-w-[620px] mb-4 relative flex flex-col items-start">

          {/* Mode Switcher Tabs */}
          <div className="flex items-center gap-1 mb-3 ml-2 px-1">
            <button
              onClick={() => setActiveTab('lesson')}
              className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition-all duration-200 ${activeTab === 'lesson'
                ? 'bg-black/5 text-text-main dark:bg-white/10 dark:text-text-main-dark'
                : 'text-text-placeholder hover:text-text-main dark:hover:text-text-main-dark'
                }`}
            >
              学习模式
            </button>
            <button
              onClick={() => setActiveTab('review')}
              className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition-all duration-200 ${activeTab === 'review'
                ? 'bg-black/5 text-text-main dark:bg-white/10 dark:text-text-main-dark'
                : 'text-text-placeholder hover:text-text-main dark:hover:text-text-main-dark'
                }`}
            >
              刷题模式
            </button>
          </div>

          {/* Core Input Box */}
          <div className="w-full relative group">
            <div className={`absolute -inset-1 rounded-[24px] bg-gradient-to-r to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 blur-lg ${activeTab === 'lesson' ? 'from-primary/10 via-primary/5' : 'from-success/10 via-success/5'}`}></div>
            <button
              onClick={activeTab === 'lesson' ? handleStartLesson : handleStartReview}
              className="relative w-full flex items-center justify-between rounded-[24px] bg-surface-light dark:bg-surface-dark p-4 sm:py-5 sm:px-6 shadow-[0_2px_12px_rgb(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] transition-all duration-400 border border-black/[0.06] dark:border-white/[0.04]"
            >
              <div className="flex items-center gap-4">
                <div className={`transition-colors duration-300 ${activeTab === 'lesson' ? 'text-primary/60 group-hover:text-primary' : 'text-success/60 group-hover:text-success'}`}>
                  {activeTab === 'lesson' ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                    </svg>
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" />
                    </svg>
                  )}
                </div>
                <span className="text-[16px] text-text-sub font-medium group-hover:text-text-main transition-colors text-left flex items-center gap-3">
                  {activeTab === 'lesson' ? '开启苏格拉底式陪伴学习...' : '启动沉浸式辅导协议，快速刷题...'}
                </span>
              </div>

              <div className={`flex items-center justify-center rounded-[10px] bg-black/5 dark:bg-white/10 p-2 text-text-placeholder transition-all transform group-hover:scale-105 group-hover:text-white ${activeTab === 'lesson' ? 'group-hover:bg-primary' : 'group-hover:bg-success'}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
              </div>
            </button>
          </div>
        </div>

        {/* Mini Pill Secondary Actions */}
        <div className="w-full max-w-[620px] flex flex-wrap items-center justify-start gap-2.5 sm:gap-3 mt-1 px-1">

          <button
            onClick={() => navigate('/spaced-review')}
            className="group relative flex flex-row items-center justify-center gap-2 rounded-full border border-black/[0.06] bg-transparent px-4 py-1.5 text-[12px] font-medium text-text-sub transition-colors hover:bg-black/[0.03] dark:border-white/[0.05] dark:text-text-placeholder dark:hover:bg-white/5"
          >
            <svg className="text-text-placeholder group-hover:text-text-main transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>
            间隔复习
            {reviewStats && reviewStats.dueToday > 0 && (
              <span className="absolute -top-1 -right-0.5 flex h-2.5 w-2.5 rounded-full bg-primary animate-pulse shadow-sm"></span>
            )}
          </button>

          <button
            onClick={() => navigate('/meta-prompt')}
            className="group flex flex-row items-center justify-center gap-2 rounded-full border border-black/[0.06] bg-transparent px-4 py-1.5 text-[12px] font-medium text-text-sub transition-colors hover:bg-black/[0.03] dark:border-white/[0.05] dark:text-text-placeholder dark:hover:bg-white/5"
          >
            <svg className="text-text-placeholder group-hover:text-text-main transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
            构建世界
          </button>
        </div>

      </main>

      {/* Discrete Ghost Footer */}
      <div className="absolute bottom-8 w-full px-12 flex justify-between items-center text-text-placeholder z-20 pointer-events-none">
        <div className="flex gap-8 pointer-events-auto opacity-70 hover:opacity-100 transition-opacity duration-300">
          <button onClick={() => navigate('/notes')} className="text-[12px] font-medium hover:text-text-main transition-colors">课程笔记</button>
          <button onClick={() => navigate('/pdf-import')} className="text-[12px] font-medium hover:text-text-main transition-colors">提取教材</button>
        </div>
        <div className="pointer-events-auto opacity-70 hover:opacity-100 transition-opacity duration-300">
          <button onClick={() => navigate('/progress')} className="text-[12px] font-medium hover:text-text-main flex items-center gap-1 transition-colors">
            学习档案 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17l9.2-9.2M17 17V7H7" /></svg>
          </button>
        </div>
      </div>

    </div>
  );
}
