import { before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import argon2 from 'argon2';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { signRefreshToken, verifyAccessToken, verifyRefreshToken } from '../../lib/jwt.js';
import * as authService from './auth.service.js';

/**
 * PrismaClient exposes its delegates via a proxy `get` trap, so `mock.method` can't see them —
 * redefine the delegates auth.service.ts reads/writes as stubs backed by the mutable rows below
 * (forms.service.test.ts pattern). Only paths reachable without a live Postgres are covered;
 * argon2 hashing/verification runs for real since it's pure compute, no DB involved.
 */

type UserRow = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  status: string;
  mustChangePassword: boolean;
  isSystemAdmin: boolean;
  tenantId: string | null;
  tenant: { name: string; status: string } | null;
  roles: { role: { key: string } }[];
};

type ResetTokenRow = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
};

let userRow: UserRow | null = null;
let resetTokenRow: ResetTokenRow | null = null;
const updateCalls = { user: [] as { where: { id: string }; data: Record<string, unknown> }[], resetToken: [] as { where: { id: string }; data: Record<string, unknown> }[] };
const createCalls = { resetToken: [] as { data: { userId: string; tokenHash: string; expiresAt: Date } }[] };

Object.defineProperty(prisma, 'user', {
  value: {
    findUnique: async () => userRow,
    update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
      updateCalls.user.push(args);
      return { ...(userRow as UserRow), ...args.data };
    },
  },
  configurable: true,
});

Object.defineProperty(prisma, 'passwordResetToken', {
  value: {
    findUnique: async () => resetTokenRow,
    create: async (args: { data: { userId: string; tokenHash: string; expiresAt: Date } }) => {
      createCalls.resetToken.push(args);
      return { id: 'prt1', usedAt: null, createdAt: new Date(), ...args.data };
    },
    update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
      updateCalls.resetToken.push(args);
      return { ...(resetTokenRow as ResetTokenRow), ...args.data };
    },
  },
  configurable: true,
});

Object.defineProperty(prisma, '$transaction', {
  value: async (ops: Promise<unknown>[]) => Promise.all(ops),
  configurable: true,
});

function makeUser(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 'u1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    passwordHash: 'placeholder',
    status: 'Active',
    mustChangePassword: false,
    isSystemAdmin: false,
    tenantId: 't1',
    tenant: { name: 'Acme', status: 'Active' },
    roles: [{ role: { key: 'employee' } }],
    ...overrides,
  };
}

