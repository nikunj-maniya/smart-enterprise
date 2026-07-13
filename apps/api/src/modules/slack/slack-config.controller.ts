import type { Request, Response, NextFunction } from 'express';
import { connectSlackRequestSchema, updateSlackSettingsRequestSchema } from '@se/shared';
import * as slackConfigService from './slack-config.service.js';

export async function get(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await slackConfigService.getConfig(req.user!.tenantId!));
  } catch (err) {
    next(err);
  }
}

export async function connect(req: Request, res: Response, next: NextFunction) {
  try {
    const body = connectSlackRequestSchema.parse(req.body);
    res.json(await slackConfigService.connect(req.user!.tenantId!, req.user!.id, body));
  } catch (err) {
    next(err);
  }
}

export async function disconnect(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await slackConfigService.disconnect(req.user!.tenantId!, req.user!.id));
  } catch (err) {
    next(err);
  }
}

export async function test(req: Request, res: Response, next: NextFunction) {
  try {
    await slackConfigService.testConnection(req.user!.tenantId!, req.user!.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function updateSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const body = updateSlackSettingsRequestSchema.parse(req.body);
    res.json(await slackConfigService.updateSettings(req.user!.tenantId!, req.user!.id, body));
  } catch (err) {
    next(err);
  }
}
