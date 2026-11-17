/** Fügt Klassennamen zusammen und lässt leere Werte weg. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
