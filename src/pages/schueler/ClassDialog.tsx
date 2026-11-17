import { useEffect, useState, type FormEvent } from 'react';
import { useAppStore } from '../../stores/appStore';
import { bumpDataVersion } from '../../stores/uiStore';
import { currentSchoolYear } from '../../lib/format';
import { errorMessage } from '../../lib/errors';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { Input } from '../../components/ui/Input';
import { useToast } from '../../components/ui/toastContext';

export interface ClassDialogProps {
  open: boolean;
  onClose: () => void;
}

const FORM_ID = 'klasse-anlegen';

/** Neue Klasse mit Name und Schuljahr anlegen. */
export function ClassDialog({ open, onClose }: ClassDialogProps) {
  const classes = useAppStore((state) => state.classes);
  const createClass = useAppStore((state) => state.createClass);
  const loadClasses = useAppStore((state) => state.loadClasses);
  const toast = useToast();

  const [name, setName] = useState('');
  const [schoolYear, setSchoolYear] = useState(currentSchoolYear());
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName('');
    setSchoolYear(currentSchoolYear());
    setSubmitted(false);
    setBusy(false);
    setError(null);
  }, [open]);

  const trimmedName = name.trim();
  const trimmedYear = schoolYear.trim();
  const duplicate = classes.some(
    (item) =>
      item.name.trim().toLocaleLowerCase('de') === trimmedName.toLocaleLowerCase('de') &&
      item.school_year.trim() === trimmedYear,
  );
  const nameError = !trimmedName
    ? 'Bitte geben Sie einen Namen ein, zum Beispiel „7b“.'
    : duplicate
      ? `Die Klasse ${trimmedName} gibt es im Schuljahr ${trimmedYear} bereits.`
      : null;
  const yearError = !trimmedYear ? 'Bitte geben Sie das Schuljahr an.' : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (nameError || yearError) return;
    setBusy(true);
    setError(null);
    try {
      await createClass(trimmedName, trimmedYear);
      // Der Store hängt die neue Klasse nur vorne an; neu laden, damit Reihenfolge und Felder stimmen.
      await loadClasses();
      bumpDataVersion();
      toast.success(`Klasse ${trimmedName} angelegt.`);
      onClose();
    } catch (err) {
      console.error('Klasse konnte nicht angelegt werden:', err);
      setError(errorMessage(err, 'Die Klasse konnte nicht angelegt werden.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={busy ? () => undefined : onClose}
      title="Klasse anlegen"
      description="Danach können Sie der Klasse Schüler hinzufügen."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Abbrechen
          </Button>
          <Button type="submit" form={FORM_ID} loading={busy}>
            Klasse anlegen
          </Button>
        </>
      }
    >
      <form id={FORM_ID} noValidate onSubmit={(event) => void submit(event)} className="space-y-5">
        <Field label="Name der Klasse" error={submitted ? nameError : null}>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="z. B. 7b"
            autoComplete="off"
            maxLength={40}
            data-autofocus
          />
        </Field>
        <Field label="Schuljahr" hint="Format wie „2026/27“." error={submitted ? yearError : null}>
          <Input
            value={schoolYear}
            onChange={(event) => setSchoolYear(event.target.value)}
            autoComplete="off"
            maxLength={20}
          />
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
