import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { AbsenceEntryDto } from '@se/shared';
import { AgendaView } from './AgendaView';

afterEach(cleanup);

function row(overrides: Partial<AbsenceEntryDto> = {}): AbsenceEntryDto {
  return {
    requestId: 'r-1',
    personId: 'p-1',
    personName: 'Ada Lovelace',
    departmentId: 'd-1',
    departmentName: 'Engineering',
    projectId: null,
    projectName: null,
    type: 'leave',
    startDate: '2026-01-10',
    endDate: '2026-01-10',
    halfDayCount: null,
    ...overrides,
  };
}

test('shows a loading placeholder when loading with no rows yet', () => {
  render(<AgendaView rows={[]} loading error={null} onRetry={() => {}} showReason={false} />);
  assert.ok(screen.getByText('Loading absences…'));
});

test('shows the error state and calls onRetry when it errors', () => {
  let retried = false;
  render(<AgendaView rows={[]} loading={false} error="Failed to load" onRetry={() => (retried = true)} showReason={false} />);
  assert.ok(screen.getByText('Failed to load'));
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  assert.equal(retried, true);
});

test('shows the empty state when there is nothing to list', () => {
  render(<AgendaView rows={[]} loading={false} error={null} onRetry={() => {}} showReason={false} />);
  assert.ok(screen.getByText('No absences'));
  assert.ok(screen.getByText('No leave or WFH matches the current filters.'));
});

test('sorts rows by start date ascending regardless of input order', () => {
  const later = row({ requestId: 'r-later', personName: 'Zoe Later', startDate: '2026-01-20', endDate: '2026-01-20' });
  const earlier = row({ requestId: 'r-earlier', personName: 'Amy Earlier', startDate: '2026-01-05', endDate: '2026-01-05' });
  render(<AgendaView rows={[later, earlier]} loading={false} error={null} onRetry={() => {}} showReason={false} />);

  const names = screen.getAllByText(/Later|Earlier/).map((el) => el.textContent);
  assert.deepEqual(names, ['Amy Earlier', 'Zoe Later']);
});

test('renders department, project, and half-day details', () => {
  const entry = row({ projectId: 'p-1', projectName: 'Apollo', halfDayCount: 2 });
  render(<AgendaView rows={[entry]} loading={false} error={null} onRetry={() => {}} showReason={false} />);
  assert.ok(screen.getByText('Engineering · Apollo · 2 half-days'));
});

test('renders a single half-day without pluralizing', () => {
  const entry = row({ halfDayCount: 1 });
  render(<AgendaView rows={[entry]} loading={false} error={null} onRetry={() => {}} showReason={false} />);
  assert.ok(screen.getByText('Engineering · 1 half-day'));
});

test('shows the reason only when showReason is true and a reason is present', () => {
  const entry = row({ reason: 'Family emergency' });
  const { rerender } = render(<AgendaView rows={[entry]} loading={false} error={null} onRetry={() => {}} showReason={false} />);
  assert.equal(screen.queryByText('Family emergency'), null);

  rerender(<AgendaView rows={[entry]} loading={false} error={null} onRetry={() => {}} showReason />);
  assert.ok(screen.getByText('Family emergency'));
});
