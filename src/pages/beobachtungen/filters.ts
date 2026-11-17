import { isValid, parse, startOfDay } from 'date-fns';
import type { ObservationView } from '../../lib/observations';
import { formatDate, formatTime, isoDate } from '../../lib/format';

/**
 * Filter, Sortierung und Ansicht der Beobachtungsseite. Alles steht in der URL,
 * damit „Zurück“ nach einem Abstecher in die Schülerakte denselben Stand zeigt.
 */

export type ViewMode = 'liste' | 'tabelle' | 'kalender';
export type SortKey = 'datum' | 'name' | 'klasse' | 'kategorie';
export type SortDirection = 'auf' | 'ab';

export interface ObservationFilters {
  /** Freitext: Beobachtungstext, Schlagwörter, Name */
  query: string;
  classId: number | null;
  studentId: number | null;
  category: string;
  /** yyyy-MM-dd, leer = offen */
  from: string;
  /** yyyy-MM-dd, leer = offen (einschließlich) */
  to: string;
}

export const EMPTY_FILTERS: ObservationFilters = {
  query: '',
  classId: null,
  studentId: null,
  category: '',
  from: '',
  to: '',
};

/** Namen der Query-Parameter */
export const PARAM = {
  query: 'suche',
  classId: 'klasse',
  studentId: 'schueler',
  category: 'kategorie',
  from: 'von',
  to: 'bis',
  view: 'ansicht',
  sort: 'sortierung',
  direction: 'richtung',
  month: 'monat',
} as const;

const FILTER_PARAMS = [PARAM.query, PARAM.classId, PARAM.studentId, PARAM.category, PARAM.from, PARAM.to];

const VIEW_MODES: ViewMode[] = ['liste', 'tabelle', 'kalender'];
const SORT_KEYS: SortKey[] = ['datum', 'name', 'klasse', 'kategorie'];

function positiveInt(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return parsed > 0 ? parsed : null;
}

function dayParam(value: string | null): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  return isValid(parse(value, 'yyyy-MM-dd', new Date())) ? value : '';
}

export function readFilters(params: URLSearchParams): ObservationFilters {
  return {
    query: params.get(PARAM.query) ?? '',
    classId: positiveInt(params.get(PARAM.classId)),
    studentId: positiveInt(params.get(PARAM.studentId)),
    category: params.get(PARAM.category) ?? '',
    from: dayParam(params.get(PARAM.from)),
    to: dayParam(params.get(PARAM.to)),
  };
}

export function readView(params: URLSearchParams): ViewMode {
  const value = params.get(PARAM.view) as ViewMode | null;
  return value && VIEW_MODES.includes(value) ? value : 'liste';
}

export function readSort(params: URLSearchParams): { key: SortKey; direction: SortDirection } {
  const key = params.get(PARAM.sort) as SortKey | null;
  const direction = params.get(PARAM.direction);
  const validKey = key && SORT_KEYS.includes(key) ? key : 'datum';
  return {
    key: validKey,
    // Datum startet absteigend (neueste zuerst), Texte aufsteigend (A–Z).
    direction: direction === 'auf' || direction === 'ab' ? direction : validKey === 'datum' ? 'ab' : 'auf',
  };
}

/** Monat der Kalenderansicht (erster Tag), aus „yyyy-MM“. */
export function readMonth(params: URLSearchParams): Date | null {
  const value = params.get(PARAM.month);
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return null;
  const date = parse(value, 'yyyy-MM', new Date());
  return isValid(date) ? date : null;
}

/** Schreibt die Filter in eine Kopie der Parameter; leere Werte verschwinden aus der URL. */
export function writeFilters(params: URLSearchParams, filters: ObservationFilters): URLSearchParams {
  const next = new URLSearchParams(params);
  const values: Record<string, string> = {
    [PARAM.query]: filters.query.trim() ? filters.query : '',
    [PARAM.classId]: filters.classId ? String(filters.classId) : '',
    [PARAM.studentId]: filters.studentId ? String(filters.studentId) : '',
    [PARAM.category]: filters.category,
    [PARAM.from]: filters.from,
    [PARAM.to]: filters.to,
  };
  for (const [key, value] of Object.entries(values)) {
    if (value) next.set(key, value);
    else next.delete(key);
  }
  return next;
}

