import type {
  AssessmentRecord,
  CalendarObservation,
  Category,
  Class,
  Observation,
  Student,
} from '../stores/appStore';
import { parseTags } from './tags';

/** Farben einer Kategorie, so wie sie in den Einstellungen festgelegt wurden. */
export interface CategoryColors {
  color: string;
  background: string;
  text: string;
}

/**
 * Einheitliche Sicht auf eine Beobachtung, unabhängig davon, aus welchem
 * Backend-Kommando sie stammt. Alle gemeinsamen Komponenten arbeiten damit.
 */
export interface ObservationView {
  id: number;
  studentId: number;
  /** „Vorname Nachname“ */
  studentName: string;
  className: string | null;
  category: string;
  /** Fehlt, wenn die Quelle keine Farben liefert; CategoryBadge schlägt dann im Store nach. */
  categoryColors?: CategoryColors;
  text: string;
  tags: string[];
  /** ISO-Zeitstempel */
  createdAt: string;
  /** ISO-Zeitstempel; null, wenn die Quelle ihn nicht liefert (Kalender). */
  updatedAt: string | null;
}

export const UNKNOWN_STUDENT = 'Unbekannter Schüler';

export function colorsOfCategory(category: Category): CategoryColors {
  return {
    color: category.color,
    background: category.background_color,
    text: category.text_color,
  };
}

interface Lookup {
  students: Student[];
  classes: Class[];
  categories: Category[];
}

/** Aus `search_observations` / dem Store (`observations`). Namen kommen aus dem Store. */
export function fromObservation(observation: Observation, lookup: Lookup): ObservationView {
  const student = lookup.students.find((s) => s.id === observation.student_id);
  const schoolClass = student ? lookup.classes.find((c) => c.id === student.class_id) : undefined;
  const category = lookup.categories.find((c) => c.name === observation.category);
  return {
    id: observation.id,
    studentId: observation.student_id,
    studentName: student ? `${student.first_name} ${student.last_name}` : UNKNOWN_STUDENT,
    className: schoolClass?.name ?? null,
    category: observation.category,
    categoryColors: category ? colorsOfCategory(category) : undefined,
    text: observation.text,
    tags: parseTags(observation.tags),
    createdAt: observation.created_at,
    updatedAt: observation.updated_at ?? null,
  };
}

/** Aus `get_assessments_comprehensive`. */
export function fromAssessmentRecord(record: AssessmentRecord): ObservationView {
  return {
    id: record.observation_id,
    studentId: record.student_id,
    studentName: `${record.student_first_name} ${record.student_last_name}`.trim() || UNKNOWN_STUDENT,
    className: record.class_name || null,
    category: record.category,
    categoryColors: {
      color: record.category_color,
      background: record.category_background_color,
      text: record.category_text_color,
    },
    text: record.text,
    tags: parseTags(record.tags),
    createdAt: record.observation_created_at,
    updatedAt: record.observation_updated_at ?? null,
  };
}

/** Aus `get_calendar_observations`. */
export function fromCalendarObservation(observation: CalendarObservation): ObservationView {
  return {
    id: observation.id,
    studentId: observation.student_id,
    studentName:
      `${observation.student_first_name} ${observation.student_last_name}`.trim() || UNKNOWN_STUDENT,
    className: observation.class_name || null,
    category: observation.category,
    categoryColors: {
      color: observation.category_color,
      background: observation.category_background_color,
      text: observation.category_text_color,
    },
    text: observation.text,
    tags: parseTags(observation.tags),
    createdAt: observation.created_at,
    updatedAt: null,
  };
}

/** Wurde der Eintrag nach dem Anlegen geändert? (Toleranz: 1 Sekunde) */
export function isEdited(observation: Pick<ObservationView, 'createdAt' | 'updatedAt'>): boolean {
  if (!observation.updatedAt) return false;
  const created = new Date(observation.createdAt).getTime();
  const updated = new Date(observation.updatedAt).getTime();
  return Number.isFinite(created) && Number.isFinite(updated) && updated - created > 1000;
}
