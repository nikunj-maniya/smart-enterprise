import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clearCompileCache, parseDefinition, validatePayload } from '@se/shared';
import { prisma } from '../../prisma.js';
import { CORE_FORMS } from './core-forms.js';
import { getFormByKey, getPublishedDefinitionForSubmission } from './forms.service.js';

/**
 * Catalog-source resolution for the Leave form's dynamic `leave_type` options
 * (leave-types.routes.test.ts pattern: CI has no database). The Prisma singleton's delegates are
 * replaced with in-memory stubs below, so `resolveCatalogOptions`' real marker detection, query
 * shape, and name→option mapping run unchanged — full DB-backed behavior (create/delete a type via
 * the leave-types service, balance deduction, seeded-tenant rollout) is covered by the scripted
 * verification pass against the dedicated test DB.
 */

// ── Prisma delegate stubs ─────────────

/** The subset of a published `FormDefinition` row-graph that forms.service.ts reads. */
type FieldRow = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  options: unknown;
  validation: unknown;
  visibilityRule: unknown;
};
type PublishedRow = {
  id: string;
  key: string;
  title: string;
  version: number;
  renderer: string;
  status: string;
  sections: Array<{ order: number; title: string; visibilityRule: unknown; fields: FieldRow[] }>;
  approvalWorkflow: null;
  statusModel: null;
};

let publishedRow: PublishedRow | undefined;
let leaveTypeRows: Array<{ name: string }> = [];
let departmentRows: Array<{ id: string; name: string }> = [];
const findManyArgs = { leaveType: [] as unknown[], department: [] as unknown[] };

