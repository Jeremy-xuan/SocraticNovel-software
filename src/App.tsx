import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import './App.css';
import LandingPage from './pages/LandingPage';
import LessonPage from './pages/LessonPage';
import PracticePage from './pages/PracticePage';
import NotesPage from './pages/NotesPage';
import SettingsPage from './pages/SettingsPage';
import SetupWizardPage from './pages/SetupWizardPage';

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
      <Route path="/settings" element={<SettingsPage />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;
