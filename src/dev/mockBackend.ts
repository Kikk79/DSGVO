/**
 * Simuliertes Tauri-Backend für die Entwicklung im normalen Browser (npm run dev ohne Tauri).
 *
 * Es wird nur über einen dynamischen Import hinter `import.meta.env.DEV` geladen (src/main.tsx)
 * und fehlt deshalb im Produktions-Build. Die Kommandos, Argumentnamen und Rückgabeformen
 * folgen den #[tauri::command]-Funktionen in src-tauri/src/main.rs; Änderungen wirken nur im
 * Arbeitsspeicher und sind nach dem Neuladen wieder weg.
 *
 * `?mock=leer` in der Adresse startet ohne Klassen, Schüler und Beobachtungen (frische Installation).
 */

type Args = Record<string, unknown>;

interface ClassRow {
  id: number;
  name: string;
  school_year: string;
  created_at: string;
  updated_at: string;
  source_device_id: string;
}

interface StudentRow {
  id: number;
  class_id: number;
  first_name: string;
  last_name: string;
  status: string;
  created_at: string;
  updated_at: string;
  source_device_id: string;
}

interface CategoryRow {
  id: number;
  name: string;
  color: string;
  background_color: string;
  text_color: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  source_device_id: string;
}

interface ObservationRow {
  id: number;
  student_id: number;
  author_id: number;
  category: string;
  text: string;
  /** JSON-Text, wie ihn das echte Backend liefert */
  tags: string;
  created_at: string;
  updated_at: string;
  source_device_id: string;
}

const DEVICE_ID = 'mock-geraet-01';
const LATENCY_MS = 30;

// ---------------------------------------------------------------------------
// Beispieldaten (frei erfunden)
// ---------------------------------------------------------------------------

const CLASS_NAMES = ['5a', '7b', '9c'];

const STUDENT_SEED: Array<[classIndex: number, first: string, last: string, status?: string]> = [
  [0, 'Emil', 'Bauer'],
  [0, 'Mia', 'Schneider'],
  [0, 'Jonas', 'Weber'],
  [0, 'Leni', 'Krüger'],
  [0, 'Noah', 'Yilmaz'],
  [0, 'Frieda', 'Lange'],
  [0, 'Anton', 'Böhm'],
  [1, 'Lena', 'Hoffmann'],
  [1, 'Paul', 'Richter'],
  [1, 'Sophie', 'Wagner'],
  [1, 'Maximilian', 'Schulz'],
  [1, 'Emre', 'Demir'],
  [1, 'Hannah', 'Vogel'],
  [1, 'Finn', 'Köhler'],
  [2, 'Clara', 'Neumann'],
  [2, 'Lukas', 'Braun'],
  [2, 'Amelie', 'Schäfer'],
  [2, 'David', 'Kowalski'],
  [2, 'Johanna', 'Fuchs'],
  [2, 'Moritz', 'Engel'],
  [2, 'Greta', 'Sommer', 'inactive'],
];

const CATEGORY_SEED: Array<[name: string, color: string, background: string, text: string]> = [
  ['Sozialverhalten', '#2F7D5B', '#DDF0E4', '#1F5A40'],
  ['Mitarbeit', '#2B6CB0', '#DCEAF7', '#1E4E80'],
  ['Leistung', '#B7791F', '#FBEBC8', '#7A4E0E'],
  ['Arbeitsverhalten', '#C05621', '#FCE3D2', '#8A3A12'],
  ['Förderbedarf', '#9B2C5E', '#F8DDE8', '#7A1F49'],
  ['Sonstiges', '#6B7280', '#ECEAE4', '#3F3A33'],
];

