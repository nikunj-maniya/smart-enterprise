import { Prisma } from '@prisma/client';
import {
  DEFAULT_GENERIC_INITIAL_STATUS,
  parseDefinition,
  REQUESTER_ROLE,
  SYSTEM_ROLE,
  validateCoreFormFieldEdit,
  validateStageRules,
  validateStatusModel,
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
  type SaveDraftRoutingRequest,
  type SaveDraftStatusModelRequest,
  type StageRules,
  type StatusModel,
  type StatusTransition,
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

/** A field's raw `options` JSON, when it's the `{ source: 'item-catalog:<type>' }` marker
 *  (it-requests design.md) rather than a static list or picker config. */
function catalogSourceType(options: unknown): string | null {
  if (!options || typeof options !== 'object' || Array.isArray(options)) return null;
  const source = (options as { source?: unknown }).source;
  return typeof source === 'string' && source.startsWith('item-catalog:') ? source.slice('item-catalog:'.length) : null;
}

/**
 * Resolves every `item-catalog:<type>` marker field in a served definition into a real options
 * array, live from the tenant's `ItemCatalog` (design.md: "master data, not form-field options" —
 * an admin's catalog edit applies with no republish). `includeArchived` is `true` only when
 * rendering a specific pinned request (its own past submission may name an item since archived —
 * item-catalog spec's "past requests still render it"); `false` for a fresh submission's blank
 * form, which must only offer currently-active items.
 */
async function resolveCatalogOptions(tenantId: string, dto: FormDefinitionDto, includeArchived: boolean): Promise<FormDefinitionDto> {
  const types = new Set<string>();
  for (const s of dto.sections) {
    for (const f of s.fields) {
      const type = catalogSourceType(f.options);
      if (type) types.add(type);
    }
  }
  if (types.size === 0) return dto;

  const items = await prisma.itemCatalog.findMany({
    where: { tenantId, type: { in: [...types] }, ...(includeArchived ? {} : { archived: false }) },
    orderBy: { name: 'asc' },
  });
  const optionsByType = new Map<string, { value: string; label: string }[]>();
  for (const item of items) {
    const arr = optionsByType.get(item.type) ?? [];
    arr.push({ value: item.name, label: item.name });
    optionsByType.set(item.type, arr);
  }

  return {
    ...dto,
    sections: dto.sections.map((s) => ({
      ...s,
      fields: s.fields.map((f) => {
        const type = catalogSourceType(f.options);
        return type ? { ...f, options: optionsByType.get(type) ?? [] } : f;
      }),
    })),
  };
}

/** GET /forms/:key — the tenant's full latest published definition for a key. */
export async function getFormByKey(tenantId: string, key: string): Promise<FormDefinitionDto> {
  const dto = toDefinitionDto(await findPublished(tenantId, key));
  return resolveCatalogOptions(tenantId, dto, false);
}

/** A request's own pinned definition row-set, by id rather than latest-by-key — so a request
 *  created under an older version keeps rendering against that exact version after a republish. */
export async function getDefinitionById(tenantId: string, id: string): Promise<FormDefinitionDto> {
  const def = await prisma.formDefinition.findFirst({ where: { id, tenantId }, include: fullInclude });
  if (!def) throw new HttpError(404, 'Form definition not found');
  return resolveCatalogOptions(tenantId, toDefinitionDto(def), true);
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

/** The tenant's latest published definition, ready for server-side (re)validation, plus id/version to pin and the status its state machine starts every new request in. A custom form without a configured status model falls back to the generic default so it stays submittable. */
/**
 * Some core forms' first declared state is a pre-approval placeholder nobody but the requester
 * (who just submitted) could ever act on — e.g. Visitor's `Pre-Registered`, IT's `Requested` —
 * with a `requester`-only transition immediately out of it. Nothing else in the system ever
 * fires that transition, so submission resolves straight through any such leading placeholder
 * rather than leaving every request stuck at the first hop forever.
 *
 * Stops the instant the current state is actionable by anyone other than the requester (or the
 * reserved `system` actor) — that's the real landing spot other actors need to see. A
 * requester-only "change my mind" escape hatch *coexisting* with that real landing spot (Visitor's
 * `Pending Approval` also declares its own `-> Cancelled`, alongside the Process Head's `->
 * Approved`) must NOT cause a further hop into that escape hatch — only a state with NO
 * non-requester action at all is a pure placeholder worth skipping past.
 */
function resolveEffectiveInitialStatus(states: string[], transitions: StatusTransition[]): string {
  let current = states[0];
  const seen = new Set([current]);
  for (;;) {
    const hasNonRequesterAction = transitions.some(
      (t) => t.from === current && !(t.roles.length === 1 && (t.roles[0] === REQUESTER_ROLE || t.roles[0] === SYSTEM_ROLE)),
    );
    if (hasNonRequesterAction) break;

    const auto = transitions.find(
      (t) => t.from === current && t.roles.length === 1 && t.roles[0] === REQUESTER_ROLE && !seen.has(t.to),
    );
    if (!auto) break;
    current = auto.to;
    seen.add(current);
  }
  return current;
}

export async function getPublishedDefinitionForSubmission(
  tenantId: string,
  key: string,
): Promise<{
  id: string;
  version: number;
  definition: FormDefinition;
  initialStatus: string;
  approvalWorkflow: { mode: string; stageRules: unknown } | null;
}> {
  const def = await findPublished(tenantId, key);
  const states = def.statusModel?.states;
  const rawTransitions = def.statusModel?.transitions;
  const initialStatus =
    Array.isArray(states) && typeof states[0] === 'string'
      ? resolveEffectiveInitialStatus(states as string[], (rawTransitions as StatusTransition[] | undefined) ?? [])
      : DEFAULT_GENERIC_INITIAL_STATUS;
  return {
    id: def.id,
    version: def.version,
    definition: toFormDefinition(def),
    initialStatus,
    approvalWorkflow: def.approvalWorkflow
      ? { mode: def.approvalWorkflow.mode, stageRules: def.approvalWorkflow.stageRules }
      : null,
  };
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
 * Opening an existing published (non-core) form for a new draft is `startFormDraft` (Slice 3);
 * core forms remain Slice 7's job.
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
 * deleted and recreated in the given order, never mutating a published row. If the draft already
 * has approval routing configured, the incoming field set is cross-checked against its
 * `stageRules` via the shared `validateStageRules` so a field a routing stage depends on can't be
 * deleted or retyped away from a picker type out from under the routing config. Core-form drafts
 * are editable within metadata bounds only (relabel/reorder/validation) — adding a field, removing
 * a field, or changing a field's type is a structural edit and is refused with a 400 naming which
 * field(s) and problem.
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

  if (draft.renderer === 'core') {
    const currentFields = section.fields.map((f) => ({ key: f.key, type: f.type as FieldType }));
    const coreFieldErrors = validateCoreFormFieldEdit(currentFields, input.fields);
    if (coreFieldErrors.length > 0) throw new HttpError(400, coreFieldErrors.join('; '));
  }

  const stageRules = draft.approvalWorkflow?.stageRules as StageRules | undefined;
  if (stageRules) {
    const stageRuleErrors = validateStageRules(stageRules, input.fields);
    if (stageRuleErrors.length > 0) throw new HttpError(400, stageRuleErrors.join('; '));
  }

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

/** Nested writes to a draft's child rows (routing, status model, ...) don't touch the parent
 * `FormDefinition` row — bump it explicitly so the builder list's "updated {date}" reflects the save. */
function touchDraft(tx: Prisma.TransactionClient, draftId: string): Promise<unknown> {
  return tx.formDefinition.update({ where: { id: draftId }, data: {} });
}

/**
 * PUT /forms/drafts/:key/routing — replace the draft's approval routing config wholesale.
 * Cross-checks every `field`-sourced approver rule against the draft's current field set
 * (exists + is a picker type) via the shared `validateStageRules`, then upserts the draft's
 * `ApprovalWorkflow` row (1:1 with the form-definition row-set), never mutating a published row.
 */
export async function saveDraftRouting(
  tenantId: string,
  actorId: string,
  key: string,
  input: SaveDraftRoutingRequest,
): Promise<FormDefinitionDto> {
  const draft = await findDraft(tenantId, key);

  const fields = draft.sections.flatMap((s) =>
    s.fields.map((f) => ({ key: f.key, type: f.type as FieldType })),
  );
  const errors = validateStageRules(input.stageRules, fields);
  if (errors.length > 0) throw new HttpError(400, errors.join('; '));

  const before = draft.approvalWorkflow
    ? { mode: draft.approvalWorkflow.mode, stageRules: draft.approvalWorkflow.stageRules }
    : null;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.approvalWorkflow.upsert({
      where: { formDefinitionId: draft.id },
      create: { formDefinitionId: draft.id, mode: input.mode, stageRules: jsonInput(input.stageRules) },
      update: { mode: input.mode, stageRules: jsonInput(input.stageRules) },
    });
    await touchDraft(tx, draft.id);
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId,
        entity: 'FormDefinition',
        entityId: draft.id,
        action: 'save_draft_routing',
        before: jsonInput(before),
        after: jsonInput({ mode: input.mode, stageRules: input.stageRules }),
      },
    });
    return tx.formDefinition.findUniqueOrThrow({ where: { id: draft.id }, include: fullInclude });
  });

  return toDefinitionDto(updated);
}

