import { useEffect, type ReactNode } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { AlertTriangle, Check, CloudOff, Plus, RefreshCw } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { currentSchoolYear, formatRecent } from '../../lib/format';
import { cx } from '../../lib/cx';
import { useObservationEditor } from '../observations/editorContext';
import { WAITING_DATA_LOSS_WARNING, WAITING_TEXT } from '../../lib/syncTexts';

const NAV_ITEMS = [
  { to: '/', label: 'Heute', end: true },
  { to: '/schueler', label: 'Schüler', end: false },
  { to: '/beobachtungen', label: 'Beobachtungen', end: false },
  { to: '/einstellungen', label: 'Einstellungen', end: false },
];

const SYNC_REFRESH_MS = 60_000;

/** Einzeilige Anzeige des WebDAV-Abgleichs am Fuß der Seitenleiste. */
export function SyncStatusLink() {
  const sync = useAppStore((state) => state.webdavSync);
  const getWebDavSyncStatus = useAppStore((state) => state.getWebDavSyncStatus);
  const deviceRole = useAppStore((state) => state.deviceRole);

  // Der Abgleich läuft im Hintergrund; die Anzeige wird regelmäßig aufgefrischt,
  // aber nicht während eines laufenden manuellen Abgleichs überschrieben.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (useAppStore.getState().webdavSync.status !== 'syncing') void getWebDavSyncStatus();
    }, SYNC_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [getWebDavSyncStatus]);

  let icon: ReactNode;
  let text: string;
  /** Zusätzlicher Warnhinweis (sichtbar und als Tooltip). */
  let warning: string | null = null;
  if (sync.status === 'syncing') {
    icon = <RefreshCw aria-hidden="true" className="h-3.5 w-3.5 animate-spin text-marker" />;
    text = 'Synchronisiert gerade …';
  } else if (sync.status === 'error' || sync.error) {
    icon = <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 text-marker" />;
    text = 'Synchronisation fehlgeschlagen';
  } else if (!sync.config) {
    icon = <CloudOff aria-hidden="true" className="h-3.5 w-3.5" />;
    text = 'Synchronisation nicht eingerichtet';
  } else if (!sync.config.active) {
    icon = <CloudOff aria-hidden="true" className="h-3.5 w-3.5" />;
    text = 'Synchronisation angehalten';
  } else if (sync.lastOutcome === 'no_laptop_found') {
    icon = <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 text-marker" />;
    text = 'Kein Laptop gefunden. Bitte auf dem Laptop einmal synchronisieren.';
  } else if (sync.lastOutcome === 'waiting_for_laptop' || (deviceRole === 'desktop' && sync.firstSyncDone === false)) {
    icon = <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 text-marker" />;
    text = WAITING_TEXT;
    warning = WAITING_DATA_LOSS_WARNING;
  } else if (sync.lastSyncTime) {
    icon = <Check aria-hidden="true" className="h-3.5 w-3.5" />;
    text = `Synchronisiert: ${formatRecent(sync.lastSyncTime)}`;
  } else {
    // Das Backend liefert den Zeitpunkt des letzten Abgleichs derzeit nicht zuverlässig.
    icon = <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />;
    text = 'Synchronisation aktiv';
  }

  return (
    <Link
      to="/einstellungen/synchronisation"
      title={warning ?? undefined}
      className="flex items-start gap-2 rounded-sm px-2 py-1.5 text-small leading-snug text-kreide-muted transition-colors hover:text-kreide"
    >
      <span className="mt-[3px] shrink-0">{icon}</span>
      <span role="status">
        {text}
        {warning && <span className="mt-1 block font-semibold text-kreide">{warning}</span>}
      </span>
    </Link>
  );
}

export interface AppShellProps {
  /** Meldung, wenn die Daten beim Start nicht geladen werden konnten. */
  loadError?: boolean;
  onRetry?: () => void;
}

/**
 * Rahmen der Anwendung: links die Tafel (Navigation, „Neue Beobachtung“, Sync-Status),
 * rechts das Papier mit der aktuellen Seite (<Outlet />).
 */
export function AppShell({ loadError = false, onRetry }: AppShellProps) {
  const { openCreate } = useObservationEditor();

  return (
    <div className="flex h-screen overflow-hidden bg-paper">
      <a
        href="#inhalt"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-surface focus:px-4 focus:py-2 focus:font-semibold"
      >
        Zum Inhalt springen
      </a>

      <aside className="on-tafel no-print flex w-sidebar shrink-0 flex-col bg-tafel-900 text-kreide">
        <div className="px-6 pb-6 pt-7">
          <p className="text-meta uppercase text-kreide-muted">Schuljahr {currentSchoolYear()}</p>
          <p className="mt-1.5 font-display text-[1.3125rem] font-[520] leading-tight tracking-[-0.01em] text-kreide">
            Schülerbeobachtung
          </p>
        </div>

        <div className="px-4">
          <button
            type="button"
            onClick={() => openCreate()}
            aria-keyshortcuts="Control+N"
            title="Neue Beobachtung (Strg+N)"
            className="flex h-11 w-full items-center gap-2 whitespace-nowrap rounded bg-kreide pl-3 pr-2.5 text-ui font-semibold text-tafel-900 transition-colors duration-150 hover:bg-white active:bg-tafel-100"
          >
            <Plus aria-hidden="true" className="h-[1.125rem] w-[1.125rem] shrink-0" strokeWidth={2.25} />
            Neue Beobachtung
          </button>
        </div>

        <nav aria-label="Hauptnavigation" className="mt-7 flex-1 overflow-y-auto px-4">
          <ul className="space-y-0.5">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cx(
                      'group relative flex h-10 items-center rounded pl-5 pr-3 text-body transition-colors duration-150',
                      isActive
                        ? 'bg-tafel-800 font-semibold text-kreide'
                        : 'font-medium text-kreide-muted hover:bg-tafel-800/60 hover:text-kreide',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        aria-hidden="true"
                        className={cx(
                          'absolute bottom-2.5 left-2 top-2.5 w-[3px] rounded-full bg-marker transition-opacity duration-150',
                          isActive ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      {item.label}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-tafel-700 px-4 py-3">
          <SyncStatusLink />
        </div>
      </aside>

      <main id="inhalt" tabIndex={-1} className="min-w-0 flex-1 overflow-y-auto focus:outline-none">
        {loadError && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-rotstift/40 bg-rotstift-soft px-10 py-3 text-ui font-medium text-rotstift-dark xl:px-14"
          >
            Die Daten konnten nicht geladen werden.
            {onRetry && (
              <button type="button" onClick={onRetry} className="rounded-sm font-semibold underline underline-offset-[3px]">
                Erneut versuchen
              </button>
            )}
          </div>
        )}
        <div className="px-10 pb-20 pt-10 xl:px-14 xl:pt-12">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
