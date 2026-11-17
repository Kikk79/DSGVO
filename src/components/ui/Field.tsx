import { cloneElement, useId, type ReactElement, type ReactNode } from 'react';
import { cx } from '../../lib/cx';

interface ControlProps {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

export interface FieldProps {
  label: string;
  /** Kurzer Hilfetext unter dem Feld. */
  hint?: ReactNode;
  /** Fehlermeldung; setzt aria-invalid am Feld. */
  error?: string | null;
  /** Hängt „(optional)“ an die Beschriftung an. */
  optional?: boolean;
  /** Genau ein Bedienelement (Input, Select, Textarea …), das id und aria-Attribute annimmt. */
  children: ReactElement<ControlProps>;
  className?: string;
}

/**
 * Beschriftung, Hilfetext und Fehlermeldung für ein Formularfeld.
 * Verknüpft alles per id/aria mit dem Kind-Element.
 */
export function Field({ label, hint, error, optional = false, children, className }: FieldProps) {
  const generatedId = useId();
  const id = children.props.id ?? generatedId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [children.props['aria-describedby'], hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-ui font-semibold text-ink">
        {label}
        {optional && <span className="ml-1.5 font-normal text-ink-muted">(optional)</span>}
      </label>
      {cloneElement(children, {
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
      })}
      {hint && !error && (
        <p id={hintId} className="text-small text-ink-muted">
          {hint}
        </p>
      )}
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}

/** Fehlermeldung im Rotstift-Stil; auch einzeln nutzbar (z. B. unter Feldgruppen). */
export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="text-small font-medium text-rotstift-dark">
      {children}
    </p>
  );
}
