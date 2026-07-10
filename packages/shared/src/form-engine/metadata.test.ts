import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateStageRules, validateCoreFormFieldEdit, type StageRules } from './metadata.js';
import { RULE_GRAMMAR_VERSION } from './rules.js';

const fields = [
  { key: 'manager', type: 'user-picker' as const },
  { key: 'region', type: 'single-select' as const },
];

test('validateStageRules accepts a rule whose field and gate both exist on the form', () => {
  const stageRules: StageRules = {
    approvers: [
      {
        source: 'field',
        field: 'manager',
        when: { v: RULE_GRAMMAR_VERSION, when: { field: 'region', op: 'eq', value: 'APAC' } },
      },
    ],
  };
  assert.deepEqual(validateStageRules(stageRules, fields), []);
});

test('validateStageRules rejects an approver field not on the form', () => {
  const stageRules: StageRules = { approvers: [{ source: 'field', field: 'missing' }] };
  const errors = validateStageRules(stageRules, fields);
  assert.ok(errors.some((e) => /"missing" is not on this form/.test(e)));
});

test('validateStageRules rejects a gate condition referencing a field not on the form', () => {
  const stageRules: StageRules = {
    approvers: [
      {
        source: 'field',
        field: 'manager',
        when: { v: RULE_GRAMMAR_VERSION, when: { field: 'deleted-field', op: 'eq', value: 'x' } },
      },
    ],
  };
  const errors = validateStageRules(stageRules, fields);
  assert.ok(errors.some((e) => /visibility gate references field "deleted-field"/.test(e)));
});

test('validateCoreFormFieldEdit allows relabel/reorder/required/validation edits (same key + type)', () => {
  const before = [
    { key: 'manager', type: 'user-picker' as const },
    { key: 'region', type: 'single-select' as const },
  ];
  const after = [
    { key: 'region', type: 'single-select' as const },
    { key: 'manager', type: 'user-picker' as const },
  ];
  assert.deepEqual(validateCoreFormFieldEdit(before, after), []);
});

test('validateCoreFormFieldEdit rejects an added field', () => {
  const before = [{ key: 'manager', type: 'user-picker' as const }];
  const after = [
    { key: 'manager', type: 'user-picker' as const },
    { key: 'new-field', type: 'text' as const },
  ];
  const errors = validateCoreFormFieldEdit(before, after);
  assert.ok(errors.some((e) => /"new-field" cannot be added/.test(e)));
});

test('validateCoreFormFieldEdit rejects a removed field', () => {
  const before = fields;
  const after = [{ key: 'manager', type: 'user-picker' as const }];
  const errors = validateCoreFormFieldEdit(before, after);
  assert.ok(errors.some((e) => /"region" cannot be removed/.test(e)));
});

test('validateCoreFormFieldEdit rejects a changed field type', () => {
  const before = fields;
  const after = [
    { key: 'manager', type: 'user-picker' as const },
    { key: 'region', type: 'text' as const },
  ];
  const errors = validateCoreFormFieldEdit(before, after);
  assert.ok(errors.some((e) => /"region"'s type cannot be changed/.test(e)));
});
