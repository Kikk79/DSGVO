import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface Student {
  id: number;
  class_id: number;
  first_name: string;
  last_name: string;
  status: string;
}

export interface Class {
  id: number;
  name: string;
  school_year: string;
}

export interface Category {
  id: number;
  name: string;
  color: string;
  background_color: string;
  text_color: string;
  is_active: boolean;
  sort_order: number;
}

export interface Observation {
  id: number;
  student_id: number;
  author_id: number;
  category: string;
  text: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  source_device_id: string;
}

export interface SyncStatus {
  peer_connected: boolean;
  last_sync: string | null;
  pending_changes: number;
}

export interface DeviceConfig {
  device_type: 'computer' | 'notebook';
  device_name?: string;
}

export interface ActivePin {
  pin: string;
  expires_at: string;
  expires_in_seconds: number;
}

export interface StudentWithStats {
  id: number;
  first_name: string;
  last_name: string;
  class_name: string;
  class_id: number;
  status: string;
  observation_count: number;
  last_observation_date: string | null;
}

export interface AssessmentRecord {
  observation_id: number;
  observation_created_at: string;
  observation_updated_at: string;
  student_id: number;
  student_first_name: string;
  student_last_name: string;
  class_id: number;
  class_name: string;
  category: string;
  category_color: string;
  category_background_color: string;
  category_text_color: string;
  text: string;
  tags: string;
  author_id: number;
  source_device_id: string;
}

export interface CalendarObservation {
  id: number;
  created_at: string;
  student_id: number;
  student_first_name: string;
  student_last_name: string;
  class_id: number;
  class_name: string;
  category: string;
  category_color: string;
  category_background_color: string;
  category_text_color: string;
  text: string;
  tags: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  extendedProps: {
    studentId: number;
    studentName: string;
    className: string;
    category: string;
    observationText: string;
    fullText: string;
    tags: string[];
  };
}

export interface CalendarFilters {
  classId: number | null;
  category: string | null;
  showWeekends: boolean;
  startWeek: 'monday' | 'sunday';
  density: 'compact' | 'comfortable' | 'spacious';
}

interface AppState {
  // Data
  students: Student[];
  classes: Class[];
  observations: Observation[];
  categories: Category[];
  
  // Calendar State
  calendarEvents: CalendarEvent[];
  calendarView: 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay' | 'listWeek';
  calendarDate: Date;
  calendarFilters: CalendarFilters;
  calendarLoading: boolean;
  
  // UI State
  loading: boolean;
  error: string | null;
  syncStatus: SyncStatus | null;
  deviceConfig: DeviceConfig | null;
  currentPin: ActivePin | null;
  databasePath: string | null;
  
  // Actions
  initializeApp: () => Promise<void>;
  loadStudents: () => Promise<void>;
  loadClasses: () => Promise<void>;
  loadCategories: () => Promise<void>;
  // eslint-disable-next-line no-unused-vars
  createObservation: (data: {
    student_id: number;
    category: string;
    text: string;
    tags: string[];
  }) => Promise<void>;
  // eslint-disable-next-line no-unused-vars
  searchObservations: (query?: string, student_id?: number, category?: string) => Promise<void>;
  getSyncStatus: () => Promise<void>;
  // eslint-disable-next-line no-unused-vars
  exportStudentData: (student_id: number, format: string) => Promise<string>;
  // eslint-disable-next-line no-unused-vars
  createClass: (name: string, school_year: string) => Promise<void>;
  // eslint-disable-next-line no-unused-vars
  createStudent: (class_id: number, first_name: string, last_name: string, status?: string) => Promise<void>;
  // eslint-disable-next-line no-unused-vars
  deleteStudent: (student_id: number, force_delete?: boolean) => Promise<void>;
  // eslint-disable-next-line no-unused-vars
  deleteClass: (class_id: number, force_delete?: boolean) => Promise<void>;
  // eslint-disable-next-line no-unused-vars
  deleteObservation: (observation_id: number, force_delete?: boolean) => Promise<void>;
  // eslint-disable-next-line no-unused-vars
  getObservation: (observation_id: number) => Promise<Observation | null>;
  // eslint-disable-next-line no-unused-vars
  setError: (error: string | null) => void;
  // eslint-disable-next-line no-unused-vars
  setLoading: (loading: boolean) => void;
  
