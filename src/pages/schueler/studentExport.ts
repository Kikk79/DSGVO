import { parseTags } from '../../lib/tags';
import { formatDateTime, isoDate } from '../../lib/format';

/**
 * Datenauskunft nach Art. 15 DSGVO.
 *
 * Grundlage ist immer der JSON-Export des Backends (`export_student_data`, Format „json“).
 * Die CSV-Datei wird hier daraus erzeugt, weil das Backend für „csv“ bisher nur einen
 * Platzhaltertext zurückgibt.
 */

export interface StudentExportData {
  student: {
    id: number;
    class_id: number;
    first_name: string;
    last_name: string;
    status: string;
    created_at?: string;
    updated_at?: string;
  };
  observations: Array<{
    id: number;
    student_id: number;
    category: string;
    text: string;
    tags: string | string[];
    created_at: string;
    updated_at?: string;
  }>;
  export_timestamp: string;
  export_reason?: string;
  data_controller?: string;
}

export const STATUS_LABELS: Record<string, string> = {
  active: 'Aktiv',
  inactive: 'Inaktiv',
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

/** Prüft grob, ob der Text vom Backend die erwartete Form hat. */
export function parseStudentExport(json: string): StudentExportData {
  const data: unknown = JSON.parse(json);
  if (
    !data ||
    typeof data !== 'object' ||
    !('student' in data) ||
    !('observations' in data) ||
    !Array.isArray((data as StudentExportData).observations)
  ) {
    throw new Error('Die Auskunft hat ein unerwartetes Format.');
  }
  return data as StudentExportData;
}

/** Ein CSV-Feld; Semikolon als Trenner, damit Excel mit deutscher Einstellung die Spalten erkennt. */
function cell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const CSV_HEADER = [
  'Schüler-Nr.',
  'Vorname',
  'Nachname',
  'Klasse',
  'Status',
  'Beobachtung-Nr.',
  'Erfasst am',
  'Geändert am',
  'Kategorie',
  'Text',
  'Schlagwörter',
  'Auskunft erstellt am',
];

/**
 * Eine Zeile je Beobachtung; ohne Beobachtungen eine Zeile nur mit den Stammdaten.
 * Mit BOM, damit Umlaute in Excel richtig erscheinen.
 */
export function studentExportToCsv(data: StudentExportData, className: string): string {
  const { student } = data;
  const base = [student.id, student.first_name, student.last_name, className, statusLabel(student.status)];
  const exportedAt = formatDateTime(data.export_timestamp);

  const sorted = [...data.observations].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const rows =
    sorted.length > 0
      ? sorted.map((observation) => [
          ...base,
          observation.id,
          formatDateTime(observation.created_at),
          observation.updated_at ? formatDateTime(observation.updated_at) : '',
          observation.category,
          observation.text,
          parseTags(observation.tags).join(', '),
          exportedAt,
        ])
      : [[...base, '', '', '', '', '', '', exportedAt]];

  return '﻿' + [CSV_HEADER, ...rows].map((row) => row.map(cell).join(';')).join('\r\n') + '\r\n';
}

/** „auskunft_mueller_anna_2026-11-17.json“ */
export function exportFileName(firstName: string, lastName: string, extension: 'json' | 'csv'): string {
  const slug = (value: string) =>
    value
      .toLocaleLowerCase('de')
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  const name = [slug(lastName), slug(firstName)].filter(Boolean).join('_') || 'schueler';
  return `auskunft_${name}_${isoDate()}.${extension}`;
}
