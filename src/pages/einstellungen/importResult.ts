/** Ergebnistexte der Import-Befehle des Backends auswerten. */

/**
 * Ergebnistext des Backends beim Einlesen („Daten eingelesen: 3 neu, 1 aktualisiert, 0 gelöscht
 * (2 Beobachtungen übersprungen: …)“) in seine Zahlen zerlegen.
 */
export function parseImportResult(
  result: string,
): { inserted: number; updated: number; deleted: number; skipped: number } | null {
  const match = /(\d+) neu, (\d+) aktualisiert, (\d+) gelöscht/.exec(result);
  if (!match) return null;
  const skipped = /(\d+) Beobachtungen? übersprungen/.exec(result);
  return {
    inserted: Number(match[1]),
    updated: Number(match[2]),
    deleted: Number(match[3]),
    skipped: skipped ? Number(skipped[1]) : 0,
  };
}

/** Erfolgsmeldung nach dem Einlesen einer Änderungsdatei. */
export function importMessage(result: string): string {
  const counts = parseImportResult(result);
  if (!counts) return 'Änderungsdatei eingelesen.';
  const parts = [
    counts.inserted > 0 ? `${counts.inserted} neu` : null,
    counts.updated > 0 ? `${counts.updated} aktualisiert` : null,
    counts.deleted > 0 ? `${counts.deleted} gelöscht` : null,
  ].filter(Boolean);
  const skipped =
    counts.skipped > 0
      ? ` ${counts.skipped} ${counts.skipped === 1 ? 'Beobachtung wurde' : 'Beobachtungen wurden'} übersprungen, weil der Schüler fehlt.`
      : '';
  return parts.length
    ? `Änderungsdatei eingelesen: ${parts.join(', ')}.${skipped}`
    : `Änderungsdatei eingelesen. Es gab nichts Neues.${skipped}`;
}
