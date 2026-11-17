import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, Info, X } from 'lucide-react';
import { cx } from '../../lib/cx';
import { ToastContext, type ToastApi } from './toastContext';

type ToastKind = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

const DURATION: Record<ToastKind, number> = { success: 4500, info: 5000, error: 9000 };

const icons: Record<ToastKind, ReactNode> = {
  success: <Check aria-hidden="true" className="h-4 w-4" />,
  error: <AlertTriangle aria-hidden="true" className="h-4 w-4" />,
  info: <Info aria-hidden="true" className="h-4 w-4" />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-3), { id, kind, message }]);
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), DURATION[kind]),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => window.clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push('success', message),
      error: (message) => push('error', message),
      info: (message) => push('info', message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div
          role="region"
          aria-label="Meldungen"
          className="pointer-events-none fixed bottom-6 right-6 z-[60] flex w-[min(24rem,calc(100vw-3rem))] flex-col gap-2"
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              role={toast.kind === 'error' ? 'alert' : 'status'}
              className="on-tafel pointer-events-auto flex items-start gap-3 rounded bg-ink py-3 pl-3.5 pr-2 text-ui text-paper animate-rise"
            >
              <span
                className={cx(
                  'mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                  toast.kind === 'error' ? 'bg-rotstift text-white' : 'bg-marker text-ink',
                )}
              >
                {icons[toast.kind]}
              </span>
              <p className="min-w-0 flex-1 py-px">{toast.message}</p>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Meldung schließen"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-paper/70 transition-colors hover:bg-white/10 hover:text-paper"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}
