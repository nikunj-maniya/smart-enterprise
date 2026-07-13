import type { Prisma } from '@prisma/client';
import { NOTIFICATION_TYPE_CATALOG, type NotificationPreferencesResponse, type UpdateNotificationPreferenceRequest } from '@se/shared';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';

type StoredPreferences = Record<string, { inApp?: boolean; slack?: boolean }>;

const MANDATORY_TYPES = new Set(NOTIFICATION_TYPE_CATALOG.filter((t) => t.mandatory).map((t) => t.type));

function parseStored(raw: unknown): StoredPreferences {
  return raw && typeof raw === 'object' ? (raw as StoredPreferences) : {};
}

/**
 * Delivery-time filter (design.md: "a delivery-time filter in the notification dispatcher") —
 * mandatory types (tenant policy, `NOTIFICATION_TYPE_CATALOG`) always deliver; everything else
 * defaults to enabled (opt-out model) unless the user has explicitly disabled that channel.
 * Takes the caller's own Prisma client (typically the surrounding transaction) so this read is
 * consistent with the write it's gating.
 */
export async function isChannelEnabled(
  db: Prisma.TransactionClient | typeof prisma,
  userId: string,
  type: string,
  channel: 'inApp' | 'slack',
): Promise<boolean> {
  if (MANDATORY_TYPES.has(type)) return true;
  const user = await db.user.findUnique({ where: { id: userId }, select: { notificationPreferences: true } });
  const stored = parseStored(user?.notificationPreferences);
  return stored[type]?.[channel] ?? true;
}

/** GET /profile/notification-preferences — every catalog type, merged with the user's stored overrides. */
export async function getPreferences(userId: string): Promise<NotificationPreferencesResponse> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { notificationPreferences: true } });
  const stored = parseStored(user.notificationPreferences);

  return {
    rows: NOTIFICATION_TYPE_CATALOG.map((entry) => ({
      type: entry.type,
      label: entry.label,
      mandatory: entry.mandatory,
      inApp: entry.mandatory ? true : (stored[entry.type]?.inApp ?? true),
      slack: entry.mandatory ? true : (stored[entry.type]?.slack ?? true),
    })),
  };
}

/** PUT /profile/notification-preferences — one type/channel toggle at a time; refuses mandatory types. */
export async function updatePreference(
  userId: string,
  input: UpdateNotificationPreferenceRequest,
): Promise<NotificationPreferencesResponse> {
  const catalogEntry = NOTIFICATION_TYPE_CATALOG.find((e) => e.type === input.type);
  if (!catalogEntry) throw new HttpError(400, 'Unknown notification type');
  if (catalogEntry.mandatory) throw new HttpError(400, 'This notification type is mandatory and cannot be muted');

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { notificationPreferences: true } });
  const stored = parseStored(user.notificationPreferences);
  const next: StoredPreferences = { ...stored, [input.type]: { ...stored[input.type], [input.channel]: input.enabled } };

  await prisma.user.update({ where: { id: userId }, data: { notificationPreferences: next as Prisma.InputJsonValue } });
  return getPreferences(userId);
}
