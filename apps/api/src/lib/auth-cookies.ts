import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';

export const ACCESS_COOKIE = 'se_access';
export const REFRESH_COOKIE = 'se_refresh';
export const CSRF_COOKIE = 'se_csrf';

const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000; // matches signAccessToken's expiresIn
const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // matches REFRESH_TOKEN_TTL_MS

const isProd = process.env.NODE_ENV === 'production';

/**
 * Sets the browser's auth cookies after login/refresh (security audit finding #6): access and
 * refresh tokens move out of the JS-reachable `localStorage` the frontend used before, into
 * httpOnly cookies an XSS payload can't read. `se_csrf` is deliberately NOT httpOnly — the
 * frontend reads it and echoes it back as a header (see `middleware/csrf.ts`) so a cross-site
 * request that merely rides the auth cookies automatically still can't forge a matching header.
 */
export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: ACCESS_TOKEN_MAX_AGE_MS,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: REFRESH_TOKEN_MAX_AGE_MS,
  });
  res.cookie(CSRF_COOKIE, randomBytes(16).toString('hex'), {
    httpOnly: false,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: REFRESH_TOKEN_MAX_AGE_MS,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { path: '/' });
  res.clearCookie(REFRESH_COOKIE, { path: '/' });
  res.clearCookie(CSRF_COOKIE, { path: '/' });
}

export function getAccessTokenCookie(req: Request): string | undefined {
  return req.cookies?.[ACCESS_COOKIE];
}

export function getRefreshTokenCookie(req: Request): string | undefined {
  return req.cookies?.[REFRESH_COOKIE];
}
