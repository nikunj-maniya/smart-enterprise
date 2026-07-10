import * as React from 'react';
import { Check, ChevronDown, ListPlus, Plus, X } from 'lucide-react';
import {
  asOptionList,
  asPickerConfig,
  isPickerFieldType,
  visibilityRuleSchema,
  RULE_GRAMMAR_VERSION,
  SYSTEM_ROLE_KEYS,
  SYSTEM_ROLE_NAMES,
  type FieldOptions,
  type FieldOption,
  type FieldType,
  type FormFieldDto,
  type PickerConfig,
  type RuleLeaf,
  type RuleNode,
  type RuleOp,
  type VisibilityRule,
} from '@se/shared';
import { Button } from '@/components/ui/button';
import { Overlay } from '@/components/ui/overlay';
import { CheckboxGlyph } from '@/components/form-engine/fields/shared';

/** Field types whose values come from a fixed option list (per `fieldOptionsSchema`'s array branch). */
const CHOICE_TYPES: FieldType[] = ['single-select', 'multi-select', 'radio', 'checkbox-group'];

/** §6.3 field types offered to admins building a custom form's fields — human-friendly labels over the shared engine's canonical `FieldType` enum. Layout-only (`section`/`group`) and Phase-4 stub (`signature`) types are omitted; `file-upload` stays selectable but renders as a disabled stub until object storage lands. */
export const FIELD_TYPE_OPTIONS: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'datetime', label: 'Date & time' },
  { value: 'time', label: 'Time' },
  { value: 'daterange', label: 'Date range' },
  { value: 'single-select', label: 'Dropdown' },
  { value: 'multi-select', label: 'Multi-select' },
  { value: 'radio', label: 'Radio' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'checkbox-group', label: 'Checkbox group' },
  { value: 'user-picker', label: 'User picker' },
  { value: 'project-picker', label: 'Project picker' },
  { value: 'file-upload', label: 'File upload' },
  { value: 'consent-link', label: 'Consent link' },
];

