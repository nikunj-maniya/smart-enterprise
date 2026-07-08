import { asOptionList } from '@se/shared';
import { CheckboxGlyph, FieldShell, type FieldComponentProps } from './shared';

/**
 * Multi-choice from an option list — PRD §6.3, rendered as a checkbox list
 * (the design has no dedicated multi-select dropdown; this reuses the DS
 * `Checkbox` visual — see `CheckboxField` — one row per option).
 */
export function MultiSelectField({ field, value, onChange, error, disabled }: FieldComponentProps) {
  const options = asOptionList(field.options) ?? [];
  const selected = Array.isArray(value) ? (value as string[]) : [];

  function toggle(v: string) {
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  }

  return (
    <FieldShell label={field.label} required={field.required} helpText={field.helpText} error={error}>
      <div className="flex flex-col gap-3 rounded-md bg-app-bg p-4">
        {options.map((o) => {
          const checked = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              disabled={disabled}
              onClick={() => toggle(o.value)}
              className="flex items-center gap-[10px] text-left disabled:pointer-events-none disabled:opacity-50"
            >
              <CheckboxGlyph checked={checked} />
              <span className="text-sm text-ink-900">{o.label}</span>
            </button>
          );
        })}
      </div>
    </FieldShell>
  );
}
