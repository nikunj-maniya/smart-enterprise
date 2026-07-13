import type { Request, Response, NextFunction } from 'express';
import { updateEscalationRuleSchema } from '@se/shared';
import * as escalationRulesService from './escalation-rules.service.js';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await escalationRulesService.listEscalationRules(req.user!.tenantId!));
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const body = updateEscalationRuleSchema.parse(req.body);
    const dto = await escalationRulesService.updateEscalationRule(
      req.user!.tenantId!,
      req.user!.id,
      req.params.id,
      body,
    );
    res.json(dto);
  } catch (err) {
    next(err);
  }
}
