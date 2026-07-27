import jwt from 'jsonwebtoken';

const INSECURE_PLACEHOLDERS = new Set(['change-me-access']);

function requireSecret(envVar: string): string {
  const value = process.env[envVar];
  if (!value || INSECURE_PLACEHOLDERS.has(value)) {
    throw new Error(`${envVar} must be set to a real secret (not unset or the .env.example placeholder)`);
  }
  return value;
}

const accessSecret = requireSecret('JWT_ACCESS_SECRET');

export interface TokenPayload {
  sub: string; // user id
}

export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId } satisfies TokenPayload, accessSecret, { expiresIn: '15m' });
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, accessSecret) as TokenPayload;
}
