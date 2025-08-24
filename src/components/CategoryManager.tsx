import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { 
  Palette, 
  Plus, 
  Edit2, 
  Trash2, 
  Save, 
  X,
  AlertCircle,
  Eye
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface Category {
  id: number;
  name: string;
  color: string;
  background_color: string;
  text_color: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  source_device_id: string;
}

interface CategoryFormData {
  name: string;
  color: string;
  background_color: string;
  text_color: string;
}

const COLOR_PRESETS = [
  { name: 'Grün', color: '#10B981', bg: '#D1FAE5', text: '#065F46' },
  { name: 'Blau', color: '#3B82F6', bg: '#DBEAFE', text: '#1E3A8A' },
  { name: 'Gelb', color: '#F59E0B', bg: '#FEF3C7', text: '#92400E' },
  { name: 'Lila', color: '#8B5CF6', bg: '#EDE9FE', text: '#5B21B6' },
  { name: 'Rot', color: '#EF4444', bg: '#FEE2E2', text: '#991B1B' },
  { name: 'Rosa', color: '#EC4899', bg: '#FCE7F3', text: '#831843' },
  { name: 'Türkis', color: '#06B6D4', bg: '#CFFAFE', text: '#0E7490' },
  { name: 'Orange', color: '#F97316', bg: '#FED7AA', text: '#9A3412' },
  { name: 'Grau', color: '#6B7280', bg: '#F3F4F6', text: '#374151' },
];

export const CategoryManager: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch
  } = useForm<CategoryFormData>();

  const watchedColors = watch(['color', 'background_color', 'text_color']);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      setLoading(true);
      const result = await invoke<Category[]>('get_categories');
      setCategories(result);
    } catch (err) {
      setError(err as string);
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: CategoryFormData) => {
    try {
      setError(null);
      
      if (editingId) {
        // Update existing category
        await invoke('update_category', {
          id: editingId,
          name: data.name,
          color: data.color,
          backgroundColor: data.background_color,
          textColor: data.text_color,
        });
      } else {
        // Create new category
        await invoke('create_category', {
          name: data.name,
          color: data.color,
          backgroundColor: data.background_color,
          textColor: data.text_color,
        });
      }

      // Reset form and reload data
      reset();
      setEditingId(null);
      setShowAddForm(false);
      await loadCategories();
    } catch (err) {
      setError(err as string);
    }
  };

  const handleEdit = (category: Category) => {
    setEditingId(category.id);
    setShowAddForm(true);
    setValue('name', category.name);
    setValue('color', category.color);
    setValue('background_color', category.background_color);
    setValue('text_color', category.text_color);
  };

  const handleDelete = async (id: number, forceDelete = false) => {
    try {
      setError(null);
      await invoke('delete_category', { id, forceDelete });
      await loadCategories();
    } catch (err) {
      setError(err as string);
    }
  };

  const applyColorPreset = (preset: typeof COLOR_PRESETS[0]) => {
    setValue('color', preset.color);
    setValue('background_color', preset.bg);
    setValue('text_color', preset.text);
  };

  const cancelEdit = () => {
    reset();
    setEditingId(null);
    setShowAddForm(false);
    setError(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <Palette className="h-6 w-6 mr-2" aria-hidden="true" />
            Kategorie-Verwaltung
          </h1>
          <p className="text-gray-600 mt-1">
            Erstellen und verwalten Sie benutzerdefinierte Kategorien mit Farben
          </p>
        </div>
        
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="btn-primary flex items-center"
          >
            <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
            Neue Kategorie
          </button>
        )}
      </div>

      {/* Error Alert */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md flex items-center">
          <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* Add/Edit Form */}
      {showAddForm && (
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-medium text-gray-900">
              {editingId ? 'Kategorie bearbeiten' : 'Neue Kategorie erstellen'}
            </h2>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Category Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Kategorie-Name *
              </label>
              <input
                id="name"
                type="text"
                {...register('name', { 
                  required: 'Name ist erforderlich',
                  minLength: { value: 2, message: 'Name muss mindestens 2 Zeichen lang sein' }
                })}
                className="input-field"
                placeholder="z.B. Sozialverhalten"
              />
              {errors.name && (
                <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
              )}
            </div>

            {/* Color Presets */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Farbschema auswählen
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-4">
                {COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => applyColorPreset(preset)}
                    className="flex flex-col items-center p-2 rounded-lg border-2 border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none transition-colors"
                    title={`${preset.name} Farbschema anwenden`}
                  >
                    <div 
                      className="w-8 h-8 rounded-full mb-1"
                      style={{ backgroundColor: preset.color }}
                    />
                    <span className="text-xs text-gray-600">{preset.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Colors */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="color" className="block text-sm font-medium text-gray-700 mb-1">
                  Primärfarbe *
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    id="color"
                    type="color"
                    {...register('color', { required: 'Primärfarbe ist erforderlich' })}
                    className="w-12 h-10 rounded border border-gray-300 cursor-pointer"
                  />
                  <input
                    type="text"
                    {...register('color')}
                    className="input-field flex-1 font-mono text-sm"
                    placeholder="#3B82F6"
                  />
                </div>
                {errors.color && (
                  <p className="mt-1 text-sm text-red-600">{errors.color.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="background_color" className="block text-sm font-medium text-gray-700 mb-1">
                  Hintergrundfarbe *
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    id="background_color"
                    type="color"
                    {...register('background_color', { required: 'Hintergrundfarbe ist erforderlich' })}
                    className="w-12 h-10 rounded border border-gray-300 cursor-pointer"
                  />
                  <input
                    type="text"
                    {...register('background_color')}
                    className="input-field flex-1 font-mono text-sm"
                    placeholder="#DBEAFE"
                  />
                </div>
                {errors.background_color && (
                  <p className="mt-1 text-sm text-red-600">{errors.background_color.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="text_color" className="block text-sm font-medium text-gray-700 mb-1">
                  Textfarbe *
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    id="text_color"
                    type="color"
                    {...register('text_color', { required: 'Textfarbe ist erforderlich' })}
                    className="w-12 h-10 rounded border border-gray-300 cursor-pointer"
                  />
                  <input
                    type="text"
                    {...register('text_color')}
                    className="input-field flex-1 font-mono text-sm"
                    placeholder="#1E3A8A"
                  />
                </div>
                {errors.text_color && (
                  <p className="mt-1 text-sm text-red-600">{errors.text_color.message}</p>
                )}
              </div>
            </div>

            {/* Color Preview */}
            {watchedColors[0] && watchedColors[1] && watchedColors[2] && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Vorschau
                </label>
                <div className="flex items-center space-x-4">
                  <span
                    className="px-3 py-2 rounded-full text-sm font-medium"
                    style={{
                      backgroundColor: watchedColors[1],
                      color: watchedColors[2],
                      borderColor: watchedColors[0],
                      borderWidth: '1px',
                    }}
                  >
                    {watch('name') || 'Kategorienname'}
                  </span>
                  <div className="flex items-center text-sm text-gray-500">
                    <Eye className="h-4 w-4 mr-1" aria-hidden="true" />
                    So wird die Kategorie in Beobachtungen angezeigt
                  </div>
                </div>
              </div>
            )}

            {/* Form Actions */}
            <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
              <button
                type="button"
                onClick={cancelEdit}
                className="btn-secondary"
              >
                <X className="h-4 w-4 mr-2" aria-hidden="true" />
                Abbrechen
              </button>
              <button
                type="submit"
                className="btn-primary"
              >
                <Save className="h-4 w-4 mr-2" aria-hidden="true" />
                {editingId ? 'Aktualisieren' : 'Erstellen'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Categories List */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-medium text-gray-900">
            Bestehende Kategorien ({categories.length})
          </h2>
        </div>

        {categories.length === 0 ? (
          <div className="text-center py-8">
            <Palette className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">
              Keine Kategorien vorhanden
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Erstellen Sie Ihre erste Kategorie für Beobachtungen.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {categories.map((category) => (
              <div
                key={category.id}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center space-x-4">
                  <span
                    className="px-3 py-2 rounded-full text-sm font-medium"
                    style={{
                      backgroundColor: category.background_color,
                      color: category.text_color,
                      borderColor: category.color,
                      borderWidth: '1px',
                    }}
                  >
                    {category.name}
                  </span>
                  
                  <div className="text-sm text-gray-500">
                    Sortierung: {category.sort_order}
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleEdit(category)}
                    className="p-2 text-gray-400 hover:text-blue-600 focus:outline-none focus:text-blue-600"
                    title="Kategorie bearbeiten"
                  >
                    <Edit2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                  
                  <button
                    onClick={() => handleDelete(category.id, false)}
                    className="p-2 text-gray-400 hover:text-red-600 focus:outline-none focus:text-red-600"
                    title="Kategorie löschen (Soft Delete)"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};