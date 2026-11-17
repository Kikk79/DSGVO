import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { isToday } from 'date-fns';
import { ArrowRight, Plus } from 'lucide-react';
import { useAppStore, type StudentWithStats } from '../../stores/appStore';
import { useDataVersion } from '../../stores/uiStore';
import { fromObservation } from '../../lib/observations';
import { calendarWeek, daysSince, formatDayMonthYear, formatDaysAgo, formatWeekday } from '../../lib/format';
import { errorMessage } from '../../lib/errors';
import { Button } from '../../components/ui/Button';
import { buttonClasses } from '../../components/ui/buttonStyles';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { ObservationEntry } from '../../components/observations/ObservationEntry';
import { useObservationEditor } from '../../components/observations/editorContext';

const RECENT_LIMIT = 5;
const OVERDUE_LIMIT = 5;
/** Ab so vielen Tagen ohne Eintrag erscheint ein Schüler unter „Länger ohne Eintrag“. */
const OVERDUE_DAYS = 7;

function Figure({ value, label, highlight = false }: { value: number; label: string; highlight?: boolean }) {
  return (
    <div className="flex flex-col-reverse justify-end py-5 pr-6 [&:not(:first-child)]:border-l [&:not(:first-child)]:border-line [&:not(:first-child)]:pl-6">
      <dt className="meta mt-2">{label}</dt>
      <dd className="font-display text-numeral font-[380] text-ink">
        <span className="relative inline-block">
          {highlight && value > 0 && (
            <span aria-hidden="true" className="absolute inset-x-[-0.12em] bottom-[0.1em] h-[0.34em] rounded-[2px] bg-marker" />
          )}
          <span className="relative tabular-nums">{value}</span>
        </span>
      </dd>
    </div>
  );
}

function SectionHead({ id, title, children }: { id: string; title: string; children?: ReactNode }) {
  return (
    <div className="section-head">
      <h2 id={id} className="font-display text-title font-[520] text-ink">
        {title}
      </h2>
      {children}
    </div>
  );
}

