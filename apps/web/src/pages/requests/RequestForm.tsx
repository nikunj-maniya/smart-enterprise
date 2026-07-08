import * as React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Send } from 'lucide-react';
import type { FormDefinitionDto, RequestDto } from '@se/shared';
import { Button } from '@/components/ui/button';
import { FormRenderer } from '@/components/form-engine/FormRenderer';
import { useFormEngine } from '@/components/form-engine/useFormEngine';
import { definitionFromDto } from '@/components/form-engine/definition';
import { ApiError, getPublishedForm } from '@/lib/api';

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
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submitted, setSubmitted] = React.useState<RequestDto | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      // `submit()` returns the created request on success, or `null` when validation
      // fails (client-side or a server 400) — in which case `engine.errors` is already set.
      const result = await engine.submit();
      if (result) setSubmitted(result);
    } catch {
      setSubmitError('Something went wrong submitting your request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
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
    );
  }

  return (
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
      {submitError && (
        <div className="mt-4 rounded-sm border border-danger/30 bg-danger/[0.08] p-3 text-xs text-danger">
          {submitError}
        </div>
      )}
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
  );
}
