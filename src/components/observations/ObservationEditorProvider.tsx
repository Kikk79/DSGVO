import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ObservationView } from '../../lib/observations';
import { ObservationEditor } from './ObservationEditor';
import { ObservationEditorContext, type ObservationEditorApi } from './editorContext';

type EditorState =
  | { mode: 'create'; studentId?: number; key: number }
  | { mode: 'edit'; observation: ObservationView; key: number }
  | null;

/**
 * Stellt den Beobachtungs-Dialog für die ganze Anwendung bereit und
 * registriert das Tastenkürzel Strg+N („Neue Beobachtung“).
 */
export function ObservationEditorProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<EditorState>(null);

  const openCreate = useCallback<ObservationEditorApi['openCreate']>((options) => {
    setState((current) => current ?? { mode: 'create', studentId: options?.studentId, key: Date.now() });
  }, []);

  const openEdit = useCallback<ObservationEditorApi['openEdit']>((observation) => {
    setState((current) => current ?? { mode: 'edit', observation, key: Date.now() });
  }, []);

  const close = useCallback(() => setState(null), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        openCreate();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openCreate]);

  const api = useMemo(() => ({ openCreate, openEdit }), [openCreate, openEdit]);

  return (
    <ObservationEditorContext.Provider value={api}>
      {children}
      {state && (
        <ObservationEditor
          key={state.key}
          observation={state.mode === 'edit' ? state.observation : undefined}
          initialStudentId={state.mode === 'create' ? state.studentId : undefined}
          onClose={close}
        />
      )}
    </ObservationEditorContext.Provider>
  );
}
