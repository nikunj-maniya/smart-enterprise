import * as React from 'react';
import { ChevronDown, GripVertical, Plus, X } from 'lucide-react';
import {
  REQUESTER_ROLE,
  SYSTEM_ROLE_KEYS,
  SYSTEM_ROLE_NAMES,
  validateStatusModel,
  type StatusModel,
  type StatusTransition,
} from '@se/shared';
import { Button } from '@/components/ui/button';
import { CheckboxGlyph } from '@/components/form-engine/fields/shared';

/** Roles selectable as a transition gate: real Role keys plus the special `requester` token (so
 * self-service transitions like withdraw/cancel can be modeled). `system` is deliberately not
 * offered here — it's reserved for automated transitions no human ever triggers, so there's
 * nothing for the admin to configure for it in this editor. */
const TRANSITION_ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: REQUESTER_ROLE, label: 'Requester (self)' },
  ...SYSTEM_ROLE_KEYS.map((key) => ({ value: key, label: SYSTEM_ROLE_NAMES[key] })),
];

function uniqueStateName(base: string, existing: string[]): string {
  const taken = new Set(existing);
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}

/** Whether `name` appears as the `from` or `to` of any transition — removing/renaming it would
 * leave that transition dangling, so the caller should block the edit until the transition is
 * updated first. */
function stateInUse(transitions: StatusTransition[], name: string): boolean {
  return transitions.some((t) => t.from === name || t.to === name);
}

/**
 * Status Model tab (form-builder Slice 6): configures a custom form's lifecycle — the ordered
 * list of states (`states[0]` is the initial state new requests start in, reorderable by drag
 * handle) and the role-gated transitions between them (PRD §9's `StatusModel`). Edits are local
 * until "Save Status Model" persists them via `PUT /forms/drafts/:key/status-model` (parent-owned).
 * The shared `validateStatusModel` guardrails (>=1 terminal state, no orphan states, no
 * self-approval) are shown here only as a non-blocking preview — saving a work-in-progress model
 * (e.g. a new state added before its transitions are wired) must stay possible, since the backend
 * only enforces those guardrails at publish time.
 */
