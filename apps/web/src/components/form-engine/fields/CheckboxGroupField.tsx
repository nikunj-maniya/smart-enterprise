import { asOptionList } from '@se/shared';
import { cn } from '@/lib/utils';
import { FieldShell, type FieldComponentProps } from './shared';

/** Multi-choice chip row — PRD §6.3 (design's "multi-select" chip pattern, not native checkboxes). */
export function CheckboxGroupField({ field, value, onChange, error, disabled }: FieldComponentProps) {
  const options = asOptionList(field.options) ?? [];
  const selected = Array.isArray(value) ? (value as string[]) : [];

  function toggle(v: string) {
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  }

  return (
    <FieldShell label={field.label} required={field.required} helpText={field.helpText} error={error}>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              disabled={disabled}
              onClick={() => toggle(o.value)}
              className={cn(
                'rounded-sm border px-[13px] py-2 text-[13px] font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50',
                active
                  ? 'border-brand bg-[rgb(236,245,246)] text-brand'
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
