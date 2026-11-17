import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { ArrowLeft, Download, Plus, Trash2 } from 'lucide-react';
import { useAppStore, type Observation, type Student, type StudentWithStats } from '../../stores/appStore';
import { useDataVersion } from '../../stores/uiStore';
import { fromObservation, type ObservationView } from '../../lib/observations';
import { formatDate, formatDaysAgo, formatMonthYear } from '../../lib/format';
import { errorMessage } from '../../lib/errors';
import { cx } from '../../lib/cx';
import { downloadText, MIME_CSV, MIME_JSON } from '../../lib/download';
import { Button } from '../../components/ui/Button';
import { buttonClasses } from '../../components/ui/buttonStyles';
import { CategoryBadge } from '../../components/ui/CategoryBadge';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/toastContext';
import { ObservationEntry } from '../../components/observations/ObservationEntry';
import { useObservationEditor } from '../../components/observations/editorContext';
import { DeleteStudentDialog } from './DeleteStudentDialog';
import { exportFileName, parseStudentExport, statusLabel, studentExportToCsv } from './studentExport';

type ExportFormat = 'json' | 'csv';

function Figure({ value, label, size = 'large' }: { value: ReactNode; label: string; size?: 'large' | 'date' }) {
  return (
    <div className="flex min-w-0 flex-col-reverse justify-end py-5 pr-5 [&:not(:first-child)]:border-l [&:not(:first-child)]:border-line [&:not(:first-child)]:pl-5">
      <dt className="meta mt-2">{label}</dt>
      <dd
        className={cx(
          'font-display tabular-nums text-ink',
          size === 'large' ? 'text-heading font-[400]' : 'pt-1.5 text-title font-[440]',
        )}
      >
        {value}
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

/** Einträge nach Monat gruppieren (Liste ist bereits absteigend sortiert). */
function groupByMonth(entries: ObservationView[]): Array<{ month: string; entries: ObservationView[] }> {
  const groups: Array<{ month: string; entries: ObservationView[] }> = [];
  for (const entry of entries) {
    const month = formatMonthYear(entry.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.month === month) last.entries.push(entry);
    else groups.push({ month, entries: [entry] });
  }
  return groups;
}

/** Schülerakte: Stammdaten, Übersicht, alle Beobachtungen und Datenauskunft. */
export function SchuelerAktePage() {
  const params = useParams();
  const navigate = useNavigate();
  const studentId = /^\d+$/.test(params.id ?? '') ? Number(params.id) : null;

  const classes = useAppStore((state) => state.classes);
  const categories = useAppStore((state) => state.categories);
  const loadClasses = useAppStore((state) => state.loadClasses);
  const loadStudents = useAppStore((state) => state.loadStudents);
  const exportStudentData = useAppStore((state) => state.exportStudentData);
  const dataVersion = useDataVersion();
  const { openCreate } = useObservationEditor();
  const toast = useToast();

  const [student, setStudent] = useState<StudentWithStats | null>(null);
  const [rawObservations, setRawObservations] = useState<Observation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (studentId === null) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    Promise.all([
      invoke<StudentWithStats[]>('get_students_with_stats'),
      invoke<Observation[]>('search_observations', { query: null, studentId, category: null }),
      loadClasses(),
      // Der Beobachtungsdialog wählt den Schüler aus der Store-Liste vor; die muss aktuell sein.
      loadStudents(),
    ])
      .then(([allStudents, observations]) => {
        if (cancelled) return;
        setStudent(allStudents.find((item) => item.id === studentId) ?? null);
        setRawObservations(observations.filter((item) => item.student_id === studentId));
        setLoadError(null);
      })
      .catch((error: unknown) => {
        console.error('Schülerakte konnte nicht geladen werden:', error);
        if (!cancelled) setLoadError(errorMessage(error, 'Die Schülerakte konnte nicht geladen werden.'));
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [studentId, loadClasses, loadStudents, dataVersion, reloadToken]);

  const schoolClass = student ? classes.find((item) => item.id === student.class_id) : undefined;

  const entries = useMemo(() => {
    if (!student) return [];
    const asStudent: Student = {
      id: student.id,
      class_id: student.class_id,
      first_name: student.first_name,
      last_name: student.last_name,
      status: student.status,
    };
    return rawObservations
      .map((observation) => fromObservation(observation, { students: [asStudent], classes, categories }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [rawObservations, student, classes, categories]);

  const byCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de'));
  }, [entries]);

  const months = useMemo(() => groupByMonth(entries), [entries]);

  const back = { to: '/schueler', label: 'Alle Schüler' };

  if (!loaded) {
    return (
      <div className="page-enter max-w-page space-y-10">
        <PageHeader back={back} eyebrow="Schülerakte" title="Schülerakte" />
        <Spinner showLabel label="Schülerakte wird geladen …" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="page-enter max-w-page space-y-10">
        <PageHeader back={back} eyebrow="Schülerakte" title="Schülerakte" />
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

  if (!student) {
    return (
      <div className="page-enter max-w-page space-y-10">
        <PageHeader back={back} eyebrow="Schülerakte" title="Schüler nicht gefunden" />
        <EmptyState
          title="Diese Schülerakte gibt es nicht"
          action={
            <Link to="/schueler" className={buttonClasses('secondary')}>
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              Zur Schülerliste
            </Link>
          }
        >
          Der Schüler wurde vielleicht gelöscht oder der Link ist nicht mehr gültig. In der Schülerliste finden Sie alle
          vorhandenen Schüler.
        </EmptyState>
      </div>
    );
  }

  const name = `${student.first_name} ${student.last_name}`;
  const inactive = student.status !== 'active';
  const first = entries[entries.length - 1];
  const latest = entries[0];

  const runExport = async (format: ExportFormat) => {
    setExporting(format);
    try {
      // Grundlage ist immer der JSON-Export; die CSV-Datei wird daraus erzeugt.
      const json = await exportStudentData(student.id, 'json');
      const data = parseStudentExport(json);
      const filename = exportFileName(student.first_name, student.last_name, format);
      if (format === 'json') downloadText(filename, json, MIME_JSON);
      else downloadText(filename, studentExportToCsv(data, student.class_name), MIME_CSV);
      toast.success(`Auskunft gespeichert: ${filename}`);
    } catch (error) {
      console.error('Datenauskunft fehlgeschlagen:', error);
      toast.error(errorMessage(error, 'Die Datenauskunft konnte nicht erstellt werden.'));
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="page-enter max-w-page space-y-10">
      <PageHeader
        back={back}
        eyebrow={
          <>
            Schülerakte · Klasse {student.class_name || 'unbekannt'}
            {schoolClass && <> · {schoolClass.school_year}</>}
          </>
        }
        title={name}
        description={
          inactive ? (
            <>
              Status: <strong className="font-semibold text-ink">{statusLabel(student.status)}</strong>. Der Schüler
              erscheint nicht unter „Länger ohne Eintrag“.
            </>
          ) : undefined
        }
        actions={
          <Button icon={<Plus />} onClick={() => openCreate({ studentId: student.id })}>
            Beobachtung zu diesem Schüler
          </Button>
        }
      />

      <dl className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)] border-y border-line">
        <Figure value={entries.length} label={entries.length === 1 ? 'Beobachtung' : 'Beobachtungen'} />
        <Figure
          size="date"
          value={latest ? formatDate(latest.createdAt) : '–'}
          label={latest ? `Letzter Eintrag · ${formatDaysAgo(latest.createdAt)}` : 'Letzter Eintrag'}
        />
        <Figure size="date" value={first ? formatDate(first.createdAt) : '–'} label="Erster Eintrag" />
      </dl>

      {byCategory.length > 0 && (
        <section aria-labelledby="akte-kategorien">
          <SectionHead id="akte-kategorien" title="Nach Kategorie" />
          <ul className="flex flex-wrap gap-x-6 gap-y-3 py-4">
            {byCategory.map(([category, count]) => (
              <li key={category} className="flex items-center gap-2">
                <CategoryBadge name={category} />
                <span className="font-display text-name font-[480] tabular-nums text-ink">{count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="akte-eintraege">
        <SectionHead id="akte-eintraege" title="Alle Beobachtungen">
          {entries.length > 0 && <span className="meta">neueste zuerst</span>}
        </SectionHead>
        {entries.length === 0 ? (
          <EmptyState
            title="Noch keine Beobachtungen"
            className="border-t-0"
            action={
              <Button icon={<Plus />} onClick={() => openCreate({ studentId: student.id })}>
                Erste Beobachtung erfassen
              </Button>
            }
          >
            Zu {name} ist noch nichts eingetragen. Neue Beobachtungen erscheinen hier mit Datum und Uhrzeit.
          </EmptyState>
        ) : (
          <div className="space-y-8 pt-6">
            {months.map((group) => (
              <div key={group.month}>
                <h3 className="meta mb-2 pl-margin text-ink">
                  {group.month} · {group.entries.length === 1 ? '1 Eintrag' : `${group.entries.length} Einträge`}
                </h3>
                <ul className="entry-list">
                  {group.entries.map((entry) => (
                    <ObservationEntry key={entry.id} observation={entry} margin="date" showStudent={false} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="akte-datenschutz">
        <SectionHead id="akte-datenschutz" title="Datenschutz" />
        <div className="grid gap-8 py-6 min-[1100px]:grid-cols-2">
          <div className="space-y-3">
            <h3 className="text-ui font-semibold text-ink">Datenauskunft (Art. 15 DSGVO)</h3>
            <p className="max-w-measure text-ui text-ink-muted">
              Erstellt eine Datei mit allem, was diese App zu {name} speichert: Name, Klasse, Status und sämtliche
              Beobachtungen. JSON enthält die vollständigen Rohdaten, CSV lässt sich mit Excel öffnen.
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <Button
                variant="secondary"
                icon={<Download />}
                loading={exporting === 'json'}
                disabled={exporting !== null}
                onClick={() => void runExport('json')}
              >
                Als JSON speichern
              </Button>
              <Button
                variant="secondary"
                icon={<Download />}
                loading={exporting === 'csv'}
                disabled={exporting !== null}
                onClick={() => void runExport('csv')}
              >
                Als CSV speichern
              </Button>
            </div>
          </div>
          <div className="space-y-3">
            <h3 className="text-ui font-semibold text-ink">Löschen (Art. 17 DSGVO)</h3>
            <p className="max-w-measure text-ui text-ink-muted">
              Entfernt {name} aus der Liste oder löscht den Schüler mit allen Beobachtungen endgültig. Sie wählen im
              nächsten Schritt.
            </p>
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                className="inline-flex h-10 items-center gap-2 rounded border border-rotstift/50 px-4 text-ui font-semibold text-rotstift-dark transition-colors hover:border-rotstift hover:bg-rotstift-soft"
              >
                <Trash2 aria-hidden="true" className="h-4 w-4" />
                Schüler löschen …
              </button>
            </div>
          </div>
        </div>
      </section>

      <DeleteStudentDialog
        student={deleteOpen ? { ...student, observation_count: entries.length } : null}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => navigate('/schueler')}
      />
    </div>
  );
}
