import type { Request, Response, NextFunction } from 'express';
import { holidayCreateSchema, holidayListQuerySchema, holidayUpdateSchema } from '@se/shared';
import { HttpError } from '../../lib/http-error.js';
import * as holidaysService from './holidays.service.js';

/** The list route has no role gate (any tenant user may view holidays), so the tenant check
 *  `requireAnyRole` does elsewhere happens here — a platform System Admin has no tenant. */
function tenantIdOf(req: Request): string {
  const tenantId = req.user!.tenantId;
  if (!tenantId) throw new HttpError(403, 'Tenant context required');
  return tenantId;
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const query = holidayListQuerySchema.parse(req.query);
    res.json({ rows: await holidaysService.listHolidays(tenantIdOf(req), query.year) });
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const body = holidayCreateSchema.parse(req.body);
    const dto = await holidaysService.createHoliday(req.user!.tenantId!, req.user!.id, body);
    res.status(201).json(dto);
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const body = holidayUpdateSchema.parse(req.body);
    const dto = await holidaysService.updateHoliday(req.user!.tenantId!, req.user!.id, req.params.id, body);
    res.json(dto);
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await holidaysService.deleteHoliday(req.user!.tenantId!, req.user!.id, req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
