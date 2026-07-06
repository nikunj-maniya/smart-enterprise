import type { Request, Response, NextFunction } from 'express';
import { generateRegistrationLinkRequestSchema, selfRegisterRequestSchema } from '@se/shared';
import * as service from './self-registration.service.js';

// ── Admin (Enterprise Admin) ──────────────────────────────
export async function getLink(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await service.getLink(req.user!.tenantId!));
  } catch (err) {
    next(err);
  }
}

export async function generate(req: Request, res: Response, next: NextFunction) {
  try {
    const { expiryMinutes } = generateRegistrationLinkRequestSchema.parse(req.body);
    res.status(201).json(await service.generateLink(req.user!.tenantId!, req.user!.id, expiryMinutes));
  } catch (err) {
    next(err);
  }
}

export async function revoke(req: Request, res: Response, next: NextFunction) {
  try {
    await service.revokeLink(req.user!.tenantId!, req.user!.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

// ── Public (token-gated, no auth) ─────────────────────────
export async function publicInfo(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await service.getPublicInfo(req.params.token));
  } catch (err) {
    next(err);
  }
}

export async function publicRegister(req: Request, res: Response, next: NextFunction) {
  try {
    const input = selfRegisterRequestSchema.parse(req.body);
    await service.registerViaToken(req.params.token, input);
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
}
