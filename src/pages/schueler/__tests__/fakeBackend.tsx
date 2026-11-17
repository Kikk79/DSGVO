import type { ReactNode } from 'react';
import { MemoryRouter, Routes } from 'react-router-dom';
import { render } from '@testing-library/react';
import { ToastProvider } from '../../../components/ui/Toast';
import { ObservationEditorProvider } from '../../../components/observations/ObservationEditorProvider';
import { useAppStore } from '../../../stores/appStore';

/** Kleines In-Memory-Backend für die Tests der Schülerseiten. */
export interface FakeData {
  classes: Array<{ id: number; name: string; school_year: string }>;
  students: Array<{ id: number; class_id: number; first_name: string; last_name: string; status: string }>;
  observations: Array<{
    id: number;
    student_id: number;
    author_id: number;
    category: string;
    text: string;
    tags: string;
    created_at: string;
    updated_at: string;
    source_device_id: string;
  }>;
}

export const CATEGORIES = [
  { id: 1, name: 'Mitarbeit', color: '#2B6CB0', background_color: '#DCEAF7', text_color: '#1E4E80', is_active: true, sort_order: 1 },
  { id: 2, name: 'Sozialverhalten', color: '#2F7D5B', background_color: '#DDF0E4', text_color: '#1F5A40', is_active: true, sort_order: 2 },
];

export function sampleData(): FakeData {
  const obs = (id: number, studentId: number, category: string, text: string, createdAt: string) => ({
    id,
    student_id: studentId,
    author_id: 1,
    category,
    text,
    tags: '["Gruppenarbeit"]',
    created_at: createdAt,
    updated_at: createdAt,
    source_device_id: 'test',
  });
  return {
    classes: [
      { id: 1, name: '5a', school_year: '2026/27' },
      { id: 2, name: '7b', school_year: '2026/27' },
      { id: 3, name: '9c', school_year: '2026/27' },
    ],
    students: [
      { id: 10, class_id: 1, first_name: 'Emil', last_name: 'Bauer', status: 'active' },
      { id: 11, class_id: 1, first_name: 'Mia', last_name: 'Schneider', status: 'active' },
      { id: 12, class_id: 2, first_name: 'Lena', last_name: 'Hoffmann', status: 'inactive' },
    ],
    observations: [
      obs(100, 10, 'Mitarbeit', 'Meldet sich häufig.', '2026-11-10T08:15:00.000Z'),
      obs(101, 10, 'Sozialverhalten', 'Hilft anderen beim Aufräumen.', '2026-10-02T09:00:00.000Z'),
      obs(102, 10, 'Mitarbeit', 'Präsentiert sicher; "gut"; klar.', '2026-11-12T10:30:00.000Z'),
      obs(103, 12, 'Mitarbeit', 'Arbeitet konzentriert.', '2026-11-01T10:30:00.000Z'),
    ],
  };
}


export function createHandler(data: FakeData) {
  let nextId = 1000;
  return async (command: string, args: Record<string, unknown> = {}): Promise<unknown> => {
    switch (command) {
      case 'get_classes':
        return data.classes.map((item) => ({ ...item }));
      case 'get_students':
        return data.students.filter((s) => s.status !== 'deleted').map((s) => ({ ...s }));
      case 'get_categories':
        return CATEGORIES;
      case 'get_students_with_stats':
        return data.students
          .filter((s) => s.status !== 'deleted')
          .map((s) => {
            const own = data.observations.filter((o) => o.student_id === s.id);
            return {
              ...s,
              class_name: data.classes.find((c) => c.id === s.class_id)?.name ?? '',
              observation_count: own.length,
              last_observation_date: own.map((o) => o.created_at).sort().pop() ?? null,
            };
          });
      case 'search_observations':
        return data.observations.filter((o) => args.studentId == null || o.student_id === args.studentId);
      case 'create_class': {
        const row = { id: nextId++, name: String(args.name), school_year: String(args.schoolYear) };
        data.classes.push(row);
        return row;
      }
      case 'create_student': {
        const row = {
          id: nextId++,
          class_id: Number(args.classId),
          first_name: String(args.firstName),
          last_name: String(args.lastName),
          status: String(args.status ?? 'active'),
        };
        data.students.push(row);
        return row;
      }
      case 'delete_student': {
        const id = Number(args.studentId);
        if (args.forceDelete) {
          data.observations = data.observations.filter((o) => o.student_id !== id);
          data.students = data.students.filter((s) => s.id !== id);
        } else {
          const student = data.students.find((s) => s.id === id);
          if (student) student.status = 'deleted';
        }
        return null;
      }
      case 'delete_class': {
        const id = Number(args.classId);
        const members = data.students.filter((s) => s.class_id === id);
        if (!args.forceDelete && members.some((s) => s.status !== 'deleted')) {
          throw 'Cannot delete class with active students. Use force delete or remove students first.';
        }
        const ids = new Set(members.map((s) => s.id));
        data.observations = data.observations.filter((o) => !ids.has(o.student_id));
        data.students = data.students.filter((s) => s.class_id !== id);
        data.classes = data.classes.filter((c) => c.id !== id);
        return null;
      }
      case 'export_student_data': {
        const id = Number(args.studentId);
        const student = data.students.find((s) => s.id === id && s.status !== 'deleted');
        if (!student) throw 'Student not found';
        if (args.format !== 'json') return 'CSV data';
        return JSON.stringify(
          {
            student: { ...student, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' },
            observations: data.observations.filter((o) => o.student_id === id),
            export_timestamp: '2026-11-17T12:00:00Z',
            export_reason: 'Data subject request (GDPR Article 15)',
            data_controller: 'Educational Institution',
          },
          null,
          2,
        );
      }
      default:
        return null;
    }
  };
}

export function resetStore() {
  useAppStore.setState({ students: [], classes: [], observations: [], categories: CATEGORIES, loading: false, error: null });
}

export function renderAt(path: string, routes: ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <ObservationEditorProvider>
          <Routes>{routes}</Routes>
        </ObservationEditorProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}
