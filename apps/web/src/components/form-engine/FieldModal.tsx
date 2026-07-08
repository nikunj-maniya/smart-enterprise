import * as React from 'react';
import { Check, ChevronDown, ListPlus, Plus, X } from 'lucide-react';
import { asOptionList, type FieldOptions, type FieldOption, type FieldType, type FormFieldDto } from '@se/shared';
import { Button } from '@/components/ui/button';
import { Overlay } from '@/components/ui/overlay';

/** Field types whose values come from a fixed option list (per `fieldOptionsSchema`'s array branch). */
const CHOICE_TYPES: FieldType[] = ['single-select', 'multi-select', 'radio', 'checkbox-group'];

/** §6.3 field types offered to admins building a custom form's fields — human-friendly labels over the shared engine's canonical `FieldType` enum. Layout-only (`section`/`group`) and Phase-4 stub (`signature`) types are omitted; `file-upload` stays selectable but renders as a disabled stub until object storage lands. */
export const FIELD_TYPE_OPTIONS: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'datetime', label: 'Date & time' },
  { value: 'time', label: 'Time' },
  { value: 'daterange', label: 'Date range' },
  { value: 'single-select', label: 'Dropdown' },
  { value: 'multi-select', label: 'Multi-select' },
  { value: 'radio', label: 'Radio' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'checkbox-group', label: 'Checkbox group' },
  { value: 'user-picker', label: 'User picker' },
  { value: 'project-picker', label: 'Project picker' },
  { value: 'file-upload', label: 'File upload' },
  { value: 'consent-link', label: 'Consent link' },
];

export function fieldTypeLabel(type: string): string {
  return FIELD_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

function slugifyKey(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'field';
}

function uniqueKey(base: string, existing: Set<string>): string {
  if (!existing.has(base)) return base;
  let i = 2;
  while (existing.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

/** 44×24 pill toggle — no shared Switch component exists yet in `components/ui`. */
function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 flex-none rounded-full transition-colors ${
        checked ? 'bg-brand' : 'bg-line'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${
          checked ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}

export interface FieldModalSaveInput {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: FieldOption[];
}

/** Add/Edit Field modal — label, §6.3 type select, required toggle. The parent owns persistence (it already holds the draft-save call for reorder/toggle/delete), so this component only collects input and reports it via `onSave`. */
export function FieldModal({
  mode,
  initial,
  existingKeys,
  busy = false,
  error,
  onClose,
  onSave,
}: {
  mode: 'add' | 'edit';
  initial: FormFieldDto | null;
  existingKeys: string[];
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (field: FieldModalSaveInput) => void;
}) {
  const [label, setLabel] = React.useState(initial?.label ?? '');
  const [type, setType] = React.useState<FieldType>((initial?.type as FieldType) ?? 'text');
  const [required, setRequired] = React.useState(initial?.required ?? false);
  const [options, setOptions] = React.useState<FieldOption[]>(
    () => asOptionList(initial?.options as FieldOptions | undefined)?.map((o) => ({ ...o })) ?? [],
  );
  const [localError, setLocalError] = React.useState<string | null>(null);

  const isChoiceType = CHOICE_TYPES.includes(type);

  function addOption() {
    setOptions((prev) => [...prev, { value: uniqueKey('option', new Set(prev.map((o) => o.value))), label: '' }]);
  }

  function updateOptionLabel(index: number, nextLabel: string) {
    setOptions((prev) =>
      prev.map((o, i) => {
        if (i !== index) return o;
        const derived = slugifyKey(nextLabel);
        const taken = new Set(prev.filter((_, j) => j !== i).map((p) => p.value));
        return { value: uniqueKey(derived, taken), label: nextLabel };
      }),
    );
  }

  function removeOption(index: number) {
    setOptions((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSave() {
    setLocalError(null);
    const trimmed = label.trim();
    if (!trimmed) {
      setLocalError('Field label is required.');
      return;
    }
    const cleanedOptions = options.map((o) => ({ ...o, label: o.label.trim() })).filter((o) => o.label);
    if (isChoiceType && cleanedOptions.length === 0) {
      setLocalError('Add at least one option.');
      return;
    }
    const key = initial ? initial.key : uniqueKey(slugifyKey(trimmed), new Set(existingKeys));
    onSave({ key, label: trimmed, type, required, options: isChoiceType ? cleanedOptions : undefined });
  }

  return (
    <Overlay onClose={onClose} z={60}>
      <div className="mx-auto w-full max-w-[440px] rounded-2xl bg-surface p-[26px] shadow-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[10px] bg-[rgb(236,245,246)] text-brand">
            <ListPlus size={20} />
          </div>
          <div className="text-lg font-bold text-ink-900">
            {mode === 'add' ? 'Add Field' : 'Edit Field'}
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-ink-900">Field label</span>
            <div className="flex h-11 items-center rounded-sm border border-line bg-surface px-3">
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Manager name"
                className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink-900 outline-none"
              />
            </div>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-ink-900">Field type</span>
            <div className="relative flex items-center">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as FieldType)}
                className="h-11 w-full appearance-none rounded-sm border border-line bg-surface py-0 pl-3 pr-9 text-sm text-ink-900 outline-none"
              >
                {FIELD_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} className="text-ink-900">
                    {o.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={18} className="pointer-events-none absolute right-3 text-ink-400" />
            </div>
          </label>

          {isChoiceType && (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-ink-900">Options</span>
              <div className="flex flex-col gap-2">
                {options.map((option, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <div className="flex h-10 flex-1 items-center rounded-sm border border-line bg-surface px-3">
                      <input
                        type="text"
                        value={option.label}
                        onChange={(e) => updateOptionLabel(index, e.target.value)}
                        placeholder="e.g. Approved"
                        className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink-900 outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeOption(index)}
                      aria-label="Remove option"
                      className="flex-none rounded-[6px] p-2 text-ink-400 hover:bg-danger/10 hover:text-danger"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addOption}
                className="flex items-center gap-1 self-start rounded-sm px-2 py-1 text-[13px] font-semibold text-brand hover:bg-surface-muted"
              >
                <Plus size={14} />
                Add option
              </button>
            </div>
          )}

          <div className="flex items-center justify-between py-[6px]">
            <div>
              <div className="text-[13px] font-semibold text-ink-900">Required field</div>
              <div className="text-[12px] text-ink-400">Must be filled before submitting</div>
            </div>
            <Switch checked={required} onChange={setRequired} />
          </div>
        </div>

        {(localError || error) && (
          <div className="mt-4 text-sm font-medium text-danger">{localError || error}</div>
        )}

        <div className="mt-[22px] flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={busy}>
            <Check size={16} />
            {busy ? 'Saving…' : 'Save Field'}
          </Button>
        </div>
      </div>
    </Overlay>
  );
}
