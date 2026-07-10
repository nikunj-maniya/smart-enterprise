import * as React from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';
import { isPickerFieldType, type ApproverRule, type FieldType, type FormFieldDto, type RuleOp, type StageRules } from '@se/shared';
import {
  buildVisibilityRule,
  defaultRuleValue,
  rowsFromRule,
  ruleRowError,
  RuleValueCell,
  RULE_OP_OPTIONS,
  type RuleRow,
} from './FieldModal';
import { Button } from '@/components/ui/button';

/** One approver stage being edited: the user-picker/project-picker field it routes to, plus an
 * optional single-condition visibility gate (0 or 1 `RuleRow`, reusing `FieldModal`'s rule-row
 * editor rather than the multi-condition AND-list a field's Visibility section supports). */
interface StageRow {
  field: string;
  gateRows: RuleRow[];
}

function stagesFromStageRules(stageRules: StageRules | null): StageRow[] {
  return (stageRules?.approvers ?? []).map((rule) => ({
    field: rule.field,
    gateRows: rule.when ? rowsFromRule(rule.when) : [],
  }));
}

function buildStageRules(stages: StageRow[], fieldTypes: Map<string, FieldType>): StageRules {
  return {
    approvers: stages
      .filter((s) => s.field)
      .map(
        (s): ApproverRule => ({
          source: 'field',
          field: s.field,
          when: buildVisibilityRule(s.gateRows, fieldTypes),
        }),
      ),
  };
}

/** First reason the current stages can't be saved: a stage with no field picked, or an incomplete
 * gate condition. `null` means every stage is ready to save. */
function stagesError(stages: StageRow[]): string | null {
  if (stages.some((s) => !s.field)) return 'Pick a field for every approver stage, or remove it.';
  for (const stage of stages) {
    const err = ruleRowError(stage.gateRows);
    if (err) return err;
  }
  return null;
}

/**
 * Routing tab (form-builder Slice 6): configures a custom form's approval routing — which
 * user-picker/project-picker field(s) resolve to approvers ("stages", all applying in parallel
 * per PRD §6/§9's `StageRules.approvers`), each with an optional visibility gate so a stage only
 * applies when a condition on the submitted payload matches. Per-field role restriction lives on
 * the field itself (`FieldModal`'s "Restrict to roles" section), not here. Edits are local until
 * "Save Routing" persists them via `PUT /forms/drafts/:key/routing` (parent-owned).
 */
