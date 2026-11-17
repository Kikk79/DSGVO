import { useEffect, useRef, useState, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, Pencil, Trash2 } from 'lucide-react';
import type { ObservationView } from '../../lib/observations';
import { formatDate, formatTime } from '../../lib/format';
import { cx } from '../../lib/cx';
import { CategoryBadge } from '../../components/ui/CategoryBadge';
import { IconButton } from '../../components/ui/IconButton';
import { TagChip } from '../../components/ui/TagChip';
import { DeleteObservationDialog } from '../../components/observations/DeleteObservationDialog';
import { useObservationEditor } from '../../components/observations/editorContext';
import type { SortDirection, SortKey } from './filters';

export interface ObservationTableProps {
  observations: ObservationView[];
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSort: (key: SortKey) => void;
}

const LABELS: Record<SortKey, string> = {
  datum: 'Datum',
  name: 'Schüler',
  klasse: 'Klasse',
  kategorie: 'Kategorie',
};

/** Unter dieser Breite rücken Klasse und Kategorie in die Nachbarspalten. */
const COMPACT_BELOW_PX = 760;

/** Breite des Containers beobachten; ohne ResizeObserver (Tests) bleibt die breite Form. */
function useCompact(ref: RefObject<HTMLElement>): boolean {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => setCompact(entry.contentRect.width < COMPACT_BELOW_PX));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return compact;
}

/** Tabellarische Übersicht, sortierbar über die Spaltenköpfe. */
export function ObservationTable({ observations, sortKey, sortDirection, onSort }: ObservationTableProps) {
  const { openEdit } = useObservationEditor();
  const [deleting, setDeleting] = useState<ObservationView | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const compact = useCompact(containerRef);

  const sortButton = (key: SortKey) => {
    const active = key === sortKey;
    const Arrow = sortDirection === 'auf' ? ArrowUp : ArrowDown;
    return (
      <button
        type="button"
        onClick={() => onSort(key)}
        aria-pressed={active}
        className={cx(
          'meta -mx-1 inline-flex items-center gap-1 rounded-sm px-1 py-0.5 transition-colors hover:text-ink',
          active && 'text-ink',
        )}
      >
        {LABELS[key]}
        {active && <Arrow aria-hidden="true" className="h-3.5 w-3.5" />}
      </button>
    );
  };

  const ariaSort = (...keys: SortKey[]) =>
    keys.includes(sortKey) ? (sortDirection === 'auf' ? 'ascending' : 'descending') : undefined;

  return (
    <div ref={containerRef} className="overflow-x-auto">
      <table className="w-full table-fixed border-collapse text-left">
        <caption className="sr-only">
          Beobachtungen, sortiert nach {LABELS[sortKey]} {sortDirection === 'auf' ? 'aufsteigend' : 'absteigend'}
        </caption>
        <thead>
          <tr className="border-b border-ink">
            {compact ? (
              <th scope="col" className="w-[9.5rem] py-2 pr-3 align-bottom">
                <span className="flex flex-wrap gap-x-3">
                  {sortButton('datum')}
                  {sortButton('name')}
                  {sortButton('klasse')}
                </span>
              </th>
            ) : (
              <>
                <th scope="col" className="w-[7.5rem] py-2 pr-3 align-bottom" aria-sort={ariaSort('datum')}>
                  {sortButton('datum')}
                </th>
                <th scope="col" className="w-[11rem] py-2 pr-3 align-bottom" aria-sort={ariaSort('name')}>
                  {sortButton('name')}
                </th>
              </>
            )}
            {!compact && (
              <>
                <th scope="col" className="w-[5.5rem] py-2 pr-3 align-bottom" aria-sort={ariaSort('klasse')}>
                  {sortButton('klasse')}
                </th>
                <th scope="col" className="w-[9.5rem] py-2 pr-3 align-bottom" aria-sort={ariaSort('kategorie')}>
                  {sortButton('kategorie')}
                </th>
              </>
            )}
            <th scope="col" className="py-2 pr-3 align-bottom">
              {compact ? (
                <span className="flex flex-wrap items-baseline gap-x-3">
                  {sortButton('kategorie')}
                  <span className="meta inline-block py-0.5">Beobachtung</span>
                </span>
              ) : (
                <span className="meta inline-block py-0.5">Beobachtung</span>
              )}
            </th>
            <th scope="col" className="w-[4.75rem] py-2">
              <span className="sr-only">Aktionen</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {observations.map((observation) => {
            const subject = `Beobachtung zu ${observation.studentName} vom ${formatDate(observation.createdAt)}`;
            const badge = (
              <CategoryBadge
                name={observation.category}
                colors={observation.categoryColors}
                className="max-w-full truncate"
              />
            );
            const studentLink = (
              <Link
                to={`/schueler/${observation.studentId}`}
                className="rounded-sm font-display text-ui font-[560] text-ink decoration-ink/40 underline-offset-4 hover:underline"
              >
                {observation.studentName}
              </Link>
            );
            return (
              <tr
                key={observation.id}
                className="border-b border-line align-top transition-colors hover:bg-paper-deep/60"
              >
                {compact ? (
                  <td className="py-3 pr-3">
                    <time dateTime={observation.createdAt} className="block text-small tabular-nums text-ink-muted">
                      {formatDate(observation.createdAt)}, {formatTime(observation.createdAt)}
                    </time>
                    {studentLink}
                    {observation.className && <span className="meta mt-0.5 block">{observation.className}</span>}
                  </td>
                ) : (
                  <>
                    <td className="py-3 pr-3">
                      <time
                        dateTime={observation.createdAt}
                        className="block font-display text-ui tabular-nums text-ink"
                      >
                        {formatDate(observation.createdAt)}
                      </time>
                      <span className="text-small tabular-nums text-ink-muted">
                        {formatTime(observation.createdAt)} Uhr
                      </span>
                    </td>
                    <td className="py-3 pr-3">{studentLink}</td>
                  </>
                )}
                {!compact && (
                  <>
                    <td className="py-3 pr-3 text-ui text-ink">{observation.className ?? '–'}</td>
                    <td className="py-3 pr-3">{badge}</td>
                  </>
                )}
                <td className="py-3 pr-3">
                  {compact && <div className="mb-1">{badge}</div>}
                  <p
                    className={cx('text-ui text-ink', compact ? 'line-clamp-3' : 'line-clamp-2')}
                    title={observation.text}
                  >
                    {observation.text}
                  </p>
                  {observation.tags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {observation.tags.map((tag) => (
                        <TagChip key={tag} label={tag} />
                      ))}
                    </div>
                  )}
                </td>
                <td className="py-2">
                  <div className="flex justify-end">
                    <IconButton label={`${subject} bearbeiten`} size="sm" onClick={() => openEdit(observation)}>
                      <Pencil />
                    </IconButton>
                    <IconButton
                      label={`${subject} löschen`}
                      size="sm"
                      tone="danger"
                      onClick={() => setDeleting(observation)}
                    >
                      <Trash2 />
                    </IconButton>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <DeleteObservationDialog observation={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}
