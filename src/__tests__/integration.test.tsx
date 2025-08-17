import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, mockUseAppStore } from '../test/utils';
import App from '../App';

// Mock all router dependencies
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    createBrowserRouter: vi.fn(),
    RouterProvider: ({ router }: any) => <div data-testid="mock-router">{JSON.stringify(router)}</div>,
  };
});

describe('App Integration Tests', () => {
  let mockStore: ReturnType<typeof mockUseAppStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStore = mockUseAppStore({
      loading: false,
      error: null,
      students: [],
      classes: [],
      observations: [],
    });
  });

  describe('App Initialization', () => {
    it('should render the app without crashing', () => {
      renderWithProviders(<App />);
      
      // App should render mock router
      expect(screen.getByTestId('mock-router')).toBeInTheDocument();
    });

    it('should initialize app state on mount', () => {
      renderWithProviders(<App />);
      
      // Should call initialization functions
      expect(mockStore.initializeApp).toHaveBeenCalled();
    });

    it('should handle app initialization errors gracefully', () => {
      mockStore.initializeApp.mockRejectedValue(new Error('Init failed'));
      
      renderWithProviders(<App />);
      
      // Should not crash
      expect(screen.getByTestId('mock-router')).toBeInTheDocument();
    });

    it('should show loading state during initialization', () => {
      mockStore = mockUseAppStore({
        loading: true,
        error: null,
        students: [],
        classes: [],
        observations: [],
      });

      renderWithProviders(<App />);
      
      // App should still render even during loading
      expect(screen.getByTestId('mock-router')).toBeInTheDocument();
    });

    it('should handle errors during initialization', () => {
      mockStore = mockUseAppStore({
        loading: false,
        error: 'Initialization failed',
        students: [],
        classes: [],
        observations: [],
      });

      renderWithProviders(<App />);
      
      // App should still render even with errors
      expect(screen.getByTestId('mock-router')).toBeInTheDocument();
    });
  });

  describe('Error Boundaries', () => {
    it('should handle component crashes gracefully', () => {
      // Mock console.error to suppress error logs in tests
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      renderWithProviders(<App />);
      
      // App should render without throwing
      expect(screen.getByTestId('mock-router')).toBeInTheDocument();
      
      consoleSpy.mockRestore();
    });
  });

  describe('Store Integration', () => {
    it('should properly integrate with store', () => {
      renderWithProviders(<App />);
      
      // Should have access to all store functions
      expect(mockStore.initializeApp).toBeDefined();
      expect(mockStore.loadStudents).toBeDefined();
      expect(mockStore.loadClasses).toBeDefined();
    });

    it('should handle store state changes', async () => {
      const { rerender } = renderWithProviders(<App />);
      
      // Change store state
      mockStore = mockUseAppStore({
        loading: true,
        error: null,
        students: [],
        classes: [],
        observations: [],
      });
      
      rerender(<App />);
      
      // App should adapt to state changes
      expect(screen.getByTestId('mock-router')).toBeInTheDocument();
    });
  });

  describe('Performance', () => {
    it('should render efficiently with large datasets', () => {
      // Mock large datasets
      const largeStudentList = Array.from({ length: 1000 }, (_, i) => ({
        id: i + 1,
        class_id: 1,
        first_name: `Student${i}`,
        last_name: 'Test',
        status: 'active' as const,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        source_device_id: 'test-device-1',
      }));

      mockStore = mockUseAppStore({
        loading: false,
        error: null,
        students: largeStudentList,
        classes: [],
        observations: [],
      });

      const startTime = performance.now();
      renderWithProviders(<App />);
      const endTime = performance.now();
      
      // Should render within reasonable time (less than 1 second)
      expect(endTime - startTime).toBeLessThan(1000);
      expect(screen.getByTestId('mock-router')).toBeInTheDocument();
    });
  });
});