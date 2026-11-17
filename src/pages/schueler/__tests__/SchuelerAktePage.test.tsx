import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route } from 'react-router-dom';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { invoke } from '@tauri-apps/api/core';
import { downloadText } from '../../../lib/download';
import { SchuelerAktePage } from '../SchuelerAktePage';
import { createHandler, renderAt, resetStore, sampleData, type FakeData } from './fakeBackend';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));
vi.mock('date-fns/locale', async () => vi.importActual('date-fns/locale'));
vi.mock('../../../lib/download', async () => ({
  ...(await vi.importActual<object>('../../../lib/download')),
  downloadText: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);
const downloadMock = vi.mocked(downloadText);
let data: FakeData;

function setup(path: string) {
  data = sampleData();
  invokeMock.mockImplementation(createHandler(data) as typeof invoke);
  return renderAt(
    path,
    <>
      <Route path="/schueler" element={<p>Schülerliste</p>} />
      <Route path="/schueler/:id" element={<SchuelerAktePage />} />
    </>,
  );
}

describe('SchuelerAktePage', () => {
  beforeEach(() => {
    resetStore();
    invokeMock.mockReset();
    downloadMock.mockReset();
  });

  it('zeigt Stammdaten, Übersicht je Kategorie und alle Beobachtungen chronologisch', async () => {
    setup('/schueler/10');
    expect(await screen.findByRole('heading', { level: 1, name: 'Emil Bauer' })).toBeInTheDocument();
    expect(screen.getByText(/Schülerakte · Klasse 5a/)).toHaveTextContent('2026/27');

    const kategorien = screen.getByRole('region', { name: 'Nach Kategorie' });
    const items = within(kategorien).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Mitarbeit2');
    expect(items[1]).toHaveTextContent('Sozialverhalten1');

    const eintraege = screen.getByRole('region', { name: 'Alle Beobachtungen' });
    const articles = within(eintraege).getAllByRole('article');
    expect(articles).toHaveLength(3);
    // neueste zuerst
    expect(articles[0]).toHaveTextContent('Präsentiert sicher');
    expect(articles[2]).toHaveTextContent('Hilft anderen');
    expect(within(eintraege).getByText(/November 2026 · 2 Einträge/)).toBeInTheDocument();
    expect(within(eintraege).getByText(/Oktober 2026 · 1 Eintrag/)).toBeInTheDocument();
    // Bearbeiten und Löschen je Eintrag, ohne Schülernamen
    expect(within(articles[0]).getByRole('button', { name: /^Beobachtung bearbeiten/ })).toBeInTheDocument();
    expect(within(articles[0]).getByRole('button', { name: /^Beobachtung löschen/ })).toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledWith('search_observations', { query: null, studentId: 10, category: null });
  });

  it('zeigt bei unbekannter ID einen Leerzustand mit Link zurück', async () => {
    const user = userEvent.setup();
    setup('/schueler/4711');
    expect(await screen.findByText('Diese Schülerakte gibt es nicht')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Zur Schülerliste' }));
    expect(await screen.findByText('Schülerliste')).toBeInTheDocument();
  });

  it('behandelt eine ungültige ID ohne Backend-Aufruf', async () => {
    setup('/schueler/abc');
    expect(await screen.findByText('Diese Schülerakte gibt es nicht')).toBeInTheDocument();
    expect(invokeMock).not.toHaveBeenCalledWith('search_observations', expect.anything());
  });

  it('kennzeichnet inaktive Schüler', async () => {
    setup('/schueler/12');
    expect(await screen.findByRole('heading', { level: 1, name: 'Lena Hoffmann' })).toBeInTheDocument();
    expect(screen.getByText('Inaktiv')).toBeInTheDocument();
  });

  it('speichert die Datenauskunft als JSON', async () => {
    const user = userEvent.setup();
    setup('/schueler/10');
    await user.click(await screen.findByRole('button', { name: 'Als JSON speichern' }));
    await waitFor(() => expect(downloadMock).toHaveBeenCalledTimes(1));
    const [filename, content, mime] = downloadMock.mock.calls[0];
    expect(filename).toMatch(/^auskunft_bauer_emil_\d{4}-\d{2}-\d{2}\.json$/);
    expect(JSON.parse(content).observations).toHaveLength(3);
    expect(mime).toContain('application/json');
    expect(invokeMock).toHaveBeenCalledWith('export_student_data', { studentId: 10, format: 'json' });
  });

  it('speichert die Datenauskunft als CSV (aus dem JSON-Export erzeugt)', async () => {
    const user = userEvent.setup();
    setup('/schueler/10');
    await user.click(await screen.findByRole('button', { name: 'Als CSV speichern' }));
    await waitFor(() => expect(downloadMock).toHaveBeenCalledTimes(1));
    const [filename, content, mime] = downloadMock.mock.calls[0];
    expect(filename).toMatch(/\.csv$/);
    expect(mime).toContain('text/csv');
    const lines = content.replace('﻿', '').trim().split('\r\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain('Vorname;Nachname;Klasse');
    expect(lines.join('\n')).not.toContain('CSV data');
    expect(lines[3]).toContain('"Präsentiert sicher; ""gut""; klar."');
  });

  it('meldet einen fehlgeschlagenen Export verständlich', async () => {
    const user = userEvent.setup();
    setup('/schueler/10');
    await screen.findByRole('heading', { level: 1, name: 'Emil Bauer' });
    const handler = createHandler(data);
    invokeMock.mockImplementation(((command: string, args?: Record<string, unknown>) =>
      command === 'export_student_data' ? Promise.reject('database is locked') : handler(command, args)) as typeof invoke);
    await user.click(screen.getByRole('button', { name: 'Als JSON speichern' }));
    expect(await screen.findByText(/Die Datenbank ist gerade belegt/)).toBeInTheDocument();
    expect(downloadMock).not.toHaveBeenCalled();
  });

  it('öffnet den Beobachtungsdialog mit vorgewähltem Schüler', async () => {
    const user = userEvent.setup();
    setup('/schueler/10');
    await user.click(await screen.findByRole('button', { name: 'Beobachtung zu diesem Schüler' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Emil Bauer');
  });

  it('löscht den Schüler aus der Akte und kehrt zur Liste zurück', async () => {
    const user = userEvent.setup();
    setup('/schueler/10');
    await user.click(await screen.findByRole('button', { name: 'Schüler löschen …' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Emil Bauer löschen?' });
    await user.click(within(dialog).getByLabelText('Endgültig löschen'));
    await user.click(within(dialog).getByRole('button', { name: 'Endgültig löschen' }));
    expect(await screen.findByText('Schülerliste')).toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledWith('delete_student', { studentId: 10, forceDelete: true });
  });
});
