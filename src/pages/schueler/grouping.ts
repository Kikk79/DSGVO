import type { Class, StudentWithStats } from '../../stores/appStore';

/** Klassen nach Schuljahr (neuestes zuerst), dann natürlich nach Namen („5a“ vor „10b“). */
export function compareClasses(a: Class, b: Class): number {
  const byYear = b.school_year.localeCompare(a.school_year, 'de');
  if (byYear !== 0) return byYear;
  return a.name.localeCompare(b.name, 'de', { numeric: true, sensitivity: 'base' });
}

export function compareStudents(a: StudentWithStats, b: StudentWithStats): number {
  return (
    a.last_name.localeCompare(b.last_name, 'de', { sensitivity: 'base' }) ||
    a.first_name.localeCompare(b.first_name, 'de', { sensitivity: 'base' })
  );
}

/** Findet „anna“, „Müller“, „anna mü“ und „Müller, Anna“. */
export function matchesName(student: Pick<StudentWithStats, 'first_name' | 'last_name'>, query: string): boolean {
  const words = query
    .toLocaleLowerCase('de')
    .split(/[\s,]+/)
    .filter(Boolean);
  if (words.length === 0) return true;
  const name = `${student.first_name} ${student.last_name}`.toLocaleLowerCase('de');
  return words.every((word) => name.includes(word));
}

export interface ClassGroup {
  /** null = Schüler, deren Klasse nicht (mehr) existiert */
  schoolClass: Class | null;
  students: StudentWithStats[];
}

/**
 * Ordnet Schüler ihren Klassen zu. Klassen ohne Schüler erscheinen ebenfalls,
 * Schüler ohne gültige Klasse landen in einer eigenen Gruppe am Ende.
 */
export function groupByClass(classes: Class[], students: StudentWithStats[]): ClassGroup[] {
  const byClass = new Map<number, StudentWithStats[]>();
  const orphans: StudentWithStats[] = [];
  const known = new Set(classes.map((item) => item.id));
  for (const student of students) {
    if (!known.has(student.class_id)) {
      orphans.push(student);
      continue;
    }
    const list = byClass.get(student.class_id) ?? [];
    list.push(student);
    byClass.set(student.class_id, list);
  }
  const groups: ClassGroup[] = [...classes].sort(compareClasses).map((schoolClass) => ({
    schoolClass,
    students: (byClass.get(schoolClass.id) ?? []).sort(compareStudents),
  }));
  if (orphans.length > 0) groups.push({ schoolClass: null, students: orphans.sort(compareStudents) });
  return groups;
}
