import { randomBytes, createHash } from 'node:crypto';
import argon2 from 'argon2';
import { TenantStatus, UserStatus } from '@prisma/client';
import type { AuthUser, LoginResponse } from '@se/shared';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/jwt.js';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function toAuthUser(u: {
  id: string;
  name: string;
  email: string;
  isSystemAdmin: boolean;
  mustChangePassword: boolean;
  tenantId: string | null;
}): AuthUser {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    isSystemAdmin: u.isSystemAdmin,
    mustChangePassword: u.mustChangePassword,
    tenantId: u.tenantId,
  };
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const user = await prisma.user.findUnique({ where: { email }, include: { tenant: true } });
  if (!user) throw new HttpError(401, 'Invalid email or password');
  if (user.status !== UserStatus.Active || user.tenant?.status === TenantStatus.Suspended) {
    throw new HttpError(403, 'Account is not active');
  }
  const ok = await argon2.verify(user.passwordHash, password);
  if (!ok) throw new HttpError(401, 'Invalid email or password');

  return {
    user: toAuthUser(user),
    accessToken: signAccessToken(user.id),
    refreshToken: signRefreshToken(user.id),
  };
}

export async function getMe(userId: string): Promise<AuthUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(404, 'User not found');
  return toAuthUser(user);
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<AuthUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(404, 'User not found');

  const ok = await argon2.verify(user.passwordHash, currentPassword);
  if (!ok) throw new HttpError(400, 'Current password is incorrect');

  const passwordHash = await argon2.hash(newPassword);
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, mustChangePassword: false },
  });
  return toAuthUser(updated);
}

export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  // Resolve the same way whether or not the account exists — avoids email enumeration.
  if (!user || user.status !== UserStatus.Active) return;

  const token = randomBytes(32).toString('hex');
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    },
  });

  // No email provider is wired up yet (D-30) — log the link as a stand-in for the email send.
  const resetUrl = `${process.env.WEB_URL ?? 'http://localhost:5173'}/reset-password?token=${token}`;
  // eslint-disable-next-line no-console
  console.log(`[password-reset] link for ${email}: ${resetUrl}`);
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new HttpError(400, 'This reset link is invalid or has expired.');
  }

  const passwordHash = await argon2.hash(newPassword);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash, mustChangePassword: false },
    }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);
}

export async function refresh(refreshToken: string) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new HttpError(401, 'Invalid or expired refresh token');
  }
  const user = await prisma.user.findUnique({ where: { id: payload.sub }, include: { tenant: true } });
  if (!user || user.status !== UserStatus.Active || user.tenant?.status === TenantStatus.Suspended) {
    throw new HttpError(401, 'User not found or inactive');
  }
  return {
    accessToken: signAccessToken(user.id),
    refreshToken: signRefreshToken(user.id),
  };
}
