import { io, type Socket } from 'socket.io-client';
import type { NotificationDto } from '@se/shared';
import { tokenStore } from './api';

const API_URL = import.meta.env?.VITE_API_URL ?? 'http://localhost:4000';

let socket: Socket | null = null;

/** Lazily connects (or reuses) the one Socket.IO connection for the session, authenticating via
 *  the same access token as HTTP calls — the server joins it to `user:<id>` on a valid handshake. */
function getSocket(): Socket | null {
  const token = tokenStore.access;
  if (!token) return null;
  if (socket) return socket;
  socket = io(API_URL, { auth: { token } });
  return socket;
}

/** Tears down the socket — call on logout so a later login doesn't reuse a stale connection. */
export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

/** Subscribes to live `notification:new` pushes; returns an unsubscribe function. A no-op
 *  subscription (never fires) if there's no access token yet — the caller's poll fallback covers it. */
export function onNewNotification(handler: (n: NotificationDto) => void): () => void {
  const s = getSocket();
  if (!s) return () => {};
  s.on('notification:new', handler);
  return () => {
    s.off('notification:new', handler);
  };
}
