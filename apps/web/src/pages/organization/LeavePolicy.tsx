import * as React from 'react';
import { Check } from 'lucide-react';
import type { LeaveTypeDto } from '@se/shared';
import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/button';
import { Toast, useToast } from '@/components/ui/toast';
import { ApiError, getAbsenceCap, listLeaveTypes, updateAbsenceCap, updateLeaveType } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/** Bottom-center toggle switch — mirrors the console Settings page's convention. */
function Toggle({ checked, disabled, onClick }: { checked: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onClick}
      disabled={disabled}
      className={`relative h-6 w-11 flex-none rounded-full transition-colors disabled:opacity-60 ${
        checked ? 'bg-brand' : 'bg-ink-300'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

interface RowEdit {
  quota: number;
  carryForward: boolean;
  halfDayAllowed: boolean;
}

function toEdit(t: LeaveTypeDto): RowEdit {
  return { quota: t.quota, carryForward: t.carryForward, halfDayAllowed: t.halfDayAllowed };
}

const GRID = 'grid-cols-[1.6fr_1fr_0.9fr_1.1fr_1.1fr_0.9fr]';

export default function LeavePolicy() {
  const { user } = useAuth();
  const [rows, setRows] = React.useState<LeaveTypeDto[] | null>(null);
  const [edits, setEdits] = React.useState<Record<string, RowEdit>>({});
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [cap, setCap] = React.useState<number | null>(null);
  const [capInput, setCapInput] = React.useState('');
  const [savingCap, setSavingCap] = React.useState(false);
  const { message, show } = useToast();

  const load = React.useCallback(() => {
    setError(null);
    listLeaveTypes()
      .then((res) => {
        setRows(res);
        setEdits(Object.fromEntries(res.map((t) => [t.id, toEdit(t)])));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Unable to load leave types.'));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    getAbsenceCap()
      .then((res) => {
        setCap(res.cap);
        setCapInput(String(res.cap));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Unable to load the absence cap.'));
  }, []);

  async function onSaveCap() {
    const value = Number(capInput);
    if (!Number.isInteger(value) || value < 1) return;
    setSavingCap(true);
    setError(null);
    try {
      const updated = await updateAbsenceCap({ cap: value });
      setCap(updated.cap);
      setCapInput(String(updated.cap));
      show('Concurrent absence cap updated.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to update the absence cap.');
    } finally {
      setSavingCap(false);
    }
  }

  function isDirty(t: LeaveTypeDto) {
    const edit = edits[t.id];
    return (
      !!edit &&
      (edit.quota !== t.quota || edit.carryForward !== t.carryForward || edit.halfDayAllowed !== t.halfDayAllowed)
    );
  }

  async function onSave(t: LeaveTypeDto) {
    const edit = edits[t.id];
    if (!edit) return;
    setSavingId(t.id);
    setError(null);
    try {
      const updated = await updateLeaveType(t.id, edit);
      setRows((prev) => prev?.map((row) => (row.id === updated.id ? updated : row)) ?? prev);
      setEdits((prev) => ({ ...prev, [updated.id]: toEdit(updated) }));
      show('Leave policy updated.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to update this leave type.');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Leave Policy & Quotas"
        subtitle="Configure annual quota, carry-forward, and half-day rules for each leave type."
        breadcrumb={`Organization · ${user?.tenantName ?? ''}`}
      />

      <div className="mt-[22px] flex items-center justify-between gap-4 rounded-xl border border-line-soft bg-surface px-[22px] py-[15px] shadow-card">
        <div>
          <div className="text-sm font-semibold text-ink-900">Concurrent Absence Cap</div>
          <div className="text-xs text-ink-400">
            Days where approved absences exceed this count are flagged on the Absence Calendar.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            value={capInput}
            onChange={(e) => setCapInput(e.target.value)}
            className="h-9 w-20 rounded-sm border border-line bg-surface px-2 text-sm text-ink-900 outline-none focus:border-brand"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={onSaveCap}
            disabled={cap === null || Number(capInput) === cap || savingCap}
          >
            <Check size={14} />
            {savingCap ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      <div className="mt-[14px] overflow-x-auto rounded-xl border border-line-soft bg-surface shadow-card">
        <div
          className={`grid ${GRID} min-w-[820px] bg-surface-muted px-[22px] py-[13px] text-[11px] font-semibold uppercase tracking-[.4px] text-ink-400`}
        >
          <span>Leave Type</span>
          <span>Quota</span>
          <span>Paid</span>
          <span>Carry Forward</span>
          <span>Half-day Allowed</span>
          <span className="text-right">Actions</span>
        </div>
        {rows === null ? (
          <div className="px-4 py-12 text-center text-sm text-ink-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-ink-400">No leave types configured.</div>
        ) : (
          rows.map((t) => {
            const edit = edits[t.id] ?? toEdit(t);
            const dirty = isDirty(t);
            return (
              <div
                key={t.id}
                className={`grid ${GRID} min-w-[820px] items-center border-b border-line-soft px-[22px] py-[15px] last:border-b-0`}
              >
                <span className="pr-3 text-sm font-semibold text-ink-900">{t.name}</span>
                <span>
                  <input
                    type="number"
                    min={0}
                    value={edit.quota}
                    onChange={(e) =>
                      setEdits((prev) => ({ ...prev, [t.id]: { ...edit, quota: Number(e.target.value) } }))
                    }
                    className="h-9 w-20 rounded-sm border border-line bg-surface px-2 text-sm text-ink-900 outline-none focus:border-brand"
                  />
                </span>
                <span>
                  {t.isPaid ? (
                    <span className="inline-flex items-center rounded-full bg-[rgb(233,246,233)] px-[10px] py-1 text-xs font-medium text-[rgb(33,131,88)]">
                      Paid
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-surface-muted px-[10px] py-1 text-xs font-medium text-ink-700">
                      Unpaid
                    </span>
                  )}
                </span>
                <span>
                  <Toggle
                    checked={edit.carryForward}
                    onClick={() =>
                      setEdits((prev) => ({ ...prev, [t.id]: { ...edit, carryForward: !edit.carryForward } }))
                    }
                  />
                </span>
                <span>
                  <Toggle
                    checked={edit.halfDayAllowed}
                    onClick={() =>
                      setEdits((prev) => ({ ...prev, [t.id]: { ...edit, halfDayAllowed: !edit.halfDayAllowed } }))
                    }
                  />
                </span>
                <div className="flex justify-end">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onSave(t)}
                    disabled={!dirty || savingId === t.id}
                  >
                    <Check size={14} />
                    {savingId === t.id ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {error && <div className="mt-3 text-sm font-medium text-danger">{error}</div>}
      <Toast message={message} />
    </>
  );
}
