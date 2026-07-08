import * as React from 'react';
import { FolderKanban, Search } from 'lucide-react';
import { asPickerConfig, type DirectoryProjectDto } from '@se/shared';
import { searchDirectoryProjects } from '@/lib/api';
import {
  fieldBoxClass,
  FieldShell,
  PickerChip,
  PickerEmptyState,
  PickerPanel,
  PickerResultRow,
  usePickerSearch,
  usePickerSelection,
  useClickOutside,
  type FieldComponentProps,
} from './shared';

/**
 * Searchable project picker (single or multi per `pickerConfig.multi`) — PRD §6.3.
 * No role/department filters (projects aren't role-scoped like the user directory).
 */
export function ProjectPickerField({ field, value, onChange, error, disabled }: FieldComponentProps) {
  const id = `field-${field.key}`;
  const multi = asPickerConfig(field.options)?.multi ?? false;

  const { selectedIds, select, remove } = usePickerSelection(value, multi, onChange);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const containerRef = useClickOutside(() => setOpen(false), open);

  const search = React.useCallback((search: string | undefined) => searchDirectoryProjects({ search }), []);
  const { results, loading, cache } = usePickerSearch<DirectoryProjectDto>(open, query, search);

  function onSelect(project: DirectoryProjectDto) {
    select(project.id);
    if (!multi) {
      setOpen(false);
      setQuery('');
    }
  }

  const singleSelected = !multi && selectedIds[0] ? cache[selectedIds[0]] : undefined;

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
            placeholder="Search projects"
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
            {loading ? (
              <PickerEmptyState>Searching…</PickerEmptyState>
            ) : results.length === 0 ? (
              <PickerEmptyState>{query ? 'No matches found.' : 'Start typing to search projects.'}</PickerEmptyState>
            ) : (
              results.map((p) => (
                <PickerResultRow
                  key={p.id}
                  icon={<FolderKanban size={17} />}
                  title={p.name}
                  selected={selectedIds.includes(p.id)}
                  onClick={() => onSelect(p)}
                />
              ))
            )}
          </PickerPanel>
        )}
        {multi && selectedIds.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedIds.map((pid) => (
              <PickerChip key={pid} label={cache[pid]?.name ?? pid} onRemove={() => remove(pid)} />
            ))}
          </div>
        )}
      </div>
    </FieldShell>
  );
}