// PrismaClient exposes its delegates via a proxy `get` trap, so `mock.method` can't see them —
// redefine the three delegates this service reads as stubs backed by the mutable rows above.
Object.defineProperty(prisma, 'formDefinition', {
  value: { findFirst: async () => publishedRow ?? null },
  configurable: true,
});
Object.defineProperty(prisma, 'leaveType', {
  value: {
    findMany: async (args: unknown) => {
      findManyArgs.leaveType.push(args);
      return leaveTypeRows;
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, 'department', {
  value: {
    findMany: async (args: unknown) => {
      findManyArgs.department.push(args);
      return departmentRows;
    },
  },
  configurable: true,
});

function field(row: Pick<FieldRow, 'key' | 'label' | 'type'> & Partial<FieldRow>): FieldRow {
  return { required: false, options: null, validation: null, visibilityRule: null, ...row };
}

function publishedLeave(id: string, fields: FieldRow[]): PublishedRow {
  return {
    id,
    key: 'leave',
    title: 'Leave Request',
    version: 1,
    renderer: 'core',
    status: 'published',
    sections: [{ order: 0, title: 'Leave Details', visibilityRule: null, fields }],
    approvalWorkflow: null,
    statusModel: null,
  };
}

const LEAVE_TYPE_MARKER = field({
  key: 'leave_type',
  label: 'Type of leave',
  type: 'single-select',
  required: true,
  options: { source: 'leave-types' },
});

// ── Tests ─────────────

describe('seeded Leave form metadata', () => {
  it("declares leave_type as a leave-types catalog marker, not a static option list", () => {
    const input = CORE_FORMS.find((f) => f.key === 'leave');
    assert.ok(input);
    // `PublishDefinitionInput.sections` is intentionally loose — parse through the same shared
    // engine the seed/publish path uses to get typed fields (and assert the seed still parses).
    const leave = parseDefinition({
      id: 'seed',
      key: input.key,
      title: input.title,
      version: 1,
      renderer: 'core',
      status: 'published',
      sections: input.sections,
    });
    const leaveType = leave.sections.flatMap((s) => s.fields).find((f) => f.key === 'leave_type');
    assert.ok(leaveType);
    assert.equal(leaveType.type, 'single-select');
    assert.deepEqual(leaveType.options, { source: 'leave-types' });
  });
});

describe('leave-types catalog source resolution (stubbed Prisma)', () => {
  beforeEach(() => {
    publishedRow = undefined;
    leaveTypeRows = [];
    departmentRows = [];
    findManyArgs.leaveType.length = 0;
    findManyArgs.department.length = 0;
    clearCompileCache();
  });

  it('getFormByKey resolves the marker into name/name option pairs, tenant-scoped and name-ordered', async () => {
    publishedRow = publishedLeave('def-render', [
      LEAVE_TYPE_MARKER,
      field({ key: 'context', label: 'Context', type: 'textarea', required: true }),
    ]);
    leaveTypeRows = [{ name: 'Casual Leave' }, { name: 'Comp Off' }];

    const dto = await getFormByKey('t1', 'leave');

    // value === label === the type NAME — extractors.ts stores the submitted label verbatim.
    assert.deepEqual(dto.sections[0].fields[0].options, [
      { value: 'Casual Leave', label: 'Casual Leave' },
      { value: 'Comp Off', label: 'Comp Off' },
    ]);
    // Same ordering as the Leave Policy list endpoint (leave-types.service.ts).
    assert.deepEqual(findManyArgs.leaveType, [{ where: { tenantId: 't1' }, orderBy: { name: 'asc' } }]);
  });

  it('resolves an empty LeaveType table to an empty option list, not free text', async () => {
    publishedRow = publishedLeave('def-empty', [LEAVE_TYPE_MARKER]);

    const dto = await getFormByKey('t1', 'leave');

    assert.deepEqual(dto.sections[0].fields[0].options, []);
  });

  it('passes static option lists through untouched and skips the LeaveType query when no marker is present', async () => {
    const staticOptions = [{ value: 'Today', label: 'Today' }];
    publishedRow = publishedLeave('def-static', [
      field({ key: 'when_go', label: 'When will you go?', type: 'radio', required: true, options: staticOptions }),
    ]);

    const dto = await getFormByKey('t1', 'leave');

    assert.deepEqual(dto.sections[0].fields[0].options, staticOptions);
    assert.equal(findManyArgs.leaveType.length, 0);
  });

  it('still resolves the departments marker (id-valued options) alongside leave-types — regression', async () => {
    publishedRow = publishedLeave('def-both', [
      field({
        key: 'department',
        label: 'Group / Department',
        type: 'single-select',
        required: true,
        options: { source: 'departments' },
      }),
      LEAVE_TYPE_MARKER,
    ]);
    departmentRows = [{ id: 'd1', name: 'Engineering' }];
    leaveTypeRows = [{ name: 'LWP' }];

    const dto = await getFormByKey('t1', 'leave');

    assert.deepEqual(dto.sections[0].fields[0].options, [{ value: 'd1', label: 'Engineering' }]);
    assert.deepEqual(dto.sections[0].fields[1].options, [{ value: 'LWP', label: 'LWP' }]);
    // Fresh-form path offers active departments only (leave types have no archived flag).
    assert.deepEqual(findManyArgs.department, [
      { where: { tenantId: 't1', archived: false }, orderBy: { name: 'asc' } },
    ]);
  });

  it("submission-path definitions carry resolved enums: a new type's name validates, a deleted type's rejects — same version, no republish", async () => {
    publishedRow = publishedLeave('def-submit', [LEAVE_TYPE_MARKER]);
    leaveTypeRows = [{ name: 'Old Type' }];

    const before = await getPublishedDefinitionForSubmission('t1', 'leave');
    assert.equal(validatePayload(before.definition, { leave_type: 'Old Type' }).success, true);

    // Admin deletes 'Old Type' and creates 'New Type' — same (id, version), so this also proves
    // the compile cache recompiles on an options change (compile.ts's optionsFingerprint).
    leaveTypeRows = [{ name: 'New Type' }];

    const after = await getPublishedDefinitionForSubmission('t1', 'leave');
    assert.equal(validatePayload(after.definition, { leave_type: 'New Type' }).success, true);

    const rejected = validatePayload(after.definition, { leave_type: 'Old Type' });
    assert.equal(rejected.success, false);
    assert.deepEqual(rejected.errors?.leave_type, ['Invalid option']);
  });
});
