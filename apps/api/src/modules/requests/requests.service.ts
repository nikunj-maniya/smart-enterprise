import { Prisma } from '@prisma/client';
import {
  parseDefinition,
  validatePayload,
  type CreateRequestRequest,
  type FormDefinition,
  type RequestDto,
} from '@se/shared';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';

/** Full graph needed to re-validate a payload and derive the initial status. */
const fullInclude = {
  sections: {
    orderBy: { order: 'asc' as const },
    include: { fields: { orderBy: { order: 'asc' as const } } },
  },
  statusModel: true,
} satisfies Prisma.FormDefinitionInclude;

type DefinitionWithGraph = Prisma.FormDefinitionGetPayload<{ include: typeof fullInclude }>;

/** Thrown when the payload fails the shared re-validation; carried to the controller as a 400. */
export class PayloadValidationError extends Error {
  constructor(public fields: Record<string, string>) {
    super('Validation failed');
    this.name = 'PayloadValidationError';
  }
}

/** The promoted typed columns derived server-side from a validated payload. */
interface PromotedColumns {
  startDate: Date | null;
  endDate: Date | null;
  totalDays: number | null;
  halfDayCount: number | null;
  leaveTypeId: string | null;
  departmentId: string | null;
  projectId: string | null;
}

const EMPTY_COLUMNS: PromotedColumns = {
  startDate: null,
  endDate: null,
  totalDays: null,
  halfDayCount: null,
  leaveTypeId: null,
  departmentId: null,
  projectId: null,
};

function toDate(value: unknown): Date | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function toStr(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** First selected value of a picker (multi → array; single → string). */
function firstOf(value: unknown): string | null {
  if (Array.isArray(value)) return value.length > 0 ? String(value[0]) : null;
  return toStr(value);
}

/**
 * Per-form-key extractor map (task 3.2). Reads ONLY the validated payload — the promoted
 * columns are always server-derived so the JSONB and typed columns can never disagree
 * (design.md "Promoted columns extracted server-side, never client-supplied").
 * A form key with no extractor stores the payload with all promoted columns null.
 */
const EXTRACTORS: Record<string, (data: Record<string, unknown>) => PromotedColumns> = {
  leave: (d) => ({
    startDate: toDate(d.start_date),
    endDate: toDate(d.end_date),
    totalDays: toNumber(d.number_of_days),
    halfDayCount: toNumber(d.half_day_count),
    leaveTypeId: toStr(d.leave_type),
    departmentId: toStr(d.department),
    projectId: firstOf(d.project_name),
  }),
  wfh: (d) => ({
    startDate: toDate(d.start_date),
    endDate: toDate(d.end_date),
    totalDays: null,
    halfDayCount: toNumber(d.half_wfh_count),
    leaveTypeId: null,
    departmentId: toStr(d.department),
    projectId: firstOf(d.project_name),
  }),
  visitor: (d) => ({
    ...EMPTY_COLUMNS,
    startDate: toDate(d.visit_datetime),
    totalDays: toNumber(d.no_of_days),
  }),
};

function extractColumns(formKey: string, data: Record<string, unknown>): PromotedColumns {
  const extractor = EXTRACTORS[formKey];
  return extractor ? extractor(data) : { ...EMPTY_COLUMNS };
}

interface StatusModelShape {
  states?: string[];
  transitions?: { from: string; to: string; roles?: string[] }[];
  initial?: string;
}

/**
 * The state a request is created in (task 3.3). Honors an explicit `initial` if the model
 * declares one; otherwise the entry state is the one no transition targets — and when that
 * root is a Draft-style holding state, the post-Draft submitted state it transitions to
 * (PRD §9: Leave/WFH → Submitted, Visitor → Pre-Registered, IT → Requested).
 */
function deriveInitialStatus(statusModel: StatusModelShape): string {
  if (typeof statusModel.initial === 'string') return statusModel.initial;
  const states = statusModel.states ?? [];
  const transitions = statusModel.transitions ?? [];
  const inbound = new Set(transitions.map((t) => t.to));
  const root = states.find((s) => !inbound.has(s)) ?? states[0];
  if (!root) throw new HttpError(400, 'Form status model has no states');
  if (root === 'Draft') {
    const submit = transitions.find((t) => t.from === 'Draft');
    if (submit) return submit.to;
  }
  return root;
}

/** Build a typed FormDefinition (with the real id + version for the compile cache) from the row. */
function toEngineDefinition(def: DefinitionWithGraph): FormDefinition {
  return parseDefinition({
    id: def.id,
    key: def.key,
    title: def.title,
    version: def.version,
    renderer: def.renderer,
    status: def.status,
    sections: def.sections.map((s) => ({
      order: s.order,
      title: s.title,
      visibilityRule: s.visibilityRule ?? undefined,
      fields: s.fields.map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        required: f.required,
        options: f.options ?? undefined,
        validation: f.validation ?? undefined,
        visibilityRule: f.visibilityRule ?? undefined,
      })),
    })),
  });
}

