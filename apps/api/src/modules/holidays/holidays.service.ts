import { Prisma } from '@prisma/client';
import type { HolidayCreate, HolidayDto, HolidayUpdate } from '@se/shared';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';

/** `YYYY-MM-DD` → UTC-midnight Date — the same calendar-day convention as `Request.startDate`. */
function toUtcDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

function toDto(row: { id: string; date: Date; name: string }): HolidayDto {
  return { id: row.id, date: row.date.toISOString().slice(0, 10), name: row.name };
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/** GET /holidays?year= — the tenant's holidays for a calendar year, date ascending. */
export async function listHolidays(tenantId: string, year: number): Promise<HolidayDto[]> {
  const rows = await prisma.holiday.findMany({
    where: {
      tenantId,
      date: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) },
    },
    orderBy: { date: 'asc' },
  });
  return rows.map(toDto);
}

/** POST /holidays — create, audit-logged; the `(tenantId, date)` unique surfaces as 409. */
export async function createHoliday(tenantId: string, actorId: string, input: HolidayCreate): Promise<HolidayDto> {
  try {
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.holiday.create({
        data: { tenantId, date: toUtcDate(input.date), name: input.name },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId,
          entity: 'Holiday',
          entityId: row.id,
          action: 'create',
          after: { date: input.date, name: input.name },
        },
      });
      return row;
    });
    return toDto(created);
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, 'A holiday already exists on this date');
    throw err;
  }
}

/** PUT /holidays/:id — update date and/or name, audit-logged. */
export async function updateHoliday(
  tenantId: string,
  actorId: string,
  id: string,
  input: HolidayUpdate,
): Promise<HolidayDto> {
  const existing = await prisma.holiday.findFirst({ where: { id, tenantId } });
  if (!existing) throw new HttpError(404, 'Holiday not found');

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.holiday.update({
        where: { id },
        data: {
          ...(input.date !== undefined ? { date: toUtcDate(input.date) } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId,
          entity: 'Holiday',
          entityId: id,
          action: 'update',
          before: { date: existing.date.toISOString().slice(0, 10), name: existing.name },
          after: { date: row.date.toISOString().slice(0, 10), name: row.name },
        },
      });
      return row;
    });
    return toDto(updated);
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, 'A holiday already exists on this date');
    throw err;
  }
}

/** DELETE /holidays/:id — delete, audit-logged. */
export async function deleteHoliday(tenantId: string, actorId: string, id: string): Promise<void> {
  const existing = await prisma.holiday.findFirst({ where: { id, tenantId } });
  if (!existing) throw new HttpError(404, 'Holiday not found');

  await prisma.$transaction(async (tx) => {
    await tx.holiday.delete({ where: { id } });
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId,
        entity: 'Holiday',
        entityId: id,
        action: 'delete',
        before: { date: existing.date.toISOString().slice(0, 10), name: existing.name },
      },
    });
  });
}
