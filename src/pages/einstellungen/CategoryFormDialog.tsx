import { useEffect, useId, useState, type FormEvent } from 'react';
import { Check } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import type { Category } from '../../stores/appStore';
import { Dialog } from '../../components/ui/Dialog';
import { Button } from '../../components/ui/Button';
import { Field, FieldError } from '../../components/ui/Field';
import { Input } from '../../components/ui/Input';
import { CategoryBadge } from '../../components/ui/CategoryBadge';
import { errorMessage, rawErrorText } from '../../lib/errors';
import { cx } from '../../lib/cx';
import { COLOR_PRESETS, contrastRatio, isHexColor, samePreset, type ColorScheme } from './categoryColors';
import { InlineError, Notice } from './parts';

export interface CategoryFormDialogProps {
  open: boolean;
  /** null = neue Kategorie anlegen */
  category: Category | null;
  /** Anzahl der Beobachtungen mit dieser Kategorie (nur beim Bearbeiten) */
  usage: number;
  /** Namen aller angezeigten Kategorien, für die Doppelprüfung */
  existingNames: string[];
  onClose: () => void;
  onSaved: (name: string, created: boolean) => void;
}

const COLOR_FIELDS: Array<{ key: keyof ColorScheme; label: string }> = [
  { key: 'color', label: 'Rand' },
  { key: 'background', label: 'Hintergrund' },
  { key: 'text', label: 'Schrift' },
];

function initialScheme(category: Category | null): ColorScheme {
  if (!category) {
    const { color, background, text } = COLOR_PRESETS[0];
    return { color, background, text };
  }
  return { color: category.color, background: category.background_color, text: category.text_color };
}

