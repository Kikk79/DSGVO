import { useRef, type KeyboardEvent } from 'react';
import { cx } from '../../lib/cx';
import { tabId, tabPanelId } from './tabIds';

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
}

export interface TabsProps<T extends string = string> {
  tabs: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  /** Name der Reitergruppe für Screenreader */
  ariaLabel: string;
  className?: string;
}

/**
 * Reiterleiste. Der Inhaltsbereich gehört der Seite (ids aus ./tabIds):
 * <div role="tabpanel" id={tabPanelId(id)} aria-labelledby={tabId(id)}>…</div>
 */
export function Tabs<T extends string = string>({ tabs, value, onChange, ariaLabel, className }: TabsProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = tabs.findIndex((tab) => tab.id === value);
    let next = current;
    if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={cx('flex gap-7 border-b border-line', className)}
    >
      {tabs.map((tab, index) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={tabId(tab.id)}
            aria-selected={selected}
            aria-controls={tabPanelId(tab.id)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={cx(
              '-mb-px border-b-[3px] pb-2.5 pt-1 text-ui transition-colors duration-150',
              selected
                ? 'border-marker font-semibold text-ink'
                : 'border-transparent font-medium text-ink-muted hover:border-line-strong hover:text-ink',
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
