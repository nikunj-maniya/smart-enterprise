import type { Request, Response, NextFunction } from 'express';
import { loginRequestSchema, changePasswordRequestSchema } from '@se/shared';
import { HttpError } from '../../lib/http-error.js';
import * as authService from './auth.service.js';

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = loginRequestSchema.parse(req.body);
    res.json(await authService.login(email, password));
  } catch (err) {
    next(err);
  }
}

export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await authService.getMe(req.user!.id));
  } catch (err) {
    next(err);
  }
}

export async function changePassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { currentPassword, newPassword } = changePasswordRequestSchema.parse(req.body);
    res.json(await authService.changePassword(req.user!.id, currentPassword, newPassword));
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.body?.refreshToken;
    if (!token) throw new HttpError(400, 'refreshToken is required');
    res.json(await authService.refresh(token));
  } catch (err) {
    next(err);
  }
}

export function logout(_req: Request, res: Response) {
  // Stateless JWT: client discards tokens. Endpoint exists for symmetry / future revocation.
  res.json({ ok: true });
}
