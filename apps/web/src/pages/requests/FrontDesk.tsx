import * as React from 'react';
import { Clock, LogIn, LogOut, PenLine, UserCheck, type LucideIcon } from 'lucide-react';
import type { FrontDeskTodayResponse, FrontDeskVisitorDto } from '@se/shared';
import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/button';
import { Toast, useToast } from '@/components/ui/toast';
import { SignaturePadModal } from '@/components/SignaturePadModal';
import { ApiError, checkInWithSignature, getFrontDeskToday, getVisitorSignatureUrl, transitionRequest } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { EmptyState, ErrorState, InitialsAvatar, StatusBadge } from './shared';

type FrontDeskTab = 'all' | 'expected' | 'onSite' | 'checkedOut';

const TAB_LABEL: Record<FrontDeskTab, string> = {
  all: 'All Today',
  expected: 'Expected',
  onSite: 'On-site',
  checkedOut: 'Checked Out',
};

const TAB_EMPTY_MESSAGE: Record<FrontDeskTab, string> = {
  all: 'No visitor activity today.',
  expected: 'No visitors expected today.',
  onSite: 'No one on-site right now.',
  checkedOut: 'No visitors checked out yet today.',
};

function formatVisitDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/**
 * Front Desk (visitor-management, Enterprise Admin / HR Head only client-side surfaced as the
 * nav link; the backend enforces access and returns a 403 the ErrorState below shows for anyone
 * else): today's visitor registrations split into Expected/On-site/Checked-out, with the
 * check-in/out/no-show/cancel actions as generic status transitions on the request.
 */
