import type { Request, Response, NextFunction } from 'express';
import { smartSearchMemoryUpdateSchema } from '@se/shared';
import * as memoryService from './memory.service.js';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const rows = await memoryService.listMemories(req.user!.tenantId!, req.user!.id);
    res.json({ rows });
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const input = smartSearchMemoryUpdateSchema.parse(req.body);
    const memory = await memoryService.updateMemory(req.user!.tenantId!, req.user!.id, req.params.id, input.content);
    res.json(memory);
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await memoryService.deleteMemory(req.user!.tenantId!, req.user!.id, req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
