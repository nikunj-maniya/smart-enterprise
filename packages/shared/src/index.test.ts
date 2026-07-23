import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_PERMISSION_KEYS,
  DEFAULT_DEPARTMENT_NAMES,
  healthResponseSchema,
  PERMISSION_CATALOG,
  PERMISSION_LABELS,
  PermissionKey,
  permissionScopeSummary,
  SYSTEM_ROLE_KEYS,
  SYSTEM_ROLE_NAMES,
  SYSTEM_ROLE_PERMISSIONS,
  SystemRoleKey,
} from './index.js';

/**
 * Most of index.ts's ~1500 lines are Zod request/response schemas already exercised
 * transitively through each API module's own controller/service/routes tests (every
 * `.parse()` call in a controller runs one of these schemas). This suite instead covers the
 * derived constants and the one plain function that live here with no owning module of their
 * own: the role/permission catalog invariants and `permissionScopeSummary`.
 */

describe('SYSTEM_ROLE_KEYS / SYSTEM_ROLE_NAMES', () => {
  it('SYSTEM_ROLE_KEYS matches every SystemRoleKey value, with no duplicates', () => {
    assert.deepEqual(new Set(SYSTEM_ROLE_KEYS), new Set(Object.values(SystemRoleKey)));
    assert.equal(SYSTEM_ROLE_KEYS.length, new Set(SYSTEM_ROLE_KEYS).size);
  });

  it('every SystemRoleKey has a human-readable name', () => {
    for (const key of SYSTEM_ROLE_KEYS) {
      assert.equal(typeof SYSTEM_ROLE_NAMES[key], 'string');
      assert.ok(SYSTEM_ROLE_NAMES[key].length > 0);
    }
  });
});

describe('PERMISSION_CATALOG / ALL_PERMISSION_KEYS / PERMISSION_LABELS', () => {
  it('ALL_PERMISSION_KEYS matches every PermissionKey value exactly once', () => {
    assert.deepEqual([...ALL_PERMISSION_KEYS].sort(), Object.values(PermissionKey).sort());
    assert.equal(ALL_PERMISSION_KEYS.length, new Set(ALL_PERMISSION_KEYS).size);
  });

  it('every catalog entry has a label, and PERMISSION_LABELS covers every key', () => {
    for (const group of PERMISSION_CATALOG) {
      assert.ok(group.group.length > 0);
      for (const { key, label } of group.permissions) {
        assert.ok(label.length > 0);
        assert.equal(PERMISSION_LABELS[key], label);
      }
    }
  });
});

describe('SYSTEM_ROLE_PERMISSIONS', () => {
  it('grants every role only recognized permission keys', () => {
    for (const perms of Object.values(SYSTEM_ROLE_PERMISSIONS)) {
      for (const p of perms) assert.ok(ALL_PERMISSION_KEYS.includes(p));
    }
  });

  it('grants every role the baseline view/submit permissions', () => {
    for (const perms of Object.values(SYSTEM_ROLE_PERMISSIONS)) {
      assert.ok(perms.includes(PermissionKey.ViewAllForms));
      assert.ok(perms.includes(PermissionKey.SubmitRequest));
    }
  });

  it('has an entry for every SystemRoleKey', () => {
    for (const key of SYSTEM_ROLE_KEYS) {
      assert.ok(Array.isArray(SYSTEM_ROLE_PERMISSIONS[key]));
    }
  });
});

describe('DEFAULT_DEPARTMENT_NAMES', () => {
  it('is a non-empty list of unique, non-blank names', () => {
    assert.ok(DEFAULT_DEPARTMENT_NAMES.length > 0);
    assert.equal(new Set(DEFAULT_DEPARTMENT_NAMES).size, DEFAULT_DEPARTMENT_NAMES.length);
    assert.ok(DEFAULT_DEPARTMENT_NAMES.every((n) => n.trim().length > 0));
  });
});

describe('permissionScopeSummary', () => {
  it('reports "No permissions" for an empty list', () => {
    assert.equal(permissionScopeSummary([]), 'No permissions');
  });

  it('joins up to 3 labels with " · "', () => {
    const summary = permissionScopeSummary([PermissionKey.ViewAllForms, PermissionKey.SubmitRequest]);
    assert.equal(summary, 'View all form types · Submit a request');
  });

  it('truncates beyond 3 with a "+N more" suffix', () => {
    const perms = [
      PermissionKey.ViewAllForms,
      PermissionKey.SubmitRequest,
      PermissionKey.ApproveAssigned,
      PermissionKey.ManageOrg,
    ];
    assert.equal(
      permissionScopeSummary(perms),
      'View all form types · Submit a request · Approve where assigned +1 more',
    );
  });

  it('falls back to the raw key for an unrecognized permission', () => {
    assert.equal(permissionScopeSummary(['some_future_permission']), 'some_future_permission');
  });
});

describe('healthResponseSchema', () => {
  it('accepts a well-formed health response', () => {
    assert.doesNotThrow(() =>
      healthResponseSchema.parse({ status: 'ok', service: 'api', timestamp: '2026-07-23T00:00:00.000Z' }),
    );
  });

  it('rejects a status other than the literal "ok"', () => {
    assert.throws(() => healthResponseSchema.parse({ status: 'down', service: 'api', timestamp: 'x' }));
  });
});
