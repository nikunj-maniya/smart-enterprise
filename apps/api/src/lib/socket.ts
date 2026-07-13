import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { TenantStatus, UserStatus } from '@prisma/client';
import { prisma } from '../prisma.js';
import { verifyAccessToken } from './jwt.js';

let io: Server | null = null;

/** The room every socket for a given user joins — matches `notify()`'s emit target. */
function userRoom(userId: string): string {
  return `user:${userId}`;
}

/**
 * Wires the Socket.IO server onto the same HTTP server Express listens on. The handshake
 * validates the JWT the same way `requireAuth` does (active user, non-suspended tenant) before
 * letting a socket join its user room — an unauthenticated or inactive-user socket joins nothing.
 */
export function initSocketServer(httpServer: HttpServer): void {
  io = new Server(httpServer, { cors: { origin: '*' } });

  io.use(async (socket: Socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) throw new Error('Missing token');
      const payload = verifyAccessToken(token);
      const user = await prisma.user.findUnique({ where: { id: payload.sub }, include: { tenant: true } });
      if (!user || user.status !== UserStatus.Active || user.tenant?.status === TenantStatus.Suspended) {
        throw new Error('Inactive user');
      }
      socket.data.userId = user.id;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket: Socket) => {
    socket.join(userRoom(socket.data.userId as string));
  });
}

/** Push a typed payload to every socket a user has open. A no-op if their socket is down —
 *  the web client's 30s poll is the fallback delivery path in that case. */
export function emitToUser(userId: string, event: string, payload: unknown): void {
  io?.to(userRoom(userId)).emit(event, payload);
}