export function RoutingEditor({
  fields,
  stageRules,
  disabled,
  saving,
  error,
  onSave,
}: {
  /** The draft's current field set — sources the picker-field select and the gate condition's
   * referenceable fields. */
  fields: FormFieldDto[];
  stageRules: StageRules | null;
  disabled: boolean;
  saving: boolean;
  error: string | null;
  onSave: (stageRules: StageRules) => void;
}) {
  const [stages, setStages] = React.useState<StageRow[]>(() => stagesFromStageRules(stageRules));
  const [localError, setLocalError] = React.useState<string | null>(null);

  const pickerFields = React.useMemo(
    () => fields.filter((f) => isPickerFieldType(f.type as FieldType)),
    [fields],
  );
  const fieldTypes = React.useMemo(() => new Map(fields.map((f) => [f.key, f.type as FieldType])), [fields]);

  function addStage() {
    setLocalError(null);
    setStages((prev) => [...prev, { field: pickerFields[0]?.key ?? '', gateRows: [] }]);
  }

  function updateStage(index: number, patch: Partial<StageRow>) {
    setLocalError(null);
    setStages((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function removeStage(index: number) {
    setLocalError(null);
    setStages((prev) => prev.filter((_, i) => i !== index));
  }

  function addGate(index: number) {
    const first = fields[0];
    updateStage(index, { gateRows: [{ field: first?.key ?? '', op: 'eq', value: defaultRuleValue(first?.type as FieldType) }] });
  }

  function updateGate(index: number, patch: Partial<RuleRow>) {
    setLocalError(null);
    setStages((prev) =>
      prev.map((s, i) =>
        i === index ? { ...s, gateRows: s.gateRows.map((r, j) => (j === 0 ? { ...r, ...patch } : r)) } : s,
      ),
    );
  }

  function removeGate(index: number) {
    updateStage(index, { gateRows: [] });
  }

  function handleSave() {
    setLocalError(null);
    const err = stagesError(stages);
    if (err) {
      setLocalError(err);
      return;
    }
    onSave(buildStageRules(stages, fieldTypes));
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-sm font-semibold text-ink-900">Approver stages</div>
        <div className="text-[12px] text-ink-400">
          Each stage names a user-picker or project-picker field on this form; its submitted value becomes an
          approver when the request is submitted. All stages approve in parallel.
        </div>
      </div>

      {pickerFields.length === 0 ? (
        <div
          className="rounded-sm px-3 py-2 text-[12px] font-medium"
          style={{ background: 'rgb(255,247,237)', color: 'rgb(204,78,0)' }}
        >
          Add a user-picker or project-picker field to this form before configuring routing.
        </div>
      ) : (
        <>
          {stages.length > 0 && (
            <div className="flex flex-col gap-[10px]">
              {stages.map((stage, index) => (
                <div
                  key={index}
                  className="flex flex-col gap-3 rounded-[10px] border border-line-soft bg-app-bg px-[14px] py-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative flex h-10 flex-1 items-center rounded-sm border border-line bg-surface">
                      <select
                        value={stage.field}
                        disabled={disabled}
                        onChange={(e) => updateStage(index, { field: e.target.value })}
                        aria-label={`Approver field for stage ${index + 1}`}
                        className="h-full w-full appearance-none border-none bg-transparent pl-3 pr-7 text-sm text-ink-900 outline-none disabled:opacity-60"
                      >
                        {pickerFields.map((f) => (
                          <option key={f.key} value={f.key} className="text-ink-900">
                            {f.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="pointer-events-none absolute right-2 text-ink-400" />
                    </div>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => removeStage(index)}
                      aria-label={`Remove stage ${index + 1}`}
                      className="flex-none rounded-[6px] p-2 text-ink-400 hover:bg-danger/10 hover:text-danger disabled:cursor-default disabled:opacity-40"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {stage.gateRows.length === 0 ? (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => addGate(index)}
                      className="flex items-center gap-1 self-start rounded-sm px-2 py-1 text-[13px] font-semibold text-brand hover:bg-surface-muted disabled:cursor-default disabled:opacity-60"
                    >
                      <Plus size={14} />
                      Add visibility gate
                    </button>
                  ) : (
                    stage.gateRows.map((row) => {
                      const refType = fields.find((f) => f.key === row.field)?.type as FieldType | undefined;
                      return (
                        <div key="gate" className="flex items-center gap-2">
                          <div className="relative flex h-10 flex-1 items-center rounded-sm border border-line bg-surface">
                            <select
                              value={row.field}
                              disabled={disabled}
                              onChange={(e) => {
                                const nextField = e.target.value;
                                const nextType = fields.find((f) => f.key === nextField)?.type as FieldType | undefined;
                                updateGate(index, { field: nextField, value: defaultRuleValue(nextType) });
                              }}
                              aria-label={`Gate field for stage ${index + 1}`}
                              className="h-full w-full appearance-none border-none bg-transparent pl-3 pr-7 text-sm text-ink-900 outline-none disabled:opacity-60"
                            >
                              {fields.map((f) => (
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
                              disabled={disabled}
                              onChange={(e) => updateGate(index, { op: e.target.value as RuleOp })}
                              aria-label={`Gate operator for stage ${index + 1}`}
                              className="h-full w-full appearance-none border-none bg-transparent pl-3 pr-7 text-sm text-ink-900 outline-none disabled:opacity-60"
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
                            onChange={(value) => updateGate(index, { value })}
                            ariaLabel={`Gate value for stage ${index + 1}`}
                            disabled={disabled}
                          />
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => removeGate(index)}
                            aria-label={`Remove visibility gate for stage ${index + 1}`}
                            className="flex-none rounded-[6px] p-2 text-ink-400 hover:bg-danger/10 hover:text-danger disabled:cursor-default disabled:opacity-40"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            disabled={disabled}
            onClick={addStage}
            className="flex items-center gap-1 self-start rounded-sm px-2 py-1 text-[13px] font-semibold text-brand hover:bg-surface-muted disabled:cursor-default disabled:opacity-60"
          >
            <Plus size={14} />
            Add stage
          </button>
        </>
      )}

      {(localError || error) && <div className="text-sm font-medium text-danger">{localError || error}</div>}

      <div className="flex justify-end">
        <Button size="sm" disabled={disabled || saving} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save Routing'}
        </Button>
      </div>
    </div>
  );
}
