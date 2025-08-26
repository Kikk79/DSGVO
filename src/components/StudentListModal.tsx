import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Search, 
  ChevronUp, 
  ChevronDown, 
  Users,
  Calendar,
  BookOpen,
  Filter,
  Eye
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { StudentWithStats } from '../stores/appStore';

interface StudentListModalProps {
  isOpen: boolean;
  onClose: () => void;
  // eslint-disable-next-line no-unused-vars
  onStudentClick?: (studentId: number) => void;
}

type SortField = 'name' | 'class_name' | 'observation_count' | 'last_observation_date';
type SortDirection = 'asc' | 'desc';

export const StudentListModal: React.FC<StudentListModalProps> = ({
  isOpen,
  onClose,
  onStudentClick
}) => {
  const [students, setStudents] = useState<StudentWithStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Load student data when modal opens
  useEffect(() => {
    if (isOpen) {
      loadStudents();
    }
  }, [isOpen]);

  const loadStudents = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await invoke<StudentWithStats[]>('get_students_with_stats');
      setStudents(result);
    } catch (err) {
      setError(`Failed to load students: ${err}`);
      console.error('Failed to load students:', err);
    } finally {
      setLoading(false);
    }
  };

  // Get unique class names for filtering
  const uniqueClasses = useMemo(() => {
    const classes = [...new Set(students.map(s => s.class_name))].filter(Boolean).sort();
    return classes;
  }, [students]);

  // Filter and sort students
  const filteredAndSortedStudents = useMemo(() => {
    let filtered = students.filter(student => {
      const matchesSearch = searchQuery === '' || 
        `${student.first_name} ${student.last_name}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
        student.class_name.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesClass = classFilter === '' || student.class_name === classFilter;
      
      return matchesSearch && matchesClass;
    });

    // Sort students
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'name': {
          comparison = `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`);
          break;
        }
        case 'class_name': {
          comparison = a.class_name.localeCompare(b.class_name);
          break;
        }
        case 'observation_count': {
          comparison = a.observation_count - b.observation_count;
          break;
        }
        case 'last_observation_date': {
          const aDate = a.last_observation_date ? new Date(a.last_observation_date).getTime() : 0;
          const bDate = b.last_observation_date ? new Date(b.last_observation_date).getTime() : 0;
          comparison = aDate - bDate;
          break;
        }
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [students, searchQuery, classFilter, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleStudentClick = (studentId: number) => {
    if (onStudentClick) {
      onStudentClick(studentId);
    }
    onClose();
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ChevronUp className="h-4 w-4 text-gray-400" />;
    }
    return sortDirection === 'asc' 
      ? <ChevronUp className="h-4 w-4 text-blue-600" />
      : <ChevronDown className="h-4 w-4 text-blue-600" />;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose}></div>
      
      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center">
            <div className="flex-shrink-0 p-2 bg-green-100 rounded-lg mr-3">
              <Users className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900">
                Alle Schüler*innen
              </h3>
              <p className="text-sm text-gray-500">
                {filteredAndSortedStudents.length} von {students.length} Schüler*innen
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-500 hover:bg-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search and Filters */}
        <div className="p-6 border-b border-gray-200 space-y-4">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Schüler*in oder Klasse suchen..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-field pl-10"
              />
            </div>

            {/* Class Filter */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Filter className="h-5 w-5 text-gray-400" />
              </div>
              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className="select-field pl-10 min-w-[150px]"
              >
                <option value="">Alle Klassen</option>
                {uniqueClasses.map(className => (
                  <option key={className} value={className}>
                    {className}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full"></div>
              <span className="ml-3 text-gray-600">Lade Schüler*innen...</span>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center p-12">
              <div className="text-center">
                <p className="text-red-600 mb-2">{error}</p>
                <button
                  onClick={loadStudents}
                  className="btn-primary"
                >
                  Erneut versuchen
                </button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('name')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Name</span>
                        {getSortIcon('name')}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('class_name')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Klasse</span>
                        {getSortIcon('class_name')}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('observation_count')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Beobachtungen</span>
                        {getSortIcon('observation_count')}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('last_observation_date')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Letzte Beobachtung</span>
                        {getSortIcon('last_observation_date')}
                      </div>
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Aktionen
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredAndSortedStudents.map((student) => (
                    <tr 
                      key={student.id}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => handleStudentClick(student.id)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {student.last_name}, {student.first_name}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          <BookOpen className="h-3 w-3 mr-1" />
                          {student.class_name}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div className="flex items-center">
                          <span className="font-medium">{student.observation_count}</span>
                          <span className="ml-1 text-gray-500">Einträge</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {student.last_observation_date ? (
                          <div className="flex items-center">
                            <Calendar className="h-4 w-4 mr-1 text-gray-400" />
                            {format(new Date(student.last_observation_date), 'd.MM.yyyy', { locale: de })}
                          </div>
                        ) : (
                          <span className="text-gray-400 italic">Keine Beobachtungen</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStudentClick(student.id);
                          }}
                          className="text-blue-600 hover:text-blue-900 focus:outline-none focus:underline"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredAndSortedStudents.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center">
                        <div className="text-gray-500">
                          <Users className="mx-auto h-12 w-12 text-gray-300 mb-4" />
                          <p className="text-lg font-medium text-gray-900 mb-1">Keine Schüler*innen gefunden</p>
                          <p>Versuchen Sie andere Suchbegriffe oder Filter.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="flex justify-between items-center text-sm text-gray-600">
            <div>
              Sortiert nach: <span className="font-medium">
                {sortField === 'name' && 'Name'}
                {sortField === 'class_name' && 'Klasse'}
                {sortField === 'observation_count' && 'Beobachtungen'}
                {sortField === 'last_observation_date' && 'Letzte Beobachtung'}
              </span> ({sortDirection === 'asc' ? 'A-Z' : 'Z-A'})
            </div>
            <button
              onClick={onClose}
              className="btn-secondary"
            >
              Schließen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};