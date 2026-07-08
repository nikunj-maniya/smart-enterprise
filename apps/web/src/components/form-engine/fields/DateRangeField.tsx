import { FieldShell, NativeInput, type FieldComponentProps } from './shared';

interface DateRangeValue {
  start?: string;
  end?: string;
}

function asRange(value: unknown): DateRangeValue {
  return value && typeof value === 'object' ? (value as DateRangeValue) : {};
}

/** Two date inputs side by side — PRD §6.3; no dedicated range-picker exists in the design. */
export function DateRangeField({ field, value, onChange, error, disabled }: FieldComponentProps) {
  const { start = '', end = '' } = asRange(value);
  const idBase = `field-${field.key}`;
  return (
    <FieldShell label={field.label} required={field.required} helpText={field.helpText} error={error}>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor={`${idBase}-start`} className="text-xs font-semibold text-ink-700">
            Start date
          </label>
          <NativeInput
            id={`${idBase}-start`}
            type="date"
            value={start}
            disabled={disabled}
            error={error}
            onChange={(v) => onChange({ start: v, end })}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={`${idBase}-end`} className="text-xs font-semibold text-ink-700">
            End date
          </label>
          <NativeInput
            id={`${idBase}-end`}
            type="date"
            value={end}
            disabled={disabled}
            error={error}
            onChange={(v) => onChange({ start, end: v })}
          />
        </div>
      </div>
    </FieldShell>
  );
}
