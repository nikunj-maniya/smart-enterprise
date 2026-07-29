import type { Request, Response, NextFunction } from 'express';
import { smartSearchRequestSchema } from '@se/shared';
import * as smartSearchService from './smart-search.service.js';

export async function ask(req: Request, res: Response, next: NextFunction) {
  try {
    const input = smartSearchRequestSchema.parse(req.body);
    res.json(await smartSearchService.handleSmartSearch(req.user!.tenantId!, req.user!, input));
  } catch (err) {
    next(err);
  }
}
