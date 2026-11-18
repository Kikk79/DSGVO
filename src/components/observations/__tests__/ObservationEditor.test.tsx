import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { format } from 'date-fns';
import { useAppStore } from '../../../stores/appStore';
import { ToastProvider } from '../../ui/Toast';
import { ObservationEditor } from '../ObservationEditor';
import type { ObservationView } from '../../../lib/observations';

const PATTERN = "yyyy-MM-dd'T'HH:mm";
const createObservation = vi.fn();
const updateObservation = vi.fn();
const onClose = vi.fn();

const existing: ObservationView = {
  id: 7,
  studentId: 1,
  studentName: 'Anna Berg',
  className: '7a',
  category: 'Sozialverhalten',
  text: 'Hilft anderen Kindern beim Aufräumen.',
  tags: [],
  createdAt: new Date(2026, 9, 12, 9, 45).toISOString(),
  updatedAt: new Date(2026, 9, 12, 9, 45).toISOString(),
};

function renderEditor(observation?: ObservationView) {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <ObservationEditor observation={observation} initialStudentId={1} onClose={onClose} />
      </ToastProvider>
    </MemoryRouter>,
  );
}

const field = () => screen.getByLabelText('Datum und Uhrzeit') as HTMLInputElement;

beforeEach(() => {
  vi.clearAllMocks();
  createObservation.mockResolvedValue(undefined);
  updateObservation.mockResolvedValue({});
  useAppStore.setState({
    students: [{ id: 1, class_id: 1, first_name: 'Anna', last_name: 'Berg', status: 'active' }],
    classes: [{ id: 1, name: '7a', school_year: '2026/27' }],
    categories: [
      {
        id: 1,
        name: 'Sozialverhalten',
        color: '#0a0',
        background_color: '#efe',
        text_color: '#050',
        is_active: true,
        sort_order: 1,
      },
    ],
    createObservation,
    updateObservation,
  } as never);
});

describe('ObservationEditor: Datum und Uhrzeit', () => {
  it('belegt das Feld beim Anlegen mit der aktuellen Zeit und begrenzt es auf jetzt', () => {
    const before = format(new Date(), PATTERN);
    renderEditor();
    const after = format(new Date(), PATTERN);
    expect(field().type).toBe('datetime-local');
    expect([before, after]).toContain(field().value);
    expect([before, after]).toContain(field().max);
  });

  it('sendet beim Anlegen den gewählten Zeitpunkt als ISO-Zeit', async () => {
    const user = userEvent.setup();
    renderEditor();
    fireEvent.change(field(), { target: { value: '2026-11-10T08:30' } });
    await user.click(screen.getByRole('radio', { name: 'Sozialverhalten' }));
    await user.type(screen.getByLabelText('Beobachtung'), 'Hat eine Streitsituation ruhig gelöst.');
    await user.click(screen.getByRole('button', { name: 'Beobachtung speichern' }));

    await waitFor(() => expect(createObservation).toHaveBeenCalledTimes(1));
    expect(createObservation.mock.calls[0][0]).toMatchObject({
      student_id: 1,
      created_at: new Date(2026, 10, 10, 8, 30).toISOString(),
    });
  });

  it('zeigt beim Bearbeiten den vorhandenen Zeitpunkt in Ortszeit', () => {
    renderEditor(existing);
    expect(field().value).toBe('2026-10-12T09:45');
    expect(screen.getByText(/Erfasst am 12\.10\.2026 um 09:45 Uhr/)).toBeInTheDocument();
  });

  it('sperrt Speichern ohne Änderung und sendet bei reiner Textänderung keinen Zeitpunkt', async () => {
    const user = userEvent.setup();
    renderEditor(existing);
    expect(screen.getByRole('button', { name: 'Änderungen speichern' })).toBeDisabled();

    await user.type(screen.getByLabelText('Beobachtung'), ' Danke.');
    await user.click(screen.getByRole('button', { name: 'Änderungen speichern' }));
    await waitFor(() => expect(updateObservation).toHaveBeenCalledTimes(1));
    expect(updateObservation.mock.calls[0][1]).not.toHaveProperty('created_at');
  });

  it('zählt eine geänderte Zeit als Änderung und sendet sie', async () => {
    const user = userEvent.setup();
    renderEditor(existing);
    fireEvent.change(field(), { target: { value: '2026-10-11T14:05' } });
    expect(screen.getByText(/Erfasst am 11\.10\.2026 um 14:05 Uhr/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Änderungen speichern' }));
    await waitFor(() => expect(updateObservation).toHaveBeenCalledTimes(1));
    expect(updateObservation.mock.calls[0][0]).toBe(7);
    expect(updateObservation.mock.calls[0][1].created_at).toBe(new Date(2026, 9, 11, 14, 5).toISOString());
  });

  it('lehnt einen Zeitpunkt in der Zukunft ab', async () => {
    const user = userEvent.setup();
    renderEditor(existing);
    const future = format(new Date(Date.now() + 2 * 86_400_000), PATTERN);
    fireEvent.change(field(), { target: { value: future } });
    await user.click(screen.getByRole('button', { name: 'Änderungen speichern' }));

    expect(await screen.findByText('Datum und Uhrzeit dürfen nicht in der Zukunft liegen.')).toBeInTheDocument();
    expect(updateObservation).not.toHaveBeenCalled();
    expect(field()).toHaveAttribute('aria-invalid', 'true');
  });
});
