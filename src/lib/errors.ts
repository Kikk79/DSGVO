/**
 * Übersetzt Fehler aus dem Backend (englische Texte, beliebige Typen) in eine
 * deutsche Meldung für die Oberfläche.
 */

const KNOWN_MESSAGES: Array<[RegExp, string]> = [
  [
    /permission denied|only delete your own/i,
    'Der Eintrag ist einem anderen Autor zugeordnet und lässt sich deshalb nicht auf dem normalen Weg löschen.',
  ],
  [
    /cannot delete class with active students/i,
    'Die Klasse enthält noch aktive Schüler.',
  ],
  [/text must not be empty/i, 'Der Text der Beobachtung darf nicht leer sein.'],
  [/category must not be empty/i, 'Bitte wählen Sie eine Kategorie aus.'],
  [/unique constraint|already exists/i, 'Ein Eintrag mit diesem Namen ist bereits vorhanden.'],
  [/foreign key constraint/i, 'Der Eintrag wird noch von anderen Daten verwendet.'],
  [/not found|no rows/i, 'Der Eintrag wurde nicht gefunden. Möglicherweise wurde er bereits gelöscht.'],
  [/directory does not exist/i, 'Der angegebene Ordner ist nicht vorhanden.'],
  [/invalid path/i, 'Der angegebene Pfad ist ungültig.'],
  [/unsupported export format/i, 'Dieses Exportformat wird nicht unterstützt.'],
  [/database is locked/i, 'Die Datenbank ist gerade belegt. Bitte versuchen Sie es erneut.'],
  [/network|connection|timed? ?out|dns/i, 'Die Verbindung ist fehlgeschlagen. Bitte prüfen Sie Adresse und Netzwerk.'],
  [/401|unauthori[sz]ed|403|forbidden/i, 'Die Anmeldung wurde abgelehnt. Bitte prüfen Sie Benutzername und Passwort.'],
];

/** Rohtext eines unbekannten Fehlers (Error, String, Objekt mit message). */
export function rawErrorText(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return '';
}

/**
 * Deutsche Fehlermeldung. Bekannte Backend-Texte werden übersetzt; sonst erscheint
 * `fallback`, ergänzt um den Originaltext, damit nichts verloren geht.
 */
export function errorMessage(
  error: unknown,
  fallback: string = 'Der Vorgang ist fehlgeschlagen.',
): string {
  const raw = rawErrorText(error).trim();
  if (!raw) return fallback;
  for (const [pattern, message] of KNOWN_MESSAGES) {
    if (pattern.test(raw)) return message;
  }
  return `${fallback} (${raw})`;
}
