import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import { isEdited, type ObservationView } from '../../lib/observations';
import { formatDate, formatDayShort, formatTime } from '../../lib/format';
import { cx } from '../../lib/cx';
import { CategoryBadge } from '../ui/CategoryBadge';
import { IconButton } from '../ui/IconButton';
import { TagChip } from '../ui/TagChip';
import { DeleteObservationDialog } from './DeleteObservationDialog';
import { useObservationEditor } from './editorContext';

export interface ObservationEntryProps {
  observation: ObservationView;
  /**
   * Inhalt der Randspalte: 'time' = nur Uhrzeit (wenn der Tag schon als Überschrift steht),
   * 'date' = Wochentag mit Datum und darunter die Uhrzeit.
   */
  margin?: 'time' | 'date';
  /** false blendet Namen und Klasse aus (in der Schülerakte). */
  showStudent?: boolean;
  /** Kürzt lange Texte auf drei Zeilen (für Übersichten). */
  clamp?: boolean;
}

/**
 * Ein Eintrag im Klassenbuch: Uhrzeit in der Randspalte, daneben der rote Heftrand,
 * dann Name, Kategorie, Text und Schlagwörter. Bearbeiten und Löschen sind eingebaut.
 * Mehrere Einträge gehören in <ul className="entry-list">.
 */
export function ObservationEntry({ observation, margin = 'time', showStudent = true, clamp = false }: ObservationEntryProps) {
  const { openEdit } = useObservationEditor();
  const [deleting, setDeleting] = useState(false);
  const subject = showStudent ? `Beobachtung zu ${observation.studentName}` : 'Beobachtung';
  const when = `${formatDate(observation.createdAt)}, ${formatTime(observation.createdAt)} Uhr`;

  return (
    <li className="grid grid-cols-[theme(spacing.margin)_minmax(0,1fr)] border-b border-line">
      <div className="pr-3 pt-[1.125rem] text-right">
        {margin === 'date' && (
          <span className="meta block text-ink">{formatDayShort(observation.createdAt)}</span>
        )}
        <time dateTime={observation.createdAt} className={cx('meta block tabular-nums', margin === 'time' && 'text-ink')}>
          {formatTime(observation.createdAt)}
        </time>
      </div>

      <article aria-label={`${subject}, ${when}`} className="border-l border-rotstift/45 py-3.5 pl-5">
        <header className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 pt-0.5">
            {showStudent && (
              <>
                <Link
                  to={`/schueler/${observation.studentId}`}
                  className="rounded-sm font-display text-name font-[560] text-ink decoration-ink/40 underline-offset-4 hover:underline"
                >
                  {observation.studentName}
                </Link>
                {observation.className && <span className="meta">{observation.className}</span>}
              </>
            )}
            <CategoryBadge name={observation.category} colors={observation.categoryColors} />
          </div>
          <div className="-my-1 -mr-2 flex shrink-0 items-center">
            <IconButton label={`${subject} bearbeiten`} size="sm" onClick={() => openEdit(observation)}>
              <Pencil />
            </IconButton>
            <IconButton label={`${subject} löschen`} size="sm" tone="danger" onClick={() => setDeleting(true)}>
              <Trash2 />
            </IconButton>
          </div>
        </header>

        <p className={cx('mt-1.5 max-w-measure whitespace-pre-line text-body text-ink', clamp && 'line-clamp-3')}>
          {observation.text}
        </p>

        {(observation.tags.length > 0 || isEdited(observation)) && (
          <footer className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {observation.tags.map((tag) => (
              <TagChip key={tag} label={tag} />
            ))}
            {isEdited(observation) && observation.updatedAt && (
              <span className="text-small italic text-ink-muted">
                bearbeitet am {formatDate(observation.updatedAt)}
              </span>
            )}
          </footer>
        )}
      </article>

      <DeleteObservationDialog observation={deleting ? observation : null} onClose={() => setDeleting(false)} />
    </li>
  );
}
