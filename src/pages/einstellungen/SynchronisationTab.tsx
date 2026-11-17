import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { Check, Download, RefreshCw, Upload, X } from 'lucide-react';
import { useAppStore, type DeviceRole, type ManualSyncResult } from '../../stores/appStore';
import { bumpDataVersion } from '../../stores/uiStore';
import { errorMessage } from '../../lib/errors';
import { formatDateTime, isoDate } from '../../lib/format';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Field } from '../../components/ui/Field';
import { Input } from '../../components/ui/Input';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { useToast } from '../../components/ui/toastContext';
import { FactList, InlineError, Notice, Section } from './parts';
import { readFileText } from './backup';

/** Zeitpunkt des letzten manuellen Abgleichs in dieser Sitzung (das Backend speichert ihn nicht immer). */
let lastManualSyncAt: string | null = null;

const ROLE_LABEL: Record<DeviceRole, string> = { laptop: 'Laptop', desktop: 'Desktop' };

const WAITING_TEXT = 'Warte auf den Stand vom Laptop';
const NO_LAPTOP_TEXT = 'Kein Laptop gefunden. Bitte auf dem Laptop einmal synchronisieren.';

/** „Rechneruhr weicht 3 Sekunden von der Serverzeit ab“ – leer, wenn die Abweichung unter einer Sekunde liegt. */
function clockOffsetText(offsetMs: number): string | null {
  const seconds = Math.round(Math.abs(offsetMs) / 1000);
  if (seconds < 1) return null;
  if (seconds < 120) return `Rechneruhr weicht ${seconds} ${seconds === 1 ? 'Sekunde' : 'Sekunden'} von der Serverzeit ab`;
  const minutes = Math.round(seconds / 60);
  return `Rechneruhr weicht ${minutes} Minuten von der Serverzeit ab`;
}

/** Meldung nach einem manuellen Abgleich. */
function outcomeMessage(result: ManualSyncResult): { tone: 'success' | 'info' | 'error'; text: string } {
  switch (result.outcome) {
    case 'synced': {
      const report = result.report;
      if (!report) return { tone: 'success', text: 'Abgleich abgeschlossen.' };
      const parts = [
        report.inserted > 0 ? `${report.inserted} neu` : null,
        report.updated > 0 ? `${report.updated} geändert` : null,
        report.tombstoned > 0 ? `${report.tombstoned} gelöscht` : null,
      ].filter(Boolean);
      return {
        tone: 'success',
        text: parts.length ? `Abgleich abgeschlossen: ${parts.join(', ')}.` : 'Abgleich abgeschlossen. Es gab nichts Neues.',
      };
    }
    case 'waiting_for_laptop':
      return { tone: 'info', text: `${WAITING_TEXT}.` };
    case 'no_laptop_found':
      return { tone: 'info', text: NO_LAPTOP_TEXT };
    default:
      return { tone: 'error', text: 'Die Synchronisation ist nicht eingerichtet.' };
  }
}

type TestState = { kind: 'idle' } | { kind: 'testing' } | { kind: 'ok' } | { kind: 'failed'; message: string };

/** Ergebnistext des Backends („… Successfully imported 3 observations“) auf Deutsch. */
function importedCount(result: string): number | null {
  const match = /imported (\d+) observations?/i.exec(result);
  return match ? Number(match[1]) : null;
}

