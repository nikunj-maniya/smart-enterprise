import * as React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Send, TriangleAlert } from 'lucide-react';
import { isFieldVisible, type FormDefinitionDto, type LeaveBalanceDto, type RequestDto, type StageRules } from '@se/shared';
import { Button } from '@/components/ui/button';
import { Toast, useToast } from '@/components/ui/toast';
import { FormRenderer } from '@/components/form-engine/FormRenderer';
import { useFormEngine } from '@/components/form-engine/useFormEngine';
import { definitionFromDto } from '@/components/form-engine/definition';
import { ApiError, getPublishedForm, listMyLeaveBalances } from '@/lib/api';

/**
 * Employee-facing generic renderer page (form-builder Slice 4, PRD §16): loads a published
 * form definition by key and drives it through `useFormEngine`/`FormRenderer` — all §6.3 field
 * types, client-side visibility, and validation come straight from the metadata, no per-form
 * code. Submitting goes through the standard `POST /requests` pipeline.
 */
export default function RequestForm() {
  const { key = '' } = useParams();
  const navigate = useNavigate();
  const [dto, setDto] = React.useState<FormDefinitionDto | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setDto(null);
    setLoadError(null);
    getPublishedForm(key)
      .then((d) => {
        if (!cancelled) setDto(d);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : 'Unable to load this form.');
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return (
    <div className="mx-auto max-w-[780px]">
      <Link to="/requests/new" className="text-[13px] font-semibold text-brand-hover">
        ← New Request
      </Link>
      {loadError ? (
        <div className="mt-[14px] rounded-xl border border-danger/30 bg-danger/[0.08] p-6 text-sm text-danger">
          {loadError}
        </div>
      ) : dto === null ? (
        <div className="mt-[14px] text-sm text-ink-400">Loading…</div>
      ) : (
        <RequestFormCard dto={dto} onCancel={() => navigate('/requests/new')} />
      )}
    </div>
  );
}

/** The loaded-form card: owns live form state and the submit lifecycle for one definition. */
function RequestFormCard({ dto, onCancel }: { dto: FormDefinitionDto; onCancel: () => void }) {
  const definition = React.useMemo(() => definitionFromDto(dto), [dto]);
  const engine = useFormEngine(definition);
  const [submitting, setSubmitting] = React.useState(false);
  const toast = useToast();
  const [submitted, setSubmitted] = React.useState<RequestDto | null>(null);
  const [leaveBalances, setLeaveBalances] = React.useState<LeaveBalanceDto[] | null>(null);

  React.useEffect(() => {
    if (dto.key !== 'leave') return;
    listMyLeaveBalances()
      .then(setLeaveBalances)
      .catch(() => setLeaveBalances([]));
  }, [dto.key]);

  // Non-blocking client-side check (leave-wfh-requests spec): compare the in-progress leave
  // request against the balance fetched once on load — HR still reviews and decides either way.
  const overBalance = React.useMemo(() => {
    if (dto.key !== 'leave' || !leaveBalances) return null;
    const leaveTypeName = engine.values.leave_type;
    const days = Number(engine.values.number_of_days);
    if (typeof leaveTypeName !== 'string' || !leaveTypeName || Number.isNaN(days) || days <= 0) return null;
    const balance = leaveBalances.find((b) => b.leaveTypeName === leaveTypeName);
    if (!balance || balance.used + days <= balance.total) return null;
    return balance;
  }, [dto.key, leaveBalances, engine.values.leave_type, engine.values.number_of_days]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      // `submit()` returns the created request on success, or `null` when validation
      // fails (client-side or a server 400) — in which case `engine.errors` is already set.
      const result = await engine.submit();
      if (result) {
        setSubmitted(result);
        toast.show('Request submitted successfully.');
      }
    } catch (err) {
      // apiFetch always resolves an ApiError with a usable message — the server's own, or its
      // own `Request failed (status)` fallback — so only a non-ApiError (network/JS) failure
      // ever needs the local generic copy here.
      toast.show(
        err instanceof ApiError ? err.message : 'Something went wrong submitting your request. Please try again.',
        'error',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <>
        <Toast message={toast.message} variant={toast.variant} />
        <div className="mt-[14px] rounded-xl border border-line-soft bg-surface p-7 text-center shadow-card">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[rgb(236,245,246)] text-brand">
            <CheckCircle2 size={26} />
          </span>
          <div className="mt-4 text-[20px] font-bold text-ink-900">Request submitted</div>
          <div className="mt-2 text-sm text-ink-400">
            Your {definition.title} request has been submitted and routed for approval.
          </div>
          <div className="mt-6 flex justify-center">
            <Button asChild>
              <Link to="/requests/new">New Request</Link>
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Toast message={toast.message} variant={toast.variant} />
      <form
        onSubmit={handleSubmit}
        className="mt-[14px] rounded-xl border border-line-soft bg-surface p-7 shadow-card"
      >
        <div className="text-[20px] font-bold text-ink-900">{definition.title}</div>
        <div className="mt-[22px]">
          <FormRenderer
            sections={engine.sections}
            values={engine.values}
            errors={engine.errors}
            onChange={engine.setValue}
            disabled={submitting}
          />
        </div>
        {overBalance && (
          <div
            className="mt-4 flex items-start gap-2 rounded-sm p-3 text-[12.5px] leading-[1.5]"
            style={{ background: 'rgb(255,247,237)', color: 'rgb(204,78,0)' }}
          >
            <TriangleAlert size={16} className="mt-[1px] flex-none" />
            <span>
              This request exceeds your remaining balance for {overBalance.leaveTypeName} (
              {overBalance.used}/{overBalance.total} used). You can still submit — HR will review.
            </span>
          </div>
        )}
        <ApproversPreview dto={dto} values={engine.values} />
        <div className="mt-6 flex items-center justify-between">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            <Send size={16} />
            {submitting ? 'Submitting…' : 'Submit Request'}
          </Button>
        </div>
      </form>
    </>
  );
}

/**
 * Routing preview: resolves `approvalWorkflow.stageRules` against the in-progress values —
 * skipping any stage whose own `when` gate doesn't currently pass — and shows, per remaining
 * stage, how many approvers are currently picked (directory names aren't resolvable from an id
 * alone without a by-id lookup endpoint, so a count is shown instead) or that none are selected yet.
 */
function ApproversPreview({ dto, values }: { dto: FormDefinitionDto; values: Record<string, unknown> }) {
  const fieldLabels = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const section of dto.sections) for (const field of section.fields) map.set(field.key, field.label);
    return map;
  }, [dto.sections]);

  const stageRules = dto.approvalWorkflow?.stageRules as StageRules | null | undefined;
  const stages = (stageRules?.approvers ?? []).filter((rule) => !rule.when || isFieldVisible(rule.when, values));
  if (stages.length === 0) return null;

  return (
    <div className="mt-6 rounded-sm border border-line-soft bg-surface-muted p-4">
      <div className="text-[13px] font-semibold text-ink-900">Approvers</div>
      <div className="mt-3 flex flex-col gap-2">
        {stages.map((rule, i) => {
          const raw = values[rule.field];
          const ids = Array.isArray(raw) ? raw : raw ? [raw] : [];
          return (
            <div key={`${rule.field}-${i}`} className="flex items-center justify-between gap-3 text-[13px]">
              <span className="text-ink-500">{fieldLabels.get(rule.field) ?? rule.field}</span>
              <span className="font-semibold text-ink-900">
                {ids.length === 0 ? 'No approver selected yet' : `${ids.length} selected`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
