import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { bumpDataVersion } from '../../stores/uiStore';
import { isEdited, type ObservationView } from '../../lib/observations';
import { errorMessage } from '../../lib/errors';
import { format, isValid } from 'date-fns';
import { formatDate, formatDateLong, formatTime } from '../../lib/format';
import { parseTags } from '../../lib/tags';
import { cx } from '../../lib/cx';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Dialog } from '../ui/Dialog';
import { Field, FieldError } from '../ui/Field';
import { Input } from '../ui/Input';
import { TagChip } from '../ui/TagChip';
import { Textarea } from '../ui/Textarea';
import { useToast } from '../ui/toastContext';
import { StudentPicker } from './StudentPicker';
import { QUICK_TAGS } from './quickTags';

const MIN_TEXT_LENGTH = 10;

export interface ObservationEditorProps {
  /** Vorhandene Beobachtung = Bearbeiten. Ohne Angabe wird eine neue angelegt. */
  observation?: ObservationView;
  /** Nur beim Anlegen: vorgewählter Schüler. */
  initialStudentId?: number;
  onClose: () => void;
}

interface FormErrors {
  student?: string;
  category?: string;
  text?: string;
  createdAt?: string;
}

const LOCAL_INPUT_PATTERN = "yyyy-MM-dd'T'HH:mm";

/** Wert für `<input type="datetime-local">` in Ortszeit, auf die Minute genau. */
const toLocalInput = (value: Date) => (isValid(value) ? format(value, LOCAL_INPUT_PATTERN) : '');

const sameTags = (a: string[], b: string[]) => a.length === b.length && a.every((tag, index) => tag === b[index]);

/**
 * Dialog zum Anlegen und Bearbeiten einer Beobachtung.
 * Wird über useObservationEditor() geöffnet, nicht direkt von Seiten eingebunden.
 */
