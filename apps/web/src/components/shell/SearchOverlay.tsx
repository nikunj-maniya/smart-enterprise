import * as React from 'react';
import { History, Search, Send, SquarePen } from 'lucide-react';
import type {
  AbsenceEntryDto,
  ApprovalQueueItemDto,
  DepartmentDto,
  FrontDeskVisitorDto,
  HolidayDto,
  LeaveBalanceDto,
  OrgUserDto,
  ProjectDto,
  RequestListItemDto,
  SmartSearchConversationMessageDto,
} from '@se/shared';
import { ABSENCE_TYPE_META, dateFromDay, formatDateRangeShort, formatDateShort } from '@/components/absences/absenceStyle';
import { STATUS_STYLE } from '@/pages/organization/Projects';
import { StatusBadge, TypeTile, requestTypeMeta } from '@/pages/requests/shared';
import { askSmartSearch, getSmartSearchConversation, type SmartSearchHistoryMessage, type SmartSearchResponse } from '@/lib/api';
import { SearchHistoryList } from './SearchHistoryList';

/** How many prior turns to send back as context for a follow-up question — bounds prompt size,
 *  matches the server's own trimming window. */
const HISTORY_WINDOW = 8;

/** Persists the id of the thread currently open in the overlay so it can be resumed after a page
 *  refresh — just enough to know *which* thread to reload; the messages themselves always come
 *  from the server, never from localStorage. */
const ACTIVE_CONVERSATION_KEY = 'smartSearch.activeConversationId';

// Plain `Omit` doesn't distribute over a union (it flattens `SmartSearchResponse` to its common
// keys, losing the `toolUsed`/`rows` correlation) — this variant re-distributes over each member.
type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;

type ChatMessage =
  | { id: string; role: 'user'; content: string }
  | ({ id: string; role: 'assistant'; content: string } & DistributiveOmit<SmartSearchResponse, 'reply'>);

/** Whole days spanned by an absence, in application code (never asked of the model) — a simple
 *  display figure independent of the narration/day-math the backend computes for its own answer. */
function absenceDayCount(row: AbsenceEntryDto): number {
  const days = Math.round((dateFromDay(row.endDate).getTime() - dateFromDay(row.startDate).getTime()) / 86_400_000) + 1;
  return row.halfDayCount ? days - row.halfDayCount * 0.5 : days;
}

