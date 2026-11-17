import type { TabItem } from '../../components/ui/Tabs';

/** Reiter der Einstellungen; die id ist zugleich der Teil der Adresse (/einstellungen/:tab). */
export type SettingsTab = 'kategorien' | 'synchronisation' | 'daten' | 'datenschutz';

export const SETTINGS_TABS: TabItem<SettingsTab>[] = [
  { id: 'kategorien', label: 'Kategorien' },
  { id: 'synchronisation', label: 'Synchronisation' },
  { id: 'daten', label: 'Daten' },
  { id: 'datenschutz', label: 'Datenschutz' },
];

export const isSettingsTab = (value: string | undefined): value is SettingsTab =>
  SETTINGS_TABS.some((tab) => tab.id === value);