/** [Kategorie, Text mit {name} als Platzhalter für den Vornamen, Schlagwörter] */
const TEXT_SEED: Array<[category: string, text: string, tags: string[]]> = [
  ['Sozialverhalten', '{name} hat in der Gruppenarbeit von sich aus zwischen zwei Mitschülern vermittelt und dafür gesorgt, dass alle zu Wort kamen.', ['Teamwork', 'Hilfsbereit']],
  ['Mitarbeit', '{name} meldet sich seit dieser Woche deutlich häufiger. Die Beiträge sind kurz, aber durchdacht.', ['Mitarbeit', 'Verbesserung']],
  ['Leistung', 'Vokabeltest ohne Fehler. {name} hat anschließend freiwillig die Zusatzaufgabe bearbeitet.', ['Motivation']],
  ['Arbeitsverhalten', 'Hausaufgaben zum dritten Mal in Folge unvollständig. {name} sagt, es fehle zu Hause ein ruhiger Platz. Gespräch mit der Klassenleitung vereinbart.', []],
  ['Förderbedarf', '{name} hat beim sinnentnehmenden Lesen längerer Texte weiterhin Mühe. Mit Leseplan und Markierstreifen klappt es spürbar besser.', ['Konzentration']],
  ['Sozialverhalten', 'In der Pause Streit um den Fußballplatz. {name} hat sich nach einem kurzen Gespräch selbstständig entschuldigt.', ['Selbstständig']],
  ['Mitarbeit', '{name} wirkte in der ersten Stunde müde und unbeteiligt, in der Partnerarbeit dann aber sehr engagiert.', ['Aufmerksamkeit']],
  ['Leistung', 'Referat über Vulkane frei gehalten, klare Gliederung, anschauliches Plakat. {name} konnte Rückfragen sicher beantworten.', ['Selbstständig', 'Motivation']],
  ['Arbeitsverhalten', '{name} arbeitet in Stillarbeitsphasen konzentriert und teilt sich die Zeit gut ein. Heft ist vollständig und sauber geführt.', ['Konzentration', 'Selbstständig']],
  ['Sonstiges', '{name} hat sich als Klassensprecherin bzw. Klassensprecher zur Wahl gestellt und die Vorstellung gut vorbereitet.', ['Motivation']],
  ['Sozialverhalten', '{name} hat einem neuen Mitschüler unaufgefordert das Schulhaus gezeigt und ihn in die Pausengruppe geholt.', ['Hilfsbereit']],
  ['Mitarbeit', 'Im Unterrichtsgespräch zum Bruchrechnen hat {name} einen eigenen Lösungsweg vorgestellt und an der Tafel erklärt.', ['Mitarbeit', 'Selbstständig']],
  ['Leistung', 'Die Klassenarbeit fiel schwächer aus als erwartet. {name} hat die Aufgaben zur Textanalyse nur zur Hälfte bearbeitet. Berichtigung besprochen.', ['Verbesserung']],
  ['Arbeitsverhalten', 'Material heute wieder nicht dabei (Zirkel, Geodreieck). {name} hat sich bei der Tischnachbarin beholfen.', []],
  ['Förderbedarf', '{name} braucht bei Textaufgaben Unterstützung beim Erfassen der Fragestellung. Rechnerisch sicher, sobald die Aufgabe klar ist.', ['Konzentration']],
  ['Sozialverhalten', '{name} hat mehrfach dazwischengerufen und die Arbeit am Gruppentisch gestört. Nach dem Platzwechsel deutlich ruhiger.', ['Aufmerksamkeit']],
  ['Mitarbeit', '{name} hat beim Experiment die Protokollführung übernommen und die Ergebnisse der Gruppe verständlich zusammengefasst.', ['Teamwork', 'Mitarbeit']],
  ['Leistung', 'Deutliche Fortschritte in der Rechtschreibung: im Diktat nur noch vier Fehler statt elf. {name} übt regelmäßig mit der Lernkartei.', ['Verbesserung', 'Motivation']],
  ['Arbeitsverhalten', '{name} beginnt Aufgaben zügig, gibt bei Schwierigkeiten aber schnell auf. Kleine Zwischenziele helfen.', ['Motivation']],
  ['Sonstiges', 'Elterngespräch am Telefon: Die Familie zieht im Februar um, {name} bleibt bis zum Halbjahr an der Schule.', []],
  ['Sozialverhalten', 'Bei der Vorbereitung des Schulfests hat {name} die Aufgaben in der Gruppe gerecht verteilt und selbst mit angepackt.', ['Teamwork']],
  ['Mitarbeit', 'Heute keine Wortmeldung, auf direkte Ansprache nur knappe Antworten. {name} wirkte bedrückt. Ich frage morgen noch einmal nach.', ['Aufmerksamkeit']],
  ['Leistung', '{name} hat die Lektüre bereits vollständig gelesen und ein sehr differenziertes Lesetagebuch abgegeben.', ['Selbstständig']],
  ['Förderbedarf', 'Im Förderunterricht Englisch: {name} traut sich inzwischen, ganze Sätze zu sprechen. Aussprache wird sicherer.', ['Verbesserung']],
];

const TODAY_SLOTS: Array<[hour: number, minute: number]> = [
  [7, 55],
  [8, 40],
  [10, 15],
  [11, 35],
  [12, 50],
];

// ---------------------------------------------------------------------------
// Zustand
// ---------------------------------------------------------------------------

interface MockState {
  classes: ClassRow[];
  students: StudentRow[];
  categories: CategoryRow[];
  observations: ObservationRow[];
  device: { device_type: string; device_name: string | null };
  databasePath: string;
  webdav: { url: string; username: string; active: boolean; lastSync: string | null } | null;
  /** Geräterolle; null bis zur Pflichtauswahl. Nur im Speicher: nach einem Neuladen wieder null. */
  deviceRole: 'laptop' | 'desktop' | null;
  firstSyncDone: boolean;
  lastOutcome: string | null;
  nextId: number;
}