function AbsenceRows({ rows }: { rows: AbsenceEntryDto[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-2 overflow-x-auto rounded-[10px] border border-line-soft">
      <table className="w-full min-w-[360px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line-soft text-left text-[11px] font-semibold uppercase tracking-[.4px] text-ink-400">
            <th className="px-3 py-2">Person</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Dates</th>
            <th className="px-3 py-2">Days</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.requestId} className="border-b border-line-soft text-ink-700 last:border-b-0">
              <td className="px-3 py-2 font-semibold text-ink-900">{r.personName}</td>
              <td className="px-3 py-2">{ABSENCE_TYPE_META[r.type].label}</td>
              <td className="px-3 py-2">{formatDateRangeShort(r.startDate, r.endDate)}</td>
              <td className="px-3 py-2">{absenceDayCount(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserRows({ rows }: { rows: OrgUserDto[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-2 overflow-x-auto rounded-[10px] border border-line-soft">
      <table className="w-full min-w-[420px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line-soft text-left text-[11px] font-semibold uppercase tracking-[.4px] text-ink-400">
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Email</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Roles</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id} className="border-b border-line-soft text-ink-700 last:border-b-0">
              <td className="px-3 py-2 font-semibold text-ink-900">{u.name}</td>
              <td className="px-3 py-2">{u.email}</td>
              <td className="px-3 py-2 capitalize">{u.status}</td>
              <td className="px-3 py-2">{u.roles.map((r) => r.name).join(', ') || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MyRequestRows({ rows }: { rows: RequestListItemDto[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-2 overflow-x-auto rounded-[10px] border border-line-soft">
      <table className="w-full min-w-[380px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line-soft text-left text-[11px] font-semibold uppercase tracking-[.4px] text-ink-400">
            <th className="px-3 py-2">Request</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Dates</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-line-soft text-ink-700 last:border-b-0">
              <td className="px-3 py-2 font-semibold text-ink-900">
                <span className="flex items-center gap-2">
                  <TypeTile formKey={r.formKey} formTitle={r.formTitle} size={32} />
                  {requestTypeMeta(r.formKey, r.formTitle).label}
                </span>
              </td>
              <td className="px-3 py-2">
                <StatusBadge status={r.status} />
              </td>
              <td className="px-3 py-2">
                {r.startDate && r.endDate ? formatDateRangeShort(r.startDate, r.endDate) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DepartmentRows({ rows }: { rows: DepartmentDto[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-2 overflow-x-auto rounded-[10px] border border-line-soft">
      <table className="w-full min-w-[420px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line-soft text-left text-[11px] font-semibold uppercase tracking-[.4px] text-ink-400">
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Head(s)</th>
            <th className="px-3 py-2">Members</th>
            <th className="px-3 py-2">Archived</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id} className="border-b border-line-soft text-ink-700 last:border-b-0">
              <td className="px-3 py-2 font-semibold text-ink-900">{d.name}</td>
              <td className="px-3 py-2">{d.heads.map((h) => h.name).join(', ') || '—'}</td>
              <td className="px-3 py-2">{d.memberCount}</td>
              <td className="px-3 py-2">{d.archived ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProjectRows({ rows }: { rows: ProjectDto[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-2 overflow-x-auto rounded-[10px] border border-line-soft">
      <table className="w-full min-w-[460px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line-soft text-left text-[11px] font-semibold uppercase tracking-[.4px] text-ink-400">
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">PM</th>
            <th className="px-3 py-2">Tech Lead</th>
            <th className="px-3 py-2">Members</th>
            <th className="px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const status = STATUS_STYLE[p.status];
            return (
              <tr key={p.id} className="border-b border-line-soft text-ink-700 last:border-b-0">
                <td className="px-3 py-2 font-semibold text-ink-900">{p.name}</td>
                <td className="px-3 py-2">{p.pm?.name ?? '—'}</td>
                <td className="px-3 py-2">{p.techLead?.name ?? '—'}</td>
                <td className="px-3 py-2">{p.memberCount}</td>
                <td className="px-3 py-2">
                  <span
                    className="inline-flex items-center gap-[6px] rounded-full py-1 pl-[10px] pr-[10px] text-xs font-medium"
                    style={{ background: status.bg, color: status.fg }}
                  >
                    <span className="h-[6px] w-[6px] flex-none rounded-full" style={{ background: status.dot }} />
                    {status.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function HolidayRows({ rows }: { rows: HolidayDto[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-2 overflow-x-auto rounded-[10px] border border-line-soft">
      <table className="w-full min-w-[280px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line-soft text-left text-[11px] font-semibold uppercase tracking-[.4px] text-ink-400">
            <th className="px-3 py-2">Date</th>
            <th className="px-3 py-2">Name</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((h) => (
            <tr key={h.id} className="border-b border-line-soft text-ink-700 last:border-b-0">
              <td className="px-3 py-2 font-semibold text-ink-900">{formatDateShort(h.date)}</td>
              <td className="px-3 py-2">{h.name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LeaveBalanceRows({ rows }: { rows: LeaveBalanceDto[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-2 overflow-x-auto rounded-[10px] border border-line-soft">
      <table className="w-full min-w-[360px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line-soft text-left text-[11px] font-semibold uppercase tracking-[.4px] text-ink-400">
            <th className="px-3 py-2">Leave Type</th>
            <th className="px-3 py-2">Used</th>
            <th className="px-3 py-2">Total</th>
            <th className="px-3 py-2">Remaining</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.leaveTypeId} className="border-b border-line-soft text-ink-700 last:border-b-0">
              <td className="px-3 py-2 font-semibold text-ink-900">{b.leaveTypeName}</td>
              <td className="px-3 py-2">{b.used}</td>
              <td className="px-3 py-2">{b.total}</td>
              <td className="px-3 py-2">{b.total - b.used}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MyApprovalRows({ rows }: { rows: ApprovalQueueItemDto[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-2 overflow-x-auto rounded-[10px] border border-line-soft">
      <table className="w-full min-w-[420px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line-soft text-left text-[11px] font-semibold uppercase tracking-[.4px] text-ink-400">
            <th className="px-3 py-2">Requester</th>
            <th className="px-3 py-2">Request</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Submitted</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.requestId} className="border-b border-line-soft text-ink-700 last:border-b-0">
              <td className="px-3 py-2 font-semibold text-ink-900">{a.requesterName}</td>
              <td className="px-3 py-2">{a.formTitle}</td>
              <td className="px-3 py-2">
                <StatusBadge status={a.status} />
              </td>
              <td className="px-3 py-2">{formatDateShort(a.submittedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FrontDeskRows({ rows }: { rows: FrontDeskVisitorDto[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-2 overflow-x-auto rounded-[10px] border border-line-soft">
      <table className="w-full min-w-[440px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line-soft text-left text-[11px] font-semibold uppercase tracking-[.4px] text-ink-400">
            <th className="px-3 py-2">Visitor</th>
            <th className="px-3 py-2">Mobile</th>
            <th className="px-3 py-2">Host</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Checked in</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => (
            <tr key={v.requestId} className="border-b border-line-soft text-ink-700 last:border-b-0">
              <td className="px-3 py-2 font-semibold text-ink-900">{v.visitorName}</td>
              <td className="px-3 py-2">{v.mobile}</td>
              <td className="px-3 py-2">{v.hostName}</td>
              <td className="px-3 py-2">
                <StatusBadge status={v.status} />
              </td>
              <td className="px-3 py-2">{v.checkInAt ? formatDateShort(v.checkInAt) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A persisted thread message, as loaded from the history API, doesn't carry `toolUsed`/`rows` (see
 *  `SmartSearchConversationMessageDto` in schema.prisma) — reconstructed as the "no tool matched"
 *  shape of `ChatMessage` so it renders as a plain bubble with no row table underneath. */
function toChatMessage(m: SmartSearchConversationMessageDto, conversationId: string): ChatMessage {
  return m.role === 'user'
    ? { id: m.id, role: 'user', content: m.content }
    : { id: m.id, role: 'assistant', content: m.content, conversationId, toolUsed: null, denied: false, rows: [] };
}

function MessageRows({ message }: { message: ChatMessage }) {
  if (message.role !== 'assistant' || !message.rows || message.rows.length === 0) return null;
  if (message.toolUsed === 'queryAbsences') return <AbsenceRows rows={message.rows} />;
  if (message.toolUsed === 'queryUsers') return <UserRows rows={message.rows} />;
  if (message.toolUsed === 'queryMyRequests') return <MyRequestRows rows={message.rows} />;
  if (message.toolUsed === 'queryDepartments') return <DepartmentRows rows={message.rows} />;
  if (message.toolUsed === 'queryProjects') return <ProjectRows rows={message.rows} />;
  if (message.toolUsed === 'queryHolidays') return <HolidayRows rows={message.rows} />;
  if (message.toolUsed === 'queryMyLeaveBalances') return <LeaveBalanceRows rows={message.rows} />;
  if (message.toolUsed === 'queryMyApprovals') return <MyApprovalRows rows={message.rows} />;
  if (message.toolUsed === 'queryFrontDeskVisitors') return <FrontDeskRows rows={message.rows} />;
  return null;
}

/** Smart Search: an LLM-backed conversational overlay (replaces the old keyword search). Same
 *  outer shell/animation as the previous overlay; internals are a growing chat thread instead of
 *  a single input + result list. */
export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [retryable, setRetryable] = React.useState<{ message: string; history: SmartSearchHistoryMessage[] } | null>(
    null,
  );
  const [conversationId, setConversationId] = React.useState<string | undefined>(undefined);
  const [view, setView] = React.useState<'chat' | 'history'>('chat');
  const [restoring, setRestoring] = React.useState(false);
  const listRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const restoredRef = React.useRef(false);

  React.useEffect(() => {
    if (open) textareaRef.current?.focus();
  }, [open]);

  React.useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pending]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Resume the last active thread across a page refresh, the first time the overlay is opened —
  // not on every open, and not before the user has ever opened it, so a page load with search
  // untouched costs no extra request.
  React.useEffect(() => {
    if (!open || restoredRef.current) return;
    restoredRef.current = true;
    const storedId = localStorage.getItem(ACTIVE_CONVERSATION_KEY);
    if (!storedId) return;
    setRestoring(true);
    getSmartSearchConversation(storedId)
      .then((detail) => {
        setConversationId(detail.id);
        setMessages(detail.messages.map((m) => toChatMessage(m, detail.id)));
      })
      .catch(() => localStorage.removeItem(ACTIVE_CONVERSATION_KEY))
      .finally(() => setRestoring(false));
  }, [open]);

  React.useEffect(() => {
    if (conversationId) localStorage.setItem(ACTIVE_CONVERSATION_KEY, conversationId);
  }, [conversationId]);

  async function fetchReply(message: string, history: SmartSearchHistoryMessage[]) {
    setPending(true);
    setError(null);
    try {
      const { reply, ...rest } = await askSmartSearch(message, history, conversationId);
      setConversationId(rest.conversationId);
      const assistantMessage: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: reply, ...rest };
      setMessages((prev) => [...prev, assistantMessage]);
      setRetryable(null);
    } catch {
      // Never surface the raw error (network failure, 500, timeout, …) — a plain, retry-friendly
      // message regardless of cause, matching the rest of this feature's "never a raw error" rule.
      setError('Something went wrong. Check your connection and try again.');
      setRetryable({ message, history });
    } finally {
      setPending(false);
    }
  }

  function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || pending) return;
    const history: SmartSearchHistoryMessage[] = messages
      .slice(-HISTORY_WINDOW)
      .map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', content: trimmed }]);
    setInput('');
    void fetchReply(trimmed, history);
  }

  function handleRetry() {
    if (retryable) void fetchReply(retryable.message, retryable.history);
  }

  /** Starts a fresh thread: the next message sent will have no `conversationId`, so the server
   *  creates a brand-new one rather than appending to the one just left. */
  function handleNewConversation() {
    setMessages([]);
    setConversationId(undefined);
    setError(null);
    setRetryable(null);
    localStorage.removeItem(ACTIVE_CONVERSATION_KEY);
    setView('chat');
  }

  async function handleSelectThread(id: string) {
    setView('chat');
    setError(null);
    setRestoring(true);
    try {
      const detail = await getSmartSearchConversation(id);
      setConversationId(detail.id);
      setMessages(detail.messages.map((m) => toChatMessage(m, detail.id)));
    } catch {
      setError('Something went wrong. Check your connection and try again.');
    } finally {
      setRestoring(false);
    }
  }

  /** A thread deleted from the history list may be the one currently open in chat view (or the
   *  one persisted for resume-on-refresh) — clear it here so neither points at a thread that no
   *  longer exists. */
  function handleThreadDeleted(id: string) {
    if (conversationId !== id) return;
    setMessages([]);
    setConversationId(undefined);
    localStorage.removeItem(ACTIVE_CONVERSATION_KEY);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center px-6 pb-6 pt-[90px]"
      style={{ background: 'rgba(10,20,20,.5)', animation: 'seFade .15s ease' }}
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-[560px] flex-col overflow-hidden rounded-[14px] bg-surface shadow-xl"
        style={{ animation: 'seUp .2s ease' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-[11px] border-b border-line-soft px-[18px] py-4">
          <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[8px] bg-[rgb(236,245,246)]">
            <Search size={17} className="text-brand" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-semibold text-ink-900">Smart Search</div>
            <div className="truncate text-[12px] text-ink-400">Ask about leave/WFH, directory, departments, projects, holidays, requests, balances, approvals, or visitors</div>
          </div>
          <button
            type="button"
            onClick={handleNewConversation}
            disabled={view === 'chat' && !conversationId && messages.length === 0}
            aria-label="New conversation"
            className="flex-none rounded-[7px] p-[6px] text-ink-400 hover:bg-surface-muted hover:text-ink-700 disabled:opacity-40"
          >
            <SquarePen size={16} />
          </button>
          <button
            type="button"
            onClick={() => setView((v) => (v === 'history' ? 'chat' : 'history'))}
            aria-label={view === 'history' ? 'Back to conversation' : 'View past conversations'}
            aria-pressed={view === 'history'}
            className={`flex-none rounded-[7px] p-[6px] hover:bg-surface-muted ${view === 'history' ? 'text-brand' : 'text-ink-400 hover:text-ink-700'}`}
          >
            <History size={16} />
          </button>
          <span
            className="cursor-pointer rounded-md border border-line px-[7px] py-[3px] text-[11px] font-semibold text-ink-400"
            onClick={onClose}
          >
            Esc
          </span>
        </div>

        {view === 'history' ? (
          <div className="max-h-[420px] min-h-[160px] overflow-y-auto">
            <SearchHistoryList onSelect={handleSelectThread} onDeleted={handleThreadDeleted} />
          </div>
        ) : (
          <div
            ref={listRef}
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            className="max-h-[420px] min-h-[160px] overflow-y-auto px-[18px] py-4"
          >
            {restoring && <div className="px-[18px] py-8 text-center text-[13px] text-ink-400">Loading…</div>}
            {!restoring && messages.length === 0 && !pending && (
              <div className="px-[18px] py-8 text-center text-[13px] text-ink-400">
                Ask a question about leave/WFH, the directory, departments, projects, holidays, your requests, balances, approvals, or visitors to get started.
              </div>
            )}
            <div className="flex flex-col gap-3">
              {!restoring &&
                messages.map((m) => (
                  <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                    <div
                      className={
                        m.role === 'user'
                          ? 'max-w-[85%] rounded-[14px] rounded-tr-[4px] bg-brand px-4 py-3 text-[14px] text-brand-ink'
                          : 'max-w-[85%] rounded-[14px] rounded-tl-[4px] bg-surface-muted px-4 py-3 text-[14px] text-ink-900'
                      }
                    >
                      <div className="whitespace-pre-wrap">{m.content}</div>
                      <MessageRows message={m} />
                    </div>
                  </div>
                ))}
              {pending && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-[14px] rounded-tl-[4px] bg-surface-muted px-4 py-3 text-[13px] text-ink-400">
                    Thinking…
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {view === 'chat' && error && (
          <div className="flex items-center justify-between gap-3 border-t border-line-soft px-[18px] py-[10px] text-[13px] text-danger">
            <span>{error}</span>
            <button type="button" onClick={handleRetry} className="flex-none font-semibold text-brand-hover">
              Retry
            </button>
          </div>
        )}

        {view === 'chat' && (
          <div className="flex items-end gap-[11px] border-t border-line-soft px-[18px] py-4">
            <textarea
              ref={textareaRef}
              rows={1}
              placeholder="Ask about leave, WFH, departments, projects, holidays, or your own requests…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              className="min-w-0 flex-1 resize-none border-none bg-transparent text-base text-ink-900 outline-none"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || pending}
              aria-label="Send"
              className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-brand text-brand-ink disabled:opacity-40"
            >
              <Send size={17} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
