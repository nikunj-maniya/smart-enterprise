import type { Request, Response, NextFunction } from 'express';
import { updatePlatformSettingsSchema } from '@se/shared';
import * as settingsService from './settings.service.js';

export async function get(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await settingsService.getSettings());
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const input = updatePlatformSettingsSchema.parse(req.body);
    res.json(await settingsService.updateSettings(input, req.user!.id));
  } catch (err) {
    next(err);
  }
}
