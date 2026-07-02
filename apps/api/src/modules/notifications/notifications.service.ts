import type { NotificationDto } from '@se/shared';
import { prisma } from '../../prisma.js';

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
    type: row.type as NotificationDto['type'],
    payload: row.payload as NotificationDto['payload'],
    read: row.read,
    createdAt: row.createdAt.toISOString(),
  };
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
