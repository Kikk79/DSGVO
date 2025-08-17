import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dashboard } from '../Dashboard';
import { renderWithProviders, mockUseAppStore, mockStudents, mockObservations } from '../../test/utils';

// Mock date-fns to have consistent dates in tests
vi.mock('date-fns', async () => {
  const actual = await vi.importActual('date-fns');
  return {
    ...actual,
    isToday: vi.fn(() => true), // Mock all observations as being from today
    format: vi.fn((date, formatStr) => {
      if (formatStr === 'EEEE, d. MMMM yyyy') return 'Mittwoch, 1. Januar 2024';
      if (formatStr === 'HH:mm') return '10:00';
      return date.toString();
    }),
  };
});

describe('Dashboard Component', () => {
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
    it('should render dashboard header correctly', () => {
      renderWithProviders(<Dashboard />);
      
      expect(screen.getByText('Startseite')).toBeInTheDocument();
      expect(screen.getByText('Willkommen im Schülerbeobachtungssystem')).toBeInTheDocument();
    });

    it('should render quick action cards', () => {
      renderWithProviders(<Dashboard />);
      
      expect(screen.getByText('Neue Beobachtung')).toBeInTheDocument();
      expect(screen.getByText('Schnell eine Beobachtung erfassen')).toBeInTheDocument();
      expect(screen.getByText('Schüler finden')).toBeInTheDocument();
      expect(screen.getByText('Beobachtungen durchsuchen')).toBeInTheDocument();
    });

    it('should render current date', () => {
      renderWithProviders(<Dashboard />);
      
      expect(screen.getByText('Heute')).toBeInTheDocument();
      expect(screen.getByText('Mittwoch, 1. Januar 2024')).toBeInTheDocument();
    });

    it('should render statistics cards', () => {
      renderWithProviders(<Dashboard />);
      
      expect(screen.getByText('Beobachtungen heute')).toBeInTheDocument();
      expect(screen.getByText('Gesamte Schüler')).toBeInTheDocument();
      expect(screen.getByText('Diese Woche')).toBeInTheDocument();
    });
  });

  describe('Statistics', () => {
    it('should calculate today observations correctly', () => {
      renderWithProviders(<Dashboard />);
      
      // Since isToday is mocked to return true, all observations should count
      expect(screen.getByText('2')).toBeInTheDocument(); // 2 observations today
    });

    it('should display total students count', () => {
      renderWithProviders(<Dashboard />);
      
      expect(screen.getByText('2')).toBeInTheDocument(); // 2 total students
    });

    it('should handle empty data gracefully', () => {
      mockStore = mockUseAppStore({
        students: [],
        observations: [],
        loading: false,
        error: null,
      });

      renderWithProviders(<Dashboard />);
      
      expect(screen.getByText('0')).toBeInTheDocument(); // No observations today
      expect(screen.getByText('0')).toBeInTheDocument(); // No students
    });
  });

  describe('Recent Observations', () => {
    it('should display recent observations when available', () => {
      renderWithProviders(<Dashboard />);
      
      expect(screen.getByText('Letzte Beobachtungen')).toBeInTheDocument();
      expect(screen.getByText('Max Mustermann')).toBeInTheDocument();
      expect(screen.getByText('Zeigt gute Teamfähigkeiten')).toBeInTheDocument();
      expect(screen.getByText('Anna Schmidt')).toBeInTheDocument();
      expect(screen.getByText('Gute Fortschritte in Mathematik')).toBeInTheDocument();
    });

    it('should show "Alle anzeigen" link', () => {
      renderWithProviders(<Dashboard />);
      
      const allObservationsLink = screen.getByText('Alle anzeigen');
      expect(allObservationsLink).toBeInTheDocument();
      expect(allObservationsLink.closest('a')).toHaveAttribute('href', '/schueler-suchen');
    });

    it('should display empty state when no observations', () => {
      mockStore = mockUseAppStore({
        students: mockStudents,
        observations: [],
        loading: false,
        error: null,
      });

      renderWithProviders(<Dashboard />);
      
      expect(screen.getByText('Keine Beobachtungen')).toBeInTheDocument();
      expect(screen.getByText('Beginnen Sie mit Ihrer ersten Beobachtung.')).toBeInTheDocument();
      expect(screen.getByText('Neue Beobachtung')).toBeInTheDocument();
    });

    it('should handle observations without matching students', () => {
      const orphanObservation = {
        id: 999,
        student_id: 999, // Non-existent student
        author_id: 1,
        category: 'Test',
        text: 'Orphan observation',
        tags: [],
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

      renderWithProviders(<Dashboard />);
      
      expect(screen.getByText('Unbekannter Schüler')).toBeInTheDocument();
      expect(screen.getByText('Orphan observation')).toBeInTheDocument();
    });

    it('should display category and time for observations', () => {
      renderWithProviders(<Dashboard />);
      
      expect(screen.getByText('Sozial')).toBeInTheDocument();
      expect(screen.getByText('Fachlich')).toBeInTheDocument();
      expect(screen.getByText('10:00')).toBeInTheDocument();
    });
  });

  describe('Navigation', () => {
    it('should navigate to new observation on card click', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Dashboard />);
      
      const newObservationCard = screen.getByText('Neue Beobachtung').closest('a');
      expect(newObservationCard).toHaveAttribute('href', '/neue-beobachtung');
    });

    it('should navigate to student search on card click', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Dashboard />);
      
      const studentSearchCard = screen.getByText('Schüler finden').closest('a');
      expect(studentSearchCard).toHaveAttribute('href', '/schueler-suchen');
    });

    it('should navigate to student search from empty state button', async () => {
      mockStore = mockUseAppStore({
        students: mockStudents,
        observations: [],
        loading: false,
        error: null,
      });

      renderWithProviders(<Dashboard />);
      
      const newObservationButton = screen.getByText('Neue Beobachtung');
      expect(newObservationButton.closest('a')).toHaveAttribute('href', '/neue-beobachtung');
    });
  });

  describe('Data Loading', () => {
    it('should call searchObservations on mount', () => {
      renderWithProviders(<Dashboard />);
      
      expect(mockStore.searchObservations).toHaveBeenCalledWith();
    });

    it('should handle loading state gracefully', () => {
      mockStore = mockUseAppStore({
        students: [],
        observations: [],
        loading: true,
        error: null,
      });

      renderWithProviders(<Dashboard />);
      
      // Component should still render even when loading
      expect(screen.getByText('Startseite')).toBeInTheDocument();
    });

    it('should handle error state gracefully', () => {
      mockStore = mockUseAppStore({
        students: [],
        observations: [],
        loading: false,
        error: 'Failed to load data',
      });

      renderWithProviders(<Dashboard />);
      
      // Component should still render even with errors
      expect(screen.getByText('Startseite')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels and structure', () => {
      renderWithProviders(<Dashboard />);
      
      // Check for main heading
      const mainHeading = screen.getByRole('heading', { level: 1 });
      expect(mainHeading).toHaveTextContent('Startseite');

      // Check for section headings
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Letzte Beobachtungen');
    });

    it('should have keyboard accessible links', () => {
      renderWithProviders(<Dashboard />);
      
      const links = screen.getAllByRole('link');
      links.forEach(link => {
        expect(link).toBeVisible();
      });
    });

    it('should have proper link relationships', () => {
      renderWithProviders(<Dashboard />);
      
      const newObservationLink = screen.getByText('Neue Beobachtung').closest('a');
      const studentSearchLink = screen.getByText('Schüler finden').closest('a');
      const allObservationsLink = screen.getByText('Alle anzeigen').closest('a');

      expect(newObservationLink).toHaveAttribute('href', '/neue-beobachtung');
      expect(studentSearchLink).toHaveAttribute('href', '/schueler-suchen');
      expect(allObservationsLink).toHaveAttribute('href', '/schueler-suchen');
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing created_at in observations', () => {
      const observationWithoutDate = {
        ...mockObservations[0],
        created_at: undefined as any,
      };

      mockStore = mockUseAppStore({
        students: mockStudents,
        observations: [observationWithoutDate],
        loading: false,
        error: null,
      });

      renderWithProviders(<Dashboard />);
      
      // Should not crash
      expect(screen.getByText('Startseite')).toBeInTheDocument();
    });

    it('should handle very long observation texts', () => {
      const longObservation = {
        ...mockObservations[0],
        text: 'A'.repeat(1000), // Very long text
      };

      mockStore = mockUseAppStore({
        students: mockStudents,
        observations: [longObservation],
        loading: false,
        error: null,
      });

      renderWithProviders(<Dashboard />);
      
      // Should render without issues
      expect(screen.getByText('A'.repeat(1000))).toBeInTheDocument();
    });

    it('should handle missing student names gracefully', () => {
      const studentWithoutName = {
        ...mockStudents[0],
        first_name: '',
        last_name: '',
      };

      mockStore = mockUseAppStore({
        students: [studentWithoutName],
        observations: mockObservations,
        loading: false,
        error: null,
      });

      renderWithProviders(<Dashboard />);
      
      // Should show something meaningful for empty names
      expect(screen.getByText('Unbekannter Schüler')).toBeInTheDocument();
    });
  });
});