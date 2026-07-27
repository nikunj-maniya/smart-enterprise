import type { CheckInWithSignatureRequest, FrontDeskTodayResponse, FrontDeskVisitorDto, RequestDto } from '@se/shared';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { getSignedDownloadUrl, uploadObject } from '../../lib/object-storage.js';
import { transitionRequest, type TransitionActor } from '../requests/transitions.service.js';

/** Today's calendar-day bounds in Asia/Kolkata (design.md: "today is date-of-visit in tenant
 *  timezone"), expressed as the equivalent UTC instants for a `startDate` range query. */
function todayRangeIST(): { start: Date; end: Date } {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(Date.now() + IST_OFFSET_MS);
  const startOfDayIST = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate());
  const start = new Date(startOfDayIST - IST_OFFSET_MS);
  const end = new Date(startOfDayIST + 24 * 60 * 60 * 1000 - IST_OFFSET_MS);
  return { start, end };
}

/**
 * GET /front-desk/today — today's visitors, split into Expected (approved, not yet checked in),
 * On-site (checked in, not checked out), and Checked-out (front-desk spec). Single-day
 * interpretation only: a multi-day visit is filtered by its one `visit_datetime`, not repeated
 * across every declared day (design.md's risk note flags this as a deferred refinement, not
 * required by this change's own task list).
 */
export async function getTodayView(tenantId: string): Promise<FrontDeskTodayResponse> {
  const { start, end } = todayRangeIST();

  const rows = await prisma.request.findMany({
    where: { tenantId, form: { key: 'visitor' }, startDate: { gte: start, lt: end } },
    include: { visitor: true },
    orderBy: { startDate: 'asc' },
  });

  const hostIds = [
    ...new Set(
      rows
        .map((r) => (r.payload as Record<string, unknown>).whom_to_meet)
        .filter((v): v is string => typeof v === 'string'),
    ),
  ];
  const hosts = await prisma.user.findMany({ where: { id: { in: hostIds }, tenantId }, select: { id: true, name: true } });
  const hostNameById = new Map(hosts.map((h) => [h.id, h.name]));

  const dtos: FrontDeskVisitorDto[] = rows.map((r) => {
    const payload = r.payload as Record<string, unknown>;
    const hostId = typeof payload.whom_to_meet === 'string' ? payload.whom_to_meet : null;
    return {
      requestId: r.id,
      visitorName: typeof payload.visitor_name === 'string' ? payload.visitor_name : '',
      mobile: typeof payload.mobile === 'string' ? payload.mobile : '',
      hostName: hostId ? (hostNameById.get(hostId) ?? 'Unknown') : 'Unknown',
      purpose: typeof payload.purpose === 'string' ? payload.purpose : '',
      visitDatetime: r.startDate?.toISOString() ?? null,
      outTime: typeof payload.out_time === 'string' ? payload.out_time : null,
      laptopDetails: typeof payload.laptop_details === 'string' ? payload.laptop_details : null,
      status: r.status,
      checkInAt: r.visitor?.checkInAt?.toISOString() ?? null,
      checkOutAt: r.visitor?.checkOutAt?.toISOString() ?? null,
    };
  });

  return {
    expected: dtos.filter((d) => d.status === 'Approved' && !d.checkInAt),
    onSite: dtos.filter((d) => !!d.checkInAt && !d.checkOutAt),
    checkedOut: dtos.filter((d) => !!d.checkOutAt),
  };
}

function decodeDataUrl(dataUrl: string): { buffer: Buffer; contentType: string } {
  const match = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) throw new HttpError(400, 'Signature must be a base64 image data URL');
  return { buffer: Buffer.from(match[2], 'base64'), contentType: match[1] };
}

/** Every id in this schema is a Prisma `cuid()` — reject anything else before it's interpolated
 *  into an object-storage key (path separators, `..`, etc. would otherwise flow through verbatim). */
const CUID_RE = /^c[a-z0-9]{20,}$/;

/**
 * POST /front-desk/:requestId/check-in — captures the visitor's signature at check-in
 * (visitor-signatures spec), storing it in MinIO before driving the same `Approved -> Checked-In`
 * transition the plain check-in button already used. The signature never touches the database —
 * only its object key does.
 */
export async function checkInWithSignature(
  tenantId: string,
  actor: TransitionActor,
  requestId: string,
  input: CheckInWithSignatureRequest,
): Promise<RequestDto> {
  if (!CUID_RE.test(requestId)) throw new HttpError(400, 'Invalid request id');
  const { buffer, contentType } = decodeDataUrl(input.signature);
  const key = `visitor-signatures/${tenantId}/${requestId}.png`;
  await uploadObject(key, buffer, contentType);

  const dto = await transitionRequest(tenantId, requestId, actor, { toState: 'Checked-In' });

  await prisma.visitor.update({
    where: { requestId },
    data: { signatureObjectKey: key, consent: input.consent },
  });

  return dto;
}

/** GET /front-desk/:requestId/signature-url — a signed, short-lived URL; refused if no signature was ever captured. */
export async function getSignatureUrl(tenantId: string, requestId: string): Promise<string> {
  const visitor = await prisma.visitor.findFirst({
    where: { requestId, request: { tenantId } },
    select: { signatureObjectKey: true },
  });
  if (!visitor?.signatureObjectKey) throw new HttpError(404, 'No signature on file for this visitor');
  return getSignedDownloadUrl(visitor.signatureObjectKey);
}
