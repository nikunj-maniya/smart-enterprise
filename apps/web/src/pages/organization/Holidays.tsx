import * as React from 'react';
import { CalendarDays, Check, PencilLine, Plus, Trash2 } from 'lucide-react';
import type { HolidayDto } from '@se/shared';
import { dateFromDay } from '@/components/absences/absenceStyle';
import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/button';
import { Overlay } from '@/components/ui/overlay';
import { Select } from '@/components/ui/select';
import { Toast, useToast } from '@/components/ui/toast';
import { ApiError, createHoliday, deleteHoliday, listHolidays, updateHoliday } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ErrorState } from '@/pages/requests/shared';

/** "Mon, 26 Jan 2026" — `dateFromDay` keeps the calendar day stable across timezones. */
function formatHolidayDate(iso: string): string {
  return dateFromDay(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function isWeekend(iso: string): boolean {
  const dow = dateFromDay(iso).getDay();
  return dow === 0 || dow === 6;
}

function HolidayModal({
  holiday,
  onClose,
  onSaved,
}: {
  holiday: HolidayDto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = React.useState(holiday?.date ?? '');
  const [name, setName] = React.useState(holiday?.name ?? '');
  const [dateError, setDateError] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function onSave() {
    setError(null);
    setDateError(null);
    if (!date) return setDateError('Date is required.');
    const trimmed = name.trim();
    if (!trimmed) return setError('Holiday name is required.');
    if (trimmed.length > 100) return setError('Holiday name must be 100 characters or fewer.');
    setBusy(true);
    try {
      if (holiday) await updateHoliday(holiday.id, { date, name: trimmed });
      else await createHoliday({ date, name: trimmed });
      onSaved();
    } catch (err) {
      // The duplicate-date conflict belongs next to the date field, not the generic footer slot.
      if (err instanceof ApiError && err.status === 409) setDateError(err.message);
      else setError(err instanceof ApiError ? err.message : 'Unable to save the holiday.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Overlay onClose={onClose} z={60}>
      <div className="mx-auto w-full max-w-[480px] rounded-2xl bg-surface p-[26px] shadow-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[10px] bg-[rgb(236,245,246)] text-brand">
            <CalendarDays size={20} />
          </div>
          <div className="text-lg font-bold text-ink-900">
            {holiday ? 'Edit holiday' : 'New holiday'}
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-ink-900">Date</span>
            <div className="flex h-11 items-center rounded-sm border border-line bg-surface px-3">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink-900 outline-none"
              />
            </div>
            {dateError && <span className="text-sm font-medium text-danger">{dateError}</span>}
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-ink-900">Holiday name</span>
            <div className="flex h-11 items-center rounded-sm border border-line bg-surface px-3">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Republic Day"
                className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink-900 outline-none"
              />
            </div>
          </label>
        </div>

        {error && <div className="mt-4 text-sm font-medium text-danger">{error}</div>}

        <div className="mt-[22px] flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={busy}>
            <Check size={16} />
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </Overlay>
  );
}

export default function Holidays() {
  const { user } = useAuth();
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1];
  const [year, setYear] = React.useState(currentYear);
  const [rows, setRows] = React.useState<HolidayDto[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<HolidayDto | null>(null);
  const [deleting, setDeleting] = React.useState<HolidayDto | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const { message, show } = useToast();

  const load = React.useCallback(() => {
    setError(null);
    listHolidays(year)
      .then((res) => setRows(res.rows))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Unable to load holidays.'));
  }, [year]);

  React.useEffect(() => {
    load();
  }, [load]);

  function onSaved(created: boolean) {
    setCreating(false);
    setEditing(null);
    load();
    show(created ? 'Holiday added' : 'Holiday updated');
  }

  async function onConfirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteHoliday(deleting.id);
      setDeleting(null);
      load();
      show('Holiday deleted');
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Unable to delete the holiday.');
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Holidays"
          subtitle="Company holidays excluded from working days when computing the attendance report."
          breadcrumb={`Organization · ${user?.tenantName ?? ''}`}
        />
        <Button size="lg" onClick={() => setCreating(true)}>
          <Plus size={18} />
          Add holiday
        </Button>
      </div>

      <div className="mt-[22px] flex items-center gap-3">
        <Select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Year">
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
      </div>

      {error ? (
        <div className="mt-[18px]">
          <ErrorState message={error} onRetry={load} />
        </div>
      ) : rows === null ? (
        <div className="mt-8 text-center text-sm text-ink-400">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="mt-[18px] rounded-[14px] border border-dashed border-line bg-surface p-12 text-center text-sm text-ink-400">
          No holidays configured for {year} yet.
        </div>
      ) : (
        <div className="mt-[18px] rounded-xl border border-line-soft bg-surface shadow-card">
          {rows.map((h) => (
            <div
              key={h.id}
              className="flex items-center gap-3 border-b border-line-soft px-[22px] py-[13px] last:border-b-0"
            >
              <div className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-[rgb(236,245,246)] text-brand">
                <CalendarDays size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-ink-900">{h.name}</div>
                <div className="text-xs text-ink-400">
                  {formatHolidayDate(h.date)}
                  {/* Weekend dates are accepted but never change working days — flag them. */}
                  {isWeekend(h.date) && <span className="ml-2 text-ink-300">Weekend</span>}
                </div>
              </div>
              <button
                className="flex flex-none rounded-[7px] p-[6px] text-ink-400 hover:bg-surface-muted"
                onClick={() => setEditing(h)}
                aria-label={`Edit ${h.name}`}
              >
                <PencilLine size={16} />
              </button>
              <button
                className="flex flex-none rounded-[7px] p-[6px] text-ink-400 hover:bg-danger/10 hover:text-danger"
                onClick={() => {
                  setDeleting(h);
                  setDeleteError(null);
                }}
                aria-label={`Delete ${h.name}`}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <HolidayModal
          holiday={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => onSaved(editing === null)}
        />
      )}

      {deleting && (
        <Overlay onClose={() => setDeleting(null)} z={60}>
          <div className="mx-auto w-full max-w-[440px] rounded-xl bg-surface p-[26px] shadow-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[10px] bg-danger/[0.12] text-danger">
                <Trash2 size={22} />
              </div>
              <div className="text-lg font-bold text-ink-900">Delete holiday</div>
            </div>
            <div className="mt-[14px] text-[13.5px] leading-[1.6] text-ink-500">
              Delete <strong>{deleting.name}</strong> ({formatHolidayDate(deleting.date)})? This
              can&apos;t be undone, and the day counts as a working day again.
            </div>
            {deleteError && (
              <div className="mt-3 text-sm font-medium text-danger">{deleteError}</div>
            )}
            <div className="mt-[22px] flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setDeleting(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={onConfirmDelete} disabled={deleteBusy}>
                {deleteBusy ? 'Deleting…' : 'Delete holiday'}
              </Button>
            </div>
          </div>
        </Overlay>
      )}

      <Toast message={message} />
    </>
  );
}
