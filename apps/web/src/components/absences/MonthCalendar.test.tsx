import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { AbsenceEntryDto } from '@se/shared';
import { MonthCalendar } from './MonthCalendar';
import { getMonthGrid, toISODate } from './absenceStyle';

afterEach(cleanup);

function row(overrides: Partial<AbsenceEntryDto> = {}): AbsenceEntryDto {
  return {
    requestId: 'r-1',
    personId: 'p-1',
    personName: 'Ada Lovelace',
    departmentId: null,
    departmentName: null,
    projectId: null,
    projectName: null,
    type: 'leave',
    startDate: '2026-01-10',
    endDate: '2026-01-10',
    halfDayCount: null,
    ...overrides,
  };
}

const month = new Date(2026, 0, 1);
const { weeks } = getMonthGrid(month);

function renderCalendar(overrides: {
  rows?: AbsenceEntryDto[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  overCapDates?: Set<string>;
  onSelectDay?: (dateIso: string, dayRows: AbsenceEntryDto[]) => void;
} = {}) {
  return render(
    <MonthCalendar
      month={month}
      weeks={weeks}
      rows={overrides.rows ?? []}
      loading={overrides.loading ?? false}
      error={overrides.error ?? null}
      onRetry={overrides.onRetry ?? (() => {})}
      overCapDates={overrides.overCapDates}
      onSelectDay={overrides.onSelectDay ?? (() => {})}
    />,
  );
}

test('renders the Sun-Sat weekday header and the legend', () => {
  renderCalendar();
  for (const label of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) {
    assert.ok(screen.getByText(label));
  }
  assert.ok(screen.getByText('Away'));
  assert.ok(screen.getByText('Over cap'));
});

test('shows the error state and calls onRetry when it errors', () => {
  let retried = false;
  renderCalendar({ error: 'Failed to load', onRetry: () => (retried = true) });
  assert.ok(screen.getByText('Failed to load'));
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  assert.equal(retried, true);
});

test('shows a loading placeholder when loading with no rows yet', () => {
  renderCalendar({ loading: true, rows: [] });
  assert.ok(screen.getByText('Loading calendar…'));
});

test('a day with an absence shows the count badge and is clickable', () => {
  const dayRow = row({ startDate: '2026-01-10', endDate: '2026-01-10' });
  let selected: { dateIso: string; rows: AbsenceEntryDto[] } | null = null;
  renderCalendar({
    rows: [dayRow],
    onSelectDay: (dateIso, dayRows) => (selected = { dateIso, rows: dayRows }),
  });

  const dayButton = screen.getByRole('button', { name: /^10/ });
  assert.equal(within10Count(dayButton), '1');
  assert.equal(dayButton.hasAttribute('disabled'), false);

  fireEvent.click(dayButton);
  assert.deepEqual(selected, { dateIso: '2026-01-10', rows: [dayRow] });
});

function within10Count(el: HTMLElement): string {
  const countEl = el.querySelector('span.mt-auto');
  return countEl?.textContent?.trim() ?? '';
}

test('a day with no absence is disabled and does not invoke onSelectDay', () => {
  let called = false;
  renderCalendar({ rows: [], onSelectDay: () => (called = true) });
  const dayButton = screen.getByRole('button', { name: /^10/ });
  assert.equal(dayButton.hasAttribute('disabled'), true);
  fireEvent.click(dayButton);
  assert.equal(called, false);
});

test('an over-cap day uses the over-cap tone instead of the away tone', () => {
  const dayRow = row({ startDate: '2026-01-15', endDate: '2026-01-15' });
  renderCalendar({ rows: [dayRow], overCapDates: new Set(['2026-01-15']) });
  const dayButton = screen.getByRole('button', { name: /^15/ });
  assert.equal(dayButton.style.background, 'rgba(229, 72, 77, 0.2)');
});

test('a day within the visible grid but outside the month is dimmed', () => {
  const { container } = renderCalendar();
  const dec28 = toISODate(weeks[0][0]);
  assert.equal(dec28, '2025-12-28');
  // The grid also contains a Jan 28 cell, so "28" alone is ambiguous — the leading
  // (Dec) cell is the first button rendered, since weeks[0][0] is the grid's first day.
  const dayButton = container.querySelectorAll('button')[0];
  assert.equal(dayButton.textContent?.trim(), '28');
  assert.equal(dayButton.style.opacity, '0.45');
});
