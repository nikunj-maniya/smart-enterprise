import { asOptionList } from '@se/shared';
import { cn } from '@/lib/utils';
import { FieldShell, type FieldComponentProps } from './shared';

/** Single-choice pill row — PRD §6.3 (design's "single-select" pill pattern, not native radios). */
export function RadioField({ field, value, onChange, error, disabled }: FieldComponentProps) {
  const options = asOptionList(field.options) ?? [];
  const selected = typeof value === 'string' ? value : undefined;

  return (
    <FieldShell label={field.label} required={field.required} helpText={field.helpText} error={error}>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = o.value === selected;
          return (
            <button
              key={o.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(o.value)}
              className={cn(
                'rounded-sm border px-4 py-[9px] text-[13px] font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50',
                active
                  ? 'border-brand bg-brand text-brand-ink'
                  : 'border-line bg-surface text-ink-700 hover:bg-surface-muted',
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </FieldShell>
  );
}
