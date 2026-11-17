import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeviceRoleGate } from '../DeviceRoleGate';
import { useAppStore } from '../../../stores/appStore';

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

let storedRole: string | null = null;
let suggestion = 'laptop';

function handlers(command: string): unknown {
  switch (command) {
    case 'get_device_role':
      return storedRole;
    case 'get_device_role_suggestion':
      return suggestion;
    case 'set_device_role':
      return null;
    case 'get_webdav_sync_status':
      return { configured: false, active: false, last_sync: null, url: null, username: null };
    default:
      return null;
  }
}

beforeEach(() => {
  storedRole = null;
  suggestion = 'laptop';
  invokeMock.mockReset();
  invokeMock.mockImplementation((command: string, args?: { role?: string }) => {
    if (command === 'set_device_role') storedRole = args?.role ?? null;
    return Promise.resolve(handlers(command));
  });
  useAppStore.setState({ deviceRole: null });
});

function renderGate() {
  return render(
    <DeviceRoleGate>
      <p>Die App</p>
    </DeviceRoleGate>,
  );
}

describe('DeviceRoleGate', () => {
  it('zeigt die Auswahl, solange keine Rolle gesetzt ist, und nicht die App', async () => {
    renderGate();
    expect(await screen.findByRole('heading', { name: 'Welches Gerät ist das?' })).toBeInTheDocument();
    expect(screen.getByText('Hier sammeln Sie Beobachtungen. Dieser Stand ist maßgeblich.')).toBeInTheDocument();
    expect(screen.getByText(/Übernimmt beim ersten Abgleich den Stand vom Laptop/)).toBeInTheDocument();
    expect(screen.queryByText('Die App')).not.toBeInTheDocument();
  });

  it('belegt die Auswahl aus dem Vorschlag vor und verlangt trotzdem „Weiter“', async () => {
    suggestion = 'desktop';
    renderGate();
    const desktop = await screen.findByRole('radio', { name: /^Desktop/ });
    await waitFor(() => expect(desktop).toBeChecked());
    expect(screen.getByRole('radio', { name: /^Laptop/ })).not.toBeChecked();
    expect(screen.queryByText('Die App')).not.toBeInTheDocument();
  });

  it('hält „Weiter“ ohne Auswahl gesperrt', async () => {
    invokeMock.mockImplementation((command: string) =>
      command === 'get_device_role_suggestion' ? Promise.reject('nicht verfügbar') : Promise.resolve(handlers(command)),
    );
    renderGate();
    const next = await screen.findByRole('button', { name: 'Weiter' });
    expect(next).toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: /^Laptop/ }));
    expect(next).toBeEnabled();
  });

  it('speichert die Rolle mit „Weiter“ und zeigt danach die App', async () => {
    renderGate();
    await waitFor(() => expect(screen.getByRole('radio', { name: /^Laptop/ })).toBeChecked());
    await userEvent.click(screen.getByRole('button', { name: 'Weiter' }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('set_device_role', { role: 'laptop' }));
    expect(await screen.findByText('Die App')).toBeInTheDocument();
  });

  it('zeigt die App sofort, wenn schon eine Rolle gespeichert ist', async () => {
    storedRole = 'desktop';
    renderGate();
    expect(await screen.findByText('Die App')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Welches Gerät ist das?' })).not.toBeInTheDocument();
  });

  it('meldet einen Fehler beim Speichern und bleibt auf der Auswahl', async () => {
    invokeMock.mockImplementation((command: string) =>
      command === 'set_device_role' ? Promise.reject('Disk full') : Promise.resolve(handlers(command)),
    );
    renderGate();
    await waitFor(() => expect(screen.getByRole('radio', { name: /^Laptop/ })).toBeChecked());
    await userEvent.click(screen.getByRole('button', { name: 'Weiter' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Die App')).not.toBeInTheDocument();
  });
});
