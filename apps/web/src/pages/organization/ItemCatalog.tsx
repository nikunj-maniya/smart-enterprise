import * as React from 'react';
import { Archive, ArchiveRestore, Monitor, Plus, Trash2 } from 'lucide-react';
import type { ItemCatalogDto, ItemCatalogType } from '@se/shared';
import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/button';
import { Toast, useToast } from '@/components/ui/toast';
import { ApiError, createItemCatalog, deleteItemCatalog, listItemCatalog, updateItemCatalog } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { EmptyState } from '@/pages/requests/shared';

type Tab = ItemCatalogType;

const TAB_LABEL: Record<Tab, string> = { software: 'Software', hardware: 'Hardware' };

function AddItemRow({ type, onAdded }: { type: Tab; onAdded: (item: ItemCatalogDto) => void }) {
  const [name, setName] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onAdd() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const item = await createItemCatalog({ type, name: name.trim() });
      onAdded(item);
      setName('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to add this item.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-line-soft px-[22px] py-[15px]">
      <div className="flex gap-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onAdd()}
          placeholder={`New ${TAB_LABEL[type].toLowerCase()} item name`}
          className="h-9 w-64 rounded-sm border border-line bg-surface px-2 text-sm text-ink-900 outline-none focus:border-brand"
        />
        <Button variant="secondary" size="sm" onClick={onAdd} disabled={busy || !name.trim()}>
          <Plus size={14} />
          Add
        </Button>
      </div>
      {error && <div className="mt-2 text-xs font-medium text-danger">{error}</div>}
    </div>
  );
}

function ItemRow({
  item,
  onChanged,
  onDeleted,
}: {
  item: ItemCatalogDto;
  onChanged: (item: ItemCatalogDto) => void;
  onDeleted: (id: string) => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onToggleArchive() {
    setBusy(true);
    setError(null);
    try {
      onChanged(await updateItemCatalog(item.id, { archived: !item.archived }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to update this item.');
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    setBusy(true);
    setError(null);
    try {
      await deleteItemCatalog(item.id);
      onDeleted(item.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to delete this item.');
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-line-soft px-[22px] py-[15px] last:border-b-0">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-sm font-semibold text-ink-900">{item.name}</span>
          {item.archived ? (
            <span className="flex-none rounded-full bg-surface-muted px-[8px] py-[2px] text-[11px] font-semibold text-ink-400">
              Archived
            </span>
          ) : (
            <span className="flex-none rounded-full bg-[rgb(233,246,233)] px-[8px] py-[2px] text-[11px] font-semibold text-[rgb(33,131,88)]">
              Active
            </span>
          )}
          {item.referenced && <span className="flex-none text-[11px] text-ink-400">Referenced by past requests</span>}
        </div>
        <button
          className="flex flex-none items-center gap-1 rounded-[7px] p-[6px] text-ink-400 hover:bg-surface-muted"
          onClick={onToggleArchive}
          disabled={busy}
          aria-label={`${item.archived ? 'Unarchive' : 'Archive'} ${item.name}`}
          title={item.archived ? 'Unarchive' : 'Archive'}
        >
          {item.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
        </button>
        <button
          className="flex flex-none rounded-[7px] p-[6px] text-ink-400 hover:bg-danger/10 hover:text-danger"
          onClick={onDelete}
          disabled={busy}
          aria-label={`Delete ${item.name}`}
        >
          <Trash2 size={16} />
        </button>
      </div>
      {error && <div className="mt-2 text-xs font-medium text-danger">{error}</div>}
    </div>
  );
}

/** Item Catalog admin (item-catalog spec): the tenant's software + hardware picker options, shown
 * mixed from one flat list but split into Software/Hardware tabs, with add/archive/unarchive/delete. */
export default function ItemCatalog() {
  const { user } = useAuth();
  const [items, setItems] = React.useState<ItemCatalogDto[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<Tab>('software');
  const { message, show } = useToast();

  const load = React.useCallback(() => {
    setError(null);
    listItemCatalog()
      .then(setItems)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Unable to load the item catalog.'));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  function onAdded(item: ItemCatalogDto) {
    setItems((prev) => (prev ? [...prev, item] : [item]));
    show('Item added.');
  }

  function onChanged(item: ItemCatalogDto) {
    setItems((prev) => prev?.map((row) => (row.id === item.id ? item : row)) ?? prev);
    show(item.archived ? 'Item archived.' : 'Item unarchived.');
  }

  function onDeleted(id: string) {
    setItems((prev) => prev?.filter((row) => row.id !== id) ?? prev);
    show('Item deleted.');
  }

  const rows = items?.filter((i) => i.type === tab) ?? null;

  return (
    <>
      <PageHeader
        title="Item Catalog"
        subtitle="Manage the software and hardware options available when employees submit IT requests."
        breadcrumb={`Organization · ${user?.tenantName ?? ''}`}
      />

      <div className="mt-[22px] flex w-fit gap-2 rounded-[10px] border border-line-soft bg-surface p-[5px]">
        {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
            className="rounded-[7px] px-4 py-2 text-[13px] font-semibold transition-colors"
            style={
              tab === t
                ? { background: 'var(--brand)', color: 'var(--brand-ink)' }
                : { background: 'transparent', color: 'var(--ink-500)' }
            }
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {error ? (
        <div className="mt-3 text-sm font-medium text-danger">{error}</div>
      ) : (
        <div className="mt-[18px] overflow-x-auto rounded-xl border border-line-soft bg-surface shadow-card">
          <AddItemRow type={tab} onAdded={onAdded} />
          {items === null ? (
            <div className="px-4 py-12 text-center text-sm text-ink-400">Loading…</div>
          ) : rows && rows.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Monitor}
                heading={`No ${TAB_LABEL[tab].toLowerCase()} items yet`}
                message={`Add a ${TAB_LABEL[tab].toLowerCase()} item above to make it available in IT requests.`}
              />
            </div>
          ) : (
            rows?.map((item) => (
              <ItemRow key={item.id} item={item} onChanged={onChanged} onDeleted={onDeleted} />
            ))
          )}
        </div>
      )}

      <Toast message={message} />
    </>
  );
}
