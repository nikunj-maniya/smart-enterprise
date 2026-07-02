import type { Request, Response, NextFunction } from 'express';
import * as overviewService from './overview.service.js';

export async function get(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await overviewService.getOverview());
  } catch (err) {
    next(err);
  }
}
