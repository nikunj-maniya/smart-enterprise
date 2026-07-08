import { Prisma } from '@prisma/client';
import {
  parseDefinition,
  type CreateFormDraftRequest,
  type FieldOptions,
  type FieldType,
  type FieldValidation,
  type FormBuilderListItemDto,
  type FormDefinition,
  type FormDefinitionDto,
  type FormDefinitionSummaryDto,
  type PublishDefinitionInput,
  type SaveDraftFieldsRequest,
  type VisibilityRule,
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

/** Tenant's latest published row-set for a form key, or 404. */
async function findPublished(tenantId: string, key: string): Promise<DefinitionWithGraph> {
  const def = await prisma.formDefinition.findFirst({
    where: { tenantId, key, status: 'published' },
    orderBy: { version: 'desc' },
    include: fullInclude,
  });
  if (!def) throw new HttpError(404, 'Form not found');
  return def;
}

/** GET /forms/:key — the tenant's full latest published definition for a key. */
export async function getFormByKey(tenantId: string, key: string): Promise<FormDefinitionDto> {
  return toDefinitionDto(await findPublished(tenantId, key));
}

/** Prisma row-set → the shared engine's `FormDefinition` (nulls → undefined, unlike the DTO). */
function toFormDefinition(def: DefinitionWithGraph): FormDefinition {
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
      visibilityRule: (s.visibilityRule ?? undefined) as VisibilityRule | undefined,
      fields: s.fields.map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type as FieldType,
        required: f.required,
        options: (f.options ?? undefined) as FieldOptions | undefined,
        validation: (f.validation ?? undefined) as FieldValidation | undefined,
        visibilityRule: (f.visibilityRule ?? undefined) as VisibilityRule | undefined,
      })),
    })),
  };
}

/** The tenant's latest published definition, ready for server-side (re)validation, plus id/version to pin and the status its state machine starts every new request in. */
export async function getPublishedDefinitionForSubmission(
  tenantId: string,
  key: string,
): Promise<{ id: string; version: number; definition: FormDefinition; initialStatus: string }> {
  const def = await findPublished(tenantId, key);
  const states = def.statusModel?.states;
  const initialStatus = Array.isArray(states) ? states[0] : undefined;
  if (typeof initialStatus !== 'string') throw new HttpError(400, 'Form has no status model');
  return { id: def.id, version: def.version, definition: toFormDefinition(def), initialStatus };
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

// ── Form Builder admin CRUD (form-builder, Slice 1) ─────────────

/** Title → a URL/key-safe slug ("IT Asset Request" → "it-asset-request"). */
function slugifyTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** GET /forms/drafts — admin list: the latest version (draft or published) per form key, with field count. */
export async function listFormsForBuilder(tenantId: string): Promise<FormBuilderListItemDto[]> {
  const rows = await prisma.formDefinition.findMany({
    where: { tenantId },
    orderBy: { version: 'desc' },
    select: {
      key: true,
      title: true,
      renderer: true,
      status: true,
      updatedAt: true,
      sections: { select: { fields: { select: { id: true } } } },
    },
  });
  const latestByKey = new Map<string, FormBuilderListItemDto>();
  for (const r of rows) {
    if (latestByKey.has(r.key)) continue;
    latestByKey.set(r.key, {
      key: r.key,
      title: r.title,
      renderer: r.renderer,
      status: r.status,
      fieldCount: r.sections.reduce((n, s) => n + s.fields.length, 0),
      updatedAt: r.updatedAt.toISOString(),
    });
  }
  return [...latestByKey.values()];
}

/** Tenant's latest draft row-set for a form key, or 404. */
async function findDraft(tenantId: string, key: string): Promise<DefinitionWithGraph> {
  const def = await prisma.formDefinition.findFirst({
    where: { tenantId, key, status: 'draft' },
    orderBy: { version: 'desc' },
    include: fullInclude,
  });
  if (!def) throw new HttpError(404, 'Draft not found');
  return def;
}

/** GET /forms/drafts/:key — the tenant's current draft definition for a key, for builder editing. */
export async function getFormDraft(tenantId: string, key: string): Promise<FormDefinitionDto> {
  return toDefinitionDto(await findDraft(tenantId, key));
}

/**
 * POST /forms/drafts — create a brand-new custom form as a Draft (version 1, no fields yet).
 * Slice 1 only supports authoring new forms this way; opening an existing (core or already-
 * published) form for a new draft is Slice 3/7's job.
 */
export async function createFormDraft(
  tenantId: string,
  actorId: string,
  input: CreateFormDraftRequest,
): Promise<FormDefinitionDto> {
  const key = slugifyTitle(input.title);
  if (!key) throw new HttpError(400, 'Title must contain at least one letter or number');

  const clash = await prisma.formDefinition.findFirst({ where: { tenantId, key }, select: { id: true } });
  if (clash) throw new HttpError(409, 'A form with this name already exists');

  const created = await prisma.$transaction(async (tx) => {
    const def = await tx.formDefinition.create({
      data: {
        tenantId,
        key,
        title: input.title,
        version: 1,
        renderer: 'generic',
        status: 'draft',
        sections: { create: [{ order: 0, title: 'Fields', fields: { create: [] } }] },
      },
      include: fullInclude,
    });
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId,
        entity: 'FormDefinition',
        entityId: def.id,
        action: 'create_draft',
        after: { key: def.key, title: def.title, version: def.version },
      },
    });
    return def;
  });

  return toDefinitionDto(created);
}

/**
 * PUT /forms/drafts/:key — replace the draft's field-set wholesale (add/edit/delete/reorder all
 * collapse to one save). The draft has exactly one section (created with the draft); fields are
 * deleted and recreated in the given order, never mutating a published row.
 */
export async function saveDraftFields(
  tenantId: string,
  actorId: string,
  key: string,
  input: SaveDraftFieldsRequest,
): Promise<FormDefinitionDto> {
  const draft = await findDraft(tenantId, key);
  const section = draft.sections[0];
  if (!section) throw new HttpError(400, 'Draft has no section to hold fields');
  const beforeCount = section.fields.length;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.formField.deleteMany({ where: { sectionId: section.id } });
    await tx.formSection.update({
      where: { id: section.id },
      data: {
        fields: {
          create: input.fields.map((f, i) => ({
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
      },
    });
    // Nested writes above don't touch the parent row — bump it explicitly so the builder
    // list's "updated {date}" reflects this save.
    await tx.formDefinition.update({ where: { id: draft.id }, data: {} });
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId,
        entity: 'FormDefinition',
        entityId: draft.id,
        action: 'save_draft_fields',
        before: { fieldCount: beforeCount },
        after: { fieldCount: input.fields.length },
      },
    });
    return tx.formDefinition.findUniqueOrThrow({ where: { id: draft.id }, include: fullInclude });
  });

  return toDefinitionDto(updated);
}
