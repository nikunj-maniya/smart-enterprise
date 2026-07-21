import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import { parse } from 'yaml';

/**
 * Serves Swagger UI at /docs from the static OpenAPI file(s) in apps/api/docs/.
 * The YAML stays the source of truth (importable into Postman as-is); this just
 * renders it. Resolved relative to this module so it works from src (tsx) and
 * dist (build) alike. Docs are unauthenticated — the spec describes the API but
 * contains no secrets; the documented endpoints themselves stay token-guarded.
 */
export function mountApiDocs(app: Express): void {
  const specPath = fileURLToPath(new URL('../../docs/api.openapi.yaml', import.meta.url));
  const spec = parse(readFileSync(specPath, 'utf8')) as Record<string, unknown>;
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'Smart Enterprise API Docs' }));
}
