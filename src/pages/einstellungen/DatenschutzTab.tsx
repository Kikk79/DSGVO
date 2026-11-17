import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '../../stores/appStore';
import { Spinner } from '../../components/ui/Spinner';
import { FactList, Notice, PathText, Section } from './parts';

/**
 * Reiter „Datenschutz“: ehrliche Auskunft darüber, wo die Daten liegen, was das Gerät
 * verlässt und wie Auskunft und Löschung funktionieren. Keine Schalter, nur Information.
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
