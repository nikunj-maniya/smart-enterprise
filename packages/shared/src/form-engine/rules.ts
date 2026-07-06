import { z } from 'zod';

// ── Rule grammar (declarative, versioned JSON) — PRD §6.4 ─────
// A visibility/validation rule is a small tree of leaf comparisons composed with
// `and`/`or`. It is stored as JSON and evaluated identically by the renderer
// (live UX) and the API (authoritative re-validation) — never as free-form JS.
// The grammar carries `v` so new operators can extend it without breaking rules
// already persisted against older definition versions.

/** Current rule-grammar version stored inside every rule (`{ v: 1, when }`). */
export const RULE_GRAMMAR_VERSION = 1 as const;

/**
 * Leaf operators. `empty`/`notEmpty` ignore `value`; `in`/`nin` expect an array
 * `value`; the ordering operators (`gt`/`gte`/`lt`/`lte`) expect comparable
 * scalar operands (numbers, or lexicographically-ordered ISO date strings).
 */
export const ruleOp = z.enum([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'nin',
  'empty',
  'notEmpty',
]);
export type RuleOp = z.infer<typeof ruleOp>;

export interface RuleLeaf {
  field: string;
  op: RuleOp;
  value?: unknown;
}
export type RuleNode = RuleLeaf | { and: RuleNode[] } | { or: RuleNode[] };

/** A stored rule: the grammar version plus its root node. */
export interface VisibilityRule {
  v: typeof RULE_GRAMMAR_VERSION;
  when: RuleNode;
}

const ruleLeafSchema = z.object({
  field: z.string().min(1),
  op: ruleOp,
  value: z.unknown().optional(),
});

const ruleNodeSchema: z.ZodType<RuleNode> = z.lazy(() =>
  z.union([
    ruleLeafSchema,
    z.object({ and: z.array(ruleNodeSchema).min(1) }),
    z.object({ or: z.array(ruleNodeSchema).min(1) }),
  ]),
);

/** Zod schema validating the stored rule grammar. */
export const visibilityRuleSchema: z.ZodType<VisibilityRule> = z.object({
  v: z.literal(RULE_GRAMMAR_VERSION),
  when: ruleNodeSchema,
});

/** A value is "empty" when unanswered: undefined, null, '', or an empty array. */
export function isEmptyValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

function evaluateLeaf(leaf: RuleLeaf, values: Record<string, unknown>): boolean {
  const actual = values[leaf.field];
  switch (leaf.op) {
    case 'empty':
      return isEmptyValue(actual);
    case 'notEmpty':
      return !isEmptyValue(actual);
    case 'eq':
      return actual === leaf.value;
    case 'neq':
      return actual !== leaf.value;
    case 'in':
      return Array.isArray(leaf.value) && leaf.value.includes(actual);
    case 'nin':
      return !(Array.isArray(leaf.value) && leaf.value.includes(actual));
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      // An unanswered field never satisfies an ordering comparison.
      if (isEmptyValue(actual) || isEmptyValue(leaf.value)) return false;
      const a = actual as number | string;
      const b = leaf.value as number | string;
      switch (leaf.op) {
        case 'gt':
          return a > b;
        case 'gte':
          return a >= b;
        case 'lt':
          return a < b;
        case 'lte':
          return a <= b;
      }
    }
  }
  return false;
}

function evaluateNode(node: RuleNode, values: Record<string, unknown>): boolean {
  if ('and' in node) return node.and.every((child) => evaluateNode(child, values));
  if ('or' in node) return node.or.some((child) => evaluateNode(child, values));
  return evaluateLeaf(node, values);
}

/** Evaluate a stored rule against a payload's values. */
export function evaluateRule(rule: VisibilityRule, values: Record<string, unknown>): boolean {
  return evaluateNode(rule.when, values);
}

/**
 * Field/section visibility helper used by both renderer and server. A missing
 * rule means always-visible; otherwise the rule is evaluated against the payload.
 */
export function isFieldVisible(
  rule: VisibilityRule | null | undefined,
  values: Record<string, unknown>,
): boolean {
  if (!rule) return true;
  return evaluateRule(rule, values);
}