/**
 * PUT /forms/drafts/:key/status-model — replace the draft's status model wholesale. This is a
 * plain upsert of the draft's `StatusModel` row (1:1 with the form-definition row-set), never
 * mutating a published row. The shared guardrails (>=1 terminal state, no orphan states, no
 * self-approval) are intentionally *not* enforced here — an admin must be able to save a
 * work-in-progress model (e.g. a new state added before its transitions are wired) — they're
 * only checked at publish time, by `publishDraft` below.
 */
export async function saveDraftStatusModel(
  tenantId: string,
  actorId: string,
  key: string,
  input: SaveDraftStatusModelRequest,
): Promise<FormDefinitionDto> {
  const draft = await findDraft(tenantId, key);

  const before = draft.statusModel
    ? { states: draft.statusModel.states, transitions: draft.statusModel.transitions }
    : null;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.statusModel.upsert({
      where: { formDefinitionId: draft.id },
      create: {
        formDefinitionId: draft.id,
        states: input.states as Prisma.InputJsonValue,
        transitions: input.transitions as Prisma.InputJsonValue,
      },
      update: {
        states: input.states as Prisma.InputJsonValue,
        transitions: input.transitions as Prisma.InputJsonValue,
      },
    });
    await touchDraft(tx, draft.id);
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId,
        entity: 'FormDefinition',
        entityId: draft.id,
        action: 'save_draft_status_model',
        before: jsonInput(before),
        after: jsonInput({ states: input.states, transitions: input.transitions }),
      },
    });
    return tx.formDefinition.findUniqueOrThrow({ where: { id: draft.id }, include: fullInclude });
  });

  return toDefinitionDto(updated);
}