/** Kleiner, fester Zufallsgenerator, damit die Beispieldaten bei jedem Start gleich aussehen. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function schoolYear(today: Date): string {
  const start = today.getMonth() >= 7 ? today.getFullYear() : today.getFullYear() - 1;
  return `${start}/${String((start + 1) % 100).padStart(2, '0')}`;
}

function atTime(day: Date, hour: number, minute: number): Date {
  const date = new Date(day);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function createState(empty: boolean): MockState {
  const now = new Date();
  const setupDate = new Date(now.getTime() - 70 * 86_400_000).toISOString();
  const state: MockState = {
    classes: [],
    students: [],
    categories: [],
    observations: [],
    device: { device_type: 'notebook', device_name: 'Lehrer-Notebook' },
    databasePath: '/home/lehrkraft/.local/share/schuelerbeobachtung/observations.db',
    webdav: null,
    deviceRole: null,
    firstSyncDone: false,
    lastOutcome: null,
    nextId: 1,
  };
  const id = () => state.nextId++;

  CATEGORY_SEED.forEach(([name, color, background, text], index) => {
    state.categories.push({
      id: id(),
      name,
      color,
      background_color: background,
      text_color: text,
      is_active: true,
      sort_order: index + 1,
      created_at: setupDate,
      updated_at: setupDate,
      source_device_id: DEVICE_ID,
    });
  });

  if (empty) return state;

  state.webdav = {
    url: 'https://cloud.goethe-gymnasium.example/remote.php/dav/files/lehrkraft/',
    username: 'm.albrecht',
    active: true,
    lastSync: new Date(now.getTime() - 4 * 60_000).toISOString(),
  };

  for (const name of CLASS_NAMES) {
    state.classes.push({
      id: id(),
      name,
      school_year: schoolYear(now),
      created_at: setupDate,
      updated_at: setupDate,
      source_device_id: DEVICE_ID,
    });
  }

  for (const [classIndex, first, last, status] of STUDENT_SEED) {
    state.students.push({
      id: id(),
      class_id: state.classes[classIndex].id,
      first_name: first,
      last_name: last,
      status: status ?? 'active',
      created_at: setupDate,
      updated_at: setupDate,
      source_device_id: DEVICE_ID,
    });
  }

  // Zwei Schüler ganz ohne Eintrag, drei nur mit älteren Einträgen (für „Länger ohne Eintrag“).
  const active = state.students.filter((student) => student.status === 'active');
  const never = new Set([active[3].id, active[17].id]);
  const onlyOld = new Set([active[5].id, active[10].id, active[15].id]);
  const regular = active.filter((student) => !never.has(student.id) && !onlyOld.has(student.id));
  const quiet = active.filter((student) => onlyOld.has(student.id));

  const random = mulberry32(20261117);
  const times: Array<{ at: Date; old: boolean }> = [];

  // Vergangene Schultage der letzten fünf Wochen
  for (let daysAgo = 36; daysAgo >= 1; daysAgo--) {
    const day = new Date(now.getTime() - daysAgo * 86_400_000);
    const weekday = day.getDay();
    if (weekday === 0 || weekday === 6) continue;
    const count = 1 + Math.floor(random() * 3) + (daysAgo <= 3 ? 1 : 0);
    for (let n = 0; n < count; n++) {
      const hour = 7 + Math.floor(random() * 8);
      const minute = Math.floor(random() * 12) * 5;
      times.push({ at: atTime(day, hour, minute), old: daysAgo >= 12 });
    }
  }

  // Heute: Schulstunden, aber nie in der Zukunft
  const todaySlots = TODAY_SLOTS.map(([hour, minute]) => atTime(now, hour, minute)).filter((slot) => slot <= now);
  if (todaySlots.length < 3) {
    todaySlots.length = 0;
    const midnight = atTime(now, 0, 0);
    for (let n = 3; n >= 1; n--) {
      const slot = new Date(now.getTime() - n * 9 * 60_000);
      if (slot >= midnight) todaySlots.push(slot);
    }
  }
  for (const slot of todaySlots) times.push({ at: slot, old: false });

  times.sort((a, b) => a.at.getTime() - b.at.getTime());

  let regularCursor = 0;
  let quietCursor = 0;
  times.forEach(({ at, old }, index) => {
    const useQuiet = old && index % 6 === 2;
    const student = useQuiet ? quiet[quietCursor++ % quiet.length] : regular[(regularCursor++ * 5) % regular.length];
    const [category, template, tags] = TEXT_SEED[(index * 7) % TEXT_SEED.length];
    const created = at.toISOString();
    state.observations.push({
      id: id(),
      student_id: student.id,
      author_id: 1,
      category,
      text: template.replace('{name}', student.first_name),
      tags: JSON.stringify(tags),
      created_at: created,
      updated_at: created,
      source_device_id: DEVICE_ID,
    });
  });

  // Einige Einträge wurden nachträglich bearbeitet …
  const total = state.observations.length;
  [total - 2, total - 9, total - 21, total - 34].forEach((index, n) => {
    const observation = state.observations[index];
    if (!observation) return;
    const edited = new Date(new Date(observation.created_at).getTime() + (n === 0 ? 25 * 60_000 : (n + 1) * 20 * 3_600_000));
    observation.updated_at = (edited > now ? now : edited).toISOString();
  });

  // … und zwei stammen von einem anderen Autor (Import vom Zweitgerät): normales Löschen wird abgelehnt.
  [total - todaySlots.length - 1, total - 28].forEach((index) => {
    const observation = state.observations[index];
    if (!observation) return;
    observation.author_id = 2;
    observation.source_device_id = 'mock-geraet-02';
  });

  return state;
}

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

const snake = (key: string) => key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

/** Liest ein Argument in camelCase (wie vom Frontend gesendet) oder snake_case. */
function arg<T>(args: Args, key: string): T | undefined {
  const value = args[key] ?? args[snake(key)];
  return value === null || value === undefined ? undefined : (value as T);
}

