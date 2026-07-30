import * as React from 'react';
import { MessageSquare, Trash2 } from 'lucide-react';
import type { SmartSearchConversationSummaryDto } from '@se/shared';
import { Button } from '@/components/ui/button';
import { Overlay } from '@/components/ui/overlay';
import { ApiError, deleteSmartSearchConversation, listSmartSearchConversations } from '@/lib/api';
import { formatRelativeTime } from '@/lib/formatRelativeTime';

/** Smart Search's "History" pane: the caller's past conversation threads, newest first. Fetches
 *  its own data on mount rather than taking rows as a prop — `SearchOverlay` mounts/unmounts this
 *  component each time the view is toggled, so re-opening it always shows current data with no
 *  separate invalidation to wire up. Selecting a row hands its id back to the caller, which loads
 *  the full thread and switches back to the chat view. */
export function SearchHistoryList({
  onSelect,
  onDeleted,
}: {
  onSelect: (conversationId: string) => void;
  onDeleted: (conversationId: string) => void;
}) {
  const [rows, setRows] = React.useState<SmartSearchConversationSummaryDto[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState<SmartSearchConversationSummaryDto | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);

  const load = React.useCallback(() => {
    setError(null);
    setRows(null);
    listSmartSearchConversations()
      .then((res) => setRows(res.rows))
      .catch(() => setError('Something went wrong. Check your connection and try again.'));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function onConfirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteSmartSearchConversation(deleting.id);
      setRows((prev) => prev?.filter((c) => c.id !== deleting.id) ?? prev);
      onDeleted(deleting.id);
      setDeleting(null);
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Unable to delete this conversation.');
    } finally {
      setDeleteBusy(false);
    }
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 px-[18px] py-8 text-center text-[13px] text-danger">
        <span>{error}</span>
        <button type="button" onClick={load} className="font-semibold text-brand-hover">
          Retry
        </button>
      </div>
    );
  }
  if (rows === null) {
    return <div className="px-[18px] py-8 text-center text-[13px] text-ink-400">Loading…</div>;
  }
  if (rows.length === 0) {
    return (
      <div className="px-[18px] py-8 text-center text-[13px] text-ink-400">
        No past conversations yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {rows.map((c) => (
        <div
          key={c.id}
          className="flex items-center gap-3 border-b border-line-soft px-[18px] py-[13px] last:border-b-0 hover:bg-surface-muted"
        >
          <button type="button" onClick={() => onSelect(c.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
            <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[8px] bg-[rgb(236,245,246)]">
              <MessageSquare size={16} className="text-brand" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-semibold text-ink-900">{c.title}</div>
              <div className="truncate text-[12px] text-ink-400">
                {formatRelativeTime(c.updatedAt)}
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => {
              setDeleting(c);
              setDeleteError(null);
            }}
            aria-label={`Delete conversation "${c.title}"`}
            className="flex-none rounded-[7px] p-[6px] text-ink-400 hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}

      {deleting && (
        <Overlay onClose={() => setDeleting(null)} z={80}>
          <div className="mx-auto w-full max-w-[440px] rounded-xl bg-surface p-[26px] shadow-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[10px] bg-danger/[0.12] text-danger">
                <Trash2 size={22} />
              </div>
              <div className="text-lg font-bold text-ink-900">Delete conversation</div>
            </div>
            <div className="mt-[14px] text-[13.5px] leading-[1.6] text-ink-500">
              Delete <strong>&quot;{deleting.title}&quot;</strong>? This can&apos;t be undone.
            </div>
            {deleteError && <div className="mt-3 text-sm font-medium text-danger">{deleteError}</div>}
            <div className="mt-[22px] flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setDeleting(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={onConfirmDelete} disabled={deleteBusy}>
                {deleteBusy ? 'Deleting…' : 'Delete'}
              </Button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}
