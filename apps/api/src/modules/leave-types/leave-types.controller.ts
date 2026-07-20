import type { Request, Response, NextFunction } from 'express';
import { createLeaveTypeRequestSchema, updateAbsenceCapRequestSchema, updateLeaveTypeRequestSchema } from '@se/shared';
import * as leaveTypesService from './leave-types.service.js';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await leaveTypesService.listLeaveTypes(req.user!.tenantId!));
  } catch (err) {
    next(err);
  }
}

export async function getAbsenceCap(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await leaveTypesService.getAbsenceCap(req.user!.tenantId!));
  } catch (err) {
    next(err);
  }
}

export async function updateAbsenceCap(req: Request, res: Response, next: NextFunction) {
  try {
    const body = updateAbsenceCapRequestSchema.parse(req.body);
    res.json(await leaveTypesService.updateAbsenceCap(req.user!.tenantId!, req.user!.id, body));
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createLeaveTypeRequestSchema.parse(req.body);
    const dto = await leaveTypesService.createLeaveType(req.user!.tenantId!, req.user!.id, body);
    res.status(201).json(dto);
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const body = updateLeaveTypeRequestSchema.parse(req.body);
    const dto = await leaveTypesService.updateLeaveType(req.user!.tenantId!, req.user!.id, req.params.id, body);
    res.json(dto);
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await leaveTypesService.deleteLeaveType(req.user!.tenantId!, req.user!.id, req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
