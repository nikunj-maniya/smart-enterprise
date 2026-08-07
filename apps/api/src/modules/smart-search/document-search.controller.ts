import type { Request, Response, NextFunction } from 'express';
import { documentIngestSchema } from '@se/shared';
import * as documentSearchService from './document-search.service.js';

export async function ingest(req: Request, res: Response, next: NextFunction) {
  try {
    const body = documentIngestSchema.parse(req.body);
    const result = await documentSearchService.ingestDocument(req.user!.tenantId!, body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}
