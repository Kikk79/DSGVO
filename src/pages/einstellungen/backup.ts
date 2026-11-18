/** Sicherungsdateien aus export_all_data erkennen und zusammenfassen. */

export interface BackupSummary {
  fileName: string;
  content: string;
  timestamp: string | null;
  deviceName: string | null;
  students: number | null;
  classes: number | null;
  observations: number | null;
  categories: number | null;
}

export const plural = (count: number | null, one: string, many: string) =>
  count === null ? null : `${count} ${count === 1 ? one : many}`;

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null;

/** Zählt Datensätze ohne Löschvermerk (gelöschte Einträge gehören nicht in die Übersicht). */
const countLive = (value: unknown): number | null =>
  Array.isArray(value) ? value.filter((row) => !(isObject(row) && row.deleted_at)).length : null;

/** Sicherung im aktuellen Format: `{"checksum", "data": {format: "snapshot_v2", rows: {...}}}`. */
function readSnapshot(fileName: string, content: string, parsed: JsonObject): BackupSummary | null {
  const data = parsed.data;
  if (!isObject(data) || data.format !== 'snapshot_v2' || !isObject(data.rows)) return null;
  const rows = data.rows;
  return {
    fileName,
    content,
    timestamp: typeof data.generated_at === 'string' ? data.generated_at : null,
    deviceName: typeof data.device_name === 'string' ? data.device_name : null,
    students: countLive(rows.students),
    classes: countLive(rows.classes),
    observations: countLive(rows.observations),
    categories: countLive(rows.categories),
  };
}

/** Alte Sicherung (`full_export`, vor Sync v2). */
function readFullExport(fileName: string, content: string, parsed: JsonObject): BackupSummary | null {
  if (parsed.format !== 'full_export' || !isObject(parsed.data)) return null;
  const num = (value: unknown) => (typeof value === 'number' ? value : null);
  const scope = isObject(parsed.export_scope) ? parsed.export_scope : {};
  const device = isObject(parsed.source_device) ? parsed.source_device : {};
  return {
    fileName,
    content,
    timestamp: typeof parsed.timestamp === 'string' ? parsed.timestamp : null,
    deviceName: typeof device.device_name === 'string' ? device.device_name : null,
    students: num(scope.total_students),
    classes: num(scope.total_classes),
    observations: num(scope.total_observations),
    categories: num(scope.total_categories),
  };
}

/**
 * Prüft, ob der Text eine Sicherung aus export_all_data ist (aktuelles Format `snapshot_v2`
 * oder alte `full_export`-Datei), und liest die Eckdaten.
 */
export function readBackup(fileName: string, content: string): BackupSummary | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (!isObject(parsed)) return null;
  return readSnapshot(fileName, content, parsed) ?? readFullExport(fileName, content, parsed);
}

/** Liest eine ausgewählte Datei als Text (FileReader, funktioniert auch ohne File.text()). */
export function readFileText(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Datei konnte nicht gelesen werden'));
    reader.readAsText(file, 'utf-8');
  });
}
