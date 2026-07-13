import {
  ClipboardCheck,
  CheckCircle,
  XCircle,
  FileText,
  Plane,
  Home,
  Monitor,
  UserCheck,
  RefreshCw,
  Clock,
  ArrowUpCircle,
  type LucideIcon,
} from 'lucide-react';
import type { NotificationDto } from '@se/shared';

/** Core form-type icon, per the design (custom/unrecognized forms fall back to a generic doc icon). */
const FORM_KEY_ICON: Record<string, LucideIcon> = {
  leave: Plane,
  wfh: Home,
  it: Monitor,
  visitor: UserCheck,
};

/**
 * Per-type icon/title/target — a `switch` (not a lookup map) so each case narrows `n.payload`
 * to that notification's own variant. Request-event notifications deep-link to the requester's
 * My Requests list or the approver's Approvals Queue (with the request id as a query param so
 * either page can open the matching detail view/card), scoped to the requester/approver roles.
 * Shared by the topbar bell dropdown and the Notifications Center page.
 */
export function notifStyle(n: NotificationDto): { icon: LucideIcon; title: string; to: string } {
  switch (n.type) {
    case 'enterprise_registered':
      return {
        icon: ClipboardCheck,
        title: `New enterprise registration — ${n.payload.companyName}`,
        to: '/registrations',
      };
    case 'request_approved':
      return {
        icon: CheckCircle,
        title: `${n.payload.approverName} approved your ${n.payload.formTitle} request`,
        to: `/requests?requestId=${n.payload.requestId}`,
      };
    case 'request_rejected':
      return {
        icon: XCircle,
        title: `${n.payload.approverName} rejected your ${n.payload.formTitle} request`,
        to: `/requests?requestId=${n.payload.requestId}`,
      };
    case 'request_needs_approval':
      return {
        icon: FORM_KEY_ICON[n.payload.formKey] ?? FileText,
        title: `New ${n.payload.formTitle} request from ${n.payload.requesterName} needs your approval`,
        to: `/requests/approvals?requestId=${n.payload.requestId}`,
      };
    case 'request_status_changed':
      return {
        icon: RefreshCw,
        title: `Your ${n.payload.formTitle} request moved to ${n.payload.toState}`,
        to: `/requests?requestId=${n.payload.requestId}`,
      };
    case 'approval_reminder':
      return {
        icon: Clock,
        title: `${n.payload.pendingCount} requests are awaiting your decision`,
        to: '/requests/approvals',
      };
    case 'request_decision_update':
      return {
        icon: CheckCircle,
        title: `${n.payload.approverName} approved your ${n.payload.formTitle} request — awaiting other approvers`,
        to: `/requests?requestId=${n.payload.requestId}`,
      };
    case 'approval_peer_decided':
      return {
        icon: n.payload.decision === 'approved' ? CheckCircle : XCircle,
        title: `${n.payload.approverName} ${n.payload.decision} the ${n.payload.formTitle} request`,
        to: `/requests/approvals?requestId=${n.payload.requestId}`,
      };
    case 'approval_escalated': {
      const causeLabel = { on_leave: 'on leave', inactive: 'inactive', timeout: "didn't act in time" }[n.payload.cause];
      return {
        icon: ArrowUpCircle,
        title: `A ${n.payload.formTitle} approval was escalated (approver ${causeLabel})`,
        to: `/requests/approvals?requestId=${n.payload.requestId}`,
      };
    }
  }
}
