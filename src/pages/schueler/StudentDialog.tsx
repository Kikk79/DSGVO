import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAppStore } from '../../stores/appStore';
import { bumpDataVersion } from '../../stores/uiStore';
import { errorMessage } from '../../lib/errors';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { useToast } from '../../components/ui/toastContext';
import { compareClasses } from './grouping';

export interface StudentDialogProps {
  open: boolean;
  onClose: () => void;
  /** Vorgewählte Klasse (z. B. „Schüler hinzufügen“ in einer Klassengruppe). */
  initialClassId?: number | null;
}

const FORM_ID = 'schueler-anlegen';

/**
 * Schüler anlegen: Klasse, Vor- und Nachname, Status.
 * „Speichern und weiteren anlegen“ hält den Dialog offen, damit eine ganze Klassenliste
 * zügig eingetragen werden kann.
 */
export function StudentDialog({ open, onClose, initialClassId = null }: StudentDialogProps) {
  const classes = useAppStore((state) => state.classes);
  const createStudent = useAppStore((state) => state.createStudent);
  const loadStudents = useAppStore((state) => state.loadStudents);
  const toast = useToast();
  const firstNameRef = useRef<HTMLInputElement>(null);

  const [classId, setClassId] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [status, setStatus] = useState('active');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedCount, setAddedCount] = useState(0);

  useEffect(() => {
    if (!open) return;
    setClassId(initialClassId !== null ? String(initialClassId) : '');
    setFirstName('');
    setLastName('');
    setStatus('active');
    setSubmitted(false);
    setBusy(false);
    setError(null);
    setAddedCount(0);
  }, [open, initialClassId]);

  const sortedClasses = [...classes].sort(compareClasses);
  const classError = classId === '' ? 'Bitte wählen Sie eine Klasse aus.' : null;
  const firstNameError = !firstName.trim() ? 'Bitte geben Sie den Vornamen ein.' : null;
  const lastNameError = !lastName.trim() ? 'Bitte geben Sie den Nachnamen ein.' : null;

  const save = async (another: boolean) => {
    setSubmitted(true);
    if (classError || firstNameError || lastNameError) return;
    setBusy(true);
    setError(null);
    const name = `${firstName.trim()} ${lastName.trim()}`;
    try {
      await createStudent(Number(classId), firstName.trim(), lastName.trim(), status);
      await loadStudents();
      bumpDataVersion();
      if (another) {
        // Klasse und Status bleiben stehen; nur die Namen werden geleert.
        setFirstName('');
        setLastName('');
        setSubmitted(false);
        setAddedCount((count) => count + 1);
        toast.success(`${name} angelegt.`);
        firstNameRef.current?.focus();
      } else {
        toast.success(`${name} angelegt.`);
        onClose();
      }
    } catch (err) {
      console.error('Schüler konnte nicht angelegt werden:', err);
      setError(errorMessage(err, 'Der Schüler konnte nicht angelegt werden.'));
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void save(false);
  };

  return (
    <Dialog
      open={open}
      onClose={busy ? () => undefined : onClose}
      title="Schüler anlegen"
      description={
        addedCount > 0
          ? `In diesem Durchgang ${addedCount === 1 ? 'wurde 1 Schüler' : `wurden ${addedCount} Schüler`} angelegt.`
          : undefined
      }
      size="md"
      initialFocusRef={initialClassId !== null ? firstNameRef : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {addedCount > 0 ? 'Fertig' : 'Abbrechen'}
          </Button>
          <Button variant="secondary" onClick={() => void save(true)} disabled={busy}>
            Speichern und weiteren anlegen
          </Button>
          <Button type="submit" form={FORM_ID} loading={busy}>
            Speichern
          </Button>
        </>
      }
    >
      <form id={FORM_ID} noValidate onSubmit={handleSubmit} className="space-y-5">
        <Field label="Klasse" error={submitted ? classError : null}>
          <Select value={classId} onChange={(event) => setClassId(event.target.value)}>
            <option value="">Bitte wählen …</option>
            {sortedClasses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.school_year})
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Vorname" error={submitted ? firstNameError : null}>
            <Input
              ref={firstNameRef}
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              autoComplete="off"
              maxLength={80}
            />
          </Field>
          <Field label="Nachname" error={submitted ? lastNameError : null}>
            <Input
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              autoComplete="off"
              maxLength={80}
            />
          </Field>
        </div>
        <Field
          label="Status"
          hint={
            status === 'inactive'
              ? 'Für Schüler, die länger fehlen oder die Klasse verlassen haben. Sie bleiben mit allen Einträgen erhalten, erscheinen aber nicht mehr unter „Länger ohne Eintrag“.'
              : 'Der Normalfall. Aktive Schüler erscheinen auf der Startseite auch unter „Länger ohne Eintrag“.'
          }
        >
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="active">Aktiv</option>
            <option value="inactive">Inaktiv (z. B. längere Abwesenheit)</option>
          </Select>
        </Field>
        {error && (
          <p role="alert" className="rounded border border-rotstift/40 bg-rotstift-soft px-3 py-2 text-small font-medium text-rotstift-dark">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
