import { create } from 'zustand';

interface UiState {
  /** Zähler, der nach jedem Anlegen, Ändern oder Löschen von Daten erhöht wird. */
  dataVersion: number;
  bumpDataVersion: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  dataVersion: 0,
  bumpDataVersion: () => set((state) => ({ dataVersion: state.dataVersion + 1 })),
}));

/**
 * Für Seiten: den Wert in die Abhängigkeiten des Lade-Effekts aufnehmen,
 * dann wird nach jeder Datenänderung neu geladen.
 */
export const useDataVersion = () => useUiStore((state) => state.dataVersion);

/** Für Stellen, die Daten ändern (auch außerhalb von React aufrufbar). */
export const bumpDataVersion = () => useUiStore.getState().bumpDataVersion();
