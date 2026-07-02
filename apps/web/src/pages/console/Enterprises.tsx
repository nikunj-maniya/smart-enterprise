import * as React from 'react';
import { PauseCircle } from 'lucide-react';
import { EnterpriseStatus, type EnterpriseDto } from '@se/shared';
import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/button';
import { Overlay } from '@/components/ui/overlay';
import { apiFetch } from '@/lib/api';

const GRID_COLS = 'grid-cols-[2fr_1.2fr_1fr_1fr_1fr_1.3fr]';

const STATUS_STYLE: Record<EnterpriseDto['status'], { bg: string; fg: string; dot: string }> = {
  [EnterpriseStatus.Active]: { bg: 'rgb(233,246,233)', fg: 'rgb(33,131,88)', dot: 'rgb(70,167,88)' },
  [EnterpriseStatus.Suspended]: { bg: 'rgb(254,235,236)', fg: 'rgb(206,44,49)', dot: 'rgb(229,72,77)' },
};

function initials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function StatusBadge({ status }: { status: EnterpriseDto['status'] }) {
  const c = STATUS_STYLE[status];
  return (
    <span
      className="inline-flex items-center gap-[6px] rounded-full px-[10px] py-1 text-xs font-medium"
      style={{ background: c.bg, color: c.fg }}
    >
      <span className="h-[6px] w-[6px] flex-none rounded-full" style={{ background: c.dot }} />
      {status}
    </span>
  );
}

export default function Enterprises() {
  const [rows, setRows] = React.useState<EnterpriseDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState<EnterpriseDto | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setRows(await apiFetch<EnterpriseDto[]>('/enterprises'));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function onConfirmSuspend() {
    if (!confirming) return;
    setBusyId(confirming.id);
    try {
      await apiFetch(`/enterprises/${confirming.id}/suspend`, { method: 'POST' });
      setConfirming(null);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function onReactivate(enterprise: EnterpriseDto) {
    setBusyId(enterprise.id);
    try {
      await apiFetch(`/enterprises/${enterprise.id}/reactivate`, { method: 'POST' });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Enterprises"
        subtitle="All onboarded tenants. Suspend an enterprise to block its users from signing in."
      />

      <div className="mt-[22px] overflow-x-auto rounded-lg border border-line-soft bg-surface shadow-card">
        <div
          className={`grid ${GRID_COLS} min-w-[820px] bg-surface-muted px-[22px] py-[13px] text-[11px] font-semibold uppercase tracking-[.4px] text-ink-400`}
        >
          <span>Enterprise</span>
          <span>Industry</span>
          <span>Users</span>
          <span>Onboarded</span>
          <span>Status</span>
          <span className="text-right">Actions</span>
        </div>
        {rows.map((enterprise) => (
          <div
            key={enterprise.id}
            className={`grid ${GRID_COLS} min-w-[820px] items-center border-b border-line-soft px-[22px] py-[15px] last:border-b-0`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[9px] bg-[rgb(236,245,246)] text-[13px] font-bold text-brand">
                {initials(enterprise.name)}
              </div>
              <div className="truncate text-sm font-semibold text-ink-900">{enterprise.name}</div>
            </div>
            <span className="text-[13px] text-ink-700">{enterprise.industry ?? '—'}</span>
            <span className="text-[13px] text-ink-700">{enterprise.users}</span>
            <span className="text-[13px] text-ink-700">
              {new Date(enterprise.since).toLocaleDateString()}
            </span>
            <span>
              <StatusBadge status={enterprise.status} />
            </span>
            <div className="flex justify-end">
              {enterprise.status === EnterpriseStatus.Active ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setConfirming(enterprise)}
                  disabled={busyId === enterprise.id}
                >
                  Suspend
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onReactivate(enterprise)}
                  disabled={busyId === enterprise.id}
                >
                  {busyId === enterprise.id ? 'Reactivating…' : 'Reactivate'}
                </Button>
              )}
            </div>
          </div>
        ))}
        {!loading && rows.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-ink-400">No enterprises yet.</div>
        )}
        {loading && <div className="px-4 py-12 text-center text-sm text-ink-400">Loading…</div>}
      </div>

      {confirming && (
        <Overlay onClose={() => setConfirming(null)}>
          <div className="mx-auto w-full max-w-[440px] rounded-xl bg-surface p-[26px] shadow-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[10px] bg-danger/[0.12] text-danger">
                <PauseCircle size={22} />
              </div>
              <div className="text-lg font-bold text-ink-900">Suspend enterprise</div>
            </div>
            <div className="mt-[14px] text-[13.5px] leading-[1.6] text-ink-500">
              Suspending <strong>{confirming.name}</strong> immediately blocks all its users from
              signing in. You can reactivate it at any time.
            </div>
            <div className="mt-[22px] flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setConfirming(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={onConfirmSuspend} disabled={busyId === confirming.id}>
                {busyId === confirming.id ? 'Suspending…' : 'Confirm Suspend'}
              </Button>
            </div>
          </div>
        </Overlay>
      )}
    </>
  );
}
