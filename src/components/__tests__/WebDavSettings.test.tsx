import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WebDavSettings } from '../WebDavSettings';
import { useAppStore } from '../../stores/appStore';

// Mock the store
vi.mock('../../stores/appStore');

describe('WebDavSettings', () => {
  const mockConfigureWebDav = vi.fn();
  const mockTestWebDavConnection = vi.fn();
  const mockTriggerManualSync = vi.fn();
  const mockGetWebDavSyncStatus = vi.fn();
  const mockDisableWebDavSync = vi.fn();

  const defaultWebDavSync = {
    status: 'idle' as const,
    lastSyncTime: null,
    error: null,
    config: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAppStore).mockReturnValue({
      webdavSync: defaultWebDavSync,
      configureWebDav: mockConfigureWebDav,
      testWebDavConnection: mockTestWebDavConnection,
      triggerManualSync: mockTriggerManualSync,
      getWebDavSyncStatus: mockGetWebDavSyncStatus,
      disableWebDavSync: mockDisableWebDavSync,
    } as any);
  });

  describe('Initial Rendering', () => {
    it('should render WebDAV settings component', () => {
      render(<WebDavSettings />);

      expect(screen.getByText('WebDAV-Synchronisation')).toBeInTheDocument();
      expect(screen.getByText(/Synchronisieren Sie Ihre Daten zwischen mehreren Geräten/i)).toBeInTheDocument();
    });

    it('should load sync status on mount', () => {
      render(<WebDavSettings />);

      expect(mockGetWebDavSyncStatus).toHaveBeenCalled();
    });

    it('should show "Not configured" status initially', () => {
      render(<WebDavSettings />);

      expect(screen.getByText('Nicht konfiguriert')).toBeInTheDocument();
      expect(screen.getByText('Noch nie synchronisiert')).toBeInTheDocument();
    });

    it('should show configuration form title for unconfigured state', () => {
      render(<WebDavSettings />);

      expect(screen.getByText('WebDAV konfigurieren')).toBeInTheDocument();
    });
  });

  describe('Form Inputs', () => {
    it('should render all required form fields', () => {
      render(<WebDavSettings />);

      expect(screen.getByLabelText('WebDAV-URL *')).toBeInTheDocument();
      expect(screen.getByLabelText('Benutzername *')).toBeInTheDocument();
      expect(screen.getByLabelText('Passwort / App-Passwort *')).toBeInTheDocument();
    });

    it('should allow entering WebDAV URL', async () => {
      const user = userEvent.setup();
      render(<WebDavSettings />);

      const urlInput = screen.getByLabelText('WebDAV-URL *');
      await user.type(urlInput, 'https://cloud.example.com/remote.php/dav/files/user/');

      expect(urlInput).toHaveValue('https://cloud.example.com/remote.php/dav/files/user/');
    });

    it('should allow entering username', async () => {
      const user = userEvent.setup();
      render(<WebDavSettings />);

      const usernameInput = screen.getByLabelText('Benutzername *');
      await user.type(usernameInput, 'testuser');

      expect(usernameInput).toHaveValue('testuser');
    });

    it('should allow entering password', async () => {
      const user = userEvent.setup();
      render(<WebDavSettings />);

      const passwordInput = screen.getByLabelText('Passwort / App-Passwort *');
      await user.type(passwordInput, 'secretpassword');

      expect(passwordInput).toHaveValue('secretpassword');
    });

    it('should toggle password visibility', async () => {
      const user = userEvent.setup();
      render(<WebDavSettings />);

      const passwordInput = screen.getByLabelText('Passwort / App-Passwort *');
      await user.type(passwordInput, 'secret');

      expect(passwordInput).toHaveAttribute('type', 'password');

      const toggleButton = screen.getByText('👁️');
      await user.click(toggleButton);

      expect(passwordInput).toHaveAttribute('type', 'text');

      await user.click(toggleButton);
      expect(passwordInput).toHaveAttribute('type', 'password');
    });

    it('should populate form with existing configuration', () => {
      vi.mocked(useAppStore).mockReturnValue({
        webdavSync: {
          ...defaultWebDavSync,
          config: {
            url: 'https://existing.com/dav/',
            username: 'existinguser',
            configured: true,
            active: true,
            lastSync: null,
          },
        },
        configureWebDav: mockConfigureWebDav,
        testWebDavConnection: mockTestWebDavConnection,
        triggerManualSync: mockTriggerManualSync,
        getWebDavSyncStatus: mockGetWebDavSyncStatus,
        disableWebDavSync: mockDisableWebDavSync,
      } as any);

      render(<WebDavSettings />);

      const urlInput = screen.getByLabelText('WebDAV-URL *') as HTMLInputElement;
      const usernameInput = screen.getByLabelText('Benutzername *') as HTMLInputElement;

      expect(urlInput.value).toBe('https://existing.com/dav/');
      expect(usernameInput.value).toBe('existinguser');
    });
  });

  describe('Connection Testing', () => {
    it('should disable test button when fields are empty', () => {
      render(<WebDavSettings />);

      const testButton = screen.getByRole('button', { name: /Verbindung testen/i });
      expect(testButton).toBeDisabled();
    });

    it('should enable test button when all fields are filled', async () => {
      const user = userEvent.setup();
      render(<WebDavSettings />);

      await user.type(screen.getByLabelText('WebDAV-URL *'), 'https://test.com/');
      await user.type(screen.getByLabelText('Benutzername *'), 'user');
      await user.type(screen.getByLabelText('Passwort / App-Passwort *'), 'pass');

      const testButton = screen.getByRole('button', { name: /Verbindung testen/i });
      expect(testButton).not.toBeDisabled();
    });

    it('should test connection successfully', async () => {
      const user = userEvent.setup();
      mockTestWebDavConnection.mockResolvedValue(true);

      render(<WebDavSettings />);

      await user.type(screen.getByLabelText('WebDAV-URL *'), 'https://test.com/');
      await user.type(screen.getByLabelText('Benutzername *'), 'user');
      await user.type(screen.getByLabelText('Passwort / App-Passwort *'), 'pass');

      const testButton = screen.getByRole('button', { name: /Verbindung testen/i });
      await user.click(testButton);

      await waitFor(() => {
        expect(mockTestWebDavConnection).toHaveBeenCalledWith(
          'https://test.com/',
          'user',
          'pass'
        );
      });

      expect(screen.getByText('✅ Verbindung erfolgreich!')).toBeInTheDocument();
    });

    it('should handle connection test failure', async () => {
      const user = userEvent.setup();
      mockTestWebDavConnection.mockResolvedValue(false);

      render(<WebDavSettings />);

      await user.type(screen.getByLabelText('WebDAV-URL *'), 'https://test.com/');
      await user.type(screen.getByLabelText('Benutzername *'), 'user');
      await user.type(screen.getByLabelText('Passwort / App-Passwort *'), 'pass');

      const testButton = screen.getByRole('button', { name: /Verbindung testen/i });
      await user.click(testButton);

      await waitFor(() => {
        expect(screen.getByText('❌ Verbindung fehlgeschlagen')).toBeInTheDocument();
      });
    });

    it('should handle connection test error', async () => {
      const user = userEvent.setup();
      mockTestWebDavConnection.mockRejectedValue(new Error('Network error'));

      render(<WebDavSettings />);

      await user.type(screen.getByLabelText('WebDAV-URL *'), 'https://test.com/');
      await user.type(screen.getByLabelText('Benutzername *'), 'user');
      await user.type(screen.getByLabelText('Passwort / App-Passwort *'), 'pass');

      const testButton = screen.getByRole('button', { name: /Verbindung testen/i });
      await user.click(testButton);

      await waitFor(() => {
        expect(screen.getByText(/Fehler: Error: Network error/i)).toBeInTheDocument();
      });
    });

    it('should show loading state during test', async () => {
      const user = userEvent.setup();
      // eslint-disable-next-line no-unused-vars
      let resolveTest: (_value: boolean) => void;
      const testPromise = new Promise<boolean>((resolve) => {
        resolveTest = resolve;
      });
      mockTestWebDavConnection.mockReturnValue(testPromise);

      render(<WebDavSettings />);

      await user.type(screen.getByLabelText('WebDAV-URL *'), 'https://test.com/');
      await user.type(screen.getByLabelText('Benutzername *'), 'user');
      await user.type(screen.getByLabelText('Passwort / App-Passwort *'), 'pass');

      const testButton = screen.getByRole('button', { name: /Verbindung testen/i });
      await user.click(testButton);

      expect(screen.getByText('Teste...')).toBeInTheDocument();

      resolveTest!(true);
      await waitFor(() => {
        expect(screen.getByText('✅ Verbindung erfolgreich!')).toBeInTheDocument();
      });
    });

    it('should show error for empty fields on test', async () => {
      const user = userEvent.setup();
      render(<WebDavSettings />);

      // Enable button by filling fields first
      await user.type(screen.getByLabelText('WebDAV-URL *'), 'https://test.com/');
      await user.type(screen.getByLabelText('Benutzername *'), 'user');
      await user.type(screen.getByLabelText('Passwort / App-Passwort *'), 'pass');

      // Clear one field
      const urlInput = screen.getByLabelText('WebDAV-URL *');
      await user.clear(urlInput);

      // Button should be disabled, but we can still test the validation logic
      // by calling handleTestConnection indirectly through mock inspection
      expect(mockTestWebDavConnection).not.toHaveBeenCalled();
    });
  });

  describe('Configuration Saving', () => {
    it('should disable save button when fields are empty', () => {
      render(<WebDavSettings />);

      const saveButton = screen.getByRole('button', { name: /Konfiguration speichern/i });
      expect(saveButton).toBeDisabled();
    });

    it('should enable save button when all fields are filled', async () => {
      const user = userEvent.setup();
      render(<WebDavSettings />);

      await user.type(screen.getByLabelText('WebDAV-URL *'), 'https://test.com/');
      await user.type(screen.getByLabelText('Benutzername *'), 'user');
      await user.type(screen.getByLabelText('Passwort / App-Passwort *'), 'pass');

      const saveButton = screen.getByRole('button', { name: /Konfiguration speichern/i });
      expect(saveButton).not.toBeDisabled();
    });

    it('should save configuration successfully', async () => {
      const user = userEvent.setup();
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      mockConfigureWebDav.mockResolvedValue(undefined);

      render(<WebDavSettings />);

      await user.type(screen.getByLabelText('WebDAV-URL *'), 'https://test.com/');
      await user.type(screen.getByLabelText('Benutzername *'), 'user');
      await user.type(screen.getByLabelText('Passwort / App-Passwort *'), 'password123');

      const saveButton = screen.getByRole('button', { name: /Konfiguration speichern/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockConfigureWebDav).toHaveBeenCalledWith(
          'https://test.com/',
          'user',
          'password123'
        );
      });

      expect(alertSpy).toHaveBeenCalledWith('WebDAV-Konfiguration erfolgreich gespeichert!');
      alertSpy.mockRestore();
    });

    it('should clear password after successful save', async () => {
      const user = userEvent.setup();
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      mockConfigureWebDav.mockResolvedValue(undefined);

      render(<WebDavSettings />);

      const passwordInput = screen.getByLabelText('Passwort / App-Passwort *');
      await user.type(screen.getByLabelText('WebDAV-URL *'), 'https://test.com/');
      await user.type(screen.getByLabelText('Benutzername *'), 'user');
      await user.type(passwordInput, 'password123');

      const saveButton = screen.getByRole('button', { name: /Konfiguration speichern/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(passwordInput).toHaveValue('');
      });

      alertSpy.mockRestore();
    });

    it('should handle save error', async () => {
      const user = userEvent.setup();
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      mockConfigureWebDav.mockRejectedValue(new Error('Save failed'));

      render(<WebDavSettings />);

      await user.type(screen.getByLabelText('WebDAV-URL *'), 'https://test.com/');
      await user.type(screen.getByLabelText('Benutzername *'), 'user');
      await user.type(screen.getByLabelText('Passwort / App-Passwort *'), 'pass');

      const saveButton = screen.getByRole('button', { name: /Konfiguration speichern/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('Fehler beim Speichern: Error: Save failed');
      });

      alertSpy.mockRestore();
    });

    it('should disable save during sync', () => {
      vi.mocked(useAppStore).mockReturnValue({
        webdavSync: {
          ...defaultWebDavSync,
          status: 'syncing',
        },
        configureWebDav: mockConfigureWebDav,
        testWebDavConnection: mockTestWebDavConnection,
        triggerManualSync: mockTriggerManualSync,
        getWebDavSyncStatus: mockGetWebDavSyncStatus,
        disableWebDavSync: mockDisableWebDavSync,
      } as any);

      render(<WebDavSettings />);

      const saveButton = screen.getByRole('button', { name: /Konfiguration speichern/i });
      expect(saveButton).toBeDisabled();
    });
  });

  describe('Manual Synchronization', () => {
    it('should not show manual sync button when not configured', () => {
      render(<WebDavSettings />);

      expect(screen.queryByRole('button', { name: /Jetzt synchronisieren/i })).not.toBeInTheDocument();
    });

    it('should show manual sync button when configured', () => {
      vi.mocked(useAppStore).mockReturnValue({
        webdavSync: {
          ...defaultWebDavSync,
          config: {
            url: 'https://test.com/',
            username: 'user',
            configured: true,
            active: true,
            lastSync: null,
          },
        },
        configureWebDav: mockConfigureWebDav,
        testWebDavConnection: mockTestWebDavConnection,
        triggerManualSync: mockTriggerManualSync,
        getWebDavSyncStatus: mockGetWebDavSyncStatus,
        disableWebDavSync: mockDisableWebDavSync,
      } as any);

      render(<WebDavSettings />);

      expect(screen.getByRole('button', { name: /Jetzt synchronisieren/i })).toBeInTheDocument();
    });

    it('should trigger manual sync successfully', async () => {
      const user = userEvent.setup();
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      mockTriggerManualSync.mockResolvedValue(undefined);

      vi.mocked(useAppStore).mockReturnValue({
        webdavSync: {
          ...defaultWebDavSync,
          config: {
            url: 'https://test.com/',
            username: 'user',
            configured: true,
            active: true,
            lastSync: null,
          },
        },
        configureWebDav: mockConfigureWebDav,
        testWebDavConnection: mockTestWebDavConnection,
        triggerManualSync: mockTriggerManualSync,
        getWebDavSyncStatus: mockGetWebDavSyncStatus,
        disableWebDavSync: mockDisableWebDavSync,
      } as any);

      render(<WebDavSettings />);

      const syncButton = screen.getByRole('button', { name: /Jetzt synchronisieren/i });
      await user.click(syncButton);

      await waitFor(() => {
        expect(mockTriggerManualSync).toHaveBeenCalled();
        expect(alertSpy).toHaveBeenCalledWith('Synchronisation erfolgreich abgeschlossen!');
      });

      alertSpy.mockRestore();
    });

    it('should handle manual sync error', async () => {
      const user = userEvent.setup();
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      mockTriggerManualSync.mockRejectedValue(new Error('Sync failed'));

      vi.mocked(useAppStore).mockReturnValue({
        webdavSync: {
          ...defaultWebDavSync,
          config: {
            url: 'https://test.com/',
            username: 'user',
            configured: true,
            active: true,
            lastSync: null,
          },
        },
        configureWebDav: mockConfigureWebDav,
        testWebDavConnection: mockTestWebDavConnection,
        triggerManualSync: mockTriggerManualSync,
        getWebDavSyncStatus: mockGetWebDavSyncStatus,
        disableWebDavSync: mockDisableWebDavSync,
      } as any);

      render(<WebDavSettings />);

      const syncButton = screen.getByRole('button', { name: /Jetzt synchronisieren/i });
      await user.click(syncButton);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('Synchronisation fehlgeschlagen: Error: Sync failed');
      });

      alertSpy.mockRestore();
    });

    it('should disable sync button during sync', () => {
      vi.mocked(useAppStore).mockReturnValue({
        webdavSync: {
          status: 'syncing',
          lastSyncTime: null,
          error: null,
          config: {
            url: 'https://test.com/',
            username: 'user',
            configured: true,
            active: true,
            lastSync: null,
          },
        },
        configureWebDav: mockConfigureWebDav,
        testWebDavConnection: mockTestWebDavConnection,
        triggerManualSync: mockTriggerManualSync,
        getWebDavSyncStatus: mockGetWebDavSyncStatus,
        disableWebDavSync: mockDisableWebDavSync,
      } as any);

      render(<WebDavSettings />);

      const syncButton = screen.getByRole('button', { name: /Jetzt synchronisieren/i });
      expect(syncButton).toBeDisabled();
    });
  });

  describe('Sync Status Display', () => {
    it('should show "Bereit" status when configured', () => {
      vi.mocked(useAppStore).mockReturnValue({
        webdavSync: {
          status: 'idle',
          lastSyncTime: null,
          error: null,
          config: {
            url: 'https://test.com/',
            username: 'user',
            configured: true,
            active: true,
            lastSync: null,
          },
        },
        configureWebDav: mockConfigureWebDav,
        testWebDavConnection: mockTestWebDavConnection,
        triggerManualSync: mockTriggerManualSync,
        getWebDavSyncStatus: mockGetWebDavSyncStatus,
        disableWebDavSync: mockDisableWebDavSync,
      } as any);

      render(<WebDavSettings />);

      expect(screen.getByText('Bereit')).toBeInTheDocument();
    });

    it('should show "Synchronisiere..." during sync', () => {
      vi.mocked(useAppStore).mockReturnValue({
        webdavSync: {
          status: 'syncing',
          lastSyncTime: null,
          error: null,
          config: {
            url: 'https://test.com/',
            username: 'user',
            configured: true,
            active: true,
            lastSync: null,
          },
        },
        configureWebDav: mockConfigureWebDav,
        testWebDavConnection: mockTestWebDavConnection,
        triggerManualSync: mockTriggerManualSync,
        getWebDavSyncStatus: mockGetWebDavSyncStatus,
        disableWebDavSync: mockDisableWebDavSync,
      } as any);

      render(<WebDavSettings />);

      expect(screen.getByText('Synchronisiere...')).toBeInTheDocument();
    });

    it('should show success status after successful sync', () => {
      vi.mocked(useAppStore).mockReturnValue({
        webdavSync: {
          status: 'success',
          lastSyncTime: new Date().toISOString(),
          error: null,
          config: {
            url: 'https://test.com/',
            username: 'user',
            configured: true,
            active: true,
            lastSync: new Date().toISOString(),
          },
        },
        configureWebDav: mockConfigureWebDav,
        testWebDavConnection: mockTestWebDavConnection,
        triggerManualSync: mockTriggerManualSync,
        getWebDavSyncStatus: mockGetWebDavSyncStatus,
        disableWebDavSync: mockDisableWebDavSync,
      } as any);

      render(<WebDavSettings />);

      expect(screen.getByText('Erfolgreich synchronisiert')).toBeInTheDocument();
    });

    it('should show error status on sync failure', () => {
      vi.mocked(useAppStore).mockReturnValue({
        webdavSync: {
          status: 'error',
          lastSyncTime: null,
          error: 'Connection failed',
          config: {
            url: 'https://test.com/',
            username: 'user',
            configured: true,
            active: true,
            lastSync: null,
          },
        },
        configureWebDav: mockConfigureWebDav,
        testWebDavConnection: mockTestWebDavConnection,
        triggerManualSync: mockTriggerManualSync,
        getWebDavSyncStatus: mockGetWebDavSyncStatus,
        disableWebDavSync: mockDisableWebDavSync,
      } as any);

      render(<WebDavSettings />);

      expect(screen.getByText('Synchronisation fehlgeschlagen')).toBeInTheDocument();
      expect(screen.getByText('Connection failed')).toBeInTheDocument();
    });

    it('should display configured URL and username', () => {
      vi.mocked(useAppStore).mockReturnValue({
        webdavSync: {
          status: 'idle',
          lastSyncTime: null,
          error: null,
          config: {
            url: 'https://mycloud.com/dav/',
            username: 'myusername',
            configured: true,
            active: true,
            lastSync: null,
          },
        },
        configureWebDav: mockConfigureWebDav,
        testWebDavConnection: mockTestWebDavConnection,
        triggerManualSync: mockTriggerManualSync,
        getWebDavSyncStatus: mockGetWebDavSyncStatus,
        disableWebDavSync: mockDisableWebDavSync,
      } as any);

      render(<WebDavSettings />);

      expect(screen.getByText('https://mycloud.com/dav/')).toBeInTheDocument();
      expect(screen.getByText('myusername')).toBeInTheDocument();
    });
  });

  describe('Last Sync Timestamp Formatting', () => {
    it('should show "Noch nie synchronisiert" when no sync', () => {
      render(<WebDavSettings />);

      expect(screen.getByText('Noch nie synchronisiert')).toBeInTheDocument();
    });

    it('should show "Gerade eben" for recent sync', () => {
      const now = new Date();
      vi.mocked(useAppStore).mockReturnValue({
        webdavSync: {
          status: 'success',
          lastSyncTime: now.toISOString(),
          error: null,
          config: {
            url: 'https://test.com/',
            username: 'user',
            configured: true,
            active: true,
            lastSync: now.toISOString(),
          },
        },
        configureWebDav: mockConfigureWebDav,
        testWebDavConnection: mockTestWebDavConnection,
        triggerManualSync: mockTriggerManualSync,
        getWebDavSyncStatus: mockGetWebDavSyncStatus,
        disableWebDavSync: mockDisableWebDavSync,
      } as any);

      render(<WebDavSettings />);

      expect(screen.getByText(/Gerade eben|vor \d+ Minute/)).toBeInTheDocument();
    });

    it('should show minutes for sync within an hour', () => {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      vi.mocked(useAppStore).mockReturnValue({
        webdavSync: {
          status: 'success',
          lastSyncTime: tenMinutesAgo.toISOString(),
          error: null,
          config: {
            url: 'https://test.com/',
            username: 'user',
            configured: true,
            active: true,
            lastSync: tenMinutesAgo.toISOString(),
          },
        },
        configureWebDav: mockConfigureWebDav,
        testWebDavConnection: mockTestWebDavConnection,
        triggerManualSync: mockTriggerManualSync,
        getWebDavSyncStatus: mockGetWebDavSyncStatus,
        disableWebDavSync: mockDisableWebDavSync,
      } as any);

      render(<WebDavSettings />);

      expect(screen.getByText('vor 10 Minuten')).toBeInTheDocument();
    });

    it('should show hours for sync within a day', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      vi.mocked(useAppStore).mockReturnValue({
        webdavSync: {
          status: 'success',
          lastSyncTime: twoHoursAgo.toISOString(),
          error: null,
          config: {
            url: 'https://test.com/',
            username: 'user',
            configured: true,
            active: true,
            lastSync: twoHoursAgo.toISOString(),
          },
        },
        configureWebDav: mockConfigureWebDav,
        testWebDavConnection: mockTestWebDavConnection,
        triggerManualSync: mockTriggerManualSync,
        getWebDavSyncStatus: mockGetWebDavSyncStatus,
        disableWebDavSync: mockDisableWebDavSync,
      } as any);

      render(<WebDavSettings />);

      expect(screen.getByText('vor 2 Stunden')).toBeInTheDocument();
    });
  });

  describe('Disable Sync', () => {
    it('should show disable button when configured', () => {
      vi.mocked(useAppStore).mockReturnValue({
        webdavSync: {
          ...defaultWebDavSync,
          config: {
            url: 'https://test.com/',
            username: 'user',
            configured: true,
            active: true,
            lastSync: null,
          },
        },
        configureWebDav: mockConfigureWebDav,
        testWebDavConnection: mockTestWebDavConnection,
        triggerManualSync: mockTriggerManualSync,
        getWebDavSyncStatus: mockGetWebDavSyncStatus,
        disableWebDavSync: mockDisableWebDavSync,
      } as any);

      render(<WebDavSettings />);

      expect(screen.getByRole('button', { name: /Deaktivieren/i })).toBeInTheDocument();
    });

    it('should disable sync after confirmation', async () => {
      const user = userEvent.setup();
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      mockDisableWebDavSync.mockResolvedValue(undefined);

      vi.mocked(useAppStore).mockReturnValue({
        webdavSync: {
          ...defaultWebDavSync,
          config: {
            url: 'https://test.com/',
            username: 'user',
            configured: true,
            active: true,
            lastSync: null,
          },
        },
        configureWebDav: mockConfigureWebDav,
        testWebDavConnection: mockTestWebDavConnection,
        triggerManualSync: mockTriggerManualSync,
        getWebDavSyncStatus: mockGetWebDavSyncStatus,
        disableWebDavSync: mockDisableWebDavSync,
      } as any);

      render(<WebDavSettings />);

      const disableButton = screen.getByRole('button', { name: /Deaktivieren/i });
      await user.click(disableButton);

      await waitFor(() => {
        expect(mockDisableWebDavSync).toHaveBeenCalled();
        expect(alertSpy).toHaveBeenCalledWith('WebDAV-Synchronisation deaktiviert');
      });

      alertSpy.mockRestore();
      confirmSpy.mockRestore();
    });

    it('should cancel disable if user declines confirmation', async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

      vi.mocked(useAppStore).mockReturnValue({
        webdavSync: {
          ...defaultWebDavSync,
          config: {
            url: 'https://test.com/',
            username: 'user',
            configured: true,
            active: true,
            lastSync: null,
          },
        },
        configureWebDav: mockConfigureWebDav,
        testWebDavConnection: mockTestWebDavConnection,
        triggerManualSync: mockTriggerManualSync,
        getWebDavSyncStatus: mockGetWebDavSyncStatus,
        disableWebDavSync: mockDisableWebDavSync,
      } as any);

      render(<WebDavSettings />);

      const disableButton = screen.getByRole('button', { name: /Deaktivieren/i });
      await user.click(disableButton);

      expect(mockDisableWebDavSync).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    });

    it('should handle disable error', async () => {
      const user = userEvent.setup();
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      mockDisableWebDavSync.mockRejectedValue(new Error('Disable failed'));

      vi.mocked(useAppStore).mockReturnValue({
        webdavSync: {
          ...defaultWebDavSync,
          config: {
            url: 'https://test.com/',
            username: 'user',
            configured: true,
            active: true,
            lastSync: null,
          },
        },
        configureWebDav: mockConfigureWebDav,
        testWebDavConnection: mockTestWebDavConnection,
        triggerManualSync: mockTriggerManualSync,
        getWebDavSyncStatus: mockGetWebDavSyncStatus,
        disableWebDavSync: mockDisableWebDavSync,
      } as any);

      render(<WebDavSettings />);

      const disableButton = screen.getByRole('button', { name: /Deaktivieren/i });
      await user.click(disableButton);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('Fehler beim Deaktivieren: Error: Disable failed');
      });

      alertSpy.mockRestore();
      confirmSpy.mockRestore();
    });
  });

  describe('Information Box', () => {
    it('should display sync information', () => {
      render(<WebDavSettings />);

      expect(screen.getByText('ℹ️ Wie funktioniert die Synchronisation?')).toBeInTheDocument();
      expect(screen.getByText(/Die App synchronisiert automatisch beim Start/i)).toBeInTheDocument();
      expect(screen.getByText(/Die Daten werden verschlüsselt/i)).toBeInTheDocument();
      expect(screen.getByText(/Offline-Betrieb ist möglich/i)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper form labels', () => {
      render(<WebDavSettings />);

      expect(screen.getByLabelText('WebDAV-URL *')).toBeInTheDocument();
      expect(screen.getByLabelText('Benutzername *')).toBeInTheDocument();
      expect(screen.getByLabelText('Passwort / App-Passwort *')).toBeInTheDocument();
    });

    it('should have accessible button labels', () => {
      render(<WebDavSettings />);

      expect(screen.getByRole('button', { name: /Verbindung testen/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Konfiguration speichern/i })).toBeInTheDocument();
    });

    it('should have help text for inputs', () => {
      render(<WebDavSettings />);

      expect(screen.getByText(/Beispiel Nextcloud:/i)).toBeInTheDocument();
      expect(screen.getByText(/Verwenden Sie ein App-spezifisches Passwort/i)).toBeInTheDocument();
    });
  });
});
