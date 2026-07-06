import { Prisma } from '@prisma/client';
import type {
  CreateProjectRequest,
  ProjectDto,
  ProjectsQuery,
  ProjectsResponse,
  UpdateProjectRequest,
} from '@se/shared';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';

const withMembers = {
  members: { include: { user: { select: { id: true, name: true } } } },
} as const;

type ProjectRow = Prisma.ProjectGetPayload<{ include: typeof withMembers }>;

function toDto(p: ProjectRow): ProjectDto {
  const pmRow = p.members.find((m) => m.roleInProject === 'PM');
  const leadRow = p.members.find((m) => m.roleInProject === 'TL');
  const memberRows = p.members.filter((m) => m.roleInProject === 'member');
  return {
    id: p.id,
    name: p.name,
    status: p.status as ProjectDto['status'],
    pm: pmRow ? { id: pmRow.user.id, name: pmRow.user.name } : null,
    techLead: leadRow ? { id: leadRow.user.id, name: leadRow.user.name } : null,
    members: memberRows.map((m) => ({ id: m.user.id, name: m.user.name })),
    memberCount: memberRows.length,
  };
}

export async function listProjects(
  tenantId: string,
  query: ProjectsQuery,
): Promise<ProjectsResponse> {
  const { page, pageSize, search, status } = query;

  const where: Prisma.ProjectWhereInput = {
    tenantId,
    ...(status ? { status } : {}),
    ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.project.findMany({
      where,
      include: withMembers,
      orderBy: { name: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.project.count({ where }),
  ]);

  return { rows: rows.map(toDto), total, page, pageSize };
}

/**
 * Resolves the ProjectMember rows for an assignment, enforcing tenant membership.
 * A user has exactly one role per project (PK), so PM/TL must differ and members
 * exclude whoever is PM/TL.
 */
async function resolveMemberRows(tenantId: string, input: CreateProjectRequest) {
  const { pmUserId, techLeadUserId, memberIds } = input;
  if (pmUserId && techLeadUserId && pmUserId === techLeadUserId) {
    throw new HttpError(400, 'The PM and Tech Lead must be different people');
  }

  const leadIds = new Set([pmUserId, techLeadUserId].filter((id): id is string => !!id));
  const memberOnly = [...new Set(memberIds)].filter((id) => !leadIds.has(id));
  const allIds = [...new Set([...leadIds, ...memberOnly])];

  if (allIds.length > 0) {
    const count = await prisma.user.count({ where: { tenantId, id: { in: allIds } } });
    if (count !== allIds.length) {
      throw new HttpError(400, 'One or more selected people are not members of this enterprise');
    }
  }

  const rows: { userId: string; roleInProject: string }[] = [];
  if (pmUserId) rows.push({ userId: pmUserId, roleInProject: 'PM' });
  if (techLeadUserId) rows.push({ userId: techLeadUserId, roleInProject: 'TL' });
  for (const userId of memberOnly) rows.push({ userId, roleInProject: 'member' });
  return rows;
}

export async function createProject(
  tenantId: string,
  actorId: string,
  input: CreateProjectRequest,
): Promise<ProjectDto> {
  const memberRows = await resolveMemberRows(tenantId, input);

  const created = await prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        tenantId,
        name: input.name,
        status: input.status,
        members: { create: memberRows },
      },
      include: withMembers,
    });
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId,
        entity: 'Project',
        entityId: project.id,
        action: 'create',
        after: { name: project.name, status: project.status, members: memberRows },
      },
    });
    return project;
  });

  return toDto(created);
}

export async function updateProject(
  tenantId: string,
  id: string,
  actorId: string,
  input: UpdateProjectRequest,
): Promise<ProjectDto> {
  const existing = await prisma.project.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== tenantId) throw new HttpError(404, 'Project not found');
  const memberRows = await resolveMemberRows(tenantId, input);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.projectMember.deleteMany({ where: { projectId: id } });
    const project = await tx.project.update({
      where: { id },
      data: { name: input.name, status: input.status, members: { create: memberRows } },
      include: withMembers,
    });
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId,
        entity: 'Project',
        entityId: id,
        action: 'update',
        before: { name: existing.name, status: existing.status },
        after: { name: project.name, status: project.status, members: memberRows },
      },
    });
    return project;
  });

  return toDto(updated);
}
