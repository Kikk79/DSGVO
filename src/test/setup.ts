import '@testing-library/jest-dom';
import { beforeAll, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Mock Tauri API
beforeAll(() => {
  // Mock window.__TAURI__
  Object.defineProperty(window, '__TAURI__', {
    value: {
      invoke: vi.fn(),
      path: {
        appDataDir: vi.fn().mockResolvedValue('/mock/app/data'),
      },
      event: {
        listen: vi.fn(),
        emit: vi.fn(),
      },
      core: {
        invoke: vi.fn(),
      },
    },
    writable: true,
  });

  // Mock common Tauri invocations
  const mockInvoke = vi.fn();
  
  // Default mock responses
  mockInvoke.mockImplementation((command: string, args?: any) => {
    switch (command) {
      case 'get_students':
        return Promise.resolve([
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
          {
            id: 2,
            class_id: 1,
            first_name: 'Anna',
            last_name: 'Schmidt',
            status: 'active',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            source_device_id: 'test-device-1',
          },
        ]);
      
      case 'get_classes':
        return Promise.resolve([
          {
            id: 1,
            name: '5a',
            school_year: '2023/24',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            source_device_id: 'test-device-1',
          },
        ]);
      
      case 'search_observations':
        return Promise.resolve([
          {
            id: 1,
            student_id: 1,
            author_id: 1,
            category: 'Sozial',
            text: 'Zeigt gute Teamfähigkeiten',
            tags: '["teamwork", "sozial"]',
            created_at: '2024-01-01T10:00:00Z',
            updated_at: '2024-01-01T10:00:00Z',
            source_device_id: 'test-device-1',
          },
        ]);
      
      case 'get_sync_status':
        return Promise.resolve({
          peer_connected: false,
          last_sync: null,
          pending_changes: 0,
        });
      
      case 'get_device_config':
        return Promise.resolve({
          device_type: 'computer',
          device_name: 'Test Computer',
        });
      
      case 'get_database_path':
        return Promise.resolve('/mock/app/data/observations.db');
      
      case 'create_observation':
        return Promise.resolve({
          id: Math.floor(Math.random() * 1000),
          student_id: args?.studentId || 1,
          author_id: 1,
          category: args?.category || 'Test',
          text: args?.text || 'Test observation',
          tags: JSON.stringify(args?.tags || []),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          source_device_id: 'test-device-1',
        });
      
      case 'create_student':
        return Promise.resolve({
          id: Math.floor(Math.random() * 1000),
          class_id: args?.classId || 1,
          first_name: args?.firstName || 'Test',
          last_name: args?.lastName || 'Student',
          status: args?.status || 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          source_device_id: 'test-device-1',
        });
      
      default:
        return Promise.resolve({});
    }
  });

  window.__TAURI__.invoke = mockInvoke;
  window.__TAURI__.core.invoke = mockInvoke;
});

// Clean up after each test case
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Mock date-fns locale
vi.mock('date-fns/locale', () => ({
  de: {},
}));

// Mock router
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useLocation: () => ({ pathname: '/' }),
    useParams: () => ({}),
  };
});