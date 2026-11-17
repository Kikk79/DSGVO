import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../lib/cx';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'> {
  /** Pflicht: wird als aria-label und Tooltip verwendet. */
  label: string;
  /** lucide-Icon */
  children: ReactNode;
  /** danger färbt beim Überfahren und Fokussieren rot (Löschen). */
  tone?: 'default' | 'danger';
  size?: 'sm' | 'md';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, children, tone = 'default', size = 'md', className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded text-ink-muted transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-8 w-8 [&>svg]:h-4 [&>svg]:w-4' : 'h-9 w-9 [&>svg]:h-[1.125rem] [&>svg]:w-[1.125rem]',
        tone === 'danger'
          ? 'hover:bg-rotstift-soft hover:text-rotstift-dark'
          : 'hover:bg-paper-deep hover:text-ink',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
