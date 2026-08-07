import type { DocumentIngest, DocumentSearchResultDto } from '@se/shared';
import { prisma } from '../../prisma.js';
import { embed } from './llm-client.js';

const CHUNK_SIZE = 1000; // characters
const CHUNK_OVERLAP = 200;
const TOP_K = 5;

/** Fixed-size sliding-window chunking, no external dependency (per this repo's "no unnecessary
 *  dependencies" rule) — good enough for the plain-text documents this feature targets. */
export function chunkText(content: string, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const trimmed = content.trim();
  if (trimmed.length === 0) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < trimmed.length) {
    const end = Math.min(start + chunkSize, trimmed.length);
    chunks.push(trimmed.slice(start, end).trim());
    if (end === trimmed.length) break;
    start = end - overlap;
  }
  return chunks.filter((c) => c.length > 0);
}

/** pgvector's literal syntax for a `vector(768)` value — passed as a bound `$queryRaw`/
 *  `$executeRaw` parameter (never concatenated into SQL text), then cast with `::vector`. */
function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

/** Postgres `text[]` literal syntax (`{"a","b"}`), built the same "bound parameter, not SQL text"
 *  way as `toVectorLiteral` above — sidesteps relying on Prisma's raw-query array-parameter
 *  serialization, which has no other precedent in this codebase. */
function toTextArrayLiteral(values: string[]): string {
  const escaped = values.map((v) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
  return `{${escaped.join(',')}}`;
}

export interface IngestDocumentResult {
  chunksCreated: number;
}

/** Chunks a document, embeds each chunk via Ollama, and stores it scoped to `tenantId` — the
 *  ingestion half of the `search_docs` tool's RAG pipeline. `allowedRoles` is stored per-chunk and
 *  is the ONLY thing that later gates a chunk's visibility in `searchDocuments` below; an empty
 *  array means visible to every role in the tenant. */
export async function ingestDocument(tenantId: string, input: DocumentIngest): Promise<IngestDocumentResult> {
  const chunks = chunkText(input.content);
  const allowedRolesLiteral = toTextArrayLiteral(input.allowedRoles);
  for (const chunk of chunks) {
    const embedding = await embed(chunk);
    await prisma.$executeRaw`
      INSERT INTO document_chunks (tenant_id, source, content, embedding, allowed_roles)
      VALUES (${tenantId}, ${input.source}, ${chunk}, ${toVectorLiteral(embedding)}::vector, ${allowedRolesLiteral}::text[])
    `;
  }
  return { chunksCreated: chunks.length };
}

/**
 * Embeds `query` via Ollama and runs a pgvector cosine-distance (`<=>`) search, filtered by
 * `tenantId` and `viewerRoles` IN SQL — never left to the model to self-restrict. A chunk is
 * visible when its `allowed_roles` is empty (open to the whole tenant) or overlaps `viewerRoles`.
 */
export async function searchDocuments(
  tenantId: string,
  viewerRoles: string[],
  query: string,
  k = TOP_K,
): Promise<DocumentSearchResultDto[]> {
  const embedding = await embed(query);
  return prisma.$queryRaw<DocumentSearchResultDto[]>`
    SELECT source, content
    FROM document_chunks
    WHERE tenant_id = ${tenantId}
      AND (allowed_roles = '{}' OR allowed_roles && ${toTextArrayLiteral(viewerRoles)}::text[])
    ORDER BY embedding <=> ${toVectorLiteral(embedding)}::vector
    LIMIT ${k}
  `;
}
