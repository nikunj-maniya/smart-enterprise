import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canViewRequestDetail } from './visibility-policy.js';

const request = {
  requesterId: 'requester-1',
  approvers: [{ approverId: 'approver-1' }, { approverId: 'approver-2' }],
};

test('canViewRequestDetail allows the requester', () => {
  assert.equal(canViewRequestDetail('requester-1', request), true);
});

test('canViewRequestDetail allows any snapshotted approver', () => {
  assert.equal(canViewRequestDetail('approver-1', request), true);
  assert.equal(canViewRequestDetail('approver-2', request), true);
});

test('canViewRequestDetail denies an unrelated viewer (PRD §11A: pending is requester+approvers only)', () => {
  assert.equal(canViewRequestDetail('random-employee', request), false);
});

test('canViewRequestDetail denies everyone when there are no approvers yet and the viewer is not the requester', () => {
  assert.equal(canViewRequestDetail('someone-else', { requesterId: 'requester-1', approvers: [] }), false);
});
