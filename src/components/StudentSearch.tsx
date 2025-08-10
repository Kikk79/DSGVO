import React, { useState, useEffect } from 'react';
import { Search, Download, Filter, Calendar } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

export const StudentSearch: React.FC = () => {
  const { 
    students, 
    observations, 
    searchObservations, 
    exportStudentData,
    loading 
  } = useAppStore();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const CATEGORIES = ['Sozial', 'Fachlich', 'Verhalten', 'Förderung', 'Sonstiges'];

  useEffect(() => {
    searchObservations(
      searchQuery || undefined,
      selectedStudent || undefined, 
      selectedCategory || undefined
    );
  }, [searchQuery, selectedStudent, selectedCategory, searchObservations]);

  const handleExport = async (studentId: number, format: string) => {
    try {
      const data = await exportStudentData(studentId, format);
      
      // Create download
      const student = students.find(s => s.id === studentId);
      const filename = `beobachtungen_${student?.first_name}_${student?.last_name}.${format}`;
      
      const blob = new Blob([data], { 
        type: format === 'json' ? 'application/json' : 'text/csv' 
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  // Filtered students for potential future use
  // const filteredStudents = students.filter(student =>
  //   searchQuery === '' || 
  //   `${student.first_name} ${student.last_name}`.toLowerCase().includes(searchQuery.toLowerCase())
  // );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Schüler finden</h1>
        <p className="text-gray-600 mt-1">
          Suchen Sie nach Beobachtungen und exportieren Sie Daten
        </p>
      </div>

      {/* Search and Filters */}
      <div className="card space-y-4">
        {/* Search Bar */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" aria-hidden="true" />
          </div>
          <input
            type="text"
            placeholder="Nach Schüler*in oder Beobachtungstext suchen..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field pl-10"
          />
        </div>

        {/* Filter Toggle */}
        <div className="flex justify-between items-center">
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className="btn-secondary flex items-center"
          >
            <Filter className="h-4 w-4 mr-2" aria-hidden="true" />
            Filter
          </button>
          
          <p className="text-sm text-gray-500">
            {observations.length} Beobachtungen gefunden
          </p>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-200">
            <div>
              <label htmlFor="student-filter" className="block text-sm font-medium text-gray-700 mb-1">
                Schüler*in
              </label>
              <select
                id="student-filter"
                value={selectedStudent || ''}
                onChange={(e) => setSelectedStudent(e.target.value ? Number(e.target.value) : null)}
                className="select-field"
              >
                <option value="">Alle Schüler*innen</option>
                {students.map(student => (
                  <option key={student.id} value={student.id}>
                    {student.first_name} {student.last_name}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label htmlFor="category-filter" className="block text-sm font-medium text-gray-700 mb-1">
                Kategorie
              </label>
              <select
                id="category-filter"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="select-field"
              >
                <option value="">Alle Kategorien</option>
                {CATEGORIES.map(category => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin h-8 w-8 mx-auto border-2 border-blue-500 border-t-transparent rounded-full"></div>
          <p className="mt-2 text-gray-500">Lade Beobachtungen...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {observations.map((observation) => {
            const student = students.find(s => s.id === observation.student_id);
            return (
              <div key={observation.id} className="card">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center space-x-4 mb-2">
                      <h3 className="text-lg font-medium text-gray-900">
                        {student ? `${student.first_name} ${student.last_name}` : 'Unbekannter Schüler'}
                      </h3>
                      <span className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded-full">
                        {observation.category}
                      </span>
                    </div>
                    
                    <p className="text-gray-700 mb-3">
                      {observation.text}
                    </p>
                    
                    <div className="flex items-center space-x-4 text-sm text-gray-500">
                      <span className="flex items-center">
                        <Calendar className="h-4 w-4 mr-1" aria-hidden="true" />
                        {format(new Date(observation.created_at), 'd. MMMM yyyy, HH:mm', { locale: de })}
                      </span>
                      {observation.tags.length > 0 && (
                        <div className="flex items-center space-x-1">
                          {observation.tags.map(tag => (
                            <span key={tag} className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2 ml-4">
                    {student && (
                      <div className="relative group">
                        <button className="btn-secondary">
                          <Download className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <div className="absolute right-0 mt-2 w-40 bg-white border border-gray-200 rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-10">
                          <button
                            onClick={() => handleExport(student.id, 'json')}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 first:rounded-t-md"
                          >
                            JSON Export
                          </button>
                          <button
                            onClick={() => handleExport(student.id, 'csv')}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 last:rounded-b-md"
                          >
                            CSV Export
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          
          {observations.length === 0 && (
            <div className="text-center py-8">
              <Search className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">
                Keine Beobachtungen gefunden
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Versuchen Sie andere Suchbegriffe oder Filter.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};