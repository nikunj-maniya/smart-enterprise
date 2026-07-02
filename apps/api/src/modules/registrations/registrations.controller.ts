import type { Request, Response, NextFunction } from 'express';
import {
  registerEnterpriseRequestSchema,
  rejectRegistrationRequestSchema,
  registrationsQuerySchema,
} from '@se/shared';
import * as registrationsService from './registrations.service.js';

export async function submit(req: Request, res: Response, next: NextFunction) {
  try {
    const input = registerEnterpriseRequestSchema.parse(req.body);
    res.status(201).json(await registrationsService.submitRegistration(input));
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const query = registrationsQuerySchema.parse(req.query);
    res.json(await registrationsService.listRegistrations(query));
  } catch (err) {
    next(err);
  }
}

export async function accept(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await registrationsService.acceptRegistration(req.params.id, req.user!.id));
  } catch (err) {
    next(err);
  }
}

export async function reject(req: Request, res: Response, next: NextFunction) {
  try {
    const { reason } = rejectRegistrationRequestSchema.parse(req.body);
    res.json(await registrationsService.rejectRegistration(req.params.id, req.user!.id, reason));
  } catch (err) {
    next(err);
  }
}
