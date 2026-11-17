/**
 * Schlagwörter kommen je nach Backend-Kommando als JSON-Text ('["a","b"]'),
 * als kommagetrennter Text oder bereits als Liste. Ergebnis: bereinigte Liste ohne Duplikate.
 */
export function parseTags(value: string | string[] | null | undefined): string[] {
  if (!value) return [];

  let raw: unknown[] = [];
  if (Array.isArray(value)) {
    raw = value;
  } else {
    const text = value.trim();
    if (!text) return [];
    if (text.startsWith('[')) {
      try {
        const parsed: unknown = JSON.parse(text);
        raw = Array.isArray(parsed) ? parsed : [];
      } catch {
        raw = [];
      }
    } else {
      raw = text.split(',');
    }
  }

  const seen = new Set<string>();
  const tags: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const tag = item.trim();
    const key = tag.toLocaleLowerCase('de');
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}
