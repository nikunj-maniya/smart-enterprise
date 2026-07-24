import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FilterBar, type AbsenceFilters } from './FilterBar';

afterEach(cleanup);

const emptyFilters: AbsenceFilters = { departmentId: '', projectId: '', type: '', personId: '' };
const departments = [{ id: 'd-1', name: 'Engineering' }];
const projects = [{ id: 'p-1', name: 'Apollo' }];
const people = [{ id: 'u-1', name: 'Ada Lovelace' }];

function renderBar(overrides: {
  month?: Date;
  filters?: AbsenceFilters;
  view?: 'month' | 'agenda';
  onPrevMonth?: () => void;
  onNextMonth?: () => void;
  onToday?: () => void;
  onFiltersChange?: (next: AbsenceFilters) => void;
  onViewChange?: (v: 'month' | 'agenda') => void;
} = {}) {
  return render(
    <FilterBar
      month={overrides.month ?? new Date(2026, 0, 1)}
      onPrevMonth={overrides.onPrevMonth ?? (() => {})}
      onNextMonth={overrides.onNextMonth ?? (() => {})}
      onToday={overrides.onToday ?? (() => {})}
      departments={departments}
      projects={projects}
      people={people}
      filters={overrides.filters ?? emptyFilters}
      onFiltersChange={overrides.onFiltersChange ?? (() => {})}
      view={overrides.view ?? 'month'}
      onViewChange={overrides.onViewChange ?? (() => {})}
    />,
  );
}

test('renders the month label', () => {
  renderBar({ month: new Date(2026, 0, 1) });
  assert.ok(screen.getByText(new Date(2026, 0, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })));
});

test('prev, next, and today buttons invoke their callbacks', () => {
  let prev = false;
  let next = false;
  let today = false;
  renderBar({
    onPrevMonth: () => (prev = true),
    onNextMonth: () => (next = true),
    onToday: () => (today = true),
  });

  fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
  fireEvent.click(screen.getByRole('button', { name: 'Today' }));

  assert.equal(prev, true);
  assert.equal(next, true);
  assert.equal(today, true);
});

test('changing the department select reports the new filters, leaving the rest untouched', () => {
  let latest: AbsenceFilters | null = null;
  renderBar({ onFiltersChange: (next) => (latest = next) });
  fireEvent.change(screen.getByDisplayValue('All departments'), { target: { value: 'd-1' } });
  assert.deepEqual(latest, { ...emptyFilters, departmentId: 'd-1' });
});

test('changing the project select reports the new filters', () => {
  let latest: AbsenceFilters | null = null;
  renderBar({ onFiltersChange: (next) => (latest = next) });
  fireEvent.change(screen.getByDisplayValue('All projects'), { target: { value: 'p-1' } });
  assert.deepEqual(latest, { ...emptyFilters, projectId: 'p-1' });
});

test('changing the type select reports the new filters', () => {
  let latest: AbsenceFilters | null = null;
  renderBar({ onFiltersChange: (next) => (latest = next) });
  fireEvent.change(screen.getByDisplayValue('Leave & WFH'), { target: { value: 'wfh' } });
  assert.deepEqual(latest, { ...emptyFilters, type: 'wfh' });
});

test('changing the person select reports the new filters', () => {
  let latest: AbsenceFilters | null = null;
  renderBar({ onFiltersChange: (next) => (latest = next) });
  fireEvent.change(screen.getByDisplayValue('Everyone'), { target: { value: 'u-1' } });
  assert.deepEqual(latest, { ...emptyFilters, personId: 'u-1' });
});

test('the Month/Agenda toggle reflects the current view and invokes onViewChange', () => {
  let view: 'month' | 'agenda' | null = null;
  renderBar({ view: 'month', onViewChange: (v) => (view = v) });

  const monthButton = screen.getByRole('button', { name: /Month/ });
  const agendaButton = screen.getByRole('button', { name: /Agenda/ });
  assert.equal(monthButton.getAttribute('aria-pressed'), 'true');
  assert.equal(agendaButton.getAttribute('aria-pressed'), 'false');

  fireEvent.click(agendaButton);
  assert.equal(view, 'agenda');
});
