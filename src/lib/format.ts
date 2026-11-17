import {
  differenceInCalendarDays,
  format,
  getISOWeek,
  isToday,
  isValid,
  isYesterday,
} from 'date-fns';
import { de } from 'date-fns/locale';

/** Alle Datums- und Zeitangaben der Oberfläche laufen über dieses Modul (Locale: de). */

export type DateInput = string | number | Date;

export function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value);
}

function fmt(value: DateInput, pattern: string): string {
  const date = toDate(value);
  return isValid(date) ? format(date, pattern, { locale: de }) : '';
}

/** 17.11.2026 */
export const formatDate = (value: DateInput) => fmt(value, 'dd.MM.yyyy');

/** 08:15 */
export const formatTime = (value: DateInput) => fmt(value, 'HH:mm');

/** 17.11.2026, 08:15 */
export const formatDateTime = (value: DateInput) => fmt(value, "dd.MM.yyyy, HH:mm");

/** Dienstag, 17. November 2026 */
export const formatDateLong = (value: DateInput) => fmt(value, 'EEEE, d. MMMM yyyy');

/** Dienstag */
export const formatWeekday = (value: DateInput) => fmt(value, 'EEEE');

/** 17. November 2026 */
export const formatDayMonthYear = (value: DateInput) => fmt(value, 'd. MMMM yyyy');

/** November 2026 */
export const formatMonthYear = (value: DateInput) => fmt(value, 'MMMM yyyy');

/** Mo., 16.11. (kurze Angabe für Randspalten und Listen) */
export const formatDayShort = (value: DateInput) => fmt(value, 'EEEEEE, dd.MM.');

/** 2026-11-17 (für Dateinamen und Datumsfelder) */
export const isoDate = (value: DateInput = new Date()) => fmt(value, 'yyyy-MM-dd');

/** Kalenderwoche nach ISO 8601 */
export function calendarWeek(value: DateInput = new Date()): number {
  return getISOWeek(toDate(value));
}

/** „Heute“, „Gestern“ oder „Mo., 16.11.“ */
export function formatDayLabel(value: DateInput): string {
  const date = toDate(value);
  if (!isValid(date)) return '';
  if (isToday(date)) return 'Heute';
  if (isYesterday(date)) return 'Gestern';
  return formatDayShort(date);
}

/** „heute, 08:12“, „gestern, 16:40“ oder „14.11., 16:40“ */
export function formatRecent(value: DateInput): string {
  const date = toDate(value);
  if (!isValid(date)) return '';
  if (isToday(date)) return `heute, ${formatTime(date)}`;
  if (isYesterday(date)) return `gestern, ${formatTime(date)}`;
  return fmt(date, 'dd.MM., HH:mm');
}

/** Ganze Kalendertage seit dem Datum (heute = 0). */
export function daysSince(value: DateInput, now: Date = new Date()): number {
  return differenceInCalendarDays(now, toDate(value));
}

/** „heute“, „gestern“, „vor 12 Tagen“ */
export function formatDaysAgo(value: DateInput, now: Date = new Date()): string {
  const days = daysSince(value, now);
  if (days <= 0) return 'heute';
  if (days === 1) return 'gestern';
  return `vor ${days} Tagen`;
}

/**
 * Laufendes Schuljahr im Format „2026/27“. Das Schuljahr beginnt am 1. August.
 */
export function currentSchoolYear(today: Date = new Date()): string {
  const startYear = today.getMonth() >= 7 ? today.getFullYear() : today.getFullYear() - 1;
  const endYear = String((startYear + 1) % 100).padStart(2, '0');
  return `${startYear}/${endYear}`;
}
