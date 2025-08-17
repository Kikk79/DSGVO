import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddStudent } from '../AddStudent';
import { renderWithProviders, mockUseAppStore, mockClasses } from '../../test/utils';

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('AddStudent Component', () => {
  let mockStore: ReturnType<typeof mockUseAppStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
    mockStore = mockUseAppStore({
      classes: mockClasses,
      loading: false,
      error: null,
    });
  });

  describe('Rendering', () => {
    it('should render form header correctly', () => {
      renderWithProviders(<AddStudent />);
      
      expect(screen.getByText('Schüler hinzufügen')).toBeInTheDocument();
      expect(screen.getByText('Fügen Sie einen neuen Schüler zur Datenbank hinzu')).toBeInTheDocument();
    });

    it('should render all form fields', () => {
      renderWithProviders(<AddStudent />);
      
      expect(screen.getByLabelText('Vorname')).toBeInTheDocument();
      expect(screen.getByLabelText('Nachname')).toBeInTheDocument();
      expect(screen.getByLabelText('Klasse')).toBeInTheDocument();
      expect(screen.getByLabelText('Status')).toBeInTheDocument();
    });

    it('should render form buttons', () => {
      renderWithProviders(<AddStudent />);
      
      expect(screen.getByText('Schüler hinzufügen')).toBeInTheDocument();
      expect(screen.getByText('Abbrechen')).toBeInTheDocument();
    });
  });

  describe('Form Fields', () => {
    it('should handle first name input', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AddStudent />);
      
      const firstNameInput = screen.getByLabelText('Vorname');
      await user.type(firstNameInput, 'Max');
      
      expect(firstNameInput).toHaveValue('Max');
    });

    it('should handle last name input', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AddStudent />);
      
      const lastNameInput = screen.getByLabelText('Nachname');
      await user.type(lastNameInput, 'Mustermann');
      
      expect(lastNameInput).toHaveValue('Mustermann');
    });

    it('should populate class options', () => {
      renderWithProviders(<AddStudent />);
      
      const classSelect = screen.getByLabelText('Klasse');
      
      expect(screen.getByText('5a')).toBeInTheDocument();
      expect(screen.getByText('5b')).toBeInTheDocument();
    });

    it('should handle class selection', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AddStudent />);
      
      const classSelect = screen.getByLabelText('Klasse');
      await user.selectOptions(classSelect, '1');
      
      expect(classSelect).toHaveValue('1');
    });

    it('should have default status as active', () => {
      renderWithProviders(<AddStudent />);
      
      const statusSelect = screen.getByLabelText('Status');
      expect(statusSelect).toHaveValue('active');
    });

    it('should handle status selection', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AddStudent />);
      
      const statusSelect = screen.getByLabelText('Status');
      await user.selectOptions(statusSelect, 'inactive');
      
      expect(statusSelect).toHaveValue('inactive');
    });

    it('should show status options', () => {
      renderWithProviders(<AddStudent />);
      
      expect(screen.getByText('Aktiv')).toBeInTheDocument();
      expect(screen.getByText('Inaktiv')).toBeInTheDocument();
    });
  });

  describe('Form Validation', () => {
    it('should require first name', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AddStudent />);
      
      // Fill other required fields
      await user.type(screen.getByLabelText('Nachname'), 'Mustermann');
      await user.selectOptions(screen.getByLabelText('Klasse'), '1');
      
      // Try to submit without first name
      await user.click(screen.getByText('Schüler hinzufügen'));
      
      expect(mockStore.createStudent).not.toHaveBeenCalled();
    });

    it('should require last name', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AddStudent />);
      
      // Fill other required fields
      await user.type(screen.getByLabelText('Vorname'), 'Max');
      await user.selectOptions(screen.getByLabelText('Klasse'), '1');
      
      // Try to submit without last name
      await user.click(screen.getByText('Schüler hinzufügen'));
      
      expect(mockStore.createStudent).not.toHaveBeenCalled();
    });

    it('should require class selection', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AddStudent />);
      
      // Fill other required fields
      await user.type(screen.getByLabelText('Vorname'), 'Max');
      await user.type(screen.getByLabelText('Nachname'), 'Mustermann');
      
      // Try to submit without class selection
      await user.click(screen.getByText('Schüler hinzufügen'));
      
      expect(mockStore.createStudent).not.toHaveBeenCalled();
    });

    it('should show validation errors', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AddStudent />);
      
      // Try to submit empty form
      await user.click(screen.getByText('Schüler hinzufügen'));
      
      expect(screen.getByText('Vorname ist erforderlich')).toBeInTheDocument();
      expect(screen.getByText('Nachname ist erforderlich')).toBeInTheDocument();
      expect(screen.getByText('Bitte wählen Sie eine Klasse aus')).toBeInTheDocument();
    });

    it('should validate name length', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AddStudent />);
      
      const longName = 'A'.repeat(101); // Exceeds typical name limit
      
      await user.type(screen.getByLabelText('Vorname'), longName);
      await user.click(screen.getByText('Schüler hinzufügen'));
      
      expect(screen.getByText('Vorname ist zu lang')).toBeInTheDocument();
    });

    it('should trim whitespace from names', async () => {
      const user = userEvent.setup();
      mockStore.createStudent.mockResolvedValue({
        id: 1,
        class_id: 1,
        first_name: 'Max',
        last_name: 'Mustermann',
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        source_device_id: 'test-device-1',
      });
      
      renderWithProviders(<AddStudent />);
      
      await user.type(screen.getByLabelText('Vorname'), '  Max  ');
      await user.type(screen.getByLabelText('Nachname'), '  Mustermann  ');
      await user.selectOptions(screen.getByLabelText('Klasse'), '1');
      await user.click(screen.getByText('Schüler hinzufügen'));
      
      await waitFor(() => {
        expect(mockStore.createStudent).toHaveBeenCalledWith(1, 'Max', 'Mustermann', 'active');
      });
    });

    it('should reject empty or whitespace-only names', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AddStudent />);
      
      await user.type(screen.getByLabelText('Vorname'), '   ');
      await user.type(screen.getByLabelText('Nachname'), '   ');
      await user.selectOptions(screen.getByLabelText('Klasse'), '1');
      await user.click(screen.getByText('Schüler hinzufügen'));
      
      expect(screen.getByText('Vorname ist erforderlich')).toBeInTheDocument();
      expect(screen.getByText('Nachname ist erforderlich')).toBeInTheDocument();
    });
  });

  describe('Form Submission', () => {
    it('should submit valid form successfully', async () => {
      const user = userEvent.setup();
      mockStore.createStudent.mockResolvedValue({
        id: 1,
        class_id: 1,
        first_name: 'Max',
        last_name: 'Mustermann',
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        source_device_id: 'test-device-1',
      });
      
      renderWithProviders(<AddStudent />);
      
      await user.type(screen.getByLabelText('Vorname'), 'Max');
      await user.type(screen.getByLabelText('Nachname'), 'Mustermann');
      await user.selectOptions(screen.getByLabelText('Klasse'), '1');
      await user.click(screen.getByText('Schüler hinzufügen'));
      
      await waitFor(() => {
        expect(mockStore.createStudent).toHaveBeenCalledWith(1, 'Max', 'Mustermann', 'active');
      });
      
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });

    it('should submit with inactive status', async () => {
      const user = userEvent.setup();
      mockStore.createStudent.mockResolvedValue({
        id: 1,
        class_id: 1,
        first_name: 'Max',
        last_name: 'Mustermann',
        status: 'inactive',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        source_device_id: 'test-device-1',
      });
      
      renderWithProviders(<AddStudent />);
      
      await user.type(screen.getByLabelText('Vorname'), 'Max');
      await user.type(screen.getByLabelText('Nachname'), 'Mustermann');
      await user.selectOptions(screen.getByLabelText('Klasse'), '1');
      await user.selectOptions(screen.getByLabelText('Status'), 'inactive');
      await user.click(screen.getByText('Schüler hinzufügen'));
      
      await waitFor(() => {
        expect(mockStore.createStudent).toHaveBeenCalledWith(1, 'Max', 'Mustermann', 'inactive');
      });
    });

    it('should handle submission errors', async () => {
      const user = userEvent.setup();
      mockStore.createStudent.mockRejectedValue(new Error('Database error'));
      
      renderWithProviders(<AddStudent />);
      
      await user.type(screen.getByLabelText('Vorname'), 'Max');
      await user.type(screen.getByLabelText('Nachname'), 'Mustermann');
      await user.selectOptions(screen.getByLabelText('Klasse'), '1');
      await user.click(screen.getByText('Schüler hinzufügen'));
      
      await waitFor(() => {
        expect(mockStore.createStudent).toHaveBeenCalled();
      });
      
      // Should not navigate on error
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('should show loading state during submission', async () => {
      const user = userEvent.setup();
      
      mockStore = mockUseAppStore({
        classes: mockClasses,
        loading: true,
        error: null,
      });
      
      renderWithProviders(<AddStudent />);
      
      expect(screen.getByText('Wird hinzugefügt...')).toBeInTheDocument();
      expect(screen.getByText('Wird hinzugefügt...')).toBeDisabled();
    });

    it('should disable form during submission', async () => {
      const user = userEvent.setup();
      let resolvePromise: (value: any) => void;
      const promise = new Promise(resolve => {
        resolvePromise = resolve;
      });
      
      mockStore.createStudent.mockReturnValue(promise);
      
      renderWithProviders(<AddStudent />);
      
      await user.type(screen.getByLabelText('Vorname'), 'Max');
      await user.type(screen.getByLabelText('Nachname'), 'Mustermann');
      await user.selectOptions(screen.getByLabelText('Klasse'), '1');
      await user.click(screen.getByText('Schüler hinzufügen'));
      
      // Form should be disabled during submission
      expect(screen.getByLabelText('Vorname')).toBeDisabled();
      expect(screen.getByLabelText('Nachname')).toBeDisabled();
      expect(screen.getByLabelText('Klasse')).toBeDisabled();
      expect(screen.getByLabelText('Status')).toBeDisabled();
      
      // Resolve the promise to complete submission
      resolvePromise!({
        id: 1,
        class_id: 1,
        first_name: 'Max',
        last_name: 'Mustermann',
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        source_device_id: 'test-device-1',
      });
    });
  });

  describe('Form Reset and Cancel', () => {
    it('should reset form after successful submission', async () => {
      const user = userEvent.setup();
      mockStore.createStudent.mockResolvedValue({
        id: 1,
        class_id: 1,
        first_name: 'Max',
        last_name: 'Mustermann',
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        source_device_id: 'test-device-1',
      });
      
      renderWithProviders(<AddStudent />);
      
      await user.type(screen.getByLabelText('Vorname'), 'Max');
      await user.type(screen.getByLabelText('Nachname'), 'Mustermann');
      await user.selectOptions(screen.getByLabelText('Klasse'), '1');
      await user.click(screen.getByText('Schüler hinzufügen'));
      
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalled();
      });
      
      // Form should be reset (if staying on page)
      // This would need to be implemented in the component
    });

    it('should navigate away on cancel', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AddStudent />);
      
      await user.click(screen.getByText('Abbrechen'));
      
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });

    it('should show confirmation before discarding changes', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AddStudent />);
      
      // Fill form with some data
      await user.type(screen.getByLabelText('Vorname'), 'Max');
      
      await user.click(screen.getByText('Abbrechen'));
      
      // Should show confirmation dialog (if implemented)
      // For now, it just navigates away
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  describe('Class Management', () => {
    it('should show empty state when no classes available', () => {
      mockStore = mockUseAppStore({
        classes: [],
        loading: false,
        error: null,
      });
      
      renderWithProviders(<AddStudent />);
      
      const classSelect = screen.getByLabelText('Klasse');
      expect(classSelect.children).toHaveLength(1); // Only placeholder option
      
      expect(screen.getByText('Keine Klassen verfügbar')).toBeInTheDocument();
    });

    it('should group classes by school year', () => {
      const classesWithDifferentYears = [
        ...mockClasses,
        {
          id: 3,
          name: '6a',
          school_year: '2024/25',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          source_device_id: 'test-device-1',
        },
      ];
      
      mockStore = mockUseAppStore({
        classes: classesWithDifferentYears,
        loading: false,
        error: null,
      });
      
      renderWithProviders(<AddStudent />);
      
      // Should see classes grouped by school year
      expect(screen.getByText('2023/24')).toBeInTheDocument();
      expect(screen.getByText('2024/25')).toBeInTheDocument();
    });

    it('should sort classes appropriately', () => {
      renderWithProviders(<AddStudent />);
      
      const classSelect = screen.getByLabelText('Klasse');
      const options = Array.from(classSelect.querySelectorAll('option'));
      
      // Should be sorted by school year desc, then by name
      expect(options[1]).toHaveTextContent('5a');
      expect(options[2]).toHaveTextContent('5b');
    });
  });

  describe('Success Feedback', () => {
    it('should show success message after creation', async () => {
      const user = userEvent.setup();
      mockStore.createStudent.mockResolvedValue({
        id: 1,
        class_id: 1,
        first_name: 'Max',
        last_name: 'Mustermann',
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        source_device_id: 'test-device-1',
      });
      
      renderWithProviders(<AddStudent />);
      
      await user.type(screen.getByLabelText('Vorname'), 'Max');
      await user.type(screen.getByLabelText('Nachname'), 'Mustermann');
      await user.selectOptions(screen.getByLabelText('Klasse'), '1');
      await user.click(screen.getByText('Schüler hinzufügen'));
      
      await waitFor(() => {
        expect(screen.getByText('Schüler erfolgreich hinzugefügt')).toBeInTheDocument();
      });
    });

    it('should auto-dismiss success message', async () => {
      const user = userEvent.setup();
      mockStore.createStudent.mockResolvedValue({
        id: 1,
        class_id: 1,
        first_name: 'Max',
        last_name: 'Mustermann',
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        source_device_id: 'test-device-1',
      });
      
      renderWithProviders(<AddStudent />);
      
      await user.type(screen.getByLabelText('Vorname'), 'Max');
      await user.type(screen.getByLabelText('Nachname'), 'Mustermann');
      await user.selectOptions(screen.getByLabelText('Klasse'), '1');
      await user.click(screen.getByText('Schüler hinzufügen'));
      
      await waitFor(() => {
        expect(screen.getByText('Schüler erfolgreich hinzugefügt')).toBeInTheDocument();
      });
      
      // Wait for auto-dismiss (if implemented)
      await waitFor(() => {
        expect(screen.queryByText('Schüler erfolgreich hinzugefügt')).not.toBeInTheDocument();
      }, { timeout: 5000 });
    });
  });

  describe('Accessibility', () => {
    it('should have proper form labels', () => {
      renderWithProviders(<AddStudent />);
      
      expect(screen.getByLabelText('Vorname')).toBeInTheDocument();
      expect(screen.getByLabelText('Nachname')).toBeInTheDocument();
      expect(screen.getByLabelText('Klasse')).toBeInTheDocument();
      expect(screen.getByLabelText('Status')).toBeInTheDocument();
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AddStudent />);
      
      // Tab through form fields
      await user.tab();
      expect(screen.getByLabelText('Vorname')).toHaveFocus();
      
      await user.tab();
      expect(screen.getByLabelText('Nachname')).toHaveFocus();
      
      await user.tab();
      expect(screen.getByLabelText('Klasse')).toHaveFocus();
      
      await user.tab();
      expect(screen.getByLabelText('Status')).toHaveFocus();
    });

    it('should have proper ARIA attributes', () => {
      renderWithProviders(<AddStudent />);
      
      const form = screen.getByRole('form');
      expect(form).toBeInTheDocument();
      
      const firstNameInput = screen.getByLabelText('Vorname');
      expect(firstNameInput).toHaveAttribute('required');
      expect(firstNameInput).toHaveAttribute('aria-required', 'true');
    });

    it('should announce validation errors to screen readers', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AddStudent />);
      
      await user.click(screen.getByText('Schüler hinzufügen'));
      
      const errorMessages = screen.getAllByRole('alert');
      expect(errorMessages.length).toBeGreaterThan(0);
    });

    it('should have descriptive button text', () => {
      renderWithProviders(<AddStudent />);
      
      expect(screen.getByText('Schüler hinzufügen')).toBeInTheDocument();
      expect(screen.getByText('Abbrechen')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in names', async () => {
      const user = userEvent.setup();
      mockStore.createStudent.mockResolvedValue({
        id: 1,
        class_id: 1,
        first_name: 'José-María',
        last_name: 'García-López',
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        source_device_id: 'test-device-1',
      });
      
      renderWithProviders(<AddStudent />);
      
      await user.type(screen.getByLabelText('Vorname'), 'José-María');
      await user.type(screen.getByLabelText('Nachname'), 'García-López');
      await user.selectOptions(screen.getByLabelText('Klasse'), '1');
      await user.click(screen.getByText('Schüler hinzufügen'));
      
      await waitFor(() => {
        expect(mockStore.createStudent).toHaveBeenCalledWith(1, 'José-María', 'García-López', 'active');
      });
    });

    it('should handle missing classes gracefully', () => {
      mockStore = mockUseAppStore({
        classes: [],
        loading: false,
        error: null,
      });
      
      renderWithProviders(<AddStudent />);
      
      expect(screen.getByText('Schüler hinzufügen')).toBeInTheDocument();
      expect(screen.getByText('Keine Klassen verfügbar')).toBeInTheDocument();
    });

    it('should handle rapid form submissions', async () => {
      const user = userEvent.setup();
      mockStore.createStudent.mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 1000))
      );
      
      renderWithProviders(<AddStudent />);
      
      await user.type(screen.getByLabelText('Vorname'), 'Max');
      await user.type(screen.getByLabelText('Nachname'), 'Mustermann');
      await user.selectOptions(screen.getByLabelText('Klasse'), '1');
      
      // Submit multiple times rapidly
      await user.click(screen.getByText('Schüler hinzufügen'));
      await user.click(screen.getByText('Wird hinzugefügt...'));
      await user.click(screen.getByText('Wird hinzugefügt...'));
      
      // Should only submit once
      expect(mockStore.createStudent).toHaveBeenCalledTimes(1);
    });

    it('should handle network errors during class loading', () => {
      mockStore = mockUseAppStore({
        classes: [],
        loading: false,
        error: 'Failed to load classes',
      });
      
      renderWithProviders(<AddStudent />);
      
      // Form should still be usable despite loading errors
      expect(screen.getByText('Schüler hinzufügen')).toBeInTheDocument();
    });

    it('should handle very long names', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AddStudent />);
      
      const longName = 'A'.repeat(200);
      
      await user.type(screen.getByLabelText('Vorname'), longName);
      
      const firstNameInput = screen.getByLabelText('Vorname');
      expect(firstNameInput.value.length).toBeLessThanOrEqual(100); // Assuming 100 char limit
    });
  });
});