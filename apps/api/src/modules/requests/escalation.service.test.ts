import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Prisma } from '@prisma/client';
import { applySelfApprovalEscalation } from './escalation.service.js';
import type { ResolvedApprover } from './approver-resolution.js';

/** Minimal fake of the subset of Prisma.TransactionClient that escalation.service.ts actually calls. */
function fakeTx(opts: {
  escalationRule?: { toRoleId: string } | null;
  activeRoleHolderId?: string | null;
  enterpriseAdminId?: string | null;
}): Prisma.TransactionClient {
  return {
    escalationRule: {
      findUnique: async () => opts.escalationRule ?? null,
    },
    userRole: {
      findFirst: async () => (opts.activeRoleHolderId ? { userId: opts.activeRoleHolderId } : null),
    },
    user: {
      findFirst: async () => (opts.enterpriseAdminId ? { id: opts.enterpriseAdminId } : null),
    },
  } as unknown as Prisma.TransactionClient;
}

test('applySelfApprovalEscalation passes through an approver who is not the requester', async () => {
  const tx = fakeTx({});
  const approvers: ResolvedApprover[] = [{ approverId: 'approver-1', roleContext: 'tech-lead' }];
  const result = await applySelfApprovalEscalation(tx, 'tenant-1', 'requester-1', approvers);
  assert.deepEqual(result, approvers);
});

test('applySelfApprovalEscalation replaces a self-resolved approver with the matrix escalation target (PRD §8.4: no self-approval)', async () => {
  const tx = fakeTx({ escalationRule: { toRoleId: 'role-hr-head' }, activeRoleHolderId: 'hr-head-user' });
  const approvers: ResolvedApprover[] = [{ approverId: 'requester-1', roleContext: 'tech-lead' }];
  const result = await applySelfApprovalEscalation(tx, 'tenant-1', 'requester-1', approvers);
  assert.deepEqual(result, [{ approverId: 'hr-head-user', roleContext: 'tech-lead' }]);
});

test('applySelfApprovalEscalation falls back to the Enterprise Admin when the matrix role has no active holder', async () => {
  const tx = fakeTx({ escalationRule: { toRoleId: 'role-hr-head' }, activeRoleHolderId: null, enterpriseAdminId: 'ea-user' });
  const approvers: ResolvedApprover[] = [{ approverId: 'requester-1', roleContext: 'tech-lead' }];
  const result = await applySelfApprovalEscalation(tx, 'tenant-1', 'requester-1', approvers);
  assert.deepEqual(result, [{ approverId: 'ea-user', roleContext: 'tech-lead' }]);
});

test('applySelfApprovalEscalation falls back to the Enterprise Admin when the tenant has no matrix entry at all', async () => {
  const tx = fakeTx({ escalationRule: null, enterpriseAdminId: 'ea-user' });
  const approvers: ResolvedApprover[] = [{ approverId: 'requester-1', roleContext: 'tech-lead' }];
  const result = await applySelfApprovalEscalation(tx, 'tenant-1', 'requester-1', approvers);
  assert.deepEqual(result, [{ approverId: 'ea-user', roleContext: 'tech-lead' }]);
});

test('applySelfApprovalEscalation drops a stage with no target at all rather than blocking submission', async () => {
  const tx = fakeTx({ escalationRule: null, enterpriseAdminId: null });
  const approvers: ResolvedApprover[] = [{ approverId: 'requester-1', roleContext: 'tech-lead' }];
  const result = await applySelfApprovalEscalation(tx, 'tenant-1', 'requester-1', approvers);
  assert.deepEqual(result, []);
});

test('applySelfApprovalEscalation dedupes after escalation collapses two stages onto the same target', async () => {
  const tx = fakeTx({ escalationRule: { toRoleId: 'role-hr-head' }, activeRoleHolderId: 'hr-head-user' });
  const approvers: ResolvedApprover[] = [
    { approverId: 'requester-1', roleContext: 'tech-lead' },
    { approverId: 'hr-head-user', roleContext: 'tech-lead' },
  ];
  const result = await applySelfApprovalEscalation(tx, 'tenant-1', 'requester-1', approvers);
  assert.deepEqual(result, [{ approverId: 'hr-head-user', roleContext: 'tech-lead' }]);
});
