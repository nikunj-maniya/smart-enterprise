import * as React from 'react';
import { Undo2 } from 'lucide-react';
import { REQUESTER_ROLE, statusModelSchema, type RequestDetailDto } from '@se/shared';
import { Button } from '@/components/ui/button';
import { Overlay } from '@/components/ui/overlay';
import { definitionFromDto } from '@/components/form-engine/definition';
import { FormRenderer } from '@/components/form-engine/FormRenderer';
import { useFormEngine } from '@/components/form-engine/useFormEngine';
import { ApiError, getRequestDetail, transitionRequest } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  DecisionBadge,
  dateRange,
  InitialsAvatar,
  requestTypeMeta,
  roleContextLabel,
  StatusBadge,
  TypeTile,
} from './shared';

const ESCALATION_CAUSE_LABEL: Record<'on_leave' | 'inactive' | 'timeout', string> = {
  on_leave: 'on approved leave',
  inactive: 'deactivated',
  timeout: "didn't act in time",
};

/**
 * Shared request-detail drawer (approvals-queue spec): dates/details from the payload, the
 * parallel approval chain with per-approver status badges and escalation annotations, and a
 * Withdraw button visible only to the requester while no approver has yet decided. Opened from
 * both `MyRequests` (the requester's own list) and `ApprovalsQueue` (an approver's queue) —
 * fetches everything itself from `GET /requests/:id`, which is reachable by either party.
 */
export function RequestDetailDrawer({
  requestId,
  onClose,
  onWithdrawn,
}: {
  requestId: string;
  onClose: () => void;
  onWithdrawn?: () => void;
}) {
  const { user } = useAuth();
  const [detail, setDetail] = React.useState<RequestDetailDto | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [withdrawing, setWithdrawing] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setLoadError(null);
    getRequestDetail(requestId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : 'Unable to load this request.');
      });
    return () => {
      cancelled = true;
    };
  }, [requestId]);

  const isRequester = detail?.requesterId === user?.id;

  const withdrawTarget = React.useMemo(() => {
    if (!isRequester || !detail?.definition.statusModel) return null;
    // Parallel (AND-gate) approval doesn't move `status` off its pre-decision state until
    // every approver has decided — so a declared-transition check alone isn't enough once
    // partial approval exists; matches the same guard `transitionRequest` enforces server-side.
    if (detail.approvers.some((a) => a.decision !== 'pending')) return null;
    const parsed = statusModelSchema.safeParse(detail.definition.statusModel);
    if (!parsed.success) return null;
    const transition = parsed.data.transitions.find(
      (t) => t.from === detail.status && t.roles.includes(REQUESTER_ROLE),
    );
    return transition?.to ?? null;
  }, [detail, isRequester]);

  async function handleWithdraw() {
    if (!detail || !withdrawTarget) return;
    setWithdrawing(true);
    setActionError(null);
    try {
      await transitionRequest(detail.id, { toState: withdrawTarget });
      onWithdrawn?.();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Unable to withdraw this request.');
    } finally {
      setWithdrawing(false);
    }
  }

  const decided = detail?.approvers.filter((a) => a.decision !== 'pending').length ?? 0;

  return (
    <Overlay onClose={onClose} z={60}>
      <div className="mx-auto max-w-[560px] rounded-2xl bg-surface shadow-xl">
        {loadError ? (
          <div className="p-8 text-center text-sm text-danger">{loadError}</div>
        ) : detail === null ? (
          <div className="p-12 text-center text-sm text-ink-400">Loading…</div>
        ) : (
          <>
            <div className="flex items-start gap-4 border-b border-line-soft p-[24px_26px]">
              <TypeTile formKey={detail.formKey} formTitle={detail.formTitle} size={46} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[17px] font-bold text-ink-900">{detail.formTitle}</div>
                <div className="mt-1 text-[13px] text-ink-400">
                  {requestTypeMeta(detail.formKey, detail.formTitle).label} · submitted{' '}
                  {new Date(detail.createdAt).toLocaleDateString()}
                </div>
              </div>
              <StatusBadge status={detail.status} />
            </div>

            <div className="max-h-[65vh] overflow-y-auto p-[24px_26px]">
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[.4px] text-ink-400">Dates</div>
                  <div className="mt-1 text-sm font-semibold text-ink-900">
                    {dateRange(detail.startDate, detail.endDate)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[.4px] text-ink-400">Approvers</div>
                  <div className="mt-1 text-sm font-semibold text-ink-900">
                    {detail.approvers.length > 0 ? `${decided}/${detail.approvers.length} decided` : 'No approval required'}
                  </div>
                </div>
              </div>

              {detail.approvers.length > 0 && (
                <div className="mt-6 border-t border-line-soft pt-6">
                  <div className="text-[11px] font-semibold uppercase tracking-[.4px] text-ink-400">
                    Approval chain
                  </div>
                  <div className="mt-3 flex flex-col gap-[10px]">
                    {detail.approvers.map((a) => (
                      <div key={a.approverId} className="flex items-center gap-3">
                        <InitialsAvatar name={a.approverName} size={28} />
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-semibold text-ink-900">{a.approverName}</div>
                          <div className="text-xs text-ink-400">{roleContextLabel(a.roleContext)}</div>
                          {a.escalatedFromName && (
                            <div className="mt-[2px] text-xs text-ink-400">
                              Escalated from {a.escalatedFromName} ({ESCALATION_CAUSE_LABEL[a.escalationCause!]})
                            </div>
                          )}
                          {a.decision === 'rejected' && a.comment && (
                            <div className="mt-[4px] text-xs text-ink-700">
                              <strong>Reason:</strong> {a.comment}
                            </div>
                          )}
                        </div>
                        <DecisionBadge decision={a.decision} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6 border-t border-line-soft pt-6">
                <RequestAnswers detail={detail} />
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
          </>
        )}
      </div>
    </Overlay>
  );
}

/** Read-only render of a request's submitted answers — reuses the submission flow's
 *  `FormRenderer`/`useFormEngine`, pre-filled with the stored payload and disabled. */
function RequestAnswers({ detail }: { detail: RequestDetailDto }) {
  const definition = React.useMemo(() => definitionFromDto(detail.definition), [detail.definition]);
  const engine = useFormEngine(definition, detail.payload);
  return (
    <FormRenderer
      sections={engine.sections}
      values={engine.values}
      errors={engine.errors}
      onChange={engine.setValue}
      disabled
    />
  );
}
