import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { Download, FolderOpen, Upload } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { bumpDataVersion } from '../../stores/uiStore';
import { errorMessage } from '../../lib/errors';
import { formatDateTime, isoDate } from '../../lib/format';
import { downloadText, MIME_JSON } from '../../lib/download';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { Input } from '../../components/ui/Input';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Spinner } from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/toastContext';
import { FactList, InlineError, Notice, PathText, Section } from './parts';
import { plural, readBackup, readFileText, type BackupSummary } from './backup';

/** Reiter „Daten“: Sicherung erstellen/einspielen, Speicherort, Gerät. */
export function DatenTab() {
  return (
    <div className="space-y-12">
      <BackupSection />
      <RestoreSection />
      <DatabasePathSection />
      <DeviceSection />
    </div>
  );
}

function BackupSection() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBackup = async () => {
    setBusy(true);
    setError(null);
    try {
      const content = await invoke<string>('export_all_data');
      downloadText(`schuelerbeobachtung-sicherung-${isoDate()}.json`, content, MIME_JSON);
      const summary = readBackup('', content);
      const parts = [
        plural(summary?.students ?? null, 'Schüler', 'Schüler'),
        plural(summary?.observations ?? null, 'Beobachtung', 'Beobachtungen'),
      ].filter(Boolean);
      toast.success(parts.length ? `Sicherung erstellt: ${parts.join(', ')}.` : 'Sicherung erstellt.');
    } catch (backupError) {
      console.error('Sicherung fehlgeschlagen:', backupError);
      setError(errorMessage(backupError, 'Die Sicherung konnte nicht erstellt werden.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      id="daten-sicherung"
      title="Sicherung erstellen"
      description={
        <p>
          Die Sicherung ist eine Datei mit allen Klassen, Schülern (auch gelöschten), Kategorien und Beobachtungen. Sie
          dient als Vorsorge und zum Umzug auf ein anderes Gerät. Die Datei ist nicht verschlüsselt: Bewahren Sie sie so
          sorgfältig auf wie das Gerät selbst.
        </p>
      }
    >
      <div className="flex max-w-measure flex-wrap items-end gap-3">
        <Button icon={<Download />} onClick={() => void handleBackup()} loading={busy}>
          Sicherung erstellen
        </Button>
      </div>
      {error && <InlineError>{error}</InlineError>}
    </Section>
  );
}

function RestoreSection() {
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [backup, setBackup] = useState<BackupSummary | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setFileError(null);
    let summary: BackupSummary | null = null;
    try {
      summary = readBackup(file.name, await readFileText(file));
    } catch (readError) {
      console.error('Datei konnte nicht gelesen werden:', readError);
    }
    if (!summary) {
      setBackup(null);
      setFileError(
        'Diese Datei ist keine Sicherung der Schülerbeobachtung. Änderungsdateien (.dat) lesen Sie im Reiter „Synchronisation“ ein.',
      );
      return;
    }
    setBackup(summary);
  };

  const handleImport = async () => {
    if (!backup) return;
    setImporting(true);
    setImportError(null);
    try {
      await invoke<string>('import_full_backup_data', { backupData: backup.content });
      const { loadStudents, loadClasses, loadCategories, getDeviceConfig } = useAppStore.getState();
      await Promise.allSettled([loadStudents(), loadClasses(), loadCategories(), getDeviceConfig()]);
      bumpDataVersion();
      setConfirming(false);
      setBackup(null);
      toast.success('Sicherung eingespielt.');
    } catch (error) {
      console.error('Sicherung konnte nicht eingespielt werden:', error);
      setImportError(errorMessage(error, 'Die Sicherung konnte nicht eingespielt werden.'));
    } finally {
      setImporting(false);
    }
  };

  const counts = backup
    ? [
        plural(backup.classes, 'Klasse', 'Klassen'),
        plural(backup.students, 'Schüler', 'Schüler'),
        plural(backup.observations, 'Beobachtung', 'Beobachtungen'),
        plural(backup.categories, 'Kategorie', 'Kategorien'),
      ]
        .filter(Boolean)
        .join(', ')
    : '';

  return (
    <Section
      id="daten-einspielen"
      title="Sicherung einspielen"
      description={<p>Übernimmt die Daten aus einer Sicherungsdatei in diese App, etwa auf einem neuen Gerät.</p>}
    >
      <Notice tone="warning" title="Bitte vorher lesen">
        <ul className="list-disc space-y-1 pl-5">
          <li>Die Daten der Sicherung werden mit den vorhandenen zusammengeführt. Es wird nichts gelöscht.</li>
          <li>
            Einträge mit gleicher Nummer werden durch den Stand der Sicherung ersetzt; gelöschte Schüler können wieder
            erscheinen. Gerätename und Gerätetyp werden aus der Sicherung übernommen.
          </li>
          <li>Das lässt sich nicht rückgängig machen. Erstellen Sie vorher eine Sicherung des jetzigen Stands.</li>
        </ul>
      </Notice>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" icon={<FolderOpen />} onClick={() => fileInput.current?.click()}>
          Sicherungsdatei auswählen …
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => void handleFile(event)}
          data-testid="backup-file"
        />
      </div>
      {fileError && <InlineError>{fileError}</InlineError>}

      {backup && (
        <div className="max-w-measure space-y-4">
          <FactList
            items={[
              { label: 'Datei', value: <span className="break-all">{backup.fileName}</span> },
              ...(backup.timestamp ? [{ label: 'Erstellt', value: formatDateTime(backup.timestamp) }] : []),
              ...(backup.deviceName ? [{ label: 'Von Gerät', value: backup.deviceName }] : []),
              ...(counts ? [{ label: 'Inhalt', value: counts }] : []),
            ]}
          />
          <div className="flex flex-wrap gap-3">
            <Button
              variant="danger"
              icon={<Upload />}
              onClick={() => {
                setImportError(null);
                setConfirming(true);
              }}
            >
              Sicherung einspielen
            </Button>
            <Button variant="ghost" onClick={() => setBackup(null)}>
              Andere Datei wählen
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        title="Sicherung jetzt einspielen?"
        tone="danger"
        confirmLabel="Einspielen"
        busy={importing}
        error={importError}
        onConfirm={() => void handleImport()}
        onCancel={() => setConfirming(false)}
      >
        <p>
          Die Daten aus „{backup?.fileName}“ werden mit Ihren vorhandenen Daten zusammengeführt. Vorhandene Einträge mit
          gleicher Nummer werden überschrieben.
        </p>
        <p className="font-semibold">Das lässt sich nicht rückgängig machen.</p>
      </ConfirmDialog>
    </Section>
  );
}

function DatabasePathSection() {
  const databasePath = useAppStore((state) => state.databasePath);
  const getDatabasePath = useAppStore((state) => state.getDatabasePath);
  const toast = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newPath, setNewPath] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    void getDatabasePath();
  }, [getDatabasePath]);

  const openDialog = () => {
    setNewPath(databasePath ?? '');
    setError(null);
    setDialogOpen(true);
  };

  const browse = async () => {
    try {
      const chosen = await save({
        title: 'Neuer Speicherort der Datenbank',
        defaultPath: 'observations.db',
        filters: [{ name: 'Datenbank', extensions: ['db'] }],
      });
      if (chosen) setNewPath(chosen);
    } catch (browseError) {
      console.error('Dateiauswahl fehlgeschlagen:', browseError);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const target = newPath.trim();
    if (!target) {
      setError('Bitte geben Sie den vollständigen Pfad zur Datenbankdatei an.');
      return;
    }
    if (target === databasePath) {
      setDialogOpen(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await invoke('set_database_path', { newPath: target });
      await getDatabasePath();
      setChanged(true);
      setDialogOpen(false);
      toast.success('Speicherort gespeichert. Er gilt ab dem nächsten Start der App.');
    } catch (saveError) {
      setError(errorMessage(saveError, 'Der Speicherort konnte nicht geändert werden.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section
      id="daten-speicherort"
      title="Speicherort der Datenbank"
      description={<p>Alle Daten liegen in einer einzigen Datei auf diesem Gerät.</p>}
    >
      <FactList
        items={[
          {
            label: changed ? 'Ab nächstem Start' : 'Datei',
            value: databasePath ? <PathText>{databasePath}</PathText> : <Spinner size="sm" label="Wird geladen …" />,
          },
        ]}
      />
      {changed && (
        <Notice tone="warning">
          <p>
            Starten Sie die App neu, damit der neue Speicherort gilt. Bis dahin arbeitet sie mit der bisherigen Datei.
          </p>
        </Notice>
      )}
      <Button variant="secondary" onClick={openDialog} disabled={!databasePath}>
        Speicherort ändern …
      </Button>

      <Dialog
        open={dialogOpen}
        onClose={saving ? () => undefined : () => setDialogOpen(false)}
        title="Speicherort ändern"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialogOpen(false)} disabled={saving}>
              Abbrechen
            </Button>
            <Button type="submit" form="database-path-form" loading={saving}>
              Speichern
            </Button>
          </>
        }
      >
        <form id="database-path-form" onSubmit={handleSubmit} noValidate className="space-y-5">
          <Notice tone="warning">
            <p>
              Die vorhandene Datenbank wird <strong>nicht</strong> verschoben. Nach dem Neustart öffnet die App die Datei
              am neuen Ort; gibt es dort noch keine, beginnt sie mit einer leeren Datenbank.
            </p>
            <p>Um Ihre Daten mitzunehmen: App beenden, die bisherige Datei an den neuen Ort kopieren, App starten.</p>
          </Notice>
          <Field label="Neuer Pfad" hint="Vollständiger Pfad mit Dateiname. Der Ordner muss bereits existieren." error={error}>
            <Input
              value={newPath}
              onChange={(event) => setNewPath(event.target.value)}
              placeholder="C:\Daten\Schuelerbeobachtung\observations.db"
              spellCheck={false}
              className="font-mono text-small"
            />
          </Field>
          <Button variant="ghost" size="sm" icon={<FolderOpen />} onClick={() => void browse()}>
            Ort auswählen …
          </Button>
        </form>
      </Dialog>
    </Section>
  );
}

type DeviceType = 'computer' | 'notebook';

function DeviceSection() {
  const deviceConfig = useAppStore((state) => state.deviceConfig);
  const getDeviceConfig = useAppStore((state) => state.getDeviceConfig);
  const toast = useToast();
  const [name, setName] = useState('');
  const [type, setType] = useState<DeviceType>('computer');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getDeviceConfig();
  }, [getDeviceConfig]);

  useEffect(() => {
    if (!deviceConfig) return;
    setName(deviceConfig.device_name ?? '');
    setType(deviceConfig.device_type === 'notebook' ? 'notebook' : 'computer');
  }, [deviceConfig]);

  const dirty =
    deviceConfig !== null &&
    (name.trim() !== (deviceConfig.device_name ?? '') ||
      type !== (deviceConfig.device_type === 'notebook' ? 'notebook' : 'computer'));

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await invoke('set_device_config', { deviceType: type, deviceName: name.trim() || null });
      await getDeviceConfig();
      toast.success('Geräteangaben gespeichert.');
    } catch (saveError) {
      setError(errorMessage(saveError, 'Die Geräteangaben konnten nicht gespeichert werden.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section
      id="daten-geraet"
      title="Dieses Gerät"
      description={<p>Name und Art des Geräts stehen in Sicherungen und helfen, Ihre Geräte auseinanderzuhalten.</p>}
    >
      <form onSubmit={handleSubmit} className="max-w-measure space-y-5">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <Field label="Gerätename" className="w-72 max-w-full">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="z. B. Notebook Klassenzimmer"
              maxLength={60}
            />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-ui font-semibold text-ink">
              Gerätetyp
            </span>
            <SegmentedControl<DeviceType>
              ariaLabel="Gerätetyp"
              value={type}
              onChange={setType}
              options={[
                { value: 'computer', label: 'Computer' },
                { value: 'notebook', label: 'Notebook' },
              ]}
            />
          </div>
        </div>
        {error && <InlineError>{error}</InlineError>}
        <Button type="submit" variant="secondary" loading={saving} disabled={!dirty}>
          Speichern
        </Button>
      </form>
    </Section>
  );
}
