import type { Request, Response, NextFunction } from 'express';
import { globalSearchQuerySchema } from '@se/shared';
import * as searchService from './search.service.js';

export async function search(req: Request, res: Response, next: NextFunction) {
  try {
    const { q } = globalSearchQuerySchema.parse(req.query);
    res.json(await searchService.globalSearch(req.user!, q));
  } catch (err) {
    next(err);
  }
}
