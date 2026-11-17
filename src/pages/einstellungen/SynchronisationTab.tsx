import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { Check, Download, RefreshCw, Upload, X } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { bumpDataVersion } from '../../stores/uiStore';
import { errorMessage } from '../../lib/errors';
import { formatDateTime, isoDate } from '../../lib/format';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Field } from '../../components/ui/Field';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { useToast } from '../../components/ui/toastContext';
import { FactList, InlineError, Notice, Section } from './parts';
import { readFileText } from './backup';

/** Zeitpunkt des letzten manuellen Abgleichs in dieser Sitzung (das Backend speichert ihn nicht immer). */
let lastManualSyncAt: string | null = null;

const RANGE_OPTIONS = [
  { value: '7', label: 'Letzte 7 Tage' },
  { value: '30', label: 'Letzte 30 Tage' },
  { value: '90', label: 'Letzte 90 Tage' },
  { value: '365', label: 'Letztes Jahr' },
  { value: '99999', label: 'Alle Beobachtungen' },
];

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
      lastManualSyncAt = new Date().toISOString();
      setLastManual(lastManualSyncAt);
      setPassword('');
      setFormOpen(false);
      bumpDataVersion();
      toast.success('Synchronisation eingerichtet. Der erste Abgleich ist abgeschlossen.');
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
      await triggerManualSync();
      lastManualSyncAt = new Date().toISOString();
      setLastManual(lastManualSyncAt);
      bumpDataVersion();
      toast.success('Abgleich abgeschlossen.');
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
              Wenn Sie auf zwei Geräten arbeiten, zum Beispiel am Schulrechner und am Notebook, gleicht die App Ihre
              Beobachtungen über einen gemeinsamen Ordner auf einem WebDAV-Server ab (etwa die Nextcloud Ihrer Schule).
              Jedes Gerät legt dort seine Änderungen ab und übernimmt die des anderen.
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
            ]}
          />
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

      <Section id="sync-umfang" title="Was abgeglichen wird">
        <ul className="max-w-measure list-disc space-y-2 pl-5 text-ui text-ink marker:text-ink-muted">
          <li>Beobachtungen der letzten 30 Tage, auch spätere Änderungen daran.</li>
          <li>
            Nicht abgeglichen werden Schüler, Klassen und Kategorien. Sie müssen auf beiden Geräten gleich vorhanden sein.
            Am einfachsten: auf dem ersten Gerät eine Sicherung erstellen und auf dem neuen Gerät einspielen (
            <Link to="/einstellungen/daten" className="link">
              Reiter „Daten“
            </Link>
            ).
          </li>
        </ul>
        <Notice tone="warning" title="Löschungen werden nicht übertragen">
          <p>
            Wenn Sie eine Beobachtung auf einem Gerät löschen, bleibt sie auf dem anderen erhalten und kann beim nächsten
            Abgleich zurückkommen. Löschen Sie sie deshalb auf beiden Geräten.
          </p>
        </Notice>
        <Notice>
          <p>
            Die Dateien liegen unverschlüsselt auf dem Server. Sie enthalten Text, Kategorie und Schlagwörter der
            Beobachtungen; Schüler sind darin nur über eine interne Nummer zugeordnet, nicht mit Namen. Nutzen Sie nur
            einen Server, den Ihre Schule für solche Daten freigegeben hat.
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
  const [range, setRange] = useState('30');
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
      await invoke<string>('export_changeset_to_file', { filePath, daysBack: Number(range) });
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
            ? 'Die Datei enthält Beobachtungen zu Schülern, die es auf diesem Gerät nicht gibt. Übertragen Sie zuerst die Schüler per Sicherung.'
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
          per USB-Stick) und lesen Sie sie dort ein. Es gelten dieselben Regeln wie oben.
        </p>
      }
    >
      <div className="flex max-w-measure flex-wrap items-end gap-3">
        <Field label="Zeitraum" className="w-56">
          <Select value={range} onChange={(event) => setRange(event.target.value)}>
            {RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
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
