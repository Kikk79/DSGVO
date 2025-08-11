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

interface AppState {
  // Data
  students: Student[];
  classes: Class[];
  observations: Observation[];
  
  // UI State
  loading: boolean;
  error: string | null;
  syncStatus: SyncStatus | null;
  deviceConfig: DeviceConfig | null;
  currentPin: ActivePin | null;
  
  // Actions
  initializeApp: () => Promise<void>;
  loadStudents: () => Promise<void>;
  loadClasses: () => Promise<void>;
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
  
  // P2P Sync Functions
  startP2PSync: () => Promise<void>;
  stopP2PSync: () => Promise<void>;
  // eslint-disable-next-line no-unused-vars
  pairDevice: (pairingCode: string) => Promise<void>;
  triggerSync: () => Promise<void>;
  exportChangeset: () => Promise<string>;
  // eslint-disable-next-line no-unused-vars
  importChangeset: (changesetData: string) => Promise<void>;
  
  // Device Configuration
  getDeviceConfig: () => Promise<void>;
  // eslint-disable-next-line no-unused-vars
  setDeviceConfig: (device_type: 'computer' | 'notebook', device_name?: string) => Promise<void>;
  
  // PIN Management
  generatePairingPin: () => Promise<ActivePin>;
  getCurrentPairingPin: () => Promise<void>;
  clearPairingPin: () => Promise<void>;
  getPairingCode: () => Promise<string>;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  students: [],
  classes: [],
  observations: [],
  loading: false,
  error: null,
  syncStatus: null,
  deviceConfig: null,
  currentPin: null,

  // Actions
  initializeApp: async () => {
    const { loadStudents, loadClasses, getSyncStatus, getDeviceConfig } = get();
    set({ loading: true, error: null });
    
    try {
      await Promise.all([
        loadStudents(),
        loadClasses(),
        getSyncStatus(),
        getDeviceConfig(),
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

  createObservation: async (data) => {
    set({ loading: true, error: null });
    
    try {
      const observation = await invoke('create_observation', {
        studentId: data.student_id,
        category: data.category,
        text: data.text,
        tags: data.tags,
      }) as Observation;
      
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
      const observations = await invoke('search_observations', {
        query: query || null,
        studentId: student_id || null,
        category: category || null,
      }) as Observation[];
      
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
      const observation = await invoke('get_observation', { observationId: observation_id }) as Observation | null;
      set({ loading: false, error: null });
      return observation;
    } catch (err) {
      set({ error: `Failed to get observation: ${err}`, loading: false });
      throw err;
    }
  },

  setError: (error) => set({ error }),
  setLoading: (loading) => set({ loading }),

  // P2P Sync implementations
  startP2PSync: async () => {
    set({ loading: true, error: null });
    try {
      await invoke('start_p2p_sync');
      set({ loading: false, error: null });
    } catch (err) {
      set({ 
        error: `Failed to start P2P sync: ${err}`,
        loading: false 
      });
      throw err;
    }
  },

  stopP2PSync: async () => {
    set({ loading: true, error: null });
    try {
      await invoke('stop_p2p_sync');
      set({ loading: false, error: null });
    } catch (err) {
      set({ 
        error: `Failed to stop P2P sync: ${err}`,
        loading: false 
      });
      throw err;
    }
  },

  pairDevice: async (pairingCode: string) => {
    set({ loading: true, error: null });
    try {
      await invoke('pair_device', { pairingCode });
      // Refresh sync status after successful pairing
      await get().getSyncStatus();
      set({ loading: false, error: null });
    } catch (err) {
      set({ 
        error: `Failed to pair device: ${err}`,
        loading: false 
      });
      throw err;
    }
  },

  triggerSync: async () => {
    set({ loading: true, error: null });
    try {
      await invoke('trigger_sync');
      // Refresh data after sync
      await Promise.all([
        get().searchObservations(),
        get().loadStudents(),
        get().getSyncStatus()
      ]);
      set({ loading: false, error: null });
    } catch (err) {
      set({ 
        error: `Failed to sync: ${err}`,
        loading: false 
      });
      throw err;
    }
  },

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
        deviceName: device_name || null,
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
}));
