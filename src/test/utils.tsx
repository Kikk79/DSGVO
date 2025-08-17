import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { vi } from 'vitest';

// Mock Zustand store for testing
export const createMockStore = (initialState = {}) => {
  const defaultState = {
    students: [],
    classes: [],
    observations: [],
    loading: false,
    error: null,
    syncStatus: null,
    deviceConfig: null,
    currentPin: null,
    databasePath: null,
    ...initialState,
  };

  const mockActions = {
    initializeApp: vi.fn(),
    loadStudents: vi.fn(),
    loadClasses: vi.fn(),
    createObservation: vi.fn(),
    searchObservations: vi.fn(),
    getSyncStatus: vi.fn(),
    exportStudentData: vi.fn(),
    createClass: vi.fn(),
    createStudent: vi.fn(),
    deleteStudent: vi.fn(),
    deleteClass: vi.fn(),
    deleteObservation: vi.fn(),
    getObservation: vi.fn(),
    setError: vi.fn(),
    setLoading: vi.fn(),
    startP2PSync: vi.fn(),
    stopP2PSync: vi.fn(),
    pairDevice: vi.fn(),
    triggerSync: vi.fn(),
    exportChangeset: vi.fn(),
    importChangeset: vi.fn(),
    getDeviceConfig: vi.fn(),
    setDeviceConfig: vi.fn(),
    generatePairingPin: vi.fn(),
    getCurrentPairingPin: vi.fn(),
    clearPairingPin: vi.fn(),
    getPairingCode: vi.fn(),
    getDatabasePath: vi.fn(),
    setDatabasePath: vi.fn(),
  };

  return {
    ...defaultState,
    ...mockActions,
  };
};

// Mock the useAppStore hook
export const mockUseAppStore = (storeState = {}) => {
  const store = createMockStore(storeState);
  vi.doMock('../stores/appStore', () => ({
    useAppStore: () => store,
  }));
  return store;
};

// Custom render function with providers
interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  initialEntries?: string[];
}

export const renderWithProviders = (
  ui: ReactElement,
  options: CustomRenderOptions = {}
) => {
  const { initialEntries = ['/'], ...renderOptions } = options;

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <BrowserRouter>
        {children}
      </BrowserRouter>
    );
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
};

// Helper to wait for async operations
export const waitForAsync = () => new Promise(resolve => setTimeout(resolve, 0));

// Mock student data
export const mockStudents = [
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
];

// Mock class data
export const mockClasses = [
  {
    id: 1,
    name: '5a',
    school_year: '2023/24',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    source_device_id: 'test-device-1',
  },
  {
    id: 2,
    name: '5b',
    school_year: '2023/24',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    source_device_id: 'test-device-1',
  },
];

// Mock observation data
export const mockObservations = [
  {
    id: 1,
    student_id: 1,
    author_id: 1,
    category: 'Sozial',
    text: 'Zeigt gute Teamfähigkeiten',
    tags: ['teamwork', 'sozial'],
    created_at: '2024-01-01T10:00:00Z',
    updated_at: '2024-01-01T10:00:00Z',
    source_device_id: 'test-device-1',
  },
  {
    id: 2,
    student_id: 2,
    author_id: 1,
    category: 'Fachlich',
    text: 'Gute Fortschritte in Mathematik',
    tags: ['mathematik', 'fortschritt'],
    created_at: '2024-01-01T11:00:00Z',
    updated_at: '2024-01-01T11:00:00Z',
    source_device_id: 'test-device-1',
  },
];

// Mock device config
export const mockDeviceConfig = {
  device_type: 'computer' as const,
  device_name: 'Test Computer',
};

// Helper to create a full mock store with data
export const createMockStoreWithData = () => createMockStore({
  students: mockStudents,
  classes: mockClasses,
  observations: mockObservations,
  deviceConfig: mockDeviceConfig,
  databasePath: '/mock/app/data/observations.db',
});

export * from '@testing-library/react';
export { renderWithProviders as render };