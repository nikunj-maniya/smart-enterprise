import jwt from 'jsonwebtoken';

const accessSecret = process.env.JWT_ACCESS_SECRET ?? 'change-me-access';
const refreshSecret = process.env.JWT_REFRESH_SECRET ?? 'change-me-refresh';

export interface TokenPayload {
  sub: string; // user id
}

export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId } satisfies TokenPayload, accessSecret, { expiresIn: '15m' });
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId } satisfies TokenPayload, refreshSecret, { expiresIn: '7d' });
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, accessSecret) as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, refreshSecret) as TokenPayload;
}
