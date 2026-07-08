import { CheckboxGlyph, FieldHint, type FieldComponentProps } from './shared';

/** Single boolean toggle — PRD §6.3 (design's `Checkbox` DS component, e.g. consent/yes-no rows). */
export function CheckboxField({ field, value, onChange, error, disabled }: FieldComponentProps) {
  const checked = value === true;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="flex items-center gap-[10px] text-left disabled:pointer-events-none disabled:opacity-50"
      >
        <CheckboxGlyph checked={checked} />
        <span className="text-sm text-ink-900">
          {field.label}
          {field.required && ' *'}
        </span>
      </button>
      <FieldHint error={error} helpText={field.helpText} />
    </div>
  );
}