  // File-based Sync Functions
  exportChangeset: () => Promise<string>;
  // eslint-disable-next-line no-unused-vars
  importChangeset: (changesetData: string) => Promise<void>;
  // eslint-disable-next-line no-unused-vars
  exportChangesetToFile: (filePath: string, daysBack?: number) => Promise<string>;
  // eslint-disable-next-line no-unused-vars
  importChangesetFromFile: (filePath: string) => Promise<string>;
  // eslint-disable-next-line no-unused-vars
  exportAllData: (daysBack?: number) => Promise<string>;
  // eslint-disable-next-line no-unused-vars
  importFullBackup: (filePath: string) => Promise<string>;
  // eslint-disable-next-line no-unused-vars
  importChangesetData: (changesetData: string) => Promise<string>;
  // eslint-disable-next-line no-unused-vars
  importFullBackupData: (backupData: string) => Promise<string>;
  
  // Device Configuration
  getDeviceConfig: () => Promise<void>;
  // eslint-disable-next-line no-unused-vars
  setDeviceConfig: (device_type: 'computer' | 'notebook', device_name?: string) => Promise<void>;
  
  // PIN Management
  generatePairingPin: () => Promise<ActivePin>;
  getCurrentPairingPin: () => Promise<void>;
  clearPairingPin: () => Promise<void>;
  getPairingCode: () => Promise<string>;
  
