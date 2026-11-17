import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useAppStore, type Category } from '../../stores/appStore';
import { bumpDataVersion, useDataVersion } from '../../stores/uiStore';
import { errorMessage } from '../../lib/errors';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { CategoryBadge } from '../../components/ui/CategoryBadge';
import { EmptyState } from '../../components/ui/EmptyState';
import { Spinner } from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/toastContext';
import { CategoryFormDialog } from './CategoryFormDialog';
import { InlineError, Section } from './parts';

type EditorState = { open: false } | { open: true; category: Category | null };

const countLabel = (count: number) =>
  count === 0 ? 'Noch nicht verwendet' : count === 1 ? '1 Beobachtung' : `${count} Beobachtungen`;

/** Reiter „Kategorien“: anlegen, umbenennen, Farbe wählen, löschen (mit Rückfrage). */
export function KategorienTab() {
  const categories = useAppStore((state) => state.categories);
  const loadCategories = useAppStore((state) => state.loadCategories);
  const dataVersion = useDataVersion();
  const toast = useToast();

  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Beobachtungen je Kategoriename (alle Einträge, auch zu gelöschten Schülern) */
  const [usage, setUsage] = useState<Map<string, number>>(new Map());
  const [editor, setEditor] = useState<EditorState>({ open: false });
  const [toDelete, setToDelete] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadCategories(),
      invoke<Array<{ category: string }>>('search_observations', { query: null, studentId: null, category: null }),
    ])
      .then(([, observations]) => {
        if (cancelled) return;
        const counts = new Map<string, number>();
        for (const observation of observations) {
          counts.set(observation.category, (counts.get(observation.category) ?? 0) + 1);
        }
        setUsage(counts);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        console.error('Kategorien konnten nicht geladen werden:', error);
        if (!cancelled) setLoadError(errorMessage(error, 'Die Kategorien konnten nicht geladen werden.'));
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [loadCategories, dataVersion]);

  const sorted = useMemo(() => [...categories].sort((a, b) => a.sort_order - b.sort_order), [categories]);
  const names = useMemo(() => sorted.map((category) => category.name), [sorted]);

  const afterChange = useCallback(async () => {
    await loadCategories();
    bumpDataVersion();
  }, [loadCategories]);

  const handleSaved = (name: string, created: boolean) => {
    setEditor({ open: false });
    toast.success(created ? `Kategorie „${name}“ angelegt.` : `Kategorie „${name}“ gespeichert.`);
    void afterChange();
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await invoke('delete_category', { id: toDelete.id, forceDelete: false });
      toast.success(`Kategorie „${toDelete.name}“ gelöscht.`);
      setToDelete(null);
      await afterChange();
    } catch (error) {
      console.error('Kategorie konnte nicht gelöscht werden:', error);
      setDeleteError(errorMessage(error, 'Die Kategorie konnte nicht gelöscht werden.'));
    } finally {
      setDeleting(false);
    }
  };

  const deleteUsage = toDelete ? usage.get(toDelete.name) ?? 0 : 0;

  return (
    <div className="space-y-10">
      <Section
        id="kategorien-titel"
        title="Kategorien"
        description={
          <p>
            Jede Beobachtung gehört zu einer Kategorie. Die Farbe erscheint überall, wo die Kategorie angezeigt wird.
            Neue Kategorien stehen am Ende der Liste.
          </p>
        }
        actions={
          <Button size="sm" icon={<Plus />} onClick={() => setEditor({ open: true, category: null })}>
            Neue Kategorie
          </Button>
        }
      >
        {!loaded ? (
          <Spinner showLabel label="Kategorien werden geladen …" />
        ) : loadError ? (
          <InlineError>{loadError}</InlineError>
        ) : sorted.length === 0 ? (
          <EmptyState
            title="Noch keine Kategorien"
            action={
              <Button icon={<Plus />} onClick={() => setEditor({ open: true, category: null })}>
                Erste Kategorie anlegen
              </Button>
            }
          >
            Ohne Kategorie lässt sich keine Beobachtung speichern. Legen Sie zum Beispiel „Sozialverhalten“ oder
            „Mitarbeit“ an.
          </EmptyState>
        ) : (
          <ul aria-labelledby="kategorien-titel" className="max-w-measure border-t border-line">
            {sorted.map((category) => {
              const count = usage.get(category.name) ?? 0;
              return (
                <li key={category.id} className="flex items-center gap-4 border-b border-line py-2.5 pl-1">
                  <CategoryBadge
                    name={category.name}
                    colors={{ color: category.color, background: category.background_color, text: category.text_color }}
                  />
                  <span className="flex-1 text-small text-ink-muted tabular-nums">{countLabel(count)}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Pencil />}
                    onClick={() => setEditor({ open: true, category })}
                    aria-label={`„${category.name}“ bearbeiten`}
                  >
                    Bearbeiten
                  </Button>
                  <IconButton
                    label={`„${category.name}“ löschen`}
                    tone="danger"
                    size="sm"
                    onClick={() => {
                      setDeleteError(null);
                      setToDelete(category);
                    }}
                  >
                    <Trash2 />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <CategoryFormDialog
        open={editor.open}
        category={editor.open ? editor.category : null}
        usage={editor.open && editor.category ? usage.get(editor.category.name) ?? 0 : 0}
        existingNames={names}
        onClose={() => setEditor({ open: false })}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={toDelete !== null}
        title="Kategorie löschen?"
        tone="danger"
        confirmLabel="Kategorie löschen"
        busy={deleting}
        error={deleteError}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setToDelete(null)}
      >
        {deleteUsage > 0 ? (
          <>
            <p>
              „{toDelete?.name}“ kommt in {deleteUsage === 1 ? 'einer Beobachtung' : `${deleteUsage} Beobachtungen`} vor.
            </p>
            <p>
              Die Kategorie wird ausgeblendet und steht für neue Beobachtungen nicht mehr zur Auswahl. Vorhandene
              Beobachtungen behalten sie. Der Name bleibt belegt.
            </p>
          </>
        ) : (
          <p>„{toDelete?.name}“ wird noch nicht verwendet und wird endgültig gelöscht.</p>
        )}
      </ConfirmDialog>
    </div>
  );
}
