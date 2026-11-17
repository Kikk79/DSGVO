import { useEffect, useMemo, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import deLocale from '@fullcalendar/core/locales/de';
import type { EventContentArg, EventInput, EventMountArg } from '@fullcalendar/core';
import { addMonths, isSameMonth, startOfMonth } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ObservationView } from '../../lib/observations';
import { formatDate, formatMonthYear, formatTime } from '../../lib/format';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { useObservationEditor } from '../../components/observations/editorContext';

export interface ObservationCalendarProps {
  /** Bereits gefilterte Einträge (alle, nicht nur die erste Seite) */
  observations: ObservationView[];
  /** Erster Tag des angezeigten Monats */
  month: Date;
  onMonthChange: (month: Date) => void;
}

function eventLabel(observation: ObservationView): string {
  return `${observation.studentName}, ${observation.category}, ${formatDate(observation.createdAt)} ${formatTime(
    observation.createdAt,
  )} Uhr. Bearbeiten`;
}

function renderEvent(arg: EventContentArg) {
  const observation = arg.event.extendedProps.observation as ObservationView;
  return (
    <span className="flex min-w-0 items-baseline gap-1.5 overflow-hidden">
      <span className="shrink-0 tabular-nums opacity-80 max-[1179px]:hidden">{formatTime(observation.createdAt)}</span>
      <span className="truncate font-semibold">{observation.studentName}</span>
    </span>
  );
}

/** Monatsansicht. Ein Klick (oder Enter) auf einen Eintrag öffnet das Bearbeiten. */
export function ObservationCalendar({ observations, month, onMonthChange }: ObservationCalendarProps) {
  const { openEdit } = useObservationEditor();
  const calendarRef = useRef<FullCalendar>(null);
  // Aktuelle Funktion für die Tastatur-Handler der Termin-Elemente, die FullCalendar selbst anlegt.
  const openEditRef = useRef(openEdit);
  openEditRef.current = openEdit;

  useEffect(() => {
    calendarRef.current?.getApi().gotoDate(month);
  }, [month]);

  const events = useMemo<EventInput[]>(
    () =>
      observations.map((observation) => ({
        id: String(observation.id),
        title: observation.studentName,
        start: observation.createdAt,
        allDay: false,
        backgroundColor: observation.categoryColors?.background,
        borderColor: observation.categoryColors?.color,
        textColor: observation.categoryColors?.text,
        extendedProps: { observation },
      })),
    [observations],
  );

  const inMonth = useMemo(
    () => observations.filter((observation) => isSameMonth(new Date(observation.createdAt), month)).length,
    [observations, month],
  );

  const handleMount = (arg: EventMountArg) => {
    const observation = arg.event.extendedProps.observation as ObservationView;
    const element = arg.el;
    element.setAttribute('tabindex', '0');
    element.setAttribute('role', 'button');
    element.setAttribute('aria-label', eventLabel(observation));
    element.title = `${observation.studentName} · ${observation.category}\n${observation.text}`;
    element.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openEditRef.current(observation);
      }
    });
  };

  const isCurrentMonth = isSameMonth(month, new Date());

  return (
    <section aria-label="Kalender" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="font-display text-title font-[520] text-ink" aria-live="polite">
            {formatMonthYear(month)}
          </h2>
          <span className="meta">{inMonth === 1 ? '1 Eintrag' : `${inMonth} Einträge`}</span>
        </div>
        <div className="flex items-center gap-1">
          <IconButton label="Vorheriger Monat" onClick={() => onMonthChange(addMonths(month, -1))}>
            <ChevronLeft />
          </IconButton>
          <Button
            variant="secondary"
            size="sm"
            disabled={isCurrentMonth}
            onClick={() => onMonthChange(startOfMonth(new Date()))}
          >
            Heute
          </Button>
          <IconButton label="Nächster Monat" onClick={() => onMonthChange(addMonths(month, 1))}>
            <ChevronRight />
          </IconButton>
        </div>
      </div>

      <div className="[&_.fc-day-other_.fc-daygrid-event]:opacity-60">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin]}
          initialView="dayGridMonth"
          initialDate={month}
          locale={deLocale}
          firstDay={1}
          headerToolbar={false}
          height="auto"
          fixedWeekCount={false}
          dayMaxEvents={3}
          eventDisplay="block"
          events={events}
          eventContent={renderEvent}
          eventDidMount={handleMount}
          eventClick={(arg) => {
            arg.jsEvent.preventDefault();
            openEdit(arg.event.extendedProps.observation as ObservationView);
          }}
        />
      </div>
    </section>
  );
}
