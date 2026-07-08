import * as React from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FormField } from '@se/shared';

/**
 * Uniform props every field component receives (PRD §6.3). The renderer shell
 * (Slice 8) supplies these from the definition + live form state; `value` is
 * typed `unknown` here so a single type→component registry can hold every
 * field type — each component narrows to the value shape its own type uses
 * (string / number / boolean / string[] / {start,end}).
 */
export interface FieldComponentProps {
  field: FormField;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
  disabled?: boolean;
}

/** Error (if any), else help text (if any) — shared by every field's footer line. */
export function FieldHint({ error, helpText }: { error?: string; helpText?: string }) {
  if (error) return <span className="text-xs text-danger">{error}</span>;
  if (helpText) return <span className="text-xs text-ink-400">{helpText}</span>;
  return null;
}

/** Label row + required marker + control + footer hint — the §6.3 field wrapper convention. */
export function FieldShell({
  id,
  label,
  required,
  helpText,
  error,
  children,
}: {
  id?: string;
  label: string;
  required?: boolean;
  helpText?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex w-full flex-col gap-2">
      <label htmlFor={id} className="text-sm font-semibold text-ink-900">
        {label}
        {required && ' *'}
      </label>
      {children}
      <FieldHint error={error} helpText={helpText} />
    </div>
  );
}

/** Shared 44px box chrome wrapping a native input — matches `AuthField`/org-page inputs. */
export function fieldBoxClass(hasError?: boolean, disabled?: boolean): string {
  return cn(
    'flex h-11 items-center gap-[9px] rounded-sm border bg-surface px-3 transition-colors',
    hasError ? 'border-danger' : 'border-line focus-within:border-brand',
    disabled && 'opacity-50',
  );
}

/** A single-line native input inside the shared box chrome (text/date/datetime/time). */
export function NativeInput({
  id,
  type,
  value,
  onChange,
  disabled,
  error,
  placeholder,
}: {
  id: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
  placeholder?: string;
}) {
  return (
    <div className={fieldBoxClass(!!error, disabled)}>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-300"
      />
    </div>
  );
}

/** Square checkbox glyph — matches the existing permission/head-picker checkbox visual. */
export function CheckboxGlyph({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        'flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[5px] border',
        checked ? 'border-brand bg-brand text-white' : 'border-line bg-surface',
      )}
    >
      {checked && <Check size={13} strokeWidth={3} />}
    </span>
  );
}

// ── Searchable pickers (user-picker / project-picker, PRD §6.3) ───────────
// Shared plumbing for `UserPickerField`/`ProjectPickerField`: debounced search,
// outside-click/Escape dismissal, single/multi selection bookkeeping, and the
// dropdown/result-row/chip visuals (mirrors `SearchOverlay`'s row convention).

/** Debounces a fast-changing value (e.g. a search box) — matches the app's existing 300ms search pattern. */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/** Closes an open dropdown on outside click or Escape; returns the ref to attach to its container. */
export function useClickOutside(onClose: () => void, active: boolean) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!active) return;
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [active, onClose]);
  return ref;
}

/** Normalizes a picker field's raw value to a selected-id list and gives select/remove helpers for single vs. multi mode. */
export function usePickerSelection(value: unknown, multi: boolean, onChange: (value: unknown) => void) {
  const selectedIds = multi ? (Array.isArray(value) ? (value as string[]) : []) : typeof value === 'string' && value ? [value] : [];

  function select(itemId: string) {
    if (multi) {
      if (!selectedIds.includes(itemId)) onChange([...selectedIds, itemId]);
    } else {
      onChange(itemId);
    }
  }

  function remove(itemId: string) {
    onChange(multi ? selectedIds.filter((x) => x !== itemId) : '');
  }

  return { selectedIds, select, remove };
}

/** Debounced-search + result cache for a picker's dropdown, keyed by result id (so a closed picker can still show a selected item's label). */
export function usePickerSearch<T extends { id: string }>(
  open: boolean,
  query: string,
  search: (search: string | undefined) => Promise<{ rows: T[] }>,
): { results: T[]; loading: boolean; cache: Record<string, T> } {
  const debouncedQuery = useDebouncedValue(query);
  const [results, setResults] = React.useState<T[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [cache, setCache] = React.useState<Record<string, T>>({});

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    search(debouncedQuery || undefined)
      .then((res) => {
        if (cancelled) return;
        setResults(res.rows);
        setCache((prev) => {
          const next = { ...prev };
          for (const row of res.rows) next[row.id] = row;
          return next;
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, debouncedQuery, search]);

  return { results, loading, cache };
}

/** Absolute dropdown panel anchored under a picker's trigger input. */
export function PickerPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute left-0 top-[calc(100%+4px)] z-20 max-h-[380px] w-full overflow-y-auto rounded-[14px] bg-surface shadow-xl">
      {children}
    </div>
  );
}

/** Centered placeholder copy for a picker's empty/no-results state. */
export function PickerEmptyState({ children }: { children: React.ReactNode }) {
  return <div className="px-[18px] py-9 text-center text-[13px] text-ink-400">{children}</div>;
}

/** One row in a picker's result list — icon badge + title (+ optional subtitle), matches `SearchOverlay`. */
export function PickerResultRow({
  icon,
  title,
  subtitle,
  selected,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 border-b border-line-soft px-[18px] py-[13px] text-left transition-colors last:border-b-0 hover:bg-surface-muted',
        selected && 'bg-surface-muted',
      )}
    >
      <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-lg bg-[rgb(236,245,246)] text-brand">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink-900">{title}</span>
        {subtitle && <span className="block truncate text-xs text-ink-400">{subtitle}</span>}
      </span>
      {selected && <Check size={16} className="flex-none text-brand" />}
    </button>
  );
}

/** Removable tag for a selected value in a multi-select picker. */
export function PickerChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line-soft bg-surface-muted px-2 py-1 text-xs text-ink-700">
      {label}
      <button type="button" onClick={onRemove} className="text-ink-400 hover:text-ink-700">
        <X size={12} />
      </button>
    </span>
  );
}

/** Single-select filter-toggle pills above a picker's result list (e.g. narrowing a user-picker's configured roles). */
export function PickerFilterChips({
  options,
  active,
  onChange,
}: {
  options: { value: string; label: string }[];
  active: string | null;
  onChange: (value: string | null) => void;
}) {
  if (options.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-2 border-b border-line-soft px-[18px] py-3">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={cn(
          'rounded-sm border px-3 py-1 text-[13px] font-semibold transition-colors',
          active === null ? 'border-brand bg-brand text-brand-ink' : 'border-line bg-surface text-ink-700 hover:bg-surface-muted',
        )}
      >
        All
      </button>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-sm border px-3 py-1 text-[13px] font-semibold transition-colors',
            active === o.value ? 'border-brand bg-brand text-brand-ink' : 'border-line bg-surface text-ink-700 hover:bg-surface-muted',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
