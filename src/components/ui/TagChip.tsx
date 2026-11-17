import { X } from 'lucide-react';

export interface TagChipProps {
  label: string;
  /** Mit Angabe erscheint eine Schaltfläche zum Entfernen. */
  onRemove?: () => void;
}

/** Schlagwort als kleine, umrandete Marke. */
export function TagChip({ label, onRemove }: TagChipProps) {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-line bg-paper px-1.5 py-px text-small text-ink-muted">
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Schlagwort „${label}“ entfernen`}
          className="-mr-1 inline-flex h-5 w-5 items-center justify-center rounded-sm text-ink-muted transition-colors hover:bg-paper-deep hover:text-ink"
        >
          <X aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  );
}
