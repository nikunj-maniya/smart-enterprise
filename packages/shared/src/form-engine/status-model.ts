import { z } from 'zod';

// ── Status lifecycle model (mirrors the `StatusModel` row) — PRD §9 ────────
// `states`/`transitions` are the JSON stored on `StatusModel.states`/`.transitions`.
// `roles` on a transition gates who may perform it: real `Role.key` values, or the
// special tokens below (never persisted as an actual Role).

/** Only the request's own requester may perform the transition. */
export const REQUESTER_ROLE = 'requester';
/** Reserved for automated/system-triggered transitions — no human actor ever matches it. */
export const SYSTEM_ROLE = 'system';

/**
 * State a generic custom-form request starts in when the form has no configured status model
 * yet (status-model configuration is a later slice). Keeps just-published custom forms
 * submittable as standard requests.
 */
export const DEFAULT_GENERIC_INITIAL_STATUS = 'Submitted';

export const statusTransitionSchema = z.object({
  from: z.string(),
  to: z.string(),
  roles: z.array(z.string()).min(1),
});
export type StatusTransition = z.infer<typeof statusTransitionSchema>;

export const statusModelSchema = z.object({
  states: z.array(z.string()).min(1),
  transitions: z.array(statusTransitionSchema),
});
export type StatusModel = z.infer<typeof statusModelSchema>;

/**
 * Validate a status model as a state machine (design.md guardrails, form-builder spec):
 * every transition must reference a declared state, at least one state must be terminal
 * (no outgoing transitions), every state must be reachable from the initial state
 * (`states[0]`), and no transition may combine `REQUESTER_ROLE` with another role — that
 * would let the requester alone satisfy a gate meant to require a real approver
 * (self-approval). Returns one message per problem found; an empty array means the model
 * is valid. Mirrors `validateStageRules`'s shape.
 */
export function validateStatusModel(model: StatusModel): string[] {
  const errors: string[] = [];
  const stateSet = new Set(model.states);

  for (const t of model.transitions) {
    if (!stateSet.has(t.from)) errors.push(`Transition references unknown state "${t.from}"`);
    if (!stateSet.has(t.to)) errors.push(`Transition references unknown state "${t.to}"`);
  }

  const withOutgoing = new Set(model.transitions.map((t) => t.from));
  if (!model.states.some((s) => !withOutgoing.has(s))) {
    errors.push('At least one terminal state (with no outgoing transitions) is required');
  }

  const initial = model.states[0];
  const reachable = new Set([initial]);
  const queue = [initial];
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    for (const t of model.transitions) {
      if (t.from === current && stateSet.has(t.to) && !reachable.has(t.to)) {
        reachable.add(t.to);
        queue.push(t.to);
      }
    }
  }
  for (const s of model.states) {
    if (!reachable.has(s))
      errors.push(`State "${s}" is unreachable from the initial state "${initial}"`);
  }

  for (const t of model.transitions) {
    if (t.roles.includes(REQUESTER_ROLE) && t.roles.length > 1) {
      errors.push(
        `Transition "${t.from}" → "${t.to}" combines the requester role with other roles (self-approval)`,
      );
    }
  }

  return errors;
}
