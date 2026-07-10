import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REQUESTER_ROLE, validateStatusModel, type StatusModel } from './status-model.js';

const validModel: StatusModel = {
  states: ['Submitted', 'Approved', 'Rejected'],
  transitions: [
    { from: 'Submitted', to: 'Approved', roles: ['hr-head'] },
    { from: 'Submitted', to: 'Rejected', roles: ['hr-head'] },
  ],
};

test('validateStatusModel accepts a valid state machine', () => {
  assert.deepEqual(validateStatusModel(validModel), []);
});

test('validateStatusModel rejects a model with no terminal state', () => {
  const model: StatusModel = {
    states: ['A', 'B'],
    transitions: [
      { from: 'A', to: 'B', roles: ['hr-head'] },
      { from: 'B', to: 'A', roles: ['hr-head'] },
    ],
  };
  const errors = validateStatusModel(model);
  assert.ok(errors.some((e) => /terminal state/.test(e)));
});

test('validateStatusModel rejects an orphan (unreachable) state', () => {
  const model: StatusModel = {
    ...validModel,
    states: [...validModel.states, 'Stranded'],
  };
  const errors = validateStatusModel(model);
  assert.ok(errors.some((e) => /"Stranded" is unreachable/.test(e)));
});

test('validateStatusModel rejects a transition referencing an unknown state', () => {
  const model: StatusModel = {
    states: ['Submitted', 'Approved'],
    transitions: [{ from: 'Submitted', to: 'Typo', roles: ['hr-head'] }],
  };
  const errors = validateStatusModel(model);
  assert.ok(errors.some((e) => /unknown state "Typo"/.test(e)));
});

test('validateStatusModel rejects the requester role combined with another role (self-approval)', () => {
  const model: StatusModel = {
    states: ['Submitted', 'Approved'],
    transitions: [{ from: 'Submitted', to: 'Approved', roles: [REQUESTER_ROLE, 'hr-head'] }],
  };
  const errors = validateStatusModel(model);
  assert.ok(errors.some((e) => /self-approval/.test(e)));
});

test('validateStatusModel allows the requester role alone (e.g. withdraw/cancel)', () => {
  const model: StatusModel = {
    states: ['Submitted', 'Approved', 'Withdrawn'],
    transitions: [
      { from: 'Submitted', to: 'Approved', roles: ['hr-head'] },
      { from: 'Submitted', to: 'Withdrawn', roles: [REQUESTER_ROLE] },
    ],
  };
  assert.deepEqual(validateStatusModel(model), []);
});