function required<T>(args: Args, key: string): T {
  const value = arg<T>(args, key);
  if (value === undefined) throw `invalid args \`${key}\` for command: missing required key ${key}`;
  return value;
}

const byName = (a: StudentRow, b: StudentRow) =>
  a.last_name.localeCompare(b.last_name, 'de') || a.first_name.localeCompare(b.first_name, 'de');

const newestFirst = (a: ObservationRow, b: ObservationRow) => b.created_at.localeCompare(a.created_at);

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

interface JoinedRow {
  observation: ObservationRow;
  student: StudentRow;
  schoolClass: ClassRow | undefined;
  category: CategoryRow | undefined;
}

function createHandlers(state: MockState) {
  const now = () => new Date().toISOString();
  const id = () => state.nextId++;
  /** Wie im Backend: nicht vor 2000-01-01, höchstens 5 Minuten nach jetzt. */
  const checkedCreatedAt = (value: string | null | undefined): string | undefined => {
    if (value === undefined || value === null) return undefined;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) throw 'Das Datum der Beobachtung ist ungültig.';
    if (parsed.getTime() < Date.UTC(2000, 0, 1)) {
      throw 'Das Datum der Beobachtung darf nicht vor dem 1. Januar 2000 liegen.';
    }
    if (parsed.getTime() > Date.now() + 5 * 60_000) {
      throw 'Das Datum der Beobachtung darf nicht in der Zukunft liegen.';
    }
    return parsed.toISOString();
  };

  const joined = (): JoinedRow[] =>
    state.observations.flatMap((observation) => {
      const student = state.students.find((item) => item.id === observation.student_id);
      if (!student) return [];
      return [
        {
          observation,
          student,
          schoolClass: state.classes.find((item) => item.id === student.class_id),
          category: state.categories.find((item) => item.name === observation.category),
        },
      ];
    });

  const assessmentRecord = ({ observation, student, schoolClass, category }: JoinedRow) => ({
    observation_id: observation.id,
    observation_created_at: observation.created_at,
    observation_updated_at: observation.updated_at,
    student_id: student.id,
    student_first_name: student.first_name,
    student_last_name: student.last_name,
    class_id: student.class_id,
    class_name: schoolClass?.name ?? '',
    category: observation.category,
    category_color: category?.color ?? '#6B7280',
    category_background_color: category?.background_color ?? '#F3F4F6',
    category_text_color: category?.text_color ?? '#374151',
    text: observation.text,
    tags: observation.tags,
    author_id: observation.author_id,
    source_device_id: observation.source_device_id,
  });

  /** Entspricht Database::get_assessments_comprehensive (ohne limit/offset). */
  const assessments = (args: Args) => {
    const dateFrom = arg<string>(args, 'dateFrom');
    const dateTo = arg<string>(args, 'dateTo');
    const categoryFilter = arg<string>(args, 'categoryFilter');
    const classFilter = arg<string>(args, 'classFilter');
    const studentFilter = arg<string>(args, 'studentFilter')?.toLocaleLowerCase('de');
    const sortField = arg<string>(args, 'sortField') ?? 'observation_created_at';
    const descending = (arg<string>(args, 'sortDirection') ?? 'desc').toLowerCase() !== 'asc';

    const rows = joined().filter(({ observation, student, schoolClass }) => {
      if (student.status === 'deleted') return false;
      // Wie in SQLite: Vergleich der Zeitstempel als Text
      if (dateFrom && observation.created_at < dateFrom) return false;
      if (dateTo && observation.created_at > dateTo) return false;
      if (categoryFilter && observation.category !== categoryFilter) return false;
      if (classFilter && schoolClass?.name !== classFilter) return false;
      if (
        studentFilter &&
        !student.first_name.toLocaleLowerCase('de').includes(studentFilter) &&
        !student.last_name.toLocaleLowerCase('de').includes(studentFilter)
      ) {
        return false;
      }
      return true;
    });

    const key = (row: JoinedRow): string => {
      switch (sortField) {
        case 'student_name':
          return `${row.student.last_name} ${row.student.first_name}`;
        case 'student_first_name':
          return row.student.first_name;
        case 'student_last_name':
          return row.student.last_name;
        case 'class_name':
          return row.schoolClass?.name ?? '';
        case 'category':
          return row.observation.category;
        case 'observation_updated_at':
          return row.observation.updated_at;
        default:
          return row.observation.created_at;
      }
    };
    rows.sort((a, b) => key(a).localeCompare(key(b), 'de', { numeric: true }) * (descending ? -1 : 1));
    return rows.map(assessmentRecord);
  };

  const findObservation = (observationId: number) => state.observations.find((item) => item.id === observationId);

  const handlers: Record<string, (args: Args) => unknown> = {
    // --- Stammdaten -------------------------------------------------------
    get_classes: () => state.classes.map((item) => ({ ...item })),

    create_class: (args) => {
      const row: ClassRow = {
        id: id(),
        name: required<string>(args, 'name'),
        school_year: required<string>(args, 'schoolYear'),
        created_at: now(),
        updated_at: now(),
        source_device_id: DEVICE_ID,
      };
      state.classes.push(row);
      return { ...row };
    },

    delete_class: (args) => {
      const classId = required<number>(args, 'classId');
      const force = arg<boolean>(args, 'forceDelete') ?? false;
      const members = state.students.filter((student) => student.class_id === classId);
      // Wie Database::delete_class: jeder nicht gelöschte Schüler (auch inaktive) verhindert das normale Löschen.
      if (!force && members.some((student) => student.status !== 'deleted')) {
        throw 'Cannot delete class with active students. Use force delete or remove students first.';
      }
      const memberIds = new Set(members.map((student) => student.id));
      state.observations = state.observations.filter((observation) => !memberIds.has(observation.student_id));
      state.students = state.students.filter((student) => student.class_id !== classId);
      state.classes = state.classes.filter((item) => item.id !== classId);
      return null;
    },

    get_students: () =>
      state.students
        .filter((student) => student.status !== 'deleted')
        .sort(byName)
        .map((student) => ({ ...student })),

    get_students_with_stats: () =>
      state.students
        .filter((student) => student.status !== 'deleted')
        .sort(byName)
        .map((student) => {
          const own = state.observations.filter((observation) => observation.student_id === student.id);
          const last = own.reduce<string | null>(
            (latest, observation) => (!latest || observation.created_at > latest ? observation.created_at : latest),
            null,
          );
          return {
            id: student.id,
            first_name: student.first_name,
            last_name: student.last_name,
            class_name: state.classes.find((item) => item.id === student.class_id)?.name ?? '',
            class_id: student.class_id,
            status: student.status,
            observation_count: own.length,
            last_observation_date: last,
          };
        }),

    create_student: (args) => {
      const row: StudentRow = {
        id: id(),
        class_id: required<number>(args, 'classId'),
        first_name: required<string>(args, 'firstName'),
        last_name: required<string>(args, 'lastName'),
        status: arg<string>(args, 'status') ?? 'active',
        created_at: now(),
        updated_at: now(),
        source_device_id: DEVICE_ID,
      };
      state.students.push(row);
      return { ...row };
    },

    delete_student: (args) => {
      const studentId = required<number>(args, 'studentId');
      const force = arg<boolean>(args, 'forceDelete') ?? false;
      const student = state.students.find((item) => item.id === studentId);
      if (!student) return null;
      if (force) {
        state.observations = state.observations.filter((observation) => observation.student_id !== studentId);
        state.students = state.students.filter((item) => item.id !== studentId);
      } else {
        student.status = 'deleted';
        student.updated_at = now();
      }
      return null;
    },

    // --- Kategorien -------------------------------------------------------
    get_categories: () =>
      state.categories
        .filter((category) => category.is_active)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((category) => ({ ...category })),

    create_category: (args) => {
      const name = required<string>(args, 'name');
      if (state.categories.some((category) => category.name === name)) {
        throw 'UNIQUE constraint failed: categories.name';
      }
      const row: CategoryRow = {
        id: id(),
        name,
        color: required<string>(args, 'color'),
        background_color: required<string>(args, 'backgroundColor'),
        text_color: required<string>(args, 'textColor'),
        is_active: true,
        sort_order: Math.max(0, ...state.categories.map((category) => category.sort_order)) + 1,
        created_at: now(),
        updated_at: now(),
        source_device_id: DEVICE_ID,
      };
      state.categories.push(row);
      return { ...row };
    },

    update_category: (args) => {
      const category = state.categories.find((item) => item.id === required<number>(args, 'id'));
      if (!category) return null;
      const previousName = category.name;
      category.name = required<string>(args, 'name');
      category.color = required<string>(args, 'color');
      category.background_color = required<string>(args, 'backgroundColor');
      category.text_color = required<string>(args, 'textColor');
      category.updated_at = now();
      // Beobachtungen speichern den Kategorienamen als Text; das echte Backend benennt sie nicht um.
      void previousName;
      return null;
    },

    delete_category: (args) => {
      const categoryId = required<number>(args, 'id');
      const force = arg<boolean>(args, 'forceDelete') ?? false;
      const category = state.categories.find((item) => item.id === categoryId);
      if (!category) return null;
      const used = state.observations.some((observation) => observation.category === category.name);
      if (!force && used) {
        // Wie im echten Backend: in Verwendung = nur deaktivieren
        category.is_active = false;
        category.updated_at = now();
      } else {
        state.categories = state.categories.filter((item) => item.id !== categoryId);
      }
      return null;
    },

    // --- Beobachtungen ----------------------------------------------------
    create_observation: (args) => {
      const created = checkedCreatedAt(arg<string | null>(args, 'createdAt')) ?? now();
      const row: ObservationRow = {
        id: id(),
        student_id: required<number>(args, 'studentId'),
        author_id: 1,
        category: required<string>(args, 'category'),
        text: required<string>(args, 'text'),
        tags: JSON.stringify(arg<string[]>(args, 'tags') ?? []),
        created_at: created,
        updated_at: created,
        source_device_id: DEVICE_ID,
      };
      state.observations.push(row);
      return { ...row };
    },

    update_observation: (args) => {
      const observationId = required<number>(args, 'observationId');
      const category = required<string>(args, 'category');
      const text = required<string>(args, 'text');
      const tags = arg<string[]>(args, 'tags') ?? [];
      if (!text.trim()) throw 'Observation text must not be empty';
      if (!category.trim()) throw 'Observation category must not be empty';
      const createdAt = checkedCreatedAt(arg<string | null>(args, 'createdAt'));
      const observation = findObservation(observationId);
      if (!observation) throw `Observation with id ${observationId} not found`;
      if (createdAt) observation.created_at = createdAt;
      observation.category = category;
      observation.text = text;
      observation.tags = JSON.stringify(tags);
      observation.updated_at = now();
      return { ...observation };
    },

    delete_observation: (args) => {
      const observationId = required<number>(args, 'observationId');
      const force = arg<boolean>(args, 'forceDelete') ?? false;
      const observation = findObservation(observationId);
      if (!force && (!observation || observation.author_id !== 1)) {
        throw 'Permission denied: You can only delete your own observations';
      }
      state.observations = state.observations.filter((item) => item.id !== observationId);
      return null;
    },

    get_observation: (args) => {
      const observation = findObservation(required<number>(args, 'observationId'));
      return observation ? { ...observation } : null;
    },

    search_observations: (args) => {
      const query = arg<string>(args, 'query')?.toLocaleLowerCase('de');
      const studentId = arg<number>(args, 'studentId');
      const category = arg<string>(args, 'category');
      return state.observations
        .filter(
          (observation) =>
            (studentId === undefined || observation.student_id === studentId) &&
            (!category || observation.category === category) &&
            (!query || observation.text.toLocaleLowerCase('de').includes(query)),
        )
        .sort(newestFirst)
        .map((observation) => ({ ...observation }));
    },

    get_assessments_comprehensive: (args) => {
      const limit = arg<number>(args, 'limit') ?? 100;
      const offset = arg<number>(args, 'offset') ?? 0;
      return assessments(args).slice(offset, offset + limit);
    },

    export_assessments_csv: (args) => {
      const header =
        'Datum,Uhrzeit,Schüler Vorname,Schüler Nachname,Klasse,Kategorie,Beobachtung,Tags,Erstellt am,Aktualisiert am';
      const lines = assessments(args).map((record) => {
        const created = new Date(record.observation_created_at);
        return [
          created.toLocaleDateString('de-DE'),
          created.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
          record.student_first_name,
          record.student_last_name,
          record.class_name,
          record.category,
          record.text,
          (JSON.parse(record.tags) as string[]).join('; '),
          record.observation_created_at,
          record.observation_updated_at,
        ]
          .map(csvCell)
          .join(',');
      });
      return [header, ...lines].join('\n');
    },

    get_calendar_observations: (args) => {
      const start = required<string>(args, 'startDate');
      const end = required<string>(args, 'endDate');
      const classId = arg<number>(args, 'classId');
      const category = arg<string>(args, 'category');
      const from = new Date(start).getTime();
      const to = new Date(end).getTime();
      if (Number.isNaN(from)) throw 'Invalid start_date format: input contains invalid characters';
      if (Number.isNaN(to)) throw 'Invalid end_date format: input contains invalid characters';
      return joined()
        .filter(({ observation, student }) => {
          const created = new Date(observation.created_at).getTime();
          return (
            created >= from &&
            created <= to &&
            student.status === 'active' &&
            (classId === undefined || student.class_id === classId) &&
            (!category || observation.category === category)
          );
        })
        .sort((a, b) => newestFirst(a.observation, b.observation))
        .map((row) => {
          const record = assessmentRecord(row);
          return {
            id: record.observation_id,
            created_at: record.observation_created_at,
            student_id: record.student_id,
            student_first_name: record.student_first_name,
            student_last_name: record.student_last_name,
            class_id: record.class_id,
            class_name: record.class_name,
            category: record.category,
            category_color: record.category_color,
            category_background_color: record.category_background_color,
            category_text_color: record.category_text_color,
            text: record.text,
            tags: record.tags,
          };
        });
    },

    // --- Export / Import --------------------------------------------------
    export_student_data: (args) => {
      const studentId = required<number>(args, 'studentId');
      const format = required<string>(args, 'format');
      const student = state.students.find((item) => item.id === studentId && item.status !== 'deleted');
      if (!student) throw 'Student not found';
      const observations = state.observations.filter((item) => item.student_id === studentId).sort(newestFirst);
      if (format === 'json') {
        return JSON.stringify(
          {
            student,
            observations,
            export_timestamp: now(),
            export_reason: 'Data subject request (GDPR Article 15)',
            data_controller: 'Educational Institution',
          },
          null,
          2,
        );
      }
      if (format === 'csv') {
        const header = 'student_id,first_name,last_name,observation_id,observation_text,category,tags,observation_created_at';
        const lines = observations.map((observation) =>
          [
            student.id,
            student.first_name,
            student.last_name,
            observation.id,
            observation.text,
            observation.category,
            (JSON.parse(observation.tags) as string[]).join('; '),
            observation.created_at,
          ]
            .map(csvCell)
            .join(','),
        );
        return [header, ...lines].join('\n');
      }
      throw 'Unsupported export format';
    },

    export_all_data: () => {
      // Gleiche Form wie export_all_data in main.rs: Gesamtstand `snapshot_v2` in der Hülle
      // {"checksum", "data"}; Verweise laufen über UUIDs (hier aus den Mock-IDs abgeleitet).
      const uuid = (kind: string, id: number) => `mock-${kind}-${id}`;
      const meta = (row: { created_at: string; updated_at: string; source_device_id: string }) => ({
        created_at: row.created_at,
        updated_at: row.updated_at,
        deleted_at: null,
        modified_by_device: DEVICE_ID,
        source_device_id: row.source_device_id,
      });
      const data = {
        format: 'snapshot_v2',
        schema_version: 2,
        device_id: DEVICE_ID,
        device_role: state.deviceRole,
        device_name: state.device.device_name,
        generated_at: now(),
        rows: {
          categories: state.categories.map((row) => ({
            uuid: uuid('category', row.id),
            name: row.name,
            color: row.color,
            background_color: row.background_color,
            text_color: row.text_color,
            is_active: row.is_active,
            sort_order: row.sort_order,
            ...meta(row),
          })),
          classes: state.classes.map((row) => ({
            uuid: uuid('class', row.id),
            name: row.name,
            school_year: row.school_year,
            ...meta(row),
          })),
          students: state.students.map((row) => ({
            uuid: uuid('student', row.id),
            class_uuid: uuid('class', row.class_id),
            first_name: row.first_name,
            last_name: row.last_name,
            status: row.status,
            ...meta(row),
          })),
          observations: state.observations.map((row) => ({
            uuid: uuid('observation', row.id),
            student_uuid: uuid('student', row.student_id),
            category: row.category,
            text: row.text,
            tags: row.tags,
            ...meta(row),
          })),
        },
      };
      // Prüfsumme im echten Backend: SHA-256 über den data-Text; hier nur ein Platzhalter.
      return JSON.stringify({ checksum: 'mock', data });
    },

    export_changeset: () => btoa(JSON.stringify({ format: 'changeset_v1', timestamp: now(), changes: [] })),
    export_changeset_to_file: (args) =>
      `Exported changeset to ${required<string>(args, 'filePath')} (${state.observations.length} observations)`,
    import_changeset: () => null,
    import_changeset_from_file: (args) =>
      `Imported changeset from ${required<string>(args, 'filePath')}: 0 new, 0 updated`,
    import_full_backup: (args) => `Imported full backup from ${required<string>(args, 'filePath')}: 0 new, 0 updated`,
    import_changeset_data: () => 'Imported changeset data: Successfully imported 0 observations',
    import_full_backup_data: () => 'Sicherung eingespielt: 0 neu, 0 aktualisiert, 0 gelöscht',

    // --- Gerät, Speicherort, Abgleich --------------------------------------
    get_sync_status: () => ({ peer_connected: false, last_sync: null, pending_changes: 0 }),

    get_device_config: () => ({ ...state.device }),
    set_device_config: (args) => {
      state.device = {
        device_type: arg<string>(args, 'deviceType') ?? 'unknown',
        device_name: arg<string>(args, 'deviceName') ?? null,
      };
      return null;
    },

    get_database_path: () => state.databasePath,
    set_database_path: (args) => {
      const path = required<string>(args, 'newPath');
      if (!path.includes('/') && !path.includes('\\')) throw 'Invalid path specified';
      state.databasePath = path;
      return null;
    },

    get_webdav_sync_status: () => ({
      configured: state.webdav !== null,
      active: state.webdav?.active ?? false,
      last_sync: state.webdav?.lastSync ?? null,
      url: state.webdav?.url ?? null,
      username: state.webdav?.username ?? null,
      clock_offset_ms: 3200,
      device_role: state.deviceRole,
      first_sync_done: state.firstSyncDone,
      last_outcome: state.lastOutcome,
    }),
    get_device_role: () => state.deviceRole,
    // Wie role_suggestion in sync_engine.rs: nur „notebook“ → Laptop, Desktop wird nie vorgeschlagen
    get_device_role_suggestion: () =>
      state.device.device_type === 'notebook' ? 'laptop' : null,
    set_device_role: (args) => {
      const role = required<string>(args, 'role');
      if (role !== 'laptop' && role !== 'desktop') throw `Invalid device role: ${role}`;
      state.deviceRole = role;
      return null;
    },
    // Automatische Sicherungskopien: im Browser gibt es keine Dateien neben der Datenbank.
    list_safety_backups: () => [],
    delete_safety_backups: () => 0,
    configure_webdav: (args) => {
      state.webdav = {
        url: required<string>(args, 'url'),
        username: required<string>(args, 'username'),
        active: true,
        lastSync: state.webdav?.lastSync ?? null,
      };
      return 'WebDAV sync configured successfully';
    },
    test_webdav_connection: (args) => {
      const url = required<string>(args, 'url');
      if (!/^https?:\/\//.test(url)) throw 'Connection failed: invalid URL';
      return true;
    },
    trigger_manual_sync: () => {
      if (!state.webdav) return { outcome: 'not_configured' };
      // Desktop vor dem ersten Abgleich: beim ersten Versuch liegt noch kein Laptop-Stand vor.
      if (state.deviceRole === 'desktop' && !state.firstSyncDone) {
        if (state.lastOutcome !== 'waiting_for_laptop') {
          state.lastOutcome = 'waiting_for_laptop';
          return { outcome: 'waiting_for_laptop' };
        }
        state.firstSyncDone = true;
      }
      state.webdav.lastSync = now();
      state.lastOutcome = 'synced';
      return { outcome: 'synced', report: { inserted: 12, updated: 3, tombstoned: 1, skipped: 0 } };
    },
    disable_webdav_sync: () => {
      if (state.webdav) state.webdav.active = false;
      return null;
    },

    // --- Altlasten (P2P-Kopplung), nur damit alte Aufrufe nicht scheitern ---
    generate_pairing_pin: () => ({
      pin: '482913',
      expires_at: new Date(Date.now() + 300_000).toISOString(),
      expires_in_seconds: 300,
    }),
    get_current_pairing_pin: () => null,
    clear_pairing_pin: () => null,
    get_pairing_code: () => 'MOCK-PAIRING-CODE',

    // --- Plugins ------------------------------------------------------------
    'plugin:dialog|save': (args) => {
      const options = (args.options ?? {}) as { defaultPath?: string };
      return `/home/lehrkraft/Dokumente/${options.defaultPath?.split(/[\\/]/).pop() ?? 'export.dat'}`;
    },
    // Dateiauswahl gibt es im Browser nicht: wie „Abbrechen“ behandeln.
    'plugin:dialog|open': () => null,
    'plugin:dialog|message': () => 'Ok',
    'plugin:dialog|ask': () => true,
    'plugin:dialog|confirm': () => true,
    'plugin:fs|write_text_file': () => null,
    'plugin:fs|write_file': () => null,
    'plugin:fs|read_text_file': () => '',
    'plugin:fs|exists': () => false,
  };

  return handlers;
}

