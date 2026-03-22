import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';
import LandingPage from './pages/LandingPage';
import LessonPage from './pages/LessonPage';
import SettingsPage from './pages/SettingsPage';
import SetupWizardPage from './pages/SetupWizardPage';

function App() {
  const setupDone = localStorage.getItem('socratic-novel-setup-done') === 'true';

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={setupDone ? <LandingPage /> : <Navigate to="/setup" replace />} />
        <Route path="/setup" element={<SetupWizardPage />} />
        <Route path="/lesson" element={<LessonPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
