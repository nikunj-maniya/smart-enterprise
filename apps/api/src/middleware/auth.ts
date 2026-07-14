import type { Request, Response, NextFunction } from 'express';
import { SystemRoleKey } from '@se/shared';
import { verifyAccessToken } from '../lib/jwt.js';
import { resolveAuthedUser } from '../lib/auth-cache.js';
import { HttpError } from '../lib/http-error.js';

export interface AuthedUser {
  id: string;
  email: string;
  isSystemAdmin: boolean;
  tenantId: string | null;
  roles: string[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

/** Require a valid access token; attaches req.user. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new HttpError(401, 'Missing or invalid Authorization header');
    }
    const token = header.slice('Bearer '.length);
    const payload = verifyAccessToken(token);
    const authedUser = await resolveAuthedUser(payload.sub);
    if (!authedUser) {
      throw new HttpError(401, 'User not found or inactive');
    }
    req.user = authedUser;
    next();
  } catch (err) {
    if (err instanceof HttpError) return next(err);
    next(new HttpError(401, 'Invalid or expired token'));
  }
}

/** Require the caller to be the platform System Admin (only cross-tenant actor). */
export function requireSystemAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user?.isSystemAdmin) {
    return next(new HttpError(403, 'System Admin access required'));
  }
  next();
}

/** Require the caller to hold the tenant's Enterprise Admin role. */
export function requireEnterpriseAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user?.tenantId || !req.user.roles.includes(SystemRoleKey.EnterpriseAdmin)) {
    return next(new HttpError(403, 'Enterprise Admin access required'));
  }
  next();
}

/** Require the caller to hold the tenant's IT Admin role (it-fulfilment spec: fulfilment queue access). */
export function requireItAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user?.tenantId || !req.user.roles.includes(SystemRoleKey.ItAdmin)) {
    return next(new HttpError(403, 'IT Admin access required'));
  }
  next();
}
