import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { buttonClasses, type ButtonSize, type ButtonVariant } from './buttonStyles';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary = grün (Hauptaktion), secondary = Rahmen, ghost = nur Text, danger = Rotstift */
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Symbol vor dem Text (lucide-Icon, 16 px). */
  icon?: ReactNode;
  /** Zeigt einen Fortschrittsring und sperrt die Schaltfläche. */
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon, loading = false, disabled, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses(variant, size, className)}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : (
        icon && (
          <span aria-hidden="true" className="-ml-0.5 inline-flex [&>svg]:h-4 [&>svg]:w-4">
            {icon}
          </span>
        )
      )}
      {children}
    </button>
  );
});
