import type { Request, Response, NextFunction } from 'express';
import {
  createFormDraftRequestSchema,
  publishFormRequestSchema,
  saveDraftFieldsRequestSchema,
} from '@se/shared';
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

export async function listBuilder(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await formsService.listFormsForBuilder(req.user!.tenantId!));
  } catch (err) {
    next(err);
  }
}

export async function getDraft(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await formsService.getFormDraft(req.user!.tenantId!, req.params.key));
  } catch (err) {
    next(err);
  }
}

export async function createDraft(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createFormDraftRequestSchema.parse(req.body);
    const dto = await formsService.createFormDraft(req.user!.tenantId!, req.user!.id, body);
    res.status(201).json(dto);
  } catch (err) {
    next(err);
  }
}

export async function saveDraft(req: Request, res: Response, next: NextFunction) {
  try {
    const body = saveDraftFieldsRequestSchema.parse(req.body);
    const dto = await formsService.saveDraftFields(
      req.user!.tenantId!,
      req.user!.id,
      req.params.key,
      body,
    );
    res.json(dto);
  } catch (err) {
    next(err);
  }
}
