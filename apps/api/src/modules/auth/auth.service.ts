import { randomBytes, createHash } from 'node:crypto';
import argon2 from 'argon2';
import { TenantStatus, UserStatus } from '@prisma/client';
import type { AuthUser, LoginResponse } from '@se/shared';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { signAccessToken } from '../../lib/jwt.js';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Refresh tokens are opaque random strings, not JWTs — `RefreshTokenSession.tokenHash` is the
 *  only server-side record of them, so logout/password-change can actually revoke one before its
 *  TTL, unlike a self-contained JWT (security audit finding #5). */
async function issueRefreshToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  await prisma.refreshTokenSession.create({
    data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS) },
  });
  return token;
}

/** Revokes every outstanding refresh-token session for a user — called on password change/reset
 *  so a stolen refresh token doesn't survive the very action meant to lock the account down. */
async function revokeAllRefreshTokens(userId: string): Promise<void> {
  await prisma.refreshTokenSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

const withRolesAndTenant = {
  tenant: true,
  roles: { include: { role: true } },
} as const;

function toAuthUser(u: {
  id: string;
  name: string;
  email: string;
  isSystemAdmin: boolean;
  mustChangePassword: boolean;
  tenantId: string | null;
  tenant: { name: string } | null;
  roles: { role: { key: string } }[];
}): AuthUser {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    isSystemAdmin: u.isSystemAdmin,
    mustChangePassword: u.mustChangePassword,
    tenantId: u.tenantId,
    tenantName: u.tenant?.name ?? null,
    roles: u.roles.map((ur) => ur.role.key),
  };
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const user = await prisma.user.findUnique({ where: { email }, include: withRolesAndTenant });
  if (!user) throw new HttpError(401, 'Invalid email or password');
  if (user.status === UserStatus.Pending) {
    throw new HttpError(403, 'Your account is awaiting approval by your administrator.');
  }
  if (user.status !== UserStatus.Active || user.tenant?.status === TenantStatus.Suspended) {
    throw new HttpError(403, 'Account is not active');
  }
  const ok = await argon2.verify(user.passwordHash, password);
  if (!ok) throw new HttpError(401, 'Invalid email or password');

  return {
    user: toAuthUser(user),
    accessToken: signAccessToken(user.id),
    refreshToken: await issueRefreshToken(user.id),
  };
}

export async function getMe(userId: string): Promise<AuthUser> {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: withRolesAndTenant });
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
    include: withRolesAndTenant,
  });
  await revokeAllRefreshTokens(userId);
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

  // No email provider is wired up yet (D-30) — log the link as a dev-only stand-in for the
  // email send. Never log the raw reset token in production: log aggregators/container stdout
  // capture would otherwise expose a live, unhashed reset credential.
  if (process.env.NODE_ENV !== 'production') {
    const resetUrl = `${process.env.WEB_URL ?? 'http://localhost:5173'}/reset-password?token=${token}`;
    // eslint-disable-next-line no-console
    console.log(`[password-reset] link for ${email}: ${resetUrl}`);
  }
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
  await revokeAllRefreshTokens(record.userId);
}

export async function refresh(refreshToken: string) {
  const session = await prisma.refreshTokenSession.findUnique({ where: { tokenHash: hashToken(refreshToken) } });
  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw new HttpError(401, 'Invalid or expired refresh token');
  }
  const user = await prisma.user.findUnique({ where: { id: session.userId }, include: { tenant: true } });
  if (!user || user.status !== UserStatus.Active || user.tenant?.status === TenantStatus.Suspended) {
    throw new HttpError(401, 'User not found or inactive');
  }

  // Rotate: revoke the token just used before issuing its replacement, so a replayed old
  // refresh token (e.g. a copy an attacker captured) is rejected on its next use.
  const [, newRefreshToken] = await Promise.all([
    prisma.refreshTokenSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } }),
    issueRefreshToken(user.id),
  ]);

  return {
    accessToken: signAccessToken(user.id),
    refreshToken: newRefreshToken,
  };
}

/** Revokes exactly the refresh-token session presented at logout — a no-op if it's already
 *  unknown/revoked, so logout stays idempotent. */
export async function logout(refreshToken: string): Promise<void> {
  await prisma.refreshTokenSession.updateMany({
    where: { tokenHash: hashToken(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
