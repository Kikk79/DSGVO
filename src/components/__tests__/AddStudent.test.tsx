import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen as testingScreen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddStudent } from '../AddStudent';
import { renderWithProviders, createMockStore, mockClasses, mockStudents } from '../../test/utils';

// Mock the useAppStore hook
const mockStore = createMockStore({
  classes: mockClasses,
  students: mockStudents,
});

vi.mock('../../stores/appStore', () => ({
  useAppStore: () => mockStore,
}));

describe('AddStudent Component', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial Rendering', () => {
    it('renders the main title and description', () => {
      renderWithProviders(<AddStudent />);
      
      expect(testingScreen.getByText('Schüler & Klassen verwalten')).toBeInTheDocument();
      expect(testingScreen.getByText('Lege Klassen an, füge Schüler*innen hinzu oder lösche sie.')).toBeInTheDocument();
    });

    it('renders the class creation form', () => {
      renderWithProviders(<AddStudent />);
      
      expect(testingScreen.getByText('Neue Klasse')).toBeInTheDocument();
      expect(testingScreen.getByLabelText('Name')).toBeInTheDocument();
      expect(testingScreen.getByLabelText('Schuljahr')).toBeInTheDocument();
      expect(testingScreen.getByRole('button', { name: 'Klasse anlegen' })).toBeInTheDocument();
    });

    it('renders the student creation form', () => {
      renderWithProviders(<AddStudent />);
      
      expect(testingScreen.getByText('Neue/r Schüler*in')).toBeInTheDocument();
      expect(testingScreen.getByLabelText('Klasse')).toBeInTheDocument();
      expect(testingScreen.getByLabelText('Vorname')).toBeInTheDocument();
      expect(testingScreen.getByLabelText('Nachname')).toBeInTheDocument();
      expect(testingScreen.getByLabelText('Status')).toBeInTheDocument();
      expect(testingScreen.getByRole('button', { name: 'Schüler*in anlegen' })).toBeInTheDocument();
    });

    it('renders existing classes list with correct data', () => {
      renderWithProviders(<AddStudent />);
      
      expect(testingScreen.getByText('Klassen (2)')).toBeInTheDocument();
      expect(testingScreen.getByText('5a')).toBeInTheDocument();
      expect(testingScreen.getByText('5b')).toBeInTheDocument();
      expect(testingScreen.getByText('2023/24 • 2 Schüler*innen')).toBeInTheDocument();
    });

    it('renders existing students list with correct data', () => {
      renderWithProviders(<AddStudent />);
      
      expect(testingScreen.getByText('Schüler*innen (2)')).toBeInTheDocument();
      expect(testingScreen.getByText('Max Mustermann')).toBeInTheDocument();
      expect(testingScreen.getByText('Anna Schmidt')).toBeInTheDocument();
      expect(testingScreen.getAllByText('5a (2023/24) • Status: Aktiv')).toHaveLength(2);
    });

    it('disables student creation button when required fields are empty', () => {
      renderWithProviders(<AddStudent />);
      
      const createStudentButton = testingScreen.getByRole('button', { name: 'Schüler*in anlegen' });
      expect(createStudentButton).toBeDisabled();
    });

    it('populates class dropdown with available classes', () => {
      renderWithProviders(<AddStudent />);
      
      const classSelect = testingScreen.getByLabelText('Klasse');
      expect(classSelect).toBeInTheDocument();
      
      // Check for default option
      expect(testingScreen.getByText('Bitte wählen')).toBeInTheDocument();
      
      // Check for class options
      expect(testingScreen.getByText('5a (2023/24)')).toBeInTheDocument();
      expect(testingScreen.getByText('5b (2023/24)')).toBeInTheDocument();
    });
  });

  describe('Class Creation', () => {
    it('creates a new class with valid input', async () => {
      renderWithProviders(<AddStudent />);
      
      const nameInput = testingScreen.getByLabelText('Name');
      const yearInput = testingScreen.getByLabelText('Schuljahr');
      const createButton = testingScreen.getByRole('button', { name: 'Klasse anlegen' });

      await user.type(nameInput, '6a');
      await user.clear(yearInput);
      await user.type(yearInput, '2024/25');
      
      await user.click(createButton);

      expect(mockStore.createClass).toHaveBeenCalledWith('6a', '2024/25');
      expect(mockStore.loadClasses).toHaveBeenCalled();
    });

    it('trims whitespace from class name and year', async () => {
      renderWithProviders(<AddStudent />);
      
      const nameInput = testingScreen.getByLabelText('Name');
      const yearInput = testingScreen.getByLabelText('Schuljahr');
      const createButton = testingScreen.getByRole('button', { name: 'Klasse anlegen' });

      await user.type(nameInput, '  6a  ');
      await user.clear(yearInput);
      await user.type(yearInput, '  2024/25  ');
      
      await user.click(createButton);

      expect(mockStore.createClass).toHaveBeenCalledWith('6a', '2024/25');
    });

    it('clears form fields after successful class creation', async () => {
      renderWithProviders(<AddStudent />);
      
      const nameInput = testingScreen.getByLabelText('Name') as HTMLInputElement;
      const yearInput = testingScreen.getByLabelText('Schuljahr') as HTMLInputElement;
      const createButton = testingScreen.getByRole('button', { name: 'Klasse anlegen' });

      await user.type(nameInput, '6a');
      await user.clear(yearInput);
      await user.type(yearInput, '2024/25');
      
      expect(nameInput.value).toBe('6a');
      expect(yearInput.value).toBe('2024/25');
      
      await user.click(createButton);

      await waitFor(() => {
        expect(nameInput.value).toBe('');
      });
    });

    it('does not create class with empty name', async () => {
      renderWithProviders(<AddStudent />);
      
      const nameInput = testingScreen.getByLabelText('Name');
      const createButton = testingScreen.getByRole('button', { name: 'Klasse anlegen' });

      await user.type(nameInput, '   '); // Only whitespace
      await user.click(createButton);

      expect(mockStore.createClass).not.toHaveBeenCalled();
      expect(mockStore.loadClasses).not.toHaveBeenCalled();
    });
  });

  describe('Student Creation', () => {
    it('creates a new student with valid input', async () => {
      renderWithProviders(<AddStudent />);
      
      const classSelect = testingScreen.getByLabelText('Klasse');
      const firstNameInput = testingScreen.getByLabelText('Vorname');
      const lastNameInput = testingScreen.getByLabelText('Nachname');
      const statusSelect = testingScreen.getByLabelText('Status');
      const createButton = testingScreen.getByRole('button', { name: 'Schüler*in anlegen' });

      await user.selectOptions(classSelect, '1');
      await user.type(firstNameInput, 'Test');
      await user.type(lastNameInput, 'Student');
      await user.selectOptions(statusSelect, 'active');
      
      expect(createButton).toBeEnabled();
      
      await user.click(createButton);

      expect(mockStore.createStudent).toHaveBeenCalledWith(1, 'Test', 'Student', 'active');
    });

    it('trims whitespace from student names', async () => {
      renderWithProviders(<AddStudent />);
      
      const classSelect = testingScreen.getByLabelText('Klasse');
      const firstNameInput = testingScreen.getByLabelText('Vorname');
      const lastNameInput = testingScreen.getByLabelText('Nachname');
      const createButton = testingScreen.getByRole('button', { name: 'Schüler*in anlegen' });

      await user.selectOptions(classSelect, '1');
      await user.type(firstNameInput, '  Test  ');
      await user.type(lastNameInput, '  Student  ');
      
      await user.click(createButton);

      expect(mockStore.createStudent).toHaveBeenCalledWith(1, 'Test', 'Student', 'active');
    });

    it('clears form fields after successful student creation', async () => {
      renderWithProviders(<AddStudent />);
      
      const classSelect = testingScreen.getByLabelText('Klasse') as HTMLSelectElement;
      const firstNameInput = testingScreen.getByLabelText('Vorname') as HTMLInputElement;
      const lastNameInput = testingScreen.getByLabelText('Nachname') as HTMLInputElement;
      const statusSelect = testingScreen.getByLabelText('Status') as HTMLSelectElement;
      const createButton = testingScreen.getByRole('button', { name: 'Schüler*in anlegen' });

      await user.selectOptions(classSelect, '1');
      await user.type(firstNameInput, 'Test');
      await user.type(lastNameInput, 'Student');
      
      expect(classSelect.value).toBe('1');
      expect(firstNameInput.value).toBe('Test');
      expect(lastNameInput.value).toBe('Student');
      expect(statusSelect.value).toBe('active');
      
      await user.click(createButton);

      await waitFor(() => {
        expect(firstNameInput.value).toBe('');
        expect(lastNameInput.value).toBe('');
        expect(classSelect.value).toBe('');
        expect(statusSelect.value).toBe('active');
      });
    });

    it('does not create student when required fields are missing', async () => {
      renderWithProviders(<AddStudent />);
      
      const createButton = testingScreen.getByRole('button', { name: 'Schüler*in anlegen' });
      
      // Button should be disabled initially
      expect(createButton).toBeDisabled();
      
      // Fill only first name
      const firstNameInput = testingScreen.getByLabelText('Vorname');
      await user.type(firstNameInput, 'Test');
      
      expect(createButton).toBeDisabled();
      
      // Fill last name but no class
      const lastNameInput = testingScreen.getByLabelText('Nachname');
      await user.type(lastNameInput, 'Student');
      
      expect(createButton).toBeDisabled();
      
      expect(mockStore.createStudent).not.toHaveBeenCalled();
    });

    it('enables create button only when all required fields are filled', async () => {
      renderWithProviders(<AddStudent />);
      
      const classSelect = testingScreen.getByLabelText('Klasse');
      const firstNameInput = testingScreen.getByLabelText('Vorname');
      const lastNameInput = testingScreen.getByLabelText('Nachname');
      const createButton = testingScreen.getByRole('button', { name: 'Schüler*in anlegen' });

      expect(createButton).toBeDisabled();

      await user.selectOptions(classSelect, '1');
      expect(createButton).toBeDisabled();

      await user.type(firstNameInput, 'Test');
      expect(createButton).toBeDisabled();

      await user.type(lastNameInput, 'Student');
      expect(createButton).toBeEnabled();
    });

    it('handles inactive status selection', async () => {
      renderWithProviders(<AddStudent />);
      
      const classSelect = testingScreen.getByLabelText('Klasse');
      const firstNameInput = testingScreen.getByLabelText('Vorname');
      const lastNameInput = testingScreen.getByLabelText('Nachname');
      const statusSelect = testingScreen.getByLabelText('Status');
      const createButton = testingScreen.getByRole('button', { name: 'Schüler*in anlegen' });

      await user.selectOptions(classSelect, '1');
      await user.type(firstNameInput, 'Test');
      await user.type(lastNameInput, 'Student');
      await user.selectOptions(statusSelect, 'inactive');
      
      await user.click(createButton);

      expect(mockStore.createStudent).toHaveBeenCalledWith(1, 'Test', 'Student', 'inactive');
    });
  });

  describe('Delete Functionality', () => {
    it('opens confirmation modal when deleting a student', async () => {
      renderWithProviders(<AddStudent />);
      
      const deleteButtons = testingScreen.getAllByTitle('Schüler*in löschen');
      await user.click(deleteButtons[0]);

      expect(testingScreen.getByText('Schüler*in löschen')).toBeInTheDocument();
      expect(testingScreen.getByText('Sind Sie sicher, dass Sie die Schüler*in')).toBeInTheDocument();
      expect(testingScreen.getByText('Max Mustermann', { selector: 'strong' })).toBeInTheDocument();
      expect(testingScreen.getByText('löschen möchten?')).toBeInTheDocument();
    });

    it('opens confirmation modal when deleting a class', async () => {
      renderWithProviders(<AddStudent />);
      
      const deleteButtons = testingScreen.getAllByTitle('Klasse löschen');
      await user.click(deleteButtons[0]);

      expect(testingScreen.getByText('Klasse löschen')).toBeInTheDocument();
      expect(testingScreen.getByText('Sind Sie sicher, dass Sie die Klasse')).toBeInTheDocument();
      expect(testingScreen.getByText('5a', { selector: 'strong' })).toBeInTheDocument();
      expect(testingScreen.getByText('löschen möchten?')).toBeInTheDocument();
    });

    it('shows GDPR notice for student deletion', async () => {
      renderWithProviders(<AddStudent />);
      
      const deleteButtons = testingScreen.getAllByTitle('Schüler*in löschen');
      await user.click(deleteButtons[0]);

      expect(testingScreen.getByText('GDPR-Hinweis:')).toBeInTheDocument();
      expect(testingScreen.getByText('Schüler*innen mit Beobachtungen werden zunächst als "gelöscht" markiert.')).toBeInTheDocument();
      expect(testingScreen.getByText('Für eine vollständige Löschung (Recht auf Vergessenwerden) verwenden Sie die "Endgültig löschen" Option.')).toBeInTheDocument();
    });

    it('shows warning for class deletion', async () => {
      renderWithProviders(<AddStudent />);
      
      const deleteButtons = testingScreen.getAllByTitle('Klasse löschen');
      await user.click(deleteButtons[0]);

      expect(testingScreen.getByText('Warnung:')).toBeInTheDocument();
      expect(testingScreen.getByText('Klassen mit Schüler*innen können nur mit der "Endgültig löschen" Option gelöscht werden.')).toBeInTheDocument();
      expect(testingScreen.getByText('Dies löscht auch alle zugehörigen Schüler*innen und deren Beobachtungen.')).toBeInTheDocument();
    });

    it('cancels deletion when cancel button is clicked', async () => {
      renderWithProviders(<AddStudent />);
      
      const deleteButtons = testingScreen.getAllByTitle('Schüler*in löschen');
      await user.click(deleteButtons[0]);

      const cancelButton = testingScreen.getByRole('button', { name: 'Abbrechen' });
      await user.click(cancelButton);

      expect(testingScreen.queryByText('Schüler*in löschen')).not.toBeInTheDocument();
      expect(mockStore.deleteStudent).not.toHaveBeenCalled();
    });

    it('performs soft delete for student', async () => {
      renderWithProviders(<AddStudent />);
      
      const deleteButtons = testingScreen.getAllByTitle('Schüler*in löschen');
      await user.click(deleteButtons[0]);

      const deleteButton = testingScreen.getByRole('button', { name: 'Als gelöscht markieren' });
      await user.click(deleteButton);

      expect(mockStore.deleteStudent).toHaveBeenCalledWith(1, false);
      expect(mockStore.loadStudents).toHaveBeenCalled();
    });

    it('performs soft delete for class', async () => {
      renderWithProviders(<AddStudent />);
      
      const deleteButtons = testingScreen.getAllByTitle('Klasse löschen');
      await user.click(deleteButtons[0]);

      const deleteButton = testingScreen.getByRole('button', { name: 'Löschen' });
      await user.click(deleteButton);

      expect(mockStore.deleteClass).toHaveBeenCalledWith(1, false);
      expect(mockStore.loadClasses).toHaveBeenCalled();
      expect(mockStore.loadStudents).toHaveBeenCalled();
    });
  });

  describe('Force Delete Functionality', () => {
    beforeEach(() => {
      // Mock deleteStudent to reject with observation error on first call
      mockStore.deleteStudent
        .mockRejectedValueOnce('Error: Student has observations')
        .mockResolvedValue(undefined);
      
      // Mock deleteClass to reject with student error on first call
      mockStore.deleteClass
        .mockRejectedValueOnce('Error: Class has active students')
        .mockResolvedValue(undefined);
    });

    it('shows force delete option after failed student deletion', async () => {
      renderWithProviders(<AddStudent />);
      
      const deleteButtons = testingScreen.getAllByTitle('Schüler*in löschen');
      await user.click(deleteButtons[0]);

      const deleteButton = testingScreen.getByRole('button', { name: 'Als gelöscht markieren' });
      await user.click(deleteButton);

      await waitFor(() => {
        expect(testingScreen.getByText('Die Schüler*in hat noch Beobachtungen.')).toBeInTheDocument();
        expect(testingScreen.getByText('Endgültiges Löschen entfernt alle Daten unwiderruflich!')).toBeInTheDocument();
        expect(testingScreen.getByRole('button', { name: 'Endgültig löschen' })).toBeInTheDocument();
      });
    });

    it('shows force delete option after failed class deletion', async () => {
      renderWithProviders(<AddStudent />);
      
      const deleteButtons = testingScreen.getAllByTitle('Klasse löschen');
      await user.click(deleteButtons[0]);

      const deleteButton = testingScreen.getByRole('button', { name: 'Löschen' });
      await user.click(deleteButton);

      await waitFor(() => {
        expect(testingScreen.getByText('Die Klasse hat noch aktive Schüler*innen.')).toBeInTheDocument();
        expect(testingScreen.getByText('Endgültiges Löschen entfernt alle Daten unwiderruflich!')).toBeInTheDocument();
        expect(testingScreen.getByRole('button', { name: 'Endgültig löschen' })).toBeInTheDocument();
      });
    });

    it('performs hard delete for student when force delete is clicked', async () => {
      renderWithProviders(<AddStudent />);
      
      const deleteButtons = testingScreen.getAllByTitle('Schüler*in löschen');
      await user.click(deleteButtons[0]);

      const deleteButton = testingScreen.getByRole('button', { name: 'Als gelöscht markieren' });
      await user.click(deleteButton);

      await waitFor(() => {
        expect(testingScreen.getByRole('button', { name: 'Endgültig löschen' })).toBeInTheDocument();
      });

      const forceDeleteButton = testingScreen.getByRole('button', { name: 'Endgültig löschen' });
      await user.click(forceDeleteButton);

      // First call was soft delete (failed), second call should be hard delete
      expect(mockStore.deleteStudent).toHaveBeenCalledTimes(2);
      expect(mockStore.deleteStudent).toHaveBeenLastCalledWith(1, true);
    });

    it('performs hard delete for class when force delete is clicked', async () => {
      renderWithProviders(<AddStudent />);
      
      const deleteButtons = testingScreen.getAllByTitle('Klasse löschen');
      await user.click(deleteButtons[0]);

      const deleteButton = testingScreen.getByRole('button', { name: 'Löschen' });
      await user.click(deleteButton);

      await waitFor(() => {
        expect(testingScreen.getByRole('button', { name: 'Endgültig löschen' })).toBeInTheDocument();
      });

      const forceDeleteButton = testingScreen.getByRole('button', { name: 'Endgültig löschen' });
      await user.click(forceDeleteButton);

      // First call was soft delete (failed), second call should be hard delete
      expect(mockStore.deleteClass).toHaveBeenCalledTimes(2);
      expect(mockStore.deleteClass).toHaveBeenLastCalledWith(1, true);
    });

    it('closes modal after successful force delete', async () => {
      renderWithProviders(<AddStudent />);
      
      const deleteButtons = testingScreen.getAllByTitle('Schüler*in löschen');
      await user.click(deleteButtons[0]);

      const deleteButton = testingScreen.getByRole('button', { name: 'Als gelöscht markieren' });
      await user.click(deleteButton);

      await waitFor(() => {
        expect(testingScreen.getByRole('button', { name: 'Endgültig löschen' })).toBeInTheDocument();
      });

      const forceDeleteButton = testingScreen.getByRole('button', { name: 'Endgültig löschen' });
      await user.click(forceDeleteButton);

      await waitFor(() => {
        expect(testingScreen.queryByText('Schüler*in löschen')).not.toBeInTheDocument();
      });
    });

    it('logs errors to console when deletion fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      renderWithProviders(<AddStudent />);
      
      const deleteButtons = testingScreen.getAllByTitle('Schüler*in löschen');
      await user.click(deleteButtons[0]);

      const deleteButton = testingScreen.getByRole('button', { name: 'Als gelöscht markieren' });
      await user.click(deleteButton);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Delete failed:', 'Error: Student has observations');
      });

      consoleSpy.mockRestore();
    });
  });

  describe('Empty State Handling', () => {
    it('shows empty state for classes when no classes exist', () => {
      const emptyStore = createMockStore({
        classes: [],
        students: mockStudents,
      });
      
      vi.mocked(emptyStore);
      
      renderWithProviders(<AddStudent />);
      
      expect(testingScreen.getByText('Klassen (0)')).toBeInTheDocument();
      expect(testingScreen.getByText('Keine Klassen vorhanden')).toBeInTheDocument();
    });

    it('shows empty state for students when no students exist', () => {
      const emptyStore = createMockStore({
        classes: mockClasses,
        students: [],
      });
      
      vi.mocked(emptyStore);
      
      renderWithProviders(<AddStudent />);
      
      expect(testingScreen.getByText('Schüler*innen (0)')).toBeInTheDocument();
      expect(testingScreen.getByText('Keine Schüler*innen vorhanden')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels for form controls', () => {
      renderWithProviders(<AddStudent />);
      
      expect(testingScreen.getByLabelText('Name')).toBeInTheDocument();
      expect(testingScreen.getByLabelText('Schuljahr')).toBeInTheDocument();
      expect(testingScreen.getByLabelText('Klasse')).toBeInTheDocument();
      expect(testingScreen.getByLabelText('Vorname')).toBeInTheDocument();
      expect(testingScreen.getByLabelText('Nachname')).toBeInTheDocument();
      expect(testingScreen.getByLabelText('Status')).toBeInTheDocument();
    });

    it('has proper button titles for delete actions', () => {
      renderWithProviders(<AddStudent />);
      
      expect(testingScreen.getAllByTitle('Klasse löschen')).toHaveLength(2);
      expect(testingScreen.getAllByTitle('Schüler*in löschen')).toHaveLength(2);
    });

    it('has proper button text for primary actions', () => {
      renderWithProviders(<AddStudent />);
      
      expect(testingScreen.getByRole('button', { name: 'Klasse anlegen' })).toBeInTheDocument();
      expect(testingScreen.getByRole('button', { name: 'Schüler*in anlegen' })).toBeInTheDocument();
    });

    it('focuses properly in delete confirmation modal', async () => {
      renderWithProviders(<AddStudent />);
      
      const deleteButtons = testingScreen.getAllByTitle('Schüler*in löschen');
      await user.click(deleteButtons[0]);

      // Modal should be in the DOM and focusable
      const modal = testingScreen.getByRole('dialog', { hidden: true });
      expect(modal).toBeInTheDocument();
    });
  });

  describe('Data Integration', () => {
    it('calculates student count per class correctly', () => {
      renderWithProviders(<AddStudent />);
      
      // Both mock students are in class 1 (5a) and active
      expect(testingScreen.getByText('2023/24 • 2 Schüler*innen')).toBeInTheDocument();
      
      // Class 2 (5b) has no students
      expect(testingScreen.getByText('2023/24 • 0 Schüler*innen')).toBeInTheDocument();
    });

    it('shows class information in student list', () => {
      renderWithProviders(<AddStudent />);
      
      expect(testingScreen.getAllByText('5a (2023/24) • Status: Aktiv')).toHaveLength(2);
    });

    it('handles missing class information gracefully', () => {
      const studentsWithMissingClass = [
        ...mockStudents,
        {
          id: 3,
          class_id: 999, // Non-existent class
          first_name: 'Test',
          last_name: 'NoClass',
          status: 'active' as const,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          source_device_id: 'test-device-1',
        },
      ];

      const storeWithMissingClass = createMockStore({
        classes: mockClasses,
        students: studentsWithMissingClass,
      });
      
      vi.mocked(storeWithMissingClass);
      
      renderWithProviders(<AddStudent />);
      
      expect(testingScreen.getByText('Test NoClass')).toBeInTheDocument();
      expect(testingScreen.getByText('Keine Klasse • Status: Aktiv')).toBeInTheDocument();
    });

    it('filters active students for class count', () => {
      const studentsWithInactive = [
        ...mockStudents,
        {
          id: 3,
          class_id: 1,
          first_name: 'Inactive',
          last_name: 'Student',
          status: 'inactive' as const,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          source_device_id: 'test-device-1',
        },
      ];

      const storeWithInactive = createMockStore({
        classes: mockClasses,
        students: studentsWithInactive,
      });
      
      vi.mocked(storeWithInactive);
      
      renderWithProviders(<AddStudent />);
      
      // Should still show 2 active students in class 1, not 3
      expect(testingScreen.getByText('2023/24 • 2 Schüler*innen')).toBeInTheDocument();
    });
  });

  describe('Form Reset Behavior', () => {
    it('resets class form to default school year after creation', async () => {
      renderWithProviders(<AddStudent />);
      
      const nameInput = testingScreen.getByLabelText('Name');
      const yearInput = testingScreen.getByLabelText('Schuljahr') as HTMLInputElement;
      const createButton = testingScreen.getByRole('button', { name: 'Klasse anlegen' });

      // Change school year from default
      await user.clear(yearInput);
      await user.type(yearInput, '2025/26');
      await user.type(nameInput, '6a');
      
      await user.click(createButton);

      await waitFor(() => {
        expect(yearInput.value).toBe('2024/25'); // Should reset to default
      });
    });

    it('preserves status selection as active after student creation', async () => {
      renderWithProviders(<AddStudent />);
      
      const classSelect = testingScreen.getByLabelText('Klasse');
      const firstNameInput = testingScreen.getByLabelText('Vorname');
      const lastNameInput = testingScreen.getByLabelText('Nachname');
      const statusSelect = testingScreen.getByLabelText('Status') as HTMLSelectElement;
      const createButton = testingScreen.getByRole('button', { name: 'Schüler*in anlegen' });

      await user.selectOptions(classSelect, '1');
      await user.type(firstNameInput, 'Test');
      await user.type(lastNameInput, 'Student');
      await user.selectOptions(statusSelect, 'inactive');
      
      await user.click(createButton);

      await waitFor(() => {
        expect(statusSelect.value).toBe('active'); // Should reset to default active
      });
    });
  });
});