import type { Request, Response, NextFunction } from 'express';
import * as notificationsService from './notifications.service.js';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await notificationsService.listNotifications(req.user!.id));
  } catch (err) {
    next(err);
  }
}

export async function markRead(req: Request, res: Response, next: NextFunction) {
  try {
    await notificationsService.markRead(req.user!.id, req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function markAllRead(req: Request, res: Response, next: NextFunction) {
  try {
    await notificationsService.markAllRead(req.user!.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
