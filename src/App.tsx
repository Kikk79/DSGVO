import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { ObservationForm } from './components/ObservationForm';
import { StudentSearch } from './components/StudentSearch';
import { AddStudent } from './components/AddStudent';
import { UnifiedSyncManager } from './components/UnifiedSyncManager';
import { SettingsPage } from './components/SettingsPage';
import { CategoryManager } from './components/CategoryManager';
import { useAppStore } from './stores/appStore';

function App() {
  const { initializeApp } = useAppStore();

  useEffect(() => {
    initializeApp();
  }, [initializeApp]);

  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/neue-beobachtung" element={<ObservationForm />} />
            <Route path="/schueler-suchen" element={<StudentSearch />} />
            <Route path="/schueler-hinzufuegen" element={<AddStudent />} />
            <Route path="/sync" element={<UnifiedSyncManager />} />
            <Route path="/kategorien" element={<CategoryManager />} />
            <Route path="/einstellungen" element={<SettingsPage />} />
          </Routes>
        </Layout>
      </div>
    </Router>
  );
}

export default App;