import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CategoryManager } from '../CategoryManager';

// Mock Tauri
const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}));

describe('CategoryManager', () => {
  const mockCategories = [
    {
      id: 1,
      name: 'Sozial',
      color: '#10B981',
      background_color: '#D1FAE5',
      text_color: '#065F46',
      is_active: true,
      sort_order: 1,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      source_device_id: 'test-device-1',
    },
    {
      id: 2,
      name: 'Fachlich',
      color: '#3B82F6',
      background_color: '#DBEAFE',
      text_color: '#1E3A8A',
      is_active: true,
      sort_order: 2,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      source_device_id: 'test-device-1',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(mockCategories);
  });

  describe('Initial Rendering', () => {
    it('should display loading spinner initially', () => {
      mockInvoke.mockImplementation(() => new Promise(() => {})); // Never resolves
      render(<CategoryManager />);

      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });

    it('should load and display categories successfully', async () => {
      render(<CategoryManager />);

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('get_categories');
      });

      expect(screen.getByText('Sozial')).toBeInTheDocument();
      expect(screen.getByText('Fachlich')).toBeInTheDocument();
      expect(screen.getByText(/Bestehende Kategorien \(2\)/)).toBeInTheDocument();
    });

    it('should handle loading error gracefully', async () => {
      mockInvoke.mockRejectedValue('Failed to load categories');

      render(<CategoryManager />);

      await waitFor(() => {
        expect(screen.getByText('Failed to load categories')).toBeInTheDocument();
      });
    });

    it('should display empty state when no categories', async () => {
      mockInvoke.mockResolvedValue([]);

      render(<CategoryManager />);

      await waitFor(() => {
        expect(screen.getByText('Keine Kategorien vorhanden')).toBeInTheDocument();
        expect(screen.getByText('Erstellen Sie Ihre erste Kategorie für Beobachtungen.')).toBeInTheDocument();
      });
    });
  });

  describe('Add Category Form', () => {
    it('should show add form when clicking "Neue Kategorie" button', async () => {
      render(<CategoryManager />);

      await waitFor(() => {
        expect(screen.getByText('Sozial')).toBeInTheDocument();
      });

      const addButton = screen.getByRole('button', { name: /Neue Kategorie/i });
      fireEvent.click(addButton);

      expect(screen.getByText('Neue Kategorie erstellen')).toBeInTheDocument();
      expect(screen.getByLabelText('Kategorie-Name *')).toBeInTheDocument();
    });

    it('should hide "Neue Kategorie" button when form is open', async () => {
      render(<CategoryManager />);

      await waitFor(() => {
        expect(screen.getByText('Sozial')).toBeInTheDocument();
      });

      const addButton = screen.getByRole('button', { name: /Neue Kategorie/i });
      fireEvent.click(addButton);

      expect(screen.queryByRole('button', { name: /Neue Kategorie/i })).not.toBeInTheDocument();
    });

    it('should validate required category name', async () => {
      render(<CategoryManager />);

      await waitFor(() => {
        expect(screen.getByText('Sozial')).toBeInTheDocument();
      });

      const addButton = screen.getByRole('button', { name: /Neue Kategorie/i });
      fireEvent.click(addButton);

      const saveButton = screen.getByRole('button', { name: /Erstellen/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('Name ist erforderlich')).toBeInTheDocument();
      });
    });

    it('should validate minimum category name length', async () => {
      const user = userEvent.setup();
      render(<CategoryManager />);

      await waitFor(() => {
        expect(screen.getByText('Sozial')).toBeInTheDocument();
      });

      const addButton = screen.getByRole('button', { name: /Neue Kategorie/i });
      await user.click(addButton);

      const nameInput = screen.getByLabelText('Kategorie-Name *');
      await user.type(nameInput, 'A');

      const saveButton = screen.getByRole('button', { name: /Erstellen/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('Name muss mindestens 2 Zeichen lang sein')).toBeInTheDocument();
      });
    });

    it('should create new category with valid data', async () => {
      const user = userEvent.setup();
      mockInvoke
        .mockResolvedValueOnce(mockCategories) // Initial load
        .mockResolvedValueOnce(undefined) // create_category
        .mockResolvedValueOnce([...mockCategories, {
          id: 3,
          name: 'Methodisch',
          color: '#F59E0B',
          background_color: '#FEF3C7',
          text_color: '#92400E',
          is_active: true,
          sort_order: 3,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          source_device_id: 'test-device-1',
        }]); // Reload after creation

      render(<CategoryManager />);

      await waitFor(() => {
        expect(screen.getByText('Sozial')).toBeInTheDocument();
      });

      const addButton = screen.getByRole('button', { name: /Neue Kategorie/i });
      await user.click(addButton);

      const nameInput = screen.getByLabelText('Kategorie-Name *');
      await user.type(nameInput, 'Methodisch');

      const saveButton = screen.getByRole('button', { name: /Erstellen/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('create_category', expect.objectContaining({
          name: 'Methodisch',
        }));
      });

      await waitFor(() => {
        expect(screen.getByText('Methodisch')).toBeInTheDocument();
      });
    });

    it('should handle category creation error', async () => {
      const user = userEvent.setup();
      mockInvoke
        .mockResolvedValueOnce(mockCategories) // Initial load
        .mockRejectedValueOnce('Category creation failed');

      render(<CategoryManager />);

      await waitFor(() => {
        expect(screen.getByText('Sozial')).toBeInTheDocument();
      });

      const addButton = screen.getByRole('button', { name: /Neue Kategorie/i });
      await user.click(addButton);

      const nameInput = screen.getByLabelText('Kategorie-Name *');
      await user.type(nameInput, 'Test Category');

      const saveButton = screen.getByRole('button', { name: /Erstellen/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('Category creation failed')).toBeInTheDocument();
      });
    });
  });

  describe('Color Preset Selection', () => {
    it('should display all color presets', async () => {
      render(<CategoryManager />);

      await waitFor(() => {
        expect(screen.getByText('Sozial')).toBeInTheDocument();
      });

      const addButton = screen.getByRole('button', { name: /Neue Kategorie/i });
      fireEvent.click(addButton);

      expect(screen.getByText('Grün')).toBeInTheDocument();
      expect(screen.getByText('Blau')).toBeInTheDocument();
      expect(screen.getByText('Gelb')).toBeInTheDocument();
      expect(screen.getByText('Lila')).toBeInTheDocument();
      expect(screen.getByText('Rot')).toBeInTheDocument();
      expect(screen.getByText('Rosa')).toBeInTheDocument();
      expect(screen.getByText('Türkis')).toBeInTheDocument();
      expect(screen.getByText('Orange')).toBeInTheDocument();
      expect(screen.getByText('Grau')).toBeInTheDocument();
    });

    it('should apply color preset when clicked', async () => {
      const user = userEvent.setup();
      render(<CategoryManager />);

      await waitFor(() => {
        expect(screen.getByText('Sozial')).toBeInTheDocument();
      });

      const addButton = screen.getByRole('button', { name: /Neue Kategorie/i });
      await user.click(addButton);

      const greenPreset = screen.getByRole('button', { name: /Grün Farbschema anwenden/i });
      await user.click(greenPreset);

      // Check that color inputs are populated
      const colorInput = screen.getAllByDisplayValue('#10B981')[0];
      const bgColorInput = screen.getAllByDisplayValue('#D1FAE5')[0];
      const textColorInput = screen.getAllByDisplayValue('#065F46')[0];

      expect(colorInput).toBeInTheDocument();
      expect(bgColorInput).toBeInTheDocument();
      expect(textColorInput).toBeInTheDocument();
    });

    it('should update preview when colors change', async () => {
      const user = userEvent.setup();
      render(<CategoryManager />);

      await waitFor(() => {
        expect(screen.getByText('Sozial')).toBeInTheDocument();
      });

      const addButton = screen.getByRole('button', { name: /Neue Kategorie/i });
      await user.click(addButton);

      const nameInput = screen.getByLabelText('Kategorie-Name *');
      await user.type(nameInput, 'Test');

      const bluePreset = screen.getByRole('button', { name: /Blau Farbschema anwenden/i });
      await user.click(bluePreset);

      // Check preview exists
      expect(screen.getByText('So wird die Kategorie in Beobachtungen angezeigt')).toBeInTheDocument();
    });
  });

  describe('Custom Color Selection', () => {
    it('should allow entering custom hex colors', async () => {
      const user = userEvent.setup();
      render(<CategoryManager />);

      await waitFor(() => {
        expect(screen.getByText('Sozial')).toBeInTheDocument();
      });

      const addButton = screen.getByRole('button', { name: /Neue Kategorie/i });
      await user.click(addButton);

      const colorInputs = screen.getAllByPlaceholderText('#3B82F6');
      await user.clear(colorInputs[0]);
      await user.type(colorInputs[0], '#FF0000');

      expect(colorInputs[0]).toHaveValue('#FF0000');
    });

    it('should sync color picker with hex input', async () => {
      render(<CategoryManager />);

      await waitFor(() => {
        expect(screen.getByText('Sozial')).toBeInTheDocument();
      });

      const addButton = screen.getByRole('button', { name: /Neue Kategorie/i });
      fireEvent.click(addButton);

      const bluePreset = screen.getByRole('button', { name: /Blau Farbschema anwenden/i });
      fireEvent.click(bluePreset);

      // Both color picker and text input should have same value
      const colorPicker = screen.getByLabelText('Primärfarbe *');
      const colorTextInputs = screen.getAllByDisplayValue('#3B82F6');

      expect(colorPicker).toHaveValue('#3b82f6');
      expect(colorTextInputs.length).toBeGreaterThan(0);
    });
  });

  describe('Edit Category', () => {
    it('should populate form with category data when editing', async () => {
      const user = userEvent.setup();
      render(<CategoryManager />);

      await waitFor(() => {
        expect(screen.getByText('Sozial')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByTitle('Kategorie bearbeiten');
      await user.click(editButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Kategorie bearbeiten')).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText('Kategorie-Name *') as HTMLInputElement;
      expect(nameInput.value).toBe('Sozial');

      expect(screen.getByDisplayValue('#10B981')).toBeInTheDocument();
      expect(screen.getByDisplayValue('#D1FAE5')).toBeInTheDocument();
      expect(screen.getByDisplayValue('#065F46')).toBeInTheDocument();
    });

    it('should update category when saving edits', async () => {
      const user = userEvent.setup();
      mockInvoke
        .mockResolvedValueOnce(mockCategories) // Initial load
        .mockResolvedValueOnce(undefined) // update_category
        .mockResolvedValueOnce([{
          ...mockCategories[0],
          name: 'Sozialverhalten',
        }, mockCategories[1]]); // Reload after update

      render(<CategoryManager />);

      await waitFor(() => {
        expect(screen.getByText('Sozial')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByTitle('Kategorie bearbeiten');
      await user.click(editButtons[0]);

      const nameInput = screen.getByLabelText('Kategorie-Name *');
      await user.clear(nameInput);
      await user.type(nameInput, 'Sozialverhalten');

      const updateButton = screen.getByRole('button', { name: /Aktualisieren/i });
      await user.click(updateButton);

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('update_category', expect.objectContaining({
          id: 1,
          name: 'Sozialverhalten',
        }));
      });

      await waitFor(() => {
        expect(screen.getByText('Sozialverhalten')).toBeInTheDocument();
      });
    });

    it('should show "Aktualisieren" button when editing', async () => {
      const user = userEvent.setup();
      render(<CategoryManager />);

      await waitFor(() => {
        expect(screen.getByText('Sozial')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByTitle('Kategorie bearbeiten');
      await user.click(editButtons[0]);

      expect(screen.getByRole('button', { name: /Aktualisieren/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Erstellen$/i })).not.toBeInTheDocument();
    });
  });

  describe('Delete Category', () => {
    it('should delete category when clicking delete button', async () => {
      const user = userEvent.setup();
      mockInvoke
        .mockResolvedValueOnce(mockCategories) // Initial load
        .mockResolvedValueOnce(undefined) // delete_category
        .mockResolvedValueOnce([mockCategories[1]]); // Reload after delete

      render(<CategoryManager />);

      await waitFor(() => {
        expect(screen.getByText('Sozial')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByTitle('Kategorie löschen (Soft Delete)');
      await user.click(deleteButtons[0]);

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('delete_category', {
          id: 1,
          forceDelete: false,
        });
      });

      await waitFor(() => {
        expect(screen.queryByText('Sozial')).not.toBeInTheDocument();
        expect(screen.getByText('Fachlich')).toBeInTheDocument();
      });
    });

    it('should handle delete error', async () => {
      const user = userEvent.setup();
      mockInvoke
        .mockResolvedValueOnce(mockCategories) // Initial load
        .mockRejectedValueOnce('Cannot delete category with existing observations');

      render(<CategoryManager />);

      await waitFor(() => {
        expect(screen.getByText('Sozial')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByTitle('Kategorie löschen (Soft Delete)');
      await user.click(deleteButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Cannot delete category with existing observations')).toBeInTheDocument();
      });
    });
  });

  describe('Form Cancellation', () => {
    it('should cancel add form and clear inputs', async () => {
      const user = userEvent.setup();
      render(<CategoryManager />);

      await waitFor(() => {
        expect(screen.getByText('Sozial')).toBeInTheDocument();
      });

      const addButton = screen.getByRole('button', { name: /Neue Kategorie/i });
      await user.click(addButton);

      const nameInput = screen.getByLabelText('Kategorie-Name *');
      await user.type(nameInput, 'Test Category');

      const cancelButton = screen.getByRole('button', { name: /Abbrechen/i });
      await user.click(cancelButton);

      expect(screen.queryByText('Neue Kategorie erstellen')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Neue Kategorie/i })).toBeInTheDocument();
    });

    it('should cancel edit form and reset to view mode', async () => {
      const user = userEvent.setup();
      render(<CategoryManager />);

      await waitFor(() => {
        expect(screen.getByText('Sozial')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByTitle('Kategorie bearbeiten');
      await user.click(editButtons[0]);

      const cancelButton = screen.getByRole('button', { name: /Abbrechen/i });
      await user.click(cancelButton);

      expect(screen.queryByText('Kategorie bearbeiten')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Neue Kategorie/i })).toBeInTheDocument();
    });

    it('should clear error when cancelling form', async () => {
      const user = userEvent.setup();
      mockInvoke
        .mockResolvedValueOnce(mockCategories) // Initial load
        .mockRejectedValueOnce('Creation error');

      render(<CategoryManager />);

      await waitFor(() => {
        expect(screen.getByText('Sozial')).toBeInTheDocument();
      });

      const addButton = screen.getByRole('button', { name: /Neue Kategorie/i });
      await user.click(addButton);

      const nameInput = screen.getByLabelText('Kategorie-Name *');
      await user.type(nameInput, 'Test');

      const saveButton = screen.getByRole('button', { name: /Erstellen/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('Creation error')).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: /Abbrechen/i });
      await user.click(cancelButton);

      expect(screen.queryByText('Creation error')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', async () => {
      render(<CategoryManager />);

      await waitFor(() => {
        expect(screen.getByText('Sozial')).toBeInTheDocument();
      });

      const addButton = screen.getByRole('button', { name: /Neue Kategorie/i });
      fireEvent.click(addButton);

      expect(screen.getByLabelText('Kategorie-Name *')).toBeInTheDocument();
      expect(screen.getByLabelText('Primärfarbe *')).toBeInTheDocument();
      expect(screen.getByLabelText('Hintergrundfarbe *')).toBeInTheDocument();
      expect(screen.getByLabelText('Textfarbe *')).toBeInTheDocument();
    });

    it('should have accessible color preset buttons', async () => {
      render(<CategoryManager />);

      await waitFor(() => {
        expect(screen.getByText('Sozial')).toBeInTheDocument();
      });

      const addButton = screen.getByRole('button', { name: /Neue Kategorie/i });
      fireEvent.click(addButton);

      const greenPreset = screen.getByRole('button', { name: /Grün Farbschema anwenden/i });
      expect(greenPreset).toHaveAttribute('title');
    });

    it('should hide decorative icons from screen readers', async () => {
      render(<CategoryManager />);

      await waitFor(() => {
        expect(screen.getByText('Sozial')).toBeInTheDocument();
      });

      const icons = document.querySelectorAll('[aria-hidden="true"]');
      expect(icons.length).toBeGreaterThan(0);
    });
  });

  describe('Category Display', () => {
    it('should display categories with correct styling', async () => {
      render(<CategoryManager />);

      await waitFor(() => {
        expect(screen.getByText('Sozial')).toBeInTheDocument();
      });

      const socialCategory = screen.getByText('Sozial');
      const parentSpan = socialCategory.closest('span');

      expect(parentSpan).toHaveStyle({
        backgroundColor: '#D1FAE5',
        color: '#065F46',
      });
    });

    it('should display sort order for categories', async () => {
      render(<CategoryManager />);

      await waitFor(() => {
        expect(screen.getByText('Sozial')).toBeInTheDocument();
      });

      expect(screen.getByText('Sortierung: 1')).toBeInTheDocument();
      expect(screen.getByText('Sortierung: 2')).toBeInTheDocument();
    });

    it('should display category count', async () => {
      render(<CategoryManager />);

      await waitFor(() => {
        expect(screen.getByText(/Bestehende Kategorien \(2\)/)).toBeInTheDocument();
      });
    });
  });
});