describe('auth.service', () => {
  let correctHash: string;

  before(async () => {
    correctHash = await argon2.hash('correct-password');
  });

  beforeEach(() => {
    userRow = null;
    resetTokenRow = null;
    updateCalls.user.length = 0;
    updateCalls.resetToken.length = 0;
    createCalls.resetToken.length = 0;
  });

  describe('login', () => {
    it('rejects an unknown email with 401', async () => {
      await assert.rejects(
        () => authService.login('missing@example.com', 'whatever'),
        (err: unknown) => {
          assert.ok(err instanceof HttpError);
          assert.equal(err.status, 401);
          assert.equal(err.message, 'Invalid email or password');
          return true;
        },
      );
    });

    it('rejects a Pending user with 403 (awaiting approval)', async () => {
      const user = makeUser({ status: 'Pending', passwordHash: correctHash });
      userRow = user;
      await assert.rejects(
        () => authService.login(user.email, 'correct-password'),
        (err: unknown) => {
          assert.ok(err instanceof HttpError);
          assert.equal(err.status, 403);
          assert.equal(err.message, 'Your account is awaiting approval by your administrator.');
          return true;
        },
      );
    });

    it('rejects an Inactive user with 403', async () => {
      const user = makeUser({ status: 'Inactive', passwordHash: correctHash });
      userRow = user;
      await assert.rejects(
        () => authService.login(user.email, 'correct-password'),
        (err: unknown) => {
          assert.ok(err instanceof HttpError);
          assert.equal(err.status, 403);
          assert.equal(err.message, 'Account is not active');
          return true;
        },
      );
    });

    it('rejects an Active user whose tenant is Suspended with 403', async () => {
      const user = makeUser({ tenant: { name: 'Acme', status: 'Suspended' }, passwordHash: correctHash });
      userRow = user;
      await assert.rejects(
        () => authService.login(user.email, 'correct-password'),
        (err: unknown) => {
          assert.ok(err instanceof HttpError);
          assert.equal(err.status, 403);
          return true;
        },
      );
    });

    it('rejects the wrong password with 401', async () => {
      const user = makeUser({ passwordHash: correctHash });
      userRow = user;
      await assert.rejects(
        () => authService.login(user.email, 'wrong-password'),
        (err: unknown) => {
          assert.ok(err instanceof HttpError);
          assert.equal(err.status, 401);
          assert.equal(err.message, 'Invalid email or password');
          return true;
        },
      );
    });

    it('resolves with the mapped user and a verifiable access/refresh token pair on success', async () => {
      const user = makeUser({ passwordHash: correctHash });
      userRow = user;
      const result = await authService.login(user.email, 'correct-password');

      assert.deepEqual(result.user, {
        id: 'u1',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        isSystemAdmin: false,
        mustChangePassword: false,
        tenantId: 't1',
        tenantName: 'Acme',
        roles: ['employee'],
      });
      assert.equal(verifyAccessToken(result.accessToken).sub, 'u1');
      assert.equal(verifyRefreshToken(result.refreshToken).sub, 'u1');
    });
  });

  describe('getMe', () => {
    it('rejects an unknown user id with 404', async () => {
      await assert.rejects(
        () => authService.getMe('missing'),
        (err: unknown) => {
          assert.ok(err instanceof HttpError);
          assert.equal(err.status, 404);
          return true;
        },
      );
    });

    it('returns the mapped AuthUser for a known id', async () => {
      userRow = makeUser();
      const me = await authService.getMe('u1');
      assert.equal(me.email, 'ada@example.com');
      assert.deepEqual(me.roles, ['employee']);
    });
  });

  describe('changePassword', () => {
    it('rejects an unknown user id with 404', async () => {
      await assert.rejects(
        () => authService.changePassword('missing', 'x', 'newlongpassword'),
        (err: unknown) => {
          assert.ok(err instanceof HttpError);
          assert.equal(err.status, 404);
          return true;
        },
      );
    });

    it('rejects an incorrect current password with 400', async () => {
      userRow = makeUser({ passwordHash: correctHash });
      await assert.rejects(
        () => authService.changePassword('u1', 'wrong-password', 'newlongpassword'),
        (err: unknown) => {
          assert.ok(err instanceof HttpError);
          assert.equal(err.status, 400);
          assert.equal(err.message, 'Current password is incorrect');
          return true;
        },
      );
    });

    it('hashes the new password and clears mustChangePassword on success', async () => {
      userRow = makeUser({ passwordHash: correctHash, mustChangePassword: true });
      const updated = await authService.changePassword('u1', 'correct-password', 'newlongpassword');

      assert.equal(updateCalls.user.length, 1);
      const call = updateCalls.user[0];
      assert.equal(call.where.id, 'u1');
      assert.equal(call.data.mustChangePassword, false);
      assert.notEqual(call.data.passwordHash, correctHash);
      assert.equal(await argon2.verify(call.data.passwordHash as string, 'newlongpassword'), true);
      assert.equal(updated.mustChangePassword, false);
    });
  });

  describe('requestPasswordReset', () => {
    it('does nothing for an unknown email (no token created, no error)', async () => {
      await authService.requestPasswordReset('missing@example.com');
      assert.equal(createCalls.resetToken.length, 0);
    });

    it('does nothing for a non-Active user', async () => {
      const user = makeUser({ status: 'Pending' });
      userRow = user;
      await authService.requestPasswordReset(user.email);
      assert.equal(createCalls.resetToken.length, 0);
    });

    it('creates a hashed, ~1-hour-expiring token for an Active user', async () => {
      const user = makeUser();
      userRow = user;
      const start = Date.now();
      await authService.requestPasswordReset(user.email);

      assert.equal(createCalls.resetToken.length, 1);
      const { data } = createCalls.resetToken[0];
      assert.equal(data.userId, 'u1');
      assert.match(data.tokenHash, /^[0-9a-f]{64}$/);
      const ttlMs = data.expiresAt.getTime() - start;
      assert.ok(ttlMs > 59 * 60 * 1000 && ttlMs <= 60 * 60 * 1000 + 100, `expected ~1h TTL, got ${ttlMs}ms`);
    });
  });

  describe('resetPassword', () => {
    it('rejects an unknown token with 400', async () => {
      await assert.rejects(
        () => authService.resetPassword('missing-token', 'newlongpassword'),
        (err: unknown) => {
          assert.ok(err instanceof HttpError);
          assert.equal(err.status, 400);
          assert.equal(err.message, 'This reset link is invalid or has expired.');
          return true;
        },
      );
    });

    it('rejects an already-used token with 400', async () => {
      resetTokenRow = {
        id: 'prt1',
        userId: 'u1',
        tokenHash: 'x'.repeat(64),
        expiresAt: new Date(Date.now() + 1000),
        usedAt: new Date(),
      };
      await assert.rejects(
        () => authService.resetPassword('anything', 'newlongpassword'),
        (err: unknown) => {
          assert.ok(err instanceof HttpError);
          assert.equal(err.status, 400);
          return true;
        },
      );
    });

    it('rejects an expired token with 400', async () => {
      resetTokenRow = {
        id: 'prt1',
        userId: 'u1',
        tokenHash: 'x'.repeat(64),
        expiresAt: new Date(Date.now() - 1000),
        usedAt: null,
      };
      await assert.rejects(
        () => authService.resetPassword('anything', 'newlongpassword'),
        (err: unknown) => {
          assert.ok(err instanceof HttpError);
          assert.equal(err.status, 400);
          return true;
        },
      );
    });

    it('hashes the new password and marks the token used inside a transaction on success', async () => {
      resetTokenRow = {
        id: 'prt1',
        userId: 'u1',
        tokenHash: 'x'.repeat(64),
        expiresAt: new Date(Date.now() + 1000),
        usedAt: null,
      };
      userRow = makeUser();

      await authService.resetPassword('anything', 'newlongpassword');

      assert.equal(updateCalls.user.length, 1);
      const userCall = updateCalls.user[0];
      assert.equal(userCall.where.id, 'u1');
      assert.equal(await argon2.verify(userCall.data.passwordHash as string, 'newlongpassword'), true);

      assert.equal(updateCalls.resetToken.length, 1);
      const tokenCall = updateCalls.resetToken[0];
      assert.equal(tokenCall.where.id, 'prt1');
      assert.ok(tokenCall.data.usedAt instanceof Date);
    });
  });

  describe('refresh', () => {
    it('rejects a malformed refresh token with 401 (no Prisma call reached)', async () => {
      await assert.rejects(
        () => authService.refresh('not-a-real-jwt'),
        (err: unknown) => {
          assert.ok(err instanceof HttpError);
          assert.equal(err.status, 401);
          assert.equal(err.message, 'Invalid or expired refresh token');
          return true;
        },
      );
    });

    it('rejects a valid token for a user that no longer exists with 401', async () => {
      const token = signRefreshToken('ghost');
      await assert.rejects(
        () => authService.refresh(token),
        (err: unknown) => {
          assert.ok(err instanceof HttpError);
          assert.equal(err.status, 401);
          assert.equal(err.message, 'User not found or inactive');
          return true;
        },
      );
    });

    it('rejects a valid token for an inactive user with 401', async () => {
      userRow = makeUser({ status: 'Suspended' });
      const token = signRefreshToken('u1');
      await assert.rejects(
        () => authService.refresh(token),
        (err: unknown) => {
          assert.ok(err instanceof HttpError);
          assert.equal(err.status, 401);
          return true;
        },
      );
    });

    it('issues a fresh token pair for a valid token and an Active user', async () => {
      userRow = makeUser();
      const token = signRefreshToken('u1');
      const result = await authService.refresh(token);
      assert.equal(verifyAccessToken(result.accessToken).sub, 'u1');
      assert.equal(verifyRefreshToken(result.refreshToken).sub, 'u1');
    });
  });
});
