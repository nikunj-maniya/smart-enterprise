import { Prisma } from '@prisma/client';
import {
  parseDefinition,
  type FormDefinition,
  type FormDefinitionDto,
  type FormDefinitionSummaryDto,
  type PublishDefinitionInput,
} from '@se/shared';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';

/** Full graph loaded for a single-definition read/response — sections and fields ordered by `order`. */
const fullInclude = {
  sections: {
    orderBy: { order: 'asc' as const },
    include: { fields: { orderBy: { order: 'asc' as const } } },
  },
  approvalWorkflow: true,
  statusModel: true,
} satisfies Prisma.FormDefinitionInclude;

type DefinitionWithGraph = Prisma.FormDefinitionGetPayload<{ include: typeof fullInclude }>;

/** Pass a JSON value through to Prisma, or omit it (→ SQL NULL) when absent. */
function jsonInput(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined || value === null ? undefined : (value as Prisma.InputJsonValue);
}

function toDefinitionDto(def: DefinitionWithGraph): FormDefinitionDto {
  return {
    id: def.id,
    key: def.key,
    title: def.title,
    version: def.version,
    renderer: def.renderer,
    status: def.status,
    sections: def.sections.map((s) => ({
      order: s.order,
      title: s.title,
      visibilityRule: s.visibilityRule ?? null,
      fields: s.fields.map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        required: f.required,
        options: f.options ?? null,
        validation: f.validation ?? null,
        visibilityRule: f.visibilityRule ?? null,
      })),
    })),
    approvalWorkflow: def.approvalWorkflow
      ? { mode: def.approvalWorkflow.mode, stageRules: def.approvalWorkflow.stageRules ?? null }
      : null,
    statusModel: def.statusModel
      ? { states: def.statusModel.states, transitions: def.statusModel.transitions }
      : null,
  };
}

/** GET /forms — the tenant's latest published version per form key (light list). */
export async function listForms(tenantId: string): Promise<FormDefinitionSummaryDto[]> {
  const rows = await prisma.formDefinition.findMany({
    where: { tenantId, status: 'published' },
    orderBy: { version: 'desc' },
    select: { key: true, title: true, version: true, renderer: true, status: true },
  });
  const latestByKey = new Map<string, FormDefinitionSummaryDto>();
  for (const r of rows) {
    if (!latestByKey.has(r.key)) latestByKey.set(r.key, r);
  }
  return [...latestByKey.values()];
}

/** GET /forms/:key — the tenant's full latest published definition for a key. */
export async function getFormByKey(tenantId: string, key: string): Promise<FormDefinitionDto> {
  const def = await prisma.formDefinition.findFirst({
    where: { tenantId, key, status: 'published' },
    orderBy: { version: 'desc' },
    include: fullInclude,
  });
  if (!def) throw new HttpError(404, 'Form not found');
  return toDefinitionDto(def);
}

/** Version lookup + row-set insert + audit log, run against one client (own tx or a caller's). */
async function insertDefinition(
  tx: Prisma.TransactionClient,
  tenantId: string,
  actorId: string,
  input: PublishDefinitionInput,
  parsed: FormDefinition,
): Promise<DefinitionWithGraph> {
  // Next version = max existing for (tenant, key) + 1, or 1 if none.
  const latest = await tx.formDefinition.findFirst({
    where: { tenantId, key: input.key },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  const version = (latest?.version ?? 0) + 1;

  const def = await tx.formDefinition.create({
    data: {
      tenantId,
      key: input.key,
      title: input.title,
      version,
      renderer: 'core',
      status: 'published',
      sections: {
        create: parsed.sections.map((s) => ({
          order: s.order,
          title: s.title,
          visibilityRule: jsonInput(s.visibilityRule),
          fields: {
            create: s.fields.map((f, i) => ({
              key: f.key,
              label: f.label,
              type: f.type,
              order: i,
              required: f.required,
              options: jsonInput(f.options),
              validation: jsonInput(f.validation),
              visibilityRule: jsonInput(f.visibilityRule),
            })),
          },
        })),
      },
      ...(input.approvalWorkflow
        ? {
            approvalWorkflow: {
              create: {
                mode: input.approvalWorkflow.mode,
                stageRules: jsonInput(input.approvalWorkflow.stageRules),
              },
            },
          }
        : {}),
      ...(input.statusModel
        ? {
            statusModel: {
              create: {
                states: input.statusModel.states as Prisma.InputJsonValue,
                transitions: input.statusModel.transitions as Prisma.InputJsonValue,
              },
            },
          }
        : {}),
    },
    include: fullInclude,
  });
  await tx.auditLog.create({
    data: {
      tenantId,
      actorId,
      entity: 'FormDefinition',
      entityId: def.id,
      action: 'publish',
      after: { key: def.key, title: def.title, version: def.version },
    },
  });
  return def;
}

/**
 * Publish a definition: validate (rejecting unsupported field types by name), then clone into a
 * new immutable `version + 1` row-set. Prior versions are never mutated — publishing only inserts.
 * Exported so Slice 3's core-form seed can call it directly (not over HTTP). Pass `tx` to run inside
 * an existing transaction (e.g. tenant activation); omit it (HTTP path) and it opens its own.
 */
export async function publishDefinition(
  tenantId: string,
  actorId: string,
  input: PublishDefinitionInput,
  tx?: Prisma.TransactionClient,
): Promise<FormDefinitionDto> {
  // (a) Authoritative validation via the shared engine; a bad field type throws by name.
  let parsed: FormDefinition;
  try {
    parsed = parseDefinition({
      id: 'pending',
      key: input.key,
      title: input.title,
      version: 1,
      renderer: 'core',
      status: 'published',
      sections: input.sections,
    });
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : 'Invalid form definition');
  }

  // (b) Insert the new row-set + audit log — in the caller's tx, or a fresh one.
  const created = tx
    ? await insertDefinition(tx, tenantId, actorId, input, parsed)
    : await prisma.$transaction((t) => insertDefinition(t, tenantId, actorId, input, parsed));

  return toDefinitionDto(created);
}
