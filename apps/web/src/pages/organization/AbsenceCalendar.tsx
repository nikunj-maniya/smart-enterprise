import * as React from 'react';
import { TriangleAlert } from 'lucide-react';
import { SystemRoleKey, type AbsenceEntryDto, type DepartmentsResponse, type OverCapDayDto, type ProjectsResponse } from '@se/shared';
import { PageHeader } from '@/components/shell/PageHeader';
import { AgendaView } from '@/components/absences/AgendaView';
import { DayDetailPanel } from '@/components/absences/DayDetailPanel';
import { AbsenceFilters, CalendarView, FilterBar } from '@/components/absences/FilterBar';
import { MonthCalendar } from '@/components/absences/MonthCalendar';
import {
  addMonths,
  formatDateRangeShort,
  formatDateShort,
  getMonthGrid,
  startOfMonth,
  toISODate,
} from '@/components/absences/absenceStyle';
import { apiFetch, ApiError, getAbsenceCap, getOverCapDays, listAbsences } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ErrorState, InitialsAvatar } from '@/pages/requests/shared';

const EMPTY_FILTERS: AbsenceFilters = { departmentId: '', projectId: '', type: '', personId: '' };

/**
 * Absence Calendar (absence-visibility: Enterprise Admin, HR Head, Project Manager, Tech Lead):
 * availability-only view of the tenant's leave/WFH calendar — this screen never renders a
 * `reason`, even for HR viewers whose `/absences` response does include one — plus the
 * over-concurrent-cap warning panel, which also flags the affected days directly in the grid.
 * The over-cap panel is HR/EA only (`getOverCapDays` 403s a `pm-tl` viewer by design, per
 * absences.service.ts) — skipped entirely for Project Manager/Tech Lead viewers.
 */
