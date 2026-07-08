import { isLayoutField, isStubField, type FieldType, type FormField } from '@se/shared';
import { cn } from '@/lib/utils';
import { CheckboxField } from './fields/CheckboxField';
import { FIELD_COMPONENTS } from './fields';
import { fieldBoxClass, FieldShell } from './fields/shared';
import type { VisibleSection } from './useFormEngine';

/**
 * Field types whose control needs the full section width rather than sharing the
 * two-column grid with a neighbour (matches how each type already renders itself —
 * pill/chip rows, a start+end pair, or a multi-line box).
 */
const FULL_WIDTH_TYPES: ReadonlySet<FieldType> = new Set([
  'textarea',
  'daterange',
  'radio',
  'checkbox',
  'checkbox-group',
  'multi-select',
  'consent-link',
  'signature',
  'file-upload',
]);

export interface FormRendererProps {
  /** Ordered, visibility-filtered sections from `useFormEngine`. */
  sections: VisibleSection[];
  values: Record<string, unknown>;
  /** Validation errors per field key — only the first message is shown inline per the design. */
  errors: Record<string, string[]>;
  onChange: (key: string, value: unknown) => void;
  disabled?: boolean;
}

/**
 * Renders a form definition's currently-visible sections/fields in declared order
 * (core-renderer spec: "Metadata-driven rendering", "Client-side conditional
 * visibility"). Purely presentational — visibility evaluation and hidden-field
 * value clearing live in `useFormEngine`; submitting the form is Slice 8/5.4.
 */
export function FormRenderer({ sections, values, errors, onChange, disabled }: FormRendererProps) {
  return (
    <div className="flex flex-col gap-[22px]">
      {sections.map(({ key, section, fields }) => (
        <div key={key} className="flex flex-col gap-4">
          <div className="text-xs font-bold uppercase tracking-wide text-ink-400">{section.title}</div>
          <div className="grid grid-cols-2 gap-4">
            {fields.map((field) => (
              <FormFieldRenderer
                key={field.key}
                field={field}
                value={values[field.key]}
                error={errors[field.key]?.[0]}
                onChange={(value) => onChange(field.key, value)}
                disabled={disabled}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function FormFieldRenderer({
  field,
  value,
  error,
  onChange,
  disabled,
}: {
  field: FormField;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  // Layout-only types (section/group) carry no value — nothing to render here.
  if (isLayoutField(field.type)) return null;

  const className = FULL_WIDTH_TYPES.has(field.type) ? 'col-span-2' : undefined;

  // Object-storage-backed types (signature/file-upload) render as a disabled stub
  // until Phase 4 — never a live control, matching `isStubField`'s never-required contract.
  if (isStubField(field.type)) {
    return (
      <div className={className}>
        <FieldShell
          label={field.label}
          required={field.required}
          helpText={field.helpText ?? 'Available in a later release.'}
          error={error}
        >
          <div className={cn(fieldBoxClass(false, true), 'text-sm text-ink-400')}>Not yet supported</div>
        </FieldShell>
      </div>
    );
  }

  // `consent-link` is a boolean field like `checkbox` (compile.ts) with no dedicated
  // registry entry (fields/index.tsx) — reuse `CheckboxField` rather than duplicate it.
  const Component = field.type === 'consent-link' ? CheckboxField : FIELD_COMPONENTS[field.type];
  if (!Component) return null; // Unregistered type — nothing to render.

  return (
    <div className={className}>
      <Component field={field} value={value} onChange={onChange} error={error} disabled={disabled} />
    </div>
  );
}
