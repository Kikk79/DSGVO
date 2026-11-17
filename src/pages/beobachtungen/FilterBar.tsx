import { useEffect, useId, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { Category, Class, Student } from '../../stores/appStore';
import { Field } from '../../components/ui/Field';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import type { ObservationFilters } from './filters';

/** Wartezeit nach dem Tippen, bevor die Suche greift */
const SEARCH_DELAY_MS = 250;

export interface FilterBarProps {
  filters: ObservationFilters;
  onChange: (filters: ObservationFilters) => void;
  classes: Class[];
  students: Student[];
  categories: Category[];
}

/** Suche und Filter über der Beobachtungsliste. */
export function FilterBar({ filters, onChange, classes, students, categories }: FilterBarProps) {
  const searchId = useId();
  const fromId = useId();
  const toId = useId();
  const [draft, setDraft] = useState(filters.query);

  // Von außen geänderte Suche (Zurücksetzen, Zurück-Navigation) ins Feld übernehmen.
  useEffect(() => {
    setDraft(filters.query);
  }, [filters.query]);

  useEffect(() => {
    if (draft === filters.query) return undefined;
    const timer = window.setTimeout(() => onChange({ ...filters, query: draft }), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [draft, filters, onChange]);

  const sortedClasses = useMemo(
    () => [...classes].sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true })),
    [classes],
  );

  const studentOptions = useMemo(
    () =>
      students
        .filter((student) => filters.classId === null || student.class_id === filters.classId)
        .sort((a, b) => a.last_name.localeCompare(b.last_name, 'de') || a.first_name.localeCompare(b.first_name, 'de')),
    [students, filters.classId],
  );

  const classNameById = useMemo(() => new Map(classes.map((c) => [c.id, c.name])), [classes]);

  // Kategorien aus den Einstellungen; eine nicht mehr aktive Kategorie aus der URL bleibt wählbar.
  const categoryNames = useMemo(() => {
    const names = categories.map((category) => category.name);
    if (filters.category && !names.includes(filters.category)) names.push(filters.category);
    return names;
  }, [categories, filters.category]);

  const changeClass = (value: string) => {
    const classId = value ? Number(value) : null;
    const student = students.find((s) => s.id === filters.studentId);
    // Passt der gewählte Schüler nicht mehr zur Klasse, fällt er aus dem Filter.
    const studentId = student && classId !== null && student.class_id !== classId ? null : filters.studentId;
    onChange({ ...filters, classId, studentId });
  };

  return (
    <section aria-label="Suche und Filter" className="space-y-4">
      <div className="relative">
        <label htmlFor={searchId} className="sr-only">
          Beobachtungen durchsuchen
        </label>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
        />
        <Input
          id={searchId}
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onChange({ ...filters, query: draft });
          }}
          placeholder="Text, Schlagwort oder Name suchen"
          className="pl-9"
        />
      </div>

      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <Field label="Klasse" className="min-w-[9rem] flex-1">
          <Select value={filters.classId ?? ''} onChange={(event) => changeClass(event.target.value)}>
            <option value="">Alle Klassen</option>
            {sortedClasses.map((schoolClass) => (
              <option key={schoolClass.id} value={schoolClass.id}>
                {schoolClass.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Schüler" className="min-w-[9rem] flex-1">
          <Select
            value={filters.studentId ?? ''}
            onChange={(event) =>
              onChange({ ...filters, studentId: event.target.value ? Number(event.target.value) : null })
            }
          >
            <option value="">Alle Schüler</option>
            {studentOptions.map((student) => (
              <option key={student.id} value={student.id}>
                {student.last_name}, {student.first_name}
                {filters.classId === null && classNameById.get(student.class_id)
                  ? ` (${classNameById.get(student.class_id)})`
                  : ''}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Kategorie" className="min-w-[9rem] flex-1">
          <Select value={filters.category} onChange={(event) => onChange({ ...filters, category: event.target.value })}>
            <option value="">Alle Kategorien</option>
            {categoryNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        </Field>

        <fieldset className="flex min-w-[19rem] flex-[2] flex-col gap-1.5">
          <legend className="mb-1.5 text-ui font-semibold text-ink">Zeitraum</legend>
          <div className="flex items-center gap-2">
            <label htmlFor={fromId} className="sr-only">
              Von
            </label>
            <Input
              id={fromId}
              type="date"
              value={filters.from}
              max={filters.to || undefined}
              onChange={(event) => onChange({ ...filters, from: event.target.value })}
            />
            <span aria-hidden="true" className="text-ui text-ink-muted">
              bis
            </span>
            <label htmlFor={toId} className="sr-only">
              Bis
            </label>
            <Input
              id={toId}
              type="date"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(event) => onChange({ ...filters, to: event.target.value })}
            />
          </div>
        </fieldset>
      </div>
    </section>
  );
}
