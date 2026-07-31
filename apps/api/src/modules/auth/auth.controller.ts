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
    // Tokens travel only via the httpOnly cookies just set above — never in the response body,
    // so an XSS payload can't steal them by reading/hooking the fetch response (finding #2).
    res.json({ user: result.user });
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
    // Same as login — the new token pair travels only via cookies, never the body.
    res.json({ ok: true });
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
