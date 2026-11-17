import { useEffect, useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { bumpDataVersion } from '../../stores/uiStore';
import type { ObservationView } from '../../lib/observations';
import { errorMessage } from '../../lib/errors';
import { formatDate, formatTime } from '../../lib/format';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useToast } from '../ui/toastContext';

export interface DeleteObservationDialogProps {
  /** Zu löschende Beobachtung; null = Dialog geschlossen. */
  observation: ObservationView | null;
  onClose: () => void;
  /** Läuft nach erfolgreichem Löschen (zusätzlich zur Erhöhung von dataVersion). */
  onDeleted?: () => void;
}

/**
 * Löschen in zwei Stufen: zuerst der normale Weg; lehnt das Backend ab,
 * wird das endgültige Löschen (force_delete) mit Begründung angeboten.
 */
export function DeleteObservationDialog({ observation, onClose, onDeleted }: DeleteObservationDialogProps) {
  const deleteObservation = useAppStore((state) => state.deleteObservation);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  /** Grund der Ablehnung; gesetzt = zweite Stufe. */
  const [refusal, setRefusal] = useState<string | null>(null);
  const [forceError, setForceError] = useState<string | null>(null);

  const observationId = observation?.id;
  useEffect(() => {
    setBusy(false);
    setRefusal(null);
    setForceError(null);
  }, [observationId]);

  if (!observation) return null;

  const force = refusal !== null;

  const confirm = async () => {
    setBusy(true);
    setForceError(null);
    try {
      await deleteObservation(observation.id, force);
      bumpDataVersion();
      toast.success('Beobachtung gelöscht.');
      onDeleted?.();
      onClose();
    } catch (error) {
      console.error('Beobachtung konnte nicht gelöscht werden:', error);
      const message = errorMessage(error, 'Die Beobachtung konnte nicht gelöscht werden.');
      if (force) setForceError(message);
      else setRefusal(message);
    } finally {
      setBusy(false);
    }
  };

  const excerpt = observation.text.length > 160 ? `${observation.text.slice(0, 160).trimEnd()} …` : observation.text;

  return (
    <ConfirmDialog
      open
      title={force ? 'Trotzdem endgültig löschen?' : 'Beobachtung löschen?'}
      confirmLabel={force ? 'Endgültig löschen' : 'Löschen'}
      tone="danger"
      busy={busy}
      error={forceError}
      onConfirm={() => void confirm()}
      onCancel={onClose}
    >
      {force ? (
        <>
          <p className="rounded border border-rotstift/40 bg-rotstift-soft px-3 py-2 text-small font-medium text-rotstift-dark">
            Das Löschen wurde abgelehnt: {refusal}
          </p>
          <p>
            Sie können den Eintrag trotzdem endgültig aus der Datenbank entfernen. Das lässt sich nicht rückgängig
            machen.
          </p>
        </>
      ) : (
        <p>Der Eintrag wird dauerhaft entfernt und lässt sich nicht wiederherstellen.</p>
      )}
      <blockquote className="border-l-2 border-rotstift/45 pl-3">
        <p className="meta">
          {observation.studentName} · {formatDate(observation.createdAt)}, {formatTime(observation.createdAt)} Uhr
        </p>
        <p className="mt-1 text-ui text-ink-muted">{excerpt}</p>
      </blockquote>
    </ConfirmDialog>
  );
}
