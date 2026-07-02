import type { PlatformSettings, UpdatePlatformSettingsRequest } from '@se/shared';
import { prisma } from '../../prisma.js';

function toDto(settings: {
  forcePasswordChangeOnFirstLogin: boolean;
  allowPublicRegistration: boolean;
  notifyOnNewRegistration: boolean;
}): PlatformSettings {
  return {
    forcePasswordChangeOnFirstLogin: settings.forcePasswordChangeOnFirstLogin,
    allowPublicRegistration: settings.allowPublicRegistration,
    notifyOnNewRegistration: settings.notifyOnNewRegistration,
  };
}

/** Reads the singleton settings row, creating it with schema defaults on first call. */
export async function getSettings(): Promise<PlatformSettings> {
  const settings = await prisma.platformSettings.upsert({
    where: { id: 'singleton' },
    create: {},
    update: {},
  });
  return toDto(settings);
}

export async function updateSettings(
  input: UpdatePlatformSettingsRequest,
  actorId: string,
): Promise<PlatformSettings> {
  const before = await getSettings();

  const updated = await prisma.$transaction(async (tx) => {
    const settings = await tx.platformSettings.update({
      where: { id: 'singleton' },
      data: { ...input, updatedBy: actorId },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        entity: 'PlatformSettings',
        entityId: 'singleton',
        action: 'update',
        before,
        after: toDto(settings),
      },
    });
    return settings;
  });

  return toDto(updated);
}
