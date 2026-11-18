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

const meta = { created_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-01T10:00:00Z', modified_by_device: 'a', source_device_id: 'a' };
const snapshotBackupFile = JSON.stringify({
  checksum: 'abc',
  data: {
    format: 'snapshot_v2',
    schema_version: 2,
    device_id: 'laptop-1',
    device_role: 'laptop',
    device_name: 'Laptop',
    generated_at: '2026-11-17T08:00:00Z',
    rows: {
      categories: [{ uuid: 'k1', name: 'Sozialverhalten', deleted_at: null, ...meta }],
      classes: [{ uuid: 'c1', name: '5a', deleted_at: null, ...meta }],
      students: [
        { uuid: 's1', class_uuid: 'c1', deleted_at: null, ...meta },
        { uuid: 's2', class_uuid: 'c1', deleted_at: null, ...meta },
        { uuid: 's3', class_uuid: 'c1', deleted_at: '2026-11-02T10:00:00Z', ...meta },
      ],
      observations: [
        { uuid: 'o1', student_uuid: 's1', deleted_at: null, ...meta },
        { uuid: 'o2', student_uuid: 's1', deleted_at: null, ...meta },
        { uuid: 'o3', student_uuid: 's2', deleted_at: null, ...meta },
      ],
    },
  },
});

const notConfigured = {
  configured: false,
  active: false,
  last_sync: null,
  url: null,
  username: null,
  clock_offset_ms: 0,
  device_role: null,
  first_sync_done: false,
  last_outcome: null,
};
let syncStatus: Record<string, unknown> = notConfigured;
let safetyBackups: Array<{ path: string; size: number; created: string | null }> = [];
let importResult = 'Daten eingelesen: 0 neu, 0 aktualisiert, 0 gelöscht';

function handlers(command: string): unknown {
  switch (command) {
    case 'get_categories':
      return categories;
    case 'search_observations':
      return [{ category: 'Sozialverhalten' }, { category: 'Sozialverhalten' }];
    case 'get_webdav_sync_status':
      return syncStatus;
    case 'get_device_role':
      return 'desktop';
    case 'set_device_role':
      return null;
    case 'get_database_path':
      return 'C:\\Users\\lehrkraft\\AppData\\Roaming\\schuelerbeobachtung\\observations.db';
    case 'get_device_config':
      return { device_type: 'notebook', device_name: 'Notebook' };
    case 'list_safety_backups':
      return safetyBackups;
    case 'delete_safety_backups': {
      const count = safetyBackups.length;
      safetyBackups = [];
      return count;
    }
    case 'import_changeset_data':
      return importResult;
    case 'import_full_backup_data':
      return 'Sicherung eingespielt: 11 neu, 0 aktualisiert, 0 gelöscht';
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
  syncStatus = notConfigured;
  safetyBackups = [];
  importResult = 'Daten eingelesen: 0 neu, 0 aktualisiert, 0 gelöscht';
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

  it('erkennt eine Sicherung im aktuellen Format (snapshot_v2) und spielt sie ein', async () => {
    renderAt('/einstellungen/daten');
    const file = new File([snapshotBackupFile], 'sicherung-neu.json', { type: 'application/json' });
    fireEvent.change(screen.getByTestId('backup-file'), { target: { files: [file] } });

    expect(await screen.findByText('sicherung-neu.json')).toBeInTheDocument();
    // gelöschte Einträge zählen nicht mit
    expect(screen.getByText(/1 Klasse, 2 Schüler, 3 Beobachtungen, 1 Kategorie/)).toBeInTheDocument();
    expect(screen.getByText('Laptop')).toBeInTheDocument();
    expect(screen.queryByText(/keine Sicherung/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Sicherung einspielen' }));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Einspielen' }));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith('import_full_backup_data', { backupData: snapshotBackupFile }),
    );
    expect(await screen.findByText('Sicherung eingespielt: 11 neu, 0 aktualisiert, 0 gelöscht')).toBeInTheDocument();
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
    expect(screen.queryByText('Löschungen werden nicht übertragen')).not.toBeInTheDocument();
    expect(screen.getByRole('tabpanel')).toHaveTextContent(/einschließlich Löschungen/);
    expect(screen.queryByRole('button', { name: 'Jetzt synchronisieren' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Synchronisation einrichten' }));
    await userEvent.click(screen.getByRole('button', { name: 'Verbindung testen' }));
    expect(screen.getByText(/beginnend mit https:\/\//)).toBeInTheDocument();
    expect(invokeMock).not.toHaveBeenCalledWith('test_webdav_connection', expect.anything());
  });

  const configuredStatus = {
    configured: true,
    active: true,
    last_sync: null,
    url: 'https://cloud.example/dav/',
    username: 'lehrkraft',
    clock_offset_ms: 3000,
    device_role: 'desktop',
    first_sync_done: false,
    last_outcome: 'waiting_for_laptop',
  };

  it('zeigt Geräterolle, Uhrabweichung und den Wartestatus des Desktops', async () => {
    syncStatus = configuredStatus;
    renderAt('/einstellungen/synchronisation');
    const panel = await screen.findByRole('tabpanel');
    expect(await within(panel).findByText('Warte auf den Stand vom Laptop')).toBeInTheDocument();
    expect(panel).toHaveTextContent(
      'Bis der Stand vom Laptop übernommen ist, gehen Einträge auf diesem Gerät beim ersten Abgleich verloren. Erfassen Sie bitte noch nichts.',
    );
    expect(panel).toHaveTextContent('Desktop');
    expect(panel).toHaveTextContent('Rechneruhr weicht 3 Sekunden von der Serverzeit ab');
  });

  it('weist darauf hin, wenn kein Laptop gefunden wurde', async () => {
    syncStatus = { ...configuredStatus, last_outcome: 'no_laptop_found' };
    renderAt('/einstellungen/synchronisation');
    expect(
      await screen.findByText('Kein Laptop gefunden. Bitte auf dem Laptop einmal synchronisieren.'),
    ).toBeInTheDocument();
  });

  it('warnt beim Wechsel zu Desktop vor dem Ersetzen, solange der erste Abgleich aussteht', async () => {
    syncStatus = { ...configuredStatus, device_role: 'laptop', first_sync_done: false, last_outcome: 'synced' };
    useAppStore.setState({ deviceRole: 'laptop' });
    renderAt('/einstellungen/synchronisation');
    await screen.findByText('Eingerichtet und aktiv');
    await userEvent.click(screen.getByRole('button', { name: 'Rolle ändern' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Desktop' }));
    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveTextContent('Daten auf diesem Gerät werden ersetzt');
    expect(panel).toHaveTextContent('wählen Sie nicht „Desktop“, sondern „Laptop“');
  });

  it('kündigt beim Wechsel zu Desktop kein Ersetzen an, wenn der erste Abgleich schon lief', async () => {
    syncStatus = { ...configuredStatus, device_role: 'laptop', first_sync_done: true, last_outcome: 'synced' };
    useAppStore.setState({ deviceRole: 'laptop' });
    renderAt('/einstellungen/synchronisation');
    await screen.findByText('Eingerichtet und aktiv');
    await userEvent.click(screen.getByRole('button', { name: 'Rolle ändern' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Desktop' }));
    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveTextContent('Mit der Rolle Desktop wird hier nichts ersetzt');
    expect(panel).not.toHaveTextContent('Daten auf diesem Gerät werden ersetzt');
  });

  it('meldet nach dem Einlesen einer Änderungsdatei die deutschen Zählungen des Backends', async () => {
    importResult = 'Daten eingelesen: 3 neu, 1 aktualisiert, 0 gelöscht (2 Beobachtungen übersprungen: Schüler nicht vorhanden)';
    renderAt('/einstellungen/synchronisation');
    const file = new File(['{"checksum":"x","data":{}}'], 'aenderungen.dat');
    fireEvent.change(await screen.findByTestId('changeset-file'), { target: { files: [file] } });
    expect(
      await screen.findByText(
        'Änderungsdatei eingelesen: 3 neu, 1 aktualisiert. 2 Beobachtungen wurden übersprungen, weil der Schüler fehlt.',
      ),
    ).toBeInTheDocument();
  });

  it('nennt die automatischen Sicherungskopien und löscht sie erst nach Bestätigung', async () => {
    safetyBackups = [
      { path: '/daten/observations.db.vor-sync-v2-20261117-101500.bak', size: 204800, created: '2026-11-17T10:15:00Z' },
      { path: '/daten/observations.db.vor-erstabgleich-20261118-090000.bak', size: 3145728, created: null },
    ];
    renderAt('/einstellungen/datenschutz');
    expect(await screen.findByText('/daten/observations.db.vor-sync-v2-20261117-101500.bak')).toBeInTheDocument();
    expect(screen.getByText('/daten/observations.db.vor-erstabgleich-20261118-090000.bak')).toBeInTheDocument();
    expect(screen.getByRole('tabpanel')).toHaveTextContent('löscht sie nicht von selbst');

    await userEvent.click(screen.getByRole('button', { name: 'Sicherungskopien löschen' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('2 automatisch angelegten Sicherungskopien werden endgültig gelöscht');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Abbrechen' }));
    expect(invokeMock).not.toHaveBeenCalledWith('delete_safety_backups');

    await userEvent.click(screen.getByRole('button', { name: 'Sicherungskopien löschen' }));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Endgültig löschen' }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('delete_safety_backups'));
    expect(await screen.findByText('Zurzeit liegen keine Sicherungskopien vor.')).toBeInTheDocument();
  });

  it('ändert die Geräterolle über den Reiter', async () => {
    syncStatus = { ...configuredStatus, device_role: 'laptop', first_sync_done: true, last_outcome: 'synced' };
    renderAt('/einstellungen/synchronisation');
    await userEvent.click(await screen.findByRole('button', { name: 'Rolle ändern' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Desktop' }));
    await userEvent.click(screen.getByRole('button', { name: 'Rolle speichern' }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('set_device_role', { role: 'desktop' }));
  });

  it('erstellt die Sicherung ohne Zeitraumauswahl', async () => {
    renderAt('/einstellungen/daten');
    expect(screen.queryByLabelText('Umfang')).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Sicherung erstellen' }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('export_all_data'));
  });
});
