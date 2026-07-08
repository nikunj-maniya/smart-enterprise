import * as React from 'react';
import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import type { FormDefinitionSummaryDto } from '@se/shared';
import { PageHeader } from '@/components/shell/PageHeader';
import { ApiError, listPublishedForms } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/**
 * Employee New Request screen (PRD §16): lists every published form for the tenant as a
 * request-type card. Picking one opens the generic renderer at `/requests/new/:key` — no
 * per-form code, so custom forms an admin publishes appear here automatically.
 */
export default function NewRequest() {
  const { user } = useAuth();
  const [forms, setForms] = React.useState<FormDefinitionSummaryDto[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    listPublishedForms()
      .then(setForms)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Unable to load request forms.'));
  }, []);

  return (
    <>
      <PageHeader
        breadcrumb={user?.tenantName ?? 'Workspace'}
        title="New Request"
        subtitle="Choose a request type. Each one routes to the right approvers automatically."
      />
      <div className="mt-6">
        {error ? (
          <div className="rounded-lg border border-danger/30 bg-danger/[0.08] p-4 text-sm text-danger">{error}</div>
        ) : forms === null ? (
          <div className="text-sm text-ink-400">Loading request forms…</div>
        ) : forms.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line bg-surface p-12 text-center text-sm text-ink-400">
            No request forms are available yet.
          </div>
        ) : (
          <div className="grid max-w-[760px] grid-cols-1 gap-[18px] sm:grid-cols-2">
            {forms.map((form) => (
              <Link
                key={form.key}
                to={`/requests/new/${form.key}`}
                className="rounded-[14px] border border-line-soft bg-surface p-[22px] shadow-card transition-colors hover:border-brand hover:shadow-md"
              >
                <span className="flex h-[46px] w-[46px] items-center justify-center rounded-[11px] bg-[rgb(236,245,246)] text-brand">
                  <FileText size={22} />
                </span>
                <div className="mt-[14px] text-[17px] font-bold text-ink-900">{form.title}</div>
                <div className="mt-[14px] text-[13px] font-semibold text-brand-hover">Start →</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
