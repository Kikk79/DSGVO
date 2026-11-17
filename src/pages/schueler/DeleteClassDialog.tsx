import { useEffect, useId, useState } from 'react';
import { useAppStore, type Class, type StudentWithStats } from '../../stores/appStore';
import { bumpDataVersion } from '../../stores/uiStore';
import { errorMessage } from '../../lib/errors';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useToast } from '../../components/ui/toastContext';

export interface DeleteClassDialogProps {
  /** null = Dialog geschlossen */
  schoolClass: Class | null;
  /** Die (nicht gelöschten) Schüler dieser Klasse mit ihren Zählern. */
  students: StudentWithStats[];
  onClose: () => void;
}

/**
 * Klasse löschen.
 * - Leere Klasse: normales Löschen (delete_class ohne force).
 * - Klasse mit Schülern: das Backend lehnt das normale Löschen ab; hier wird deshalb gleich
 *   das endgültige Löschen angeboten (force_delete), mit Zahlen und ausdrücklicher Bestätigung.
 */
export function DeleteClassDialog({ schoolClass, students, onClose }: DeleteClassDialogProps) {
  const deleteClass = useAppStore((state) => state.deleteClass);
  const toast = useToast();
  const checkboxId = useId();
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const classId = schoolClass?.id;
  useEffect(() => {
    setAcknowledged(false);
    setBusy(false);
    setError(null);
  }, [classId]);

  if (!schoolClass) return null;

  const studentCount = students.length;
  const observationCount = students.reduce((sum, student) => sum + student.observation_count, 0);
  const force = studentCount > 0;
  const label = `${schoolClass.name} (${schoolClass.school_year})`;
  const studentText = studentCount === 1 ? '1 Schüler' : `${studentCount} Schüler`;
  const observationText = observationCount === 1 ? '1 Beobachtung' : `${observationCount} Beobachtungen`;

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteClass(schoolClass.id, force);
      bumpDataVersion();
      toast.success(`Klasse ${schoolClass.name} gelöscht.`);
      onClose();
    } catch (err) {
      console.error('Klasse konnte nicht gelöscht werden:', err);
      setError(errorMessage(err, 'Die Klasse konnte nicht gelöscht werden.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={busy ? () => undefined : onClose}
      title={`Klasse ${schoolClass.name} löschen?`}
      size="sm"
      role="alertdialog"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy} data-autofocus>
            Abbrechen
          </Button>
          <Button variant="danger" onClick={() => void confirm()} loading={busy} disabled={force && !acknowledged}>
            {force ? 'Klasse mit allen Daten löschen' : 'Klasse löschen'}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-ui text-ink">
        {force ? (
          <>
            <p>
              Die Klasse {label} enthält {studentText} mit zusammen {observationText}.
            </p>
            <p className="rounded border border-rotstift/40 bg-rotstift-soft px-3 py-2 text-small font-medium text-rotstift-dark">
              Beim Löschen der Klasse werden auch alle {studentText} und alle {observationText} endgültig aus der
              Datenbank entfernt. Dazu gehören auch Schüler dieser Klasse, die früher nur aus der Liste entfernt
              wurden. Das lässt sich nicht rückgängig machen.
            </p>
            <p className="text-small text-ink-muted">
              Möchten Sie nur einzelne Schüler löschen, tun Sie das in der Liste. Brauchen Sie Einträge noch, speichern
              Sie vorher in der Schülerakte eine Datenauskunft.
            </p>
            <div className="flex items-start gap-3 pt-1">
              <input
                id={checkboxId}
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 accent-rotstift"
              />
              <label htmlFor={checkboxId} className="cursor-pointer text-ui font-semibold">
                Ja, die Klasse mit {studentText} und {observationText} endgültig löschen.
              </label>
            </div>
          </>
        ) : (
          <p>Die Klasse {label} enthält keine Schüler und wird gelöscht.</p>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-4 rounded border border-rotstift/40 bg-rotstift-soft px-3 py-2 text-small font-medium text-rotstift-dark">
          {error}
        </p>
      )}
    </Dialog>
  );
}
