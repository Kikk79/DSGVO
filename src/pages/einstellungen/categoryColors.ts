/** Farbvorlagen und Kontrastprüfung für Kategorien. */

export interface ColorScheme {
  /** Rand-/Hauptfarbe */
  color: string;
  background: string;
  text: string;
}

export interface ColorPreset extends ColorScheme {
  name: string;
}

/** Gedeckte Töne, die auf Papier ruhig wirken; Text jeweils mit ausreichendem Kontrast. */
export const COLOR_PRESETS: ColorPreset[] = [
  { name: 'Grün', color: '#2F7D5B', background: '#DDF0E4', text: '#1F5A40' },
  { name: 'Blau', color: '#2B6CB0', background: '#DCEAF7', text: '#1E4E80' },
  { name: 'Ocker', color: '#B7791F', background: '#FBEBC8', text: '#7A4E0E' },
  { name: 'Orange', color: '#C05621', background: '#FCE3D2', text: '#8A3A12' },
  { name: 'Beere', color: '#9B2C5E', background: '#F8DDE8', text: '#7A1F49' },
  { name: 'Violett', color: '#6B46C1', background: '#E9E1F8', text: '#4C2F94' },
  { name: 'Petrol', color: '#1D7A85', background: '#D7EEF0', text: '#145861' },
  { name: 'Rot', color: '#B93A26', background: '#F6DDD6', text: '#8A2A1A' },
  { name: 'Grau', color: '#6B7280', background: '#ECEAE4', text: '#3F3A33' },
];

const HEX = /^#[0-9a-f]{6}$/i;

export const isHexColor = (value: string) => HEX.test(value.trim());

export function samePreset(scheme: ColorScheme, preset: ColorScheme): boolean {
  return (
    scheme.color.toLowerCase() === preset.color.toLowerCase() &&
    scheme.background.toLowerCase() === preset.background.toLowerCase() &&
    scheme.text.toLowerCase() === preset.text.toLowerCase()
  );
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Kontrastverhältnis nach WCAG (1 bis 21); null bei ungültigen Farben. */
export function contrastRatio(foreground: string, background: string): number | null {
  if (!isHexColor(foreground) || !isHexColor(background)) return null;
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
