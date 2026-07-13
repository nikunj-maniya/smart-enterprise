import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building,
  Building2,
  ClipboardCheck,
  ClipboardList,
  FolderKanban,
  Search,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { SearchResultItem, SearchResultType } from '@se/shared';
import { ApiError, globalSearch } from '@/lib/api';

const DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;

const TYPE_ICON: Record<SearchResultType, LucideIcon> = {
  request: ClipboardList,
  user: User,
  project: FolderKanban,
  department: Building,
  enterprise: Building2,
  registration: ClipboardCheck,
  'platform-user': Users,
};

/** Deep-links a result to the screen that owns it (global-search spec: "opening its detail
 *  where one exists"). Requests reuse the existing `?requestId=` drawer-open mechanism; every
 *  other type lands on its list page with `?highlight=<id>` scrolling the row into view. */
function resultPath(item: SearchResultItem): string {
  switch (item.type) {
    case 'request':
      return `/requests?requestId=${item.id}`;
    case 'user':
      return `/organization/users?highlight=${item.id}`;
    case 'project':
      return `/organization/projects?highlight=${item.id}`;
    case 'department':
      return `/organization/departments?highlight=${item.id}`;
    case 'enterprise':
      return `/enterprises?highlight=${item.id}`;
    case 'registration':
      return `/registrations?highlight=${item.id}`;
    case 'platform-user':
      return `/users?highlight=${item.id}`;
  }
}

/** Command-style search overlay (matches the design). Groups results by entity type, debounces
 *  the query, and supports arrow-key navigation + Enter to select. */
export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = React.useState('');
  const [groups, setGroups] = React.useState<{ type: SearchResultType; label: string; items: SearchResultItem[] }[]>(
    [],
  );
  const [loading, setLoading] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const flatItems = React.useMemo(() => groups.flatMap((g) => g.items), [groups]);

  React.useEffect(() => {
    if (!open) return;
    setQuery('');
    setGroups([]);
    setActiveIndex(0);
    inputRef.current?.focus();
  }, [open]);

  React.useEffect(() => {
    if (!open || query.trim().length < MIN_QUERY_LENGTH) {
      setGroups([]);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      globalSearch(query.trim())
        .then((res) => {
          setGroups(res.groups);
          setActiveIndex(0);
        })
        .catch((err) => {
          if (!(err instanceof ApiError)) throw err;
          setGroups([]);
        })
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [open, query]);

  function selectItem(item: SearchResultItem) {
    onClose();
    navigate(resultPath(item));
  }

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, flatItems.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && flatItems[activeIndex]) {
        e.preventDefault();
        selectItem(flatItems[activeIndex]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, flatItems, activeIndex, selectItem]);

  if (!open) return null;

  const trimmed = query.trim();
  const showEmpty = trimmed.length < MIN_QUERY_LENGTH;
  const showNoResults = !showEmpty && !loading && flatItems.length === 0;

  let rowIndex = -1;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center px-6 pb-6 pt-[90px]"
      style={{ background: 'rgba(10,20,20,.5)', animation: 'seFade .15s ease' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] overflow-hidden rounded-[14px] bg-surface shadow-xl"
        style={{ animation: 'seUp .2s ease' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-[11px] border-b border-line-soft px-[18px] py-4">
          <Search size={20} className="text-ink-400" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search enterprises, users…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-0 flex-1 border-none bg-transparent text-base text-ink-900 outline-none"
          />
          <span
            className="cursor-pointer rounded-md border border-line px-[7px] py-[3px] text-[11px] font-semibold text-ink-400"
            onClick={onClose}
          >
            Esc
          </span>
        </div>
        <div className="max-h-[380px] overflow-y-auto">
          {showEmpty && (
            <div className="px-[18px] py-8 text-center text-[13px] text-ink-400">
              Start typing to search across enterprises, users…
            </div>
          )}
          {showNoResults && (
            <div className="px-[18px] py-8 text-center text-[13px] text-ink-400">No matches found.</div>
          )}
          {groups.map((group) => (
            <div key={group.type}>
              <div className="px-[18px] pt-3 pb-1 text-[11px] font-semibold uppercase tracking-[.4px] text-ink-400">
                {group.label}
              </div>
              {group.items.map((item) => {
                rowIndex += 1;
                const isActive = rowIndex === activeIndex;
                const Icon = TYPE_ICON[item.type];
                return (
                  <div
                    key={`${item.type}-${item.id}`}
                    onClick={() => selectItem(item)}
                    onMouseEnter={() => setActiveIndex(rowIndex)}
                    className="flex cursor-pointer items-center gap-3 px-[18px] py-[13px] border-b border-line-soft last:border-b-0"
                    style={{ background: isActive ? 'var(--surface-muted)' : undefined }}
                  >
                    <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[8px] bg-[rgb(236,245,246)]">
                      <Icon size={17} className="text-brand" />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-semibold text-ink-900">{item.title}</div>
                      {item.subtitle && <div className="text-[12px] text-ink-400">{item.subtitle}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
