import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { 
  Save, 
  X, 
  Tag, 
  User, 
  BookOpen
} from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { invoke } from '@tauri-apps/api/core';

interface ObservationFormData {
  student_id: number;
  category: string;
  text: string;
  tags: string;
}

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

const QUICK_TAGS = [
  'Aufmerksamkeit',
  'Mitarbeit',
  'Hilfsbereit',
  'Konzentration',
  'Teamwork',
  'Selbstständig',
  'Motivation',
  'Verbesserung'
];

export const ObservationForm: React.FC = () => {
  const navigate = useNavigate();
  const textareaEl = useRef<HTMLTextAreaElement | null>(null);
  const { students, classes, createObservation, loading } = useAppStore();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch
  } = useForm<ObservationFormData>();
  
  // Keep a stable register for the textarea so we can also attach our own ref
  const textRegister = register('text', {
    required: 'Bitte geben Sie eine Beobachtung ein',
    minLength: {
      value: 10,
      message: 'Die Beobachtung sollte mindestens 10 Zeichen enthalten'
    }
  });

  const watchedStudentId = watch('student_id');

  useEffect(() => {
    // Focus on text area when component mounts
    if (textareaEl.current) {
      textareaEl.current.focus();
    }
    
    // Load categories
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      setCategoriesLoading(true);
      const result = await invoke<Category[]>('get_categories');
      setCategories(result);
    } catch (error) {
      console.error('Failed to load categories:', error);
      // Fallback to empty array if categories can't be loaded
      setCategories([]);
    } finally {
      setCategoriesLoading(false);
    }
  };

  const selectedStudent = students.find(s => s.id === Number(watchedStudentId));
  const studentClass = selectedStudent ? classes.find(c => c.id === selectedStudent.class_id) : null;

  const onSubmit = async (data: ObservationFormData) => {
    try {
      const tags = data.tags
        ? data.tags.split(',').map(tag => tag.trim()).filter(Boolean)
        : selectedTags;

      await createObservation({
        student_id: Number(data.student_id),
        category: data.category,
        text: data.text,
        tags,
      });

      // Reset form and navigate
      reset();
      setSelectedTags([]);
      navigate('/', { replace: true });
    } catch (error) {
      console.error('Error creating observation:', error);
    }
  };

  const handleTagToggle = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const handleAddCustomTag = () => {
    if (customTag.trim() && !selectedTags.includes(customTag.trim())) {
      setSelectedTags(prev => [...prev, customTag.trim()]);
      setCustomTag('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setSelectedTags(prev => prev.filter(t => t !== tag));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    // Ctrl+S to save (accessibility shortcut)
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      handleSubmit(onSubmit)();
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6" onKeyDown={handleKeyPress}>
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Neue Beobachtung</h1>
          <p className="text-gray-600 mt-1">
            {format(new Date(), 'EEEE, d. MMMM yyyy • HH:mm', { locale: de })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="btn-secondary"
          aria-label="Zurück"
        >
          <X className="h-4 w-4 mr-2" aria-hidden="true" />
          Abbrechen
        </button>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-6">
            {/* Student Selection */}
            <div className="card">
              <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <User className="h-5 w-5 mr-2" aria-hidden="true" />
                Schüler*in
              </h2>
              
              <div>
                <label htmlFor="student_id" className="sr-only">
                  Schüler*in auswählen
                </label>
                <select
                  id="student_id"
                  {...register('student_id', { 
                    required: 'Bitte wählen Sie eine*n Schüler*in aus' 
                  })}
                  className="select-field"
                  aria-describedby={errors.student_id ? 'student_id-error' : undefined}
                >
                  <option value="">Schüler*in auswählen...</option>
                  {students.map(student => {
                    const studentClass = classes.find(c => c.id === student.class_id);
                    return (
                      <option key={student.id} value={student.id}>
                        {student.first_name} {student.last_name}
                        {studentClass && ` (${studentClass.name})`}
                      </option>
                    );
                  })}
                </select>
                {errors.student_id && (
                  <p id="student_id-error" className="mt-1 text-sm text-red-600">
                    {errors.student_id.message}
                  </p>
                )}
              </div>

              {/* Student Info */}
              {selectedStudent && (
                <div className="mt-4 p-3 bg-gray-50 rounded-md">
                  <div className="flex items-center text-sm">
                    <BookOpen className="h-4 w-4 mr-2 text-gray-500" aria-hidden="true" />
                    <span className="font-medium">
                      {selectedStudent.first_name} {selectedStudent.last_name}
                    </span>
                    {studentClass && (
                      <span className="ml-2 text-gray-500">
                        • {studentClass.name} ({studentClass.school_year})
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Category */}
            <div className="card">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Kategorie
              </h2>
              
              {categoriesLoading ? (
                <div className="flex justify-center py-4">
                  <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full" />
                </div>
              ) : (
                <div>
                  <label htmlFor="category" className="sr-only">
                    Kategorie auswählen
                  </label>
                  <select
                    id="category"
                    {...register('category', { 
                      required: 'Bitte wählen Sie eine Kategorie aus' 
                    })}
                    className="select-field"
                    aria-describedby={errors.category ? 'category-error' : undefined}
                  >
                    <option value="">Kategorie auswählen...</option>
                    {categories.map(category => (
                      <option key={category.id} value={category.name}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                  {errors.category && (
                    <p id="category-error" className="mt-1 text-sm text-red-600">
                      {errors.category.message}
                    </p>
                  )}
                  
                  {/* Category Preview */}
                  {watch('category') && (
                    <div className="mt-3">
                      <p className="text-sm font-medium text-gray-700 mb-2">Vorschau:</p>
                      {(() => {
                        const selectedCategory = categories.find(c => c.name === watch('category'));
                        return selectedCategory ? (
                          <span
                            className="inline-block px-3 py-1 text-sm font-medium rounded-full"
                            style={{
                              backgroundColor: selectedCategory.background_color,
                              color: selectedCategory.text_color,
                              borderColor: selectedCategory.color,
                              borderWidth: '1px',
                            }}
                          >
                            {selectedCategory.name}
                          </span>
                        ) : null;
                      })()}
                    </div>
                  )}
                </div>
              )}
              
              {categories.length === 0 && !categoriesLoading && (
                <div className="text-center py-4">
                  <p className="text-sm text-gray-500">
                    Keine Kategorien verfügbar.{' '}
                    <button
                      type="button"
                      onClick={() => navigate('/kategorien')}
                      className="text-blue-600 hover:text-blue-800 underline"
                    >
                      Kategorien verwalten
                    </button>
                  </p>
                </div>
              )}
            </div>

            {/* Tags */}
            <div className="card">
              <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <Tag className="h-5 w-5 mr-2" aria-hidden="true" />
                Schlagwörter
              </h2>

              {/* Quick Tags */}
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    Häufige Schlagwörter:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_TAGS.map(tag => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => handleTagToggle(tag)}
                        className={`px-3 py-1 text-sm rounded-full border transition-colors focus-ring ${
                          selectedTags.includes(tag)
                            ? 'bg-blue-100 border-blue-300 text-blue-800'
                            : 'bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Tag Input */}
                <div>
                  <label htmlFor="custom-tag" className="text-sm font-medium text-gray-700 block mb-1">
                    Eigenes Schlagwort:
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="custom-tag"
                      type="text"
                      value={customTag}
                      onChange={(e) => setCustomTag(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCustomTag();
                        }
                      }}
                      className="input-field flex-1"
                      placeholder="Neues Schlagwort eingeben"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomTag}
                      disabled={!customTag.trim()}
                      className="btn-secondary shrink-0"
                    >
                      Hinzufügen
                    </button>
                  </div>
                </div>

                {/* Selected Tags */}
                {selectedTags.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">
                      Ausgewählte Schlagwörter:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {selectedTags.map(tag => (
                        <span
                          key={tag}
                          className="inline-flex items-center px-3 py-1 text-sm bg-blue-100 text-blue-800 rounded-full"
                        >
                          {tag}
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(tag)}
                            className="ml-2 text-blue-600 hover:text-blue-800 focus-ring rounded-full p-0.5"
                            aria-label={`Schlagwort "${tag}" entfernen`}
                          >
                            <X className="h-3 w-3" aria-hidden="true" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Hidden input for form */}
                <input
                  type="hidden"
                  {...register('tags')}
                  value={selectedTags.join(',')}
                />
              </div>
            </div>
          </div>

          {/* Right Column - Main Text */}
          <div className="space-y-6">
            <div className="card h-full">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Beobachtung
              </h2>
              
              <div className="h-full">
                <label htmlFor="observation-text" className="sr-only">
                  Beobachtungstext
                </label>
                <textarea
                  id="observation-text"
                  {...textRegister}
                  ref={(el) => {
                    // Chain react-hook-form ref and our local ref
                    if (typeof textRegister.ref === 'function') {
                      textRegister.ref(el);
                    } else if (textRegister.ref) {
                      // @ts-ignore - assign possible RefObject
                      textRegister.ref.current = el;
                    }
                    textareaEl.current = el as HTMLTextAreaElement | null;
                  }}
                  rows={15}
                  className="textarea-field h-full resize-none"
                  placeholder="Was haben Sie beobachtet? Beschreiben Sie die Situation, das Verhalten oder die Leistung des Schülers/der Schülerin..."
                  aria-describedby={errors.text ? 'text-error' : 'text-help'}
                />
                {errors.text && (
                  <p id="text-error" className="mt-1 text-sm text-red-600">
                    {errors.text.message}
                  </p>
                )}
                <p id="text-help" className="mt-1 text-sm text-gray-500">
                  Tastenkombination: Strg+S zum Speichern
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="btn-secondary"
          >
            Abbrechen
          </button>
          <button
            type="submit"
            disabled={loading}
            className="btn-primary flex items-center"
          >
            {loading ? (
              <>
                <div className="animate-spin h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full" />
                Speichert...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" aria-hidden="true" />
                Beobachtung speichern
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};