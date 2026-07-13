import * as React from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, LayoutGrid, ListTodo } from 'lucide-react';
import type { AbsenceType } from '@se/shared';
import { monthLabel } from './absenceStyle';

export interface AbsenceFilters {
  departmentId: string;
  projectId: string;
  type: AbsenceType | '';
  personId: string;
}

export type CalendarView = 'month' | 'agenda';

function FilterSelect({
  value,
  placeholder,
  options,
  onChange,
}: {
  value: string;
  placeholder: string;
  options: { id: string; name: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative flex items-center">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`h-9 appearance-none rounded-sm border border-line bg-surface py-0 pl-3 pr-8 text-[13px] outline-none ${
          value ? 'text-ink-900' : 'text-ink-400'
        }`}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id} className="text-ink-900">
            {o.name}
          </option>
        ))}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2 text-ink-400" />
    </div>
  );
}

/** Month nav + department/project/type/person filters + the Month/Agenda view toggle, shared
 *  between the HR Absences and Admin Absence Calendar screens. */
export function FilterBar({
  month,
  onPrevMonth,
  onNextMonth,
  onToday,
  departments,
  projects,
  people,
  filters,
  onFiltersChange,
  view,
  onViewChange,
}: {
  month: Date;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
  departments: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  people: { id: string; name: string }[];
  filters: AbsenceFilters;
  onFiltersChange: (next: AbsenceFilters) => void;
  view: CalendarView;
  onViewChange: (v: CalendarView) => void;
}) {
  return (
    <div className="mt-[22px] flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPrevMonth}
          aria-label="Previous month"
          className="flex h-9 w-9 items-center justify-center rounded-sm border border-line bg-surface text-ink-500 hover:bg-surface-muted"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="w-[150px] text-center text-[14px] font-bold text-ink-900">{monthLabel(month)}</div>
        <button
          type="button"
          onClick={onNextMonth}
          aria-label="Next month"
          className="flex h-9 w-9 items-center justify-center rounded-sm border border-line bg-surface text-ink-500 hover:bg-surface-muted"
        >
          <ChevronRight size={16} />
        </button>
        <button
          type="button"
          onClick={onToday}
          className="h-9 rounded-sm border border-line bg-surface px-3 text-[13px] font-semibold text-ink-700 hover:bg-surface-muted"
        >
          Today
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          value={filters.departmentId}
          placeholder="All departments"
          options={departments}
          onChange={(v) => onFiltersChange({ ...filters, departmentId: v })}
        />
        <FilterSelect
          value={filters.projectId}
          placeholder="All projects"
          options={projects}
          onChange={(v) => onFiltersChange({ ...filters, projectId: v })}
        />
        <FilterSelect
          value={filters.type}
          placeholder="Leave & WFH"
          options={[
            { id: 'leave', name: 'Leave' },
            { id: 'wfh', name: 'WFH' },
          ]}
          onChange={(v) => onFiltersChange({ ...filters, type: v as AbsenceType | '' })}
        />
        <FilterSelect
          value={filters.personId}
          placeholder="Everyone"
          options={people}
          onChange={(v) => onFiltersChange({ ...filters, personId: v })}
        />

        <div className="flex gap-2 rounded-[10px] border border-line-soft bg-surface p-[5px]">
          <button
            type="button"
            aria-pressed={view === 'month'}
            onClick={() => onViewChange('month')}
            className="flex items-center gap-[6px] rounded-[7px] px-3 py-[6px] text-[13px] font-semibold transition-colors"
            style={
              view === 'month'
                ? { background: 'var(--brand)', color: 'var(--brand-ink)' }
                : { background: 'transparent', color: 'var(--ink-500)' }
            }
          >
            <LayoutGrid size={14} />
            Month
          </button>
          <button
            type="button"
            aria-pressed={view === 'agenda'}
            onClick={() => onViewChange('agenda')}
            className="flex items-center gap-[6px] rounded-[7px] px-3 py-[6px] text-[13px] font-semibold transition-colors"
            style={
              view === 'agenda'
                ? { background: 'var(--brand)', color: 'var(--brand-ink)' }
                : { background: 'transparent', color: 'var(--ink-500)' }
            }
          >
            <ListTodo size={14} />
            Agenda
          </button>
        </div>
      </div>
    </div>
  );
}
