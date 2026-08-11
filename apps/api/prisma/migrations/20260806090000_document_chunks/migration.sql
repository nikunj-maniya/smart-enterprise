-- RAG document search (search_docs smart-search tool): pgvector-backed chunk store. Unmodeled in
-- schema.prisma, same reasoning as the pg_trgm indexes in
-- 20260713054255_global_search_trgm_indexes/migration.sql — Prisma has no native `vector` type —
-- so this table is accessed entirely via prisma.$queryRaw/$executeRaw in document-search.service.ts.
-- `prisma migrate dev` will propose dropping this table on the next schema change since it isn't
-- declared in schema.prisma; strip that from the generated diff, same as the trgm indexes.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS document_chunks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     text NOT NULL REFERENCES "Tenant"(id) ON DELETE CASCADE,
  source        text NOT NULL,
  content       text NOT NULL,
  embedding     vector(768) NOT NULL,
  allowed_roles text[] NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_chunks_tenant_id_idx ON document_chunks (tenant_id);
CREATE INDEX IF NOT EXISTS document_chunks_allowed_roles_idx ON document_chunks USING GIN (allowed_roles);
-- Cosine distance (`<=>`), matching the ops class `search_docs` queries with — HNSW needs no
-- lists-tuning step (unlike ivfflat) so it behaves reasonably from the first row onward.
CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx ON document_chunks
  USING hnsw (embedding vector_cosine_ops);