/** Reiter „Synchronisation“: WebDAV einrichten, testen, anhalten, manuell abgleichen; Austausch per Datei. */
export function SynchronisationTab() {
  const sync = useAppStore((state) => state.webdavSync);
  const getWebDavSyncStatus = useAppStore((state) => state.getWebDavSyncStatus);
  const configureWebDav = useAppStore((state) => state.configureWebDav);
  const triggerManualSync = useAppStore((state) => state.triggerManualSync);
  const deviceRole = useAppStore((state) => state.deviceRole);
  const toast = useToast();

  const [statusLoaded, setStatusLoaded] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ url?: string; username?: string; password?: string }>({});
  const [test, setTest] = useState<TestState>({ kind: 'idle' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [confirmPause, setConfirmPause] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [pauseError, setPauseError] = useState<string | null>(null);
  const [lastManual, setLastManual] = useState<string | null>(lastManualSyncAt);

  useEffect(() => {
    void getWebDavSyncStatus().finally(() => setStatusLoaded(true));
  }, [getWebDavSyncStatus]);

  const config = sync.config;
  const configured = Boolean(config?.configured);
  const active = Boolean(config?.active);
  const lastSync = [sync.lastSyncTime, lastManual]
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

  const openForm = () => {
    setUrl(config?.url ?? '');
    setUsername(config?.username ?? '');
    setPassword('');
    setFieldErrors({});
    setTest({ kind: 'idle' });
    setSaveError(null);
    setFormOpen(true);
  };

  const validate = () => {
    const errors: typeof fieldErrors = {};
    if (!/^https?:\/\/\S+$/i.test(url.trim())) errors.url = 'Bitte eine vollständige Adresse eingeben, beginnend mit https://';
    if (!username.trim()) errors.username = 'Bitte den Benutzernamen eingeben.';
    if (!password) errors.password = 'Bitte das Passwort eingeben.';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleTest = async () => {
    if (!validate()) return;
    setTest({ kind: 'testing' });
    try {
      const ok = await invoke<boolean>('test_webdav_connection', { url: url.trim(), username: username.trim(), password });
      setTest(
        ok
          ? { kind: 'ok' }
          : {
              kind: 'failed',
              message:
                'Keine Verbindung. Bitte prüfen Sie Adresse, Benutzername und Passwort. Der Ordner muss auf dem Server schon existieren.',
            },
      );
    } catch (error) {
      setTest({ kind: 'failed', message: errorMessage(error, 'Der Verbindungstest ist fehlgeschlagen.') });
    }
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setSaveError(null);
    try {
      await configureWebDav(url.trim(), username.trim(), password);
      setPassword('');
      setFormOpen(false);
      bumpDataVersion();
      toast.success('Synchronisation eingerichtet.');
    } catch (error) {
      console.error('WebDAV konnte nicht eingerichtet werden:', error);
      setSaveError(errorMessage(error, 'Die Synchronisation konnte nicht eingerichtet werden.'));
    } finally {
      setSaving(false);
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const result = await triggerManualSync();
      const message = outcomeMessage(result);
      if (message.tone === 'error') {
        setSyncError(message.text);
      } else {
        if (result.outcome === 'synced') {
          lastManualSyncAt = new Date().toISOString();
          setLastManual(lastManualSyncAt);
          bumpDataVersion();
        }
        toast[message.tone](message.text);
      }
    } catch (error) {
      console.error('Manueller Abgleich fehlgeschlagen:', error);
      setSyncError(errorMessage(error, 'Der Abgleich ist fehlgeschlagen.'));
    } finally {
      setSyncing(false);
    }
  };

  const handlePause = async () => {
    setPausing(true);
    setPauseError(null);
    try {
      await invoke('disable_webdav_sync');
      await getWebDavSyncStatus();
      setConfirmPause(false);
      toast.info('Synchronisation bis zum nächsten Start angehalten.');
    } catch (error) {
      setPauseError(errorMessage(error, 'Die Synchronisation konnte nicht angehalten werden.'));
    } finally {
      setPausing(false);
    }
  };

  const offsetText = clockOffsetText(sync.clockOffsetMs ?? 0);
  const waiting =
    configured &&
    (sync.lastOutcome === 'waiting_for_laptop' || (deviceRole === 'desktop' && sync.firstSyncDone === false));
  const noLaptop = configured && sync.lastOutcome === 'no_laptop_found';

  let statusText = 'Nicht eingerichtet';
  if (configured && active) statusText = 'Eingerichtet und aktiv';
  else if (configured) statusText = 'Angehalten bis zum nächsten Start der App';

  return (
    <div className="space-y-12">
      <Section
        id="sync-titel"
        title="Abgleich zwischen Geräten"
        description={
          <>
            <p>
              Wenn Sie auf zwei Geräten arbeiten, zum Beispiel am Laptop und am Arbeitsplatzrechner, gleicht die App Ihre
              Daten über einen gemeinsamen Ordner auf einem WebDAV-Server ab (etwa die Nextcloud Ihrer Schule). Jedes
              Gerät legt dort seinen Stand ab und übernimmt den des anderen.
            </p>
            <p>
              Das geschieht beim Start, alle drei Minuten und beim Schließen der App. Mit „Jetzt synchronisieren“
              stoßen Sie es sofort an.
            </p>
          </>
        }
      >
        {statusLoaded && (
          <FactList
            items={[
              { label: 'Status', value: <span className="font-semibold">{statusText}</span> },
              ...(config
                ? [
                    { label: 'Server', value: <span className="break-all">{config.url}</span> },
                    { label: 'Benutzer', value: config.username },
                  ]
                : []),
              ...(configured
                ? [{ label: 'Letzter Abgleich', value: lastSync ? formatDateTime(lastSync) : 'In dieser Sitzung noch keiner' }]
                : []),
              ...(configured && offsetText ? [{ label: 'Uhrzeit', value: offsetText }] : []),
            ]}
          />
        )}

        {waiting && (
          <Notice title={WAITING_TEXT}>
            <p>
              Dieses Gerät ist als Desktop eingestellt und übernimmt beim ersten Abgleich den Stand vom Laptop. Bitte
              synchronisieren Sie einmal auf dem Laptop; danach klappt es hier.
            </p>
          </Notice>
        )}
        {noLaptop && (
          <Notice tone="warning" title="Kein Laptop gefunden">
            <p>Kein Laptop gefunden. Bitte auf dem Laptop einmal synchronisieren.</p>
          </Notice>
        )}

        {syncError && <InlineError>{syncError}</InlineError>}

        {!formOpen && (
          <div className="flex flex-wrap items-center gap-3">
            {active && (
              <Button icon={<RefreshCw className={syncing ? 'animate-spin' : undefined} />} onClick={() => void handleSyncNow()} disabled={syncing}>
                {syncing ? 'Synchronisiert …' : 'Jetzt synchronisieren'}
              </Button>
            )}
            <Button variant={configured ? 'secondary' : 'primary'} onClick={openForm}>
              {!configured ? 'Synchronisation einrichten' : active ? 'Zugangsdaten ändern' : 'Wieder verbinden'}
            </Button>
            {active && (
              <Button variant="ghost" onClick={() => setConfirmPause(true)}>
                Anhalten
              </Button>
            )}
          </div>
        )}

        {formOpen && (
          <form onSubmit={handleSave} noValidate className="max-w-measure space-y-5 border-l-[3px] border-line pl-5">
            <Field
              label="Adresse des Ordners (WebDAV)"
              hint="Bei Nextcloud: Dateien → Einstellungen (unten links) → WebDAV-Adresse, ergänzt um einen eigenen Ordner."
              error={fieldErrors.url}
            >
              <Input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://cloud.schule.de/remote.php/dav/files/name/Beobachtungen/"
                type="url"
                autoComplete="url"
                spellCheck={false}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Benutzername" error={fieldErrors.username}>
                <Input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" spellCheck={false} />
              </Field>
              <Field label="Passwort" hint={configured ? 'Bitte erneut eingeben.' : undefined} error={fieldErrors.password}>
                <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
              </Field>
            </div>

            <div aria-live="polite">
              {test.kind === 'ok' && (
                <p className="flex items-center gap-2 text-ui font-semibold text-tafel-700">
                  <Check aria-hidden="true" className="h-4 w-4" /> Verbindung erfolgreich.
                </p>
              )}
              {test.kind === 'failed' && (
                <p className="flex items-start gap-2 text-ui font-medium text-rotstift-dark">
                  <X aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /> {test.message}
                </p>
              )}
            </div>

            {saveError && <InlineError>{saveError}</InlineError>}

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" loading={saving}>
                Speichern und abgleichen
              </Button>
              <Button variant="secondary" onClick={() => void handleTest()} loading={test.kind === 'testing'} disabled={saving}>
                Verbindung testen
              </Button>
              <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={saving}>
                Abbrechen
              </Button>
            </div>
          </form>
        )}
      </Section>

      <RoleSection />

      <Section id="sync-umfang" title="Was abgeglichen wird">
        <ul className="max-w-measure list-disc space-y-2 pl-5 text-ui text-ink marker:text-ink-muted">
          <li>
            Alles: Klassen, Schüler, Kategorien und Beobachtungen, einschließlich Löschungen. Wenn Sie auf einem Gerät
            etwas löschen, verschwindet es beim nächsten Abgleich auch auf dem anderen.
          </li>
          <li>
            Wird an beiden Geräten dasselbe geändert, gilt die jüngere Änderung. Die App vergleicht dazu die Uhrzeiten
            der Geräte; stimmen sie nicht, zeigt sie oben die Abweichung an.
          </li>
          <li>
            Beim ersten Abgleich übernimmt ein Desktop den Stand vom Laptop. Was auf dem Desktop schon liegt, wird dabei
            ersetzt; vorher legt die App eine Sicherungskopie der Datenbank an. Danach werden beide Geräte normal
            zusammengeführt.
          </li>
        </ul>
        <Notice>
          <p>
            Die Dateien liegen unverschlüsselt auf dem Server. Sie enthalten Klassen, Namen der Schüler, Kategorien und
            den Text der Beobachtungen. Nutzen Sie nur einen Server, den Ihre Schule für solche Daten freigegeben hat.
            Zusätzlich können Sie eine Sicherung im{' '}
            <Link to="/einstellungen/daten" className="link">
              Reiter „Daten“
            </Link>{' '}
            erstellen.
          </p>
        </Notice>
      </Section>

      <FileExchange />

      <ConfirmDialog
        open={confirmPause}
        title="Synchronisation anhalten?"
        confirmLabel="Anhalten"
        busy={pausing}
        error={pauseError}
        onConfirm={() => void handlePause()}
        onCancel={() => setConfirmPause(false)}
      >
        <p>Bis zum nächsten Start der App wird nichts mehr abgeglichen.</p>
        <p>
          Die Zugangsdaten bleiben gespeichert. Beim nächsten Start verbindet sich die App wieder von selbst.
        </p>
      </ConfirmDialog>
    </div>
  );
}

/** Austausch ohne Server: Änderungsdatei speichern und auf dem anderen Gerät einlesen. */
function FileExchange() {
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setError(null);
    setExporting(true);
    try {
      const filePath = await save({
        title: 'Änderungsdatei speichern',
        defaultPath: `beobachtungen-aenderungen-${isoDate()}.dat`,
        filters: [{ name: 'Änderungsdatei', extensions: ['dat'] }],
      });
      if (!filePath) return;
      await invoke<string>('export_changeset_to_file', { filePath });
      toast.success(`Änderungsdatei gespeichert: ${filePath}`);
    } catch (exportError) {
      console.error('Änderungsdatei konnte nicht gespeichert werden:', exportError);
      setError(errorMessage(exportError, 'Die Änderungsdatei konnte nicht gespeichert werden.'));
    } finally {
      setExporting(false);
    }
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    setImporting(true);
    try {
      const content = await readFileText(file);
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        parsed = null;
      }
      const looksValid =
        typeof parsed === 'object' && parsed !== null && 'checksum' in parsed && 'data' in parsed;
      if (!looksValid) {
        setError('Diese Datei ist keine Änderungsdatei der Schülerbeobachtung. Eine Sicherung (.json) spielen Sie im Reiter „Daten“ ein.');
        return;
      }
      const result = await invoke<string>('import_changeset_data', { changesetData: content });
      const count = importedCount(result);
      bumpDataVersion();
      toast.success(
        count === null
          ? 'Änderungsdatei eingelesen.'
          : count === 0
            ? 'Änderungsdatei eingelesen. Es gab nichts Neues.'
            : `Änderungsdatei eingelesen: ${count} ${count === 1 ? 'Beobachtung' : 'Beobachtungen'} neu oder aktualisiert.`,
      );
    } catch (importError) {
      console.error('Änderungsdatei konnte nicht eingelesen werden:', importError);
      setError(
        /checksum/i.test(String(importError))
          ? 'Die Datei ist beschädigt oder wurde verändert und wurde nicht eingelesen.'
          : /foreign key/i.test(String(importError))
            ? 'Die Datei passt nicht zu den Daten auf diesem Gerät.'
            : errorMessage(importError, 'Die Änderungsdatei konnte nicht eingelesen werden.'),
      );
    } finally {
      setImporting(false);
    }
  };

  return (
    <Section
      id="sync-datei"
      title="Austausch per Datei"
      description={
        <p>
          Ohne Server geht es auch von Hand: Speichern Sie eine Änderungsdatei, bringen Sie sie zum anderen Gerät (etwa
          per USB-Stick) und lesen Sie sie dort ein. Die Datei enthält immer den ganzen Stand, und es gelten dieselben Regeln wie oben.
        </p>
      }
    >
      <div className="flex max-w-measure flex-wrap items-end gap-3">
        <Button variant="secondary" icon={<Download />} onClick={() => void handleExport()} loading={exporting}>
          Änderungsdatei speichern
        </Button>
        <Button variant="secondary" icon={<Upload />} onClick={() => fileInput.current?.click()} loading={importing}>
          Änderungsdatei einlesen
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".dat,application/octet-stream,application/json"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => void handleFile(event)}
          data-testid="changeset-file"
        />
      </div>
      {error && <InlineError>{error}</InlineError>}
    </Section>
  );
}

