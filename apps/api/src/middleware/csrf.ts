import type { Request, Response, NextFunction } from 'express';
import { HttpError } from '../lib/http-error.js';
import { CSRF_COOKIE } from '../lib/auth-cookies.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Bearer-header callers (e2e fixtures, Swagger/Postman, any non-browser API client) aren't
// CSRF-exploitable in the first place — a cross-site page can't make the victim's browser attach
// a custom Authorization header. Only requests riding the browser's auto-attached auth cookies
// need the double-submit check, so this list only needs to cover cookie-driven, pre-session paths.
const EXEMPT_PATHS = new Set(['/auth/login', '/auth/refresh', '/auth/logout', '/auth/forgot-password', '/auth/reset-password']);

/**
 * Double-submit-cookie CSRF check (security audit finding #6): now that the browser app's tokens
 * live in httpOnly cookies rather than a manually-attached Authorization header, an auto-attached
 * cookie alone no longer proves a request came from our own frontend — a cross-site form/fetch
 * rides the cookie too. `se_csrf` is readable by our own frontend JS (same-origin) but not by
 * script on another origin, so only our frontend can echo it back as the `X-CSRF-Token` header.
 */
export function requireCsrfToken(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) return next();
  if (req.headers.authorization) return next(); // Bearer-header caller — not cookie-riding
  if (EXEMPT_PATHS.has(req.path) || req.path.startsWith('/public/') || req.path === '/slack/interactions') {
    return next();
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.headers['x-csrf-token'];
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return next(new HttpError(403, 'Invalid or missing CSRF token'));
  }
  next();
}
