import { cx } from '../../lib/cx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

const base =
  'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded font-semibold ' +
  'transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-tafel-800 text-kreide hover:bg-tafel-700 active:bg-tafel-900',
  secondary:
    'border border-line-strong bg-transparent text-ink hover:border-ink hover:bg-paper-deep active:bg-line',
  ghost: 'bg-transparent text-ink hover:bg-paper-deep active:bg-line',
  danger: 'bg-rotstift text-white hover:bg-rotstift-dark active:bg-rotstift-dark',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-small',
  md: 'h-10 px-4 text-ui',
};

/**
 * Klassen einer Schaltfläche, für Elemente, die keine <button> sind
 * (z. B. <Link className={buttonClasses('secondary')}>).
 */
export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className?: string,
): string {
  return cx(base, variants[variant], sizes[size], className);
}
