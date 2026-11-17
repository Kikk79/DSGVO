import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { DeviceRoleGate } from './components/layout/DeviceRoleGate';
import { ObservationEditorProvider } from './components/observations/ObservationEditorProvider';
import { ToastProvider } from './components/ui/Toast';
import { HeutePage } from './pages/heute/HeutePage';
import { SchuelerPage } from './pages/schueler/SchuelerPage';
import { SchuelerAktePage } from './pages/schueler/SchuelerAktePage';
import { BeobachtungenPage } from './pages/beobachtungen/BeobachtungenPage';
import { EinstellungenPage } from './pages/einstellungen/EinstellungenPage';
import { useAppStore } from './stores/appStore';

function App() {
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    const { initializeApp, loadCategories, getWebDavSyncStatus } = useAppStore.getState();
    setLoadError(false);
    let failed = false;
    await Promise.all([
      // initializeApp fängt Fehler selbst ab und legt sie im Store ab.
      initializeApp().then(() => {
        if (useAppStore.getState().error) failed = true;
      }),
      loadCategories().catch(() => {
        failed = true;
      }),
      getWebDavSyncStatus(),
    ]);
    setLoadError(failed);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <BrowserRouter>
      <ToastProvider>
        <DeviceRoleGate>
          <ObservationEditorProvider>
            <Routes>
              <Route element={<AppShell loadError={loadError} onRetry={() => void load()} />}>
                <Route path="/" element={<HeutePage />} />
                <Route path="/schueler" element={<SchuelerPage />} />
                <Route path="/schueler/:id" element={<SchuelerAktePage />} />
                <Route path="/beobachtungen" element={<BeobachtungenPage />} />
                <Route path="/einstellungen" element={<Navigate to="/einstellungen/kategorien" replace />} />
                <Route path="/einstellungen/:tab" element={<EinstellungenPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </ObservationEditorProvider>
        </DeviceRoleGate>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
