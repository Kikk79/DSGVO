import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../../stores/appStore';
import { ToastProvider } from '../../../components/ui/Toast';
import { ObservationEditorContext } from '../../../components/observations/editorContext';
import { BeobachtungenPage, PAGE_SIZE } from '../BeobachtungenPage';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

const students = [
  { id: 1, class_id: 1, first_name: 'Anna', last_name: 'Berg', status: 'active' },
  { id: 2, class_id: 2, first_name: 'Ben', last_name: 'Adler', status: 'active' },
];
const classes = [
  { id: 1, name: '7a', school_year: '2026/27' },
  { id: 2, name: '7b', school_year: '2026/27' },
];
const categories = [
  {
    id: 1,
    name: 'Sozialverhalten',
    color: '#0a0',
    background_color: '#efe',
    text_color: '#050',
    is_active: true,
    sort_order: 1,
  },
  {
    id: 2,
    name: 'Arbeitsverhalten',
    color: '#00a',
    background_color: '#eef',
    text_color: '#005',
    is_active: true,
    sort_order: 2,
  },
];

/** 60 Einträge für Anna (7a), dazu einer für Ben (7b) und einer zu einem gelöschten Schüler. */
function observations() {
  const list = Array.from({ length: 60 }, (_, index) => ({
    id: index + 1,
    student_id: 1,
    author_id: 1,
    category: 'Sozialverhalten',
    text: `Eintrag Nummer ${index + 1}`,
    tags: '[]',
    created_at: new Date(2026, 9, 1 + (index % 28), 8 + (index % 8)).toISOString(),
    updated_at: new Date(2026, 9, 1 + (index % 28), 8 + (index % 8)).toISOString(),
    source_device_id: 'x',
  }));
  list.push({
    ...list[0],
    id: 100,
    student_id: 2,
    category: 'Arbeitsverhalten',
    text: 'Hausaufgaben vergessen',
    tags: '["Hausaufgaben"]',
  });
  list.push({ ...list[0], id: 200, student_id: 99, text: 'Gelöschter Schüler' });
  return list;
}

const invokeMock = vi.mocked(invoke);
const editor = { openCreate: vi.fn(), openEdit: vi.fn() };

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.search}</output>;
}

function renderPage(url = '/beobachtungen') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ToastProvider>
        <ObservationEditorContext.Provider value={editor}>
          <Routes>
            <Route
              path="/beobachtungen"
              element={
                <>
                  <BeobachtungenPage />
                  <LocationProbe />
                </>
              }
            />
          </Routes>
        </ObservationEditorContext.Provider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (command: string) => {
    switch (command) {
      case 'search_observations':
        return observations();
      case 'get_students':
        return students;
      case 'get_classes':
        return classes;
      default:
        return [];
    }
  });
  useAppStore.setState({ students: [], classes: [], categories });
  editor.openCreate.mockReset();
  editor.openEdit.mockReset();
});

describe('BeobachtungenPage', () => {
  it('zeigt zunächst eine Portion und lädt mit „Weitere anzeigen“ den Rest', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText(`${PAGE_SIZE} von 61 angezeigt`)).toBeInTheDocument();
    expect(screen.queryByText('Gelöschter Schüler')).not.toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(PAGE_SIZE);

    await user.click(screen.getByRole('button', { name: 'Weitere 11 anzeigen' }));
    expect(screen.getAllByRole('article')).toHaveLength(61);
    expect(screen.getByText('Alle 61 Einträge angezeigt')).toBeInTheDocument();
  });

  it('übernimmt Filter aus der URL und schreibt Änderungen zurück', async () => {
    const user = userEvent.setup();
    renderPage('/beobachtungen?klasse=2');
    expect(await screen.findByText('Hausaufgaben vergessen')).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(1);

    await user.selectOptions(screen.getByLabelText('Klasse'), '');
    await user.selectOptions(screen.getByLabelText('Kategorie'), 'Arbeitsverhalten');
    expect(screen.getByTestId('location').textContent).toBe('?kategorie=Arbeitsverhalten');
    expect(screen.getAllByRole('article')).toHaveLength(1);
  });

  it('sucht im Text und zeigt bei leerem Ergebnis „Filter zurücksetzen“', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(`${PAGE_SIZE} von 61 angezeigt`);

    await user.type(screen.getByRole('searchbox'), 'gibt es nicht{Enter}');
    expect(await screen.findByText('Keine passenden Beobachtungen')).toBeInTheDocument();

    const empty = screen.getByText('Keine passenden Beobachtungen').parentElement as HTMLElement;
    await user.click(within(empty).getByRole('button', { name: 'Filter zurücksetzen' }));
    expect(screen.getByTestId('location').textContent).toBe('');
    expect(await screen.findByText(`${PAGE_SIZE} von 61 angezeigt`)).toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });

  it('sortiert die Tabelle über die Spaltenköpfe und öffnet Bearbeiten', async () => {
    const user = userEvent.setup();
    renderPage('/beobachtungen?ansicht=tabelle');
    const table = await screen.findByRole('table');
    await user.click(within(table).getByRole('button', { name: 'Schüler' }));
    expect(screen.getByTestId('location').textContent).toContain('sortierung=name');

    const firstRow = within(table).getAllByRole('row')[1];
    expect(within(firstRow).getByText('Ben Adler')).toBeInTheDocument();
    await user.click(within(firstRow).getByRole('button', { name: /bearbeiten$/ }));
    expect(editor.openEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 100 }));
  });

  it('zeigt einen Leerzustand, wenn es noch keine Beobachtungen gibt', async () => {
    invokeMock.mockImplementation(async (command: string) =>
      command === 'get_students' ? students : command === 'get_classes' ? classes : [],
    );
    renderPage();
    expect(await screen.findByText('Noch keine Beobachtungen')).toBeInTheDocument();
  });
});
