import type { Request, Response, NextFunction } from 'express';
import { publishFormRequestSchema } from '@se/shared';
import * as formsService from './forms.service.js';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await formsService.listForms(req.user!.tenantId!));
  } catch (err) {
    next(err);
  }
}

export async function getByKey(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await formsService.getFormByKey(req.user!.tenantId!, req.params.key));
  } catch (err) {
    next(err);
  }
}

export async function publish(req: Request, res: Response, next: NextFunction) {
  try {
    const body = publishFormRequestSchema.parse(req.body);
    const dto = await formsService.publishDefinition(req.user!.tenantId!, req.user!.id, {
      key: req.params.key,
      ...body,
    });
    res.status(201).json(dto);
  } catch (err) {
    next(err);
  }
}
