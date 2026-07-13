import { SystemRoleKey } from '@se/shared';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';

export interface Viewer {
  id: string;
  roles: string[];
}

export type AbsenceScope = { role: 'hr' } | { role: 'management' } | { role: 'pm-tl'; projectIds: string[] };

/**
 * PRD §11A.1: who may read the absence feed and at what tier. HR sees every approved Leave/WFH
 * tenant-wide with full detail; Enterprise Admin gets the Management availability-only view;
 * PM/Tech Lead are scoped to the projects they lead. Employee/Process Head/IT Admin have no
 * absence-feed access — their own absences already surface through My Requests.
 */
export async function resolveAbsenceScope(tenantId: string, viewer: Viewer): Promise<AbsenceScope> {
  if (viewer.roles.includes(SystemRoleKey.HrHead)) return { role: 'hr' };
  if (viewer.roles.includes(SystemRoleKey.EnterpriseAdmin)) return { role: 'management' };
  if (viewer.roles.includes(SystemRoleKey.ProjectManager) || viewer.roles.includes(SystemRoleKey.TechLead)) {
    const rows = await prisma.projectMember.findMany({
      where: { userId: viewer.id, roleInProject: { in: ['PM', 'TL'] }, project: { tenantId } },
      select: { projectId: true },
    });
    return { role: 'pm-tl', projectIds: rows.map((r) => r.projectId) };
  }
  throw new HttpError(403, 'No absence visibility for this role');
}

/**
 * PRD §11A.1: while pending, a request is visible only to its requester and its snapshotted
 * approvers — nobody else, regardless of role. Approvers who can see it get full detail (they
 * decide on reason/context), so there is no field-stripping to apply on this path.
 */
export function canViewRequestDetail(
  viewerId: string,
  request: { requesterId: string; approvers: { approverId: string }[] },
): boolean {
  return request.requesterId === viewerId || request.approvers.some((a) => a.approverId === viewerId);
}