/** Anlegen und Bearbeiten einer Kategorie: Name, Farbvorlage oder eigene Farben, Vorschau. */
export function CategoryFormDialog({ open, category, usage, existingNames, onClose, onSaved }: CategoryFormDialogProps) {
  const formId = useId();
  const [name, setName] = useState('');
  const [scheme, setScheme] = useState<ColorScheme>(initialScheme(null));
  const [nameError, setNameError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(category?.name ?? '');
    setScheme(initialScheme(category));
    setNameError(null);
    setSaveError(null);
    setSaving(false);
  }, [open, category]);

  const trimmed = name.trim();
  const renamed = category !== null && trimmed !== '' && trimmed !== category.name;
  const colorsValid = isHexColor(scheme.color) && isHexColor(scheme.background) && isHexColor(scheme.text);
  const contrast = contrastRatio(scheme.text, scheme.background);
  const activePreset = COLOR_PRESETS.find((preset) => samePreset(scheme, preset));

  const validateName = (): string | null => {
    if (trimmed.length < 2) return 'Bitte geben Sie einen Namen mit mindestens zwei Zeichen ein.';
    const clash = existingNames.some(
      (existing) => existing.toLocaleLowerCase('de') === trimmed.toLocaleLowerCase('de') && existing !== category?.name,
    );
    if (clash) return 'Eine Kategorie mit diesem Namen gibt es bereits.';
    return null;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const problem = validateName();
    setNameError(problem);
    if (problem || !colorsValid) return;

    setSaving(true);
    setSaveError(null);
    const payload = {
      name: trimmed,
      color: scheme.color,
      backgroundColor: scheme.background,
      textColor: scheme.text,
    };
    try {
      if (category) {
        await invoke('update_category', { id: category.id, ...payload });
      } else {
        await invoke('create_category', payload);
      }
      onSaved(trimmed, category === null);
    } catch (error) {
      console.error('Kategorie konnte nicht gespeichert werden:', error);
      // Gelöschte, aber noch verwendete Kategorien sind nur ausgeblendet; ihr Name bleibt belegt.
      if (/unique constraint/i.test(rawErrorText(error))) {
        setNameError(
          'Dieser Name ist bereits vergeben, vermutlich von einer gelöschten Kategorie, die in älteren Beobachtungen noch vorkommt. Bitte wählen Sie einen anderen Namen.',
        );
      } else {
        setSaveError(errorMessage(error, 'Die Kategorie konnte nicht gespeichert werden.'));
      }
      setSaving(false);
    }
  };

  const setColor = (key: keyof ColorScheme, value: string) => setScheme((current) => ({ ...current, [key]: value }));

  return (
    <Dialog
      open={open}
      onClose={saving ? () => undefined : onClose}
      title={category ? 'Kategorie bearbeiten' : 'Neue Kategorie'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Abbrechen
          </Button>
          <Button type="submit" form={formId} loading={saving} disabled={!colorsValid}>
            {category ? 'Änderungen speichern' : 'Kategorie anlegen'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} noValidate className="space-y-6">
        <Field label="Name" error={nameError}>
          <Input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (nameError) setNameError(null);
            }}
            placeholder="z. B. Sozialverhalten"
            maxLength={60}
            autoComplete="off"
            data-autofocus
          />
        </Field>

        {renamed && usage > 0 && (
          <Notice tone="warning">
            <p>
              {usage === 1
                ? `Eine bereits erfasste Beobachtung behält den bisherigen Namen „${category?.name}“ und erscheint dann ohne Farbe.`
                : `${usage} bereits erfasste Beobachtungen behalten den bisherigen Namen „${category?.name}“ und erscheinen dann ohne Farbe.`}
            </p>
          </Notice>
        )}

        <fieldset>
          <legend className="text-ui font-semibold text-ink">Farbe</legend>
          <div role="group" aria-label="Farbvorlagen" className="mt-2.5 flex flex-wrap gap-2">
            {COLOR_PRESETS.map((preset) => {
              const selected = activePreset?.name === preset.name;
              return (
                <button
                  key={preset.name}
                  type="button"
                  aria-pressed={selected}
                  aria-label={preset.name}
                  title={preset.name}
                  onClick={() => setScheme({ color: preset.color, background: preset.background, text: preset.text })}
                  className={cx(
                    'relative inline-flex h-9 w-9 items-center justify-center rounded-full border-2 transition-transform duration-150 hover:scale-105',
                    selected ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : '',
                  )}
                  style={{ backgroundColor: preset.background, borderColor: preset.color, color: preset.text }}
                >
                  {selected && <Check aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />}
                </button>
              );
            })}
          </div>

          <details className="group mt-4" open={category !== null && !activePreset}>
            <summary className="link inline-block cursor-pointer text-small">Eigene Farben festlegen</summary>
            <div className="mt-3 grid grid-cols-3 gap-3">
              {COLOR_FIELDS.map(({ key, label }) => (
                <ColorInput key={key} label={label} value={scheme[key]} onChange={(value) => setColor(key, value)} />
              ))}
            </div>
            {!colorsValid && <div className="mt-2"><FieldError>Bitte Farben im Format #RRGGBB angeben.</FieldError></div>}
          </details>
        </fieldset>

        <div>
          <p className="text-ui font-semibold text-ink">Vorschau</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-3 border-y border-line py-3">
            <CategoryBadge
              name={trimmed || 'Kategorie'}
              colors={colorsValid ? scheme : undefined}
            />
            <span className="text-small text-ink-muted">So erscheint die Kategorie an Beobachtungen.</span>
          </div>
          {contrast !== null && contrast < 4.5 && (
            <p className="mt-2 text-small text-ink-muted">
              Schrift und Hintergrund unterscheiden sich wenig. Eine dunklere Schriftfarbe ist besser lesbar.
            </p>
          )}
        </div>

        {saveError && <InlineError>{saveError}</InlineError>}
      </form>
    </Dialog>
  );
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-small font-semibold text-ink">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          value={isHexColor(value) ? value : '#000000'}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-10 shrink-0 cursor-pointer rounded border border-line-strong bg-surface p-1"
        />
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`${label} als Farbwert`}
          aria-invalid={!isHexColor(value) || undefined}
          maxLength={7}
          spellCheck={false}
          className="min-w-0 font-mono text-small"
        />
      </div>
    </div>
  );
}
