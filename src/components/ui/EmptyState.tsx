import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';

export interface EmptyStateProps {
  title: string;
  /** Erklärung, was hier erscheinen wird und was als Nächstes zu tun ist */
  children?: ReactNode;
  /** Schaltfläche(n) für den nächsten Schritt */
  action?: ReactNode;
  className?: string;
}

/** Leerer Zustand: ruhiger Hinweis zwischen zwei Haarlinien, linksbündig, ohne Symbolbild. */
export function EmptyState({ title, children, action, className }: EmptyStateProps) {
  return (
    <div className={cx('border-y border-line py-8', className)}>
      <h3 className="font-display text-title font-[480] italic text-ink">{title}</h3>
      {children && <div className="mt-2 max-w-[52ch] text-body text-ink-muted">{children}</div>}
      {action && <div className="mt-5 flex flex-wrap items-center gap-3">{action}</div>}
    </div>
  );
}
