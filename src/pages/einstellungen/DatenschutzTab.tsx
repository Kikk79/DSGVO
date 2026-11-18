import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { Trash2 } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { errorMessage } from '../../lib/errors';
import { formatDateTime } from '../../lib/format';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Spinner } from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/toastContext';
import { FactList, InlineError, Notice, PathText, Section } from './parts';

/** Automatisch angelegte Sicherungskopie (Backend: list_safety_backups). */
interface SafetyBackup {
  path: string;
  size: number;
  created: string | null;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

/**
 * Sicherungskopien der Datenbank, die die App vor der Umstellung auf Sync v2 und vor dem
 * Ersetzen beim ersten Abgleich anlegt. Sie enthalten alle Daten unverschlüsselt und werden
 * nie automatisch gelöscht; hier lassen sie sich nach Rückfrage entfernen.
 */
function SafetyBackupsSection() {
  const toast = useToast();
  const [backups, setBackups] = useState<SafetyBackup[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const list = await invoke<SafetyBackup[] | null>('list_safety_backups');
      setBackups(Array.isArray(list) ? list : []);
    } catch (error) {
      console.error('Sicherungskopien konnten nicht gelesen werden:', error);
      setBackups([]);
      setLoadError(errorMessage(error, 'Die Sicherungskopien konnten nicht gelesen werden.'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      const count = await invoke<number>('delete_safety_backups');
      setConfirming(false);
      toast.success(
        typeof count === 'number' && count !== 1 ? `${count} Sicherungskopien gelöscht.` : 'Sicherungskopie gelöscht.',
      );
      await load();
    } catch (error) {
      console.error('Sicherungskopien konnten nicht gelöscht werden:', error);
      setDeleteError(errorMessage(error, 'Die Sicherungskopien konnten nicht gelöscht werden.'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Section
      id="ds-sicherungskopien"
      title="Automatische Sicherungskopien"
      description={
        <>
          <p>
            Bevor die App die Datenbank auf die neue Version umstellt und bevor ein Desktop beim ersten Abgleich seinen
            Stand durch den vom Laptop ersetzt, legt sie eine vollständige Kopie der Datenbank an. Damit lassen sich die
            Daten wiederherstellen, falls dabei etwas schiefgeht.
          </p>
          <p>
            Die Kopien liegen im selben Ordner wie die Datenbank, enthalten alle Namen und Beobachtungen und sind{' '}
            <strong className="font-semibold text-ink">nicht verschlüsselt</strong>. Die App löscht sie nicht von
            selbst. Wenn alles wie erwartet funktioniert, können Sie sie hier löschen.
          </p>
        </>
      }
    >
      {backups === null ? (
        <Spinner size="sm" label="Wird geladen …" />
      ) : backups.length === 0 ? (
        <p className="text-ui text-ink-muted">Zurzeit liegen keine Sicherungskopien vor.</p>
      ) : (
        <>
          <ul aria-label="Sicherungskopien" className="max-w-measure border-t border-line">
            {backups.map((backup) => (
              <li key={backup.path} className="border-b border-line py-2.5 text-ui">
                <PathText>{backup.path}</PathText>
                <p className="mt-0.5 text-small text-ink-muted">
                  {[backup.created ? `Angelegt ${formatDateTime(backup.created)}` : null, formatSize(backup.size)]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </li>
            ))}
          </ul>
          <div>
            <Button variant="danger" icon={<Trash2 />} onClick={() => setConfirming(true)}>
              Sicherungskopien löschen
            </Button>
          </div>
        </>
      )}
      {loadError && <InlineError>{loadError}</InlineError>}

      <ConfirmDialog
        open={confirming}
        title="Sicherungskopien löschen?"
        confirmLabel="Endgültig löschen"
        tone="danger"
        busy={deleting}
        error={deleteError}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirming(false)}
      >
        <p>
          {backups?.length === 1
            ? 'Die automatisch angelegte Sicherungskopie wird endgültig gelöscht.'
            : `Die ${backups?.length ?? 0} automatisch angelegten Sicherungskopien werden endgültig gelöscht.`}{' '}
          Ihre Datenbank und Sicherungen, die Sie selbst erstellt haben, bleiben erhalten.
        </p>
        <p>Danach lässt sich der Stand vor der Umstellung bzw. vor dem ersten Abgleich nicht mehr wiederherstellen.</p>
      </ConfirmDialog>
    </Section>
  );
}

/**
 * Reiter „Datenschutz“: ehrliche Auskunft darüber, wo die Daten liegen, was das Gerät
 * verlässt und wie Auskunft und Löschung funktionieren. Einzige Aktion: automatisch
 * angelegte Sicherungskopien löschen (nach Rückfrage).
 */
export function DatenschutzTab() {
  const databasePath = useAppStore((state) => state.databasePath);
  const getDatabasePath = useAppStore((state) => state.getDatabasePath);
  const sync = useAppStore((state) => state.webdavSync);

  useEffect(() => {
    void getDatabasePath();
  }, [getDatabasePath]);

  const syncActive = Boolean(sync.config?.active);
  const syncText = sync.config
    ? `Eingerichtet${syncActive ? '' : ', zurzeit angehalten'}: ${sync.config.url}`
    : 'Nicht eingerichtet';

  return (
    <div className="space-y-12">
      <Section
        id="ds-speicher"
        title="Wo Ihre Daten liegen"
        description={
          <p>
            Klassen, Schüler, Kategorien und Beobachtungen speichert die App in einer SQLite-Datenbank auf diesem
            Gerät. Die Datei ist <strong className="font-semibold text-ink">nicht verschlüsselt</strong>: Wer Zugriff
            auf Ihr Benutzerkonto oder die Datei hat, kann alles lesen.
          </p>
        }
      >
        <FactList
          items={[
            {
              label: 'Datenbank',
              value: databasePath ? <PathText>{databasePath}</PathText> : <Spinner size="sm" label="Wird geladen …" />,
            },
            {
              label: 'Protokoll',
              value: (
                <>
                  <PathText>audit.db</PathText> im Programmordner der App. Hält fest, wann etwas angelegt, geändert,
                  gelöscht oder exportiert wurde, ohne den Text der Beobachtungen.
                </>
              ),
            },
            {
              label: 'Zugangsdaten',
              value: 'Das Passwort für die Synchronisation liegt in der Datenbank, nur leicht verschleiert.',
            },
          ]}
        />
        <Notice title="Empfehlung">
          <p>
            Schützen Sie das Gerät mit einem eigenen Benutzerkonto, einem Passwort und der Laufwerksverschlüsselung des
            Betriebssystems (unter Windows: BitLocker oder Geräteverschlüsselung). Fragen Sie im Zweifel die
            Datenschutzbeauftragte oder den Datenschutzbeauftragten Ihrer Schule.
          </p>
        </Notice>
      </Section>

      <SafetyBackupsSection />

      <Section
        id="ds-weitergabe"
        title="Was das Gerät verlässt"
        description={
          <p>
            Von sich aus sendet die App nur dann Daten, wenn die Synchronisation eingerichtet ist. Alles andere verlässt
            das Gerät nur, wenn Sie selbst eine Datei erstellen.
          </p>
        }
      >
        <FactList
          items={[
            {
              label: 'Synchronisation',
              value: (
                <>
                  {syncText}.{' '}
                  <Link to="/einstellungen/synchronisation" className="link">
                    Einstellungen
                  </Link>
                </>
              ),
            },
            {
              label: 'Dabei übertragen',
              value:
                'Alles: Klassen, Schüler mit Namen, Kategorien und Beobachtungen mit Text, Kategorie, Schlagwörtern und Zeitpunkt, außerdem Löschvermerke. Die Dateien liegen unverschlüsselt auf dem Server und werden dort nicht automatisch entfernt.',
            },
            {
              label: 'Dateien, die Sie erstellen',
              value:
                'Sicherungen, Änderungsdateien, Exporte einzelner Schüler und Listen. Sie sind unverschlüsselt und enthalten Namen und Beobachtungen.',
            },
          ]}
        />
      </Section>

      <Section id="ds-rechte" title="Auskunft und Löschung">
        <dl className="max-w-measure space-y-5 text-ui">
          <div className="border-l-[3px] border-line pl-4">
            <dt className="font-semibold text-ink">Auskunft (Art. 15 DSGVO)</dt>
            <dd className="mt-1 text-ink-muted">
              Öffnen Sie unter{' '}
              <Link to="/schueler" className="link">
                Schüler
              </Link>{' '}
              die Schülerakte. Dort exportieren Sie alle Angaben und Beobachtungen zu diesem Schüler als Datei, die Sie
              herausgeben können.
            </dd>
          </div>
          <div className="border-l-[3px] border-line pl-4">
            <dt className="font-semibold text-ink">Berichtigung</dt>
            <dd className="mt-1 text-ink-muted">Beobachtungen lassen sich in der Schülerakte und in der Beobachtungsliste bearbeiten.</dd>
          </div>
          <div className="border-l-[3px] border-line pl-4">
            <dt className="font-semibold text-ink">Löschung (Art. 17 DSGVO)</dt>
            <dd className="mt-1 space-y-2 text-ink-muted">
              <p>
                Einzelne Beobachtungen löschen Sie in der{' '}
                <Link to="/beobachtungen" className="link">
                  Beobachtungsliste
                </Link>{' '}
                oder der Schülerakte, einen Schüler in seiner Schülerakte.
              </p>
              <p>
                Bei eingerichteter Synchronisation überträgt die App Löschungen beim nächsten Abgleich auf Ihr anderes
                Gerät. Was sie nicht für Sie erledigt: Kopien auf dem Synchronisationsserver und in Sicherungsdateien
                löschen Sie selbst. Einträge im Protokoll bleiben erhalten.
              </p>
            </dd>
          </div>
        </dl>
      </Section>
    </div>
  );
}
