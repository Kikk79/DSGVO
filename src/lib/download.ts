/** Speichert Text als Datei über einen Blob-Download (z. B. Exporte als JSON oder CSV). */
export function downloadText(
  filename: string,
  content: string,
  mimeType: string = 'text/plain;charset=utf-8',
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Erst nach dem Klick freigeben, sonst bricht der Download in manchen Webviews ab.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const MIME_JSON = 'application/json;charset=utf-8';
export const MIME_CSV = 'text/csv;charset=utf-8';
