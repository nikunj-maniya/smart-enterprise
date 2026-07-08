import { FieldShell, NativeInput, type FieldComponentProps } from './shared';

/** Native date picker — PRD §6.3. */
export function DateField({ field, value, onChange, error, disabled }: FieldComponentProps) {
  const id = `field-${field.key}`;
  return (
    <FieldShell id={id} label={field.label} required={field.required} helpText={field.helpText} error={error}>
      <NativeInput
        id={id}
        type="date"
        value={typeof value === 'string' ? value : ''}
        onChange={onChange}
        disabled={disabled}
        error={error}
      />
    </FieldShell>
  );
}
