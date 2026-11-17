import type { ComponentType } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/ui/PageHeader';
import { Tabs } from '../../components/ui/Tabs';
import { isSettingsTab, SETTINGS_TABS, type SettingsTab } from './tabs';
import { tabId, tabPanelId } from '../../components/ui/tabIds';
import { KategorienTab } from './KategorienTab';
import { SynchronisationTab } from './SynchronisationTab';
import { DatenTab } from './DatenTab';
import { DatenschutzTab } from './DatenschutzTab';

const PANELS: Record<SettingsTab, ComponentType> = {
  kategorien: KategorienTab,
  synchronisation: SynchronisationTab,
  daten: DatenTab,
  datenschutz: DatenschutzTab,
};

/** Einstellungen mit Reitern; der Reiter steht in der Adresse (/einstellungen/:tab). */
export function EinstellungenPage() {
  const { tab } = useParams<{ tab: string }>();
  const navigate = useNavigate();

  if (!isSettingsTab(tab)) {
    return <Navigate to={`/einstellungen/${SETTINGS_TABS[0].id}`} replace />;
  }

  const Panel = PANELS[tab];

  return (
    <div className="page-enter max-w-page space-y-8">
      <PageHeader
        title="Einstellungen"
        description="Kategorien, Abgleich zwischen Geräten, Sicherungen und Auskunft über die gespeicherten Daten."
      />
      <Tabs
        tabs={SETTINGS_TABS}
        value={tab}
        onChange={(next) => navigate(`/einstellungen/${next}`)}
        ariaLabel="Bereiche der Einstellungen"
        className="flex-wrap gap-x-6 gap-y-1"
      />
      <div role="tabpanel" id={tabPanelId(tab)} aria-labelledby={tabId(tab)} tabIndex={0} className="focus-visible:outline-offset-8">
        <Panel key={tab} />
      </div>
    </div>
  );
}
