import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Laptop, Monitor } from 'lucide-react';
import { useAppStore, type DeviceRole } from '../../stores/appStore';
import { errorMessage } from '../../lib/errors';
import { cx } from '../../lib/cx';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';

const OPTIONS: Array<{ value: DeviceRole; title: string; text: string; icon: ReactNode }> = [
  {
    value: 'laptop',
    title: 'Laptop',
    text: 'Hier sammeln Sie Beobachtungen. Dieser Stand ist maßgeblich.',
    icon: <Laptop aria-hidden="true" className="h-6 w-6" strokeWidth={1.75} />,
  },
  {
    value: 'desktop',
    title: 'Desktop',
    text: 'Zweitgerät ohne eigene Daten. Beim ersten Abgleich wird alles, was auf diesem Gerät gespeichert ist, durch den Stand vom Laptop ersetzt. Liegen Ihre echten Beobachtungen auf diesem Gerät, wählen Sie bitte „Laptop“.',
    icon: <Monitor aria-hidden="true" className="h-6 w-6" strokeWidth={1.75} />,
  },
];

type LoadState = 'loading' | 'ready' | 'error';

/**
 * Pflichtauswahl der Geräterolle: Solange das Gerät keine Rolle hat, zeigt die App nur diesen
 * Bildschirm. Ein Vorschlag (nur bei ausdrücklich gesetztem Gerätetyp) ist vorgewählt, muss aber
 * bestätigt werden; ohne Vorschlag ist nichts vorgewählt.
 */
export function DeviceRoleGate({ children }: { children: ReactNode }) {
  const role = useAppStore((state) => state.deviceRole);
  const getDeviceRole = useAppStore((state) => state.getDeviceRole);
  const getDeviceRoleSuggestion = useAppStore((state) => state.getDeviceRoleSuggestion);
  const setDeviceRole = useAppStore((state) => state.setDeviceRole);

  const [load, setLoad] = useState<LoadState>('loading');
  const [choice, setChoice] = useState<DeviceRole | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setLoad('loading');
    try {
      const current = await getDeviceRole();
      if (current === null) {
        // Ohne Vorschlag bleibt die Auswahl leer; „Weiter“ ist dann gesperrt.
        const suggestion = await getDeviceRoleSuggestion().catch(() => null);
        setChoice((previous) => previous ?? suggestion);
      }
      setLoad('ready');
    } catch (loadError) {
      console.error('Geräterolle konnte nicht gelesen werden:', loadError);
      setLoad('error');
    }
  }, [getDeviceRole, getDeviceRoleSuggestion]);

  useEffect(() => {
    void start();
  }, [start]);

  if (load === 'ready' && role !== null) return <>{children}</>;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!choice) return;
    setSaving(true);
    setError(null);
    try {
      await setDeviceRole(choice);
    } catch (saveError) {
      console.error('Geräterolle konnte nicht gespeichert werden:', saveError);
      setError(errorMessage(saveError, 'Die Auswahl konnte nicht gespeichert werden.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-6 py-10">
      {load === 'loading' && <Spinner label="Wird geladen …" />}

      {load === 'error' && (
        <div role="alert" className="max-w-measure space-y-4 text-center">
          <p className="text-ui font-medium text-rotstift-dark">Die Einstellungen dieses Geräts konnten nicht gelesen werden.</p>
          <Button variant="secondary" onClick={() => void start()}>
            Erneut versuchen
          </Button>
        </div>
      )}

      {load === 'ready' && (
        <form onSubmit={handleSubmit} className="w-full max-w-[40rem]">
          <p className="text-meta uppercase text-ink-muted">Erster Start</p>
          <h1 className="mt-2 font-display text-[2rem] font-[520] leading-tight tracking-[-0.01em] text-ink">
            Welches Gerät ist das?
          </h1>

          <fieldset className="mt-8">
            <legend className="sr-only">Geräterolle</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              {OPTIONS.map((option) => {
                const selected = choice === option.value;
                return (
                  <label
                    key={option.value}
                    className={cx(
                      'relative flex cursor-pointer flex-col gap-2 rounded border-2 bg-surface p-5 transition-colors duration-150',
                      'focus-within:ring-2 focus-within:ring-tafel-600 focus-within:ring-offset-2 focus-within:ring-offset-paper',
                      selected ? 'border-tafel-700 bg-tafel-100/50' : 'border-line hover:border-tafel-600',
                    )}
                  >
                    <input
                      type="radio"
                      name="device-role"
                      value={option.value}
                      checked={selected}
                      onChange={() => setChoice(option.value)}
                      className="sr-only"
                    />
                    <span className={cx('flex items-center gap-3', selected ? 'text-tafel-800' : 'text-ink')}>
                      {option.icon}
                      <span className="font-display text-title font-[520]">{option.title}</span>
                    </span>
                    <span className="text-ui text-ink-muted">{option.text}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {error && (
            <p
              role="alert"
              className="mt-5 rounded border border-rotstift/40 bg-rotstift-soft px-3 py-2 text-small font-medium text-rotstift-dark"
            >
              {error}
            </p>
          )}

          <div className="mt-8">
            <Button type="submit" loading={saving} disabled={!choice}>
              Weiter
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
