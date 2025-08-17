import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../appStore';
import { act, renderHook } from '@testing-library/react';

// Mock Tauri
const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}));

describe('AppStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store state
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.setError(null);
      result.current.setLoading(false);
    });
  });

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const { result } = renderHook(() => useAppStore());
      
      expect(result.current.students).toEqual([]);
      expect(result.current.classes).toEqual([]);
      expect(result.current.observations).toEqual([]);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(null);
      expect(result.current.syncStatus).toBe(null);
      expect(result.current.deviceConfig).toBe(null);
      expect(result.current.currentPin).toBe(null);
      expect(result.current.databasePath).toBe(null);
    });
  });

  describe('Error and Loading State', () => {
    it('should set error state', () => {
      const { result } = renderHook(() => useAppStore());
      
      act(() => {
        result.current.setError('Test error');
      });
      
      expect(result.current.error).toBe('Test error');
    });

    it('should set loading state', () => {
      const { result } = renderHook(() => useAppStore());
      
      act(() => {
        result.current.setLoading(true);
      });
      
      expect(result.current.loading).toBe(true);
    });

    it('should clear error when set to null', () => {
      const { result } = renderHook(() => useAppStore());
      
      act(() => {
        result.current.setError('Test error');
      });
      
      expect(result.current.error).toBe('Test error');
      
      act(() => {
        result.current.setError(null);
      });
      
      expect(result.current.error).toBe(null);
    });
  });

  describe('Students Management', () => {
    it('should load students successfully', async () => {
      const mockStudents = [
        {
          id: 1,
          class_id: 1,
          first_name: 'Max',
          last_name: 'Mustermann',
          status: 'active',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          source_device_id: 'test-device-1',
        },
      ];
      
      mockInvoke.mockResolvedValue(mockStudents);
      
      const { result } = renderHook(() => useAppStore());
      
      await act(async () => {
        await result.current.loadStudents();
      });
      
      expect(mockInvoke).toHaveBeenCalledWith('get_students');
      expect(result.current.students).toEqual(mockStudents);
      expect(result.current.error).toBe(null);
    });

    it('should handle students loading error', async () => {
      mockInvoke.mockRejectedValue(new Error('Network error'));
      
      const { result } = renderHook(() => useAppStore());
      
      await act(async () => {
        try {
          await result.current.loadStudents();
        } catch (error) {
          // Expected to throw
        }
      });
      
      expect(result.current.error).toBe('Failed to load students: Error: Network error');
    });

    it('should create student successfully', async () => {
      const newStudent = {
        id: 1,
        class_id: 1,
        first_name: 'Max',
        last_name: 'Mustermann',
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        source_device_id: 'test-device-1',
      };
      
      mockInvoke.mockResolvedValue(newStudent);
      
      const { result } = renderHook(() => useAppStore());
      
      await act(async () => {
        await result.current.createStudent(1, 'Max', 'Mustermann', 'active');
      });
      
      expect(mockInvoke).toHaveBeenCalledWith('create_student', {
        classId: 1,
        firstName: 'Max',
        lastName: 'Mustermann',
        status: 'active',
      });
      expect(result.current.students).toContain(newStudent);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('should handle create student error', async () => {
      mockInvoke.mockRejectedValue(new Error('Creation failed'));
      
      const { result } = renderHook(() => useAppStore());
      
      await act(async () => {
        try {
          await result.current.createStudent(1, 'Max', 'Mustermann');
        } catch (error) {
          // Expected to throw
        }
      });
      
      expect(result.current.error).toBe('Failed to create student: Error: Creation failed');
      expect(result.current.loading).toBe(false);
    });

    it('should delete student successfully', async () => {
      mockInvoke
        .mockResolvedValueOnce(undefined) // delete_student
        .mockResolvedValueOnce([]); // get_students
      
      const { result } = renderHook(() => useAppStore());
      
      await act(async () => {
        await result.current.deleteStudent(1, false);
      });
      
      expect(mockInvoke).toHaveBeenCalledWith('delete_student', {
        studentId: 1,
        forceDelete: false,
      });
      expect(mockInvoke).toHaveBeenCalledWith('get_students');
      expect(result.current.loading).toBe(false);
    });
  });

  describe('Classes Management', () => {
    it('should load classes successfully', async () => {
      const mockClasses = [
        {
          id: 1,
          name: '5a',
          school_year: '2023/24',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          source_device_id: 'test-device-1',
        },
      ];
      
      mockInvoke.mockResolvedValue(mockClasses);
      
      const { result } = renderHook(() => useAppStore());
      
      await act(async () => {
        await result.current.loadClasses();
      });
      
      expect(mockInvoke).toHaveBeenCalledWith('get_classes');
      expect(result.current.classes).toEqual(mockClasses);
      expect(result.current.error).toBe(null);
    });

    it('should create class successfully', async () => {
      const newClass = {
        id: 1,
        name: '5a',
        school_year: '2023/24',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        source_device_id: 'test-device-1',
      };
      
      mockInvoke.mockResolvedValue(newClass);
      
      const { result } = renderHook(() => useAppStore());
      
      await act(async () => {
        await result.current.createClass('5a', '2023/24');
      });
      
      expect(mockInvoke).toHaveBeenCalledWith('create_class', {
        name: '5a',
        schoolYear: '2023/24',
      });
      expect(result.current.classes).toContain(newClass);
      expect(result.current.loading).toBe(false);
    });

    it('should delete class successfully', async () => {
      mockInvoke
        .mockResolvedValueOnce(undefined) // delete_class
        .mockResolvedValueOnce([]) // get_classes
        .mockResolvedValueOnce([]); // get_students
      
      const { result } = renderHook(() => useAppStore());
      
      await act(async () => {
        await result.current.deleteClass(1, true);
      });
      
      expect(mockInvoke).toHaveBeenCalledWith('delete_class', {
        classId: 1,
        forceDelete: true,
      });
      expect(result.current.loading).toBe(false);
    });
  });

  describe('Observations Management', () => {
    it('should search observations successfully', async () => {
      const mockObservations = [
        {
          id: 1,
          student_id: 1,
          author_id: 1,
          category: 'Sozial',
          text: 'Test observation',
          tags: '["test"]',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          source_device_id: 'test-device-1',
        },
      ];
      
      mockInvoke.mockResolvedValue(mockObservations);
      
      const { result } = renderHook(() => useAppStore());
      
      await act(async () => {
        await result.current.searchObservations('test', 1, 'Sozial');
      });
      
      expect(mockInvoke).toHaveBeenCalledWith('search_observations', {
        query: 'test',
        studentId: 1,
        category: 'Sozial',
      });
      
      // Tags should be parsed from JSON string to array
      expect(result.current.observations[0].tags).toEqual(['test']);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('should handle empty tags in observations', async () => {
      const mockObservations = [
        {
          id: 1,
          student_id: 1,
          author_id: 1,
          category: 'Sozial',
          text: 'Test observation',
          tags: '',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          source_device_id: 'test-device-1',
        },
      ];
      
      mockInvoke.mockResolvedValue(mockObservations);
      
      const { result } = renderHook(() => useAppStore());
      
      await act(async () => {
        await result.current.searchObservations();
      });
      
      // Empty tags should become empty array
      expect(result.current.observations[0].tags).toEqual([]);
    });

    it('should handle malformed JSON tags', async () => {
      const mockObservations = [
        {
          id: 1,
          student_id: 1,
          author_id: 1,
          category: 'Sozial',
          text: 'Test observation',
          tags: 'invalid-json',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          source_device_id: 'test-device-1',
        },
      ];
      
      mockInvoke.mockResolvedValue(mockObservations);
      
      const { result } = renderHook(() => useAppStore());
      
      await act(async () => {
        try {
          await result.current.searchObservations();
        } catch (error) {
          // Expected to throw due to JSON parsing error
        }
      });
      
      expect(result.current.error).toBeTruthy();
    });

    it('should create observation successfully', async () => {
      const newObservation = {
        id: 1,
        student_id: 1,
        author_id: 1,
        category: 'Sozial',
        text: 'New observation',
        tags: '["new", "test"]',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        source_device_id: 'test-device-1',
      };
      
      mockInvoke.mockResolvedValue(newObservation);
      
      const { result } = renderHook(() => useAppStore());
      
      await act(async () => {
        await result.current.createObservation({
          student_id: 1,
          category: 'Sozial',
          text: 'New observation',
          tags: ['new', 'test'],
        });
      });
      
      expect(mockInvoke).toHaveBeenCalledWith('create_observation', {
        studentId: 1,
        category: 'Sozial',
        text: 'New observation',
        tags: ['new', 'test'],
      });
      
      // Should be added to beginning of observations array
      expect(result.current.observations[0].tags).toEqual(['new', 'test']);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('should delete observation successfully', async () => {
      // Set up initial observations
      const { result } = renderHook(() => useAppStore());
      
      act(() => {
        result.current.observations = [
          {
            id: 1,
            student_id: 1,
            author_id: 1,
            category: 'Sozial',
            text: 'Test',
            tags: [],
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            source_device_id: 'test-device-1',
          },
          {
            id: 2,
            student_id: 1,
            author_id: 1,
            category: 'Fachlich',
            text: 'Test 2',
            tags: [],
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            source_device_id: 'test-device-1',
          },
        ];
      });
      
      mockInvoke.mockResolvedValue(undefined);
      
      await act(async () => {
        await result.current.deleteObservation(1, false);
      });
      
      expect(mockInvoke).toHaveBeenCalledWith('delete_observation', {
        observationId: 1,
        forceDelete: false,
      });
      
      // Observation should be removed from local state
      expect(result.current.observations).toHaveLength(1);
      expect(result.current.observations[0].id).toBe(2);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('should get single observation successfully', async () => {
      const mockObservation = {
        id: 1,
        student_id: 1,
        author_id: 1,
        category: 'Sozial',
        text: 'Test observation',
        tags: '["test"]',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        source_device_id: 'test-device-1',
      };
      
      mockInvoke.mockResolvedValue(mockObservation);
      
      const { result } = renderHook(() => useAppStore());
      
      let observation: any;
      await act(async () => {
        observation = await result.current.getObservation(1);
      });
      
      expect(mockInvoke).toHaveBeenCalledWith('get_observation', {
        observationId: 1,
      });
      expect(observation.tags).toEqual(['test']);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('should handle null observation', async () => {
      mockInvoke.mockResolvedValue(null);
      
      const { result } = renderHook(() => useAppStore());
      
      let observation: any;
      await act(async () => {
        observation = await result.current.getObservation(999);
      });
      
      expect(observation).toBe(null);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(null);
    });
  });

  describe('Device Configuration', () => {
    it('should get device config successfully', async () => {
      const mockConfig = {
        device_type: 'computer',
        device_name: 'Test Computer',
      };
      
      mockInvoke.mockResolvedValue(mockConfig);
      
      const { result } = renderHook(() => useAppStore());
      
      await act(async () => {
        await result.current.getDeviceConfig();
      });
      
      expect(mockInvoke).toHaveBeenCalledWith('get_device_config');
      expect(result.current.deviceConfig).toEqual(mockConfig);
      expect(result.current.error).toBe(null);
    });

    it('should set device config successfully', async () => {
      const mockConfig = {
        device_type: 'notebook',
        device_name: 'My Laptop',
      };
      
      mockInvoke
        .mockResolvedValueOnce(undefined) // set_device_config
        .mockResolvedValueOnce(mockConfig); // get_device_config
      
      const { result } = renderHook(() => useAppStore());
      
      await act(async () => {
        await result.current.setDeviceConfig('notebook', 'My Laptop');
      });
      
      expect(mockInvoke).toHaveBeenCalledWith('set_device_config', {
        deviceType: 'notebook',
        deviceName: 'My Laptop',
      });
      expect(mockInvoke).toHaveBeenCalledWith('get_device_config');
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('should handle device config error', async () => {
      mockInvoke.mockRejectedValue(new Error('Config error'));
      
      const { result } = renderHook(() => useAppStore());
      
      await act(async () => {
        try {
          await result.current.setDeviceConfig('computer');
        } catch (error) {
          // Expected to throw
        }
      });
      
      expect(result.current.error).toBe('Failed to set device config: Error: Config error');
      expect(result.current.loading).toBe(false);
    });
  });

  describe('Database Path Management', () => {
    it('should get database path successfully', async () => {
      const mockPath = '/path/to/database.db';
      
      mockInvoke.mockResolvedValue(mockPath);
      
      const { result } = renderHook(() => useAppStore());
      
      await act(async () => {
        await result.current.getDatabasePath();
      });
      
      expect(mockInvoke).toHaveBeenCalledWith('get_database_path');
      expect(result.current.databasePath).toBe(mockPath);
      expect(result.current.error).toBe(null);
    });

    it('should set database path successfully', async () => {
      const newPath = '/new/path/to/database.db';
      
      mockInvoke
        .mockResolvedValueOnce(undefined) // set_database_path
        .mockResolvedValueOnce(newPath); // get_database_path
      
      const { result } = renderHook(() => useAppStore());
      
      await act(async () => {
        await result.current.setDatabasePath(newPath);
      });
      
      expect(mockInvoke).toHaveBeenCalledWith('set_database_path', {
        newPath,
      });
      expect(mockInvoke).toHaveBeenCalledWith('get_database_path');
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(null);
    });
  });

  describe('Sync Management', () => {
    it('should get sync status successfully', async () => {
      const mockStatus = {
        peer_connected: true,
        last_sync: '2024-01-01T00:00:00Z',
        pending_changes: 5,
      };
      
      mockInvoke.mockResolvedValue(mockStatus);
      
      const { result } = renderHook(() => useAppStore());
      
      await act(async () => {
        await result.current.getSyncStatus();
      });
      
      expect(mockInvoke).toHaveBeenCalledWith('get_sync_status');
      expect(result.current.syncStatus).toEqual(mockStatus);
      expect(result.current.error).toBe(null);
    });

    it('should start P2P sync successfully', async () => {
      mockInvoke.mockResolvedValue(undefined);
      
      const { result } = renderHook(() => useAppStore());
      
      await act(async () => {
        await result.current.startP2PSync();
      });
      
      expect(mockInvoke).toHaveBeenCalledWith('start_p2p_sync');
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('should stop P2P sync successfully', async () => {
      mockInvoke.mockResolvedValue(undefined);
      
      const { result } = renderHook(() => useAppStore());
      
      await act(async () => {
        await result.current.stopP2PSync();
      });
      
      expect(mockInvoke).toHaveBeenCalledWith('stop_p2p_sync');
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('should trigger sync successfully', async () => {
      mockInvoke
        .mockResolvedValueOnce(undefined) // trigger_sync
        .mockResolvedValueOnce([]) // search_observations
        .mockResolvedValueOnce([]) // get_students
        .mockResolvedValueOnce({ peer_connected: false, last_sync: null, pending_changes: 0 }); // get_sync_status
      
      const { result } = renderHook(() => useAppStore());
      
      await act(async () => {
        await result.current.triggerSync();
      });
      
      expect(mockInvoke).toHaveBeenCalledWith('trigger_sync');
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(null);
    });
  });

  describe('PIN Management', () => {
    it('should generate pairing PIN successfully', async () => {
      const mockPin = {
        pin: '123456',
        expires_at: '2024-01-01T01:00:00Z',
        expires_in_seconds: 3600,
      };
      
      mockInvoke.mockResolvedValue(mockPin);
      
      const { result } = renderHook(() => useAppStore());
      
      let pin: any;
      await act(async () => {
        pin = await result.current.generatePairingPin();
      });
      
      expect(mockInvoke).toHaveBeenCalledWith('generate_pairing_pin');
      expect(result.current.currentPin).toEqual(mockPin);
      expect(pin).toEqual(mockPin);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('should get current pairing PIN successfully', async () => {
      const mockPin = {
        pin: '123456',
        expires_at: '2024-01-01T01:00:00Z',
        expires_in_seconds: 3600,
      };
      
      mockInvoke.mockResolvedValue(mockPin);
      
      const { result } = renderHook(() => useAppStore());
      
      await act(async () => {
        await result.current.getCurrentPairingPin();
      });
      
      expect(mockInvoke).toHaveBeenCalledWith('get_current_pairing_pin');
      expect(result.current.currentPin).toEqual(mockPin);
      expect(result.current.error).toBe(null);
    });

    it('should clear pairing PIN successfully', async () => {
      // Set up initial PIN
      const { result } = renderHook(() => useAppStore());
      
      act(() => {
        result.current.currentPin = {
          pin: '123456',
          expires_at: '2024-01-01T01:00:00Z',
          expires_in_seconds: 3600,
        };
      });
      
      mockInvoke.mockResolvedValue(undefined);
      
      await act(async () => {
        await result.current.clearPairingPin();
      });
      
      expect(mockInvoke).toHaveBeenCalledWith('clear_pairing_pin');
      expect(result.current.currentPin).toBe(null);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('should get pairing code successfully', async () => {
      const mockCode = 'ABC123';
      
      mockInvoke.mockResolvedValue(mockCode);
      
      const { result } = renderHook(() => useAppStore());
      
      let code: any;
      await act(async () => {
        code = await result.current.getPairingCode();
      });
      
      expect(mockInvoke).toHaveBeenCalledWith('get_pairing_code');
      expect(code).toBe(mockCode);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(null);
    });
  });

  describe('Export/Import', () => {
    it('should export student data successfully', async () => {
      const mockData = '{"student": "data"}';
      
      mockInvoke.mockResolvedValue(mockData);
      
      const { result } = renderHook(() => useAppStore());
      
      let data: any;
      await act(async () => {
        data = await result.current.exportStudentData(1, 'json');
      });
      
      expect(mockInvoke).toHaveBeenCalledWith('export_student_data', {
        studentId: 1,
        format: 'json',
      });
      expect(data).toBe(mockData);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('should export changeset successfully', async () => {
      const mockChangeset = 'base64-encoded-data';
      
      mockInvoke.mockResolvedValue(mockChangeset);
      
      const { result } = renderHook(() => useAppStore());
      
      let changeset: any;
      await act(async () => {
        changeset = await result.current.exportChangeset();
      });
      
      expect(mockInvoke).toHaveBeenCalledWith('export_changeset');
      expect(changeset).toBe(mockChangeset);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('should import changeset successfully', async () => {
      mockInvoke
        .mockResolvedValueOnce(undefined) // import_changeset
        .mockResolvedValueOnce([]) // search_observations
        .mockResolvedValueOnce([]) // get_students
        .mockResolvedValueOnce([]) // get_classes
        .mockResolvedValueOnce({ peer_connected: false, last_sync: null, pending_changes: 0 }); // get_sync_status
      
      const { result } = renderHook(() => useAppStore());
      
      await act(async () => {
        await result.current.importChangeset('base64-data');
      });
      
      expect(mockInvoke).toHaveBeenCalledWith('import_changeset', {
        changesetData: 'base64-data',
      });
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(null);
    });
  });

  describe('App Initialization', () => {
    it('should initialize app successfully', async () => {
      mockInvoke
        .mockResolvedValueOnce([]) // get_students
        .mockResolvedValueOnce([]) // get_classes
        .mockResolvedValueOnce({ peer_connected: false, last_sync: null, pending_changes: 0 }) // get_sync_status
        .mockResolvedValueOnce({ device_type: 'computer', device_name: 'Test' }) // get_device_config
        .mockResolvedValueOnce('/path/to/db'); // get_database_path
      
      const { result } = renderHook(() => useAppStore());
      
      await act(async () => {
        await result.current.initializeApp();
      });
      
      expect(mockInvoke).toHaveBeenCalledWith('get_students');
      expect(mockInvoke).toHaveBeenCalledWith('get_classes');
      expect(mockInvoke).toHaveBeenCalledWith('get_sync_status');
      expect(mockInvoke).toHaveBeenCalledWith('get_device_config');
      expect(mockInvoke).toHaveBeenCalledWith('get_database_path');
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('should handle initialization error', async () => {
      mockInvoke.mockRejectedValue(new Error('Init failed'));
      
      const { result } = renderHook(() => useAppStore());
      
      await act(async () => {
        await result.current.initializeApp();
      });
      
      expect(result.current.error).toBe('Initialization failed: Error: Init failed');
      expect(result.current.loading).toBe(false);
    });

    it('should set loading state during initialization', async () => {
      let resolvePromise: () => void;
      const promise = new Promise<void>(resolve => {
        resolvePromise = resolve;
      });
      
      mockInvoke.mockReturnValue(promise);
      
      const { result } = renderHook(() => useAppStore());
      
      act(() => {
        result.current.initializeApp();
      });
      
      // Should be loading
      expect(result.current.loading).toBe(true);
      
      await act(async () => {
        resolvePromise!();
        await promise;
      });
      
      // Should finish loading
      expect(result.current.loading).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle network timeouts', async () => {
      mockInvoke.mockRejectedValue(new Error('Request timeout'));
      
      const { result } = renderHook(() => useAppStore());
      
      await act(async () => {
        try {
          await result.current.loadStudents();
        } catch (error) {
          // Expected to throw
        }
      });
      
      expect(result.current.error).toBe('Failed to load students: Error: Request timeout');
    });

    it('should handle Tauri invoke errors', async () => {
      mockInvoke.mockRejectedValue({ message: 'Tauri error', code: 'TAURI_ERROR' });
      
      const { result } = renderHook(() => useAppStore());
      
      await act(async () => {
        try {
          await result.current.getSyncStatus();
        } catch (error) {
          // Expected to throw
        }
      });
      
      expect(result.current.error).toBeTruthy();
    });

    it('should handle concurrent operations', async () => {
      let resolveFirst: () => void;
      let resolveSecond: () => void;
      
      const firstPromise = new Promise<any[]>(resolve => {
        resolveFirst = () => resolve([]);
      });
      
      const secondPromise = new Promise<any[]>(resolve => {
        resolveSecond = () => resolve([]);
      });
      
      mockInvoke
        .mockReturnValueOnce(firstPromise)
        .mockReturnValueOnce(secondPromise);
      
      const { result } = renderHook(() => useAppStore());
      
      // Start two concurrent operations
      const promise1 = act(async () => {
        await result.current.loadStudents();
      });
      
      const promise2 = act(async () => {
        await result.current.loadClasses();
      });
      
      // Resolve in reverse order
      act(() => {
        resolveSecond!();
      });
      
      act(() => {
        resolveFirst!();
      });
      
      await Promise.all([promise1, promise2]);
      
      expect(result.current.error).toBe(null);
    });
  });
});