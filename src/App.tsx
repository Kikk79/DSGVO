import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { ObservationForm } from './components/ObservationForm';
import { StudentSearch } from './components/StudentSearch';
import { AddStudent } from './components/AddStudent';
import { SyncManager } from './components/SyncManager';
import { SettingsPage } from './components/SettingsPage';
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
            <Route path="/sync" element={<SyncManager />} />
            <Route path="/einstellungen" element={<SettingsPage />} />
          </Routes>
        </Layout>
      </div>
    </Router>
  );
}

export default App;