import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  ChevronUp,
  ChevronDown,
  Filter,
  Download,
  Calendar,
  X,
  User,
  BookOpen,
  Tag,
  FileText
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { AssessmentRecord } from '../stores/appStore';

type SortField = 'observation_created_at' | 'student_name' | 'class_name' | 'category';
type SortDirection = 'asc' | 'desc';

interface AssessmentFilters {
  dateFrom: string;
  dateTo: string;
  category: string;
  class: string;
  studentSearch: string;
}

export const AssessmentsTable: React.FC = () => {
  const [assessments, setAssessments] = useState<AssessmentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('observation_created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [showFilters, setShowFilters] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  // Filters
  const [filters, setFilters] = useState<AssessmentFilters>({
    dateFrom: '',
    dateTo: '',
    category: '',
    class: '',
    studentSearch: ''
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  const loadAssessments = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const offset = (currentPage - 1) * itemsPerPage;
      const result = await invoke<AssessmentRecord[]>('get_assessments_comprehensive', {
        limit: itemsPerPage,
        offset,
        sortField,
        sortDirection,
        dateFrom: filters.dateFrom || null,
        dateTo: filters.dateTo || null,
        categoryFilter: filters.category || null,
        classFilter: filters.class || null,
        studentFilter: filters.studentSearch || null,
      });

      setAssessments(result);
      setTotalCount(result.length); // This would need to be enhanced for proper pagination
    } catch (err) {
      setError(`Failed to load assessments: ${err}`);
      console.error('Failed to load assessments:', err);
    } finally {
      setLoading(false);
    }
  }, [sortField, sortDirection, filters, currentPage, itemsPerPage]);

  // Load assessments
  useEffect(() => {
    loadAssessments();
  }, [loadAssessments]);

  // Get unique classes and categories for filters
  const uniqueClasses = useMemo(() => {
    const classes = [...new Set(assessments.map(a => a.class_name))].filter(Boolean).sort();
    return classes;
  }, [assessments]);

  const uniqueCategories = useMemo(() => {
    const categories = [...new Set(assessments.map(a => a.category))].filter(Boolean).sort();
    return categories;
  }, [assessments]);

  // Handle sorting
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1); // Reset to first page when sorting
  };

  // Handle filter changes
  const handleFilterChange = (key: keyof AssessmentFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setCurrentPage(1); // Reset to first page when filtering
  };

  // Clear all filters
  const clearFilters = () => {
    setFilters({
      dateFrom: '',
      dateTo: '',
      category: '',
      class: '',
      studentSearch: ''
    });
    setCurrentPage(1);
  };

  // Export to CSV
  const handleExportCSV = async () => {
    try {
      const csvData = await invoke<string>('export_assessments_csv', {
        dateFrom: filters.dateFrom || null,
        dateTo: filters.dateTo || null,
        categoryFilter: filters.category || null,
        classFilter: filters.class || null,
        studentFilter: filters.studentSearch || null,
        sortField,
        sortDirection,
      });

      // Create download
      const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `bewertungen_${format(new Date(), 'yyyy-MM-dd')}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(`Export failed: ${err}`);
      console.error('Export failed:', err);
    }
  };

  // Render sort icon
  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? 
      <ChevronUp className="w-4 h-4" /> : 
      <ChevronDown className="w-4 h-4" />;
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    try {
      return format(parseISO(dateString), 'dd.MM.yyyy HH:mm', { locale: de });
    } catch {
      return dateString;
    }
  };

  // Parse tags JSON
  const parseTags = (tagsString: string): string[] => {
    try {
      return JSON.parse(tagsString) || [];
    } catch {
      return [];
    }
  };

  // Calculate pagination
  const totalPages = Math.ceil(totalCount / itemsPerPage);
  const hasActiveFilters = Object.values(filters).some(value => value !== '');

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Bewertungsübersicht</h1>
            <p className="text-sm text-gray-600 mt-1">
              Umfassende Übersicht aller Beobachtungen und Bewertungen
            </p>
          </div>
          
          <div className="flex space-x-3">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`btn-secondary flex items-center ${showFilters ? 'bg-blue-100 text-blue-700' : ''}`}
            >
              <Filter className="w-4 h-4 mr-2" />
              Filter {hasActiveFilters && <span className="ml-1 bg-blue-500 text-white rounded-full px-2 py-0.5 text-xs">•</span>}
            </button>
            
            <button
              onClick={handleExportCSV}
              className="btn-primary flex items-center"
              disabled={loading}
            >
              <Download className="w-4 h-4 mr-2" />
              CSV Export
            </button>
          </div>
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Date Range */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Von Datum
                </label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                  className="input-field"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bis Datum
                </label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                  className="input-field"
                />
              </div>

              {/* Category Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kategorie
                </label>
                <select
                  value={filters.category}
                  onChange={(e) => handleFilterChange('category', e.target.value)}
                  className="input-field"
                >
                  <option value="">Alle Kategorien</option>
                  {uniqueCategories.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>

              {/* Class Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Klasse
                </label>
                <select
                  value={filters.class}
                  onChange={(e) => handleFilterChange('class', e.target.value)}
                  className="input-field"
                >
                  <option value="">Alle Klassen</option>
                  {uniqueClasses.map(className => (
                    <option key={className} value={className}>{className}</option>
                  ))}
                </select>
              </div>

              {/* Student Search */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Schüler*in
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Name suchen..."
                    value={filters.studentSearch}
                    onChange={(e) => handleFilterChange('studentSearch', e.target.value)}
                    className="input-field pl-9"
                  />
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                </div>
              </div>
            </div>

            {/* Filter Actions */}
            {hasActiveFilters && (
              <div className="flex justify-end mt-4">
                <button
                  onClick={clearFilters}
                  className="text-sm text-gray-600 hover:text-gray-800 flex items-center"
                >
                  <X className="w-4 h-4 mr-1" />
                  Filter zurücksetzen
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Main Table */}
      <div className="bg-white shadow-sm border border-gray-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Lade Bewertungen...</p>
          </div>
        ) : assessments.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Keine Bewertungen gefunden.</p>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="mt-2 text-blue-600 hover:text-blue-800"
              >
                Filter zurücksetzen
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('observation_created_at')}
                    >
                      <div className="flex items-center">
                        <Calendar className="w-4 h-4 mr-2" />
                        Datum
                        {getSortIcon('observation_created_at')}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('student_name')}
                    >
                      <div className="flex items-center">
                        <User className="w-4 h-4 mr-2" />
                        Schüler*in
                        {getSortIcon('student_name')}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('class_name')}
                    >
                      <div className="flex items-center">
                        <BookOpen className="w-4 h-4 mr-2" />
                        Klasse
                        {getSortIcon('class_name')}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('category')}
                    >
                      <div className="flex items-center">
                        <Tag className="w-4 h-4 mr-2" />
                        Kategorie
                        {getSortIcon('category')}
                      </div>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <div className="flex items-center">
                        <FileText className="w-4 h-4 mr-2" />
                        Beobachtung
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {assessments.map((assessment) => {
                    const tags = parseTags(assessment.tags);
                    return (
                      <tr key={assessment.observation_id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatDate(assessment.observation_created_at)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {assessment.student_last_name}, {assessment.student_first_name}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {assessment.class_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border"
                            style={{
                              backgroundColor: assessment.category_background_color,
                              color: assessment.category_text_color,
                              borderColor: assessment.category_color,
                            }}
                          >
                            {assessment.category}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="max-w-xs">
                            <p className="text-sm text-gray-900 line-clamp-2">
                              {assessment.text}
                            </p>
                            {tags.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {tags.slice(0, 3).map((tag, index) => (
                                  <span
                                    key={index}
                                    className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-gray-100 text-gray-700"
                                  >
                                    {tag}
                                  </span>
                                ))}
                                {tags.length > 3 && (
                                  <span className="text-xs text-gray-500">+{tags.length - 3}</span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200">
                <div className="flex-1 flex justify-between sm:hidden">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Zurück
                  </button>
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Weiter
                  </button>
                </div>
                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-gray-700">
                      Seite <span className="font-medium">{currentPage}</span> von{' '}
                      <span className="font-medium">{totalPages}</span>
                    </p>
                  </div>
                  <div>
                    <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                      <button
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                        className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Zurück
                      </button>
                      <button
                        onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                        disabled={currentPage === totalPages}
                        className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Weiter
                      </button>
                    </nav>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};