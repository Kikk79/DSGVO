import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export interface PageHeaderProps {
  /** Kleine Zeile über dem Titel (Versalien), z. B. „Klasse 7b · 2026/27“ */
  eyebrow?: ReactNode;
  title: ReactNode;
  /** Ein bis zwei Sätze unter dem Titel */
  description?: ReactNode;
  /** Schaltflächen rechts neben dem Titel */
  actions?: ReactNode;
  /** Rücksprung über dem Titel, z. B. zur Schülerliste */
  back?: { to: string; label: string };
}

/** Seitenkopf: Titel in Fraunces, linksbündig, Aktionen rechts. */
export function PageHeader({ eyebrow, title, description, actions, back }: PageHeaderProps) {
  return (
    <header>
      {back && (
        <Link
          to={back.to}
          className="mb-5 inline-flex items-center gap-1.5 rounded-sm text-small font-semibold text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          {eyebrow && <p className="meta mb-2">{eyebrow}</p>}
          <h1 className="font-display text-display font-[440] text-ink [text-wrap:balance]">{title}</h1>
          {description && <p className="mt-3 max-w-measure text-body text-ink-muted">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-3 pb-1">{actions}</div>}
      </div>
    </header>
  );
}
