import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { itemCatalogRouter } from './item-catalog.routes.js';
import { errorHandler } from '../../middleware/error.js';

/**
 * Real router + error handler on a throwaway app (auth.routes.test.ts / holidays.routes.test.ts
 * pattern). Only paths that reject before any Prisma call run here — deeper CRUD behavior is
 * covered by item-catalog.service.test.ts (stubbed Prisma), since CI has no database.
 */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/item-catalog', itemCatalogRouter);
  app.use(errorHandler);
  return app;
}

describe('item-catalog routes (pre-DB behavior)', () => {
  it('rejects every route without a token (401)', async () => {
    const app = buildApp();
    assert.equal((await request(app).get('/item-catalog')).status, 401);
    assert.equal((await request(app).post('/item-catalog').send({ type: 'software', name: 'Zoom' })).status, 401);
    assert.equal((await request(app).put('/item-catalog/abc').send({ archived: true })).status, 401);
    assert.equal((await request(app).delete('/item-catalog/abc')).status, 401);
  });
});
