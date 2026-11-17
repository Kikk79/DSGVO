import { createContext, useContext } from 'react';
import type { ObservationView } from '../../lib/observations';

export interface ObservationEditorApi {
  /** Öffnet den Dialog für eine neue Beobachtung, auf Wunsch mit vorgewähltem Schüler. */
  openCreate: (options?: { studentId?: number }) => void;
  /** Öffnet den Dialog zum Bearbeiten (Kategorie, Text, Schlagwörter). */
  openEdit: (observation: ObservationView) => void;
}

export const ObservationEditorContext = createContext<ObservationEditorApi | null>(null);

/** Zugriff auf den globalen Beobachtungs-Dialog. Nur innerhalb von <ObservationEditorProvider>. */
export function useObservationEditor(): ObservationEditorApi {
  const api = useContext(ObservationEditorContext);
  if (!api) {
    throw new Error('useObservationEditor muss innerhalb von <ObservationEditorProvider> verwendet werden.');
  }
  return api;
}
