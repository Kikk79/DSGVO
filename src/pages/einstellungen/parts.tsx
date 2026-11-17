import type { ReactNode } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { cx } from '../../lib/cx';

/** Abschnitt eines Einstellungsreiters: Überschrift mit Haarlinie, kurze Erklärung, Inhalt. */
export function Section({
  id,
  title,
  description,
  actions,
  children,
  className,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  /** Schaltflächen rechts in der Kopfzeile */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={cx('space-y-5', className)}>
      <div>
        <div className="section-head flex-wrap">
          <h2 id={id} className="font-display text-title font-[520] text-ink">
            {title}
          </h2>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {description && <div className="mt-3 max-w-measure space-y-2 text-ui text-ink-muted">{description}</div>}
      </div>
      {children}
    </section>
  );
}

/**
 * Hinweis mit Randlinie: info = Tafelgrün, warning = Textmarker.
 * Keine Karte, kein Schatten, nur eine farbige Linie am linken Rand.
 */
export function Notice({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: 'info' | 'warning';
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  const warning = tone === 'warning';
  return (
    <div
      className={cx(
        'flex max-w-measure gap-3 border-l-[3px] py-2.5 pl-4 pr-4 text-ui text-ink',
        warning ? 'border-marker bg-marker-soft/70' : 'border-tafel-600 bg-tafel-100/50',
        className,
      )}
    >
      {warning ? (
        <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-ink" />
      ) : (
        <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-tafel-700" />
      )}
      <div className="min-w-0 space-y-1.5">
        {title && <p className="font-semibold">{title}</p>}
        {children}
      </div>
    </div>
  );
}

/** Zeilen „Bezeichnung – Wert“ mit Haarlinien (Status, Pfade, Zähler). */
export function FactList({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="max-w-measure border-t border-line">
      {items.map((item) => (
        <div
          key={item.label}
          className="grid grid-cols-[minmax(8rem,11rem)_1fr] gap-x-6 border-b border-line py-2.5 text-ui"
        >
          <dt className="text-ink-muted">{item.label}</dt>
          <dd className="min-w-0 break-words text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Dateipfad: dicktengleich, umbrechbar, markierbar. */
export function PathText({ children }: { children: string }) {
  return <code className="select-all break-all font-mono text-small text-ink">{children}</code>;
}

/** Fehlermeldung im Rotstift-Stil innerhalb eines Abschnitts. */
export function InlineError({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="max-w-measure rounded border border-rotstift/40 bg-rotstift-soft px-3 py-2 text-small font-medium text-rotstift-dark"
    >
      {children}
    </p>
  );
}
