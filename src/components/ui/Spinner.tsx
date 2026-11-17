import { cx } from '../../lib/cx';

interface SpinnerProps {
  /** Text für Screenreader; mit `showLabel` auch sichtbar. */
  label?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export function Spinner({ label = 'Lädt …', showLabel = false, size = 'md', className }: SpinnerProps) {
  return (
    <span role="status" className={cx('inline-flex items-center gap-3 text-ink-muted', className)}>
      <span
        aria-hidden="true"
        className={cx(
          'inline-block animate-spin rounded-full border-2 border-current border-t-transparent',
          size === 'sm' ? 'h-4 w-4' : 'h-5 w-5',
        )}
      />
      <span className={showLabel ? 'text-ui' : 'sr-only'}>{label}</span>
    </span>
  );
}
