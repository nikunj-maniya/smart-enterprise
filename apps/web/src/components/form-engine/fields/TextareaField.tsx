import { cn } from '@/lib/utils';
import { FieldShell, type FieldComponentProps } from './shared';

/** Multi-line text — PRD §6.3. */
export function TextareaField({ field, value, onChange, error, disabled }: FieldComponentProps) {
  const id = `field-${field.key}`;
  return (
    <FieldShell id={id} label={field.label} required={field.required} helpText={field.helpText} error={error}>
      <textarea
        id={id}
        rows={3}
        value={typeof value === 'string' ? value : ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'w-full resize-y rounded-sm border bg-surface p-3 text-sm text-ink-900 outline-none transition-colors placeholder:text-ink-300',
          error ? 'border-danger' : 'border-line focus:border-brand',
          disabled && 'opacity-50',
        )}
      />
    </FieldShell>
  );
}
