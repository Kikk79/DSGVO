import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ToastProvider } from '../../../components/ui/Toast';
import { EinstellungenPage } from '../EinstellungenPage';
import { useAppStore } from '../../../stores/appStore';

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: vi.fn().mockResolvedValue('/tmp/aenderungen.dat') }));

const categories = [
  { id: 1, name: 'Sozialverhalten', color: '#2F7D5B', background_color: '#DDF0E4', text_color: '#1F5A40', is_active: true, sort_order: 1 },
  { id: 2, name: 'Sonstiges', color: '#6B7280', background_color: '#ECEAE4', text_color: '#3F3A33', is_active: true, sort_order: 2 },
];

const backupFile = JSON.stringify({
  format: 'full_export',
  version: '1.1',
  timestamp: '2026-11-01T10:00:00Z',
  export_scope: { total_students: 3, total_classes: 1, total_observations: 5, total_categories: 2 },
  source_device: { device_name: 'Schulrechner' },
  data: { students: [], classes: [], observations: [], categories: [] },
});

function handlers(command: string): unknown {
  switch (command) {
    case 'get_categories':
      return categories;
    case 'search_observations':
      return [{ category: 'Sozialverhalten' }, { category: 'Sozialverhalten' }];
    case 'get_webdav_sync_status':
      return { configured: false, active: false, last_sync: null, url: null, username: null };
    case 'get_database_path':
      return 'C:\\Users\\lehrkraft\\AppData\\Roaming\\schuelerbeobachtung\\observations.db';
    case 'get_device_config':
      return { device_type: 'notebook', device_name: 'Notebook' };
    case 'import_full_backup_data':
      return 'Imported full backup data: Successfully imported 1 classes, 3 students, 5 observations, 2 categories';
    default:
      return null;
  }
}

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname}</p>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <Routes>
          <Route path="/einstellungen/:tab" element={<EinstellungenPage />} />
        </Routes>
        <LocationProbe />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation((command: string) => Promise.resolve(handlers(command)));
  useAppStore.setState({
    categories: [],
    databasePath: null,
    deviceConfig: null,
    webdavSync: { status: 'idle', lastSyncTime: null, error: null, config: null },
  });
});

describe('EinstellungenPage', () => {
  it('leitet einen unbekannten Reiter auf „Kategorien“ um', async () => {
    renderAt('/einstellungen/gibtsnicht');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/einstellungen/kategorien'));
    expect(screen.getByRole('tab', { name: 'Kategorien' })).toHaveAttribute('aria-selected', 'true');
  });

  it('wechselt den Reiter über die Adresse', async () => {
    renderAt('/einstellungen/kategorien');
    await userEvent.click(screen.getByRole('tab', { name: 'Datenschutz' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/einstellungen/datenschutz');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('nicht verschlüsselt');
  });

  it('löscht eine Kategorie erst nach Bestätigung und nennt die Verwendung', async () => {
    renderAt('/einstellungen/kategorien');
    expect(await screen.findByText('2 Beobachtungen')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '„Sozialverhalten“ löschen' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('kommt in 2 Beobachtungen vor');
    expect(invokeMock).not.toHaveBeenCalledWith('delete_category', expect.anything());

    await userEvent.click(within(dialog).getByRole('button', { name: 'Abbrechen' }));
    expect(invokeMock).not.toHaveBeenCalledWith('delete_category', expect.anything());

    await userEvent.click(screen.getByRole('button', { name: '„Sonstiges“ löschen' }));
    const second = screen.getByRole('alertdialog');
    expect(second).toHaveTextContent('endgültig gelöscht');
    await userEvent.click(within(second).getByRole('button', { name: 'Kategorie löschen' }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('delete_category', { id: 2, forceDelete: false }));
  });

  it('legt eine Kategorie an und verhindert doppelte Namen', async () => {
    renderAt('/einstellungen/kategorien');
    await screen.findByText('2 Beobachtungen');
    await userEvent.click(screen.getByRole('button', { name: 'Neue Kategorie' }));
    const dialog = screen.getByRole('dialog');
    const name = within(dialog).getByLabelText('Name');

    await userEvent.type(name, 'sonstiges');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Kategorie anlegen' }));
    expect(dialog).toHaveTextContent('Eine Kategorie mit diesem Namen gibt es bereits.');

    await userEvent.clear(name);
    await userEvent.type(name, 'Mitarbeit');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Blau' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Kategorie anlegen' }));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith('create_category', {
        name: 'Mitarbeit',
        color: '#2B6CB0',
        backgroundColor: '#DCEAF7',
        textColor: '#1E4E80',
      }),
    );
  });

  it('spielt eine Sicherung erst nach Warnung und Bestätigung ein', async () => {
    renderAt('/einstellungen/daten');
    const file = new File([backupFile], 'sicherung.json', { type: 'application/json' });
    fireEvent.change(screen.getByTestId('backup-file'), { target: { files: [file] } });

    expect(await screen.findByText('sicherung.json')).toBeInTheDocument();
    expect(screen.getByText(/1 Klasse, 3 Schüler, 5 Beobachtungen, 2 Kategorien/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Sicherung einspielen' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('nicht rückgängig');
    expect(invokeMock).not.toHaveBeenCalledWith('import_full_backup_data', expect.anything());

    await userEvent.click(within(dialog).getByRole('button', { name: 'Einspielen' }));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith('import_full_backup_data', { backupData: backupFile }),
    );
  });

  it('weist Dateien zurück, die keine Sicherung sind', async () => {
    renderAt('/einstellungen/daten');
    const file = new File(['{"checksum":"x","data":{}}'], 'aenderungen.dat');
    fireEvent.change(screen.getByTestId('backup-file'), { target: { files: [file] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('keine Sicherung');
  });

  it('zeigt Speicherort und ehrliche Hinweise im Datenschutz-Reiter', async () => {
    renderAt('/einstellungen/datenschutz');
    expect(await screen.findByText(/observations\.db$/)).toBeInTheDocument();
    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveTextContent('nicht verschlüsselt');
    expect(panel).not.toHaveTextContent(/AES|verschlüsselt gespeichert/);
    expect(panel).toHaveTextContent('Art. 15');
  });

  it('erklärt die Synchronisation und bietet die Einrichtung an, wenn nichts eingerichtet ist', async () => {
    renderAt('/einstellungen/synchronisation');
    expect(await screen.findByText('Nicht eingerichtet')).toBeInTheDocument();
    expect(screen.getByText('Löschungen werden nicht übertragen')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Jetzt synchronisieren' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Synchronisation einrichten' }));
    await userEvent.click(screen.getByRole('button', { name: 'Verbindung testen' }));
    expect(screen.getByText(/beginnend mit https:\/\//)).toBeInTheDocument();
    expect(invokeMock).not.toHaveBeenCalledWith('test_webdav_connection', expect.anything());
  });
});
