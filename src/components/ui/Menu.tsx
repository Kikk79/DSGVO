import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cx } from '../../lib/cx';
import { buttonClasses } from './buttonStyles';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  /** lucide-Icon vor dem Text */
  icon?: ReactNode;
  /** Rotstift-Farbe für zerstörende Aktionen */
  danger?: boolean;
  disabled?: boolean;
}

export interface MenuProps {
  /** Beschriftung der auslösenden Schaltfläche */
  label: string;
  icon?: ReactNode;
  items: MenuItem[];
  /** Ausrichtung der Liste an der Schaltfläche */
  align?: 'start' | 'end';
}

/**
 * Aufklappmenü mit Tastaturbedienung: Pfeiltasten, Pos1/Ende, Escape, Tab schließt.
 */
export function Menu({ label, icon, items, align = 'end' }: MenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();

  const focusItem = (index: number) => {
    const enabled = itemRefs.current.filter((item): item is HTMLButtonElement => !!item && !item.disabled);
    if (enabled.length === 0) return;
    enabled[(index + enabled.length) % enabled.length].focus();
  };

  useEffect(() => {
    if (!open) return;
    focusItem(0);
    const closeOnOutside = (event: MouseEvent) => {
      if (rootRef.current && event.target instanceof Node && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', closeOnOutside);
    return () => document.removeEventListener('mousedown', closeOnOutside);
  }, [open]);

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const enabled = itemRefs.current.filter((item): item is HTMLButtonElement => !!item && !item.disabled);
    const current = enabled.indexOf(document.activeElement as HTMLButtonElement);
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusItem(current + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusItem(current - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusItem(0);
        break;
      case 'End':
        event.preventDefault();
        focusItem(enabled.length - 1);
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        close(true);
        break;
      case 'Tab':
        setOpen(false);
        break;
    }
  };

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className={buttonClasses('secondary')}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {icon && (
          <span aria-hidden="true" className="-ml-0.5 inline-flex [&>svg]:h-4 [&>svg]:w-4">
            {icon}
          </span>
        )}
        {label}
        <ChevronDown aria-hidden="true" className={cx('-mr-1 h-4 w-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={handleMenuKeyDown}
          className={cx(
            'absolute z-40 mt-1.5 min-w-[12rem] rounded border border-ink/25 bg-surface py-1 animate-fade-in',
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item, index) => (
            <button
              key={item.label}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              disabled={item.disabled}
              onClick={() => {
                close(true);
                item.onSelect();
              }}
              className={cx(
                'flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-ui transition-colors',
                'disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-offset-[-2px]',
                item.danger
                  ? 'text-rotstift-dark hover:bg-rotstift-soft focus-visible:bg-rotstift-soft'
                  : 'text-ink hover:bg-paper-deep focus-visible:bg-paper-deep',
              )}
            >
              {item.icon && (
                <span aria-hidden="true" className="inline-flex [&>svg]:h-4 [&>svg]:w-4">
                  {item.icon}
                </span>
              )}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
