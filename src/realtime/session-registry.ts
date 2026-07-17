import type { Namespace } from 'socket.io';
import { config } from '../config/config';

/**
 * In-memory live-presence registry for the `/sessions` namespace.
 * A session is active only while its WebSocket is open.
 */
export interface ActiveSession {
  socketId: string;
  userId: string;
  name: string;
  email: string;
  tenantId: string;
  ipAddress?: string;
  userAgent?: string;
  connectedAt: Date;
}

export interface OnlineUser {
  userId: string;
  name: string;
  email: string;
  sessions: number;
  isOnline: boolean;
}

export interface SessionPayload {
  id: string;
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
}

const GRACE_MS = 15_000;
const REVOKE_TTL_MS = 25 * 60 * 60 * 1000;

class SessionRegistry {
  private ns: Namespace | null = null;
  private connected = new Map<string, ActiveSession>();
  private disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private revoked = new Map<string, number>();

  setNamespace(ns: Namespace) {
    this.ns = ns;
  }

  markRevoked(sessionId: string) {
    this.revoked.set(sessionId, Date.now() + REVOKE_TTL_MS);
    for (const [id, exp] of this.revoked) if (Date.now() > exp) this.revoked.delete(id);
  }

  isRevoked(sessionId: string): boolean {
    const exp = this.revoked.get(sessionId);
    if (exp === undefined) return false;
    if (Date.now() > exp) {
      this.revoked.delete(sessionId);
      return false;
    }
    return true;
  }

  add(sessionId: string, s: ActiveSession) {
    const t = this.disconnectTimers.get(sessionId);
    if (t) {
      clearTimeout(t);
      this.disconnectTimers.delete(sessionId);
    }
    this.connected.set(sessionId, s);
    for (const [sid, entry] of this.connected) {
      if (sid === sessionId || entry.userId !== s.userId) continue;
      if (this.disconnectTimers.has(sid)) continue;
      if (this.ns?.sockets.has(entry.socketId)) continue;
      this.connected.delete(sid);
    }
  }

  scheduleRemove(sessionId: string, socketId: string) {
    const timer = setTimeout(() => {
      const entry = this.connected.get(sessionId);
      if (entry && entry.socketId === socketId) this.connected.delete(sessionId);
      this.disconnectTimers.delete(sessionId);
    }, GRACE_MS);
    this.disconnectTimers.set(sessionId, timer);
  }

  remove(sessionId: string) {
    this.connected.delete(sessionId);
    const t = this.disconnectTimers.get(sessionId);
    if (t) {
      clearTimeout(t);
      this.disconnectTimers.delete(sessionId);
    }
    this.markRevoked(sessionId);
  }

  getSessionUserId(sessionId: string): string | undefined {
    if (this.disconnectTimers.has(sessionId)) return undefined;
    return this.connected.get(sessionId)?.userId;
  }

  sessionsFor(userId: string): SessionPayload[] {
    const out: SessionPayload[] = [];
    for (const [sessionId, entry] of this.connected) {
      if (entry.userId !== userId) continue;
      if (this.disconnectTimers.has(sessionId)) continue;
      out.push({
        id: sessionId,
        userId,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
        createdAt: entry.connectedAt.toISOString(),
        expiresAt: new Date(entry.connectedAt.getTime() + config.jwt.refreshTtl * 1000).toISOString(),
      });
    }
    return out;
  }

  onlineFor(tenantId: string): OnlineUser[] {
    const map = new Map<string, { name: string; email: string; sessions: number }>();
    for (const [sessionId, entry] of this.connected) {
      if (entry.tenantId !== tenantId) continue;
      if (this.disconnectTimers.has(sessionId)) continue;
      const ex = map.get(entry.userId);
      if (ex) ex.sessions++;
      else map.set(entry.userId, { name: entry.name, email: entry.email, sessions: 1 });
    }
    return Array.from(map.entries()).map(([userId, d]) => ({
      userId,
      ...d,
      isOnline: d.sessions > 0,
    }));
  }

  pushSessions(userId: string) {
    this.ns?.to(`user:${userId}`).emit('sessions:data', this.sessionsFor(userId));
  }

  pushOnline(tenantId: string) {
    this.ns?.to(`tenant:${tenantId}`).emit('users:online', this.onlineFor(tenantId));
  }

  emitRevoked(userId: string, sessionId: string) {
    this.ns?.to(`user:${userId}`).emit('session:revoked', { sessionId });
  }
}

export const sessionRegistry = new SessionRegistry();
