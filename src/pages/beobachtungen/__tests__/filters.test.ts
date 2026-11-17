import { describe, expect, it } from 'vitest';
import type { ObservationView } from '../../../lib/observations';
import {
  applyFilters,
  clearFilterParams,
  EMPTY_FILTERS,
  groupByDay,
  readFilters,
  readSort,
  readView,
  sortObservations,
  toCsv,
  writeFilters,
  type StudentInfo,
} from '../filters';

const view = (id: number, overrides: Partial<ObservationView> = {}): ObservationView => ({
  id,
  studentId: 1,
  studentName: 'Anna Berg',
  className: '7a',
  category: 'Sozialverhalten',
  text: 'Hilft anderen',
  tags: [],
  createdAt: '2026-11-17T08:00:00',
  updatedAt: null,
  ...overrides,
});

const students = new Map<number, StudentInfo>([
  [1, { classId: 1, firstName: 'Anna', lastName: 'Berg' }],
  [2, { classId: 2, firstName: 'Ben', lastName: 'Adler' }],
]);

describe('URL-Parameter', () => {
  it('liest und schreibt Filter verlustfrei', () => {
    const filters = {
      query: 'Pause',
      classId: 2,
      studentId: 5,
      category: 'Arbeitsverhalten',
      from: '2026-11-01',
      to: '2026-11-30',
    };
    const params = writeFilters(new URLSearchParams('ansicht=tabelle'), filters);
    expect(readFilters(params)).toEqual(filters);
    expect(params.get('ansicht')).toBe('tabelle');
    expect(readFilters(clearFilterParams(params))).toEqual(EMPTY_FILTERS);
    expect(clearFilterParams(params).get('ansicht')).toBe('tabelle');
  });

  it('verwirft ungültige Werte', () => {
    const params = new URLSearchParams('klasse=abc&schueler=-3&von=2026-13-40&ansicht=quatsch&sortierung=x');
    expect(readFilters(params)).toEqual(EMPTY_FILTERS);
    expect(readView(params)).toBe('liste');
    expect(readSort(params)).toEqual({ key: 'datum', direction: 'ab' });
    expect(readSort(new URLSearchParams('sortierung=name'))).toEqual({ key: 'name', direction: 'auf' });
  });
});

describe('applyFilters', () => {
  const data = [
    view(1, { text: 'Streit in der Pause', tags: ['Konflikt'] }),
    view(2, {
      studentId: 2,
      studentName: 'Ben Adler',
      className: '7b',
      category: 'Arbeitsverhalten',
      createdAt: '2026-10-05T10:00:00',
    }),
    view(3, { text: 'Sehr gute Mitarbeit', createdAt: '2026-11-30T23:30:00' }),
  ];

  it('sucht in Text, Schlagwörtern und Namen, ohne Groß-/Kleinschreibung', () => {
    expect(applyFilters(data, { ...EMPTY_FILTERS, query: 'konflikt' }, students).map((o) => o.id)).toEqual([1]);
    expect(applyFilters(data, { ...EMPTY_FILTERS, query: 'adler' }, students).map((o) => o.id)).toEqual([2]);
    expect(applyFilters(data, { ...EMPTY_FILTERS, query: 'pause streit' }, students).map((o) => o.id)).toEqual([1]);
  });

  it('filtert nach Klasse, Schüler und Kategorie', () => {
    expect(applyFilters(data, { ...EMPTY_FILTERS, classId: 2 }, students).map((o) => o.id)).toEqual([2]);
    expect(applyFilters(data, { ...EMPTY_FILTERS, studentId: 1 }, students).map((o) => o.id)).toEqual([1, 3]);
    expect(applyFilters(data, { ...EMPTY_FILTERS, category: 'Arbeitsverhalten' }, students).map((o) => o.id)).toEqual([
      2,
    ]);
  });

  it('schließt beim Zeitraum beide Grenztage ein', () => {
    const result = applyFilters(data, { ...EMPTY_FILTERS, from: '2026-11-17', to: '2026-11-30' }, students);
    expect(result.map((o) => o.id)).toEqual([1, 3]);
  });
});

describe('Sortierung und Gruppierung', () => {
  const data = [
    view(1, { createdAt: '2026-11-16T09:00:00' }),
    view(2, { studentId: 2, studentName: 'Ben Adler', createdAt: '2026-11-17T08:00:00' }),
    view(3, { createdAt: '2026-11-17T12:00:00' }),
  ];

  it('sortiert nach Datum und nach Nachname', () => {
    expect(sortObservations(data, 'datum', 'ab', students).map((o) => o.id)).toEqual([3, 2, 1]);
    expect(sortObservations(data, 'name', 'auf', students).map((o) => o.id)).toEqual([2, 3, 1]);
  });

  it('gruppiert nach Kalendertag', () => {
    const groups = groupByDay(sortObservations(data, 'datum', 'ab', students));
    expect(groups.map((g) => [g.day, g.entries.length])).toEqual([
      ['2026-11-17', 2],
      ['2026-11-16', 1],
    ]);
  });
});

describe('toCsv', () => {
  it('maskiert Anführungszeichen und Formeln', () => {
    const csv = toCsv([view(1, { text: '=SUMME(A1) "zitiert"', tags: ['a', 'b'] })]);
    expect(csv.startsWith('\uFEFF"Datum";')).toBe(true);
    expect(csv).toContain(`"'=SUMME(A1) ""zitiert"""`);
    expect(csv).toContain('"a, b"');
  });
});
