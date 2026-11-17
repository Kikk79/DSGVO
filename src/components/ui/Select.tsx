import { forwardRef, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cx } from '../../lib/cx';
import { controlClasses } from './controlStyles';

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

/** Natives <select> im Stil der übrigen Felder; Optionen als <option>-Kinder. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <span className={cx('relative block', className)}>
      <select ref={ref} className={cx(controlClasses, 'h-10 appearance-none pr-9')} {...rest}>
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
      />
    </span>
  );
});
