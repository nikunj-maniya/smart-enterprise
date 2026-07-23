import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FileText } from 'lucide-react';
import {
  DecisionBadge,
  EmptyState,
  ErrorState,
  InitialsAvatar,
  StatusBadge,
  TypeTile,
  dateRange,
  formatDate,
  requestTypeMeta,
  roleContextLabel,
} from './shared';

afterEach(() => {
  cleanup();
});

test('requestTypeMeta returns the known icon/label for core form keys', () => {
  assert.equal(requestTypeMeta('leave', 'Leave Request').label, 'Leave');
  assert.equal(requestTypeMeta('wfh', 'Work From Home').label, 'WFH');
  assert.equal(requestTypeMeta('it', 'IT Request').label, 'IT');
  assert.equal(requestTypeMeta('visitor', 'Visitor Request').label, 'Visitor');
});

test('requestTypeMeta falls back to a generic icon and the form title for an unknown key', () => {
  const meta = requestTypeMeta('custom-expense', 'Expense Report');
  assert.equal(meta.label, 'Expense Report');
  assert.equal(meta.icon, FileText);
});

test('TypeTile renders the mapped icon at the size-specific icon size', () => {
  render(<TypeTile formKey="leave" formTitle="Leave Request" size={44} />);
  const svg = document.querySelector('svg')!;
  assert.equal(svg.getAttribute('width'), '21');
  assert.equal(svg.getAttribute('height'), '21');
});

test('StatusBadge renders a known status with its text', () => {
  render(<StatusBadge status="Approved" />);
  assert.ok(screen.getByText('Approved'));
});

test('StatusBadge renders an unrecognized status without throwing (default tone)', () => {
  render(<StatusBadge status="SomeFutureStatus" />);
  assert.ok(screen.getByText('SomeFutureStatus'));
});

test('InitialsAvatar renders the first 2 initials, uppercased', () => {
  render(<InitialsAvatar name="grace hopper" />);
  assert.ok(screen.getByText('GH'));
});

test('InitialsAvatar truncates to 2 initials for a 3+ word name', () => {
  render(<InitialsAvatar name="Mary Jane Watson" />);
  assert.ok(screen.getByText('MJ'));
});

test('formatDate renders month-day only (no year)', () => {
  const text = formatDate('2026-07-10T00:00:00.000Z');
  assert.match(text, /Jul/);
  assert.match(text, /10/);
  assert.equal(/2026/.test(text), false);
});

test('dateRange shows a dash when there is no start date', () => {
  assert.equal(dateRange(null, null), '—');
});

test('dateRange shows a single formatted date when start equals end', () => {
  const result = dateRange('2026-07-10T00:00:00.000Z', '2026-07-10T00:00:00.000Z');
  assert.equal(result.includes('–'), false);
  assert.match(result, /Jul/);
});

test('dateRange shows a formatted range when start differs from end', () => {
  const result = dateRange('2026-07-10T00:00:00.000Z', '2026-07-12T00:00:00.000Z');
  assert.ok(result.includes('–'));
});

test('EmptyState renders the heading and message', () => {
  render(<EmptyState icon={FileText} heading="Nothing here" message="Come back later." />);
  assert.ok(screen.getByText('Nothing here'));
  assert.ok(screen.getByText('Come back later.'));
});

test('DecisionBadge defaults to the decision label when none is given', () => {
  render(<DecisionBadge decision="approved" />);
  assert.ok(screen.getByText('Approved'));
});

test('DecisionBadge uses a custom label when provided', () => {
  render(<DecisionBadge decision="pending" label="Awaiting Ada" />);
  assert.ok(screen.getByText('Awaiting Ada'));
  assert.equal(screen.queryByText('Pending'), null);
});

test('roleContextLabel resolves a known SystemRoleKey to its display name', () => {
  assert.equal(roleContextLabel('hr-head'), 'HR Head');
});

test('roleContextLabel falls back to the raw string for an unrecognized key', () => {
  assert.equal(roleContextLabel('some-future-role'), 'some-future-role');
});

test('ErrorState renders the message and calls onRetry when clicked', () => {
  let retried = 0;
  render(<ErrorState message="Something broke." onRetry={() => (retried += 1)} />);
  assert.ok(screen.getByText('Something broke.'));
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  assert.equal(retried, 1);
});
