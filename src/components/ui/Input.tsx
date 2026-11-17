import { forwardRef, type InputHTMLAttributes } from 'react';
import { cx } from '../../lib/cx';
import { controlClasses } from './controlStyles';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, type = 'text', ...rest },
  ref,
) {
  return <input ref={ref} type={type} className={cx(controlClasses, 'h-10', className)} {...rest} />;
});
