import { FieldShell, fieldBoxClass, type FieldComponentProps } from './shared';

/** Numeric input — PRD §6.3. Empty input maps to `undefined`, not `0`. */
export function NumberField({ field, value, onChange, error, disabled }: FieldComponentProps) {
  const id = `field-${field.key}`;
  const display = typeof value === 'number' ? String(value) : '';
  return (
    <FieldShell id={id} label={field.label} required={field.required} helpText={field.helpText} error={error}>
      <div className={fieldBoxClass(!!error, disabled)}>
        <input
          id={id}
          type="number"
          value={display}
          disabled={disabled}
          onChange={(e) => {
            const raw = e.target.value;
            onChange(raw === '' ? undefined : Number(raw));
          }}
          className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink-900 outline-none"
        />
      </div>
    </FieldShell>
  );
}
