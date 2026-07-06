import type { Request, Response, NextFunction } from 'express';
import { createProjectRequestSchema, projectsQuerySchema, updateProjectRequestSchema } from '@se/shared';
import * as projectsService from './projects.service.js';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const query = projectsQuerySchema.parse(req.query);
    res.json(await projectsService.listProjects(req.user!.tenantId!, query));
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createProjectRequestSchema.parse(req.body);
    const project = await projectsService.createProject(req.user!.tenantId!, req.user!.id, input);
    res.status(201).json(project);
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const input = updateProjectRequestSchema.parse(req.body);
    const project = await projectsService.updateProject(
      req.user!.tenantId!,
      req.params.id,
      req.user!.id,
      input,
    );
    res.json(project);
  } catch (err) {
    next(err);
  }
}
