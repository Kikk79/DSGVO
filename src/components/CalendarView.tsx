import React, { useState, useCallback, useEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import { 
  Calendar as CalendarIcon, 
  CalendarDays, 
  Clock, 
  List, 
  Settings,
  Filter,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { CalendarEvent } from '../stores/appStore';

interface ViewMode {
  id: 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay' | 'listWeek';
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const viewModes: ViewMode[] = [
  { id: 'dayGridMonth', label: 'Monat', icon: CalendarIcon },
  { id: 'timeGridWeek', label: 'Woche', icon: CalendarDays },
  { id: 'timeGridDay', label: 'Tag', icon: Clock },
  { id: 'listWeek', label: 'Liste', icon: List },
];

export const CalendarView: React.FC = () => {
  // Extract only stable data from store to prevent re-render loops
  const { 
    calendarEvents, 
    calendarView, 
    calendarFilters, 
    classes, 
    categories, 
    calendarLoading, 
    error 
  } = useAppStore(state => ({
    calendarEvents: state.calendarEvents,
    calendarView: state.calendarView,
    calendarFilters: state.calendarFilters,
    classes: state.classes,
    categories: state.categories,
    calendarLoading: state.calendarLoading,
    error: state.error,
  }));

  // Get stable function references using getState to avoid dependency issues
  const getStoreFunctions = useCallback(() => useAppStore.getState(), []);

  const [showFilters, setShowFilters] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const calendarRef = React.useRef<FullCalendar>(null);

  // Load classes and categories on mount
  useEffect(() => {
    const initializeData = async () => {
      const { loadClasses, loadCategories } = getStoreFunctions();
      if (classes.length === 0) await loadClasses();
      if (categories.length === 0) await loadCategories();
    };
    initializeData();
  }, [classes.length, categories.length, getStoreFunctions]);

  // Initial calendar events load - load current week by default
  useEffect(() => {
    const loadInitialEvents = async () => {
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay() + (calendarFilters.startWeek === 'monday' ? 1 : 0));
      weekStart.setHours(0, 0, 0, 0);
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      
      try {
        const { loadCalendarEvents } = getStoreFunctions();
        await loadCalendarEvents(
          weekStart,
          weekEnd,
          calendarFilters.classId || undefined,
          calendarFilters.category || undefined
        );
      } catch (error) {
        console.error('Failed to load initial calendar events:', error);
      }
    };

    loadInitialEvents();
  }, [calendarFilters.classId, calendarFilters.category, calendarFilters.startWeek, getStoreFunctions]);

  // Handle date range changes from calendar navigation
  const handleDatesSet = useCallback((dateInfo: any) => {
    const { setCalendarDate, loadCalendarEvents, calendarFilters } = getStoreFunctions();
    setCalendarDate(dateInfo.start);
    loadCalendarEvents(
      dateInfo.start,
      dateInfo.end,
      calendarFilters.classId || undefined,
      calendarFilters.category || undefined
    );
  }, [getStoreFunctions]);

  // Handle event clicks
  const handleEventClick = useCallback((clickInfo: any) => {
    const event = clickInfo.event;
    const calendarEvent: CalendarEvent = {
      id: event.id,
      title: event.title,
      start: event.start,
      end: event.end || event.start,
      backgroundColor: event.backgroundColor,
      borderColor: event.borderColor,
      textColor: event.textColor,
      extendedProps: event.extendedProps,
    };
    setSelectedEvent(calendarEvent);
  }, []);

  // Handle view mode changes
  const handleViewChange = useCallback((newView: 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay' | 'listWeek') => {
    const { setCalendarView } = getStoreFunctions();
    setCalendarView(newView);
    if (calendarRef.current) {
      calendarRef.current.getApi().changeView(newView);
    }
  }, [getStoreFunctions]);

  // Navigate to today
  const handleToday = useCallback(() => {
    if (calendarRef.current) {
      calendarRef.current.getApi().today();
    }
  }, []);

  // Navigate previous/next
  const handlePrev = useCallback(() => {
    if (calendarRef.current) {
      calendarRef.current.getApi().prev();
    }
  }, []);

  const handleNext = useCallback(() => {
    if (calendarRef.current) {
      calendarRef.current.getApi().next();
    }
  }, []);

  // Handle filter changes
  const handleClassFilter = useCallback((classId: number | null) => {
    const { setCalendarFilters } = getStoreFunctions();
    setCalendarFilters({ classId });
  }, [getStoreFunctions]);

  const handleCategoryFilter = useCallback((category: string | null) => {
    const { setCalendarFilters } = getStoreFunctions();
    setCalendarFilters({ category });
  }, [getStoreFunctions]);

  // FullCalendar options - memoized to prevent re-renders
  const calendarOptions = React.useMemo(() => ({
    plugins: [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin],
    initialView: calendarView,
    headerToolbar: false as false, // We'll use a custom header
    events: calendarEvents,
    eventClick: handleEventClick,
    datesSet: handleDatesSet,
    weekends: calendarFilters.showWeekends,
    firstDay: calendarFilters.startWeek === 'monday' ? 1 : 0,
    height: 'auto',
    eventDisplay: 'block',
    dayMaxEvents: 3,
    locale: 'de',
    eventDidMount: (info: any) => {
      // Add tooltip with full text
      info.el.title = info.event.extendedProps.fullText || info.event.title;
    },
    eventClassNames: ['cursor-pointer', 'hover:opacity-80', 'transition-opacity'],
  }), [
    calendarView, 
    calendarEvents, 
    handleEventClick, 
    handleDatesSet, 
    calendarFilters.showWeekends, 
    calendarFilters.startWeek
  ]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white rounded-lg shadow">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-gray-900">Kalender</h1>
              
              {/* Navigation Controls */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={handlePrev}
                  className="p-2 rounded-md hover:bg-gray-100 transition-colors"
                  aria-label="Vorheriger Zeitraum"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                
                <button
                  onClick={handleToday}
                  className="px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors"
                >
                  Heute
                </button>
                
                <button
                  onClick={handleNext}
                  className="p-2 rounded-md hover:bg-gray-100 transition-colors"
                  aria-label="Nächster Zeitraum"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              {/* View Mode Buttons */}
              <div className="flex rounded-lg border border-gray-300 bg-white">
                {viewModes.map((mode) => {
                  const Icon = mode.icon;
                  return (
                    <button
                      key={mode.id}
                      onClick={() => handleViewChange(mode.id)}
                      className={`px-3 py-2 text-sm font-medium transition-colors first:rounded-l-lg last:rounded-r-lg ${
                        calendarView === mode.id
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                      title={mode.label}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="hidden sm:inline ml-2">{mode.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Filter Toggle */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`p-2 rounded-md transition-colors ${
                  showFilters 
                    ? 'bg-blue-100 text-blue-600' 
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
                title="Filter"
              >
                <Filter className="h-5 w-5" />
              </button>

              <button
                onClick={() => {
                  const { setCalendarFilters, calendarFilters: currentFilters } = getStoreFunctions();
                  setCalendarFilters({ showWeekends: !currentFilters.showWeekends });
                }}
                className="p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                title="Einstellungen"
              >
                <Settings className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Filters Panel */}
          {showFilters && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Klasse
                  </label>
                  <select
                    value={calendarFilters.classId || ''}
                    onChange={(e) => handleClassFilter(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  >
                    <option value="">Alle Klassen</option>
                    {classes.map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        {cls.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Kategorie
                  </label>
                  <select
                    value={calendarFilters.category || ''}
                    onChange={(e) => handleCategoryFilter(e.target.value || null)}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  >
                    <option value="">Alle Kategorien</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.name}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Calendar Content */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {calendarLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-600">Lade Kalender...</span>
            </div>
          ) : (
            <div>
              <FullCalendar ref={calendarRef} {...calendarOptions} />
              {calendarEvents.length === 0 && !calendarLoading && (
                <div className="text-center py-8 text-gray-500">
                  <p>Keine Beobachtungen im ausgewählten Zeitraum gefunden.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Event Detail Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div 
              className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
              onClick={() => setSelectedEvent(null)}
            />

            <div className="inline-block w-full max-w-md p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  Beobachtung Details
                </h3>
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Schüler
                  </label>
                  <p className="mt-1 text-sm text-gray-900">
                    {selectedEvent.extendedProps.studentName}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Klasse
                  </label>
                  <p className="mt-1 text-sm text-gray-900">
                    {selectedEvent.extendedProps.className}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Kategorie
                  </label>
                  <span 
                    className="inline-block mt-1 px-2 py-1 rounded text-sm"
                    style={{
                      backgroundColor: selectedEvent.backgroundColor,
                      color: selectedEvent.textColor,
                      border: `1px solid ${selectedEvent.borderColor}`,
                    }}
                  >
                    {selectedEvent.extendedProps.category}
                  </span>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Datum
                  </label>
                  <p className="mt-1 text-sm text-gray-900">
                    {selectedEvent.start.toLocaleDateString('de-DE')} um{' '}
                    {selectedEvent.start.toLocaleTimeString('de-DE', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Beobachtung
                  </label>
                  <p className="mt-1 text-sm text-gray-900">
                    {selectedEvent.extendedProps.fullText}
                  </p>
                </div>

                {selectedEvent.extendedProps.tags.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Tags
                    </label>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {selectedEvent.extendedProps.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="inline-block px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Schließen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};