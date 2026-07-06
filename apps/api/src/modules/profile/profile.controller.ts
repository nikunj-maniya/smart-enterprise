import type { Request, Response, NextFunction } from 'express';
import { updateProfileRequestSchema } from '@se/shared';
import * as profileService from './profile.service.js';

export async function get(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await profileService.getProfile(req.user!.id));
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const input = updateProfileRequestSchema.parse(req.body);
    res.json(await profileService.updateProfile(req.user!.id, input));
  } catch (err) {
    next(err);
  }
}