export function StatusModelEditor({
  statusModel,
  disabled,
  saving,
  error,
  onSave,
}: {
  statusModel: StatusModel | null;
  disabled: boolean;
  saving: boolean;
  error: string | null;
  onSave: (model: StatusModel) => void;
}) {
  const [states, setStates] = React.useState<string[]>(() => statusModel?.states ?? []);
  // Transitions carry no natural unique key (two can share the same from/to while roles are
  // still being picked), so a client-only `id` is generated once per row and used as the React
  // key — keeping it stable across add/remove keeps an in-progress edit on the row it belongs to
  // instead of following its array position.
  const [transitions, setTransitions] = React.useState<(StatusTransition & { id: string })[]>(
    () => (statusModel?.transitions ?? []).map((t) => ({ ...t, id: crypto.randomUUID() })),
  );
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [localError, setLocalError] = React.useState<string | null>(null);

  const guardrailWarnings = React.useMemo(
    () => (states.length > 0 ? validateStatusModel({ states, transitions }) : []),
    [states, transitions],
  );

  function addState() {
    setLocalError(null);
    setStates((prev) => [...prev, uniqueStateName('New state', prev)]);
  }

  function renameState(index: number, name: string) {
    const oldName = states[index];
    if (name !== oldName && states.some((s, i) => i !== index && s === name)) {
      setLocalError(`"${name}" is already used by another state — state names must be unique.`);
      return;
    }
    setLocalError(null);
    setStates((prev) => prev.map((s, i) => (i === index ? name : s)));
    // Keep transitions pointed at the renamed state instead of orphaning them.
    setTransitions((prev) =>
      prev.map((t) => ({
        ...t,
        from: t.from === oldName ? name : t.from,
        to: t.to === oldName ? name : t.to,
      })),
    );
  }

  function removeState(index: number) {
    const name = states[index];
    if (stateInUse(transitions, name)) {
      setLocalError(`Can't remove "${name}" — it's used in a transition below. Remove that transition first.`);
      return;
    }
    setLocalError(null);
    setStates((prev) => prev.filter((_, i) => i !== index));
  }

  function onDropState(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      return;
    }
    setLocalError(null);
    setStates((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    setDragIndex(null);
  }

  function addTransition() {
    setLocalError(null);
    setTransitions((prev) => [
      ...prev,
      { id: crypto.randomUUID(), from: states[0] ?? '', to: states[1] ?? states[0] ?? '', roles: [] },
    ]);
  }

  function updateTransition(index: number, patch: Partial<StatusTransition>) {
    setLocalError(null);
    setTransitions((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  function toggleTransitionRole(index: number, role: string) {
    setLocalError(null);
    setTransitions((prev) =>
      prev.map((t, i) =>
        i === index ? { ...t, roles: t.roles.includes(role) ? t.roles.filter((r) => r !== role) : [...t.roles, role] } : t,
      ),
    );
  }

  function removeTransition(index: number) {
    setLocalError(null);
    setTransitions((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSave() {
    setLocalError(null);
    if (states.length === 0) {
      setLocalError('Add at least one state.');
      return;
    }
    if (transitions.some((t) => t.roles.length === 0)) {
      setLocalError('Pick at least one role for every transition, or remove it.');
      return;
    }
    onSave({ states, transitions: transitions.map((t) => ({ from: t.from, to: t.to, roles: t.roles })) });
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="text-sm font-semibold text-ink-900">States</div>
        <div className="text-[12px] text-ink-400">
          The first state is where new requests start. Drag to reorder.
        </div>
      </div>

      {states.length > 0 && (
        <div className="flex flex-col gap-[10px]">
          {states.map((name, index) => (
            <div
              key={name}
              draggable={!disabled}
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', String(index));
                setDragIndex(index);
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDropState(index)}
              className="flex items-center gap-3 rounded-[10px] border border-line-soft bg-app-bg px-[14px] py-3"
            >
              <GripVertical size={16} className={`flex-none text-ink-300 ${disabled ? 'opacity-50' : 'cursor-grab'}`} />
              <div className="flex h-10 flex-1 items-center rounded-sm border border-line bg-surface px-3">
                <input
                  type="text"
                  value={name}
                  disabled={disabled}
                  onChange={(e) => renameState(index, e.target.value)}
                  aria-label={`State ${index + 1} name`}
                  className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink-900 outline-none disabled:opacity-60"
                />
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={() => removeState(index)}
                aria-label={`Remove state "${name}"`}
                className="flex-none rounded-[6px] p-2 text-ink-400 hover:bg-danger/10 hover:text-danger disabled:cursor-default disabled:opacity-40"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={addState}
        className="flex items-center gap-1 self-start rounded-sm px-2 py-1 text-[13px] font-semibold text-brand hover:bg-surface-muted disabled:cursor-default disabled:opacity-60"
      >
        <Plus size={14} />
        Add state
      </button>

      <div>
        <div className="text-sm font-semibold text-ink-900">Transitions</div>
        <div className="text-[12px] text-ink-400">
          Each transition names the roles allowed to move a request from one state to another.
        </div>
      </div>

      {states.length < 2 ? (
        <div
          className="rounded-sm px-3 py-2 text-[12px] font-medium"
          style={{ background: 'rgb(255,247,237)', color: 'rgb(204,78,0)' }}
        >
          Add at least two states before configuring transitions.
        </div>
      ) : (
        <>
          {transitions.length > 0 && (
            <div className="flex flex-col gap-[10px]">
              {transitions.map((transition, index) => (
                <div
                  key={transition.id}
                  className="flex flex-col gap-3 rounded-[10px] border border-line-soft bg-app-bg px-[14px] py-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative flex h-10 flex-1 items-center rounded-sm border border-line bg-surface">
                      <select
                        value={transition.from}
                        disabled={disabled}
                        onChange={(e) => updateTransition(index, { from: e.target.value })}
                        aria-label={`From state for transition ${index + 1}`}
                        className="h-full w-full appearance-none border-none bg-transparent pl-3 pr-7 text-sm text-ink-900 outline-none disabled:opacity-60"
                      >
                        {states.map((s) => (
                          <option key={s} value={s} className="text-ink-900">
                            {s}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="pointer-events-none absolute right-2 text-ink-400" />
                    </div>
                    <div className="relative flex h-10 flex-1 items-center rounded-sm border border-line bg-surface">
                      <select
                        value={transition.to}
                        disabled={disabled}
                        onChange={(e) => updateTransition(index, { to: e.target.value })}
                        aria-label={`To state for transition ${index + 1}`}
                        className="h-full w-full appearance-none border-none bg-transparent pl-3 pr-7 text-sm text-ink-900 outline-none disabled:opacity-60"
                      >
                        {states.map((s) => (
                          <option key={s} value={s} className="text-ink-900">
                            {s}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="pointer-events-none absolute right-2 text-ink-400" />
                    </div>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => removeTransition(index)}
                      aria-label={`Remove transition ${index + 1}`}
                      className="flex-none rounded-[6px] p-2 text-ink-400 hover:bg-danger/10 hover:text-danger disabled:cursor-default disabled:opacity-40"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {TRANSITION_ROLE_OPTIONS.map((role) => (
                      <button
                        key={role.value}
                        type="button"
                        disabled={disabled}
                        onClick={() => toggleTransitionRole(index, role.value)}
                        className="flex items-center gap-2 text-left disabled:cursor-default disabled:opacity-60"
                      >
                        <CheckboxGlyph checked={transition.roles.includes(role.value)} />
                        <span className="text-sm text-ink-900">{role.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            disabled={disabled}
            onClick={addTransition}
            className="flex items-center gap-1 self-start rounded-sm px-2 py-1 text-[13px] font-semibold text-brand hover:bg-surface-muted disabled:cursor-default disabled:opacity-60"
          >
            <Plus size={14} />
            Add transition
          </button>
        </>
      )}

      {(localError || error) && <div className="text-sm font-medium text-danger">{localError || error}</div>}

      {!localError && !error && guardrailWarnings.length > 0 && (
        <div
          className="rounded-sm px-3 py-2 text-[12px] font-medium"
          style={{ background: 'rgb(255,247,237)', color: 'rgb(204,78,0)' }}
        >
          This model can be saved as a work in progress, but publishing will fail until these are fixed:{' '}
          {guardrailWarnings.join('; ')}
        </div>
      )}

      <div className="flex justify-end">
        <Button size="sm" disabled={disabled || saving} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save Status Model'}
        </Button>
      </div>
    </div>
  );
}