/** Geräterolle anzeigen und ändern. */
function RoleSection() {
  const role = useAppStore((state) => state.deviceRole);
  const setDeviceRole = useAppStore((state) => state.setDeviceRole);
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [choice, setChoice] = useState<DeviceRole>('laptop');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEditing = () => {
    setChoice(role ?? 'laptop');
    setError(null);
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await setDeviceRole(choice);
      setEditing(false);
      toast.success(`Dieses Gerät ist jetzt als ${ROLE_LABEL[choice]} eingestellt.`);
    } catch (saveError) {
      console.error('Geräterolle konnte nicht gespeichert werden:', saveError);
      setError(errorMessage(saveError, 'Die Geräterolle konnte nicht gespeichert werden.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section
      id="sync-rolle"
      title="Geräterolle"
      description={
        <p>
          Der Laptop ist maßgeblich: Dort sammeln Sie Beobachtungen. Ein Desktop übernimmt beim allerersten Abgleich den
          Stand vom Laptop. Danach hat die Rolle keine Wirkung mehr auf den Abgleich.
        </p>
      }
    >
      <FactList
        items={[
          { label: 'Dieses Gerät', value: <span className="font-semibold">{role ? ROLE_LABEL[role] : 'Nicht gewählt'}</span> },
        ]}
      />
      {editing ? (
        <div className="max-w-measure space-y-4 border-l-[3px] border-line pl-5">
          <SegmentedControl<DeviceRole>
            ariaLabel="Geräterolle"
            value={choice}
            onChange={setChoice}
            options={[
              { value: 'laptop', label: 'Laptop' },
              { value: 'desktop', label: 'Desktop' },
            ]}
          />
          {choice === 'desktop' && role !== 'desktop' && (
            <Notice tone="warning">
              <p>
                Ein Desktop übernimmt beim ersten Abgleich den Stand vom Laptop und ersetzt dabei die Daten auf diesem
                Gerät.
              </p>
            </Notice>
          )}
          {error && <InlineError>{error}</InlineError>}
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void handleSave()} loading={saving} disabled={choice === role}>
              Rolle speichern
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
              Abbrechen
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button variant="secondary" onClick={startEditing}>
            Rolle ändern
          </Button>
        </div>
      )}
    </Section>
  );
}
