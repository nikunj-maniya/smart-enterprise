import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CheckCircle, XCircle, ArrowUpCircle, Plane, FileText } from 'lucide-react';
import type { NotificationDto } from '@se/shared';
import { notifStyle } from './notificationDisplay';

const base = { id: 'n-1', read: false, createdAt: '2026-01-01T00:00:00.000Z' };

test('notifStyle maps enterprise_registered to the registrations queue', () => {
  const n: NotificationDto = {
    ...base,
    type: 'enterprise_registered',
    payload: { registrationId: 'r-1', companyName: 'Acme Corp' },
  };
  const style = notifStyle(n);
  assert.equal(style.title, 'New enterprise registration — Acme Corp');
  assert.equal(style.to, '/registrations');
});

test('notifStyle maps request_approved to the requester\'s My Requests deep link', () => {
  const n: NotificationDto = {
    ...base,
    type: 'request_approved',
    payload: { requestId: 'req-1', formKey: 'leave', formTitle: 'Leave', approverName: 'Priya' },
  };
  const style = notifStyle(n);
  assert.equal(style.icon, CheckCircle);
  assert.equal(style.title, 'Priya approved your Leave request');
  assert.equal(style.to, '/requests?requestId=req-1');
});

test('notifStyle maps request_rejected to an XCircle icon and the same deep link shape', () => {
  const n: NotificationDto = {
    ...base,
    type: 'request_rejected',
    payload: { requestId: 'req-1', formKey: 'leave', formTitle: 'Leave', approverName: 'Priya', reason: null },
  };
  const style = notifStyle(n);
  assert.equal(style.icon, XCircle);
  assert.equal(style.title, 'Priya rejected your Leave request');
  assert.equal(style.to, '/requests?requestId=req-1');
});

test('notifStyle maps request_needs_approval to the form-key icon and the approvals queue', () => {
  const n: NotificationDto = {
    ...base,
    type: 'request_needs_approval',
    payload: { requestId: 'req-1', formKey: 'wfh', formTitle: 'Work From Home', requesterName: 'Sam' },
  };
  const style = notifStyle(n);
  assert.equal(style.title, 'New Work From Home request from Sam needs your approval');
  assert.equal(style.to, '/requests/approvals?requestId=req-1');
});

test('notifStyle falls back to a generic FileText icon for an unrecognized form key', () => {
  const n: NotificationDto = {
    ...base,
    type: 'request_needs_approval',
    payload: { requestId: 'req-1', formKey: 'expense-report', formTitle: 'Expense Report', requesterName: 'Sam' },
  };
  assert.equal(notifStyle(n).icon, FileText);
});

test('notifStyle recognizes every core form-key icon', () => {
  const n = (formKey: string): NotificationDto => ({
    ...base,
    type: 'request_needs_approval',
    payload: { requestId: 'req-1', formKey, formTitle: 'X', requesterName: 'Sam' },
  });
  assert.equal(notifStyle(n('leave')).icon, Plane);
});

test('notifStyle maps request_status_changed to the target state in its title', () => {
  const n: NotificationDto = {
    ...base,
    type: 'request_status_changed',
    payload: { requestId: 'req-1', formKey: 'it', formTitle: 'IT Access', toState: 'Fulfilled' },
  };
  const style = notifStyle(n);
  assert.equal(style.title, 'Your IT Access request moved to Fulfilled');
  assert.equal(style.to, '/requests?requestId=req-1');
});

test('notifStyle maps approval_reminder to a pending-count digest on the approvals queue', () => {
  const n: NotificationDto = { ...base, type: 'approval_reminder', payload: { pendingCount: 4 } };
  const style = notifStyle(n);
  assert.equal(style.title, '4 requests are awaiting your decision');
  assert.equal(style.to, '/requests/approvals');
});

test('notifStyle maps request_decision_update to an interim-approval title', () => {
  const n: NotificationDto = {
    ...base,
    type: 'request_decision_update',
    payload: { requestId: 'req-1', formKey: 'leave', formTitle: 'Leave', approverName: 'Priya', decision: 'approved' },
  };
  const style = notifStyle(n);
  assert.equal(style.title, 'Priya approved your Leave request — awaiting other approvers');
  assert.equal(style.to, '/requests?requestId=req-1');
});

test('notifStyle maps approval_peer_decided to CheckCircle when the peer approved', () => {
  const n: NotificationDto = {
    ...base,
    type: 'approval_peer_decided',
    payload: { requestId: 'req-1', formKey: 'leave', formTitle: 'Leave', approverName: 'Priya', decision: 'approved' },
  };
  const style = notifStyle(n);
  assert.equal(style.icon, CheckCircle);
  assert.equal(style.title, 'Priya approved the Leave request');
  assert.equal(style.to, '/requests/approvals?requestId=req-1');
});

test('notifStyle maps approval_peer_decided to XCircle when the peer rejected', () => {
  const n: NotificationDto = {
    ...base,
    type: 'approval_peer_decided',
    payload: { requestId: 'req-1', formKey: 'leave', formTitle: 'Leave', approverName: 'Priya', decision: 'rejected' },
  };
  assert.equal(notifStyle(n).icon, XCircle);
});

test('notifStyle maps approval_escalated to each cause\'s human label', () => {
  const withCause = (cause: 'on_leave' | 'inactive' | 'timeout'): NotificationDto => ({
    ...base,
    type: 'approval_escalated',
    payload: { requestId: 'req-1', formKey: 'leave', formTitle: 'Leave', cause },
  });
  assert.equal(notifStyle(withCause('on_leave')).title, 'A Leave approval was escalated (approver on leave)');
  assert.equal(notifStyle(withCause('inactive')).title, 'A Leave approval was escalated (approver inactive)');
  assert.equal(
    notifStyle(withCause('timeout')).title,
    "A Leave approval was escalated (approver didn't act in time)",
  );
  assert.equal(notifStyle(withCause('timeout')).icon, ArrowUpCircle);
  assert.equal(notifStyle(withCause('timeout')).to, '/requests/approvals?requestId=req-1');
});
