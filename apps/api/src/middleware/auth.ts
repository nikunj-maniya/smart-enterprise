import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma.js';
import { verifyAccessToken } from '../lib/jwt.js';
import { HttpError } from '../lib/http-error.js';

export interface AuthedUser {
  id: string;
  email: string;
  isSystemAdmin: boolean;
  tenantId: string | null;
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
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== 'Active') {
      throw new HttpError(401, 'User not found or inactive');
    }
    req.user = {
      id: user.id,
      email: user.email,
      isSystemAdmin: user.isSystemAdmin,
      tenantId: user.tenantId,
    };
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