export function HeutePage() {
  const students = useAppStore((state) => state.students);
  const classes = useAppStore((state) => state.classes);
  const categories = useAppStore((state) => state.categories);
  const observations = useAppStore((state) => state.observations);
  const searchObservations = useAppStore((state) => state.searchObservations);
  const loadStudents = useAppStore((state) => state.loadStudents);
  const loadClasses = useAppStore((state) => state.loadClasses);
  const dataVersion = useDataVersion();
  const { openCreate } = useObservationEditor();

  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stats, setStats] = useState<StudentWithStats[]>([]);

  useEffect(() => {
    let cancelled = false;
    // Schüler und Klassen werden mitgeladen, damit Namen und Zähler zum selben Stand gehören.
    Promise.all([
      invoke<StudentWithStats[]>('get_students_with_stats'),
      searchObservations(),
      loadStudents(),
      loadClasses(),
    ])
      .then(([studentStats]) => {
        if (cancelled) return;
        setStats(studentStats);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        console.error('Übersicht konnte nicht geladen werden:', error);
        if (!cancelled) setLoadError(errorMessage(error, 'Die Übersicht konnte nicht geladen werden.'));
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [searchObservations, loadStudents, loadClasses, dataVersion]);

  // Einträge zu als gelöscht markierten Schülern bleiben außen vor (wie in der Beobachtungsliste).
  const entries = useMemo(() => {
    const known = new Set(students.map((student) => student.id));
    return observations
      .filter((observation) => known.has(observation.student_id))
      .map((observation) => fromObservation(observation, { students, classes, categories }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [observations, students, classes, categories]);

  const today = useMemo(() => entries.filter((entry) => isToday(new Date(entry.createdAt))), [entries]);
  const earlier = useMemo(
    () => entries.filter((entry) => !isToday(new Date(entry.createdAt))).slice(0, RECENT_LIMIT),
    [entries],
  );
  const lastSevenDays = useMemo(() => entries.filter((entry) => daysSince(entry.createdAt) < 7).length, [entries]);

  const overdue = useMemo(
    () =>
      stats
        .filter(
          (student) =>
            student.status === 'active' &&
            (!student.last_observation_date || daysSince(student.last_observation_date) >= OVERDUE_DAYS),
        )
        .sort((a, b) => {
          if (!a.last_observation_date && !b.last_observation_date) return a.last_name.localeCompare(b.last_name, 'de');
          if (!a.last_observation_date) return -1;
          if (!b.last_observation_date) return 1;
          return new Date(a.last_observation_date).getTime() - new Date(b.last_observation_date).getTime();
        })
        .slice(0, OVERDUE_LIMIT),
    [stats],
  );

  const now = new Date();
  const header = (
    <PageHeader
      eyebrow={`Heute · Kalenderwoche ${calendarWeek(now)}`}
      title={
        <>
          <em className="font-[400]">{formatWeekday(now)},</em> {formatDayMonthYear(now)}
        </>
      }
    />
  );

  if (!loaded) {
    return (
      <div className="page-enter max-w-page space-y-10">
        {header}
        <Spinner showLabel label="Einträge werden geladen …" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="page-enter max-w-page space-y-10">
        {header}
        <p role="alert" className="rounded border border-rotstift/40 bg-rotstift-soft px-4 py-3 text-ui font-medium text-rotstift-dark">
          {loadError}
        </p>
      </div>
    );
  }

  // Frisch installiert: erst Klasse und Schüler, dann die erste Beobachtung.
  if (students.length === 0) {
    return (
      <div className="page-enter max-w-page space-y-10">
        {header}
        <EmptyState
          title="Willkommen in Ihrem Klassenbuch"
          action={
            <Link to="/schueler" className={buttonClasses('primary')}>
              Klasse und Schüler anlegen
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          }
        >
          <p>Noch ist nichts eingetragen. In drei Schritten zur ersten Beobachtung:</p>
          <ol className="mt-4 space-y-2.5 text-ink">
            {['Klasse anlegen', 'Schüler hinzufügen', 'Erste Beobachtung erfassen'].map((step, index) => (
              <li key={step} className="flex items-baseline gap-4">
                <span className="w-5 text-right font-display text-name font-[560] tabular-nums text-ink-muted">{index + 1}</span>
                {step}
              </li>
            ))}
          </ol>
        </EmptyState>
      </div>
    );
  }

  const newObservationButton = (
    <Button icon={<Plus />} onClick={() => openCreate()}>
      Beobachtung erfassen
    </Button>
  );

  return (
    <div className="page-enter max-w-[72rem] space-y-10">
      {header}

      <dl className="grid max-w-page grid-cols-3 border-y border-line">
        <Figure value={today.length} label={today.length === 1 ? 'Eintrag heute' : 'Einträge heute'} highlight />
        <Figure value={lastSevenDays} label="In den letzten 7 Tagen" />
        <Figure value={students.length} label="Schüler" />
      </dl>

      {entries.length === 0 ? (
        <EmptyState title="Noch keine Beobachtungen" action={newObservationButton} className="max-w-page">
          Ihre Schüler sind angelegt. Erfassen Sie jetzt die erste Beobachtung; sie erscheint dann hier mit Uhrzeit.
        </EmptyState>
      ) : (
        <div className="grid gap-x-16 gap-y-12 min-[1320px]:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0 space-y-12">
            <section aria-labelledby="heute-erfasst">
              <SectionHead id="heute-erfasst" title="Heute erfasst" />
              {today.length === 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line py-6">
                  <p className="text-body text-ink-muted">Heute ist noch nichts eingetragen.</p>
                  {newObservationButton}
                </div>
              ) : (
                <ul className="entry-list border-t-0">
                  {today.map((entry) => (
                    <ObservationEntry key={entry.id} observation={entry} />
                  ))}
                </ul>
              )}
            </section>

            {earlier.length > 0 && (
              <section aria-labelledby="zuletzt-erfasst">
                <SectionHead id="zuletzt-erfasst" title="Zuletzt erfasst">
                  <Link to="/beobachtungen" className="link inline-flex items-center gap-1 text-small">
                    Alle Beobachtungen
                    <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                  </Link>
                </SectionHead>
                <ul className="entry-list border-t-0">
                  {earlier.map((entry) => (
                    <ObservationEntry key={entry.id} observation={entry} margin="date" clamp />
                  ))}
                </ul>
              </section>
            )}
          </div>

          <section aria-labelledby="laenger-ohne-eintrag" className="min-w-0">
            <SectionHead id="laenger-ohne-eintrag" title="Länger ohne Eintrag" />
            {overdue.length === 0 ? (
              <p className="border-b border-line py-5 text-ui text-ink-muted">
                Zu allen aktiven Schülern gibt es einen Eintrag aus den letzten {OVERDUE_DAYS} Tagen.
              </p>
            ) : (
              <ul>
                {overdue.map((student) => (
                  <li key={student.id} className="border-b border-line">
                    <Link
                      to={`/schueler/${student.id}`}
                      className="group flex items-baseline justify-between gap-4 rounded-sm py-3 transition-colors hover:bg-paper-deep"
                    >
                      <span className="flex min-w-0 items-baseline gap-2.5">
                        <span className="truncate font-display text-[1.0625rem] font-[540] text-ink">
                          {student.first_name} {student.last_name}
                        </span>
                        <span className="meta shrink-0">{student.class_name}</span>
                      </span>
                      <span className="shrink-0 text-small text-ink-muted">
                        {student.last_observation_date ? formatDaysAgo(student.last_observation_date) : 'noch kein Eintrag'}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
