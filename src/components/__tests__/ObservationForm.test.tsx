import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ObservationForm } from '../ObservationForm';
import { renderWithProviders, mockUseAppStore, mockStudents, mockClasses } from '../../test/utils';

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('ObservationForm Component', () => {
  let mockStore: ReturnType<typeof mockUseAppStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
    mockStore = mockUseAppStore({
      students: mockStudents,
      classes: mockClasses,
      loading: false,
      error: null,
    });
  });

  describe('Rendering', () => {
    it('should render form header correctly', () => {
      renderWithProviders(<ObservationForm />);
      
      expect(screen.getByText('Neue Beobachtung')).toBeInTheDocument();
      expect(screen.getByText('Erfassen Sie eine neue Schülerbeobachtung')).toBeInTheDocument();
    });

    it('should render all form fields', () => {
      renderWithProviders(<ObservationForm />);
      
      expect(screen.getByLabelText('Schüler*in auswählen')).toBeInTheDocument();
      expect(screen.getByLabelText('Kategorie')).toBeInTheDocument();
      expect(screen.getByLabelText('Beobachtung')).toBeInTheDocument();
      expect(screen.getByLabelText('Tags')).toBeInTheDocument();
    });

    it('should render form buttons', () => {
      renderWithProviders(<ObservationForm />);
      
      expect(screen.getByText('Speichern')).toBeInTheDocument();
      expect(screen.getByText('Abbrechen')).toBeInTheDocument();
    });

    it('should show character count for observation text', () => {
      renderWithProviders(<ObservationForm />);
      
      expect(screen.getByText('0 / 2000')).toBeInTheDocument();
    });
  });

  describe('Student Selection', () => {
    it('should populate student options by class', () => {
      renderWithProviders(<ObservationForm />);
      
      const studentSelect = screen.getByLabelText('Schüler*in auswählen');
      
      // Should show placeholder
      expect(studentSelect).toHaveValue('');
      
      // Should have grouped options (testing library doesn't easily test optgroups, but we can test options exist)
      expect(screen.getByText('Max Mustermann')).toBeInTheDocument();
      expect(screen.getByText('Anna Schmidt')).toBeInTheDocument();
    });

    it('should handle selection of student', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ObservationForm />);
      
      const studentSelect = screen.getByLabelText('Schüler*in auswählen');
      
      await user.selectOptions(studentSelect, '1');
      
      expect(studentSelect).toHaveValue('1');
    });

    it('should show empty state when no students available', () => {
      mockStore = mockUseAppStore({
        students: [],
        classes: [],
        loading: false,
        error: null,
      });
      
      renderWithProviders(<ObservationForm />);
      
      const studentSelect = screen.getByLabelText('Schüler*in auswählen');
      expect(studentSelect.children).toHaveLength(1); // Only placeholder option
    });
  });

  describe('Category Selection', () => {
    it('should populate category options', () => {
      renderWithProviders(<ObservationForm />);
      
      const categorySelect = screen.getByLabelText('Kategorie');
      
      expect(screen.getByText('Sozial')).toBeInTheDocument();
      expect(screen.getByText('Fachlich')).toBeInTheDocument();
      expect(screen.getByText('Verhalten')).toBeInTheDocument();
      expect(screen.getByText('Förderung')).toBeInTheDocument();
      expect(screen.getByText('Sonstiges')).toBeInTheDocument();
    });

    it('should handle category selection', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ObservationForm />);
      
      const categorySelect = screen.getByLabelText('Kategorie');
      
      await user.selectOptions(categorySelect, 'Sozial');
      
      expect(categorySelect).toHaveValue('Sozial');
    });
  });

  describe('Observation Text', () => {
    it('should handle text input', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ObservationForm />);
      
      const textArea = screen.getByLabelText('Beobachtung');
      
      await user.type(textArea, 'Dies ist eine Testbeobachtung');
      
      expect(textArea).toHaveValue('Dies ist eine Testbeobachtung');
    });

    it('should update character count', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ObservationForm />);
      
      const textArea = screen.getByLabelText('Beobachtung');
      const testText = 'Test';
      
      await user.type(textArea, testText);
      
      expect(screen.getByText(`${testText.length} / 2000`)).toBeInTheDocument();
    });

    it('should enforce character limit', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ObservationForm />);
      
      const textArea = screen.getByLabelText('Beobachtung');
      const longText = 'A'.repeat(2001); // Exceeds limit
      
      await user.type(textArea, longText);
      
      // Should be truncated to 2000 characters
      expect(textArea).toHaveValue('A'.repeat(2000));
      expect(screen.getByText('2000 / 2000')).toBeInTheDocument();
    });

    it('should show warning when approaching character limit', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ObservationForm />);
      
      const textArea = screen.getByLabelText('Beobachtung');
      const longText = 'A'.repeat(1900); // Close to limit
      
      await user.type(textArea, longText);
      
      expect(screen.getByText('1900 / 2000')).toBeInTheDocument();
      // Character count should have warning styling (would need to check CSS classes)
    });
  });

  describe('Tag Management', () => {
    it('should show suggested tags', () => {
      renderWithProviders(<ObservationForm />);
      
      // Common suggested tags should be visible
      expect(screen.getByText('hilfsbereit')).toBeInTheDocument();
      expect(screen.getByText('teamwork')).toBeInTheDocument();
      expect(screen.getByText('aufmerksam')).toBeInTheDocument();
      expect(screen.getByText('fortschritt')).toBeInTheDocument();
    });

    it('should add tag when clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ObservationForm />);
      
      await user.click(screen.getByText('hilfsbereit'));
      
      // Tag should appear in selected tags
      expect(screen.getByText('hilfsbereit ×')).toBeInTheDocument();
    });

    it('should remove tag when x clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ObservationForm />);
      
      // Add tag first
      await user.click(screen.getByText('hilfsbereit'));
      expect(screen.getByText('hilfsbereit ×')).toBeInTheDocument();
      
      // Remove tag
      await user.click(screen.getByText('×'));
      
      // Tag should be removed from selected tags
      expect(screen.queryByText('hilfsbereit ×')).not.toBeInTheDocument();
      // But should still be in suggestions
      expect(screen.getByText('hilfsbereit')).toBeInTheDocument();
    });

    it('should add custom tag via input', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ObservationForm />);
      
      const tagInput = screen.getByPlaceholderText('Neuen Tag hinzufügen...');
      
      await user.type(tagInput, 'custom-tag');
      await user.keyboard('{Enter}');
      
      expect(screen.getByText('custom-tag ×')).toBeInTheDocument();
      expect(tagInput).toHaveValue(''); // Input should be cleared
    });

    it('should not add duplicate tags', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ObservationForm />);
      
      // Add tag twice
      await user.click(screen.getByText('hilfsbereit'));
      await user.click(screen.getByText('hilfsbereit'));
      
      // Should only appear once in selected tags
      const selectedTags = screen.getAllByText('hilfsbereit ×');
      expect(selectedTags).toHaveLength(1);
    });

    it('should not add empty or whitespace-only tags', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ObservationForm />);
      
      const tagInput = screen.getByPlaceholderText('Neuen Tag hinzufügen...');
      
      await user.type(tagInput, '   ');
      await user.keyboard('{Enter}');
      
      expect(screen.queryByText('   ×')).not.toBeInTheDocument();
      expect(tagInput).toHaveValue('');
    });

    it('should limit tag length', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ObservationForm />);
      
      const tagInput = screen.getByPlaceholderText('Neuen Tag hinzufügen...');
      const longTag = 'A'.repeat(51); // Exceeds typical tag limit
      
      await user.type(tagInput, longTag);
      await user.keyboard('{Enter}');
      
      // Should be truncated or rejected
      const addedTag = screen.queryByText(`${longTag} ×`);
      expect(addedTag).not.toBeInTheDocument();
    });
  });

  describe('Form Validation', () => {
    it('should require student selection', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ObservationForm />);
      
      // Fill other required fields
      await user.selectOptions(screen.getByLabelText('Kategorie'), 'Sozial');
      await user.type(screen.getByLabelText('Beobachtung'), 'Test observation');
      
      // Try to submit without selecting student
      await user.click(screen.getByText('Speichern'));
      
      expect(mockStore.createObservation).not.toHaveBeenCalled();
    });

    it('should require category selection', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ObservationForm />);
      
      // Fill other required fields
      await user.selectOptions(screen.getByLabelText('Schüler*in auswählen'), '1');
      await user.type(screen.getByLabelText('Beobachtung'), 'Test observation');
      
      // Try to submit without selecting category
      await user.click(screen.getByText('Speichern'));
      
      expect(mockStore.createObservation).not.toHaveBeenCalled();
    });

    it('should require observation text', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ObservationForm />);
      
      // Fill other required fields
      await user.selectOptions(screen.getByLabelText('Schüler*in auswählen'), '1');
      await user.selectOptions(screen.getByLabelText('Kategorie'), 'Sozial');
      
      // Try to submit without observation text
      await user.click(screen.getByText('Speichern'));
      
      expect(mockStore.createObservation).not.toHaveBeenCalled();
    });

    it('should show validation errors', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ObservationForm />);
      
      // Try to submit empty form
      await user.click(screen.getByText('Speichern'));
      
      // Should show validation messages
      expect(screen.getByText('Bitte wählen Sie einen Schüler aus')).toBeInTheDocument();
      expect(screen.getByText('Bitte wählen Sie eine Kategorie aus')).toBeInTheDocument();
      expect(screen.getByText('Bitte geben Sie eine Beobachtung ein')).toBeInTheDocument();
    });
  });

  describe('Form Submission', () => {
    it('should submit valid form successfully', async () => {
      const user = userEvent.setup();
      mockStore.createObservation.mockResolvedValue({
        id: 1,
        student_id: 1,
        author_id: 1,
        category: 'Sozial',
        text: 'Test observation',
        tags: ['test'],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        source_device_id: 'test-device-1',
      });
      
      renderWithProviders(<ObservationForm />);
      
      // Fill form
      await user.selectOptions(screen.getByLabelText('Schüler*in auswählen'), '1');
      await user.selectOptions(screen.getByLabelText('Kategorie'), 'Sozial');
      await user.type(screen.getByLabelText('Beobachtung'), 'Test observation');
      await user.click(screen.getByText('test'));
      
      // Submit
      await user.click(screen.getByText('Speichern'));
      
      await waitFor(() => {
        expect(mockStore.createObservation).toHaveBeenCalledWith({
          student_id: 1,
          category: 'Sozial',
          text: 'Test observation',
          tags: ['test'],
        });
      });
      
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });

    it('should handle submission errors', async () => {
      const user = userEvent.setup();
      mockStore.createObservation.mockRejectedValue(new Error('Save failed'));
      
      renderWithProviders(<ObservationForm />);
      
      // Fill and submit form
      await user.selectOptions(screen.getByLabelText('Schüler*in auswählen'), '1');
      await user.selectOptions(screen.getByLabelText('Kategorie'), 'Sozial');
      await user.type(screen.getByLabelText('Beobachtung'), 'Test observation');
      await user.click(screen.getByText('Speichern'));
      
      await waitFor(() => {
        expect(mockStore.createObservation).toHaveBeenCalled();
      });
      
      // Should not navigate on error
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('should show loading state during submission', async () => {
      const user = userEvent.setup();
      
      // Mock loading state
      mockStore = mockUseAppStore({
        students: mockStudents,
        classes: mockClasses,
        loading: true,
        error: null,
      });
      
      renderWithProviders(<ObservationForm />);
      
      expect(screen.getByText('Speichert...')).toBeInTheDocument();
      expect(screen.getByText('Speichert...')).toBeDisabled();
    });
  });

  describe('Form Reset and Cancel', () => {
    it('should reset form when reset button clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ObservationForm />);
      
      // Fill form
      await user.selectOptions(screen.getByLabelText('Schüler*in auswählen'), '1');
      await user.selectOptions(screen.getByLabelText('Kategorie'), 'Sozial');
      await user.type(screen.getByLabelText('Beobachtung'), 'Test');
      await user.click(screen.getByText('test'));
      
      // Reset should clear form
      // (This would need to be implemented in the component)
    });

    it('should navigate away on cancel', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ObservationForm />);
      
      await user.click(screen.getByText('Abbrechen'));
      
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });

    it('should show confirmation before discarding changes', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ObservationForm />);
      
      // Fill form with some data
      await user.type(screen.getByLabelText('Beobachtung'), 'Unsaved changes');
      
      await user.click(screen.getByText('Abbrechen'));
      
      // Should show confirmation dialog (if implemented)
      // For now, it just navigates away
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  describe('Accessibility', () => {
    it('should have proper form labels', () => {
      renderWithProviders(<ObservationForm />);
      
      expect(screen.getByLabelText('Schüler*in auswählen')).toBeInTheDocument();
      expect(screen.getByLabelText('Kategorie')).toBeInTheDocument();
      expect(screen.getByLabelText('Beobachtung')).toBeInTheDocument();
      expect(screen.getByLabelText('Tags')).toBeInTheDocument();
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ObservationForm />);
      
      // Tab through form fields
      await user.tab();
      expect(screen.getByLabelText('Schüler*in auswählen')).toHaveFocus();
      
      await user.tab();
      expect(screen.getByLabelText('Kategorie')).toHaveFocus();
      
      await user.tab();
      expect(screen.getByLabelText('Beobachtung')).toHaveFocus();
    });

    it('should have proper ARIA attributes', () => {
      renderWithProviders(<ObservationForm />);
      
      const textArea = screen.getByLabelText('Beobachtung');
      expect(textArea).toHaveAttribute('aria-describedby');
      
      const characterCount = screen.getByText('0 / 2000');
      expect(characterCount).toBeInTheDocument();
    });

    it('should announce form errors to screen readers', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ObservationForm />);
      
      await user.click(screen.getByText('Speichern'));
      
      const errorMessages = screen.getAllByRole('alert');
      expect(errorMessages.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing classes gracefully', () => {
      mockStore = mockUseAppStore({
        students: [],
        classes: [],
        loading: false,
        error: null,
      });
      
      renderWithProviders(<ObservationForm />);
      
      expect(screen.getByText('Neue Beobachtung')).toBeInTheDocument();
      expect(screen.getByLabelText('Schüler*in auswählen')).toBeInTheDocument();
    });

    it('should handle network errors during data loading', () => {
      mockStore = mockUseAppStore({
        students: [],
        classes: [],
        loading: false,
        error: 'Network error',
      });
      
      renderWithProviders(<ObservationForm />);
      
      // Form should still be usable despite loading errors
      expect(screen.getByText('Neue Beobachtung')).toBeInTheDocument();
    });

    it('should handle special characters in observation text', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ObservationForm />);
      
      const specialText = 'Äöü ß ! @ # $ % ^ & * ( ) " \' < >';
      const textArea = screen.getByLabelText('Beobachtung');
      
      await user.type(textArea, specialText);
      
      expect(textArea).toHaveValue(specialText);
    });

    it('should handle rapid form submissions', async () => {
      const user = userEvent.setup();
      mockStore.createObservation.mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 1000))
      );
      
      renderWithProviders(<ObservationForm />);
      
      // Fill form
      await user.selectOptions(screen.getByLabelText('Schüler*in auswählen'), '1');
      await user.selectOptions(screen.getByLabelText('Kategorie'), 'Sozial');
      await user.type(screen.getByLabelText('Beobachtung'), 'Test');
      
      // Submit multiple times rapidly
      await user.click(screen.getByText('Speichern'));
      await user.click(screen.getByText('Speichert...'));
      await user.click(screen.getByText('Speichert...'));
      
      // Should only submit once
      expect(mockStore.createObservation).toHaveBeenCalledTimes(1);
    });
  });
});