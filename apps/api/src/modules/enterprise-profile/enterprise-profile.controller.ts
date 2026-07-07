import type { Request, Response, NextFunction } from 'express';
import { updateEnterpriseDetailsRequestSchema } from '@se/shared';
import * as enterpriseProfileService from './enterprise-profile.service.js';

export async function get(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await enterpriseProfileService.getEnterpriseDetails(req.user!.tenantId!));
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const input = updateEnterpriseDetailsRequestSchema.parse(req.body);
    res.json(
      await enterpriseProfileService.updateEnterpriseDetails(req.user!.tenantId!, req.user!.id, input),
    );
  } catch (err) {
    next(err);
  }
}
