import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cx } from '../../lib/cx';
import { IconButton } from './IconButton';

export interface DialogProps {
  open: boolean;
  /** Wird bei Escape, Klick auf den Hintergrund und über „Schließen“ aufgerufen. */
  onClose: () => void;
  title: string;
  /** Kurze Erläuterung unter dem Titel; wird per aria-describedby verknüpft. */
  description?: ReactNode;
  children: ReactNode;
  /** Aktionsleiste am unteren Rand (Schaltflächen). */
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** alertdialog für Rückfragen, die eine Entscheidung verlangen. */
  role?: 'dialog' | 'alertdialog';
  /** Element, das beim Öffnen den Fokus erhält. Ohne Angabe: [data-autofocus], sonst das erste Bedienelement. */
  initialFocusRef?: RefObject<HTMLElement>;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Offene Dialoge in Öffnungsreihenfolge; nur der oberste reagiert auf Tastatur und Fokus. */
const openDialogs: symbol[] = [];

function focusableIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => !element.hasAttribute('inert') && element.getAttribute('aria-hidden') !== 'true',
  );
}

const sizes = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
};

/**
 * Modaler Dialog: hält den Fokus im Dialog, gibt ihn beim Schließen zurück,
 * schließt mit Escape und per Klick auf den Hintergrund.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  role = 'dialog',
  initialFocusRef,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const token = useRef(Symbol('dialog'));
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    const id = token.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    openDialogs.push(id);

    const panel = panelRef.current;
    if (panel) {
      const target =
        initialFocusRef?.current ??
        panel.querySelector<HTMLElement>('[data-autofocus]') ??
        focusableIn(panel).find((element) => !element.hasAttribute('data-dialog-close')) ??
        panel;
      target.focus();
    }

    // Fokus zurückholen, falls er den obersten Dialog verlässt (z. B. per Mausklick daneben).
    const keepFocusInside = (event: FocusEvent) => {
      const current = panelRef.current;
      if (!current || openDialogs[openDialogs.length - 1] !== id) return;
      if (event.target instanceof Node && !current.contains(event.target)) {
        (focusableIn(current)[0] ?? current).focus();
      }
    };
    document.addEventListener('focusin', keepFocusInside);

    return () => {
      document.removeEventListener('focusin', keepFocusInside);
      const index = openDialogs.indexOf(id);
      if (index >= 0) openDialogs.splice(index, 1);
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
    // initialFocusRef ist ein stabiles Ref-Objekt und wird nur beim Öffnen gelesen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const isTopmost = () => openDialogs[openDialogs.length - 1] === token.current;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isTopmost()) return;

    if (event.key === 'Escape') {
      event.stopPropagation();
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== 'Tab') return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusable = focusableIn(panel);
    if (focusable.length === 0) {
      event.preventDefault();
      panel.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleBackdropMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && isTopmost()) onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-tafel-900/60 p-6 animate-fade-in"
      onMouseDown={handleBackdropMouseDown}
      data-testid="dialog-backdrop"
    >
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={cx(
          'flex max-h-full w-full flex-col rounded-lg border border-ink/25 bg-surface animate-dialog-in',
          sizes[size],
        )}
      >
        <header className="flex items-start justify-between gap-4 px-7 pb-4 pt-6">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-title font-[560] text-ink">
              {title}
            </h2>
            {description && (
              <div id={descriptionId} className="mt-1 text-small text-ink-muted">
                {description}
              </div>
            )}
          </div>
          <IconButton label="Schließen" onClick={onClose} data-dialog-close className="-mr-2 -mt-1">
            <X />
          </IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-6">{children}</div>
        {footer && (
          <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-line px-7 py-4">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
