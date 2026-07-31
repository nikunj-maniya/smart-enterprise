import type { Request, Response, NextFunction } from 'express';
import { smartSearchConversationsQuerySchema } from '@se/shared';
import * as conversationService from './conversation.service.js';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const query = smartSearchConversationsQuerySchema.parse(req.query);
    res.json(await conversationService.listConversations(req.user!.tenantId!, req.user!.id, query));
  } catch (err) {
    next(err);
  }
}

export async function get(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await conversationService.getConversation(req.user!.tenantId!, req.user!.id, req.params.id));
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const conversation = await conversationService.createConversation(req.user!.tenantId!, req.user!.id);
    res.status(201).json(conversation);
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await conversationService.deleteConversation(req.user!.tenantId!, req.user!.id, req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
