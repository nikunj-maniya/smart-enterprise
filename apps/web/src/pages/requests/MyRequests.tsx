import * as React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Clock, Plus, Undo2 } from 'lucide-react';
import { REQUESTER_ROLE, statusModelSchema, type RequestListItemDto } from '@se/shared';
import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/button';
import { Overlay } from '@/components/ui/overlay';
import { Toast, useToast } from '@/components/ui/toast';
import { ApiError, getPublishedForm, listMyRequests, transitionRequest } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateRange, EmptyState, ErrorState, requestTypeMeta, StatusBadge, TypeTile } from './shared';

/**
 * Employee "My Requests" screen (form-builder Slice 5, PRD §16): every request the caller has
 * submitted — core or custom form — with live status and approval progress. Row click opens a
 * detail drawer that can withdraw the request when its form's status model declares a
 * requester-gated transition out of the current status.
 */
export default function MyRequests() {
  const { user } = useAuth();
  const [rows, setRows] = React.useState<RequestListItemDto[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<RequestListItemDto | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const { message, show } = useToast();

  const load = React.useCallback(() => {
    setError(null);
    listMyRequests({ pageSize: 50 })
      .then((res) => setRows(res.rows))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Unable to load your requests.'));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  // Deep-link support: notifications route here with ?requestId=… — once the list loads, open
  // that request's detail drawer and drop the param so it doesn't reopen on a later visit.
  React.useEffect(() => {
    const requestId = searchParams.get('requestId');
    if (!requestId || !rows) return;
    const match = rows.find((r) => r.id === requestId);
    if (match) setSelected(match);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('requestId');
      return next;
    }, { replace: true });
  }, [rows, searchParams, setSearchParams]);

  const pendingCount = rows?.filter((r) => r.approversTotal > 0 && r.approversDecided < r.approversTotal).length ?? 0;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          breadcrumb={`Workspace · ${user?.tenantName ?? ''}`}
          title="My Requests"
          subtitle="Track every request you've submitted and where it stands."
        />
        <Button asChild size="lg">
          <Link to="/requests/new">
            <Plus size={18} />
            New Request
          </Link>
        </Button>
      </div>

      <div className="mt-[22px] grid max-w-[220px] grid-cols-1 gap-[18px]">
        <StatCard value={pendingCount} label="Awaiting Approval" />
      </div>

      <div className="mt-[22px]">
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : rows === null ? (
          <div className="rounded-[14px] border border-line-soft bg-surface p-12 text-center text-sm text-ink-400 shadow-card">
            Loading your requests…
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Clock} heading="No requests yet" message="Submit a request to see it tracked here." />
        ) : (
          <div className="overflow-x-auto rounded-[12px] border border-line-soft bg-surface shadow-card">
            <div className="min-w-[820px]">
              <div className="grid grid-cols-[1fr_2fr_1.3fr_1fr_1.1fr] gap-3 bg-surface-muted px-[22px] py-[13px] text-[11px] font-semibold uppercase tracking-[.4px] text-ink-400">
                <span>Type</span>
                <span>Request</span>
                <span>Dates</span>
                <span>Approvers</span>
                <span>Status</span>
              </div>
              {rows.map((r) => {
                const { label } = requestTypeMeta(r.formKey, r.formTitle);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelected(r)}
                    className="grid w-full grid-cols-[1fr_2fr_1.3fr_1fr_1.1fr] items-center gap-3 border-b border-line-soft px-[22px] py-[15px] text-left last:border-b-0 hover:bg-surface-muted"
                  >
                    <span className="flex items-center gap-[10px]">
                      <TypeTile formKey={r.formKey} formTitle={r.formTitle} />
                      <span className="text-[13px] font-semibold text-ink-900">{label}</span>
                    </span>
                    <span className="min-w-0">
                      <div className="truncate text-sm font-semibold text-ink-900">{r.formTitle}</div>
                      <div className="truncate text-xs text-ink-400">Submitted {new Date(r.createdAt).toLocaleDateString()}</div>
                    </span>
                    <span className="text-[13px] text-ink-700">{dateRange(r.startDate, r.endDate)}</span>
                    <span className="text-[12.5px] text-ink-500">
                      {r.approversTotal > 0 ? `${r.approversDecided}/${r.approversTotal} approved` : '—'}
                    </span>
                    <span>
                      <StatusBadge status={r.status} />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {selected && (
        <RequestDetailDrawer
          request={selected}
          onClose={() => setSelected(null)}
          onWithdrawn={() => {
            setSelected(null);
            load();
            show('Request withdrawn.');
          }}
        />
      )}
      <Toast message={message} />
    </>
  );
}

function StatCard({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col gap-[10px] rounded-lg border border-line-soft bg-surface p-4 shadow-card">
      <div
        className="flex h-8 w-8 items-center justify-center rounded-sm"
        style={{ background: 'rgb(255,247,237)', color: 'rgb(204,78,0)' }}
      >
        <Clock size={18} />
      </div>
      <div className="text-[28px] font-bold leading-[1.1] text-ink-900">{value}</div>
      <div className="text-xs text-ink-400">{label}</div>
    </div>
  );
}

/**
 * Detail drawer for one submitted request. `My Requests` only carries summary fields (no raw
 * payload or per-approver chain), so this shows what's available — dates and approval progress
 * — rather than the full field/chain breakdown a request-detail endpoint would enable.
 * Withdraw availability is computed client-side from the form's own status model: any
 * transition declared out of the request's current status and gated to `requester`.
 */
function RequestDetailDrawer({
  request,
  onClose,
  onWithdrawn,
}: {
  request: RequestListItemDto;
  onClose: () => void;
  onWithdrawn: () => void;
}) {
  const [withdrawTarget, setWithdrawTarget] = React.useState<string | null>(null);
  const [withdrawing, setWithdrawing] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setWithdrawTarget(null);
    getPublishedForm(request.formKey)
      .then((dto) => {
        if (cancelled || !dto.statusModel) return;
        const parsed = statusModelSchema.safeParse(dto.statusModel);
        if (!parsed.success) return;
        const transition = parsed.data.transitions.find(
          (t) => t.from === request.status && t.roles.includes(REQUESTER_ROLE),
        );
        if (transition) setWithdrawTarget(transition.to);
      })
      .catch(() => {
        // Withdraw simply stays unavailable if the form definition can't be loaded.
      });
    return () => {
      cancelled = true;
    };
  }, [request.formKey, request.status]);

  async function handleWithdraw() {
    if (!withdrawTarget) return;
    setWithdrawing(true);
    setActionError(null);
    try {
      await transitionRequest(request.id, { toState: withdrawTarget });
      onWithdrawn();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Unable to withdraw this request.');
    } finally {
      setWithdrawing(false);
    }
  }

  const { label } = requestTypeMeta(request.formKey, request.formTitle);

  return (
    <Overlay onClose={onClose} z={60}>
      <div className="mx-auto max-w-[520px] rounded-2xl bg-surface shadow-xl">
        <div className="flex items-start gap-4 border-b border-line-soft p-[24px_26px]">
          <TypeTile formKey={request.formKey} formTitle={request.formTitle} size={46} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[17px] font-bold text-ink-900">{request.formTitle}</div>
            <div className="mt-1 text-[13px] text-ink-400">
              {label} · submitted {new Date(request.createdAt).toLocaleDateString()}
            </div>
          </div>
          <StatusBadge status={request.status} />
        </div>

        <div className="p-[24px_26px]">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[.4px] text-ink-400">Dates</div>
              <div className="mt-1 text-sm font-semibold text-ink-900">
                {dateRange(request.startDate, request.endDate)}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[.4px] text-ink-400">Approvers</div>
              <div className="mt-1 text-sm font-semibold text-ink-900">
                {request.approversTotal > 0
                  ? `${request.approversDecided}/${request.approversTotal} approved`
                  : 'No approval required'}
              </div>
            </div>
          </div>
          {actionError && (
            <div className="mt-4 rounded-sm border border-danger/30 bg-danger/[0.08] p-3 text-xs text-danger">
              {actionError}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-line-soft p-[18px_26px]">
          {withdrawTarget && (
            <Button variant="secondary" onClick={handleWithdraw} disabled={withdrawing}>
              <Undo2 size={16} />
              {withdrawing ? 'Withdrawing…' : 'Withdraw'}
            </Button>
          )}
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </Overlay>
  );
}
