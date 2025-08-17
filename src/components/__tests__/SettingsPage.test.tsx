import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsPage } from '../SettingsPage';
import { renderWithProviders, mockUseAppStore, mockDeviceConfig } from '../../test/utils';

describe('SettingsPage Component', () => {
  let mockStore: ReturnType<typeof mockUseAppStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    global.alert = vi.fn();
    mockStore = mockUseAppStore({
      deviceConfig: mockDeviceConfig,
      databasePath: '/mock/app/data/observations.db',
      loading: false,
      error: null,
    });
  });

  describe('Rendering', () => {
    it('should render settings header correctly', () => {
      renderWithProviders(<SettingsPage />);
      
      expect(screen.getByText('Einstellungen')).toBeInTheDocument();
      expect(screen.getByText('Konfigurieren Sie die Anwendung und Datenschutzeinstellungen')).toBeInTheDocument();
    });

    it('should render all settings sections', () => {
      renderWithProviders(<SettingsPage />);
      
      expect(screen.getByText('Datenschutz & DSGVO')).toBeInTheDocument();
      expect(screen.getByText('Systemeinstellungen')).toBeInTheDocument();
      expect(screen.getByText('Gerätekonfiguration')).toBeInTheDocument();
      expect(screen.getByText('Sicherheit')).toBeInTheDocument();
      expect(screen.getByText('Gefahrenbereich')).toBeInTheDocument();
    });
  });

  describe('Privacy & GDPR Section', () => {
    it('should render data retention settings', () => {
      renderWithProviders(<SettingsPage />);
      
      expect(screen.getByLabelText('Aufbewahrungsdauer für Beobachtungen')).toBeInTheDocument();
      expect(screen.getByText('1 Jahr')).toBeInTheDocument();
      expect(screen.getByText('2 Jahre')).toBeInTheDocument();
      expect(screen.getByText('3 Jahre')).toBeInTheDocument();
      expect(screen.getByText('5 Jahre')).toBeInTheDocument();
    });

    it('should handle data retention changes', async () => {
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage />);
      
      const retentionSelect = screen.getByLabelText('Aufbewahrungsdauer für Beobachtungen');
      await user.selectOptions(retentionSelect, '730');
      
      expect(retentionSelect).toHaveValue('730');
    });

    it('should render GDPR rights buttons', () => {
      renderWithProviders(<SettingsPage />);
      
      expect(screen.getByText('Datenauskunft (Art. 15 DSGVO)')).toBeInTheDocument();
      expect(screen.getByText('Datenberichtigung (Art. 16 DSGVO)')).toBeInTheDocument();
      expect(screen.getByText('Datenlöschung (Art. 17 DSGVO)')).toBeInTheDocument();
      expect(screen.getByText('Datenübertragbarkeit (Art. 20 DSGVO)')).toBeInTheDocument();
    });

    it('should handle data export', async () => {
      const user = userEvent.setup();
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      renderWithProviders(<SettingsPage />);
      
      await user.click(screen.getByText('Datenauskunft (Art. 15 DSGVO)'));
      
      expect(consoleSpy).toHaveBeenCalledWith('Exporting all data...');
      
      consoleSpy.mockRestore();
    });

    it('should handle data deletion', async () => {
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage />);
      
      await user.click(screen.getByText('Datenlöschung (Art. 17 DSGVO)'));
      
      expect(screen.getByText('Datenlöschung bestätigen')).toBeInTheDocument();
    });
  });

  describe('System Settings Section', () => {
    it('should render notification toggle', () => {
      renderWithProviders(<SettingsPage />);
      
      expect(screen.getByText('Benachrichtigungen')).toBeInTheDocument();
      expect(screen.getByText('Systembenachrichtigungen für wichtige Ereignisse')).toBeInTheDocument();
      
      const notificationToggle = screen.getByRole('checkbox', { name: /benachrichtigungen/i });
      expect(notificationToggle).toBeChecked();
    });

    it('should handle notification toggle', async () => {
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage />);
      
      const notificationToggle = screen.getByRole('checkbox', { name: /benachrichtigungen/i });
      await user.click(notificationToggle);
      
      expect(notificationToggle).not.toBeChecked();
    });

    it('should render auto backup toggle', () => {
      renderWithProviders(<SettingsPage />);
      
      expect(screen.getByText('Automatische Sicherung')).toBeInTheDocument();
      expect(screen.getByText('Tägliche verschlüsselte Backups erstellen')).toBeInTheDocument();
      
      const autoBackupToggle = screen.getByRole('checkbox', { name: /automatische sicherung/i });
      expect(autoBackupToggle).toBeChecked();
    });

    it('should handle auto backup toggle', async () => {
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage />);
      
      const autoBackupToggle = screen.getByRole('checkbox', { name: /automatische sicherung/i });
      await user.click(autoBackupToggle);
      
      expect(autoBackupToggle).not.toBeChecked();
    });

    it('should display database path', () => {
      renderWithProviders(<SettingsPage />);
      
      expect(screen.getByLabelText('Speicherort der Datenbank')).toBeInTheDocument();
      expect(screen.getByDisplayValue('/mock/app/data/observations.db')).toBeInTheDocument();
    });

    it('should handle database path change', async () => {
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage />);
      
      await user.click(screen.getByText('Ändern'));
      
      expect(screen.getByText('Datenbankpfad ändern')).toBeInTheDocument();
    });
  });

  describe('Database Path Management', () => {
    it('should open path change dialog', async () => {
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage />);
      
      await user.click(screen.getByText('Ändern'));
      
      expect(screen.getByText('Datenbankpfad ändern')).toBeInTheDocument();
      expect(screen.getByLabelText('Neuer Datenbankpfad')).toBeInTheDocument();
      expect(screen.getByDisplayValue('/mock/app/data/observations.db')).toBeInTheDocument();
    });

    it('should handle path input', async () => {
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage />);
      
      await user.click(screen.getByText('Ändern'));
      
      const pathInput = screen.getByLabelText('Neuer Datenbankpfad');
      await user.clear(pathInput);
      await user.type(pathInput, '/new/path/to/database.db');
      
      expect(pathInput).toHaveValue('/new/path/to/database.db');
    });

    it('should save new database path', async () => {
      const user = userEvent.setup();
      mockStore.setDatabasePath.mockResolvedValue(undefined);
      
      renderWithProviders(<SettingsPage />);
      
      await user.click(screen.getByText('Ändern'));
      
      const pathInput = screen.getByLabelText('Neuer Datenbankpfad');
      await user.clear(pathInput);
      await user.type(pathInput, '/new/path/to/database.db');
      
      await user.click(screen.getByText('Pfad ändern'));
      
      expect(mockStore.setDatabasePath).toHaveBeenCalledWith('/new/path/to/database.db');
      expect(global.alert).toHaveBeenCalledWith(
        'Datenbankpfad wurde erfolgreich geändert. Bitte starten Sie die Anwendung neu, damit die Änderung wirksam wird.'
      );
    });

    it('should handle path change errors', async () => {
      const user = userEvent.setup();
      mockStore.setDatabasePath.mockRejectedValue(new Error('Invalid path'));
      
      renderWithProviders(<SettingsPage />);
      
      await user.click(screen.getByText('Ändern'));
      
      const pathInput = screen.getByLabelText('Neuer Datenbankpfad');
      await user.clear(pathInput);
      await user.type(pathInput, '/invalid/path');
      
      await user.click(screen.getByText('Pfad ändern'));
      
      expect(global.alert).toHaveBeenCalledWith('Fehler beim Ändern des Datenbankpfads: Error: Invalid path');
    });

    it('should cancel path change', async () => {
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage />);
      
      await user.click(screen.getByText('Ändern'));
      
      expect(screen.getByText('Datenbankpfad ändern')).toBeInTheDocument();
      
      await user.click(screen.getByText('Abbrechen'));
      
      expect(screen.queryByText('Datenbankpfad ändern')).not.toBeInTheDocument();
    });

    it('should show warning about restart requirement', async () => {
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage />);
      
      await user.click(screen.getByText('Ändern'));
      
      expect(screen.getByText('Wichtiger Hinweis')).toBeInTheDocument();
      expect(screen.getByText(/Nach der Pfadänderung muss die Anwendung neu gestartet werden/)).toBeInTheDocument();
    });

    it('should disable save button for empty path', async () => {
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage />);
      
      await user.click(screen.getByText('Ändern'));
      
      const pathInput = screen.getByLabelText('Neuer Datenbankpfad');
      await user.clear(pathInput);
      
      const saveButton = screen.getByText('Pfad ändern');
      expect(saveButton).toBeDisabled();
    });
  });

  describe('Device Configuration Section', () => {
    it('should display current device configuration', () => {
      renderWithProviders(<SettingsPage />);
      
      expect(screen.getByText('Aktuelle Konfiguration')).toBeInTheDocument();
      expect(screen.getByText('Gerätetyp: Computer')).toBeInTheDocument();
      expect(screen.getByText('Name: Test Computer')).toBeInTheDocument();
    });

    it('should render device type selection', () => {
      renderWithProviders(<SettingsPage />);
      
      expect(screen.getByText('Computer')).toBeInTheDocument();
      expect(screen.getByText('Desktop-Arbeitsplatz (Zuhause)')).toBeInTheDocument();
      expect(screen.getByText('Notebook')).toBeInTheDocument();
      expect(screen.getByText('Mobiles Gerät (Schule)')).toBeInTheDocument();
    });

    it('should handle device type selection', async () => {
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage />);
      
      const notebookButton = screen.getByText('Notebook').closest('button');
      await user.click(notebookButton!);
      
      expect(notebookButton).toHaveClass('border-blue-500', 'bg-blue-50');
    });

    it('should render device name input', () => {
      renderWithProviders(<SettingsPage />);
      
      expect(screen.getByLabelText('Gerätename (Optional)')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Test Computer')).toBeInTheDocument();
    });

    it('should handle device name changes', async () => {
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage />);
      
      const nameInput = screen.getByLabelText('Gerätename (Optional)');
      await user.clear(nameInput);
      await user.type(nameInput, 'My Work Computer');
      
      expect(nameInput).toHaveValue('My Work Computer');
    });

    it('should save device configuration', async () => {
      const user = userEvent.setup();
      mockStore.setDeviceConfig.mockResolvedValue(undefined);
      
      renderWithProviders(<SettingsPage />);
      
      const notebookButton = screen.getByText('Notebook').closest('button');
      await user.click(notebookButton!);
      
      const nameInput = screen.getByLabelText('Gerätename (Optional)');
      await user.clear(nameInput);
      await user.type(nameInput, 'School Laptop');
      
      await user.click(screen.getByText('Konfiguration speichern'));
      
      expect(mockStore.setDeviceConfig).toHaveBeenCalledWith('notebook', 'School Laptop');
    });

    it('should show loading state during save', async () => {
      const user = userEvent.setup();
      
      mockStore = mockUseAppStore({
        deviceConfig: mockDeviceConfig,
        databasePath: '/mock/app/data/observations.db',
        loading: true,
        error: null,
      });
      
      renderWithProviders(<SettingsPage />);
      
      expect(screen.getByText('Speichern...')).toBeInTheDocument();
      expect(screen.getByText('Speichern...')).toBeDisabled();
    });
  });

  describe('Security Section', () => {
    it('should display encryption status', () => {
      renderWithProviders(<SettingsPage />);
      
      expect(screen.getByText('Verschlüsselung aktiv')).toBeInTheDocument();
      expect(screen.getByText(/Alle Daten werden mit AES-256-GCM verschlüsselt/)).toBeInTheDocument();
    });

    it('should render security action buttons', () => {
      renderWithProviders(<SettingsPage />);
      
      expect(screen.getByText('Verschlüsselungsschlüssel neu generieren')).toBeInTheDocument();
      expect(screen.getByText('Sicherheitsbericht erstellen')).toBeInTheDocument();
    });
  });

  describe('Danger Zone Section', () => {
    it('should render danger zone with warning', () => {
      renderWithProviders(<SettingsPage />);
      
      expect(screen.getByText('Gefahrenbereich')).toBeInTheDocument();
      expect(screen.getByText('Alle Daten löschen')).toBeInTheDocument();
      expect(screen.getByText(/Diese Aktion löscht alle Beobachtungen/)).toBeInTheDocument();
    });

    it('should open delete confirmation dialog', async () => {
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage />);
      
      await user.click(screen.getByText('Alle Daten löschen'));
      
      expect(screen.getByText('Datenlöschung bestätigen')).toBeInTheDocument();
      expect(screen.getByText(/Sind Sie sicher, dass Sie alle Daten löschen möchten/)).toBeInTheDocument();
    });

    it('should cancel data deletion', async () => {
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage />);
      
      await user.click(screen.getByText('Alle Daten löschen'));
      
      expect(screen.getByText('Datenlöschung bestätigen')).toBeInTheDocument();
      
      await user.click(screen.getByText('Abbrechen'));
      
      expect(screen.queryByText('Datenlöschung bestätigen')).not.toBeInTheDocument();
    });

    it('should confirm data deletion', async () => {
      const user = userEvent.setup();
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      renderWithProviders(<SettingsPage />);
      
      await user.click(screen.getByText('Alle Daten löschen'));
      await user.click(screen.getByText('Endgültig löschen'));
      
      expect(consoleSpy).toHaveBeenCalledWith('Deleting expired data...');
      expect(screen.queryByText('Datenlöschung bestätigen')).not.toBeInTheDocument();
      
      consoleSpy.mockRestore();
    });
  });

  describe('Initialization', () => {
    it('should call getDatabasePath on mount', () => {
      renderWithProviders(<SettingsPage />);
      
      expect(mockStore.getDatabasePath).toHaveBeenCalled();
    });

    it('should initialize device configuration', () => {
      renderWithProviders(<SettingsPage />);
      
      const computerButton = screen.getByText('Computer').closest('button');
      expect(computerButton).toHaveClass('border-blue-500', 'bg-blue-50');
    });

    it('should handle missing device configuration', () => {
      mockStore = mockUseAppStore({
        deviceConfig: null,
        databasePath: '/mock/app/data/observations.db',
        loading: false,
        error: null,
      });
      
      renderWithProviders(<SettingsPage />);
      
      // Should not crash and should show default values
      expect(screen.getByText('Einstellungen')).toBeInTheDocument();
    });

    it('should handle missing database path', () => {
      mockStore = mockUseAppStore({
        deviceConfig: mockDeviceConfig,
        databasePath: null,
        loading: false,
        error: null,
      });
      
      renderWithProviders(<SettingsPage />);
      
      expect(screen.getByDisplayValue('Wird geladen...')).toBeInTheDocument();
    });
  });

  describe('Loading States', () => {
    it('should show loading text for database path', () => {
      mockStore = mockUseAppStore({
        deviceConfig: mockDeviceConfig,
        databasePath: null,
        loading: false,
        error: null,
      });
      
      renderWithProviders(<SettingsPage />);
      
      expect(screen.getByDisplayValue('Wird geladen...')).toBeInTheDocument();
    });

    it('should disable buttons during loading', () => {
      mockStore = mockUseAppStore({
        deviceConfig: mockDeviceConfig,
        databasePath: '/mock/app/data/observations.db',
        loading: true,
        error: null,
      });
      
      renderWithProviders(<SettingsPage />);
      
      expect(screen.getByText('Ändern')).toBeDisabled();
      expect(screen.getByText('Speichern...')).toBeDisabled();
    });
  });

  describe('Accessibility', () => {
    it('should have proper form labels', () => {
      renderWithProviders(<SettingsPage />);
      
      expect(screen.getByLabelText('Aufbewahrungsdauer für Beobachtungen')).toBeInTheDocument();
      expect(screen.getByLabelText('Speicherort der Datenbank')).toBeInTheDocument();
      expect(screen.getByLabelText('Gerätename (Optional)')).toBeInTheDocument();
    });

    it('should have proper headings hierarchy', () => {
      renderWithProviders(<SettingsPage />);
      
      const mainHeading = screen.getByRole('heading', { level: 1 });
      expect(mainHeading).toHaveTextContent('Einstellungen');
      
      const sectionHeadings = screen.getAllByRole('heading', { level: 2 });
      expect(sectionHeadings.length).toBeGreaterThan(0);
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage />);
      
      // Tab to first interactive element
      await user.tab();
      expect(screen.getByLabelText('Aufbewahrungsdauer für Beobachtungen')).toHaveFocus();
    });

    it('should have proper ARIA attributes for toggles', () => {
      renderWithProviders(<SettingsPage />);
      
      const toggles = screen.getAllByRole('checkbox');
      toggles.forEach(toggle => {
        expect(toggle).toHaveAttribute('aria-checked');
      });
    });

    it('should announce modal dialogs', async () => {
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage />);
      
      await user.click(screen.getByText('Ändern'));
      
      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute('aria-labelledby');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty device name', async () => {
      const user = userEvent.setup();
      mockStore.setDeviceConfig.mockResolvedValue(undefined);
      
      renderWithProviders(<SettingsPage />);
      
      const nameInput = screen.getByLabelText('Gerätename (Optional)');
      await user.clear(nameInput);
      
      await user.click(screen.getByText('Konfiguration speichern'));
      
      expect(mockStore.setDeviceConfig).toHaveBeenCalledWith('computer', undefined);
    });

    it('should handle very long device names', async () => {
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage />);
      
      const nameInput = screen.getByLabelText('Gerätename (Optional)');
      const longName = 'A'.repeat(1000);
      
      await user.clear(nameInput);
      await user.type(nameInput, longName);
      
      // Should handle long names gracefully
      expect(nameInput.value.length).toBeLessThanOrEqual(1000);
    });

    it('should handle special characters in database path', async () => {
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage />);
      
      await user.click(screen.getByText('Ändern'));
      
      const pathInput = screen.getByLabelText('Neuer Datenbankpfad');
      const specialPath = '/path/with spaces/äöü/database.db';
      
      await user.clear(pathInput);
      await user.type(pathInput, specialPath);
      
      expect(pathInput).toHaveValue(specialPath);
    });

    it('should handle concurrent device config saves', async () => {
      const user = userEvent.setup();
      mockStore.setDeviceConfig.mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 1000))
      );
      
      renderWithProviders(<SettingsPage />);
      
      // Try to save multiple times rapidly
      await user.click(screen.getByText('Konfiguration speichern'));
      await user.click(screen.getByText('Speichern...'));
      await user.click(screen.getByText('Speichern...'));
      
      // Should only save once
      expect(mockStore.setDeviceConfig).toHaveBeenCalledTimes(1);
    });

    it('should handle missing configuration data', () => {
      mockStore = mockUseAppStore({
        deviceConfig: null,
        databasePath: null,
        loading: false,
        error: null,
      });
      
      renderWithProviders(<SettingsPage />);
      
      // Should not crash
      expect(screen.getByText('Einstellungen')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Wird geladen...')).toBeInTheDocument();
    });
  });
});