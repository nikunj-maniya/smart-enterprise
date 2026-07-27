import { io, type Socket } from 'socket.io-client';
import type { NotificationDto } from '@se/shared';

const API_URL = import.meta.env?.VITE_API_URL ?? 'http://localhost:4000';

let socket: Socket | null = null;

/** Lazily connects (or reuses) the one Socket.IO connection for the session. Auth travels via
 *  the httpOnly `se_access` cookie (finding #6) — `withCredentials` is what makes the handshake
 *  request carry it; the server rejects the connection if it's missing/invalid. */
function getSocket(): Socket {
  if (socket) return socket;
  socket = io(API_URL, { withCredentials: true });
  return socket;
}

/** Tears down the socket — call on logout so a later login doesn't reuse a stale connection. */
export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

/** Subscribes to live `notification:new` pushes; returns an unsubscribe function. Only called
 *  from routes already behind `ProtectedRoute`, so a session is expected to exist. */
export function onNewNotification(handler: (n: NotificationDto) => void): () => void {
  const s = getSocket();
  s.on('notification:new', handler);
  return () => {
    s.off('notification:new', handler);
  };
}
