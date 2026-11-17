import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { format, parse, startOfMonth } from 'date-fns';
import { Download, Plus, X } from 'lucide-react';
import { useAppStore, type Observation } from '../../stores/appStore';
import { useDataVersion } from '../../stores/uiStore';
import { fromObservation, type ObservationView } from '../../lib/observations';
import { formatDateLong, formatDayLabel, isoDate } from '../../lib/format';
import { errorMessage } from '../../lib/errors';
import { downloadText, MIME_CSV } from '../../lib/download';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Spinner } from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/toastContext';
import { ObservationEntry } from '../../components/observations/ObservationEntry';
import { useObservationEditor } from '../../components/observations/editorContext';
import { FilterBar } from './FilterBar';
import { ObservationTable } from './ObservationTable';
import { ObservationCalendar } from './ObservationCalendar';
import {
  PARAM,
  applyFilters,
  clearFilterParams,
  groupByDay,
  hasActiveFilters,
  readFilters,
  readMonth,
  readSort,
  readView,
  sortObservations,
  toCsv,
  writeFilters,
  type ObservationFilters,
  type SortKey,
  type StudentInfo,
  type ViewMode,
} from './filters';

/** So viele Einträge erscheinen zunächst und kommen mit „Weitere anzeigen“ hinzu. */
export const PAGE_SIZE = 50;

const VIEW_OPTIONS: Array<{ value: ViewMode; label: string }> = [
  { value: 'liste', label: 'Liste' },
  { value: 'tabelle', label: 'Tabelle' },
  { value: 'kalender', label: 'Kalender' },
];

const countLabel = (count: number) => (count === 1 ? '1 Eintrag' : `${count} Einträge`);

