import type { Request, Response, NextFunction } from 'express';
import { createRoleRequestSchema, rolesQuerySchema, updateRoleRequestSchema } from '@se/shared';
import * as rolesService from './roles.service.js';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const query = rolesQuerySchema.parse(req.query);
    res.json(await rolesService.listRoles(req.user!.tenantId!, query));
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createRoleRequestSchema.parse(req.body);
    const role = await rolesService.createRole(req.user!.tenantId!, req.user!.id, input);
    res.status(201).json(role);
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const input = updateRoleRequestSchema.parse(req.body);
    const role = await rolesService.updateRole(
      req.user!.tenantId!,
      req.params.id,
      req.user!.id,
      input,
    );
    res.json(role);
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await rolesService.deleteRole(req.user!.tenantId!, req.params.id, req.user!.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function archive(req: Request, res: Response, next: NextFunction) {
  try {
    const role = await rolesService.setRoleArchived(
      req.user!.tenantId!,
      req.params.id,
      req.user!.id,
      req.path.endsWith('/unarchive') ? false : true,
    );
    res.json(role);
  } catch (err) {
    next(err);
  }
}
