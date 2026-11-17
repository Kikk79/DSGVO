import type { CategoryColors } from '../../lib/observations';
import { useAppStore } from '../../stores/appStore';
import { cx } from '../../lib/cx';

export interface CategoryBadgeProps {
  /** Name der Kategorie */
  name: string;
  /** Farben aus dem Datensatz. Ohne Angabe werden sie im Store nachgeschlagen. */
  colors?: CategoryColors;
  className?: string;
}

/**
 * Kategorie in genau den Farben, die in den Einstellungen festgelegt wurden.
 * Unbekannte Kategorien erscheinen neutral.
 */
export function CategoryBadge({ name, colors, className }: CategoryBadgeProps) {
  const stored = useAppStore((state) => state.categories.find((category) => category.name === name));
  const resolved: CategoryColors | undefined =
    colors ?? (stored ? { color: stored.color, background: stored.background_color, text: stored.text_color } : undefined);

  return (
    <span
      className={cx(
        'inline-flex items-center whitespace-nowrap rounded-sm border px-2 py-0.5 text-small font-semibold',
        !resolved && 'border-line-strong bg-paper-deep text-ink',
        className,
      )}
      style={
        resolved
          ? { backgroundColor: resolved.background, color: resolved.text, borderColor: resolved.color }
          : undefined
      }
    >
      {name}
    </span>
  );
}
