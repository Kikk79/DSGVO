import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UnifiedSyncManager } from '../UnifiedSyncManager';
import { renderWithProviders, createMockStore } from '../../test/utils';

// Mock file operations
global.URL.createObjectURL = vi.fn(() => 'mock-url');
global.URL.revokeObjectURL = vi.fn();

// Mock document methods
const mockDownloadLink = {
  click: vi.fn(),
  remove: vi.fn(),
  href: '',
  download: '',
};

Object.defineProperty(document, 'createElement', {
  writable: true,
  value: vi.fn().mockReturnValue(mockDownloadLink),
});

Object.defineProperty(document.body, 'appendChild', {
  writable: true,
  value: vi.fn(),
});

Object.defineProperty(document.body, 'removeChild', {
  writable: true,
  value: vi.fn(),
});

// Mock FileReader
global.FileReader = vi.fn().mockImplementation(() => ({
  readAsText: vi.fn(),
  addEventListener: vi.fn(),
  result: null,
}));

describe('UnifiedSyncManager Component', () => {
  let mockStore: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockStore = createMockStore({
      syncStatus: {
        last_sync: '2024-01-01T10:00:00Z',
      },
      deviceConfig: {
        device_name: 'Test Device',
        device_type: 'Computer'
      },
      loading: false,
      error: null
    });

    // Mock successful store methods
    mockStore.getSyncStatus.mockResolvedValue();
    mockStore.exportChangesetToFile.mockResolvedValue('Changeset exported successfully');
    mockStore.exportAllData.mockResolvedValue('{"format":"full_export","data":{}}');
    mockStore.importChangesetData.mockResolvedValue('Changeset imported successfully');
    mockStore.importFullBackupData.mockResolvedValue('Backup imported successfully');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial Rendering', () => {
    it('renders sync manager interface', () => {
      renderWithProviders(<UnifiedSyncManager />, { mockStore });
      
      expect(screen.getByText('Datensynchronisation')).toBeInTheDocument();
      expect(screen.getByText('Einheitlicher Export und Import aller Anwendungsdaten')).toBeInTheDocument();
      expect(screen.getByText('Systemstatus')).toBeInTheDocument();
      expect(screen.getByText('Daten exportieren')).toBeInTheDocument();
      expect(screen.getByText('Daten importieren')).toBeInTheDocument();
    });

    it('displays system status information', () => {
      renderWithProviders(<UnifiedSyncManager />, { mockStore });
      
      expect(screen.getByText('System bereit')).toBeInTheDocument();
      expect(screen.getByText(/Letzte Aktivität:/)).toBeInTheDocument();
      expect(screen.getByText(/Test Device/)).toBeInTheDocument();
      expect(screen.getByText(/Computer/)).toBeInTheDocument();
    });

    it('shows export type selection buttons', () => {
      renderWithProviders(<UnifiedSyncManager />, { mockStore });
      
      expect(screen.getByText('Changeset')).toBeInTheDocument();
      expect(screen.getByText('Nur Änderungen für Synchronisation zwischen Geräten')).toBeInTheDocument();
      expect(screen.getByText('Vollständiger Export')).toBeInTheDocument();
      expect(screen.getByText('Komplette Datenbank für Backup oder Migration')).toBeInTheDocument();
    });

    it('displays data range selector', () => {
      renderWithProviders(<UnifiedSyncManager />, { mockStore });
      
      const select = screen.getByDisplayValue('Letzte 30 Tage');
      expect(select).toBeInTheDocument();
      
      // Test other options
      expect(within(select as HTMLSelectElement).getByText('Letzte 7 Tage')).toBeInTheDocument();
      expect(within(select as HTMLSelectElement).getByText('Letzte 90 Tage')).toBeInTheDocument();
      expect(within(select as HTMLSelectElement).getByText('Letztes Jahr')).toBeInTheDocument();
      expect(within(select as HTMLSelectElement).getByText('Alle Daten')).toBeInTheDocument();
    });

    it('calls getSyncStatus on mount and sets up interval', async () => {
      renderWithProviders(<UnifiedSyncManager />, { mockStore });
      
      await waitFor(() => {
        expect(mockStore.getSyncStatus).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Export Type Selection', () => {
    it('allows switching between changeset and full export', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UnifiedSyncManager />, { mockStore });
      
      // Initially changeset should be selected (default)
      const changesetButton = screen.getByText('Changeset');
      const fullExportButton = screen.getByText('Vollständiger Export');
      
      expect(changesetButton.closest('button')).toHaveClass('border-blue-500');
      expect(fullExportButton.closest('button')).toHaveClass('border-gray-200');
      
      // Switch to full export
      await user.click(fullExportButton);
      
      await waitFor(() => {
        expect(fullExportButton.closest('button')).toHaveClass('border-blue-500');
        expect(changesetButton.closest('button')).toHaveClass('border-gray-200');
      });
    });

    it('updates description based on export type selection', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UnifiedSyncManager />, { mockStore });
      
      // Initially shows changeset description
      expect(screen.getByText('Änderungen der letzten 30 Tage')).toBeInTheDocument();
      
      // Switch to full export
      const fullExportButton = screen.getByText('Vollständiger Export');
      await user.click(fullExportButton);
      
      await waitFor(() => {
        expect(screen.getByText('Alle Schüler/Klassen + Beobachtungen der letzten 30 Tage')).toBeInTheDocument();
      });
    });
  });

  describe('Data Range Selection', () => {
    it('allows changing data range and updates description', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UnifiedSyncManager />, { mockStore });
      
      const select = screen.getByDisplayValue('Letzte 30 Tage');
      
      // Change to "All Data"
      await user.selectOptions(select, '-1');
      
      await waitFor(() => {
        expect(screen.getByText('Alle Änderungen seit Systembeginn')).toBeInTheDocument();
      });
      
      // Switch to full export and verify description changes
      const fullExportButton = screen.getByText('Vollständiger Export');
      await user.click(fullExportButton);
      
      await waitFor(() => {
        expect(screen.getByText('Vollständige Datenbank mit allen Schülern, Klassen und Beobachtungen')).toBeInTheDocument();
      });
    });
  });

  describe('Export Operations', () => {
    it('performs changeset export successfully', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UnifiedSyncManager />, { mockStore });
      
      const exportButton = screen.getByText('Changeset erstellen');
      await user.click(exportButton);
      
      await waitFor(() => {
        expect(mockStore.exportChangesetToFile).toHaveBeenCalledWith(
          expect.stringMatching(/\.\/changeset-.+\.dat/),
          30 // days back
        );
      });
    });

    it('performs full export successfully', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UnifiedSyncManager />, { mockStore });
      
      // Switch to full export
      const fullExportButton = screen.getByText('Vollständiger Export');
      await user.click(fullExportButton);
      
      // Click export button
      await waitFor(() => {
        expect(screen.getByText('Vollständigen Export erstellen')).toBeInTheDocument();
      });
      
      const exportButton = screen.getByText('Vollständigen Export erstellen');
      await user.click(exportButton);
      
      await waitFor(() => {
        expect(mockStore.exportAllData).toHaveBeenCalledWith(30);
      });
      
      // Verify file download was triggered
      expect(document.createElement).toHaveBeenCalledWith('a');
      expect(mockDownloadLink.click).toHaveBeenCalled();
    });

    it('handles export errors gracefully', async () => {
      const user = userEvent.setup();
      mockStore.exportChangesetToFile.mockRejectedValue(new Error('Export failed'));
      
      renderWithProviders(<UnifiedSyncManager />, { mockStore });
      
      const exportButton = screen.getByText('Changeset erstellen');
      await user.click(exportButton);
      
      // Should show error notification
      await waitFor(() => {
        expect(screen.getByText(/Export fehlgeschlagen/)).toBeInTheDocument();
      });
    });

    it('shows loading state during export', async () => {
      const user = userEvent.setup();
      mockStore.loading = true;
      
      renderWithProviders(<UnifiedSyncManager />, { mockStore });
      
      expect(screen.getByText('Exportiere...')).toBeInTheDocument();
    });
  });

  describe('Import Operations', () => {
    it('opens import dialog when button is clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UnifiedSyncManager />, { mockStore });
      
      const importButton = screen.getByText('Datei zum Import auswählen');
      await user.click(importButton);
      
      expect(screen.getByText('Daten importieren')).toBeInTheDocument();
      expect(screen.getByText('Import-Datei auswählen')).toBeInTheDocument();
      expect(screen.getByText('Unterstützte Formate: Changeset-Dateien (.dat), Vollständige Exporte (.json)')).toBeInTheDocument();
    });

    it('handles file selection', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UnifiedSyncManager />, { mockStore });
      
      // Open import dialog
      const importButton = screen.getByText('Datei zum Import auswählen');
      await user.click(importButton);
      
      // Mock file selection
      const fileInput = screen.getByRole('button', { name: /choose file/i }) || screen.getByLabelText('Import-Datei auswählen');
      const file = new File(['{"test": "data"}'], 'test.json', { type: 'application/json' });
      
      await user.upload(fileInput, file);
      
      await waitFor(() => {
        expect(screen.getByText('test.json')).toBeInTheDocument();
      });
    });

    it('imports JSON file successfully', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UnifiedSyncManager />, { mockStore });
      
      // Open import dialog
      const importButton = screen.getByText('Datei zum Import auswählen');
      await user.click(importButton);
      
      // Mock file with JSON data
      const jsonContent = '{"format":"full_export","data":{"classes":[],"students":[],"observations":[]}}';
      const mockFileReader = {
        readAsText: vi.fn(),
        result: jsonContent,
        onload: null as any,
      };
      
      vi.mocked(global.FileReader).mockImplementation(() => mockFileReader);
      
      // Select file
      const fileInput = screen.getByLabelText('Import-Datei auswählen');
      const file = new File([jsonContent], 'backup.json', { type: 'application/json' });
      
      await user.upload(fileInput, file);
      
      // Click import button
      const confirmImportButton = screen.getByText('Importieren');
      await user.click(confirmImportButton);
      
      // Simulate file reading completion
      mockFileReader.onload?.();
      
      await waitFor(() => {
        expect(mockStore.importFullBackupData).toHaveBeenCalledWith(jsonContent);
      });
    });

    it('imports changeset DAT file successfully', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UnifiedSyncManager />, { mockStore });
      
      // Open import dialog
      const importButton = screen.getByText('Datei zum Import auswählen');
      await user.click(importButton);
      
      // Mock changeset file content
      const changesetContent = '{"changeset":{"classes":[],"students":[],"observations":[]},"checksum":"abc123"}';
      const mockFileReader = {
        readAsText: vi.fn(),
        result: changesetContent,
        onload: null as any,
      };
      
      vi.mocked(global.FileReader).mockImplementation(() => mockFileReader);
      
      // Select DAT file
      const fileInput = screen.getByLabelText('Import-Datei auswählen');
      const file = new File([changesetContent], 'changeset.dat', { type: 'application/octet-stream' });
      
      await user.upload(fileInput, file);
      
      // Click import button
      const confirmImportButton = screen.getByText('Importieren');
      await user.click(confirmImportButton);
      
      // Simulate file reading completion
      mockFileReader.onload?.();
      
      await waitFor(() => {
        expect(mockStore.importChangesetData).toHaveBeenCalledWith(changesetContent);
      });
    });

    it('handles import errors gracefully', async () => {
      const user = userEvent.setup();
      mockStore.importFullBackupData.mockRejectedValue(new Error('Import failed'));
      
      renderWithProviders(<UnifiedSyncManager />, { mockStore });
      
      // Open import dialog and perform import
      const importButton = screen.getByText('Datei zum Import auswählen');
      await user.click(importButton);
      
      // Mock file reading
      const mockFileReader = {
        readAsText: vi.fn(),
        result: '{"format":"full_export","data":{}}',
        onload: null as any,
      };
      vi.mocked(global.FileReader).mockImplementation(() => mockFileReader);
      
      const fileInput = screen.getByLabelText('Import-Datei auswählen');
      const file = new File(['{}'], 'backup.json', { type: 'application/json' });
      
      await user.upload(fileInput, file);
      
      const confirmImportButton = screen.getByText('Importieren');
      await user.click(confirmImportButton);
      
      mockFileReader.onload?.();
      
      await waitFor(() => {
        expect(screen.getByText(/Import fehlgeschlagen/)).toBeInTheDocument();
      });
    });

    it('validates file formats', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UnifiedSyncManager />, { mockStore });
      
      // Open import dialog
      const importButton = screen.getByText('Datei zum Import auswählen');
      await user.click(importButton);
      
      // Mock file reading for invalid format
      const mockFileReader = {
        readAsText: vi.fn(),
        result: 'invalid content',
        onload: null as any,
      };
      vi.mocked(global.FileReader).mockImplementation(() => mockFileReader);
      
      const fileInput = screen.getByLabelText('Import-Datei auswählen');
      const file = new File(['invalid'], 'invalid.txt', { type: 'text/plain' });
      
      await user.upload(fileInput, file);
      
      const confirmImportButton = screen.getByText('Importieren');
      await user.click(confirmImportButton);
      
      mockFileReader.onload?.();
      
      await waitFor(() => {
        expect(screen.getByText(/Nicht unterstütztes Dateiformat/)).toBeInTheDocument();
      });
    });
  });

  describe('Refresh Operations', () => {
    it('refreshes status when refresh button is clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UnifiedSyncManager />, { mockStore });
      
      const refreshButton = screen.getByText('Aktualisieren');
      await user.click(refreshButton);
      
      await waitFor(() => {
        expect(mockStore.getSyncStatus).toHaveBeenCalledTimes(2); // Initial call + refresh
      });
    });

    it('shows spinning icon during refresh', async () => {
      const user = userEvent.setup();
      // Mock getSyncStatus to return a promise that we can control
      let resolveRefresh: () => void;
      const refreshPromise = new Promise<void>((resolve) => {
        resolveRefresh = resolve;
      });
      mockStore.getSyncStatus.mockImplementation(() => refreshPromise);
      
      renderWithProviders(<UnifiedSyncManager />, { mockStore });
      
      const refreshButton = screen.getByText('Aktualisieren');
      await user.click(refreshButton);
      
      // Button should be disabled during refresh
      expect(refreshButton).toBeDisabled();
      
      // Resolve the refresh
      resolveRefresh!();
      await refreshPromise;
      
      await waitFor(() => {
        expect(refreshButton).not.toBeDisabled();
      });
    });
  });

  describe('Notifications', () => {
    it('shows success notifications', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UnifiedSyncManager />, { mockStore });
      
      const exportButton = screen.getByText('Changeset erstellen');
      await user.click(exportButton);
      
      await waitFor(() => {
        expect(screen.getByText('Changeset exported successfully')).toBeInTheDocument();
      });
    });

    it('auto-hides notifications after 5 seconds', async () => {
      vi.useFakeTimers();
      const user = userEvent.setup();
      renderWithProviders(<UnifiedSyncManager />, { mockStore });
      
      const exportButton = screen.getByText('Changeset erstellen');
      await user.click(exportButton);
      
      await waitFor(() => {
        expect(screen.getByText('Changeset exported successfully')).toBeInTheDocument();
      });
      
      // Fast-forward 5 seconds
      vi.advanceTimersByTime(5000);
      
      await waitFor(() => {
        expect(screen.queryByText('Changeset exported successfully')).not.toBeInTheDocument();
      });
      
      vi.useRealTimers();
    });

    it('allows manual notification dismissal', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UnifiedSyncManager />, { mockStore });
      
      const exportButton = screen.getByText('Changeset erstellen');
      await user.click(exportButton);
      
      await waitFor(() => {
        expect(screen.getByText('Changeset exported successfully')).toBeInTheDocument();
      });
      
      // Click the X button to dismiss
      const dismissButton = screen.getByRole('button', { name: /close/i });
      await user.click(dismissButton);
      
      await waitFor(() => {
        expect(screen.queryByText('Changeset exported successfully')).not.toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('displays error state when store has error', () => {
      mockStore.error = 'Connection failed';
      renderWithProviders(<UnifiedSyncManager />, { mockStore });
      
      expect(screen.getByText('Fehler')).toBeInTheDocument();
      expect(screen.getByText('Connection failed')).toBeInTheDocument();
    });

    it('handles missing device config gracefully', () => {
      mockStore.deviceConfig = null;
      renderWithProviders(<UnifiedSyncManager />, { mockStore });
      
      expect(screen.getByText(/Gerät: Unbenannt/)).toBeInTheDocument();
    });

    it('handles missing sync status gracefully', () => {
      mockStore.syncStatus = null;
      renderWithProviders(<UnifiedSyncManager />, { mockStore });
      
      expect(screen.getByText(/Letzte Aktivität: Nie/)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('provides proper ARIA labels', () => {
      renderWithProviders(<UnifiedSyncManager />, { mockStore });
      
      const exportSection = screen.getByRole('button', { name: /changeset/i });
      expect(exportSection).toBeInTheDocument();
      
      const importSection = screen.getByText('Datei zum Import auswählen');
      expect(importSection).toBeInTheDocument();
    });

    it('supports keyboard navigation', async () => {
      const user = userEvent.setup();
      renderWithProviders(<UnifiedSyncManager />, { mockStore });
      
      // Tab through focusable elements
      await user.tab();
      expect(screen.getByText('Aktualisieren')).toHaveFocus();
      
      await user.tab();
      expect(screen.getByText('Changeset')).toHaveFocus();
      
      await user.tab();
      expect(screen.getByText('Vollständiger Export')).toHaveFocus();
    });
  });

  describe('Component Integration', () => {
    it('integrates properly with app store', () => {
      renderWithProviders(<UnifiedSyncManager />, { mockStore });
      
      // Verify store methods are called
      expect(mockStore.getSyncStatus).toHaveBeenCalled();
    });

    it('updates UI based on store state changes', async () => {
      const { rerender } = renderWithProviders(<UnifiedSyncManager />, { mockStore });
      
      expect(screen.queryByText('Exportiere...')).not.toBeInTheDocument();
      
      // Update store state
      mockStore.loading = true;
      rerender(<UnifiedSyncManager />);
      
      expect(screen.getByText('Exportiere...')).toBeInTheDocument();
    });
  });
});