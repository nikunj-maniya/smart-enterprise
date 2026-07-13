import * as React from 'react';
import { CheckCircle2, Clock, PlayCircle, Send, UserCheck, Wrench, type LucideIcon } from 'lucide-react';
import type { FulfilmentQueueItemDto, FulfilmentQueueTab } from '@se/shared';
import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/button';
import { Toast, useToast } from '@/components/ui/toast';
import { ApiError, claimFulfilmentRequest, getFulfilmentQueue, transitionRequest } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { EmptyState, ErrorState, InitialsAvatar, StatusBadge } from './shared';

const TAB_LABEL: Record<FulfilmentQueueTab, string> = { open: 'Open', fulfilled: 'Fulfilled' };

const TAB_EMPTY_MESSAGE: Record<FulfilmentQueueTab, string> = {
  open: 'No open fulfilment requests.',
  fulfilled: 'No fulfilled requests yet.',
};

const IMPACT_TONE: Record<string, { bg: string; fg: string }> = {
  Blocker: { bg: 'rgb(254,235,236)', fg: 'rgb(206,44,49)' },
  Medium: { bg: 'rgb(255,247,237)', fg: 'rgb(204,78,0)' },
  Low: { bg: 'rgb(241,242,242)', fg: 'var(--ink-500)' },
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/**
 * IT Admin's fulfilment queue (fulfilment-queue spec): approved software/hardware requests
 * awaiting fulfilment, claimed and moved through In Progress → Fulfilled by the assigned IT
 * Admin. Backend enforces IT-Admin-only access (403 surfaced via ErrorState for anyone else).
 */
export default function FulfilmentQueue() {
  const { user } = useAuth();
  const [tab, setTab] = React.useState<FulfilmentQueueTab>('open');
  const [rows, setRows] = React.useState<FulfilmentQueueItemDto[] | null>(null);
  const [counts, setCounts] = React.useState({ queuedCount: 0, inProgressCount: 0, fulfilledCount: 0 });
  const [error, setError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [actionErrors, setActionErrors] = React.useState<Record<string, string>>({});
  const { message, show } = useToast();

  const load = React.useCallback(() => {
    setError(null);
    getFulfilmentQueue(tab)
      .then((res) => {
        setRows(res.rows);
        setCounts({ queuedCount: res.queuedCount, inProgressCount: res.inProgressCount, fulfilledCount: res.fulfilledCount });
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Unable to load the fulfilment queue.'));
  }, [tab]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function withBusy(requestId: string, action: () => Promise<unknown>, successMessage: string) {
    setBusyId(requestId);
    setActionErrors((prev) => ({ ...prev, [requestId]: '' }));
    try {
      await action();
      show(successMessage);
      load();
    } catch (err) {
      setActionErrors((prev) => ({
        ...prev,
        [requestId]: err instanceof ApiError ? err.message : 'Unable to update this request.',
      }));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader
        breadcrumb={`Workspace · ${user?.tenantName ?? ''}`}
        title="Fulfilment Queue"
        subtitle="Approved software and hardware requests — claim, fulfil, and hand them over."
      />

      <div className="mt-[22px] grid grid-cols-[repeat(auto-fill,minmax(200px,220px))] gap-[18px]">
        <StatCard icon={Clock} value={counts.queuedCount} label="Queued" bg="rgb(255,247,237)" fg="rgb(204,78,0)" />
        <StatCard icon={PlayCircle} value={counts.inProgressCount} label="In progress" bg="rgb(230,244,254)" fg="rgb(0,144,255)" />
        <StatCard icon={CheckCircle2} value={counts.fulfilledCount} label="Fulfilled" bg="rgb(233,246,233)" fg="rgb(33,131,88)" />
      </div>

      <div className="mt-[22px] flex w-fit gap-2 rounded-[10px] border border-line-soft bg-surface p-[5px]">
        {(Object.keys(TAB_LABEL) as FulfilmentQueueTab[]).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
            className="rounded-[7px] px-4 py-2 text-[13px] font-semibold transition-colors"
            style={
              tab === t
                ? { background: 'var(--brand)', color: 'var(--brand-ink)' }
                : { background: 'transparent', color: 'var(--ink-500)' }
            }
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      <div className="mt-[18px] flex max-w-[920px] flex-col gap-[14px]">
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : rows === null ? (
          <div className="rounded-[14px] border border-line-soft bg-surface p-12 text-center text-sm text-ink-400 shadow-card">
            Loading fulfilment queue…
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Wrench} heading="Nothing here" message={TAB_EMPTY_MESSAGE[tab]} />
        ) : (
          rows.map((r) => {
            const impactTone = r.impact ? IMPACT_TONE[r.impact] : null;
            return (
              <div key={r.requestId} className="rounded-[14px] border border-line-soft bg-surface p-[20px_22px] shadow-card">
                <div className="flex items-start gap-4">
                  <InitialsAvatar name={r.requesterName} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-[16px] font-bold text-ink-900">{r.requesterName}</span>
                      <StatusBadge status={r.status} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-[rgb(236,245,246)] px-[10px] py-1 text-xs font-medium text-brand">
                        {r.category}
                      </span>
                      {impactTone && (
                        <span
                          className="inline-flex items-center rounded-full px-[10px] py-1 text-xs font-medium"
                          style={{ background: impactTone.bg, color: impactTone.fg }}
                        >
                          {r.impact}
                        </span>
                      )}
                    </div>
                    {r.items.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-[6px]">
                        {r.items.map((item, i) => (
                          <span key={i} className="rounded-full bg-surface-muted px-[10px] py-1 text-xs font-medium text-ink-700">
                            {item}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 text-[13px] text-ink-400">
                      Assignee: {r.assigneeId ? r.assigneeName : 'Unassigned'}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-ink-400">
                      {r.approvedAt && <span>Approved {formatDate(r.approvedAt)}</span>}
                      {r.fulfilledAt && <span>Fulfilled {formatDate(r.fulfilledAt)}</span>}
                    </div>
                    {actionErrors[r.requestId] && (
                      <div className="mt-3 rounded-sm border border-danger/30 bg-danger/[0.08] p-2 text-xs text-danger">
                        {actionErrors[r.requestId]}
                      </div>
                    )}
                  </div>

                  {r.status === 'Approved' && !r.assigneeId && (
                    <div className="flex w-[150px] flex-none flex-col gap-[9px]">
                      <Button
                        size="sm"
                        fullWidth
                        onClick={() => withBusy(r.requestId, () => claimFulfilmentRequest(r.requestId), 'Assigned to you.')}
                        disabled={busyId === r.requestId}
                      >
                        <UserCheck size={14} />
                        Assign to me
                      </Button>
                    </div>
                  )}
                  {r.status === 'Approved' && r.assigneeId && (
                    <div className="flex w-[150px] flex-none flex-col gap-[9px]">
                      <Button
                        size="sm"
                        fullWidth
                        onClick={() =>
                          withBusy(r.requestId, () => transitionRequest(r.requestId, { toState: 'In Progress' }), 'Fulfilment started.')
                        }
                        disabled={busyId === r.requestId}
                      >
                        <PlayCircle size={14} />
                        Start Fulfilment
                      </Button>
                    </div>
                  )}
                  {r.status === 'In Progress' && (
                    <div className="flex w-[150px] flex-none flex-col gap-[9px]">
                      <Button
                        size="sm"
                        fullWidth
                        onClick={() =>
                          withBusy(r.requestId, () => transitionRequest(r.requestId, { toState: 'Fulfilled' }), 'Request handed over.')
                        }
                        disabled={busyId === r.requestId}
                      >
                        <Send size={14} />
                        Hand Over
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      <Toast message={message} />
    </>
  );
}

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
