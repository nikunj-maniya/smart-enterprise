import type { Prisma } from '@prisma/client';
import type { NotificationDto } from '@se/shared';
import { prisma } from '../../prisma.js';

/** The typed content of one notification — everything but the row's id/read/createdAt. */
type NotificationInput = Omit<NotificationDto, 'id' | 'read' | 'createdAt'>;

const LIST_LIMIT = 20;

function toDto(row: {
  id: string;
  type: string;
  payload: unknown;
  read: boolean;
  createdAt: Date;
}): NotificationDto {
  return {
    id: row.id,
    type: row.type,
    payload: row.payload,
    read: row.read,
    createdAt: row.createdAt.toISOString(),
  } as NotificationDto;
}

export async function listNotifications(userId: string): Promise<NotificationDto[]> {
  const rows = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: LIST_LIMIT,
  });
  return rows.map(toDto);
}

export async function markRead(userId: string, id: string): Promise<void> {
  await prisma.notification.updateMany({ where: { id, userId }, data: { read: true } });
}

export async function markAllRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
}

/** Write one notification, inside a caller's transaction. */
export async function notify(
  tx: Prisma.TransactionClient,
  tenantId: string,
  userId: string,
  notification: NotificationInput,
): Promise<void> {
  await tx.notification.create({
    data: { tenantId, userId, type: notification.type, payload: notification.payload as Prisma.InputJsonValue, read: false },
  });
}

/** Write the same notification to several recipients (e.g. every approver on a submission), inside a caller's transaction. */
export async function notifyMany(
  tx: Prisma.TransactionClient,
  tenantId: string,
  userIds: string[],
  notification: NotificationInput,
): Promise<void> {
  if (userIds.length === 0) return;
  await tx.notification.createMany({
    data: userIds.map((userId) => ({
      tenantId,
      userId,
      type: notification.type,
      payload: notification.payload as Prisma.InputJsonValue,
      read: false,
    })),
  });
}