export function clearFilterParams(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of FILTER_PARAMS) next.delete(key);
  return next;
}

export function hasActiveFilters(filters: ObservationFilters): boolean {
  return (
    filters.query.trim() !== '' ||
    filters.classId !== null ||
    filters.studentId !== null ||
    filters.category !== '' ||
    filters.from !== '' ||
    filters.to !== ''
  );
}

/** Zusatzwissen pro Beobachtung, das nicht in ObservationView steht. */
export interface StudentInfo {
  classId: number;
  firstName: string;
  lastName: string;
}

const normalize = (value: string) => value.toLocaleLowerCase('de').normalize('NFC');

/** Lokaler Kalendertag eines Zeitstempels als yyyy-MM-dd (für den Zeitraumfilter). */
export function localDay(timestamp: string): string {
  return isoDate(startOfDay(new Date(timestamp)));
}

export function applyFilters(
  observations: ObservationView[],
  filters: ObservationFilters,
  students: Map<number, StudentInfo>,
): ObservationView[] {
  const words = normalize(filters.query).split(/\s+/).filter(Boolean);
  return observations.filter((observation) => {
    if (filters.studentId !== null && observation.studentId !== filters.studentId) return false;
    if (filters.classId !== null && students.get(observation.studentId)?.classId !== filters.classId) return false;
    if (filters.category && observation.category !== filters.category) return false;
    if (filters.from || filters.to) {
      const day = localDay(observation.createdAt);
      if (filters.from && day < filters.from) return false;
      if (filters.to && day > filters.to) return false;
    }
    if (words.length > 0) {
      const haystack = normalize(
        [observation.text, observation.studentName, observation.category, ...observation.tags].join(' '),
      );
      if (!words.every((word) => haystack.includes(word))) return false;
    }
    return true;
  });
}

const byTime = (a: ObservationView, b: ObservationView) =>
  new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();

export function sortObservations(
  observations: ObservationView[],
  key: SortKey,
  direction: SortDirection,
  students: Map<number, StudentInfo>,
): ObservationView[] {
  const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });
  const nameOf = (observation: ObservationView) => {
    const student = students.get(observation.studentId);
    return student ? `${student.lastName} ${student.firstName}` : observation.studentName;
  };
  const compare = (a: ObservationView, b: ObservationView): number => {
    switch (key) {
      case 'name':
        return collator.compare(nameOf(a), nameOf(b));
      case 'klasse':
        return collator.compare(a.className ?? '', b.className ?? '');
      case 'kategorie':
        return collator.compare(a.category, b.category);
      default:
        return byTime(a, b);
    }
  };
  const factor = direction === 'auf' ? 1 : -1;
  // Bei Gleichstand gilt: neueste zuerst.
  return [...observations].sort((a, b) => factor * compare(a, b) || -byTime(a, b));
}

export interface DayGroup {
  day: string;
  entries: ObservationView[];
}

/** Gruppiert (bereits absteigend sortierte) Einträge nach lokalem Kalendertag. */
export function groupByDay(observations: ObservationView[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const observation of observations) {
    const day = localDay(observation.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.entries.push(observation);
    else groups.push({ day, entries: [observation] });
  }
  return groups;
}

function csvCell(value: string): string {
  // Zellen, die mit =, +, -, @ beginnen, würden Tabellenprogramme als Formel lesen.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/**
 * CSV für Excel (deutsche Einstellungen): Semikolon als Trenner, UTF-8 mit BOM,
 * damit Umlaute richtig erscheinen.
 */
export function toCsv(observations: ObservationView[]): string {
  const header = ['Datum', 'Uhrzeit', 'Schüler', 'Klasse', 'Kategorie', 'Beobachtung', 'Schlagwörter'];
  const rows = observations.map((observation) => [
    formatDate(observation.createdAt),
    formatTime(observation.createdAt),
    observation.studentName,
    observation.className ?? '',
    observation.category,
    observation.text,
    observation.tags.join(', '),
  ]);
  return `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n')}\r\n`;
}
