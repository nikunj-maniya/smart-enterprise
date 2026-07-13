import type { Prisma } from '@prisma/client';
import type { NotificationDto, NotificationsQuery, NotificationsResponse } from '@se/shared';
import { prisma } from '../../prisma.js';
import { emitToUser } from '../../lib/socket.js';
import { mirrorToSlack } from '../slack/slack-delivery.js';
import { isChannelEnabled } from './notification-preferences.js';

/** The typed content of one notification — everything but the row's id/read/createdAt. */
type NotificationInput = Omit<NotificationDto, 'id' | 'read' | 'createdAt'>;

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

/** GET /notifications — the caller's own notifications, tabbed and paginated; `unreadCount` is
 *  always the caller's total unread (not just this page), so the bell badge and center tab
 *  count stay right regardless of pageSize. */
export async function listNotifications(
  userId: string,
  query: NotificationsQuery,
): Promise<NotificationsResponse> {
  const { tab, page, pageSize } = query;
  const where: Prisma.NotificationWhereInput = { userId, ...(tab === 'unread' ? { read: false } : {}) };

  const [rows, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, read: false } }),
  ]);

  return { rows: rows.map(toDto), total, unreadCount, page, pageSize };
}

export async function markRead(userId: string, id: string): Promise<void> {
  await prisma.notification.updateMany({ where: { id, userId }, data: { read: true } });
}

export async function markAllRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
}

/** Create one recipient's row and push it live, inside the caller's transaction. The push fires
 *  before the transaction has committed — a deliberate, accepted tradeoff (design.md): if the
 *  surrounding transaction later rolls back, a live client sees a stale nudge that the next 30s
 *  poll silently reconciles away, which is simpler than threading a post-commit callback through
 *  every call site. */
async function createAndEmit(
  tx: Prisma.TransactionClient,
  tenantId: string,
  userId: string,
  notification: NotificationInput,
): Promise<void> {
  // Per-user, per-channel preferences (reporting-and-polish) — mandatory types always pass;
  // everything else defaults to enabled unless the user muted that specific channel.
  if (await isChannelEnabled(tx, userId, notification.type, 'inApp')) {
    const row = await tx.notification.create({
      data: { tenantId, userId, type: notification.type, payload: notification.payload as Prisma.InputJsonValue, read: false },
    });
    emitToUser(userId, 'notification:new', toDto(row));
  }
  // Mirror to Slack (slack-integration) — fire-and-forget, gated by both the tenant's toggle
  // (inside `mirrorToSlack`) and the user's own Slack preference for this type; never blocks or
  // delays the in-app write above.
  if (await isChannelEnabled(tx, userId, notification.type, 'slack')) {
    mirrorToSlack(tenantId, userId, notification.type, notification.payload);
  }
}

/** Write one notification, inside a caller's transaction. */
export async function notify(
  tx: Prisma.TransactionClient,
  tenantId: string,
  userId: string,
  notification: NotificationInput,
): Promise<void> {
  await createAndEmit(tx, tenantId, userId, notification);
}

/** Write the same notification to several recipients (e.g. every approver on a submission), inside a caller's transaction. */
export async function notifyMany(
  tx: Prisma.TransactionClient,
  tenantId: string,
  userIds: string[],
  notification: NotificationInput,
): Promise<void> {
  if (userIds.length === 0) return;
  await Promise.all(userIds.map((userId) => createAndEmit(tx, tenantId, userId, notification)));
}
