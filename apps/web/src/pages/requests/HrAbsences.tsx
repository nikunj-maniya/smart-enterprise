import * as React from 'react';
import { Briefcase, House, Plane, TriangleAlert, type LucideIcon } from 'lucide-react';
import {
  SystemRoleKey,
  type AbsenceEntryDto,
  type DepartmentsResponse,
  type ProjectsResponse,
} from '@se/shared';
import { PageHeader } from '@/components/shell/PageHeader';
import { AgendaView } from '@/components/absences/AgendaView';
import { DayDetailPanel } from '@/components/absences/DayDetailPanel';
import { AbsenceFilters, CalendarView, FilterBar } from '@/components/absences/FilterBar';
import { MonthCalendar } from '@/components/absences/MonthCalendar';
import {
  addMonths,
  formatDateRangeShort,
  getMonthGrid,
  rowOverlapsDate,
  startOfMonth,
  toISODate,
} from '@/components/absences/absenceStyle';
import { apiFetch, ApiError, getAbsenceCap, listAbsences, listApprovalQueue } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ErrorState, InitialsAvatar } from './shared';

function StatCard({ icon: Icon, value, label, bg, fg }: { icon: LucideIcon; value: number; label: string; bg: string; fg: string }) {
  return (
    <div className="flex flex-col gap-[10px] rounded-lg border border-line-soft bg-surface p-4 shadow-card">
      <div className="flex h-8 w-8 items-center justify-center rounded-sm" style={{ background: bg, color: fg }}>
        <Icon size={18} />
      </div>
      <div className="text-[28px] font-bold leading-[1.1] text-ink-900">{value}</div>
      <div className="text-xs text-ink-400">{label}</div>
    </div>
  );
}

const EMPTY_FILTERS: AbsenceFilters = { departmentId: '', projectId: '', type: '', personId: '' };

/**
 * HR Absences (absence-visibility, HR Head only client-side — the backend enforces access):
 * the tenant-wide leave/WFH calendar with full detail (reason included, per the `hr` scope),
 * plus "away this week" and "by project" side panels derived from the same loaded month.
 */
export default function HrAbsences() {
  const { user } = useAuth();
  const [month, setMonth] = React.useState(() => startOfMonth(new Date()));
  const [filters, setFilters] = React.useState<AbsenceFilters>(EMPTY_FILTERS);
  const [view, setView] = React.useState<CalendarView>('month');
  const [rows, setRows] = React.useState<AbsenceEntryDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [departments, setDepartments] = React.useState<{ id: string; name: string }[]>([]);
  const [projects, setProjects] = React.useState<{ id: string; name: string }[]>([]);
  const [awaitingCount, setAwaitingCount] = React.useState(0);
  const [cap, setCap] = React.useState<number | null>(null);
  const [selectedDay, setSelectedDay] = React.useState<{ dateIso: string; rows: AbsenceEntryDto[] } | null>(null);

  const grid = React.useMemo(() => getMonthGrid(month), [month]);

  React.useEffect(() => {
    apiFetch<DepartmentsResponse>('/departments?pageSize=100').then((res) =>
      setDepartments(res.rows.map((d) => ({ id: d.id, name: d.name }))),
    );
    apiFetch<ProjectsResponse>('/projects?pageSize=100').then((res) =>
      setProjects(res.rows.map((p) => ({ id: p.id, name: p.name }))),
    );
    listApprovalQueue({ tab: 'pending', roleContext: SystemRoleKey.HrHead }).then((res) =>
      setAwaitingCount(res.awaitingCount),
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

  const people = React.useMemo(() => {
    const seen = new Map<string, string>();
    rows.forEach((r) => seen.set(r.personId, r.personName));
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const today = toISODate(new Date());
  const onLeaveToday = rows.filter((r) => r.type === 'leave' && rowOverlapsDate(r, today)).length;
  const wfhToday = rows.filter((r) => r.type === 'wfh' && rowOverlapsDate(r, today)).length;

  const weekEnd = React.useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 6);
    return toISODate(d);
  }, []);
  const awayThisWeek = rows
    .filter((r) => r.startDate <= weekEnd && r.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  const byProject = React.useMemo(() => {
    const groups = new Map<string, AbsenceEntryDto[]>();
    rows.forEach((r) => {
      const key = r.projectName ?? 'No project';
      groups.set(key, [...(groups.get(key) ?? []), r]);
    });
    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [rows]);

  return (
    <>
      <PageHeader
        breadcrumb={`HR Head · ${user?.tenantName ?? ''}`}
        title="Organization Absences"
        subtitle={`Every approved leave and WFH across the org. Days over the concurrent cap of ${cap ?? '…'} are flagged for coverage risk.`}
      />

      <div className="mt-[22px] grid grid-cols-[repeat(auto-fill,minmax(200px,220px))] gap-[18px]">
        <StatCard icon={Plane} value={onLeaveToday} label="On leave today" bg="rgb(255,247,237)" fg="rgb(247,107,21)" />
        <StatCard icon={House} value={wfhToday} label="WFH today" bg="rgb(230,244,254)" fg="rgb(0,144,255)" />
        <StatCard icon={TriangleAlert} value={awaitingCount} label="Awaiting sign-off" bg="rgb(254,235,236)" fg="rgb(229,72,77)" />
      </div>

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
              onSelectDay={(dateIso, dayRows) => setSelectedDay({ dateIso, rows: dayRows })}
            />
          ) : (
            <AgendaView rows={rows} loading={loading} error={null} onRetry={load} showReason />
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

          <div className="rounded-[14px] border border-line-soft bg-surface p-[18px] shadow-card">
            <div className="flex items-center gap-2 text-[13px] font-bold text-ink-900">
              <Briefcase size={14} />
              By project
            </div>
            <div className="mt-[10px] flex flex-col gap-[8px]">
              {byProject.length === 0 ? (
                <div className="text-[12.5px] text-ink-400">No absences loaded for this month.</div>
              ) : (
                byProject.map(([name, entries]) => (
                  <div key={name} className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="truncate text-ink-700">{name}</span>
                    <span className="flex-none text-[12.5px] font-semibold text-ink-400">{entries.length}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {selectedDay && (
        <DayDetailPanel
          dateIso={selectedDay.dateIso}
          rows={selectedDay.rows}
          showReason
          onClose={() => setSelectedDay(null)}
        />
      )}
    </>
  );
}
