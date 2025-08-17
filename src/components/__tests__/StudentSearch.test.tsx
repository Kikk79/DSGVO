import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StudentSearch } from '../StudentSearch';
import { renderWithProviders, mockUseAppStore, mockStudents, mockObservations } from '../../test/utils';

// Mock date-fns
vi.mock('date-fns', async () => {
  const actual = await vi.importActual('date-fns');
  return {
    ...actual,
    format: vi.fn((date, formatStr) => {
      if (formatStr === 'd. MMMM yyyy, HH:mm') return '1. Januar 2024, 10:00';
      return date.toString();
    }),
  };
});

describe('StudentSearch Component', () => {
  let mockStore: ReturnType<typeof mockUseAppStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStore = mockUseAppStore({
      students: mockStudents,
      observations: mockObservations,
      loading: false,
      error: null,
    });
  });

  describe('Rendering', () => {
    it('should render search header correctly', () => {
      renderWithProviders(<StudentSearch />);
      
      expect(screen.getByText('Schüler finden')).toBeInTheDocument();
      expect(screen.getByText('Suchen Sie nach Beobachtungen und exportieren Sie Daten')).toBeInTheDocument();
    });

    it('should render search input and filter button', () => {
      renderWithProviders(<StudentSearch />);
      
      expect(screen.getByPlaceholderText('Nach Schüler*in oder Beobachtungstext suchen...')).toBeInTheDocument();
      expect(screen.getByText('Filter')).toBeInTheDocument();
    });

    it('should display observation count', () => {
      renderWithProviders(<StudentSearch />);
      
      expect(screen.getByText('2 Beobachtungen gefunden')).toBeInTheDocument();
    });
  });

  describe('Search Functionality', () => {
    it('should call searchObservations on mount', () => {
      renderWithProviders(<StudentSearch />);
      
      expect(mockStore.searchObservations).toHaveBeenCalledWith(undefined, undefined, undefined);
    });

    it('should update search query and trigger search', async () => {
      const user = userEvent.setup();
      renderWithProviders(<StudentSearch />);
      
      const searchInput = screen.getByPlaceholderText('Nach Schüler*in oder Beobachtungstext suchen...');
      
      await user.type(searchInput, 'teamfähig');
      
      expect(searchInput).toHaveValue('teamfähig');
      
      await waitFor(() => {
        expect(mockStore.searchObservations).toHaveBeenCalledWith('teamfähig', undefined, undefined);
      });
    });

    it('should clear search and reset results', async () => {
      const user = userEvent.setup();
      renderWithProviders(<StudentSearch />);
      
      const searchInput = screen.getByPlaceholderText('Nach Schüler*in oder Beobachtungstext suchen...');
      
      await user.type(searchInput, 'test');
      await user.clear(searchInput);
      
      await waitFor(() => {
        expect(mockStore.searchObservations).toHaveBeenCalledWith('', undefined, undefined);
      });
    });
  });

  describe('Filter Functionality', () => {
    it('should toggle filter visibility', async () => {
      const user = userEvent.setup();
      renderWithProviders(<StudentSearch />);
      
      // Filters should be hidden initially
      expect(screen.queryByLabelText('Schüler*in')).not.toBeInTheDocument();
      
      // Click filter button
      await user.click(screen.getByText('Filter'));
      
      // Filters should now be visible
      expect(screen.getByLabelText('Schüler*in')).toBeInTheDocument();
      expect(screen.getByLabelText('Kategorie')).toBeInTheDocument();
    });

    it('should populate student filter options', async () => {
      const user = userEvent.setup();
      renderWithProviders(<StudentSearch />);
      
      await user.click(screen.getByText('Filter'));
      
      const studentSelect = screen.getByLabelText('Schüler*in');
      expect(within(studentSelect).getByText('Alle Schüler*innen')).toBeInTheDocument();
      expect(within(studentSelect).getByText('Max Mustermann')).toBeInTheDocument();
      expect(within(studentSelect).getByText('Anna Schmidt')).toBeInTheDocument();
    });

    it('should populate category filter options', async () => {
      const user = userEvent.setup();
      renderWithProviders(<StudentSearch />);
      
      await user.click(screen.getByText('Filter'));
      
      const categorySelect = screen.getByLabelText('Kategorie');
      expect(within(categorySelect).getByText('Alle Kategorien')).toBeInTheDocument();
      expect(within(categorySelect).getByText('Sozial')).toBeInTheDocument();
      expect(within(categorySelect).getByText('Fachlich')).toBeInTheDocument();
      expect(within(categorySelect).getByText('Verhalten')).toBeInTheDocument();
      expect(within(categorySelect).getByText('Förderung')).toBeInTheDocument();
      expect(within(categorySelect).getByText('Sonstiges')).toBeInTheDocument();
    });

    it('should filter by selected student', async () => {
      const user = userEvent.setup();
      renderWithProviders(<StudentSearch />);
      
      await user.click(screen.getByText('Filter'));
      
      const studentSelect = screen.getByLabelText('Schüler*in');
      await user.selectOptions(studentSelect, '1');
      
      await waitFor(() => {
        expect(mockStore.searchObservations).toHaveBeenCalledWith(undefined, 1, undefined);
      });
    });

    it('should filter by selected category', async () => {
      const user = userEvent.setup();
      renderWithProviders(<StudentSearch />);
      
      await user.click(screen.getByText('Filter'));
      
      const categorySelect = screen.getByLabelText('Kategorie');
      await user.selectOptions(categorySelect, 'Sozial');
      
      await waitFor(() => {
        expect(mockStore.searchObservations).toHaveBeenCalledWith(undefined, undefined, 'Sozial');
      });
    });

    it('should combine search query and filters', async () => {
      const user = userEvent.setup();
      renderWithProviders(<StudentSearch />);
      
      // Enter search query
      const searchInput = screen.getByPlaceholderText('Nach Schüler*in oder Beobachtungstext suchen...');
      await user.type(searchInput, 'teamfähig');
      
      // Open filters and select student
      await user.click(screen.getByText('Filter'));
      const studentSelect = screen.getByLabelText('Schüler*in');
      await user.selectOptions(studentSelect, '1');
      
      await waitFor(() => {
        expect(mockStore.searchObservations).toHaveBeenCalledWith('teamfähig', 1, undefined);
      });
    });
  });

  describe('Observation Display', () => {
    it('should display observations with correct information', () => {
      renderWithProviders(<StudentSearch />);
      
      // Check first observation
      expect(screen.getByText('Max Mustermann')).toBeInTheDocument();
      expect(screen.getByText('Zeigt gute Teamfähigkeiten')).toBeInTheDocument();
      expect(screen.getByText('Sozial')).toBeInTheDocument();
      expect(screen.getByText('teamwork')).toBeInTheDocument();
      expect(screen.getByText('sozial')).toBeInTheDocument();
      
      // Check second observation
      expect(screen.getByText('Anna Schmidt')).toBeInTheDocument();
      expect(screen.getByText('Gute Fortschritte in Mathematik')).toBeInTheDocument();
      expect(screen.getByText('Fachlich')).toBeInTheDocument();
      expect(screen.getByText('mathematik')).toBeInTheDocument();
      expect(screen.getByText('fortschritt')).toBeInTheDocument();
    });

    it('should display formatted timestamps', () => {
      renderWithProviders(<StudentSearch />);
      
      expect(screen.getAllByText('1. Januar 2024, 10:00')).toHaveLength(2);
    });

    it('should handle observations without matching students', () => {
      const orphanObservation = {
        id: 999,
        student_id: 999,
        author_id: 1,
        category: 'Test',
        text: 'Orphan observation',
        tags: ['test'],
        created_at: '2024-01-01T10:00:00Z',
        updated_at: '2024-01-01T10:00:00Z',
        source_device_id: 'test-device-1',
      };

      mockStore = mockUseAppStore({
        students: mockStudents,
        observations: [orphanObservation],
        loading: false,
        error: null,
      });

      renderWithProviders(<StudentSearch />);
      
      expect(screen.getByText('Unbekannter Schüler')).toBeInTheDocument();
      expect(screen.getByText('Orphan observation')).toBeInTheDocument();
    });

    it('should handle observations without tags', () => {
      const observationWithoutTags = {
        ...mockObservations[0],
        tags: [],
      };

      mockStore = mockUseAppStore({
        students: mockStudents,
        observations: [observationWithoutTags],
        loading: false,
        error: null,
      });

      renderWithProviders(<StudentSearch />);
      
      // Should not display tag elements
      expect(screen.queryByText('teamwork')).not.toBeInTheDocument();
      expect(screen.queryByText('sozial')).not.toBeInTheDocument();
    });
  });

  describe('Export Functionality', () => {
    it('should show export dropdown on button hover', async () => {
      const user = userEvent.setup();
      renderWithProviders(<StudentSearch />);
      
      const exportButtons = screen.getAllByTitle('Export');
      expect(exportButtons).toHaveLength(2); // One for each observation with known student
      
      // Hover doesn't work reliably in testing, but the dropdown should be in DOM
      expect(screen.getByText('JSON Export')).toBeInTheDocument();
      expect(screen.getByText('CSV Export')).toBeInTheDocument();
    });

    it('should call exportStudentData for JSON export', async () => {
      const user = userEvent.setup();
      mockStore.exportStudentData.mockResolvedValue('{"test": "data"}');
      
      // Mock URL.createObjectURL and document.createElement
      global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
      global.URL.revokeObjectURL = vi.fn();
      
      const mockLink = {
        href: '',
        download: '',
        click: vi.fn(),
      };
      vi.spyOn(document, 'createElement').mockReturnValue(mockLink as any);
      
      renderWithProviders(<StudentSearch />);
      
      const jsonExportButton = screen.getByText('JSON Export');
      await user.click(jsonExportButton);
      
      expect(mockStore.exportStudentData).toHaveBeenCalledWith(1, 'json');
    });

    it('should call exportStudentData for CSV export', async () => {
      const user = userEvent.setup();
      mockStore.exportStudentData.mockResolvedValue('csv,data');
      
      // Mock URL.createObjectURL and document.createElement
      global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
      global.URL.revokeObjectURL = vi.fn();
      
      const mockLink = {
        href: '',
        download: '',
        click: vi.fn(),
      };
      vi.spyOn(document, 'createElement').mockReturnValue(mockLink as any);
      
      renderWithProviders(<StudentSearch />);
      
      const csvExportButton = screen.getByText('CSV Export');
      await user.click(csvExportButton);
      
      expect(mockStore.exportStudentData).toHaveBeenCalledWith(1, 'csv');
    });

    it('should handle export errors gracefully', async () => {
      const user = userEvent.setup();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockStore.exportStudentData.mockRejectedValue(new Error('Export failed'));
      
      renderWithProviders(<StudentSearch />);
      
      const jsonExportButton = screen.getByText('JSON Export');
      await user.click(jsonExportButton);
      
      expect(consoleSpy).toHaveBeenCalledWith('Export failed:', expect.any(Error));
      
      consoleSpy.mockRestore();
    });
  });

  describe('Delete Functionality', () => {
    it('should open delete confirmation dialog', async () => {
      const user = userEvent.setup();
      renderWithProviders(<StudentSearch />);
      
      const deleteButtons = screen.getAllByTitle('Beobachtung löschen');
      await user.click(deleteButtons[0]);
      
      expect(screen.getByText('Beobachtung löschen')).toBeInTheDocument();
      expect(screen.getByText(/Möchten Sie die Beobachtung für.*Max Mustermann.*wirklich löschen/)).toBeInTheDocument();
      expect(screen.getByText('Diese Aktion kann nicht rückgängig gemacht werden.')).toBeInTheDocument();
    });

    it('should close dialog on cancel', async () => {
      const user = userEvent.setup();
      renderWithProviders(<StudentSearch />);
      
      const deleteButtons = screen.getAllByTitle('Beobachtung löschen');
      await user.click(deleteButtons[0]);
      
      expect(screen.getByText('Beobachtung löschen')).toBeInTheDocument();
      
      await user.click(screen.getByText('Abbrechen'));
      
      expect(screen.queryByText('Beobachtung löschen')).not.toBeInTheDocument();
    });

    it('should call deleteObservation on confirm', async () => {
      const user = userEvent.setup();
      mockStore.deleteObservation.mockResolvedValue(undefined);
      
      renderWithProviders(<StudentSearch />);
      
      const deleteButtons = screen.getAllByTitle('Beobachtung löschen');
      await user.click(deleteButtons[0]);
      
      await user.click(screen.getByText('Löschen'));
      
      expect(mockStore.deleteObservation).toHaveBeenCalledWith(1, false);
      expect(mockStore.setError).toHaveBeenCalledWith(null);
    });

    it('should show force delete option on error', async () => {
      const user = userEvent.setup();
      mockStore.deleteObservation.mockRejectedValue(new Error('Permission denied'));
      
      mockStore = mockUseAppStore({
        ...mockStore,
        error: 'Permission denied',
      });
      
      renderWithProviders(<StudentSearch />);
      
      const deleteButtons = screen.getAllByTitle('Beobachtung löschen');
      await user.click(deleteButtons[0]);
      
      // Simulate error state
      expect(screen.getByText('Möchten Sie die Löschung erzwingen? (Administrator-Berechtigung erforderlich)')).toBeInTheDocument();
      expect(screen.getByText('Erzwingen')).toBeInTheDocument();
    });

    it('should call force delete when erzwingen clicked', async () => {
      const user = userEvent.setup();
      
      mockStore = mockUseAppStore({
        students: mockStudents,
        observations: mockObservations,
        loading: false,
        error: 'Permission denied',
      });
      
      renderWithProviders(<StudentSearch />);
      
      const deleteButtons = screen.getAllByTitle('Beobachtung löschen');
      await user.click(deleteButtons[0]);
      
      await user.click(screen.getByText('Erzwingen'));
      
      expect(mockStore.deleteObservation).toHaveBeenCalledWith(1, true);
    });
  });

  describe('Loading and Error States', () => {
    it('should show loading spinner when loading', () => {
      mockStore = mockUseAppStore({
        students: [],
        observations: [],
        loading: true,
        error: null,
      });
      
      renderWithProviders(<StudentSearch />);
      
      expect(screen.getByText('Lade Beobachtungen...')).toBeInTheDocument();
      expect(screen.getByRole('progressbar', { hidden: true })).toBeInTheDocument(); // Spinner
    });

    it('should show empty state when no observations found', () => {
      mockStore = mockUseAppStore({
        students: mockStudents,
        observations: [],
        loading: false,
        error: null,
      });
      
      renderWithProviders(<StudentSearch />);
      
      expect(screen.getByText('Keine Beobachtungen gefunden')).toBeInTheDocument();
      expect(screen.getByText('Versuchen Sie andere Suchbegriffe oder Filter.')).toBeInTheDocument();
    });

    it('should update observation count correctly', () => {
      mockStore = mockUseAppStore({
        students: mockStudents,
        observations: [mockObservations[0]], // Only one observation
        loading: false,
        error: null,
      });
      
      renderWithProviders(<StudentSearch />);
      
      expect(screen.getByText('1 Beobachtungen gefunden')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      renderWithProviders(<StudentSearch />);
      
      const searchInput = screen.getByLabelText('Suche');
      expect(searchInput).toBeInTheDocument();
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      renderWithProviders(<StudentSearch />);
      
      // Tab to search input
      await user.tab();
      expect(screen.getByPlaceholderText('Nach Schüler*in oder Beobachtungstext suchen...')).toHaveFocus();
      
      // Tab to filter button
      await user.tab();
      expect(screen.getByText('Filter')).toHaveFocus();
    });

    it('should have proper button labels', () => {
      renderWithProviders(<StudentSearch />);
      
      const deleteButtons = screen.getAllByTitle('Beobachtung löschen');
      expect(deleteButtons).toHaveLength(2);
      
      const exportButtons = screen.getAllByTitle('Export');
      expect(exportButtons).toHaveLength(2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle malformed observation data', () => {
      const malformedObservation = {
        id: 1,
        student_id: null,
        author_id: 1,
        category: '',
        text: '',
        tags: null,
        created_at: '',
        updated_at: '',
        source_device_id: '',
      };

      mockStore = mockUseAppStore({
        students: mockStudents,
        observations: [malformedObservation as any],
        loading: false,
        error: null,
      });
      
      renderWithProviders(<StudentSearch />);
      
      // Should not crash
      expect(screen.getByText('Schüler finden')).toBeInTheDocument();
    });

    it('should handle very long observation texts', () => {
      const longObservation = {
        ...mockObservations[0],
        text: 'A'.repeat(1000),
      };

      mockStore = mockUseAppStore({
        students: mockStudents,
        observations: [longObservation],
        loading: false,
        error: null,
      });
      
      renderWithProviders(<StudentSearch />);
      
      expect(screen.getByText('A'.repeat(1000))).toBeInTheDocument();
    });

    it('should handle special characters in search', async () => {
      const user = userEvent.setup();
      renderWithProviders(<StudentSearch />);
      
      const searchInput = screen.getByPlaceholderText('Nach Schüler*in oder Beobachtungstext suchen...');
      
      await user.type(searchInput, 'äöüß@#$%');
      
      expect(searchInput).toHaveValue('äöüß@#$%');
      
      await waitFor(() => {
        expect(mockStore.searchObservations).toHaveBeenCalledWith('äöüß@#$%', undefined, undefined);
      });
    });
  });
});