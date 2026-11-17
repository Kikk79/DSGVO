import { describe, expect, it, vi } from 'vitest';
import { exportFileName, parseStudentExport, studentExportToCsv, type StudentExportData } from '../studentExport';

vi.mock('date-fns/locale', async () => vi.importActual('date-fns/locale'));

const base: StudentExportData = {
  student: { id: 7, class_id: 1, first_name: 'Jörg', last_name: 'Groß-Übel', status: 'active' },
  observations: [],
  export_timestamp: '2026-11-17T12:00:00Z',
};

describe('studentExport', () => {
  it('erzeugt ohne Beobachtungen eine Zeile mit Stammdaten', () => {
    const lines = studentExportToCsv(base, '7b').replace('﻿', '').trim().split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[1].startsWith('7;Jörg;Groß-Übel;7b;Aktiv;')).toBe(true);
  });

  it('sortiert Beobachtungen aufsteigend und maskiert Sonderzeichen', () => {
    const csv = studentExportToCsv(
      {
        ...base,
        observations: [
          { id: 2, student_id: 7, category: 'Mitarbeit', text: 'Zeile 1\nZeile 2', tags: '["a","b"]', created_at: '2026-11-02T08:00:00Z' },
          { id: 1, student_id: 7, category: 'Leistung', text: 'Sagt "Hallo"', tags: ['x'], created_at: '2026-11-01T08:00:00Z' },
        ],
      },
      '7b',
    );
    expect(csv.startsWith('﻿')).toBe(true);
    const body = csv.slice(1);
    expect(body.indexOf('"Sagt ""Hallo"""')).toBeLessThan(body.indexOf('"Zeile 1\nZeile 2"'));
    expect(body).toContain(';a, b;');
  });

  it('bildet sichere Dateinamen', () => {
    expect(exportFileName('Jörg', 'Groß-Übel', 'json')).toMatch(/^auskunft_gross-uebel_joerg_\d{4}-\d{2}-\d{2}\.json$/);
    expect(exportFileName('', '', 'csv')).toMatch(/^auskunft_schueler_/);
  });

  it('lehnt unerwartete Exporte ab', () => {
    expect(() => parseStudentExport('"CSV data"')).toThrow();
    expect(parseStudentExport(JSON.stringify(base)).student.id).toBe(7);
  });
});
