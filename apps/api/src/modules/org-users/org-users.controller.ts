import type { Request, Response, NextFunction } from 'express';
import { createOrgUserRequestSchema, orgUsersQuerySchema } from '@se/shared';
import * as orgUsersService from './org-users.service.js';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const query = orgUsersQuerySchema.parse(req.query);
    res.json(await orgUsersService.listOrgUsers(req.user!.tenantId!, query));
  } catch (err) {
    next(err);
  }
}

export async function options(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await orgUsersService.listOrgUserOptions(req.user!.tenantId!));
  } catch (err) {
    next(err);
  }
}

export async function stats(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await orgUsersService.getOrgUserStats(req.user!.tenantId!));
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createOrgUserRequestSchema.parse(req.body);
    const user = await orgUsersService.createOrgUser(req.user!.tenantId!, req.user!.id, input);
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
}

export async function deactivate(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await orgUsersService.deactivateOrgUser(
      req.user!.tenantId!,
      req.params.id,
      req.user!.id,
    );
    res.json(user);
  } catch (err) {
    next(err);
  }
}

export async function reactivate(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await orgUsersService.reactivateOrgUser(
      req.user!.tenantId!,
      req.params.id,
      req.user!.id,
    );
    res.json(user);
  } catch (err) {
    next(err);
  }
}

export async function approve(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await orgUsersService.approveOrgUser(
      req.user!.tenantId!,
      req.params.id,
      req.user!.id,
    );
    res.json(user);
  } catch (err) {
    next(err);
  }
}

export async function reject(req: Request, res: Response, next: NextFunction) {
  try {
    await orgUsersService.rejectOrgUser(req.user!.tenantId!, req.params.id, req.user!.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(
      await orgUsersService.resetOrgUserPassword(req.user!.tenantId!, req.params.id, req.user!.id),
    );
  } catch (err) {
    next(err);
  }
}
