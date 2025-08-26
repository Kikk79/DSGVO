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

  const [showFilters, setShowFilters] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [hasInitialized, setHasInitialized] = useState(false);
  const calendarRef = React.useRef<FullCalendar>(null);

  // Track last loaded range to prevent duplicate loads
  const lastRangeRef = React.useRef<{ start: string; end: string } | null>(null);
  // Skip the very first datesSet that fires on mount; initial effect will load
  const hasCalendarMountedRef = React.useRef(false);

  // Load classes and categories on mount - no function dependencies
  useEffect(() => {
    let isMounted = true;
    
    const initializeData = async () => {
      console.log('📋 CalendarView: Initializing data (classes/categories)');
      
      try {
        const store = useAppStore.getState();
        
        if (store.classes.length === 0) {
          console.log('📋 CalendarView: Loading classes');
          await store.loadClasses();
        }
        
        if (store.categories.length === 0) {
          console.log('🎨 CalendarView: Loading categories');
          await store.loadCategories();
        }
        
        if (isMounted) {
          console.log('✅ CalendarView: Data initialization complete');
        }
      } catch (error) {
        console.error('❌ CalendarView: Error initializing data:', error);
      }
    };

    // Only initialize if we haven't already and we need to load data
    if (!hasInitialized && (classes.length === 0 || categories.length === 0)) {
      initializeData();
    }
    
    return () => {
      isMounted = false;
    };
  }, [classes.length, categories.length, hasInitialized]);

  // Load initial calendar events - separate effect with stable dependencies
  useEffect(() => {
    let isMounted = true;
    
    const loadInitialEvents = async () => {
      console.log('📅 CalendarView: Loading initial calendar events');
      console.log('📅 CalendarView: Current filters:', {
        classId: calendarFilters.classId,
        category: calendarFilters.category,
        startWeek: calendarFilters.startWeek
      });
      
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay() + (calendarFilters.startWeek === 'monday' ? 1 : 0));
      weekStart.setHours(0, 0, 0, 0);
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      
      console.log('📅 CalendarView: Date range:', {
        weekStart: weekStart.toISOString(),
        weekEnd: weekEnd.toISOString()
      });
      
      try {
        const store = useAppStore.getState();
        
        if (isMounted) {
          await store.loadCalendarEvents(
            weekStart,
            weekEnd,
            calendarFilters.classId || undefined,
            calendarFilters.category || undefined
          );
          
          if (isMounted && !hasInitialized) {
            console.log('✅ CalendarView: Initial load complete, marking as initialized');
            setHasInitialized(true);
          }
        }
      } catch (error) {
        console.error('❌ CalendarView: Failed to load initial calendar events:', error);
        if (isMounted && !hasInitialized) {
          setHasInitialized(true); // Mark as initialized even on error to prevent retry loops
        }
      }
    };

    // Only load if we have the necessary data and haven't initialized yet
    if (classes.length > 0 && categories.length > 0 && !hasInitialized) {
      loadInitialEvents();
    }
    
    return () => {
      isMounted = false;
    };
  }, [classes.length, categories.length, calendarFilters.classId, calendarFilters.category, calendarFilters.startWeek, hasInitialized]);

  // Handle date range changes from calendar navigation
  const handleDatesSet = useCallback((dateInfo: any) => {
    const startIso = dateInfo.start.toISOString();
    const endIso = dateInfo.end.toISOString();
    console.log('📅 CalendarView: Date range changed', { start: dateInfo.start, end: dateInfo.end });

    const store = useAppStore.getState();

    // Always reflect current calendar date in store
    store.setCalendarDate(dateInfo.start);

    // On first mount, just record the range and skip loading (initial effect handles first fetch)
    if (!hasCalendarMountedRef.current) {
      hasCalendarMountedRef.current = true;
      lastRangeRef.current = { start: startIso, end: endIso };
      return;
    }

    // If range hasn't actually changed, skip to avoid loops
    const last = lastRangeRef.current;
    if (last && last.start === startIso && last.end === endIso) {
      // console.log('⏭️ CalendarView: Skipping load, range unchanged');
      return;
    }

    lastRangeRef.current = { start: startIso, end: endIso };

    // Load events for new date range
    store.loadCalendarEvents(
      dateInfo.start,
      dateInfo.end,
      store.calendarFilters.classId || undefined,
      store.calendarFilters.category || undefined
    );
  }, []);

  // Handle event clicks
  const handleEventClick = useCallback((clickInfo: any) => {
    console.log('🖱️ CalendarView: Event clicked', clickInfo.event.id);
    
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
    console.log('👁️ CalendarView: View changed to', newView);
    
    const store = useAppStore.getState();
    store.setCalendarView(newView);
    
    if (calendarRef.current) {
      calendarRef.current.getApi().changeView(newView);
    }
  }, []);

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
    console.log('🏫 CalendarView: Class filter changed', classId);
    
    const store = useAppStore.getState();
    store.setCalendarFilters({ classId });
    
    // Reload events for current visible range with updated filters
    if (calendarRef.current) {
      const api = calendarRef.current.getApi();
      const start = api.view.activeStart;
      const end = api.view.activeEnd;
      store.loadCalendarEvents(start, end, classId ?? undefined, store.calendarFilters.category ?? undefined);
    }
  }, []);

  const handleCategoryFilter = useCallback((category: string | null) => {
    console.log('🏷️ CalendarView: Category filter changed', category);
    
    const store = useAppStore.getState();
    store.setCalendarFilters({ category });
    
    // Reload events for current visible range with updated filters
    if (calendarRef.current) {
      const api = calendarRef.current.getApi();
      const start = api.view.activeStart;
      const end = api.view.activeEnd;
      store.loadCalendarEvents(start, end, store.calendarFilters.classId ?? undefined, category ?? undefined);
    }
  }, []);

  // FullCalendar base options - keep stable to avoid re-initialization loops
  const baseCalendarOptions = React.useMemo(() => ({
    plugins: [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin],
    initialView: calendarView,
    headerToolbar: false as false, // We'll use a custom header
    eventClick: handleEventClick,
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
    handleEventClick,
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
                  console.log('⚙️ CalendarView: Weekend toggle clicked');
                  
                  const store = useAppStore.getState();
                  const currentFilters = store.calendarFilters;
                  store.setCalendarFilters({ showWeekends: !currentFilters.showWeekends });
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
              <FullCalendar
                ref={calendarRef}
                {...baseCalendarOptions}
                events={calendarEvents}
                datesSet={handleDatesSet}
              />
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