export function BeobachtungenPage() {
  const students = useAppStore((state) => state.students);
  const classes = useAppStore((state) => state.classes);
  const categories = useAppStore((state) => state.categories);
  const loadStudents = useAppStore((state) => state.loadStudents);
  const loadClasses = useAppStore((state) => state.loadClasses);
  const dataVersion = useDataVersion();
  const { openCreate } = useObservationEditor();
  const toast = useToast();

  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => readFilters(searchParams), [searchParams]);
  const view = readView(searchParams);
  const sort = readSort(searchParams);
  const monthParam = searchParams.get(PARAM.month);
  const month = useMemo(
    () => readMonth(new URLSearchParams(monthParam ? { [PARAM.month]: monthParam } : {})) ?? startOfMonth(new Date()),
    [monthParam],
  );

  const [raw, setRaw] = useState<Observation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [visible, setVisible] = useState(PAGE_SIZE);

  useEffect(() => {
    let cancelled = false;
    // Alle Beobachtungen auf einmal: search_observations kennt kein Blättern, liefert aber
    // den vollständigen Bestand. Gefiltert, sortiert und schrittweise angezeigt wird hier.
    Promise.all([
      invoke<Observation[]>('search_observations', {
        query: null,
        studentId: null,
        category: null,
      }),
      loadStudents(),
      loadClasses(),
    ])
      .then(([observations]) => {
        if (cancelled) return;
        setRaw(observations);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        console.error('Beobachtungen konnten nicht geladen werden:', error);
        if (!cancelled) setLoadError(errorMessage(error, 'Die Beobachtungen konnten nicht geladen werden.'));
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [loadStudents, loadClasses, dataVersion, reloadToken]);

  const studentInfo = useMemo(
    () =>
      new Map<number, StudentInfo>(
        students.map((student) => [
          student.id,
          {
            classId: student.class_id,
            firstName: student.first_name,
            lastName: student.last_name,
          },
        ]),
      ),
    [students],
  );

  // Einträge zu gelöschten Schülern (nicht mehr in der Schülerliste) bleiben außen vor.
  const all = useMemo<ObservationView[]>(
    () =>
      raw
        .filter((observation) => studentInfo.has(observation.student_id))
        .map((observation) => fromObservation(observation, { students, classes, categories })),
    [raw, studentInfo, students, classes, categories],
  );

  const filtered = useMemo(() => applyFilters(all, filters, studentInfo), [all, filters, studentInfo]);

  // Liste und Kalender: neueste zuerst. Tabelle: nach gewählter Spalte.
  const ordered = useMemo(
    () =>
      view === 'tabelle'
        ? sortObservations(filtered, sort.key, sort.direction, studentInfo)
        : sortObservations(filtered, 'datum', 'ab', studentInfo),
    [filtered, view, sort.key, sort.direction, studentInfo],
  );

  // Neue Filter oder Sortierung beginnen wieder mit der ersten Portion.
  const filterKey = searchParams.toString();
  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [filterKey]);

  const shown = useMemo(() => ordered.slice(0, visible), [ordered, visible]);
  const groups = useMemo(() => (view === 'liste' ? groupByDay(shown) : []), [shown, view]);

  const updateParams = useCallback(
    (update: (params: URLSearchParams) => URLSearchParams) => {
      setSearchParams((current) => update(current), { replace: true });
    },
    [setSearchParams],
  );

  const changeFilters = useCallback(
    (next: ObservationFilters) => updateParams((params) => writeFilters(params, next)),
    [updateParams],
  );
  const resetFilters = useCallback(() => updateParams(clearFilterParams), [updateParams]);

  const changeView = (next: ViewMode) =>
    updateParams((params) => {
      const copy = new URLSearchParams(params);
      if (next === 'liste') copy.delete(PARAM.view);
      else copy.set(PARAM.view, next);
      return copy;
    });

  const changeSort = (key: SortKey) =>
    updateParams((params) => {
      const copy = new URLSearchParams(params);
      const direction = key === sort.key ? (sort.direction === 'auf' ? 'ab' : 'auf') : key === 'datum' ? 'ab' : 'auf';
      copy.set(PARAM.sort, key);
      copy.set(PARAM.direction, direction);
      return copy;
    });

  const changeMonth = (next: Date) =>
    updateParams((params) => {
      const copy = new URLSearchParams(params);
      copy.set(PARAM.month, format(next, 'yyyy-MM'));
      return copy;
    });

  const exportCsv = () => {
    downloadText(`beobachtungen_${isoDate()}.csv`, toCsv(ordered), MIME_CSV);
    toast.success(`${countLabel(ordered.length)} als CSV-Datei gespeichert.`);
  };

  const active = hasActiveFilters(filters);

  const header = (
    <PageHeader
      eyebrow="Alle Einträge"
      title="Beobachtungen"
      actions={
        <Button
          icon={<Plus />}
          onClick={() => openCreate(filters.studentId ? { studentId: filters.studentId } : undefined)}
        >
          Beobachtung erfassen
        </Button>
      }
    />
  );

  if (!loaded) {
    return (
      <div className="page-enter max-w-[72rem] space-y-8">
        {header}
        <Spinner showLabel label="Beobachtungen werden geladen …" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="page-enter max-w-[72rem] space-y-8">
        {header}
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-4 rounded border border-rotstift/40 bg-rotstift-soft px-4 py-3"
        >
          <p className="text-ui font-medium text-rotstift-dark">{loadError}</p>
          <Button variant="secondary" size="sm" onClick={() => setReloadToken((token) => token + 1)}>
            Erneut versuchen
          </Button>
        </div>
      </div>
    );
  }

  if (all.length === 0) {
    return (
      <div className="page-enter max-w-[72rem] space-y-8">
        {header}
        <EmptyState
          title="Noch keine Beobachtungen"
          className="max-w-page"
          action={
            <Button icon={<Plus />} onClick={() => openCreate()}>
              Erste Beobachtung erfassen
            </Button>
          }
        >
          Sobald Sie Beobachtungen erfassen, erscheinen sie hier zum Durchsuchen, als Tabelle und im Kalender.
        </EmptyState>
      </div>
    );
  }

  const remaining = ordered.length - shown.length;

  return (
    <div className="page-enter max-w-[72rem] space-y-8">
      {header}

      <FilterBar
        filters={filters}
        onChange={changeFilters}
        classes={classes}
        students={students}
        categories={categories}
      />

      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-ink pb-3">
          <p className="text-ui text-ink" aria-live="polite">
            <span className="font-display text-name font-[560] tabular-nums">{ordered.length}</span>{' '}
            <span className="text-ink-muted">
              {ordered.length === 1 ? 'Eintrag' : 'Einträge'}
              {active ? ` gefunden (von ${all.length})` : ''}
            </span>
          </p>
          {active && (
            <Button variant="ghost" size="sm" icon={<X />} onClick={resetFilters} className="-ml-3 mr-auto">
              Filter zurücksetzen
            </Button>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {ordered.length > 0 && (
              <Button variant="ghost" size="sm" icon={<Download />} onClick={exportCsv}>
                Als CSV speichern
              </Button>
            )}
            <SegmentedControl ariaLabel="Ansicht" options={VIEW_OPTIONS} value={view} onChange={changeView} />
          </div>
        </div>

        {ordered.length === 0 ? (
          <EmptyState
            title="Keine passenden Beobachtungen"
            className="max-w-page border-t-0"
            action={
              <Button variant="secondary" onClick={resetFilters}>
                Filter zurücksetzen
              </Button>
            }
          >
            Für diese Suche und Filter gibt es keine Einträge. Lockern Sie die Filter oder setzen Sie sie zurück.
          </EmptyState>
        ) : view === 'kalender' ? (
          <ObservationCalendar observations={ordered} month={month} onMonthChange={changeMonth} />
        ) : (
          <>
            {view === 'tabelle' ? (
              <ObservationTable
                observations={shown}
                sortKey={sort.key}
                sortDirection={sort.direction}
                onSort={changeSort}
              />
            ) : (
              <div className="max-w-page space-y-8">
                {groups.map((group) => {
                  const date = parse(group.day, 'yyyy-MM-dd', new Date());
                  const label = formatDayLabel(date);
                  const relative = label === 'Heute' || label === 'Gestern';
                  return (
                    <section key={group.day} aria-label={formatDateLong(date)}>
                      <h2 className="flex flex-wrap items-baseline gap-x-3 border-b border-line pb-1.5">
                        <span className="font-display text-name font-[540] text-ink">
                          {relative ? label : formatDateLong(date)}
                        </span>
                        {relative && <span className="meta">{formatDateLong(date)}</span>}
                        <span className="meta ml-auto tabular-nums">{countLabel(group.entries.length)}</span>
                      </h2>
                      <ul className="entry-list border-t-0">
                        {group.entries.map((entry) => (
                          <ObservationEntry key={entry.id} observation={entry} />
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-x-5 gap-y-3 pt-1">
              <p className="text-small text-ink-muted">
                {remaining > 0
                  ? `${shown.length} von ${ordered.length} angezeigt`
                  : `Alle ${countLabel(ordered.length)} angezeigt`}
              </p>
              {remaining > 0 && (
                <>
                  <Button variant="secondary" onClick={() => setVisible((count) => count + PAGE_SIZE)}>
                    Weitere {Math.min(PAGE_SIZE, remaining)} anzeigen
                  </Button>
                  {remaining > PAGE_SIZE && (
                    <Button variant="ghost" onClick={() => setVisible(ordered.length)}>
                      Alle anzeigen
                    </Button>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