export function ObservationEditor({ observation, initialStudentId, onClose }: ObservationEditorProps) {
  const isEdit = observation !== undefined;
  const students = useAppStore((state) => state.students);
  const classes = useAppStore((state) => state.classes);
  const categories = useAppStore((state) => state.categories);
  const createObservation = useAppStore((state) => state.createObservation);
  const updateObservation = useAppStore((state) => state.updateObservation);
  const toast = useToast();
  const navigate = useNavigate();

  const initial = useMemo(
    () => ({
      studentId: observation?.studentId ?? initialStudentId ?? null,
      category: observation?.category ?? '',
      text: observation?.text ?? '',
      tags: observation?.tags ?? [],
      createdAt: toLocalInput(observation ? new Date(observation.createdAt) : new Date()),
    }),
    [observation, initialStudentId],
  );

  const [studentId, setStudentId] = useState<number | null>(initial.studentId);
  const [category, setCategory] = useState(initial.category);
  const [text, setText] = useState(initial.text);
  const [tags, setTags] = useState<string[]>(initial.tags);
  const [createdAt, setCreatedAt] = useState(initial.createdAt);
  const [tagDraft, setTagDraft] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** Rückfrage „Verwerfen?“; `then` läuft nach dem Schließen (z. B. Navigation). */
  const [discard, setDiscard] = useState<{ then?: () => void } | null>(null);

  const textRef = useRef<HTMLTextAreaElement>(null);
  const categoryGroupRef = useRef<HTMLDivElement>(null);
  const formId = useId();
  const studentInputId = useId();
  const studentErrorId = useId();
  const categoryErrorId = useId();
  const createdAtId = useId();
  const textId = useId();
  const textHintId = useId();
  const textErrorId = useId();
  const tagInputId = useId();
  const categoryGroupName = useId();

  // Beim Bearbeiten bleibt eine inzwischen gelöschte Kategorie wählbar, damit sie nicht stillschweigend verloren geht.
  const categoryOptions = useMemo(() => {
    const options = categories.map((item) => ({
      name: item.name,
      style: { backgroundColor: item.background_color, color: item.text_color, borderColor: item.color },
    }));
    if (isEdit && initial.category && !options.some((option) => option.name === initial.category)) {
      options.push({
        name: initial.category,
        style: observation?.categoryColors
          ? {
              backgroundColor: observation.categoryColors.background,
              color: observation.categoryColors.text,
              borderColor: observation.categoryColors.color,
            }
          : { backgroundColor: '', color: '', borderColor: '' },
      });
    }
    return options;
  }, [categories, initial.category, isEdit, observation]);

  const trimmedText = text.trim();
  const createdAtChanged = createdAt !== initial.createdAt;
  const contentChanged =
    category !== initial.category ||
    trimmedText !== initial.text.trim() ||
    !sameTags(tags, initial.tags) ||
    createdAtChanged;
  const dirty = contentChanged || studentId !== initial.studentId || tagDraft.trim() !== '';

  const closeNow = useCallback(
    (then?: () => void) => {
      onClose();
      then?.();
    },
    [onClose],
  );

  const requestClose = useCallback(
    (then?: () => void) => {
      if (saving) return;
      if (dirty) setDiscard({ then });
      else closeNow(then);
    },
    [closeNow, dirty, saving],
  );

  const validate = (): FormErrors => {
    const next: FormErrors = {};
    if (!isEdit && studentId === null) next.student = 'Bitte wählen Sie einen Schüler aus.';
    if (!category) next.category = 'Bitte wählen Sie eine Kategorie aus.';
    if (trimmedText.length < MIN_TEXT_LENGTH) {
      next.text = `Bitte beschreiben Sie die Beobachtung mit mindestens ${MIN_TEXT_LENGTH} Zeichen.`;
    }
    // Nur prüfen, wenn der Wert neu ist: ein vorhandener Zeitpunkt bleibt unangetastet.
    if (!isEdit || createdAtChanged) {
      const chosen = new Date(createdAt);
      if (!createdAt || !isValid(chosen)) {
        next.createdAt = 'Bitte geben Sie Datum und Uhrzeit an.';
      } else if (chosen.getTime() > Date.now()) {
        next.createdAt = 'Datum und Uhrzeit dürfen nicht in der Zukunft liegen.';
      } else if (chosen.getFullYear() < 2000) {
        next.createdAt = 'Das Datum darf nicht vor dem Jahr 2000 liegen.';
      }
    }
    return next;
  };

  const save = async () => {
    if (saving) return;

    // Unverändert speichern würde nur den Änderungszeitpunkt verschieben, der beim
    // Synchronisieren entscheidet, welche Fassung gilt. Deshalb: einfach schließen.
    if (isEdit && !contentChanged) {
      closeNow();
      return;
    }

    const found = validate();
    setErrors(found);
    setSubmitError(null);
    if (found.student) {
      document.getElementById(studentInputId)?.focus();
      return;
    }
    if (found.category) {
      categoryGroupRef.current?.querySelector<HTMLInputElement>('input[type="radio"]')?.focus();
      return;
    }
    if (found.text) {
      textRef.current?.focus();
      return;
    }
    if (found.createdAt) {
      document.getElementById(createdAtId)?.focus();
      return;
    }

    setSaving(true);
    try {
      if (isEdit) {
        await updateObservation(observation.id, {
          category,
          text: trimmedText,
          tags,
          ...(createdAtChanged ? { created_at: new Date(createdAt).toISOString() } : {}),
        });
        toast.success('Änderungen gespeichert.');
      } else if (studentId !== null) {
        await createObservation({
          student_id: studentId,
          category,
          text: trimmedText,
          tags,
          created_at: new Date(createdAt).toISOString(),
        });
        toast.success('Beobachtung gespeichert.');
      }
      bumpDataVersion();
      closeNow();
    } catch (error) {
      console.error('Beobachtung konnte nicht gespeichert werden:', error);
      setSubmitError(errorMessage(error, 'Die Beobachtung konnte nicht gespeichert werden.'));
      setSaving(false);
    }
  };

  // Strg+S und Strg+Eingabe speichern, egal wo im Dialog der Fokus steht.
  const saveRef = useRef(save);
  saveRef.current = save;
  const discardOpen = discard !== null;
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.key.toLowerCase() === 's' || event.key === 'Enter') {
        event.preventDefault();
        if (!discardOpen) void saveRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [discardOpen]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void save();
  };

  const toggleTag = (tag: string) => {
    setTags((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]));
  };

  const addDraftTags = () => {
    const additions = parseTags(tagDraft);
    if (additions.length === 0) return;
    setTags((current) => parseTags([...current, ...additions]));
    setTagDraft('');
  };

  const handleTagKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      addDraftTags();
    }
  };

  const quickTags: readonly string[] = QUICK_TAGS;
  const freeTags = tags.filter((tag) => !quickTags.includes(tag));

  const chosenDate = new Date(createdAt);
  const chosenValid = isValid(chosenDate);
  const description = isEdit ? (
    <>
      Erfasst am {formatDate(chosenValid ? chosenDate : observation.createdAt)} um{' '}
      {formatTime(chosenValid ? chosenDate : observation.createdAt)} Uhr
      {isEdited(observation) && observation.updatedAt && (
        <>
          {' · '}zuletzt bearbeitet am {formatDate(observation.updatedAt)} um {formatTime(observation.updatedAt)} Uhr
        </>
      )}
    </>
  ) : (
    formatDateLong(chosenValid ? chosenDate : new Date())
  );

  const leaveTo = (path: string) => (event: { preventDefault: () => void }) => {
    event.preventDefault();
    requestClose(() => navigate(path));
  };

  return (
    <>
      <Dialog
        open
        onClose={() => requestClose()}
        title={isEdit ? 'Beobachtung bearbeiten' : 'Neue Beobachtung'}
        description={description}
        size="lg"
        initialFocusRef={textRef}
        footer={
          <>
            <span className="mr-auto text-small text-ink-muted">
              <kbd className="font-sans font-semibold text-ink">Strg + S</kbd> speichert
            </span>
            <Button variant="secondary" onClick={() => requestClose()} disabled={saving}>
              Abbrechen
            </Button>
            <Button type="submit" form={formId} loading={saving} disabled={isEdit && !contentChanged}>
              {isEdit ? 'Änderungen speichern' : 'Beobachtung speichern'}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={handleSubmit} noValidate className="space-y-6 pt-1">
          {submitError && (
            <p
              role="alert"
              className="rounded border border-rotstift/40 bg-rotstift-soft px-3 py-2 text-ui font-medium text-rotstift-dark"
            >
              {submitError}
            </p>
          )}

          {/* Schüler */}
          {isEdit ? (
            <div>
              <p className="meta">Schüler</p>
              <p className="mt-1 flex items-baseline gap-3">
                <span className="font-display text-name font-[560] text-ink">{observation.studentName}</span>
                {observation.className && <span className="meta">{observation.className}</span>}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={studentInputId} className="text-ui font-semibold text-ink">
                Schüler
              </label>
              {students.length === 0 ? (
                <p className="text-ui text-ink-muted">
                  Es sind noch keine Schüler angelegt.{' '}
                  <Link to="/schueler" onClick={leaveTo('/schueler')} className="link">
                    Schüler anlegen
                  </Link>
                </p>
              ) : (
                <StudentPicker
                  inputId={studentInputId}
                  students={students}
                  classes={classes}
                  value={studentId}
                  onChange={(id) => {
                    setStudentId(id);
                    setErrors((current) => ({ ...current, student: undefined }));
                  }}
                  invalid={!!errors.student}
                  describedBy={errors.student ? studentErrorId : undefined}
                />
              )}
              {errors.student && <FieldError id={studentErrorId}>{errors.student}</FieldError>}
            </div>
          )}

          {/* Datum und Uhrzeit */}
          <Field label="Datum und Uhrzeit" error={errors.createdAt} className="max-w-[16rem]">
            <Input
              id={createdAtId}
              type="datetime-local"
              value={createdAt}
              max={toLocalInput(new Date())}
              onChange={(event) => {
                setCreatedAt(event.target.value);
                if (errors.createdAt) setErrors((current) => ({ ...current, createdAt: undefined }));
              }}
            />
          </Field>

          {/* Kategorie */}
          <fieldset aria-describedby={errors.category ? categoryErrorId : undefined}>
            <legend className="text-ui font-semibold text-ink">Kategorie</legend>
            {categoryOptions.length === 0 ? (
              <p className="mt-1.5 text-ui text-ink-muted">
                Es sind noch keine Kategorien angelegt.{' '}
                <Link
                  to="/einstellungen/kategorien"
                  onClick={leaveTo('/einstellungen/kategorien')}
                  className="link"
                >
                  Kategorien in den Einstellungen anlegen
                </Link>
              </p>
            ) : (
              <div ref={categoryGroupRef} className="mt-2 flex flex-wrap gap-2">
                {categoryOptions.map((option) => {
                  const checked = option.name === category;
                  return (
                    <label key={option.name} className="cursor-pointer">
                      <input
                        type="radio"
                        name={categoryGroupName}
                        value={option.name}
                        checked={checked}
                        onChange={() => {
                          setCategory(option.name);
                          setErrors((current) => ({ ...current, category: undefined }));
                        }}
                        className="peer sr-only"
                      />
                      <span
                        style={option.style.backgroundColor ? option.style : undefined}
                        className={cx(
                          'inline-flex h-9 items-center gap-1.5 rounded border px-3 text-ui font-semibold transition-shadow duration-150',
                          !option.style.backgroundColor && 'border-line-strong bg-paper-deep text-ink',
                          'peer-checked:shadow-[0_0_0_2px_rgb(var(--c-surface)),0_0_0_4px_rgb(var(--c-ink))]',
                          'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-[5px] peer-focus-visible:outline-ink',
                        )}
                      >
                        {checked && <Check aria-hidden="true" className="-ml-0.5 h-4 w-4" />}
                        {option.name}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
            {errors.category && (
              <div className="mt-2">
                <FieldError id={categoryErrorId}>{errors.category}</FieldError>
              </div>
            )}
          </fieldset>

          {/* Text */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor={textId} className="text-ui font-semibold text-ink">
              Beobachtung
            </label>
            <Textarea
              id={textId}
              ref={textRef}
              autoGrow
              rows={5}
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                if (errors.text) setErrors((current) => ({ ...current, text: undefined }));
              }}
              placeholder="Was haben Sie beobachtet? Situation, Verhalten oder Leistung in eigenen Worten."
              aria-invalid={errors.text ? true : undefined}
              aria-describedby={errors.text ? textErrorId : textHintId}
              className="max-h-[40vh] min-h-[8.5rem]"
            />
            {errors.text ? (
              <FieldError id={textErrorId}>{errors.text}</FieldError>
            ) : (
              <p id={textHintId} className="text-small text-ink-muted">
                Mindestens {MIN_TEXT_LENGTH} Zeichen.
              </p>
            )}
          </div>

          {/* Schlagwörter */}
          <fieldset>
            <legend className="text-ui font-semibold text-ink">
              Schlagwörter <span className="ml-1.5 font-normal text-ink-muted">(optional)</span>
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {QUICK_TAGS.map((tag) => {
                const pressed = tags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    aria-pressed={pressed}
                    onClick={() => toggleTag(tag)}
                    className={cx(
                      'inline-flex h-8 items-center gap-1 rounded border px-2.5 text-small font-medium transition-colors duration-150',
                      pressed
                        ? 'border-ink bg-marker-soft font-semibold text-ink'
                        : 'border-line-strong bg-transparent text-ink hover:border-ink hover:bg-paper-deep',
                    )}
                  >
                    {pressed && <Check aria-hidden="true" className="-ml-0.5 h-3.5 w-3.5" />}
                    {tag}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label htmlFor={tagInputId} className="sr-only">
                Eigenes Schlagwort
              </label>
              <Input
                id={tagInputId}
                value={tagDraft}
                onChange={(event) => setTagDraft(event.target.value)}
                onKeyDown={handleTagKeyDown}
                onBlur={addDraftTags}
                placeholder="Eigenes Schlagwort, mit Eingabe hinzufügen"
                className="h-9 max-w-[20rem]"
              />
              {freeTags.map((tag) => (
                <TagChip key={tag} label={tag} onRemove={() => toggleTag(tag)} />
              ))}
            </div>
          </fieldset>
        </form>
      </Dialog>

      <ConfirmDialog
        open={discardOpen}
        title={isEdit ? 'Änderungen verwerfen?' : 'Eingaben verwerfen?'}
        confirmLabel="Verwerfen"
        cancelLabel="Weiter bearbeiten"
        tone="danger"
        onConfirm={() => {
          const then = discard?.then;
          setDiscard(null);
          closeNow(then);
        }}
        onCancel={() => setDiscard(null)}
      >
        <p>
          {isEdit
            ? 'Die Änderungen an dieser Beobachtung sind noch nicht gespeichert.'
            : 'Die Beobachtung ist noch nicht gespeichert.'}
        </p>
      </ConfirmDialog>
    </>
  );
}
