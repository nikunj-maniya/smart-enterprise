import type {
  FieldOptions,
  FieldType,
  FieldValidation,
  FormDefinition,
  FormDefinitionDto,
  VisibilityRule,
} from '@se/shared';

/**
 * Map a wire `FormDefinitionDto` (its `options`/`validation`/`visibilityRule` JSON
 * columns serialised as `unknown | null`) to the shared engine's `FormDefinition`,
 * where those same slots are `undefined` when absent — the shape `useFormEngine`'s
 * visibility/validation and the server's `parseDefinition` both operate on. The DTO's
 * server-only approval/status metadata is not needed for rendering and is dropped.
 */
export function definitionFromDto(dto: FormDefinitionDto): FormDefinition {
  return {
    id: dto.id,
    key: dto.key,
    title: dto.title,
    version: dto.version,
    renderer: dto.renderer,
    status: dto.status,
    sections: dto.sections.map((s) => ({
      order: s.order,
      title: s.title,
      visibilityRule: (s.visibilityRule ?? undefined) as VisibilityRule | undefined,
      fields: s.fields.map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type as FieldType,
        required: f.required,
        options: (f.options ?? undefined) as FieldOptions | undefined,
        validation: (f.validation ?? undefined) as FieldValidation | undefined,
        visibilityRule: (f.visibilityRule ?? undefined) as VisibilityRule | undefined,
      })),
    })),
  };
}
