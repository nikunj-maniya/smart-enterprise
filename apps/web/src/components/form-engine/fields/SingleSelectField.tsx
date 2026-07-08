import { ChevronDown } from 'lucide-react';
import { asOptionList } from '@se/shared';
import { FieldShell, type FieldComponentProps } from './shared';

/** Single-choice dropdown — PRD §6.3, matches the app's existing `<select>` pattern. */
export function SingleSelectField({ field, value, onChange, error, disabled }: FieldComponentProps) {
  const id = `field-${field.key}`;
  const options = asOptionList(field.options) ?? [];
  const selected = typeof value === 'string' ? value : '';
  return (
    <FieldShell id={id} label={field.label} required={field.required} helpText={field.helpText} error={error}>
      <div className="relative flex items-center">
        <select
          id={id}
          value={selected}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={`h-11 w-full appearance-none rounded-sm border bg-surface py-0 pl-3 pr-9 text-sm outline-none disabled:opacity-50 ${
            error ? 'border-danger' : 'border-line'
          } ${selected ? 'text-ink-900' : 'text-ink-300'}`}
        >
          <option value="" disabled hidden>
            Select…
          </option>
          {options.map((o) => (
            <option key={o.value} value={o.value} className="text-ink-900">
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown size={18} className="pointer-events-none absolute right-3 text-ink-400" />
      </div>
    </FieldShell>
  );
}
