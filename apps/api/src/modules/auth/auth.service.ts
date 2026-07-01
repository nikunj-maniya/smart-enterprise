import argon2 from 'argon2';
import type { AuthUser, LoginResponse } from '@se/shared';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/jwt.js';

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
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new HttpError(401, 'Invalid email or password');
  if (user.status !== 'Active') {
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

export async function refresh(refreshToken: string) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new HttpError(401, 'Invalid or expired refresh token');
  }
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || user.status !== 'Active') throw new HttpError(401, 'User not found or inactive');
  return {
    accessToken: signAccessToken(user.id),
    refreshToken: signRefreshToken(user.id),
  };
}
