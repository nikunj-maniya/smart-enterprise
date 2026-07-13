import * as React from 'react';
import { FieldShell, fieldBoxClass, PickerChip, type FieldComponentProps } from './shared';

/** Specific half-day dates within a leave/WFH range (reporting-and-polish: upgrades the v1
 *  count-only field) — an "Add" date input plus removable chips, one per selected date. Each
 *  date's in-range check is server-side (and re-validated), not enforced by this picker. */
export function DateMultiField({ field, value, onChange, error, disabled }: FieldComponentProps) {
  const id = `field-${field.key}`;
  const dates = Array.isArray(value) ? (value as string[]) : [];
  const [pending, setPending] = React.useState('');

  function addDate() {
    if (!pending || dates.includes(pending)) return;
    onChange([...dates, pending].sort());
    setPending('');
  }

  function removeDate(date: string) {
    onChange(dates.filter((d) => d !== date));
  }

  return (
    <FieldShell id={id} label={field.label} required={field.required} helpText={field.helpText} error={error}>
      <div className="flex flex-col gap-2">
        <div className={fieldBoxClass(!!error, disabled)}>
          <input
            id={id}
            type="date"
            value={pending}
            disabled={disabled}
            onChange={(e) => setPending(e.target.value)}
            className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink-900 outline-none"
          />
          <button
            type="button"
            onClick={addDate}
            disabled={disabled || !pending}
            className="flex-none text-xs font-semibold text-brand-hover disabled:opacity-50"
          >
            Add
          </button>
        </div>
        {dates.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {dates.map((d) => (
              <PickerChip key={d} label={d} onRemove={() => removeDate(d)} />
            ))}
          </div>
        )}
      </div>
    </FieldShell>
  );
}
