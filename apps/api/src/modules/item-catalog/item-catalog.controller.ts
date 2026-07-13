import type { Request, Response, NextFunction } from 'express';
import { createItemCatalogRequestSchema, updateItemCatalogRequestSchema } from '@se/shared';
import * as itemCatalogService from './item-catalog.service.js';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await itemCatalogService.listItemCatalog(req.user!.tenantId!));
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createItemCatalogRequestSchema.parse(req.body);
    const dto = await itemCatalogService.createItemCatalog(req.user!.tenantId!, req.user!.id, body);
    res.status(201).json(dto);
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const body = updateItemCatalogRequestSchema.parse(req.body);
    const dto = await itemCatalogService.updateItemCatalog(req.user!.tenantId!, req.user!.id, req.params.id, body);
    res.json(dto);
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await itemCatalogService.deleteItemCatalog(req.user!.tenantId!, req.user!.id, req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
