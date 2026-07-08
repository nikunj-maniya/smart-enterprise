import * as React from 'react';
import { Search, User as UserIcon } from 'lucide-react';
import { asPickerConfig, SYSTEM_ROLE_NAMES, type DirectoryUserDto, type SystemRoleKey } from '@se/shared';
import { searchDirectoryUsers } from '@/lib/api';
import {
  fieldBoxClass,
  FieldShell,
  PickerChip,
  PickerEmptyState,
  PickerFilterChips,
  PickerPanel,
  PickerResultRow,
  usePickerSearch,
  usePickerSelection,
  useClickOutside,
  type FieldComponentProps,
} from './shared';

/** Stable empty-array reference so an unfiltered picker doesn't re-run its search effect every render. */
const NO_ROLES: string[] = [];

/**
 * Searchable employee-directory picker (single or multi per `pickerConfig.multi`) — PRD §6.3.
 * `pickerConfig.roles`/`.departments` scope the directory search; when a field configures more
 * than one role, they're also offered as narrowing filter chips above the result list.
 *
 * Note: `pickerConfig.source` (e.g. "project-tech-leads") isn't resolvable by the directory API
 * yet — it has no notion of "this project's tech leads", only role/department filters — so such
 * fields fall back to an unscoped active-user search until that resolution lands server-side.
 */
export function UserPickerField({ field, value, onChange, error, disabled }: FieldComponentProps) {
  const id = `field-${field.key}`;
  const config = asPickerConfig(field.options);
  const multi = config?.multi ?? false;
  const configuredRoles = config?.roles ?? NO_ROLES;

  const { selectedIds, select, remove } = usePickerSelection(value, multi, onChange);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [roleFilter, setRoleFilter] = React.useState<string | null>(null);
  const containerRef = useClickOutside(() => setOpen(false), open);

  const search = React.useCallback(
    (search: string | undefined) =>
      searchDirectoryUsers({
        search,
        roles: roleFilter ? [roleFilter] : configuredRoles.length > 0 ? configuredRoles : undefined,
        departments: config?.departments,
      }),
    [roleFilter, configuredRoles, config?.departments],
  );
  const { results, loading, cache } = usePickerSearch<DirectoryUserDto>(open, query, search);

  function onSelect(user: DirectoryUserDto) {
    select(user.id);
    if (!multi) {
      setOpen(false);
      setQuery('');
    }
  }

  const singleSelected = !multi && selectedIds[0] ? cache[selectedIds[0]] : undefined;
  const roleOptions = configuredRoles.map((r) => ({
    value: r,
    label: SYSTEM_ROLE_NAMES[r as SystemRoleKey] ?? r,
  }));

  return (
    <FieldShell id={id} label={field.label} required={field.required} helpText={field.helpText} error={error}>
      <div ref={containerRef} className="relative flex flex-col gap-2">
        <div className={fieldBoxClass(!!error, disabled)}>
          <Search size={18} className="flex-none text-ink-300" />
          <input
            id={id}
            type="text"
            disabled={disabled}
            value={open ? query : (singleSelected?.name ?? '')}
            placeholder="Search employee directory"
            onFocus={() => {
              setOpen(true);
              setQuery('');
            }}
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-300"
          />
        </div>
        {open && (
          <PickerPanel>
            <PickerFilterChips options={roleOptions} active={roleFilter} onChange={setRoleFilter} />
            {loading ? (
              <PickerEmptyState>Searching…</PickerEmptyState>
            ) : results.length === 0 ? (
              <PickerEmptyState>
                {query ? 'No matches found.' : 'Start typing to search the employee directory.'}
              </PickerEmptyState>
            ) : (
              results.map((u) => (
                <PickerResultRow
                  key={u.id}
                  icon={<UserIcon size={17} />}
                  title={u.name}
                  subtitle={u.email}
                  selected={selectedIds.includes(u.id)}
                  onClick={() => onSelect(u)}
                />
              ))
            )}
          </PickerPanel>
        )}
        {multi && selectedIds.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedIds.map((uid) => (
              <PickerChip key={uid} label={cache[uid]?.name ?? uid} onRemove={() => remove(uid)} />
            ))}
          </div>
        )}
      </div>
    </FieldShell>
  );
}
