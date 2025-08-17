import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Layout } from '../Layout';
import { renderWithProviders, mockUseAppStore } from '../../test/utils';

// Mock react-router-dom location
const mockLocation = { pathname: '/' };
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useLocation: () => mockLocation,
  };
});

describe('Layout Component', () => {
  let mockStore: ReturnType<typeof mockUseAppStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStore = mockUseAppStore({
      loading: false,
      error: null,
      syncStatus: null,
    });
  });

  describe('Navigation Structure', () => {
    it('should render main navigation elements', () => {
      renderWithProviders(
        <Layout>
          <div>Test Content</div>
        </Layout>
      );
      
      expect(screen.getByRole('navigation')).toBeInTheDocument();
      expect(screen.getByRole('main')).toBeInTheDocument();
      expect(screen.getByText('Test Content')).toBeInTheDocument();
    });

    it('should render navigation links', () => {
      renderWithProviders(
        <Layout>
          <div>Test Content</div>
        </Layout>
      );
      
      expect(screen.getByText('Startseite')).toBeInTheDocument();
      expect(screen.getByText('Neue Beobachtung')).toBeInTheDocument();
      expect(screen.getByText('Schüler finden')).toBeInTheDocument();
      expect(screen.getByText('Schüler hinzufügen')).toBeInTheDocument();
      expect(screen.getByText('Synchronisation')).toBeInTheDocument();
      expect(screen.getByText('Einstellungen')).toBeInTheDocument();
    });

    it('should have correct navigation link hrefs', () => {
      renderWithProviders(
        <Layout>
          <div>Test Content</div>
        </Layout>
      );
      
      expect(screen.getByText('Startseite').closest('a')).toHaveAttribute('href', '/');
      expect(screen.getByText('Neue Beobachtung').closest('a')).toHaveAttribute('href', '/neue-beobachtung');
      expect(screen.getByText('Schüler finden').closest('a')).toHaveAttribute('href', '/schueler-suchen');
      expect(screen.getByText('Schüler hinzufügen').closest('a')).toHaveAttribute('href', '/schueler-hinzufuegen');
      expect(screen.getByText('Synchronisation').closest('a')).toHaveAttribute('href', '/sync');
      expect(screen.getByText('Einstellungen').closest('a')).toHaveAttribute('href', '/einstellungen');
    });
  });

  describe('Active Navigation State', () => {
    it('should highlight active navigation item', () => {
      mockLocation.pathname = '/schueler-suchen';
      
      renderWithProviders(
        <Layout>
          <div>Test Content</div>
        </Layout>
      );
      
      const activeLink = screen.getByText('Schüler finden').closest('a');
      expect(activeLink).toHaveClass('bg-blue-50', 'text-blue-700'); // Active state classes
    });

    it('should highlight dashboard as active on root path', () => {
      mockLocation.pathname = '/';
      
      renderWithProviders(
        <Layout>
          <div>Test Content</div>
        </Layout>
      );
      
      const activeLink = screen.getByText('Startseite').closest('a');
      expect(activeLink).toHaveClass('bg-blue-50', 'text-blue-700');
    });

    it('should handle nested paths correctly', () => {
      mockLocation.pathname = '/schueler-suchen/detail';
      
      renderWithProviders(
        <Layout>
          <div>Test Content</div>
        </Layout>
      );
      
      const activeLink = screen.getByText('Schüler finden').closest('a');
      expect(activeLink).toHaveClass('bg-blue-50', 'text-blue-700');
    });
  });

  describe('App Header', () => {
    it('should display app title and logo', () => {
      renderWithProviders(
        <Layout>
          <div>Test Content</div>
        </Layout>
      );
      
      expect(screen.getByText('Schülerbeobachtung')).toBeInTheDocument();
      expect(screen.getByAltText('Logo')).toBeInTheDocument();
    });

    it('should display sync status indicator', () => {
      mockStore = mockUseAppStore({
        syncStatus: {
          peer_connected: false,
          last_sync: null,
          pending_changes: 0,
        },
        loading: false,
        error: null,
      });
      
      renderWithProviders(
        <Layout>
          <div>Test Content</div>
        </Layout>
      );
      
      expect(screen.getByText('Offline')).toBeInTheDocument();
    });

    it('should show connected status when peer is connected', () => {
      mockStore = mockUseAppStore({
        syncStatus: {
          peer_connected: true,
          last_sync: '2024-01-01T10:00:00Z',
          pending_changes: 0,
        },
        loading: false,
        error: null,
      });
      
      renderWithProviders(
        <Layout>
          <div>Test Content</div>
        </Layout>
      );
      
      expect(screen.getByText('Verbunden')).toBeInTheDocument();
    });

    it('should show pending changes count', () => {
      mockStore = mockUseAppStore({
        syncStatus: {
          peer_connected: true,
          last_sync: '2024-01-01T10:00:00Z',
          pending_changes: 5,
        },
        loading: false,
        error: null,
      });
      
      renderWithProviders(
        <Layout>
          <div>Test Content</div>
        </Layout>
      );
      
      expect(screen.getByText('5 ausstehend')).toBeInTheDocument();
    });
  });

  describe('Error Display', () => {
    it('should show error banner when error exists', () => {
      mockStore = mockUseAppStore({
        loading: false,
        error: 'Connection failed',
        syncStatus: null,
      });
      
      renderWithProviders(
        <Layout>
          <div>Test Content</div>
        </Layout>
      );
      
      expect(screen.getByText('Connection failed')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('should allow dismissing error', async () => {
      const user = userEvent.setup();
      mockStore = mockUseAppStore({
        loading: false,
        error: 'Connection failed',
        syncStatus: null,
      });
      
      renderWithProviders(
        <Layout>
          <div>Test Content</div>
        </Layout>
      );
      
      const dismissButton = screen.getByLabelText('Fehler schließen');
      await user.click(dismissButton);
      
      expect(mockStore.setError).toHaveBeenCalledWith(null);
    });

    it('should not show error banner when no error', () => {
      renderWithProviders(
        <Layout>
          <div>Test Content</div>
        </Layout>
      );
      
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('should show loading indicator when loading', () => {
      mockStore = mockUseAppStore({
        loading: true,
        error: null,
        syncStatus: null,
      });
      
      renderWithProviders(
        <Layout>
          <div>Test Content</div>
        </Layout>
      );
      
      expect(screen.getByRole('progressbar', { hidden: true })).toBeInTheDocument();
      expect(screen.getByText('Lädt...')).toBeInTheDocument();
    });

    it('should not show loading indicator when not loading', () => {
      renderWithProviders(
        <Layout>
          <div>Test Content</div>
        </Layout>
      );
      
      expect(screen.queryByText('Lädt...')).not.toBeInTheDocument();
    });
  });

  describe('Responsive Design', () => {
    it('should have mobile navigation toggle', () => {
      renderWithProviders(
        <Layout>
          <div>Test Content</div>
        </Layout>
      );
      
      const mobileToggle = screen.getByLabelText('Navigation öffnen');
      expect(mobileToggle).toBeInTheDocument();
    });

    it('should toggle mobile navigation', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <Layout>
          <div>Test Content</div>
        </Layout>
      );
      
      const mobileToggle = screen.getByLabelText('Navigation öffnen');
      await user.click(mobileToggle);
      
      // Mobile navigation should be visible
      const mobileNav = screen.getByRole('navigation', { hidden: true });
      expect(mobileNav).toHaveClass('block'); // Or whatever class shows mobile nav
    });

    it('should close mobile navigation when link clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <Layout>
          <div>Test Content</div>
        </Layout>
      );
      
      // Open mobile nav
      const mobileToggle = screen.getByLabelText('Navigation öffnen');
      await user.click(mobileToggle);
      
      // Click a nav link
      const navLink = screen.getByText('Startseite');
      await user.click(navLink);
      
      // Mobile nav should close
      const mobileNav = screen.getByRole('navigation', { hidden: true });
      expect(mobileNav).toHaveClass('hidden'); // Or whatever class hides mobile nav
    });
  });

  describe('Accessibility', () => {
    it('should have proper landmark roles', () => {
      renderWithProviders(
        <Layout>
          <div>Test Content</div>
        </Layout>
      );
      
      expect(screen.getByRole('banner')).toBeInTheDocument(); // Header
      expect(screen.getByRole('navigation')).toBeInTheDocument();
      expect(screen.getByRole('main')).toBeInTheDocument();
    });

    it('should have skip navigation link', () => {
      renderWithProviders(
        <Layout>
          <div>Test Content</div>
        </Layout>
      );
      
      const skipLink = screen.getByText('Zum Hauptinhalt springen');
      expect(skipLink).toBeInTheDocument();
      expect(skipLink).toHaveAttribute('href', '#main-content');
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <Layout>
          <div>Test Content</div>
        </Layout>
      );
      
      // Tab to first navigation item
      await user.tab();
      expect(screen.getByText('Startseite')).toHaveFocus();
      
      // Tab to next navigation item
      await user.tab();
      expect(screen.getByText('Neue Beobachtung')).toHaveFocus();
    });

    it('should have proper ARIA labels', () => {
      renderWithProviders(
        <Layout>
          <div>Test Content</div>
        </Layout>
      );
      
      expect(screen.getByLabelText('Hauptnavigation')).toBeInTheDocument();
      expect(screen.getByLabelText('Navigation öffnen')).toBeInTheDocument();
    });

    it('should announce current page to screen readers', () => {
      mockLocation.pathname = '/schueler-suchen';
      
      renderWithProviders(
        <Layout>
          <div>Test Content</div>
        </Layout>
      );
      
      const activeLink = screen.getByText('Schüler finden').closest('a');
      expect(activeLink).toHaveAttribute('aria-current', 'page');
    });
  });

  describe('Content Area', () => {
    it('should render children in main content area', () => {
      renderWithProviders(
        <Layout>
          <div data-testid="child-content">Child Component</div>
        </Layout>
      );
      
      const mainContent = screen.getByRole('main');
      const childContent = within(mainContent).getByTestId('child-content');
      expect(childContent).toBeInTheDocument();
    });

    it('should have proper spacing and layout', () => {
      renderWithProviders(
        <Layout>
          <div>Test Content</div>
        </Layout>
      );
      
      const mainContent = screen.getByRole('main');
      expect(mainContent).toHaveClass('flex-1', 'overflow-auto'); // Layout classes
    });
  });

  describe('Navigation Icons', () => {
    it('should display appropriate icons for each navigation item', () => {
      renderWithProviders(
        <Layout>
          <div>Test Content</div>
        </Layout>
      );
      
      // Check that icons are present (Lucide icons)
      const navigation = screen.getByRole('navigation');
      const icons = within(navigation).getAllByRole('img', { hidden: true });
      expect(icons.length).toBeGreaterThan(0);
    });

    it('should have consistent icon sizes', () => {
      renderWithProviders(
        <Layout>
          <div>Test Content</div>
        </Layout>
      );
      
      const navigation = screen.getByRole('navigation');
      const icons = within(navigation).getAllByRole('img', { hidden: true });
      
      icons.forEach(icon => {
        expect(icon).toHaveClass('h-5', 'w-5'); // Consistent icon sizes
      });
    });
  });

  describe('Theme and Styling', () => {
    it('should apply consistent theme colors', () => {
      renderWithProviders(
        <Layout>
          <div>Test Content</div>
        </Layout>
      );
      
      const header = screen.getByRole('banner');
      expect(header).toHaveClass('bg-white', 'shadow'); // Theme classes
    });

    it('should handle dark mode if implemented', () => {
      // This would test dark mode functionality if implemented
      renderWithProviders(
        <Layout>
          <div>Test Content</div>
        </Layout>
      );
      
      // For now, just ensure no crashes
      expect(screen.getByRole('main')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing sync status', () => {
      mockStore = mockUseAppStore({
        loading: false,
        error: null,
        syncStatus: null,
      });
      
      renderWithProviders(
        <Layout>
          <div>Test Content</div>
        </Layout>
      );
      
      // Should not crash
      expect(screen.getByRole('main')).toBeInTheDocument();
    });

    it('should handle very long error messages', () => {
      const longError = 'A'.repeat(1000);
      mockStore = mockUseAppStore({
        loading: false,
        error: longError,
        syncStatus: null,
      });
      
      renderWithProviders(
        <Layout>
          <div>Test Content</div>
        </Layout>
      );
      
      expect(screen.getByText(longError)).toBeInTheDocument();
    });

    it('should handle rapid navigation changes', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <Layout>
          <div>Test Content</div>
        </Layout>
      );
      
      // Rapidly click different navigation items
      await user.click(screen.getByText('Neue Beobachtung'));
      await user.click(screen.getByText('Schüler finden'));
      await user.click(screen.getByText('Einstellungen'));
      
      // Should not crash
      expect(screen.getByRole('main')).toBeInTheDocument();
    });

    it('should handle empty children', () => {
      renderWithProviders(<Layout>{null}</Layout>);
      
      expect(screen.getByRole('main')).toBeInTheDocument();
    });

    it('should handle multiple children', () => {
      renderWithProviders(
        <Layout>
          <div>Child 1</div>
          <div>Child 2</div>
          <div>Child 3</div>
        </Layout>
      );
      
      expect(screen.getByText('Child 1')).toBeInTheDocument();
      expect(screen.getByText('Child 2')).toBeInTheDocument();
      expect(screen.getByText('Child 3')).toBeInTheDocument();
    });
  });
});