export default function FrontDesk() {
  const { user } = useAuth();
  const [data, setData] = React.useState<FrontDeskTodayResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<FrontDeskTab>('all');
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [actionErrors, setActionErrors] = React.useState<Record<string, string>>({});
  const [signingIn, setSigningIn] = React.useState<FrontDeskVisitorDto | null>(null);
  const [signInSubmitting, setSignInSubmitting] = React.useState(false);
  const [signInError, setSignInError] = React.useState<string | null>(null);
  const [signatureError, setSignatureError] = React.useState<string | null>(null);
  const { message, show } = useToast();

  const load = React.useCallback(() => {
    setError(null);
    getFrontDeskToday()
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Unable to load Front Desk.'));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function handleTransition(row: FrontDeskVisitorDto, toState: string, successMessage: string) {
    setBusyId(row.requestId);
    setActionErrors((prev) => ({ ...prev, [row.requestId]: '' }));
    try {
      await transitionRequest(row.requestId, { toState });
      show(successMessage);
      load();
    } catch (err) {
      setActionErrors((prev) => ({
        ...prev,
        [row.requestId]: err instanceof ApiError ? err.message : 'Unable to update this visitor.',
      }));
    } finally {
      setBusyId(null);
    }
  }

  async function onConfirmCheckIn(signature: string, consent: boolean) {
    if (!signingIn) return;
    setSignInSubmitting(true);
    setSignInError(null);
    try {
      await checkInWithSignature(signingIn.requestId, { signature, consent });
      show('Visitor checked in.');
      setSigningIn(null);
      load();
    } catch (err) {
      setSignInError(err instanceof ApiError ? err.message : 'Unable to check in this visitor.');
    } finally {
      setSignInSubmitting(false);
    }
  }

  async function onViewSignature(row: FrontDeskVisitorDto) {
    setSignatureError(null);
    try {
      const { url } = await getVisitorSignatureUrl(row.requestId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setSignatureError(err instanceof ApiError ? err.message : 'No signature on file for this visitor.');
    }
  }

  const rows = data
    ? tab === 'expected'
      ? data.expected
      : tab === 'onSite'
        ? data.onSite
        : tab === 'checkedOut'
          ? data.checkedOut
          : [...data.expected, ...data.onSite, ...data.checkedOut]
    : null;

  return (
    <>
      <PageHeader
        breadcrumb={`Workspace · ${user?.tenantName ?? ''}`}
        title="Front Desk"
        subtitle="Today's visitors — check them in, check them out, and track who's on-site."
      />

      <div className="mt-[22px] grid grid-cols-[repeat(auto-fill,minmax(200px,220px))] gap-[18px]">
        <StatCard icon={Clock} value={data?.expected.length ?? 0} label="Expected today" bg="rgb(255,247,237)" fg="rgb(204,78,0)" />
        <StatCard icon={UserCheck} value={data?.onSite.length ?? 0} label="On-site" bg="rgb(230,244,254)" fg="rgb(0,144,255)" />
        <StatCard icon={LogOut} value={data?.checkedOut.length ?? 0} label="Checked out" bg="rgb(241,242,242)" fg="var(--ink-500)" />
      </div>

      <div className="mt-[22px] flex w-fit gap-2 rounded-[10px] border border-line-soft bg-surface p-[5px]">
        {(Object.keys(TAB_LABEL) as FrontDeskTab[]).map((t) => (
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
            Loading Front Desk…
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={UserCheck} heading="Nothing here" message={TAB_EMPTY_MESSAGE[tab]} />
        ) : (
          rows.map((v) => (
            <div key={v.requestId} className="rounded-[14px] border border-line-soft bg-surface p-[20px_22px] shadow-card">
              <div className="flex items-start gap-4">
                <InitialsAvatar name={v.visitorName} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-[16px] font-bold text-ink-900">{v.visitorName}</span>
                    <StatusBadge status={v.status} />
                  </div>
                  <div className="mt-1 text-[13px] text-ink-400">
                    Host: {v.hostName} · {v.purpose}
                  </div>
                  <div className="mt-1 text-[13px] text-ink-400">
                    Visit: {formatVisitDateTime(v.visitDatetime)} · {v.mobile}
                  </div>
                  {v.laptopDetails && (
                    <div className="mt-2">
                      <span className="inline-flex items-center gap-[6px] rounded-full bg-[rgb(236,245,246)] px-[10px] py-1 text-xs font-medium text-brand">
                        💻 {v.laptopDetails}
                      </span>
                    </div>
                  )}
                  {(v.checkInAt || v.checkOutAt) && (
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-ink-400">
                      {v.checkInAt && <span>Checked in {formatVisitDateTime(v.checkInAt)}</span>}
                      {v.checkOutAt && <span>Checked out {formatVisitDateTime(v.checkOutAt)}</span>}
                    </div>
                  )}
                  {actionErrors[v.requestId] && (
                    <div className="mt-3 rounded-sm border border-danger/30 bg-danger/[0.08] p-2 text-xs text-danger">
                      {actionErrors[v.requestId]}
                    </div>
                  )}
                </div>

                {v.status === 'Approved' && (
                  <div className="flex w-[130px] flex-none flex-col gap-[9px]">
                    <Button size="sm" fullWidth onClick={() => setSigningIn(v)} disabled={busyId === v.requestId}>
                      <LogIn size={14} />
                      Check-in
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      fullWidth
                      onClick={() => handleTransition(v, 'No-Show', 'Marked as no-show.')}
                      disabled={busyId === v.requestId}
                    >
                      No-Show
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      fullWidth
                      onClick={() => handleTransition(v, 'Cancelled', 'Visit cancelled.')}
                      disabled={busyId === v.requestId}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
                {v.status === 'Checked-In' && (
                  <div className="flex w-[130px] flex-none flex-col gap-[9px]">
                    <Button
                      size="sm"
                      fullWidth
                      onClick={() => handleTransition(v, 'Checked-Out', 'Visitor checked out.')}
                      disabled={busyId === v.requestId}
                    >
                      <LogOut size={14} />
                      Check-out
                    </Button>
                    <Button variant="secondary" size="sm" fullWidth onClick={() => onViewSignature(v)}>
                      <PenLine size={14} />
                      Signature
                    </Button>
                  </div>
                )}
                {v.status === 'Checked-Out' && (
                  <div className="flex w-[130px] flex-none flex-col gap-[9px]">
                    <Button variant="secondary" size="sm" fullWidth onClick={() => onViewSignature(v)}>
                      <PenLine size={14} />
                      Signature
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      {signatureError && <div className="mt-3 text-sm font-medium text-danger">{signatureError}</div>}

      {signingIn && (
        <SignaturePadModal
          visitorName={signingIn.visitorName}
          onCancel={() => setSigningIn(null)}
          onConfirm={onConfirmCheckIn}
          submitting={signInSubmitting}
          error={signInError}
        />
      )}

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
