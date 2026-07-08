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
