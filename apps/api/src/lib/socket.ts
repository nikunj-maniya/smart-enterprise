import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { parseCookie } from 'cookie';
import { verifyAccessToken } from './jwt.js';
import { resolveAuthedUser } from './auth-cache.js';
import { cacheRedis } from './cache-redis.js';
import { ACCESS_COOKIE } from './auth-cookies.js';

let io: Server | null = null;

/** The room every socket for a given user joins — matches `notify()`'s emit target. */
function userRoom(userId: string): string {
  return `user:${userId}`;
}

/**
 * Wires the Socket.IO server onto the same HTTP server Express listens on. The handshake
 * validates the JWT the same way `requireAuth` does (active user, non-suspended tenant) before
 * letting a socket join its user room — an unauthenticated or inactive-user socket joins nothing.
 *
 * The Redis adapter makes room membership and `emitToUser` work across API replicas — without
 * it, a user's socket and the request emitting their notification could land on different
 * instances that can't see each other's local rooms.
 */
export function initSocketServer(httpServer: HttpServer): void {
  const corsOrigins = (process.env.CORS_ORIGIN ?? process.env.WEB_URL ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim());
  io = new Server(httpServer, { cors: { origin: corsOrigins, credentials: true } });
  io.adapter(createAdapter(cacheRedis.duplicate(), cacheRedis.duplicate()));

  io.use(async (socket: Socket, next) => {
    try {
      // Bearer-style `auth.token` (non-browser clients) or the httpOnly `se_access` cookie the
      // browser sends automatically on the handshake request (finding #6 — the web client no
      // longer holds a JS-readable token to pass as `auth.token`).
      const cookieHeader = socket.handshake.headers?.cookie;
      const cookieToken = cookieHeader ? parseCookie(cookieHeader)[ACCESS_COOKIE] : undefined;
      const token = (socket.handshake.auth?.token as string | undefined) ?? cookieToken;
      if (!token) throw new Error('Missing token');
      const payload = verifyAccessToken(token);
      const authedUser = await resolveAuthedUser(payload.sub);
      if (!authedUser) throw new Error('Inactive user');
      socket.data.userId = authedUser.id;
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
