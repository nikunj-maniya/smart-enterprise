import type { Request, Response, NextFunction } from 'express';
import {
  loginRequestSchema,
  changePasswordRequestSchema,
  forgotPasswordRequestSchema,
  resetPasswordRequestSchema,
} from '@se/shared';
import { HttpError } from '../../lib/http-error.js';
import { setAuthCookies, clearAuthCookies, getRefreshTokenCookie } from '../../lib/auth-cookies.js';
import * as authService from './auth.service.js';

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = loginRequestSchema.parse(req.body);
    const result = await authService.login(email, password);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    // Tokens stay in the body too for Bearer-header clients (e2e fixtures, Swagger/Postman) —
    // the web app itself never reads them back out; it relies on the cookies just set above.
    res.json(result);
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

export async function forgotPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = forgotPasswordRequestSchema.parse(req.body);
    await authService.requestPasswordReset(email);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { token, newPassword } = resetPasswordRequestSchema.parse(req.body);
    await authService.resetPassword(token, newPassword);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.body?.refreshToken ?? getRefreshTokenCookie(req);
    if (!token) throw new HttpError(400, 'refreshToken is required');
    const result = await authService.refresh(token);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.body?.refreshToken ?? getRefreshTokenCookie(req);
    if (token) await authService.logout(token);
    clearAuthCookies(res);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