  // Calendar Functions
  // eslint-disable-next-line no-unused-vars
  loadCalendarEvents: (startDate: Date, endDate: Date, classId?: number, category?: string) => Promise<void>;
  // eslint-disable-next-line no-unused-vars
  setCalendarView: (view: 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay' | 'listWeek') => void;
  // eslint-disable-next-line no-unused-vars
  setCalendarDate: (date: Date) => void;
  // eslint-disable-next-line no-unused-vars
  setCalendarFilters: (filters: Partial<CalendarFilters>) => void;
  
  // Database Path Management
  getDatabasePath: () => Promise<void>;
  // eslint-disable-next-line no-unused-vars
  setDatabasePath: (newPath: string) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  students: [],
  classes: [],
  observations: [],
  categories: [],
  
  // Calendar initial state
  calendarEvents: [],
  calendarView: 'timeGridWeek',
  calendarDate: new Date(),
  calendarFilters: {
    classId: null,
    category: null,
    showWeekends: true,
    startWeek: 'monday',
    density: 'comfortable',
  },
  calendarLoading: false,
  
  loading: false,
  error: null,
  syncStatus: null,
  deviceConfig: null,
  currentPin: null,
  databasePath: null,

  // Actions
  initializeApp: async () => {
    const { loadStudents, loadClasses, getSyncStatus, getDeviceConfig, getDatabasePath } = get();
    set({ loading: true, error: null });
    
    try {
      await Promise.all([
        loadStudents(),
        loadClasses(),
        getSyncStatus(),
        getDeviceConfig(),
        getDatabasePath(),
      ]);
    } catch (error) {
      set({ error: `Initialization failed: ${error}` });
    } finally {
      set({ loading: false });
    }
  },

  loadStudents: async () => {
    try {
      const students = await invoke('get_students') as Student[];
      set({ students, error: null });
    } catch (error) {
      set({ error: `Failed to load students: ${error}` });
      throw error;
    }
  },

  loadClasses: async () => {
    try {
      const classes = await invoke('get_classes') as Class[];
      set({ classes, error: null });
    } catch (error) {
      set({ error: `Failed to load classes: ${error}` });
      throw error;
    }
  },

  loadCategories: async () => {
    try {
      const categories = await invoke('get_categories') as Category[];
      set({ categories: categories.filter(cat => cat.is_active), error: null });
    } catch (error) {
      set({ error: `Failed to load categories: ${error}` });
      throw error;
    }
  },

  createObservation: async (data) => {
    set({ loading: true, error: null });
    
    try {
      const rawObservation = await invoke('create_observation', {
        studentId: data.student_id,
        category: data.category,
        text: data.text,
        tags: data.tags,
      }) as any;
      
      // Transform observation to parse tags from JSON string to array
      const observation: Observation = {
        ...rawObservation,
        tags: typeof rawObservation.tags === 'string' ? 
          (rawObservation.tags.trim() ? JSON.parse(rawObservation.tags) : []) : 
          (rawObservation.tags || [])
      };
      
      const { observations } = get();
      set({ 
        observations: [observation, ...observations],
        loading: false,
        error: null 
      });
    } catch (err) {
      set({ 
        error: `Failed to create observation: ${err}`,
        loading: false 
      });
      throw err;
    }
  },

  searchObservations: async (query?, student_id?, category?) => {
    set({ loading: true, error: null });
    
    try {
      const rawObservations = await invoke('search_observations', {
        query: query ?? null,
        studentId: student_id ?? null,
        category: category ?? null,
      }) as any[];
      
      // Transform observations to parse tags from JSON string to array
      const observations: Observation[] = rawObservations.map(obs => ({
        ...obs,
        tags: typeof obs.tags === 'string' ? 
          (obs.tags.trim() ? JSON.parse(obs.tags) : []) : 
          (obs.tags || [])
      }));
      
      set({ observations, loading: false, error: null });
    } catch (err) {
      set({ 
        error: `Failed to search observations: ${err}`,
        loading: false 
      });
      throw err;
    }
  },

  getSyncStatus: async () => {
    try {
      const syncStatus = await invoke('get_sync_status') as SyncStatus;
      set({ syncStatus, error: null });
    } catch (error) {
      set({ error: `Failed to get sync status: ${error}` });
    }
  },

  exportStudentData: async (student_id, format) => {
    set({ loading: true, error: null });
    
    try {
      const exportData = await invoke('export_student_data', {
        studentId: student_id,
        format,
      }) as string;
      
      set({ loading: false, error: null });
      return exportData;
    } catch (err) {
      set({ 
        error: `Failed to export student data: ${err}`,
        loading: false 
      });
      throw err;
    }
  },

  // Create a class
  createClass: async (name: string, school_year: string) => {
    set({ loading: true, error: null });
    try {
      const newClass = await invoke('create_class', { name, schoolYear: school_year });
      const { classes } = get();
      set({ classes: [newClass as any, ...classes], loading: false });
    } catch (err) {
      set({ error: `Failed to create class: ${err}`, loading: false });
      throw err;
    }
  },

  // Create a student
  createStudent: async (class_id: number, first_name: string, last_name: string, status: string = 'active') => {
    set({ loading: true, error: null });
    try {
      const newStudent = await invoke('create_student', { classId: class_id, firstName: first_name, lastName: last_name, status });
      const { students } = get();
      set({ students: [newStudent as any, ...students], loading: false });
    } catch (err) {
      set({ error: `Failed to create student: ${err}`, loading: false });
      throw err;
    }
  },

  // Delete a student
  deleteStudent: async (student_id: number, force_delete: boolean = false) => {
    set({ loading: true, error: null });
    try {
      await invoke('delete_student', { studentId: student_id, forceDelete: force_delete });
      // Refresh students list after deletion
      await get().loadStudents();
      set({ loading: false });
    } catch (err) {
      set({ error: `Failed to delete student: ${err}`, loading: false });
      throw err;
    }
  },

  // Delete a class
  deleteClass: async (class_id: number, force_delete: boolean = false) => {
    set({ loading: true, error: null });
    try {
      await invoke('delete_class', { classId: class_id, forceDelete: force_delete });
      // Refresh classes and students lists after deletion
      await Promise.all([
        get().loadClasses(),
        get().loadStudents()
      ]);
      set({ loading: false });
    } catch (err) {
      set({ error: `Failed to delete class: ${err}`, loading: false });
      throw err;
    }
  },

  // Delete an observation
  deleteObservation: async (observation_id: number, force_delete: boolean = false) => {
    set({ loading: true, error: null });
    try {
      await invoke('delete_observation', { observationId: observation_id, forceDelete: force_delete });
      
      // Remove the observation from local state immediately for better UX
      const { observations } = get();
      const updatedObservations = observations.filter(obs => obs.id !== observation_id);
      set({ observations: updatedObservations, loading: false, error: null });
    } catch (err) {
      set({ error: `Failed to delete observation: ${err}`, loading: false });
      throw err;
    }
  },

  // Get a single observation
  getObservation: async (observation_id: number): Promise<Observation | null> => {
    set({ loading: true, error: null });
    try {
      const rawObservation = await invoke('get_observation', { observationId: observation_id }) as any | null;
      
      if (!rawObservation) {
        set({ loading: false, error: null });
        return null;
      }
      
      // Transform observation to parse tags from JSON string to array
      const observation: Observation = {
        ...rawObservation,
        tags: typeof rawObservation.tags === 'string' ? 
          (rawObservation.tags.trim() ? JSON.parse(rawObservation.tags) : []) : 
          (rawObservation.tags || [])
      };
      
      set({ loading: false, error: null });
      return observation;
    } catch (err) {
      set({ error: `Failed to get observation: ${err}`, loading: false });
      throw err;
    }
  },

  setError: (error) => set({ error }),
  setLoading: (loading) => set({ loading }),

  // File-based Sync implementations

  exportChangeset: async (): Promise<string> => {
    set({ loading: true, error: null });
    try {
      const changeset = await invoke('export_changeset') as string;
      set({ loading: false, error: null });
      return changeset;
    } catch (err) {
      set({ 
        error: `Failed to export changeset: ${err}`,
        loading: false 
      });
      throw err;
    }
  },

  importChangeset: async (changesetData: string) => {
    set({ loading: true, error: null });
    try {
      await invoke('import_changeset', { changesetData });
      // Refresh all data after import
      await Promise.all([
        get().searchObservations(),
        get().loadStudents(),
        get().loadClasses(),
        get().getSyncStatus()
      ]);
      set({ loading: false, error: null });
    } catch (err) {
      set({ 
        error: `Failed to import changeset: ${err}`,
        loading: false 
      });
      throw err;
    }
  },

  exportChangesetToFile: async (filePath: string, daysBack?: number): Promise<string> => {
    set({ loading: true, error: null });
    try {
      const result = await invoke('export_changeset_to_file', { 
        filePath: filePath, 
        daysBack: daysBack ?? 30 
      }) as string;
      set({ loading: false, error: null });
      return result;
    } catch (err) {
      set({ 
        error: `Failed to export changeset to file: ${err}`,
        loading: false 
      });
      throw err;
    }
  },

  importChangesetFromFile: async (filePath: string): Promise<string> => {
    set({ loading: true, error: null });
    try {
      const result = await invoke('import_changeset_from_file', { filePath }) as string;
      // Refresh all data after import
      await Promise.all([
        get().searchObservations(),
        get().loadStudents(),
        get().loadClasses(),
        get().getSyncStatus()
      ]);
      set({ loading: false, error: null });
      return result;
    } catch (err) {
      set({ 
        error: `Failed to import changeset from file: ${err}`,
        loading: false 
      });
      throw err;
    }
  },

  exportAllData: async (daysBack?: number): Promise<string> => {
    set({ loading: true, error: null });
    try {
      const result = await invoke('export_all_data', { 
        daysBack: daysBack 
      }) as string;
      set({ loading: false, error: null });
      return result;
    } catch (err) {
      set({ 
        error: `Failed to export all data: ${err}`,
        loading: false 
      });
      throw err;
    }
  },

  importFullBackup: async (filePath: string): Promise<string> => {
    set({ loading: true, error: null });
    try {
      const result = await invoke('import_full_backup', { filePath }) as string;
      // Refresh all data after import
      await Promise.all([
        get().searchObservations(),
        get().loadStudents(),
        get().loadClasses(),
        get().getSyncStatus()
      ]);
      set({ loading: false, error: null });
      return result;
    } catch (err) {
      set({ 
        error: `Failed to import full backup: ${err}`,
        loading: false 
      });
      throw err;
    }
  },

  importChangesetData: async (changesetData: string): Promise<string> => {
    set({ loading: true, error: null });
    try {
      const result = await invoke('import_changeset_data', { changesetData }) as string;
      // Refresh all data after import
      await Promise.all([
        get().searchObservations(),
        get().loadStudents(),
        get().loadClasses(),
        get().getSyncStatus()
      ]);
      set({ loading: false, error: null });
      return result;
    } catch (err) {
      set({ 
        error: `Failed to import changeset data: ${err}`,
        loading: false 
      });
      throw err;
    }
  },

  importFullBackupData: async (backupData: string): Promise<string> => {
    set({ loading: true, error: null });
    try {
      const result = await invoke('import_full_backup_data', { backupData }) as string;
      // Refresh all data after import
      await Promise.all([
        get().searchObservations(),
        get().loadStudents(),
        get().loadClasses(),
        get().getSyncStatus()
      ]);
      set({ loading: false, error: null });
      return result;
    } catch (err) {
      set({ 
        error: `Failed to import full backup data: ${err}`,
        loading: false 
      });
      throw err;
    }
  },

  // Device Configuration implementations
  getDeviceConfig: async () => {
    try {
      const deviceConfig = await invoke('get_device_config') as DeviceConfig;
      set({ deviceConfig, error: null });
    } catch (error) {
      set({ error: `Failed to get device config: ${error}` });
    }
  },

  setDeviceConfig: async (device_type: 'computer' | 'notebook', device_name?: string) => {
    set({ loading: true, error: null });
    
    try {
      await invoke('set_device_config', {
        deviceType: device_type,
        deviceName: device_name ?? null,
      });
      
      // Refresh device config after setting
      await get().getDeviceConfig();
      set({ loading: false, error: null });
    } catch (err) {
      set({ 
        error: `Failed to set device config: ${err}`,
        loading: false 
      });
      throw err;
    }
  },

  // PIN Management implementations
  generatePairingPin: async (): Promise<ActivePin> => {
    set({ loading: true, error: null });
    
    try {
      const activePin = await invoke('generate_pairing_pin') as ActivePin;
      set({ currentPin: activePin, loading: false, error: null });
      return activePin;
    } catch (err) {
      set({ 
        error: `Failed to generate pairing PIN: ${err}`,
        loading: false 
      });
      throw err;
    }
  },

  getCurrentPairingPin: async () => {
    try {
      const currentPin = await invoke('get_current_pairing_pin') as ActivePin | null;
      set({ currentPin, error: null });
    } catch (error) {
      set({ error: `Failed to get current PIN: ${error}` });
    }
  },

  clearPairingPin: async () => {
    set({ loading: true, error: null });
    
    try {
      await invoke('clear_pairing_pin');
      set({ currentPin: null, loading: false, error: null });
    } catch (err) {
      set({ 
        error: `Failed to clear pairing PIN: ${err}`,
        loading: false 
      });
      throw err;
    }
  },

  getPairingCode: async (): Promise<string> => {
    set({ loading: true, error: null });
    try {
      const pairingCode = await invoke('get_pairing_code') as string;
      set({ loading: false, error: null });
      return pairingCode;
    } catch (err) {
      set({ 
        error: `Failed to get pairing code: ${err}`,
        loading: false 
      });
      throw err;
    }
  },

  // Database Path Management implementations
  getDatabasePath: async () => {
    try {
      const databasePath = await invoke('get_database_path') as string;
      set({ databasePath, error: null });
    } catch (error) {
      set({ error: `Failed to get database path: ${error}` });
    }
  },

  setDatabasePath: async (newPath: string) => {
    set({ loading: true, error: null });
    
    try {
      await invoke('set_database_path', { newPath });
      
      // Refresh database path after setting
      await get().getDatabasePath();
      set({ loading: false, error: null });
    } catch (err) {
      set({ 
        error: `Failed to set database path: ${err}`,
        loading: false 
      });
      throw err;
    }
  },

  // Calendar actions
  loadCalendarEvents: async (startDate: Date, endDate: Date, classId?: number, category?: string) => {
    console.log('🔄 Store: loadCalendarEvents called', {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      classId,
      category
    });
    
    set({ calendarLoading: true, error: null });
    console.log('📤 Store: Set calendarLoading to true');
    
    try {
      console.log('📡 Store: Calling Tauri get_calendar_observations');

      // Send both snake_case (Rust) and camelCase (JS) keys to be robust against param name mismatches
      const payload: Record<string, any> = {
        // Preferred snake_case (Rust param names)
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        class_id: classId ?? null,
        category: category ?? null,
        // Fallback camelCase (in case the command expects camelCase)
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        classId: classId ?? null,
      };

      const observations = await invoke('get_calendar_observations', payload) as CalendarObservation[];
      
      console.log('📥 Store: Received observations:', observations.length);

      // Transform observations to calendar events
      const events: CalendarEvent[] = observations.map((obs) => ({
        id: obs.id.toString(),
        title: `${obs.student_first_name} ${obs.student_last_name}`,
        start: new Date(obs.created_at),
        end: new Date(obs.created_at),
        backgroundColor: obs.category_background_color || '#EBF8FF',
        borderColor: obs.category_color || '#3B82F6',
        textColor: obs.category_text_color || '#1E3A8A',
        extendedProps: {
          studentId: obs.student_id,
          studentName: `${obs.student_first_name} ${obs.student_last_name}`,
          className: obs.class_name,
          category: obs.category,
          observationText: obs.text.length > 50 ? 
            obs.text.substring(0, 50) + '...' : obs.text,
          fullText: obs.text,
          tags: JSON.parse(obs.tags || '[]'),
        },
      }));

      console.log('🔄 Store: Transformed to calendar events:', events.length);
      console.log('📤 Store: Setting calendarLoading to false and updating events');
      set({ calendarEvents: events, calendarLoading: false });
      console.log('✅ Store: Successfully completed loadCalendarEvents');
    } catch (error) {
      console.error('❌ Store: Calendar events loading error:', error);
      set({ 
        error: `Failed to load calendar events: ${error}`,
        calendarLoading: false,
        calendarEvents: [],
      });
      console.log('📤 Store: Set calendarLoading to false due to error');
      throw error;
    }
  },

  setCalendarView: (view: 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay' | 'listWeek') => {
    set({ calendarView: view });
    
    // Persist to localStorage
    localStorage.setItem('calendarView', view);
  },

  setCalendarDate: (date: Date) => {
    set({ calendarDate: date });
  },

  setCalendarFilters: (filters: Partial<CalendarFilters>) => {
    const currentFilters = get().calendarFilters;
    const newFilters = { ...currentFilters, ...filters };
    set({ calendarFilters: newFilters });
    
    // Persist to localStorage
    localStorage.setItem('calendarFilters', JSON.stringify(newFilters));
  },
}));
