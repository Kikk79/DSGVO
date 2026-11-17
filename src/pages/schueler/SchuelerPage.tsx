import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { Plus, Search, Trash2, UserPlus } from 'lucide-react';
import { useAppStore, type Class, type StudentWithStats } from '../../stores/appStore';
import { useDataVersion } from '../../stores/uiStore';
import { formatDate, formatDaysAgo } from '../../lib/format';
import { errorMessage } from '../../lib/errors';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { IconButton } from '../../components/ui/IconButton';
import { Input } from '../../components/ui/Input';
import { PageHeader } from '../../components/ui/PageHeader';
import { Select } from '../../components/ui/Select';
import { Spinner } from '../../components/ui/Spinner';
import { ClassDialog } from './ClassDialog';
import { StudentDialog } from './StudentDialog';
import { DeleteStudentDialog } from './DeleteStudentDialog';
import { DeleteClassDialog } from './DeleteClassDialog';
import { compareClasses, groupByClass, matchesName, type ClassGroup } from './grouping';
import { statusLabel } from './studentExport';

const ALL_CLASSES = 'alle';

function countLabel(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function StudentRow({ student, onDelete }: { student: StudentWithStats; onDelete: () => void }) {
  const name = `${student.first_name} ${student.last_name}`;
  const inactive = student.status !== 'active';
  return (
    <li className="group flex items-center gap-2 border-b border-line">
      <Link
        to={`/schueler/${student.id}`}
        className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-6 gap-y-0.5 rounded-sm py-3 pl-1 pr-2 transition-colors hover:bg-paper-deep"
      >
        <span className="flex min-w-0 items-baseline gap-2.5">
          <span className="truncate font-display text-[1.0625rem] font-[540] text-ink">
            <span className="sr-only">Schülerakte von </span>
            {student.last_name}, {student.first_name}
          </span>
          {inactive && <span className="meta shrink-0">{statusLabel(student.status)}</span>}
        </span>
        <span className="flex shrink-0 items-baseline gap-6 text-small text-ink-muted">
          <span className="w-24 text-right tabular-nums">
            {student.observation_count > 0 && countLabel(student.observation_count, 'Eintrag', 'Einträge')}
          </span>
          <span className="w-32 text-right" title={student.last_observation_date ? `Letzter Eintrag am ${formatDate(student.last_observation_date)}` : undefined}>
            {student.last_observation_date ? `zuletzt ${formatDaysAgo(student.last_observation_date)}` : 'noch kein Eintrag'}
          </span>
        </span>
      </Link>
      <IconButton label={`${name} löschen`} size="sm" tone="danger" onClick={onDelete}>
        <Trash2 />
      </IconButton>
    </li>
  );
}

function ClassSection({
  group,
  filtered,
  onAddStudent,
  onDeleteClass,
  onDeleteStudent,
}: {
  group: ClassGroup;
  /** true, wenn Suche oder Filter aktiv sind (Leerhinweis entfällt dann) */
  filtered: boolean;
  onAddStudent: (classId: number) => void;
  onDeleteClass: (schoolClass: Class) => void;
  onDeleteStudent: (student: StudentWithStats) => void;
}) {
  const { schoolClass, students } = group;
  const headingId = `klasse-${schoolClass?.id ?? 'ohne'}`;
  return (
    <section aria-labelledby={headingId}>
      <div className="section-head flex-wrap">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id={headingId} className="font-display text-title font-[520] text-ink">
            {schoolClass ? `Klasse ${schoolClass.name}` : 'Ohne Klasse'}
          </h2>
          <span className="meta">
            {schoolClass && <>Schuljahr {schoolClass.school_year} · </>}
            {countLabel(students.length, 'Schüler', 'Schüler')}
          </span>
        </div>
        {schoolClass && (
          <div className="-mb-1 ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              icon={<UserPlus />}
              onClick={() => onAddStudent(schoolClass.id)}
            >
              Schüler hinzufügen<span className="sr-only"> (Klasse {schoolClass.name})</span>
            </Button>
            <IconButton
              label={`Klasse ${schoolClass.name} löschen`}
              size="sm"
              tone="danger"
              onClick={() => onDeleteClass(schoolClass)}
            >
              <Trash2 />
            </IconButton>
          </div>
        )}
      </div>
      {students.length === 0 ? (
        <p className="border-b border-line py-4 pl-1 text-ui text-ink-muted">
          {filtered ? 'Keine passenden Schüler in dieser Klasse.' : 'Noch keine Schüler in dieser Klasse.'}
        </p>
      ) : (
        <ul>
          {students.map((student) => (
            <StudentRow key={student.id} student={student} onDelete={() => onDeleteStudent(student)} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Klassen und Schüler an einem Ort: Übersicht, Suche, Anlegen und Löschen. */
export function SchuelerPage() {
  const classes = useAppStore((state) => state.classes);
  const loadClasses = useAppStore((state) => state.loadClasses);
  const dataVersion = useDataVersion();

  const [stats, setStats] = useState<StudentWithStats[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [query, setQuery] = useState('');
  const [classFilter, setClassFilter] = useState(ALL_CLASSES);

  const [classDialogOpen, setClassDialogOpen] = useState(false);
  const [studentDialog, setStudentDialog] = useState<{ classId: number | null } | null>(null);
  const [studentToDelete, setStudentToDelete] = useState<StudentWithStats | null>(null);
  const [classToDelete, setClassToDelete] = useState<Class | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([invoke<StudentWithStats[]>('get_students_with_stats'), loadClasses()])
      .then(([studentStats]) => {
        if (cancelled) return;
        setStats(studentStats);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        console.error('Schülerliste konnte nicht geladen werden:', error);
        if (!cancelled) setLoadError(errorMessage(error, 'Die Schülerliste konnte nicht geladen werden.'));
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [loadClasses, dataVersion, reloadToken]);

  // Ein gewählter Klassenfilter, dessen Klasse inzwischen gelöscht wurde, fällt zurück auf „Alle“.
  useEffect(() => {
    if (classFilter !== ALL_CLASSES && !classes.some((item) => String(item.id) === classFilter)) {
      setClassFilter(ALL_CLASSES);
    }
  }, [classes, classFilter]);

  const groups = useMemo(() => groupByClass(classes, stats), [classes, stats]);
  const trimmedQuery = query.trim();
  const filtering = trimmedQuery !== '' || classFilter !== ALL_CLASSES;

  const visibleGroups = useMemo(
    () =>
      groups
        .filter((group) => classFilter === ALL_CLASSES || String(group.schoolClass?.id) === classFilter)
        .map((group) => ({ ...group, students: group.students.filter((student) => matchesName(student, trimmedQuery)) }))
        // Bei einer Namenssuche nur Klassen mit Treffern zeigen; beim reinen Klassenfilter auch eine leere Klasse.
        .filter((group) => trimmedQuery === '' || group.students.length > 0),
    [groups, classFilter, trimmedQuery],
  );
  const visibleCount = visibleGroups.reduce((sum, group) => sum + group.students.length, 0);

  const classStudents = (schoolClass: Class | null) =>
    schoolClass ? groups.find((group) => group.schoolClass?.id === schoolClass.id)?.students ?? [] : [];

  const header = (
    <PageHeader
      eyebrow="Klassen und Schüler"
      title="Schüler"
      description="Ein Klick auf einen Namen öffnet die Schülerakte."
      actions={
        loaded && !loadError ? (
          <>
            <Button variant="secondary" icon={<Plus />} onClick={() => setClassDialogOpen(true)}>
              Klasse anlegen
            </Button>
            {classes.length > 0 && (
              <Button icon={<UserPlus />} onClick={() => setStudentDialog({ classId: null })}>
                Schüler anlegen
              </Button>
            )}
          </>
        ) : undefined
      }
    />
  );

  const dialogs = (
    <>
      <ClassDialog open={classDialogOpen} onClose={() => setClassDialogOpen(false)} />
      <StudentDialog
        open={studentDialog !== null}
        initialClassId={studentDialog?.classId ?? null}
        onClose={() => setStudentDialog(null)}
      />
      <DeleteStudentDialog student={studentToDelete} onClose={() => setStudentToDelete(null)} />
      <DeleteClassDialog
        schoolClass={classToDelete}
        students={classStudents(classToDelete)}
        onClose={() => setClassToDelete(null)}
      />
    </>
  );

  if (!loaded) {
    return (
      <div className="page-enter max-w-page space-y-10">
        {header}
        <Spinner showLabel label="Schüler werden geladen …" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="page-enter max-w-page space-y-10">
        {header}
        <div className="space-y-4">
          <p role="alert" className="rounded border border-rotstift/40 bg-rotstift-soft px-4 py-3 text-ui font-medium text-rotstift-dark">
            {loadError}
          </p>
          <Button variant="secondary" onClick={() => setReloadToken((value) => value + 1)}>
            Erneut versuchen
          </Button>
        </div>
      </div>
    );
  }

  if (classes.length === 0) {
    return (
      <div className="page-enter max-w-page space-y-10">
        {header}
        <EmptyState
          title="Noch keine Klasse angelegt"
          action={
            <Button icon={<Plus />} onClick={() => setClassDialogOpen(true)}>
              Erste Klasse anlegen
            </Button>
          }
        >
          Legen Sie zuerst eine Klasse an, zum Beispiel „7b“ mit dem Schuljahr. Danach tragen Sie die Schüler ein.
        </EmptyState>
        {dialogs}
      </div>
    );
  }

  return (
    <div className="page-enter max-w-page space-y-10">
      {header}

      <div role="search" className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-[14rem] flex-1">
          <label htmlFor="schueler-suche" className="sr-only">
            Schüler nach Namen suchen
          </label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
          />
          <Input
            id="schueler-suche"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name suchen …"
            autoComplete="off"
            className="pl-9"
          />
        </div>
        <div className="w-48">
          <label htmlFor="klassen-filter" className="sr-only">
            Klasse
          </label>
          <Select id="klassen-filter" value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
            <option value={ALL_CLASSES}>Alle Klassen</option>
            {[...classes].sort(compareClasses).map((schoolClass) => (
              <option key={schoolClass.id} value={schoolClass.id}>
                {schoolClass.name} ({schoolClass.school_year})
              </option>
            ))}
          </Select>
        </div>
        <p aria-live="polite" className="meta w-full">
          {filtering
            ? `${countLabel(visibleCount, 'Treffer', 'Treffer')} von ${countLabel(stats.length, 'Schüler', 'Schülern')}`
            : `${countLabel(stats.length, 'Schüler', 'Schüler')} in ${countLabel(classes.length, 'Klasse', 'Klassen')}`}
        </p>
      </div>

      {visibleGroups.length === 0 ? (
        <EmptyState
          title="Niemand gefunden"
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setQuery('');
                setClassFilter(ALL_CLASSES);
              }}
            >
              Suche zurücksetzen
            </Button>
          }
        >
          Zu „{trimmedQuery}“ passt kein Schüler{classFilter !== ALL_CLASSES ? ' in der gewählten Klasse' : ''}.
        </EmptyState>
      ) : (
        <div className="space-y-12">
          {visibleGroups.map((group) => (
            <ClassSection
              key={group.schoolClass?.id ?? 'ohne'}
              group={group}
              filtered={filtering}
              onAddStudent={(classId) => setStudentDialog({ classId })}
              onDeleteClass={setClassToDelete}
              onDeleteStudent={setStudentToDelete}
            />
          ))}
        </div>
      )}

      {dialogs}
    </div>
  );
}
