import { useMemo, useState } from 'react';
import ReactSelect, { type GroupBase } from 'react-select';
import type { Class, Student } from '../../stores/appStore';
import { cx } from '../../lib/cx';

interface StudentOption {
  value: number;
  label: string;
  className: string;
  inactive: boolean;
}

interface StudentPickerProps {
  /** id des Eingabefelds (für das <label>) */
  inputId: string;
  students: Student[];
  classes: Class[];
  value: number | null;
  onChange: (studentId: number | null) => void;
  invalid?: boolean;
  describedBy?: string;
}

const collator = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });

/** Durchsuchbare Schülerauswahl, nach Klassen gruppiert. */
export function StudentPicker({ inputId, students, classes, value, onChange, invalid, describedBy }: StudentPickerProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const groups = useMemo<GroupBase<StudentOption>[]>(() => {
    const byClass = new Map<number, StudentOption[]>();
    for (const student of students) {
      if (student.status === 'deleted') continue;
      const schoolClass = classes.find((item) => item.id === student.class_id);
      const list = byClass.get(student.class_id) ?? [];
      list.push({
        value: student.id,
        label: `${student.first_name} ${student.last_name}`,
        className: schoolClass?.name ?? 'Ohne Klasse',
        inactive: student.status !== 'active',
      });
      byClass.set(student.class_id, list);
    }
    return Array.from(byClass.values())
      .map((options) => ({
        label: options[0].className,
        options: options.sort((a, b) => collator.compare(a.label, b.label)),
      }))
      .sort((a, b) => collator.compare(a.label ?? '', b.label ?? ''));
  }, [students, classes]);

  const selected = useMemo(
    () => groups.flatMap((group) => group.options).find((option) => option.value === value) ?? null,
    [groups, value],
  );

  return (
    <ReactSelect<StudentOption, false, GroupBase<StudentOption>>
      inputId={inputId}
      unstyled
      options={groups}
      value={selected}
      onChange={(option) => onChange(option ? option.value : null)}
      placeholder="Namen oder Klasse eingeben …"
      noOptionsMessage={() => 'Keine Treffer'}
      aria-invalid={invalid || undefined}
      aria-errormessage={invalid ? describedBy : undefined}
      menuPlacement="auto"
      maxMenuHeight={240}
      onMenuOpen={() => setMenuOpen(true)}
      onMenuClose={() => setMenuOpen(false)}
      onKeyDown={(event) => {
        // Escape schließt zuerst nur die Liste, nicht den ganzen Dialog.
        if (event.key === 'Escape' && menuOpen) event.stopPropagation();
      }}
      filterOption={(option, input) =>
        `${option.data.label} ${option.data.className}`.toLocaleLowerCase('de').includes(input.trim().toLocaleLowerCase('de'))
      }
      formatOptionLabel={(option, meta) => (
        <span className="flex w-full items-baseline justify-between gap-3">
          <span>
            {option.label}
            {option.inactive && <span className="ml-2 text-small text-ink-muted">inaktiv</span>}
          </span>
          {meta.context === 'value' && <span className="meta">{option.className}</span>}
        </span>
      )}
      screenReaderStatus={({ count }) => `${count} ${count === 1 ? 'Treffer' : 'Treffer'} verfügbar`}
      ariaLiveMessages={{
        guidance: () => 'Mit den Pfeiltasten auswählen, mit Eingabe bestätigen, mit Escape schließen.',
        onChange: ({ label }) => (label ? `${label} ausgewählt.` : ''),
        onFocus: ({ focused }) => `${focused.label}, ${focused.className}`,
        onFilter: ({ inputValue, resultsMessage }) =>
          inputValue ? `${resultsMessage} für „${inputValue}“.` : resultsMessage,
      }}
      classNames={{
        container: () => 'rs-control',
        control: ({ isFocused }) =>
          cx(
            'min-h-[2.5rem] rounded border bg-surface px-3 text-ui transition-colors duration-150',
            invalid ? 'border-rotstift' : isFocused ? 'border-ink' : 'border-line-strong hover:border-ink',
            isFocused && 'rs-focused',
          ),
        placeholder: () => 'text-ink-muted',
        singleValue: () => 'text-ink',
        input: () => 'text-ink',
        dropdownIndicator: () => 'text-ink-muted',
        indicatorSeparator: () => 'hidden',
        menu: () => 'z-50 mt-1.5 rounded border border-ink/25 bg-surface py-1',
        groupHeading: () => 'meta px-3 pb-1 pt-2.5',
        option: ({ isFocused, isSelected }) =>
          cx(
            'cursor-pointer px-3 py-2 text-ui text-ink',
            isSelected ? 'bg-marker-soft font-semibold' : isFocused && 'bg-paper-deep',
          ),
        noOptionsMessage: () => 'px-3 py-2 text-ui text-ink-muted',
      }}
    />
  );
}
