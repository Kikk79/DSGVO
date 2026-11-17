import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route } from 'react-router-dom';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { invoke } from '@tauri-apps/api/core';
import { SchuelerPage } from '../SchuelerPage';
import { createHandler, renderAt, resetStore, sampleData, type FakeData } from './fakeBackend';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
// Die globale Testeinrichtung ersetzt Router und Locale durch Attrappen; hier werden die echten gebraucht.
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));
vi.mock('date-fns/locale', async () => vi.importActual('date-fns/locale'));

const invokeMock = vi.mocked(invoke);
let data: FakeData;

function setup(custom?: FakeData) {
  data = custom ?? sampleData();
  invokeMock.mockImplementation(createHandler(data) as typeof invoke);
  return renderAt('/schueler', <Route path="/schueler" element={<SchuelerPage />} />);
}

const calls = (command: string) => invokeMock.mock.calls.filter(([name]) => name === command);

describe('SchuelerPage', () => {
  beforeEach(() => {
    resetStore();
    invokeMock.mockReset();
  });

  it('zeigt Klassen als Gruppen mit Schülern, Zählern und Link zur Schülerakte', async () => {
    setup();
    const klasse5a = await screen.findByRole('region', { name: 'Klasse 5a' });
    expect(within(klasse5a).getByText(/Schuljahr 2026\/27 · 2 Schüler/)).toBeInTheDocument();
    const emil = within(klasse5a).getByRole('link', { name: /Bauer, Emil/ });
    expect(emil).toHaveAttribute('href', '/schueler/10');
    expect(emil).toHaveTextContent('3 Einträge');
    expect(within(klasse5a).getByRole('link', { name: /Schneider, Mia/ })).toHaveTextContent('noch kein Eintrag');

    const klasse7b = screen.getByRole('region', { name: 'Klasse 7b' });
    expect(within(klasse7b).getByText('Inaktiv')).toBeInTheDocument();

    // Leere Klassen erscheinen ebenfalls
    const klasse9c = screen.getByRole('region', { name: 'Klasse 9c' });
    expect(within(klasse9c).getByText('Noch keine Schüler in dieser Klasse.')).toBeInTheDocument();
  });

  it('filtert nach Name und Klasse', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByRole('region', { name: 'Klasse 5a' });

    await user.type(screen.getByRole('searchbox', { name: /nach Namen suchen/ }), 'hoff');
    expect(screen.getByRole('link', { name: /Hoffmann, Lena/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Bauer, Emil/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Klasse 5a' })).not.toBeInTheDocument();
    expect(screen.getByText('1 Treffer von 3 Schülern')).toBeInTheDocument();

    await user.clear(screen.getByRole('searchbox'));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Klasse' }), '1');
    expect(screen.getByRole('region', { name: 'Klasse 5a' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Klasse 7b' })).not.toBeInTheDocument();

    await user.type(screen.getByRole('searchbox'), 'xyz');
    expect(screen.getByText('Niemand gefunden')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Suche zurücksetzen' }));
    expect(screen.getByRole('region', { name: 'Klasse 7b' })).toBeInTheDocument();
  });

  it('legt eine Klasse an und prüft Pflichtfelder und Doppelungen', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByRole('region', { name: 'Klasse 5a' });

    await user.click(screen.getByRole('button', { name: 'Klasse anlegen' }));
    const dialog = screen.getByRole('dialog', { name: 'Klasse anlegen' });
    await user.click(within(dialog).getByRole('button', { name: 'Klasse anlegen' }));
    expect(within(dialog).getByText(/Bitte geben Sie einen Namen ein/)).toBeInTheDocument();

    const name = within(dialog).getByLabelText('Name der Klasse');
    const year = within(dialog).getByLabelText('Schuljahr');
    await user.clear(year);
    await user.type(year, '2026/27');
    await user.type(name, '5a');
    await user.click(within(dialog).getByRole('button', { name: 'Klasse anlegen' }));
    expect(within(dialog).getByText('Die Klasse 5a gibt es im Schuljahr 2026/27 bereits.')).toBeInTheDocument();
    expect(calls('create_class')).toHaveLength(0);

    await user.clear(name);
    await user.type(name, '6d');
    await user.click(within(dialog).getByRole('button', { name: 'Klasse anlegen' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls('create_class')[0][1]).toEqual({ name: '6d', schoolYear: '2026/27' });
    expect(await screen.findByRole('region', { name: 'Klasse 6d' })).toBeInTheDocument();
  });

  it('legt Schüler mit Status an, auch mehrere hintereinander', async () => {
    const user = userEvent.setup();
    setup();
    const klasse9c = await screen.findByRole('region', { name: 'Klasse 9c' });

    await user.click(within(klasse9c).getByRole('button', { name: /Schüler hinzufügen/ }));
    const dialog = screen.getByRole('dialog', { name: 'Schüler anlegen' });
    expect(within(dialog).getByLabelText('Klasse')).toHaveValue('3');

    await user.type(within(dialog).getByLabelText('Vorname'), 'Clara');
    await user.type(within(dialog).getByLabelText('Nachname'), 'Neumann');
    await user.selectOptions(within(dialog).getByLabelText('Status'), 'inactive');
    await user.click(within(dialog).getByRole('button', { name: 'Speichern und weiteren anlegen' }));

    await waitFor(() => expect(calls('create_student')).toHaveLength(1));
    expect(calls('create_student')[0][1]).toEqual({ classId: 3, firstName: 'Clara', lastName: 'Neumann', status: 'inactive' });
    // Dialog bleibt offen, Namen sind geleert, Klasse bleibt stehen
    expect(within(dialog).getByLabelText('Vorname')).toHaveValue('');
    expect(within(dialog).getByLabelText('Klasse')).toHaveValue('3');

    await user.type(within(dialog).getByLabelText('Vorname'), 'Lukas');
    await user.type(within(dialog).getByLabelText('Nachname'), 'Braun');
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByRole('link', { name: /Braun, Lukas/ })).toBeInTheDocument();
  });

  it('löscht einen Schüler mit Beobachtungen erst nach Wahl der Löschart', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByRole('region', { name: 'Klasse 5a' });

    await user.click(screen.getByRole('button', { name: 'Emil Bauer löschen' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Emil Bauer löschen?' });
    expect(within(dialog).getByText(/Zu Emil Bauer gibt es 3 Beobachtungen/)).toBeInTheDocument();
    const confirm = within(dialog).getByRole('button', { name: 'Endgültig löschen' });
    expect(confirm).toBeDisabled();

    await user.click(within(dialog).getByLabelText('Endgültig löschen'));
    await user.click(within(dialog).getByRole('button', { name: 'Endgültig löschen' }));
    await waitFor(() => expect(calls('delete_student')).toHaveLength(1));
    expect(calls('delete_student')[0][1]).toEqual({ studentId: 10, forceDelete: true });
    await waitFor(() => expect(screen.queryByRole('link', { name: /Bauer, Emil/ })).not.toBeInTheDocument());
    expect(data.observations.some((o) => o.student_id === 10)).toBe(false);
  });

  it('kann einen Schüler nur aus der Liste entfernen (Beobachtungen bleiben)', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByRole('region', { name: 'Klasse 5a' });

    await user.click(screen.getByRole('button', { name: 'Emil Bauer löschen' }));
    const dialog = screen.getByRole('alertdialog');
    await user.click(within(dialog).getByLabelText('Nur aus der Liste entfernen'));
    await user.click(within(dialog).getByRole('button', { name: 'Aus der Liste entfernen' }));
    await waitFor(() => expect(calls('delete_student')).toHaveLength(1));
    expect(calls('delete_student')[0][1]).toEqual({ studentId: 10, forceDelete: false });
    expect(data.observations.filter((o) => o.student_id === 10)).toHaveLength(3);
  });

  it('löscht einen Schüler ohne Beobachtungen direkt endgültig', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByRole('region', { name: 'Klasse 5a' });

    await user.click(screen.getByRole('button', { name: 'Mia Schneider löschen' }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(/gibt es keine Beobachtungen/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Endgültig löschen' }));
    await waitFor(() => expect(calls('delete_student')[0]?.[1]).toEqual({ studentId: 11, forceDelete: true }));
  });

  it('löscht eine Klasse mit Schülern nur nach ausdrücklicher Bestätigung (force_delete)', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByRole('region', { name: 'Klasse 5a' });

    await user.click(screen.getByRole('button', { name: 'Klasse 5a löschen' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Klasse 5a löschen?' });
    expect(within(dialog).getByText(/enthält 2 Schüler mit zusammen 3 Beobachtungen/)).toBeInTheDocument();
    const confirm = within(dialog).getByRole('button', { name: 'Klasse mit allen Daten löschen' });
    expect(confirm).toBeDisabled();
    await user.click(within(dialog).getByRole('checkbox'));
    await user.click(confirm);
    await waitFor(() => expect(calls('delete_class')).toHaveLength(1));
    expect(calls('delete_class')[0][1]).toEqual({ classId: 1, forceDelete: true });
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Klasse 5a' })).not.toBeInTheDocument());
  });

  it('löscht eine leere Klasse ohne force_delete', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByRole('region', { name: 'Klasse 9c' });

    await user.click(screen.getByRole('button', { name: 'Klasse 9c löschen' }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(/enthält keine Schüler/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Klasse löschen' }));
    await waitFor(() => expect(calls('delete_class')[0]?.[1]).toEqual({ classId: 3, forceDelete: false }));
  });

  it('führt ohne Klassen zum Anlegen der ersten Klasse', async () => {
    setup({ classes: [], students: [], observations: [] });
    expect(await screen.findByText('Noch keine Klasse angelegt')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erste Klasse anlegen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Schüler anlegen' })).not.toBeInTheDocument();
  });

  it('zeigt einen Ladefehler mit erneutem Versuch', async () => {
    const user = userEvent.setup();
    data = sampleData();
    const handler = createHandler(data);
    let fail = true;
    invokeMock.mockImplementation(((command: string, args?: Record<string, unknown>) =>
      command === 'get_students_with_stats' && fail ? Promise.reject('database is locked') : handler(command, args)) as typeof invoke);
    renderAt('/schueler', <Route path="/schueler" element={<SchuelerPage />} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Die Datenbank ist gerade belegt');
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(await screen.findByRole('region', { name: 'Klasse 5a' })).toBeInTheDocument();
  });
});
