import * as React from 'react';
import { Check, PencilLine, Trash2, X } from 'lucide-react';
import type { SmartSearchMemoryDto } from '@se/shared';
import { Button } from '@/components/ui/button';
import { Overlay } from '@/components/ui/overlay';
import { ApiError, deleteSmartSearchMemory, listSmartSearchMemories, updateSmartSearchMemory } from '@/lib/api';

const CARD = 'rounded-[14px] border border-line-soft bg-surface p-6 shadow-card';
const SECTION_TITLE = 'text-[15px] font-bold text-ink-900';

/** One remembered fact row: view, inline edit, or a pending delete-confirm. */
function MemoryRow({
  memory,
  onSaved,
  onDelete,
}: {
  memory: SmartSearchMemoryDto;
  onSaved: (updated: SmartSearchMemoryDto) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [content, setContent] = React.useState(memory.content);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  async function onSave() {
    setError(null);
    if (!content.trim()) return setError('This fact can\'t be empty.');
    setSaving(true);
    try {
      const updated = await updateSmartSearchMemory(memory.id, { content: content.trim() });
      onSaved(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to save this fact.');
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="border-b border-line-soft py-[14px] last:border-b-0">
        <div className="flex h-11 items-center rounded-sm border border-line bg-surface px-3">
          <input
            type="text"
            autoFocus
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink-900 outline-none"
            aria-label="Edit remembered fact"
          />
        </div>
        {error && <div className="mt-2 text-sm font-medium text-danger">{error}</div>}
        <div className="mt-3 flex justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setEditing(false);
              setContent(memory.content);
              setError(null);
            }}
          >
            <X size={14} />
            Cancel
          </Button>
          <Button size="sm" onClick={onSave} disabled={saving}>
            <Check size={14} />
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 border-b border-line-soft py-[14px] last:border-b-0">
      <span className="min-w-0 flex-1 text-[13.5px] text-ink-500">{memory.content}</span>
      <button
        className="flex flex-none rounded-[7px] p-[6px] text-ink-400 hover:bg-surface-muted"
        onClick={() => setEditing(true)}
        aria-label="Edit this remembered fact"
      >
        <PencilLine size={16} />
      </button>
      <button
        className="flex flex-none rounded-[7px] p-[6px] text-ink-400 hover:bg-danger/10 hover:text-danger"
        onClick={onDelete}
        aria-label="Forget this fact"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}

/** Profile section listing what Smart Search has remembered about the caller across
 * conversations — strictly their own, per the tenant/user-scoped memory store. */
export function MemoryPanel() {
  const [memories, setMemories] = React.useState<SmartSearchMemoryDto[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState<SmartSearchMemoryDto | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);

  React.useEffect(() => {
    listSmartSearchMemories()
      .then((res) => setMemories(res.rows))
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Unable to load remembered facts.'));
  }, []);

  function onSaved(updated: SmartSearchMemoryDto) {
    setMemories((prev) => prev?.map((m) => (m.id === updated.id ? updated : m)) ?? prev);
  }

  async function onConfirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteSmartSearchMemory(deleting.id);
      setMemories((prev) => prev?.filter((m) => m.id !== deleting.id) ?? prev);
      setDeleting(null);
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Unable to forget this fact.');
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className={`mt-[18px] ${CARD}`}>
      <div className={SECTION_TITLE}>What Smart Search remembers about you</div>
      <div className="mt-1 text-[12px] text-ink-400">
        Facts and preferences the assistant has picked up across your conversations, used to
        answer you better next time.
      </div>
      {loadError ? (
        <div className="mt-4 text-sm font-medium text-danger">{loadError}</div>
      ) : memories === null ? (
        <div className="mt-4 text-sm text-ink-400">Loading…</div>
      ) : memories.length === 0 ? (
        <div className="mt-4 rounded-[14px] border border-dashed border-line bg-surface p-12 text-center text-sm text-ink-400">
          No remembered facts yet.
        </div>
      ) : (
        <div className="mt-2 flex flex-col">
          {memories.map((m) => (
            <MemoryRow
              key={m.id}
              memory={m}
              onSaved={onSaved}
              onDelete={() => {
                setDeleting(m);
                setDeleteError(null);
              }}
            />
          ))}
        </div>
      )}

      {deleting && (
        <Overlay onClose={() => setDeleting(null)} z={60}>
          <div className="mx-auto w-full max-w-[440px] rounded-xl bg-surface p-[26px] shadow-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[10px] bg-danger/[0.12] text-danger">
                <Trash2 size={22} />
              </div>
              <div className="text-lg font-bold text-ink-900">Forget this fact</div>
            </div>
            <div className="mt-[14px] text-[13.5px] leading-[1.6] text-ink-500">
              Delete <strong>&quot;{deleting.content}&quot;</strong> from what Smart Search remembers
              about you? This can&apos;t be undone.
            </div>
            {deleteError && <div className="mt-3 text-sm font-medium text-danger">{deleteError}</div>}
            <div className="mt-[22px] flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setDeleting(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={onConfirmDelete} disabled={deleteBusy}>
                {deleteBusy ? 'Forgetting…' : 'Forget fact'}
              </Button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}
