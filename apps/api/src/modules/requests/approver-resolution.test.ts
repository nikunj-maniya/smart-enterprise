import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FormDefinition } from '@se/shared';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { assertApproversEligible, resolveApprovers } from './approver-resolution.js';

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
  assert.deepEqual(result, [{ approverId: 'u1', roleContext: 'tech-lead', fieldKey: 'techLead' }]);
});

test('resolveApprovers falls back to the field key as roleContext when the field has no single-role picker config', () => {
  const stageRules = { approvers: [{ field: 'watchers', source: 'field' as const }] };
  const result = resolveApprovers(definition, stageRules, { watchers: ['u1', 'u2'] });
  assert.deepEqual(result, [
    { approverId: 'u1', roleContext: 'watchers', fieldKey: 'watchers' },
    { approverId: 'u2', roleContext: 'watchers', fieldKey: 'watchers' },
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
    { approverId: 'u9', roleContext: 'hr-head', fieldKey: 'hrHead' },
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
    { approverId: 'u1', roleContext: 'tech-lead', fieldKey: 'techLead' },
    { approverId: 'u1', roleContext: 'watchers', fieldKey: 'watchers' },
  ]);
});

// ── assertApproversEligible ─────────────────────────────

let roleHolderIds: string[];
let projectTlRows: Array<{ userId: string }>;

Object.defineProperty(prisma, 'user', {
  value: { findMany: async () => roleHolderIds.map((id) => ({ id })) },
  configurable: true,
});
Object.defineProperty(prisma, 'projectMember', {
  value: { findMany: async () => projectTlRows },
  configurable: true,
});

const definitionWithProject: FormDefinition = {
  ...definition,
  sections: [
    {
      order: 0,
      title: 'Details',
      fields: [
        ...definition.sections[0].fields,
        { key: 'projectName', label: 'Project', type: 'project-picker', required: true, options: { multi: true } },
        { key: 'techLeadPicker', label: 'Tech Lead', type: 'user-picker', required: true, options: { source: 'project-tech-leads' } },
      ],
    },
  ],
};

test('assertApproversEligible passes when the submitted id holds the field\'s required role', async () => {
  roleHolderIds = ['u1'];
  await assertApproversEligible(
    't1',
    definition,
    [{ approverId: 'u1', roleContext: 'tech-lead', fieldKey: 'techLead' }],
    { techLead: 'u1' },
  );
});

test('assertApproversEligible rejects a submitted id that does not hold the required role', async () => {
  roleHolderIds = []; // u1 does not hold 'tech-lead'
  await assert.rejects(
    assertApproversEligible(
      't1',
      definition,
      [{ approverId: 'u1', roleContext: 'tech-lead', fieldKey: 'techLead' }],
      { techLead: 'u1' },
    ),
    (err: unknown) => err instanceof HttpError && err.status === 400,
  );
});

test('assertApproversEligible skips validation for a picker field with no roles/source restriction', async () => {
  roleHolderIds = [];
  await assertApproversEligible(
    't1',
    definition,
    [{ approverId: 'u1', roleContext: 'watchers', fieldKey: 'watchers' }],
    { watchers: ['u1'] },
  );
});

test('assertApproversEligible passes a project-tech-leads field when the id is a TL on the submitted project', async () => {
  projectTlRows = [{ userId: 'tl-1' }];
  await assertApproversEligible(
    't1',
    definitionWithProject,
    [{ approverId: 'tl-1', roleContext: 'techLeadPicker', fieldKey: 'techLeadPicker' }],
    { projectName: ['proj-1'] },
  );
});

test('assertApproversEligible rejects a project-tech-leads field when the id is not a TL on the submitted project', async () => {
  projectTlRows = [];
  await assert.rejects(
    assertApproversEligible(
      't1',
      definitionWithProject,
      [{ approverId: 'someone-else', roleContext: 'techLeadPicker', fieldKey: 'techLeadPicker' }],
      { projectName: ['proj-1'] },
    ),
    (err: unknown) => err instanceof HttpError && err.status === 400,
  );
});
