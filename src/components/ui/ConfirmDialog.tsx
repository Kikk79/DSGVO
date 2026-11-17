import type { ReactNode } from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Erläuterung: was passiert, wenn bestätigt wird. */
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** danger: rote Bestätigungsschaltfläche, Fokus startet auf „Abbrechen“. */
  tone?: 'default' | 'danger';
  /** Sperrt beide Schaltflächen und zeigt den Fortschritt auf der Bestätigung. */
  busy?: boolean;
  /** Fehlermeldung, falls die bestätigte Aktion fehlgeschlagen ist. */
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Ersatz für window.confirm(): Rückfrage mit zwei Schaltflächen. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Abbrechen',
  tone = 'default',
  busy = false,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const danger = tone === 'danger';
  return (
    <Dialog
      open={open}
      onClose={busy ? () => undefined : onCancel}
      title={title}
      size="sm"
      role="alertdialog"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy} data-autofocus={danger || undefined}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={busy}
            data-autofocus={danger ? undefined : true}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-ui text-ink">{children}</div>
      {error && (
        <p role="alert" className="mt-4 rounded border border-rotstift/40 bg-rotstift-soft px-3 py-2 text-small font-medium text-rotstift-dark">
          {error}
        </p>
      )}
    </Dialog>
  );
}