export default function AbsenceCalendar() {
  const { user } = useAuth();
  const [month, setMonth] = React.useState(() => startOfMonth(new Date()));
  const [filters, setFilters] = React.useState<AbsenceFilters>(EMPTY_FILTERS);
  const [view, setView] = React.useState<CalendarView>('month');
  const [rows, setRows] = React.useState<AbsenceEntryDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [departments, setDepartments] = React.useState<{ id: string; name: string }[]>([]);
  const [projects, setProjects] = React.useState<{ id: string; name: string }[]>([]);
  const [overCapDays, setOverCapDays] = React.useState<OverCapDayDto[]>([]);
  const [overCapError, setOverCapError] = React.useState<string | null>(null);
  const [cap, setCap] = React.useState<number | null>(null);
  const [selectedDay, setSelectedDay] = React.useState<{ dateIso: string; rows: AbsenceEntryDto[] } | null>(null);

  const grid = React.useMemo(() => getMonthGrid(month), [month]);
  const canSeeOverCap =
    (user?.roles.includes(SystemRoleKey.EnterpriseAdmin) ?? false) || (user?.roles.includes(SystemRoleKey.HrHead) ?? false);

  React.useEffect(() => {
    apiFetch<DepartmentsResponse>('/departments?pageSize=100').then((res) =>
      setDepartments(res.rows.map((d) => ({ id: d.id, name: d.name }))),
    );
    apiFetch<ProjectsResponse>('/projects?pageSize=100').then((res) =>
      setProjects(res.rows.map((p) => ({ id: p.id, name: p.name }))),
    );
    getAbsenceCap().then((res) => setCap(res.cap));
  }, []);

  const load = React.useCallback(() => {
    setLoading(true);
    setError(null);
    listAbsences({
      from: grid.from,
      to: grid.to,
      departmentId: filters.departmentId || undefined,
      projectId: filters.projectId || undefined,
      type: filters.type || undefined,
      personId: filters.personId || undefined,
    })
      .then((res) => setRows(res.rows))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Unable to load absences.'))
      .finally(() => setLoading(false));
  }, [grid, filters]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    if (!canSeeOverCap) return;
    setOverCapError(null);
    getOverCapDays({ from: grid.from, to: grid.to, projectId: filters.projectId || undefined })
      .then((res) => setOverCapDays(res.days))
      .catch((err) => setOverCapError(err instanceof ApiError ? err.message : 'Unable to load the over-cap warnings.'));
  }, [grid, filters.projectId, canSeeOverCap]);

  const people = React.useMemo(() => {
    const seen = new Map<string, string>();
    rows.forEach((r) => seen.set(r.personId, r.personName));
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const overCapDates = React.useMemo(() => new Set(overCapDays.map((d) => d.date)), [overCapDays]);

  const today = toISODate(new Date());
  const weekEnd = React.useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 6);
    return toISODate(d);
  }, []);
  const awayThisWeek = rows
    .filter((r) => r.startDate <= weekEnd && r.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  return (
    <>
      <PageHeader
        title="Absence Calendar"
        subtitle={`Approved leave and WFH across the org. Days exceeding the concurrent cap of ${cap ?? '…'} are flagged so you can spot coverage gaps.`}
        breadcrumb={`Organization · ${user?.tenantName ?? ''}`}
      />

      <FilterBar
        month={month}
        onPrevMonth={() => setMonth((m) => addMonths(m, -1))}
        onNextMonth={() => setMonth((m) => addMonths(m, 1))}
        onToday={() => setMonth(startOfMonth(new Date()))}
        departments={departments}
        projects={projects}
        people={people}
        filters={filters}
        onFiltersChange={setFilters}
        view={view}
        onViewChange={setView}
      />

      <div className="mt-[18px] flex items-start gap-[18px]">
        <div className="min-w-0 flex-1">
          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : view === 'month' ? (
            <MonthCalendar
              month={month}
              weeks={grid.weeks}
              rows={rows}
              loading={loading}
              error={null}
              onRetry={load}
              overCapDates={overCapDates}
              onSelectDay={(dateIso, dayRows) => setSelectedDay({ dateIso, rows: dayRows })}
            />
          ) : (
            <AgendaView rows={rows} loading={loading} error={null} onRetry={load} showReason={false} />
          )}
        </div>

        <div className="flex w-[300px] flex-none flex-col gap-[18px]">
          <div className="rounded-[14px] border border-line-soft bg-surface p-[18px] shadow-card">
            <div className="text-[13px] font-bold text-ink-900">Away this week</div>
            <div className="mt-[10px] flex flex-col gap-[8px]">
              {awayThisWeek.length === 0 ? (
                <div className="text-[12.5px] text-ink-400">No one away in the next 7 days.</div>
              ) : (
                awayThisWeek.map((r) => (
                  <div key={r.requestId} className="flex items-center gap-[11px] text-[13px]">
                    <InitialsAvatar name={r.personName} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold text-ink-900">{r.personName}</div>
                      <div className="text-[12px] text-ink-400">{formatDateRangeShort(r.startDate, r.endDate)}</div>
                    </div>
                    <span
                      className="flex-none rounded-full px-[8px] py-[2px] text-[11px] font-medium"
                      style={{
                        background: r.type === 'leave' ? 'rgb(230,244,254)' : 'rgb(233,246,233)',
                        color: r.type === 'leave' ? 'rgb(0,144,255)' : 'rgb(33,131,88)',
                      }}
                    >
                      {r.type === 'leave' ? 'Leave' : 'WFH'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {canSeeOverCap && (overCapError ? (
            <div className="rounded-[14px] border border-line-soft bg-surface p-[18px] shadow-card text-[12.5px] text-danger">
              {overCapError}
            </div>
          ) : (
            overCapDays.length > 0 && (
              <div
                className="rounded-[14px] p-[20px]"
                style={{ background: 'rgba(229,72,77,.06)', border: '1px solid rgba(229,72,77,.25)' }}
              >
                <div className="mb-[12px] flex items-center gap-[9px] text-[14px] font-bold text-danger">
                  <TriangleAlert size={18} />
                  Over concurrent cap
                </div>
                <div className="flex flex-col gap-[10px]">
                  {overCapDays.map((d) => (
                    <div key={d.date}>
                      <div className="text-[13px] font-semibold text-ink-900">
                        {formatDateShort(d.date)} · {d.count} people away
                      </div>
                      <div className="mt-[2px] text-[12px] text-ink-500">{d.people.map((p) => p.personName).join(', ')}</div>
                    </div>
                  ))}
                </div>
              </div>
            )
          ))}
        </div>
      </div>

      {selectedDay && (
        <DayDetailPanel
          dateIso={selectedDay.dateIso}
          rows={selectedDay.rows}
          showReason={false}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </>
  );
}
