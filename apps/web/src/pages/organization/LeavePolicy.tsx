import * as React from 'react';
import { Check, PencilLine, Plus, Trash2 } from 'lucide-react';
import type { CreateLeaveTypeRequest, LeaveTypeDto } from '@se/shared';
import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/button';
import { Overlay } from '@/components/ui/overlay';
import { Switch } from '@/components/ui/switch';
import { Toast, useToast } from '@/components/ui/toast';
import {
  ApiError,
  createLeaveType,
  deleteLeaveType,
  getAbsenceCap,
  listLeaveTypes,
  updateAbsenceCap,
  updateLeaveType,
} from '@/lib/api';
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

/** Modal toggle row — left label + muted sub, switch on the right (design's in-modal toggle convention). */
function ToggleRow({
  label,
  sub,
  checked,
  onClick,
}: {
  label: string;
  sub: string;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-[13px] font-semibold text-ink-900">{label}</div>
        <div className="text-xs text-ink-400">{sub}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onClick} aria-label={label} />
    </div>
  );
}

/** Create/edit dialog for a leave type — `leaveType === null` means create. */
function LeaveTypeModal({
  leaveType,
  onClose,
  onSaved,
}: {
  leaveType: LeaveTypeDto | null;
  onClose: () => void;
  onSaved: (saved: LeaveTypeDto) => void;
}) {
  const [name, setName] = React.useState(leaveType?.name ?? '');
  const [quota, setQuota] = React.useState(leaveType ? String(leaveType.quota) : '');
  const [isPaid, setIsPaid] = React.useState(leaveType?.isPaid ?? true);
  const [carryForward, setCarryForward] = React.useState(leaveType?.carryForward ?? false);
  const [halfDayAllowed, setHalfDayAllowed] = React.useState(leaveType?.halfDayAllowed ?? false);
  const [nameError, setNameError] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function onSave() {
    setError(null);
    setNameError(null);
    const trimmed = name.trim();
    if (!trimmed) return setNameError('Name is required.');
    if (trimmed.length > 100) return setNameError('Name must be 100 characters or fewer.');
    const quotaValue = Number(quota);
    if (quota.trim() === '' || !Number.isFinite(quotaValue) || quotaValue < 0)
      return setError('Annual quota must be zero or more.');
    setBusy(true);
    try {
      const body: CreateLeaveTypeRequest = {
        name: trimmed,
        quota: quotaValue,
        isPaid,
        carryForward,
        halfDayAllowed,
      };
      const saved = leaveType ? await updateLeaveType(leaveType.id, body) : await createLeaveType(body);
      onSaved(saved);
    } catch (err) {
      // The duplicate-name conflict belongs next to the name field, not the generic footer slot.
      if (err instanceof ApiError && err.status === 409) setNameError(err.message);
      else setError(err instanceof ApiError ? err.message : 'Unable to save the leave type.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Overlay onClose={onClose} z={60}>
      <div className="mx-auto w-full max-w-[480px] rounded-2xl bg-surface p-[26px] shadow-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[10px] bg-[rgb(236,245,246)] text-brand">
            {leaveType ? <PencilLine size={20} /> : <Plus size={20} />}
          </div>
          <div>
            <div className="text-lg font-bold text-ink-900">
              {leaveType ? 'Edit leave type' : 'New leave type'}
            </div>
            <div className="text-[13px] text-ink-400">
              {leaveType
                ? 'Rename the type or adjust its policy.'
                : 'Paid types open balances for active employees this period.'}
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-ink-900">Name</span>
            <div className="flex h-11 items-center rounded-sm border border-line bg-surface px-3">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Paternity Leave"
                className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink-900 outline-none"
              />
            </div>
            {nameError && <span className="text-sm font-medium text-danger">{nameError}</span>}
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-ink-900">Annual quota (days)</span>
            <div className="flex h-11 items-center rounded-sm border border-line bg-surface px-3">
              <input
                type="number"
                min={0}
                value={quota}
                onChange={(e) => setQuota(e.target.value)}
                className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink-900 outline-none"
              />
            </div>
          </label>

          <ToggleRow
            label="Paid"
            sub="Paid types carry a balance and deduct on approval."
            checked={isPaid}
            onClick={() => setIsPaid((v) => !v)}
          />
          <ToggleRow
            label="Carry forward"
            sub="Unused days roll over into the next period."
            checked={carryForward}
            onClick={() => setCarryForward((v) => !v)}
          />
          <ToggleRow
            label="Half-day allowed"
            sub="Employees can request half-day units of this type."
            checked={halfDayAllowed}
            onClick={() => setHalfDayAllowed((v) => !v)}
          />
        </div>

        {error && <div className="mt-4 text-sm font-medium text-danger">{error}</div>}

        <div className="mt-[22px] flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={busy}>
            <Check size={16} />
            {busy ? 'Saving…' : leaveType ? 'Save changes' : 'Create leave type'}
          </Button>
        </div>
      </div>
    </Overlay>
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

const GRID = 'grid-cols-[1.6fr_1fr_0.9fr_1.1fr_1.1fr_1.4fr]';

export default function LeavePolicy() {
  const { user } = useAuth();
  const [rows, setRows] = React.useState<LeaveTypeDto[] | null>(null);
  const [edits, setEdits] = React.useState<Record<string, RowEdit>>({});
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [cap, setCap] = React.useState<number | null>(null);
  const [capInput, setCapInput] = React.useState('');
  const [savingCap, setSavingCap] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<LeaveTypeDto | null>(null);
  const [deleting, setDeleting] = React.useState<LeaveTypeDto | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  /** Per-row delete-blocked reason, learned from the API's 409 on an attempted delete. */
  const [blocked, setBlocked] = React.useState<Record<string, string>>({});
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

  function onModalSaved(saved: LeaveTypeDto, created: boolean) {
    setAdding(false);
    setEditing(null);
    load();
    show(`${saved.name} ${created ? 'created' : 'updated'}`);
  }

  async function onConfirmDelete() {
    if (!deleting) return;
    const target = deleting;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteLeaveType(target.id);
      setDeleting(null);
      load();
      show(`${target.name} deleted`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // In use — remember the reason so the row's delete affordance shows as blocked.
        setBlocked((prev) => ({ ...prev, [target.id]: err.message }));
        setDeleting(null);
        show(err.message);
      } else {
        setDeleteError(err instanceof ApiError ? err.message : 'Unable to delete this leave type.');
      }
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Leave Policy & Quotas"
          subtitle="Configure annual quota, carry-forward, and half-day rules for each leave type."
          breadcrumb={`Organization · ${user?.tenantName ?? ''}`}
        />
        <Button size="lg" onClick={() => setAdding(true)}>
          <Plus size={18} />
          Add leave type
        </Button>
      </div>

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
          className={`grid ${GRID} min-w-[880px] bg-surface-muted px-[22px] py-[13px] text-[11px] font-semibold uppercase tracking-[.4px] text-ink-400`}
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
                className={`grid ${GRID} min-w-[880px] items-center border-b border-line-soft px-[22px] py-[15px] last:border-b-0`}
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
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onSave(t)}
                    disabled={!dirty || savingId === t.id}
                  >
                    <Check size={14} />
                    {savingId === t.id ? 'Saving…' : 'Save'}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setEditing(t)}
                    className="flex h-7 w-7 flex-none items-center justify-center rounded-[7px] border border-line text-ink-400 hover:bg-surface-muted"
                    aria-label={`Edit ${t.name}`}
                  >
                    <PencilLine size={14} />
                  </button>
                  <button
                    type="button"
                    aria-disabled={!!blocked[t.id]}
                    title={blocked[t.id]}
                    onClick={() => {
                      // A known-blocked row just resurfaces the reason instead of opening the confirm.
                      if (blocked[t.id]) return show(blocked[t.id]);
                      setDeleting(t);
                      setDeleteError(null);
                    }}
                    className={`flex h-7 w-7 flex-none items-center justify-center rounded-[7px] border border-line ${
                      blocked[t.id]
                        ? 'cursor-not-allowed text-ink-300 opacity-60'
                        : 'text-danger hover:bg-danger/10'
                    }`}
                    aria-label={`Delete ${t.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {error && <div className="mt-3 text-sm font-medium text-danger">{error}</div>}

      {(adding || editing) && (
        <LeaveTypeModal
          leaveType={editing}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onSaved={(saved) => onModalSaved(saved, editing === null)}
        />
      )}

      {deleting && (
        <Overlay onClose={() => setDeleting(null)} z={60}>
          <div className="mx-auto w-full max-w-[440px] rounded-xl bg-surface p-[26px] shadow-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[10px] bg-danger/[0.12] text-danger">
                <Trash2 size={22} />
              </div>
              <div className="text-lg font-bold text-ink-900">Delete leave type</div>
            </div>
            <div className="mt-[14px] text-[13.5px] leading-[1.6] text-ink-500">
              Delete <strong>{deleting.name}</strong>? This can&apos;t be undone — its unused
              balances are removed and employees can no longer request it.
            </div>
            {deleteError && <div className="mt-3 text-sm font-medium text-danger">{deleteError}</div>}
            <div className="mt-[22px] flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setDeleting(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={onConfirmDelete} disabled={deleteBusy}>
                {deleteBusy ? 'Deleting…' : 'Delete leave type'}
              </Button>
            </div>
          </div>
        </Overlay>
      )}

      <Toast message={message} />
    </>
  );
}
