import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SyncStatusLink } from '../AppShell';
import { useAppStore } from '../../../stores/appStore';

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

const WARNING =
  'Bis der Stand vom Laptop übernommen ist, gehen Einträge auf diesem Gerät beim ersten Abgleich verloren. Erfassen Sie bitte noch nichts.';

const config = { configured: true, active: true, url: 'https://cloud.example/dav/', username: 'lehrkraft', lastSync: null };

function renderLink() {
  return render(
    <MemoryRouter>
      <SyncStatusLink />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(null);
});

describe('SyncStatusLink', () => {
  it('warnt auf dem wartenden Desktop vor Datenverlust (sichtbar und als Tooltip)', () => {
    useAppStore.setState({
      deviceRole: 'desktop',
      webdavSync: {
        status: 'idle',
        lastSyncTime: null,
        error: null,
        config,
        lastOutcome: 'waiting_for_laptop',
        firstSyncDone: false,
      },
    });
    renderLink();
    expect(screen.getByRole('status')).toHaveTextContent('Warte auf den Stand vom Laptop');
    expect(screen.getByRole('status')).toHaveTextContent(WARNING);
    expect(screen.getByRole('link')).toHaveAttribute('title', WARNING);
  });

  it('zeigt die Warnung nach dem ersten Abgleich nicht mehr', () => {
    useAppStore.setState({
      deviceRole: 'desktop',
      webdavSync: {
        status: 'idle',
        lastSyncTime: '2026-11-17T10:00:00Z',
        error: null,
        config,
        lastOutcome: 'synced',
        firstSyncDone: true,
      },
    });
    renderLink();
    expect(screen.getByRole('status')).not.toHaveTextContent('Erfassen Sie bitte noch nichts');
    expect(screen.getByRole('link')).not.toHaveAttribute('title');
  });
});
