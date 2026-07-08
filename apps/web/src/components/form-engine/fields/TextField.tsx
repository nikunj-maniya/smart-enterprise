import { FieldShell, NativeInput, type FieldComponentProps } from './shared';

/** Single-line text — PRD §6.3. */
export function TextField({ field, value, onChange, error, disabled }: FieldComponentProps) {
  const id = `field-${field.key}`;
  return (
    <FieldShell id={id} label={field.label} required={field.required} helpText={field.helpText} error={error}>
      <NativeInput
        id={id}
        type="text"
        value={typeof value === 'string' ? value : ''}
        onChange={onChange}
        disabled={disabled}
        error={error}
      />
    </FieldShell>
  );
}