/**
 * Hängt das simulierte Backend an `window.__TAURI_INTERNALS__`, über das
 * `invoke` aus @tauri-apps/api/core jedes Kommando abschickt.
 */
export function installMockBackend(): void {
  const empty = new URLSearchParams(window.location.search).get('mock') === 'leer';
  const handlers = createHandlers(createState(empty));
  let callbackId = 0;

  const internals = {
    invoke: (command: string, args?: Args) =>
      new Promise<unknown>((resolve, reject) => {
        window.setTimeout(() => {
          const handler = handlers[command];
          if (!handler) {
            console.warn(`[mockBackend] Unbekanntes Kommando: ${command}`);
            reject(`Command ${command} not found`);
            return;
          }
          try {
            // Wie über die echte IPC-Grenze: Ergebnis als Kopie ohne gemeinsame Referenzen
            const result = handler(args ?? {});
            resolve(result === undefined ? null : (JSON.parse(JSON.stringify(result)) as unknown));
          } catch (error) {
            reject(typeof error === 'string' ? error : String(error));
          }
        }, LATENCY_MS);
      }),
    transformCallback: () => ++callbackId,
    unregisterCallback: () => undefined,
    convertFileSrc: (filePath: string) => filePath,
    metadata: {
      currentWindow: { label: 'main' },
      currentWebview: { windowLabel: 'main', label: 'main' },
    },
  };

  Object.assign(window, { __TAURI_INTERNALS__: internals });
  console.info(
    `[mockBackend] Simuliertes Backend aktiv${empty ? ' (leerer Datenbestand)' : ''}. Mit ?mock=leer startet es ohne Daten.`,
  );
}
