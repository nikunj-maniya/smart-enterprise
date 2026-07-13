import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FormDefinition } from '@se/shared';
import { resolveApprovers } from './approver-resolution.js';

const definition: FormDefinition = {
  id: 'def-1',
  key: 'leave',
  title: 'Leave',
  version: 1,
  renderer: 'core',
  status: 'published',
  sections: [
    {
      order: 0,
      title: 'Details',
      fields: [
        { key: 'techLead', label: 'Tech Lead', type: 'user-picker', required: true, options: { roles: ['tech-lead'] } },
        { key: 'hrHead', label: 'HR Head', type: 'user-picker', required: false, options: { roles: ['hr-head'] } },
        { key: 'watchers', label: 'Watchers', type: 'user-picker', required: false, options: { multi: true } },
      ],
    },
  ],
};

test('resolveApprovers returns no approvers when stageRules is absent', () => {
  assert.deepEqual(resolveApprovers(definition, null, { techLead: 'u1' }), []);
  assert.deepEqual(resolveApprovers(definition, undefined, { techLead: 'u1' }), []);
});

test('resolveApprovers resolves a single-role picker field to its role context', () => {
  const stageRules = { approvers: [{ field: 'techLead', source: 'field' as const }] };
  const result = resolveApprovers(definition, stageRules, { techLead: 'u1' });
  assert.deepEqual(result, [{ approverId: 'u1', roleContext: 'tech-lead' }]);
});

test('resolveApprovers falls back to the field key as roleContext when the field has no single-role picker config', () => {
  const stageRules = { approvers: [{ field: 'watchers', source: 'field' as const }] };
  const result = resolveApprovers(definition, stageRules, { watchers: ['u1', 'u2'] });
  assert.deepEqual(result, [
    { approverId: 'u1', roleContext: 'watchers' },
    { approverId: 'u2', roleContext: 'watchers' },
  ]);
});

test('resolveApprovers skips a stage whose `when` gate does not match the payload', () => {
  const stageRules = {
    approvers: [
      { field: 'hrHead', source: 'field' as const, when: { v: 1 as const, when: { field: 'days', op: 'gt' as const, value: 2 } } },
    ],
  };
  assert.deepEqual(resolveApprovers(definition, stageRules, { hrHead: 'u9', days: 1 }), []);
  assert.deepEqual(resolveApprovers(definition, stageRules, { hrHead: 'u9', days: 3 }), [
    { approverId: 'u9', roleContext: 'hr-head' },
  ]);
});

test('resolveApprovers contributes no approver for an unset/empty picker value', () => {
  const stageRules = { approvers: [{ field: 'hrHead', source: 'field' as const }] };
  assert.deepEqual(resolveApprovers(definition, stageRules, {}), []);
  assert.deepEqual(resolveApprovers(definition, stageRules, { hrHead: '' }), []);
});

test('resolveApprovers dedupes identical (approverId, roleContext) pairs across stages', () => {
  const stageRules = { approvers: [{ field: 'techLead', source: 'field' as const }, { field: 'watchers', source: 'field' as const }] };
  const result = resolveApprovers(definition, stageRules, { techLead: 'u1', watchers: ['u1'] });
  // u1 as tech-lead and u1 as watchers are DIFFERENT roleContexts, so both survive —
  // dedup only collapses the exact same (id, roleContext) pair appearing twice.
  assert.deepEqual(result, [
    { approverId: 'u1', roleContext: 'tech-lead' },
    { approverId: 'u1', roleContext: 'watchers' },
  ]);
});
