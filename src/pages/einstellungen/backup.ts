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

/** Prüft, ob der Text eine Sicherung aus export_all_data ist, und liest die Eckdaten. */
export function readBackup(fileName: string, content: string): BackupSummary | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const backup = parsed as {
    format?: unknown;
    timestamp?: unknown;
    data?: unknown;
    export_scope?: Record<string, unknown>;
    source_device?: Record<string, unknown>;
  };
  if (backup.format !== 'full_export' || typeof backup.data !== 'object' || backup.data === null) return null;
  const num = (value: unknown) => (typeof value === 'number' ? value : null);
  const scope = backup.export_scope ?? {};
  return {
    fileName,
    content,
    timestamp: typeof backup.timestamp === 'string' ? backup.timestamp : null,
    deviceName: typeof backup.source_device?.device_name === 'string' ? backup.source_device.device_name : null,
    students: num(scope.total_students),
    classes: num(scope.total_classes),
    observations: num(scope.total_observations),
    categories: num(scope.total_categories),
  };
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
