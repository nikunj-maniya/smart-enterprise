import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { AbsenceEntryDto } from '@se/shared';
import { DayDetailPanel } from './DayDetailPanel';

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
    type: 'wfh',
    startDate: '2026-01-10',
    endDate: '2026-01-10',
    halfDayCount: null,
    ...overrides,
  };
}

test('renders the formatted date and a singular person count', () => {
  render(<DayDetailPanel dateIso="2026-01-10" rows={[row()]} showReason={false} onClose={() => {}} />);
  const expectedLabel = new Date(2026, 0, 10).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  assert.ok(screen.getByText(expectedLabel));
  assert.ok(screen.getByText('1 person away'));
  assert.ok(screen.getByText('Ada Lovelace'));
  assert.ok(screen.getByText('WFH'));
});

test('pluralizes the count for more than one person', () => {
  const rows = [row(), row({ requestId: 'r-2', personName: 'Bob Builder' })];
  render(<DayDetailPanel dateIso="2026-01-10" rows={rows} showReason={false} onClose={() => {}} />);
  assert.ok(screen.getByText('2 people away'));
});

test('shows the empty message when no one is away', () => {
  render(<DayDetailPanel dateIso="2026-01-10" rows={[]} showReason={false} onClose={() => {}} />);
  assert.ok(screen.getByText('0 people away'));
  assert.ok(screen.getByText('No one is away this day.'));
});

test('shows the reason only when showReason is true and a reason is present', () => {
  const withReason = row({ reason: 'Medical appointment' });
  const { rerender } = render(
    <DayDetailPanel dateIso="2026-01-10" rows={[withReason]} showReason={false} onClose={() => {}} />,
  );
  assert.equal(screen.queryByText('Medical appointment'), null);

  rerender(<DayDetailPanel dateIso="2026-01-10" rows={[withReason]} showReason onClose={() => {}} />);
  assert.ok(screen.getByText('Medical appointment'));
});

test('renders department and project details for a row', () => {
  const entry = row({ projectId: 'p-1', projectName: 'Apollo' });
  render(<DayDetailPanel dateIso="2026-01-10" rows={[entry]} showReason={false} onClose={() => {}} />);
  assert.ok(screen.getByText(/Engineering/));
  assert.ok(screen.getByText(/Apollo/));
});

test('pressing Escape invokes onClose', () => {
  let closed = false;
  render(<DayDetailPanel dateIso="2026-01-10" rows={[row()]} showReason={false} onClose={() => (closed = true)} />);
  fireEvent.keyDown(window, { key: 'Escape' });
  assert.equal(closed, true);
});

test('clicking the backdrop invokes onClose but clicking inside the card does not', () => {
  let closed = false;
  render(<DayDetailPanel dateIso="2026-01-10" rows={[row()]} showReason={false} onClose={() => (closed = true)} />);
  fireEvent.click(screen.getByText('Ada Lovelace'));
  assert.equal(closed, false);
  fireEvent.click(screen.getByRole('dialog').parentElement!);
  assert.equal(closed, true);
});
