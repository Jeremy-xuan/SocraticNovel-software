import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import './App.css';
import LandingPage from './pages/LandingPage';
import LessonPage from './pages/LessonPage';
import PracticePage from './pages/PracticePage';
import NotesPage from './pages/NotesPage';
import ProgressPage from './pages/ProgressPage';
import SettingsPage from './pages/SettingsPage';
import SetupWizardPage from './pages/SetupWizardPage';
import MetaPromptPage from './pages/MetaPromptPage';
import ReviewPage from './pages/ReviewPage';
import PdfImportPage from './pages/PdfImportPage';
import HistoryPage from './pages/HistoryPage';
import { useAppStore } from './stores/appStore';

function ThemeProvider() {
  const theme = useAppStore((s) => s.settings.theme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else if (theme === 'light') {
      root.classList.remove('dark');
    } else {
      // system: follow OS preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.toggle('dark', prefersDark);
      const mql = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e: MediaQueryListEvent) => root.classList.toggle('dark', e.matches);
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    }
  }, [theme]);

  return null;
}

function AppRoutes() {
  const location = useLocation();
  const [setupDone, setSetupDone] = useState(
    () => localStorage.getItem('socratic-novel-setup-done') === 'true'
  );

  // Re-check localStorage on every route change (wizard sets it before navigating)
  useEffect(() => {
    setSetupDone(localStorage.getItem('socratic-novel-setup-done') === 'true');
  }, [location.pathname]);

  return (
    <Routes>
      <Route path="/" element={setupDone ? <LandingPage /> : <Navigate to="/setup" replace />} />
      <Route path="/setup" element={<SetupWizardPage />} />
      <Route path="/lesson" element={<LessonPage />} />
      <Route path="/review" element={<PracticePage />} />
      <Route path="/notes" element={<NotesPage />} />
      <Route path="/progress" element={<ProgressPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/meta-prompt" element={<MetaPromptPage />} />
      <Route path="/spaced-review" element={<ReviewPage />} />
      <Route path="/pdf-import" element={<PdfImportPage />} />
      <Route path="/history" element={<HistoryPage />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider />
      {/* macOS overlay title bar: transparent drag region */}
      <div
        data-tauri-drag-region
        className="fixed inset-x-0 top-0 z-50 h-8"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;
