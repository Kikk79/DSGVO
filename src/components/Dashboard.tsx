import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  FileText, 
  Search, 
  Clock, 
  TrendingUp,
  Users,
  Calendar
} from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { format, isToday } from 'date-fns';
import { de } from 'date-fns/locale';
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

export const Dashboard: React.FC = () => {
  const { observations, students, searchObservations } = useAppStore();
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    // Load today's observations and categories
    searchObservations();
    loadCategories();
  }, [searchObservations]);

  const loadCategories = async () => {
    try {
      const result = await invoke<Category[]>('get_categories');
      setCategories(result);
    } catch (error) {
      console.error('Failed to load categories:', error);
      setCategories([]);
    }
  };

  const getCategoryColors = (categoryName: string) => {
    const category = categories.find(c => c.name === categoryName);
    return category ? {
      backgroundColor: category.background_color,
      color: category.text_color,
      borderColor: category.color,
    } : {
      backgroundColor: '#F3F4F6',
      color: '#374151',
      borderColor: '#6B7280',
    };
  };

  const todayObservations = observations.filter(obs => 
    isToday(new Date(obs.created_at))
  );

  const recentObservations = observations.slice(0, 5);

  const stats = [
    {
      name: 'Beobachtungen heute',
      value: todayObservations.length.toString(),
      icon: FileText,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      name: 'Gesamte Schüler',
      value: students.length.toString(),
      icon: Users,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    {
      name: 'Diese Woche',
      value: observations.filter(obs => {
        const obsDate = new Date(obs.created_at);
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return obsDate > weekAgo;
      }).length.toString(),
      icon: TrendingUp,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Startseite</h1>
        <p className="text-gray-600 mt-1">
          Willkommen im Schülerbeobachtungssystem
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Link
          to="/neue-beobachtung"
          className="card hover:shadow-md transition-shadow focus-ring rounded-lg"
        >
          <div className="flex items-center">
            <div className="flex-shrink-0 p-3 bg-blue-100 rounded-lg">
              <FileText className="h-6 w-6 text-blue-600" aria-hidden="true" />
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-medium text-gray-900">
                Neue Beobachtung
              </h3>
              <p className="text-sm text-gray-500">
                Schnell eine Beobachtung erfassen
              </p>
            </div>
          </div>
        </Link>

        <Link
          to="/schueler-suchen"
          className="card hover:shadow-md transition-shadow focus-ring rounded-lg"
        >
          <div className="flex items-center">
            <div className="flex-shrink-0 p-3 bg-green-100 rounded-lg">
              <Search className="h-6 w-6 text-green-600" aria-hidden="true" />
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-medium text-gray-900">
                Schüler finden
              </h3>
              <p className="text-sm text-gray-500">
                Beobachtungen durchsuchen
              </p>
            </div>
          </div>
        </Link>

        <div className="card bg-gray-50">
          <div className="flex items-center">
            <div className="flex-shrink-0 p-3 bg-gray-200 rounded-lg">
              <Calendar className="h-6 w-6 text-gray-600" aria-hidden="true" />
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-medium text-gray-900">
                Heute
              </h3>
              <p className="text-sm text-gray-500">
                {format(new Date(), 'EEEE, d. MMMM yyyy', { locale: de })}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <div key={stat.name} className="card">
            <div className="flex items-center">
              <div className={`flex-shrink-0 p-3 ${stat.bgColor} rounded-lg`}>
                <stat.icon className={`h-6 w-6 ${stat.color}`} aria-hidden="true" />
              </div>
              <div className="ml-4">
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-sm font-medium text-gray-500">{stat.name}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Observations */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-medium text-gray-900">
            Letzte Beobachtungen
          </h2>
          <Link
            to="/schueler-suchen"
            className="text-sm text-blue-600 hover:text-blue-800 focus-ring rounded-md px-2 py-1"
          >
            Alle anzeigen
          </Link>
        </div>

        {recentObservations.length > 0 ? (
          <div className="space-y-4">
            {recentObservations.map((observation) => {
              const student = students.find(s => s.id === observation.student_id);
              return (
                <div key={observation.id} className="border-l-4 border-blue-400 pl-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {student ? `${student.first_name} ${student.last_name}` : 'Unbekannter Schüler'}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        {observation.text}
                      </p>
                      <div className="flex items-center mt-2 space-x-4 text-xs text-gray-500">
                        <span className="flex items-center">
                          <Clock className="h-3 w-3 mr-1" aria-hidden="true" />
                          {format(new Date(observation.created_at), 'HH:mm', { locale: de })}
                        </span>
                        <span 
                          className="px-2 py-1 rounded-full text-sm font-medium"
                          style={{
                            ...getCategoryColors(observation.category),
                            borderWidth: '1px',
                            borderStyle: 'solid',
                          }}
                        >
                          {observation.category}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <FileText className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">
              Keine Beobachtungen
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Beginnen Sie mit Ihrer ersten Beobachtung.
            </p>
            <div className="mt-6">
              <Link
                to="/neue-beobachtung"
                className="btn-primary"
              >
                Neue Beobachtung
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};