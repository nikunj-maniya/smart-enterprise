import type { Request, Response, NextFunction } from 'express';
import { checkInWithSignatureRequestSchema } from '@se/shared';
import * as frontDeskService from './front-desk.service.js';

export async function today(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await frontDeskService.getTodayView(req.user!.tenantId!));
  } catch (err) {
    next(err);
  }
}

export async function checkIn(req: Request, res: Response, next: NextFunction) {
  try {
    const body = checkInWithSignatureRequestSchema.parse(req.body);
    const actor = { id: req.user!.id, roles: req.user!.roles };
    res.json(await frontDeskService.checkInWithSignature(req.user!.tenantId!, actor, req.params.requestId, body));
  } catch (err) {
    next(err);
  }
}

export async function signatureUrl(req: Request, res: Response, next: NextFunction) {
  try {
    const url = await frontDeskService.getSignatureUrl(req.user!.tenantId!, req.params.requestId);
    res.json({ url });
  } catch (err) {
    next(err);
  }
}
