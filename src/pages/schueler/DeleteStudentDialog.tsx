import { useEffect, useId, useState, type ReactNode } from 'react';
import { useAppStore } from '../../stores/appStore';
import { bumpDataVersion } from '../../stores/uiStore';
import { errorMessage } from '../../lib/errors';
import { cx } from '../../lib/cx';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useToast } from '../../components/ui/toastContext';

export interface DeletableStudent {
  id: number;
  first_name: string;
  last_name: string;
  observation_count: number;
}

export interface DeleteStudentDialogProps {
  /** null = Dialog geschlossen */
  student: DeletableStudent | null;
  onClose: () => void;
  /** Läuft nach erfolgreichem Löschen, z. B. um aus der Schülerakte zurückzuspringen. */
  onDeleted?: () => void;
}

type Mode = 'hide' | 'erase';

function Choice({
  name,
  value,
  checked,
  onChange,
  title,
  children,
}: {
  name: string;
  value: Mode;
  checked: boolean;
  onChange: (value: Mode) => void;
  title: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div
      className={cx(
        'flex gap-3 rounded border px-3.5 py-3 transition-colors',
        checked ? 'border-ink bg-marker-soft' : 'border-line-strong hover:border-ink',
      )}
    >
      <input
        id={id}
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        aria-describedby={`${id}-text`}
        className="mt-1 h-4 w-4 shrink-0 accent-tafel-800"
      />
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-ui font-semibold text-ink">
          {title}
        </label>
        <p id={`${id}-text`} className="mt-0.5 text-small text-ink-muted">
          {children}
        </p>
      </div>
    </div>
  );
}

/**
 * Schüler löschen. Mit Beobachtungen muss die Lehrkraft wählen:
 * - „Aus der Liste entfernen“ (delete_student ohne force): der Schüler wird als gelöscht markiert,
 *   seine Beobachtungen bleiben in der Datenbank.
 * - „Endgültig löschen“ (force_delete): Schüler und alle Beobachtungen werden entfernt.
 * Ohne Beobachtungen gibt es nichts aufzubewahren; dann wird direkt endgültig gelöscht.
 */
export function DeleteStudentDialog({ student, onClose, onDeleted }: DeleteStudentDialogProps) {
  const deleteStudent = useAppStore((state) => state.deleteStudent);
  const toast = useToast();
  const groupName = useId();
  const [mode, setMode] = useState<Mode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const studentId = student?.id;
  useEffect(() => {
    setMode(null);
    setBusy(false);
    setError(null);
  }, [studentId]);

  if (!student) return null;

  const name = `${student.first_name} ${student.last_name}`;
  const count = student.observation_count;
  const hasObservations = count > 0;
  const effectiveMode: Mode | null = hasObservations ? mode : 'erase';
  const countText = count === 1 ? '1 Beobachtung' : `${count} Beobachtungen`;

  const confirm = async () => {
    if (!effectiveMode) return;
    setBusy(true);
    setError(null);
    try {
      await deleteStudent(student.id, effectiveMode === 'erase');
      bumpDataVersion();
      toast.success(
        effectiveMode === 'erase' ? `${name} wurde endgültig gelöscht.` : `${name} wurde aus der Liste entfernt.`,
      );
      onDeleted?.();
      onClose();
    } catch (err) {
      console.error('Schüler konnte nicht gelöscht werden:', err);
      setError(errorMessage(err, 'Der Schüler konnte nicht gelöscht werden.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={busy ? () => undefined : onClose}
      title={`${name} löschen?`}
      size="sm"
      role="alertdialog"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy} data-autofocus>
            Abbrechen
          </Button>
          <Button variant="danger" onClick={() => void confirm()} loading={busy} disabled={!effectiveMode}>
            {effectiveMode === 'hide' ? 'Aus der Liste entfernen' : 'Endgültig löschen'}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-ui text-ink">
        {hasObservations ? (
          <>
            <p>
              Zu {name} gibt es {countText}. Wählen Sie, was damit geschehen soll:
            </p>
            <fieldset className="space-y-2.5">
              <legend className="sr-only">Art des Löschens</legend>
              <Choice
                name={groupName}
                value="hide"
                checked={mode === 'hide'}
                onChange={setMode}
                title="Nur aus der Liste entfernen"
              >
                {name} verschwindet aus allen Listen und Auswahlfeldern. Die {countText} bleiben in der Datenbank
                gespeichert. Zurückholen lässt sich der Schüler in der App nicht.
              </Choice>
              <Choice
                name={groupName}
                value="erase"
                checked={mode === 'erase'}
                onChange={setMode}
                title="Endgültig löschen"
              >
                {name} und alle {countText} werden vollständig aus der Datenbank entfernt, zum Beispiel für einen
                Löschantrag nach Art. 17 DSGVO. Das lässt sich nicht rückgängig machen.
              </Choice>
            </fieldset>
            <p className="text-small text-ink-muted">
              Brauchen Sie die Einträge noch? Speichern Sie vorher in der Schülerakte eine Datenauskunft. Bereits
              erstellte Sicherungen und Exporte sind vom Löschen nicht betroffen.
            </p>
          </>
        ) : (
          <p>
            Zu {name} gibt es keine Beobachtungen. Der Schüler wird vollständig aus der Datenbank entfernt. Das lässt
            sich nicht rückgängig machen.
          </p>
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
