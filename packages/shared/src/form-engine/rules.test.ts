import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectRuleFields,
  evaluateRule,
  isEmptyValue,
  isFieldVisible,
  visibilityRuleSchema,
  type VisibilityRule,
} from './rules.js';

function rule(when: VisibilityRule['when']): VisibilityRule {
  return { v: 1, when };
}

describe('isEmptyValue', () => {
  it('treats undefined, null, "", and [] as empty', () => {
    assert.ok(isEmptyValue(undefined));
    assert.ok(isEmptyValue(null));
    assert.ok(isEmptyValue(''));
    assert.ok(isEmptyValue([]));
  });

  it('treats 0, false, "0", and a non-empty array as not empty', () => {
    assert.equal(isEmptyValue(0), false);
    assert.equal(isEmptyValue(false), false);
    assert.equal(isEmptyValue('0'), false);
    assert.equal(isEmptyValue([1]), false);
  });
});

describe('evaluateRule leaf operators', () => {
  it('eq / neq compare strict equality', () => {
    assert.equal(evaluateRule(rule({ field: 'status', op: 'eq', value: 'Approved' }), { status: 'Approved' }), true);
    assert.equal(evaluateRule(rule({ field: 'status', op: 'eq', value: 'Approved' }), { status: 'Rejected' }), false);
    assert.equal(evaluateRule(rule({ field: 'status', op: 'neq', value: 'Approved' }), { status: 'Rejected' }), true);
  });

  it('empty / notEmpty check for an unanswered value', () => {
    assert.equal(evaluateRule(rule({ field: 'x', op: 'empty' }), {}), true);
    assert.equal(evaluateRule(rule({ field: 'x', op: 'empty' }), { x: 'a' }), false);
    assert.equal(evaluateRule(rule({ field: 'x', op: 'notEmpty' }), { x: 'a' }), true);
  });

  it('in / nin check array membership', () => {
    const inRule = rule({ field: 'role', op: 'in', value: ['hr-head', 'enterprise-admin'] });
    assert.equal(evaluateRule(inRule, { role: 'hr-head' }), true);
    assert.equal(evaluateRule(inRule, { role: 'employee' }), false);
    const ninRule = rule({ field: 'role', op: 'nin', value: ['hr-head'] });
    assert.equal(evaluateRule(ninRule, { role: 'employee' }), true);
  });

  it('gt / gte / lt / lte compare ordered scalars', () => {
    assert.equal(evaluateRule(rule({ field: 'days', op: 'gt', value: 2 }), { days: 3 }), true);
    assert.equal(evaluateRule(rule({ field: 'days', op: 'gt', value: 2 }), { days: 2 }), false);
    assert.equal(evaluateRule(rule({ field: 'days', op: 'gte', value: 2 }), { days: 2 }), true);
    assert.equal(evaluateRule(rule({ field: 'end_date', op: 'lt', value: '2026-06-30' }), { end_date: '2026-06-01' }), true);
    assert.equal(evaluateRule(rule({ field: 'end_date', op: 'lte', value: '2026-06-30' }), { end_date: '2026-06-30' }), true);
  });

  it('an ordering comparison is false when the field or the compared value is unanswered', () => {
    assert.equal(evaluateRule(rule({ field: 'days', op: 'gt', value: 2 }), {}), false);
    assert.equal(evaluateRule(rule({ field: 'days', op: 'gt', value: undefined }), { days: 5 }), false);
  });
});

describe('evaluateRule and/or composition', () => {
  it('"and" requires every child to be true', () => {
    const node = { and: [{ field: 'a', op: 'eq' as const, value: 1 }, { field: 'b', op: 'eq' as const, value: 2 }] };
    assert.equal(evaluateRule(rule(node), { a: 1, b: 2 }), true);
    assert.equal(evaluateRule(rule(node), { a: 1, b: 3 }), false);
  });

  it('"or" requires at least one child to be true', () => {
    const node = { or: [{ field: 'a', op: 'eq' as const, value: 1 }, { field: 'b', op: 'eq' as const, value: 2 }] };
    assert.equal(evaluateRule(rule(node), { a: 0, b: 2 }), true);
    assert.equal(evaluateRule(rule(node), { a: 0, b: 0 }), false);
  });

  it('nested and/or trees evaluate depth-first', () => {
    const node = {
      or: [
        { and: [{ field: 'access_type', op: 'eq' as const, value: 'Software' }, { field: 'sw_impact', op: 'eq' as const, value: 'Blocker' }] },
        { field: 'access_type', op: 'eq' as const, value: 'Hardware' },
      ],
    };
    assert.equal(evaluateRule(rule(node), { access_type: 'Software', sw_impact: 'Blocker' }), true);
    assert.equal(evaluateRule(rule(node), { access_type: 'Software', sw_impact: 'Low' }), false);
    assert.equal(evaluateRule(rule(node), { access_type: 'Hardware' }), true);
  });
});

describe('collectRuleFields', () => {
  it('returns the single field of a leaf node', () => {
    assert.deepEqual(collectRuleFields({ field: 'away_duration', op: 'eq', value: '>2 days' }), ['away_duration']);
  });

  it('flattens every field referenced across nested and/or trees', () => {
    const node = {
      or: [
        { and: [{ field: 'a', op: 'eq' as const, value: 1 }, { field: 'b', op: 'eq' as const, value: 2 }] },
        { field: 'c', op: 'notEmpty' as const },
      ],
    };
    assert.deepEqual(collectRuleFields(node), ['a', 'b', 'c']);
  });
});

describe('isFieldVisible', () => {
  it('is always visible when no rule is given', () => {
    assert.equal(isFieldVisible(null, {}), true);
    assert.equal(isFieldVisible(undefined, {}), true);
  });

  it('defers to evaluateRule when a rule is given', () => {
    const r = rule({ field: 'will_come_next_days', op: 'eq', value: true });
    assert.equal(isFieldVisible(r, { will_come_next_days: true }), true);
    assert.equal(isFieldVisible(r, { will_come_next_days: false }), false);
  });
});

describe('visibilityRuleSchema', () => {
  it('accepts a well-formed rule', () => {
    assert.doesNotThrow(() => visibilityRuleSchema.parse(rule({ field: 'x', op: 'eq', value: 'y' })));
  });

  it('rejects a rule with the wrong grammar version', () => {
    assert.throws(() => visibilityRuleSchema.parse({ v: 2, when: { field: 'x', op: 'eq', value: 'y' } }));
  });

  it('rejects a leaf with an unrecognized operator', () => {
    assert.throws(() => visibilityRuleSchema.parse(rule({ field: 'x', op: 'contains', value: 'y' } as never)));
  });
});