export function fieldTypeLabel(type: string): string {
  return FIELD_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

/** Human-friendly labels over `ruleOp` (`rules.ts`) for the condition row's operator select.
 * Exported for reuse by `RoutingEditor`'s per-stage visibility-gate row, which edits the same
 * `VisibilityRule` grammar via a single-row instance of this editor. */
export const RULE_OP_OPTIONS: { value: RuleOp; label: string }[] = [
  { value: 'eq', label: 'is' },
  { value: 'neq', label: 'is not' },
  { value: 'gt', label: 'greater than' },
  { value: 'gte', label: 'greater than or equal to' },
  { value: 'lt', label: 'less than' },
  { value: 'lte', label: 'less than or equal to' },
  { value: 'in', label: 'is one of' },
  { value: 'nin', label: 'is not one of' },
  { value: 'empty', label: 'is empty' },
  { value: 'notEmpty', label: 'is not empty' },
];
export const RULE_OPS_WITHOUT_VALUE: RuleOp[] = ['empty', 'notEmpty'];
export const RULE_OPS_WITH_LIST_VALUE: RuleOp[] = ['in', 'nin'];

/** One editable "show when" row, mapped to/from a `RuleLeaf` (`{ field, op, value }`). `value` is
 * always edited as text; list-valued ops (`in`/`nin`) split it on commas at save time. */
export interface RuleRow {
  field: string;
  op: RuleOp;
  value: string;
}

function leafToRow(leaf: RuleLeaf): RuleRow {
  return {
    field: leaf.field,
    op: leaf.op,
    value: Array.isArray(leaf.value) ? leaf.value.join(', ') : leaf.value == null ? '' : String(leaf.value),
  };
}

/** Load a stored rule into flat rows. Only a single leaf or a top-level AND of leaves round-trips
 * through this editor (the MVP intentionally supports a flat AND-list, not nested and/or — see
 * design notes); anything else parses to no rows. Exported for `RoutingEditor`'s single-row gate. */
export function rowsFromRule(rule: unknown): RuleRow[] {
  const parsed = visibilityRuleSchema.safeParse(rule);
  if (!parsed.success) return [];
  const node = parsed.data.when;
  if ('and' in node) {
    return node.and.filter((n): n is RuleLeaf => !('and' in n) && !('or' in n)).map(leafToRow);
  }
  if ('or' in node) return [];
  return [leafToRow(node)];
}

/** Whether `rowsFromRule` can represent `node` without silently dropping any part of it — true for
 * a single leaf or a flat AND of leaves, false for `or` or any AND containing a nested and/or. Used
 * to avoid ever saving a lossy edit of a rule this editor can't fully display (see `preservedRule`). */
function isRuleFullyRepresentable(node: RuleNode): boolean {
  if ('or' in node) return false;
  if ('and' in node) return node.and.every((n) => !('and' in n) && !('or' in n));
  return true;
}

/** Initial row value for a newly-picked referenced field. The checkbox value control is a
 * "Checked"/"Unchecked" select (always one of `'true'`/`'false'`, never empty) — its default
 * must match what it renders, otherwise the row's real value silently stays empty until the
 * admin touches the control, and an untouched row gets dropped as incomplete on save. */
export function defaultRuleValue(fieldType: FieldType | undefined): string {
  return fieldType === 'checkbox' ? 'false' : '';
}

/** Coerce a row's text-entered value to the referenced field's actual runtime type, so
 * `evaluateLeaf`'s strict `===`/`!==` (rules.ts) can ever match. The renderer stores checkbox
 * values as JS booleans and number-field values as JS numbers — a string 'true' or '5' never
 * equals those. */
function coerceLeafValue(fieldType: FieldType | undefined, raw: string): unknown {
  if (fieldType === 'checkbox') return raw === 'true';
  if (fieldType === 'number') {
    const parsed = Number(raw);
    return Number.isNaN(parsed) ? raw : parsed;
  }
  return raw;
}

/** Serialize rows back into the wire `VisibilityRule` grammar, dropping incomplete rows
 * (no field chosen, or a still-empty value for an op that needs one). `fieldTypes` maps each
 * referenceable field's key to its `FieldType` so values can be coerced to match. */
export function buildVisibilityRule(
  rows: RuleRow[],
  fieldTypes: Map<string, FieldType>,
): VisibilityRule | undefined {
  const leaves: RuleLeaf[] = [];
  for (const row of rows) {
    if (!row.field) continue;
    const fieldType = fieldTypes.get(row.field);
    if (RULE_OPS_WITHOUT_VALUE.includes(row.op)) {
      leaves.push({ field: row.field, op: row.op });
      continue;
    }
    if (RULE_OPS_WITH_LIST_VALUE.includes(row.op)) {
      const value = row.value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
        .map((v) => coerceLeafValue(fieldType, v));
      if (value.length === 0) continue;
      leaves.push({ field: row.field, op: row.op, value });
      continue;
    }
    const raw = row.value.trim();
    if (!raw) continue;
    leaves.push({ field: row.field, op: row.op, value: coerceLeafValue(fieldType, raw) });
  }
  if (leaves.length === 0) return undefined;
  return { v: RULE_GRAMMAR_VERSION, when: leaves.length === 1 ? leaves[0] : { and: leaves } };
}

/** First reason a row can't be saved as-is: missing a value an op needs, or (for `in`/`nin`) no
 * usable comma-separated values. `null` means every row is complete. */
export function ruleRowError(rows: RuleRow[]): string | null {
  for (const row of rows) {
    if (RULE_OPS_WITHOUT_VALUE.includes(row.op)) continue;
    if (RULE_OPS_WITH_LIST_VALUE.includes(row.op)) {
      const hasValue = row.value.split(',').some((v) => v.trim());
      if (!hasValue) return 'Add at least one value for an "is one of" / "is not one of" condition, or remove it.';
      continue;
    }
    if (!row.value.trim()) return 'Every visibility condition needs a value, or remove the condition.';
  }
  return null;
}

function slugifyKey(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'field';
}

function uniqueKey(base: string, existing: Set<string>): string {
  if (!existing.has(base)) return base;
  let i = 2;
  while (existing.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

/** A condition row's value control — a free-text/number/date input, a Checked/Unchecked select
 * when the referenced field is a checkbox, or nothing for value-less ops (`empty`/`notEmpty`).
 * Exported so `RoutingEditor`'s per-stage visibility-gate row renders the same value control
 * (and stays in sync with `RULE_OP_OPTIONS`/type coercion) without duplicating this logic. */
export function RuleValueCell({
  value,
  op,
  refType,
  onChange,
  ariaLabel,
  disabled,
}: {
  value: string;
  op: RuleOp;
  refType: FieldType | undefined;
  onChange: (value: string) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  if (RULE_OPS_WITHOUT_VALUE.includes(op)) return null;
  const isListOp = RULE_OPS_WITH_LIST_VALUE.includes(op);
  const dateInputType =
    refType === 'date' ? 'date' : refType === 'datetime' ? 'datetime-local' : refType === 'time' ? 'time' : null;

  if (refType === 'checkbox' && !isListOp) {
    return (
      <div className="relative flex h-10 flex-1 items-center rounded-sm border border-line bg-surface">
        <select
          value={value === 'true' ? 'true' : 'false'}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          aria-label={ariaLabel}
          className="h-full w-full appearance-none border-none bg-transparent pl-3 pr-7 text-sm text-ink-900 outline-none disabled:opacity-60"
        >
          <option value="true">Checked</option>
          <option value="false">Unchecked</option>
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-2 text-ink-400" />
      </div>
    );
  }

  return (
    <div className="flex h-10 flex-1 items-center rounded-sm border border-line bg-surface px-3">
      <input
        type={dateInputType && !isListOp ? dateInputType : refType === 'number' && !isListOp ? 'number' : 'text'}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder={isListOp ? 'value1, value2' : 'Value'}
        aria-label={ariaLabel}
        className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink-900 outline-none disabled:opacity-60"
      />
    </div>
  );
}

/** 44×24 pill toggle — no shared Switch component exists yet in `components/ui`. */
function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 flex-none rounded-full transition-colors ${
        checked ? 'bg-brand' : 'bg-line'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${
          checked ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}

export interface FieldModalSaveInput {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: FieldOptions;
  visibilityRule?: VisibilityRule;
}

/** Merge the role-restriction checkboxes into the field's existing picker config (preserving
 * any `multi`/`departments`/`source` set outside this modal), dropping `roles` when empty
 * (unrestricted). `undefined` when the merged config would carry no properties at all. */
function buildPickerOptions(existing: FieldOptions | undefined, roles: string[]): PickerConfig | undefined {
  const config = asPickerConfig(existing) ?? {};
  const next: PickerConfig = { ...config, roles: roles.length > 0 ? roles : undefined };
  return next.multi === undefined && next.roles === undefined && next.departments === undefined && next.source === undefined
    ? undefined
    : next;
}

/** Add/Edit Field modal — label, §6.3 type select, required toggle, and a "show when" visibility-rule
 * editor referencing other fields on the form. The parent owns persistence (it already holds the
 * draft-save call for reorder/toggle/delete), so this component only collects input and reports it
 * via `onSave`. */
export function FieldModal({
  mode,
  initial,
  existingKeys,
  otherFields,
  usedAsStage = false,
  isCoreForm = false,
  busy = false,
  error,
  onClose,
  onSave,
}: {
  mode: 'add' | 'edit';
  initial: FormFieldDto | null;
  existingKeys: string[];
  /** Other fields on this form a visibility rule can reference (excludes the field being edited).
   * `type` drives value coercion/UI so a condition's value matches the referenced field's runtime type. */
  otherFields: { key: string; label: string; type: FieldType }[];
  /** True when this field is named as an approver-stage field in the draft's Routing config —
   * changing its type away from a picker type would leave that stage with a dangling reference
   * (mirrors `FormBuilder`'s delete-guard), so the type select is locked while this is true. */
  usedAsStage?: boolean;
  /** True when editing a core-form draft — field type is a structural property the server refuses
   * to change on core forms, so the type select is locked regardless of `usedAsStage`. */
  isCoreForm?: boolean;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (field: FieldModalSaveInput) => void;
}) {
  const [label, setLabel] = React.useState(initial?.label ?? '');
  const [type, setType] = React.useState<FieldType>((initial?.type as FieldType) ?? 'text');
  const [required, setRequired] = React.useState(initial?.required ?? false);
  const [options, setOptions] = React.useState<FieldOption[]>(
    () => asOptionList(initial?.options as FieldOptions | undefined)?.map((o) => ({ ...o })) ?? [],
  );
  const [pickerRoles, setPickerRoles] = React.useState<string[]>(
    () => asPickerConfig(initial?.options as FieldOptions | undefined)?.roles ?? [],
  );
  const [ruleRows, setRuleRows] = React.useState<RuleRow[]>(() => rowsFromRule(initial?.visibilityRule));
  const [ruleTouched, setRuleTouched] = React.useState(false);
  /** The field's stored rule, kept verbatim when it has an `or`/nested shape this editor can't fully
   * display (e.g. `{or:[...]}` or a mixed AND) — until the admin explicitly edits the Visibility
   * section, `handleSave` sends this back unchanged instead of the (lossy) rows-derived rule. */
  const [preservedRule] = React.useState<VisibilityRule | undefined>(() => {
    const parsed = visibilityRuleSchema.safeParse(initial?.visibilityRule);
    return parsed.success && !isRuleFullyRepresentable(parsed.data.when) ? parsed.data : undefined;
  });
  const [localError, setLocalError] = React.useState<string | null>(null);

  const isChoiceType = CHOICE_TYPES.includes(type);
  const isPickerType = isPickerFieldType(type);

  function toggleRole(role: string) {
    setPickerRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  }

  function addOption() {
    setOptions((prev) => [...prev, { value: uniqueKey('option', new Set(prev.map((o) => o.value))), label: '' }]);
  }

  function updateOptionLabel(index: number, nextLabel: string) {
    setOptions((prev) =>
      prev.map((o, i) => {
        if (i !== index) return o;
        const derived = slugifyKey(nextLabel);
        const taken = new Set(prev.filter((_, j) => j !== i).map((p) => p.value));
        return { value: uniqueKey(derived, taken), label: nextLabel };
      }),
    );
  }

  function removeOption(index: number) {
    setOptions((prev) => prev.filter((_, i) => i !== index));
  }

  function addRuleRow() {
    const first = otherFields[0];
    setRuleTouched(true);
    setRuleRows((prev) => [...prev, { field: first?.key ?? '', op: 'eq', value: defaultRuleValue(first?.type) }]);
  }

  function updateRuleRow(index: number, patch: Partial<RuleRow>) {
    setRuleTouched(true);
    setRuleRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function removeRuleRow(index: number) {
    setRuleTouched(true);
    setRuleRows((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSave() {
    setLocalError(null);
    const trimmed = label.trim();
    if (!trimmed) {
      setLocalError('Field label is required.');
      return;
    }
    const cleanedOptions = options.map((o) => ({ ...o, label: o.label.trim() })).filter((o) => o.label);
    if (isChoiceType && cleanedOptions.length === 0) {
      setLocalError('Add at least one option.');
      return;
    }
    const usingRows = !(preservedRule && !ruleTouched);
    if (usingRows) {
      const rowError = ruleRowError(ruleRows);
      if (rowError) {
        setLocalError(rowError);
        return;
      }
    }
    const key = initial ? initial.key : uniqueKey(slugifyKey(trimmed), new Set(existingKeys));
    const fieldTypes = new Map(otherFields.map((f) => [f.key, f.type]));
    // If the stored rule has an `or`/nested shape this editor can't fully display, keep it verbatim
    // until the admin explicitly edits the Visibility section — otherwise saving (e.g. just to fix
    // the label) would silently replace it with whatever the (necessarily incomplete) rows produce.
    const visibilityRule = usingRows ? buildVisibilityRule(ruleRows, fieldTypes) : preservedRule;
    onSave({
      key,
      label: trimmed,
      type,
      required,
      options: isChoiceType
        ? cleanedOptions
        : isPickerType
          ? buildPickerOptions(initial?.options as FieldOptions | undefined, pickerRoles)
          : undefined,
      visibilityRule,
    });
  }

  return (
    <Overlay onClose={onClose} z={60}>
      <div className="mx-auto w-full max-w-[440px] rounded-2xl bg-surface p-[26px] shadow-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[10px] bg-[rgb(236,245,246)] text-brand">
            <ListPlus size={20} />
          </div>
          <div className="text-lg font-bold text-ink-900">
            {mode === 'add' ? 'Add Field' : 'Edit Field'}
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-ink-900">Field label</span>
            <div className="flex h-11 items-center rounded-sm border border-line bg-surface px-3">
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Manager name"
                className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink-900 outline-none"
              />
            </div>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-ink-900">Field type</span>
            <div className="relative flex items-center">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as FieldType)}
                disabled={usedAsStage || isCoreForm}
                title={
                  usedAsStage
                    ? 'Used as an approver stage in Routing — remove that stage first'
                    : isCoreForm
                      ? "Core form fields can't change type — relabel, reorder, or edit validation instead."
                      : undefined
                }
                className="h-11 w-full appearance-none rounded-sm border border-line bg-surface py-0 pl-3 pr-9 text-sm text-ink-900 outline-none disabled:cursor-default disabled:opacity-60"
              >
                {FIELD_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} className="text-ink-900">
                    {o.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={18} className="pointer-events-none absolute right-3 text-ink-400" />
            </div>
            {usedAsStage && (
              <div className="text-[12px] text-ink-400">
                Used as an approver stage in Routing — remove that stage first to change the type.
              </div>
            )}
            {!usedAsStage && isCoreForm && (
              <div className="text-[12px] text-ink-400">
                Core form fields can't change type — relabel, reorder, or edit validation instead.
              </div>
            )}
          </label>

          {isChoiceType && (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-ink-900">Options</span>
              <div className="flex flex-col gap-2">
                {options.map((option, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <div className="flex h-10 flex-1 items-center rounded-sm border border-line bg-surface px-3">
                      <input
                        type="text"
                        value={option.label}
                        onChange={(e) => updateOptionLabel(index, e.target.value)}
                        placeholder="e.g. Approved"
                        className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink-900 outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeOption(index)}
                      aria-label="Remove option"
                      className="flex-none rounded-[6px] p-2 text-ink-400 hover:bg-danger/10 hover:text-danger"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addOption}
                className="flex items-center gap-1 self-start rounded-sm px-2 py-1 text-[13px] font-semibold text-brand hover:bg-surface-muted"
              >
                <Plus size={14} />
                Add option
              </button>
            </div>
          )}

          {isPickerType && (
            <div className="flex flex-col gap-2">
              <div>
                <div className="text-sm font-semibold text-ink-900">Restrict to roles</div>
                <div className="text-[12px] text-ink-400">
                  Only users in the selected roles can be picked. Leave empty to allow anyone — this also names the
                  role for any approver stage that routes to this field.
                </div>
              </div>
              <div className="flex flex-col gap-2">
                {SYSTEM_ROLE_KEYS.map((roleKey) => (
                  <button
                    key={roleKey}
                    type="button"
                    onClick={() => toggleRole(roleKey)}
                    className="flex items-center gap-2 text-left"
                  >
                    <CheckboxGlyph checked={pickerRoles.includes(roleKey)} />
                    <span className="text-sm text-ink-900">{SYSTEM_ROLE_NAMES[roleKey]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <div>
              <div className="text-sm font-semibold text-ink-900">Visibility</div>
              <div className="text-[12px] text-ink-400">
                Show this field only when every condition below is met. Leave empty to always show it.
              </div>
            </div>
            {preservedRule && (
              <div
                className="rounded-sm px-3 py-2 text-[12px] font-medium"
                style={{ background: 'rgb(255,247,237)', color: 'rgb(204,78,0)' }}
              >
                This field has an advanced condition (OR logic or nested groups) that can't be shown here. It's
                kept as-is unless you add or remove a condition below, which will replace it.
              </div>
            )}
            {otherFields.length === 0 ? (
              <div className="text-[12px] text-ink-400">
                Add another field to this form to set a visibility condition.
              </div>
            ) : (
              <>
                {ruleRows.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {ruleRows.map((row, index) => {
                      const refType = otherFields.find((f) => f.key === row.field)?.type;
                      return (
                        <div key={index} className="flex items-center gap-2">
                          <div className="relative flex h-10 flex-1 items-center rounded-sm border border-line bg-surface">
                            <select
                              value={row.field}
                              onChange={(e) => {
                                const nextField = e.target.value;
                                const nextType = otherFields.find((f) => f.key === nextField)?.type;
                                updateRuleRow(index, { field: nextField, value: defaultRuleValue(nextType) });
                              }}
                              aria-label={`Field for condition ${index + 1}`}
                              className="h-full w-full appearance-none border-none bg-transparent pl-3 pr-7 text-sm text-ink-900 outline-none"
                            >
                              {otherFields.map((f) => (
                                <option key={f.key} value={f.key} className="text-ink-900">
                                  {f.label}
                                </option>
                              ))}
                            </select>
                            <ChevronDown size={14} className="pointer-events-none absolute right-2 text-ink-400" />
                          </div>
                          <div className="relative flex h-10 flex-1 items-center rounded-sm border border-line bg-surface">
                            <select
                              value={row.op}
                              onChange={(e) => updateRuleRow(index, { op: e.target.value as RuleOp })}
                              aria-label={`Operator for condition ${index + 1}`}
                              className="h-full w-full appearance-none border-none bg-transparent pl-3 pr-7 text-sm text-ink-900 outline-none"
                            >
                              {RULE_OP_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value} className="text-ink-900">
                                  {o.label}
                                </option>
                              ))}
                            </select>
                            <ChevronDown size={14} className="pointer-events-none absolute right-2 text-ink-400" />
                          </div>
                          <RuleValueCell
                            value={row.value}
                            op={row.op}
                            refType={refType}
                            onChange={(value) => updateRuleRow(index, { value })}
                            ariaLabel={`Value for condition ${index + 1}`}
                          />
                          <button
                            type="button"
                            onClick={() => removeRuleRow(index)}
                            aria-label="Remove condition"
                            className="flex-none rounded-[6px] p-2 text-ink-400 hover:bg-danger/10 hover:text-danger"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <button
                  type="button"
                  onClick={addRuleRow}
                  className="flex items-center gap-1 self-start rounded-sm px-2 py-1 text-[13px] font-semibold text-brand hover:bg-surface-muted"
                >
                  <Plus size={14} />
                  Add condition
                </button>
              </>
            )}
          </div>

          <div className="flex items-center justify-between py-[6px]">
            <div>
              <div className="text-[13px] font-semibold text-ink-900">Required field</div>
              <div className="text-[12px] text-ink-400">Must be filled before submitting</div>
            </div>
            <Switch checked={required} onChange={setRequired} />
          </div>
        </div>

        {(localError || error) && (
          <div className="mt-4 text-sm font-medium text-danger">{localError || error}</div>
        )}

        <div className="mt-[22px] flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={busy}>
            <Check size={16} />
            {busy ? 'Saving…' : 'Save Field'}
          </Button>
        </div>
      </div>
    </Overlay>
  );
}
