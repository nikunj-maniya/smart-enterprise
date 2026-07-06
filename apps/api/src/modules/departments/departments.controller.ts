import type { Request, Response, NextFunction } from 'express';
import { createDepartmentRequestSchema, departmentsQuerySchema, updateDepartmentRequestSchema } from '@se/shared';
import * as departmentsService from './departments.service.js';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const query = departmentsQuerySchema.parse(req.query);
    res.json(await departmentsService.listDepartments(req.user!.tenantId!, query));
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createDepartmentRequestSchema.parse(req.body);
    const dept = await departmentsService.createDepartment(req.user!.tenantId!, req.user!.id, input);
    res.status(201).json(dept);
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const input = updateDepartmentRequestSchema.parse(req.body);
    const dept = await departmentsService.updateDepartment(
      req.user!.tenantId!,
      req.params.id,
      req.user!.id,
      input,
    );
    res.json(dept);
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await departmentsService.deleteDepartment(req.user!.tenantId!, req.params.id, req.user!.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function archive(req: Request, res: Response, next: NextFunction) {
  try {
    const dept = await departmentsService.setDepartmentArchived(
      req.user!.tenantId!,
      req.params.id,
      req.user!.id,
      req.path.endsWith('/unarchive') ? false : true,
    );
    res.json(dept);
  } catch (err) {
    next(err);
  }
}
