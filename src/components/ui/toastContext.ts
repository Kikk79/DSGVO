import { createContext, useContext } from 'react';

export interface ToastApi {
  /** Grüne Bestätigung, verschwindet nach wenigen Sekunden. */
  success: (message: string) => void;
  /** Fehlermeldung, bleibt länger stehen. */
  error: (message: string) => void;
  /** Neutraler Hinweis. */
  info: (message: string) => void;
}

export const ToastContext = createContext<ToastApi | null>(null);

/** Kurze Rückmeldungen am unteren Rand. Nur innerhalb von <ToastProvider>. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast muss innerhalb von <ToastProvider> verwendet werden.');
  return api;
}