function toRequestDto(
  r: {
    id: string;
    formVersion: number;
    status: string;
    payload: Prisma.JsonValue;
    startDate: Date | null;
    endDate: Date | null;
    totalDays: number | null;
    halfDayCount: number | null;
    leaveTypeId: string | null;
    departmentId: string | null;
    projectId: string | null;
    createdAt: Date;
  },
  formKey: string,
): RequestDto {
  return {
    id: r.id,
    formKey,
    formVersion: r.formVersion,
    status: r.status,
    payload: r.payload as Record<string, unknown>,
    startDate: r.startDate?.toISOString() ?? null,
    endDate: r.endDate?.toISOString() ?? null,
    totalDays: r.totalDays,
    halfDayCount: r.halfDayCount,
    leaveTypeId: r.leaveTypeId,
    departmentId: r.departmentId,
    projectId: r.projectId,
    createdAt: r.createdAt.toISOString(),
  };
}

/**
 * POST /requests — resolve + pin the form version, re-validate the payload against it,
 * extract promoted columns, and create the request with its first status-history row and
 * an audit-log entry, all in one transaction.
 */
export async function createRequest(
  tenantId: string,
  requesterId: string,
  input: CreateRequestRequest,
): Promise<RequestDto> {
  // 1. Resolve + pin the version: the tenant's latest published definition for the key.
  const def = await prisma.formDefinition.findFirst({
    where: { tenantId, key: input.formKey, status: 'published' },
    orderBy: { version: 'desc' },
    include: fullInclude,
  });
  if (!def) throw new HttpError(404, 'Form not found');

  // 2. Authoritative re-validation via the single shared validator (types, option membership,
  //    validation rules, conditional requiredness, hidden⇒absent).
  const definition = toEngineDefinition(def);
  const result = validatePayload(definition, input.payload);
  if (!result.success) {
    const fields = Object.fromEntries(
      Object.entries(result.errors ?? {}).map(([key, messages]) => [key, messages[0]]),
    );
    throw new PayloadValidationError(fields);
  }
  const data = result.data ?? {};

  // 3. Server-side promoted columns (never client-supplied).
  const columns = extractColumns(input.formKey, data);

  // 4. Initial status + first history row + audit log, atomically.
  if (!def.statusModel) throw new HttpError(400, 'Form has no status model configured');
  const initialStatus = deriveInitialStatus(def.statusModel as unknown as StatusModelShape);

  const created = await prisma.$transaction(async (tx) => {
    const request = await tx.request.create({
      data: {
        tenantId,
        formDefinitionId: def.id,
        formVersion: def.version,
        requesterId,
        status: initialStatus,
        payload: data as Prisma.InputJsonValue,
        ...columns,
      },
    });
    await tx.requestStatusHistory.create({
      data: {
        requestId: request.id,
        fromState: null,
        toState: initialStatus,
        actorId: requesterId,
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId: requesterId,
        entity: 'Request',
        entityId: request.id,
        action: 'create',
        after: { formKey: input.formKey, formVersion: def.version, status: initialStatus },
      },
    });
    return request;
  });

  return toRequestDto(created, input.formKey);
}