// ── Publish & new-draft-from-published (form-builder, Slice 3) ─────────────

/**
 * POST /forms/drafts/:key/publish — publish the tenant's current draft for a key. Re-validates the
 * draft's field-set via the shared engine's guardrails, then flips that same row-set to `published`
 * in place (its version number becomes the published version) so employees see it in New Request.
 * The row is never mutated again afterwards — the next edit goes through `startFormDraft` below.
 */
export async function publishDraft(tenantId: string, actorId: string, key: string): Promise<FormDefinitionDto> {
  const draft = await findDraft(tenantId, key);

  const fieldCount = draft.sections.reduce((n, s) => n + s.fields.length, 0);
  if (fieldCount === 0) {
    throw new HttpError(400, 'Add at least one field before publishing this form');
  }

  try {
    parseDefinition({
      id: draft.id,
      key: draft.key,
      title: draft.title,
      version: draft.version,
      renderer: draft.renderer,
      status: 'published',
      sections: draft.sections.map((s) => ({
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
    });
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : 'Invalid form definition');
  }

  // A status model is optional (a custom form without one falls back to
  // `DEFAULT_GENERIC_INITIAL_STATUS`); when configured, it must pass the same guardrails the
  // status-model editor enforces (>=1 terminal state, no orphan states, no self-approval).
  if (draft.statusModel) {
    const statusModelErrors = validateStatusModel({
      states: draft.statusModel.states as StatusModel['states'],
      transitions: draft.statusModel.transitions as StatusModel['transitions'],
    });
    if (statusModelErrors.length > 0) throw new HttpError(400, statusModelErrors.join('; '));
  }

  // Approval routing is optional too; when configured, its `stageRules` must still resolve
  // against the draft's *current* field set (a field a stage depends on may have been deleted
  // or retyped away from a picker since routing was last saved) — same guardrail the routing
  // editor enforces, re-run here so a stale reference can't slip through to publish.
  const stageRules = draft.approvalWorkflow?.stageRules as StageRules | undefined;
  if (stageRules) {
    const fields = draft.sections.flatMap((s) => s.fields.map((f) => ({ key: f.key, type: f.type as FieldType })));
    const stageRuleErrors = validateStageRules(stageRules, fields);
    if (stageRuleErrors.length > 0) throw new HttpError(400, stageRuleErrors.join('; '));
  }

  const published = await prisma.$transaction(async (tx) => {
    const def = await tx.formDefinition.update({
      where: { id: draft.id },
      data: { status: 'published' },
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
  });

  return toDefinitionDto(published);
}

/**
 * POST /forms/drafts/:key/start — begin editing a published form (core or custom): clone its
 * latest published row-set into a new Draft at `version + 1`, leaving the published row untouched
 * (immutable). Idempotent — if a draft already exists for the key, it's returned as-is. Core-form
 * drafts stay within metadata bounds — `saveDraftFields` below rejects structural edits (added
 * fields, removed fields, retyped fields) once a core draft exists.
 */
export async function startFormDraft(tenantId: string, actorId: string, key: string): Promise<FormDefinitionDto> {
  const existingDraft = await prisma.formDefinition.findFirst({
    where: { tenantId, key, status: 'draft' },
    orderBy: { version: 'desc' },
    include: fullInclude,
  });
  if (existingDraft) return toDefinitionDto(existingDraft);

  const published = await findPublished(tenantId, key);

  const created = await prisma.$transaction(async (tx) => {
    const def = await tx.formDefinition.create({
      data: {
        tenantId,
        key: published.key,
        title: published.title,
        version: published.version + 1,
        renderer: published.renderer,
        status: 'draft',
        sections: {
          create: published.sections.map((s) => ({
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
        ...(published.approvalWorkflow
          ? {
              approvalWorkflow: {
                create: {
                  mode: published.approvalWorkflow.mode,
                  stageRules: jsonInput(published.approvalWorkflow.stageRules),
                },
              },
            }
          : {}),
        ...(published.statusModel
          ? {
              statusModel: {
                create: {
                  states: published.statusModel.states as Prisma.InputJsonValue,
                  transitions: published.statusModel.transitions as Prisma.InputJsonValue,
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
        action: 'start_draft',
        before: { fromVersion: published.version },
        after: { key: def.key, title: def.title, version: def.version },
      },
    });
    return def;
  });

  return toDefinitionDto(created);
}
