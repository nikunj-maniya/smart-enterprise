import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, CheckCircle, X, XCircle } from 'lucide-react';
import type { ApprovalQueueItemDto, ApprovalQueueTab } from '@se/shared';
import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/button';
import { Overlay } from '@/components/ui/overlay';
import { Toast, useToast } from '@/components/ui/toast';
import { ApiError, decideOnRequest, listApprovalQueue } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { DecisionBadge, dateRange, EmptyState, ErrorState, InitialsAvatar, requestTypeMeta, roleContextLabel, TypeTile } from './shared';
import { RequestDetailDrawer } from './RequestDetailDrawer';

/**
 * Approver's queue (form-builder Slice 5, PRD §16): requests routed to the caller, tabbed by
 * their own decision. Approve fires the transitions endpoint directly; Reject opens a modal
 * for the required reason. When the caller holds more than one approver role, an "Approving
 * as" switch filters the queue to one role context at a time (`roleContext` query param).
 */
export default function ApprovalsQueue() {
  const { user } = useAuth();
  const [tab, setTab] = React.useState<ApprovalQueueTab>('pending');
  const [roleContext, setRoleContext] = React.useState<string | undefined>(undefined);
  const [rows, setRows] = React.useState<ApprovalQueueItemDto[] | null>(null);
  const [counts, setCounts] = React.useState({ awaitingCount: 0, decidedCount: 0 });
  const [error, setError] = React.useState<string | null>(null);
  const [myRoleContexts, setMyRoleContexts] = React.useState<string[]>([]);
  const [rejecting, setRejecting] = React.useState<ApprovalQueueItemDto | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [actionErrors, setActionErrors] = React.useState<Record<string, string>>({});
  const [highlightId, setHighlightId] = React.useState<string | null>(null);
  const [selectedRequestId, setSelectedRequestId] = React.useState<string | null>(null);
  const rowRefs = React.useRef<Map<string, HTMLDivElement>>(new Map());
  const [searchParams, setSearchParams] = useSearchParams();
  const { message, show } = useToast();

  const load = React.useCallback(() => {
    setError(null);
    listApprovalQueue({ tab, roleContext })
      .then((res) => {
        setRows(res.rows);
        setCounts({ awaitingCount: res.awaitingCount, decidedCount: res.decidedCount });
        setMyRoleContexts((prev) => {
          const next = new Set(prev);
          for (const row of res.rows) {
            for (const entry of row.chain) if (entry.approverId === user?.id) next.add(entry.roleContext);
          }
          const merged = [...next];
          // Only auto-select a role context (and thus trigger the filtered refetch below) when
          // the caller actually holds more than one — with a single role, the unfiltered result
          // we already have *is* that role's queue, so setting it would just cost a redundant,
          // identical network round trip.
          if (merged.length > 1) setRoleContext((current) => current ?? merged[0]);
          return merged;
        });
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Unable to load your approvals.'));
  }, [tab, roleContext, user?.id]);

  React.useEffect(() => {
    load();
  }, [load]);

  // Deep-link support: notifications route here with ?requestId=… — once the queue loads, scroll
  // to and highlight that request's card (if it's in the current tab) and drop the param so it
  // doesn't reopen on a later visit.
  React.useEffect(() => {
    const requestId = searchParams.get('requestId');
    if (!requestId || !rows) return;
    if (rows.some((r) => r.requestId === requestId)) {
      setHighlightId(requestId);
      rowRefs.current.get(requestId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('requestId');
      return next;
    }, { replace: true });
  }, [rows, searchParams, setSearchParams]);

  async function handleApprove(row: ApprovalQueueItemDto) {
    setBusyId(row.requestId);
    setActionErrors((prev) => ({ ...prev, [row.requestId]: '' }));
    try {
      // Parallel approval: this only finalizes the request once every snapshotted approver has
      // approved (`decideOnRequest`'s outcome evaluation) — the response's status tells us which.
      const updated = await decideOnRequest(row.requestId, { decision: 'approved' });
      show(updated.status === 'Approved' ? 'Request approved.' : 'Your approval was recorded — awaiting other approvers.');
      load();
    } catch (err) {
      setActionErrors((prev) => ({
        ...prev,
        [row.requestId]: err instanceof ApiError ? err.message : 'Unable to approve this request.',
      }));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader
        breadcrumb={`Workspace · ${user?.tenantName ?? ''}`}
        title="Approvals"
        subtitle="Requests routed to you for a decision."
      />

      {myRoleContexts.length > 1 && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-ink-400">Approving as</span>
          <div className="flex gap-1 rounded-[9px] border border-line-soft bg-surface p-1">
            {myRoleContexts.map((rc) => (
              <button
                key={rc}
                type="button"
                aria-pressed={roleContext === rc}
                onClick={() => setRoleContext(rc)}
                className="rounded-[6px] px-[14px] py-[7px] text-[12.5px] font-semibold transition-colors"
                style={
                  roleContext === rc
                    ? { background: 'var(--brand)', color: 'var(--brand-ink)' }
                    : { background: 'transparent', color: 'var(--ink-500)' }
                }
              >
                {roleContextLabel(rc)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-[22px] flex w-fit gap-2 rounded-[10px] border border-line-soft bg-surface p-[5px]">
        <button
          type="button"
          aria-pressed={tab === 'pending'}
          onClick={() => setTab('pending')}
          className="rounded-[7px] px-4 py-2 text-[13px] font-semibold transition-colors"
          style={
            tab === 'pending'
              ? { background: 'var(--brand)', color: 'var(--brand-ink)' }
              : { background: 'transparent', color: 'var(--ink-500)' }
          }
        >
          Awaiting you · {counts.awaitingCount}
        </button>
        <button
          type="button"
          aria-pressed={tab === 'decided'}
          onClick={() => setTab('decided')}
          className="rounded-[7px] px-4 py-2 text-[13px] font-semibold transition-colors"
          style={
            tab === 'decided'
              ? { background: 'var(--brand)', color: 'var(--brand-ink)' }
              : { background: 'transparent', color: 'var(--ink-500)' }
          }
        >
          Decided · {counts.decidedCount}
        </button>
      </div>

      <div className="mt-[18px] flex max-w-[920px] flex-col gap-[14px]">
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : rows === null ? (
          <div className="rounded-[14px] border border-line-soft bg-surface p-12 text-center text-sm text-ink-400 shadow-card">
            Loading your approvals…
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={CheckCircle} heading="All caught up" message="No requests in this view." />
        ) : (
          rows.map((row) => {
            const { label } = requestTypeMeta(row.formKey, row.formTitle);
            const myChainEntry = row.chain.find((c) => c.approverId === user?.id);
            return (
              <div
                key={row.requestId}
                ref={(el) => {
                  if (el) rowRefs.current.set(row.requestId, el);
                  else rowRefs.current.delete(row.requestId);
                }}
                className="rounded-[14px] border border-line-soft bg-surface p-[20px_22px] shadow-card"
                style={
                  highlightId === row.requestId
                    ? { borderColor: 'var(--brand)', boxShadow: 'var(--shadow-md)' }
                    : undefined
                }
              >

                <div className="flex items-start gap-4">
                  <button
                    type="button"
                    onClick={() => setSelectedRequestId(row.requestId)}
                    className="flex min-w-0 flex-1 items-start gap-4 text-left"
                  >
                    <TypeTile formKey={row.formKey} formTitle={row.formTitle} size={44} />
                    <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-[16px] font-bold text-ink-900">{row.requesterName}</span>
                      {row.requesterJobTitle && <span className="text-[13px] text-ink-400">· {row.requesterJobTitle}</span>}
                    </div>
                    <div className="mt-1 text-[13px] text-ink-400">
                      {label} · {dateRange(row.startDate, row.endDate)} · submitted{' '}
                      {new Date(row.submittedAt).toLocaleDateString()}
                    </div>

                    {row.chain.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {row.chain.map((entry) => (
                          <span
                            key={entry.approverId}
                            className="flex items-center gap-2 rounded-full border border-line-soft bg-app-bg py-[6px] pl-[7px] pr-[11px]"
                          >
                            <InitialsAvatar name={entry.approverName} size={24} />
                            <span className="text-xs font-semibold text-ink-700">{roleContextLabel(entry.roleContext)}</span>
                            <DecisionBadge decision={entry.decision} />
                          </span>
                        ))}
                      </div>
                    )}

                    {myChainEntry?.decision === 'rejected' && myChainEntry.comment && (
                      <div
                        className="mt-[14px] rounded-[9px] p-[11px_14px] text-[12.5px] text-ink-700"
                        style={{ background: 'rgba(229,72,77,.08)' }}
                      >
                        <strong>Your reason:</strong> {myChainEntry.comment}
                      </div>
                    )}

                    {actionErrors[row.requestId] && (
                      <div className="mt-3 rounded-sm border border-danger/30 bg-danger/[0.08] p-2 text-xs text-danger">
                        {actionErrors[row.requestId]}
                      </div>
                    )}
                    </div>
                  </button>

                  {tab === 'pending' ? (
                    <div className="flex w-[140px] flex-none flex-col gap-[9px]">
                      <Button
                        size="default"
                        fullWidth
                        onClick={() => handleApprove(row)}
                        disabled={busyId === row.requestId}
                      >
                        <Check size={16} />
                        Approve
                      </Button>
                      <Button
                        variant="secondary"
                        fullWidth
                        onClick={() => setRejecting(row)}
                        disabled={busyId === row.requestId}
                      >
                        <X size={16} />
                        Reject
                      </Button>
                    </div>
                  ) : (
                    <DecisionBadge
                      decision={row.myDecision}
                      label={
                        row.myDecision === 'approved'
                          ? 'You approved'
                          : row.myDecision === 'rejected'
                            ? 'You rejected'
                            : 'Awaiting you'
                      }
                    />
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {rejecting && (
        <ApproverRejectModal
          row={rejecting}
          onClose={() => setRejecting(null)}
          onRejected={() => {
            setRejecting(null);
            show('Request rejected.');
            load();
          }}
        />
      )}
      {selectedRequestId && (
        <RequestDetailDrawer
          requestId={selectedRequestId}
          onClose={() => setSelectedRequestId(null)}
          onWithdrawn={() => {
            setSelectedRequestId(null);
            load();
          }}
        />
      )}
      <Toast message={message} />
    </>
  );
}

function ApproverRejectModal({
  row,
  onClose,
  onRejected,
}: {
  row: ApprovalQueueItemDto;
  onClose: () => void;
  onRejected: () => void;
}) {
  const [reason, setReason] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleConfirm() {
    if (!reason.trim()) {
      setError('A reason is required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await decideOnRequest(row.requestId, { decision: 'rejected', comment: reason.trim() });
      onRejected();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to reject this request.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose} z={60}>
      <div className="mx-auto max-w-[440px] rounded-2xl bg-surface p-[26px] shadow-xl">
        <div className="flex items-center gap-3">
          <span
            className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[10px] text-danger"
            style={{ background: 'rgba(229,72,77,.12)' }}
          >
            <XCircle size={22} />
          </span>
          <div className="text-[18px] font-bold text-ink-900">Reject request</div>
        </div>
        <p className="mt-[14px] text-[13.5px] leading-[1.6] text-ink-500">
          Rejecting <strong>{row.requesterName}</strong>&apos;s {row.formTitle}. The requester sees your reason.
        </p>
        <div className="mt-[18px]">
          <label htmlFor="reject-reason" className="text-[13px] font-semibold text-ink-700">
            Reason for rejection
          </label>
          <input
            id="reject-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Conflicts with sprint release"
            className="mt-[6px] h-10 w-full rounded-sm border border-line bg-surface px-3 text-sm text-ink-900 outline-none focus:border-brand"
          />
        </div>
        {error && (
          <div className="mt-3 rounded-sm border border-danger/30 bg-danger/[0.08] p-2 text-xs text-danger">{error}</div>
        )}
        <div className="mt-[22px] flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleConfirm} disabled={submitting}>
            {submitting ? 'Rejecting…' : 'Confirm Rejection'}
          </Button>
        </div>
      </div>
    </Overlay>
  );
}
