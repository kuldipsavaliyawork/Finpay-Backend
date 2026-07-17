import type { Server as HttpServer } from 'node:http';
import { Server as IOServer } from 'socket.io';
import { config } from '../config/config';
import { verifyAccess } from '../common/security/tokens';
import { prisma } from '../infrastructure/prisma';
import { logger } from '../infrastructure/logger/logger';
import { sessionRegistry } from './session-registry';

/**
 * Attach the `/sessions` Socket.io namespace used by frontend SessionContext.
 * Auth: Bearer access JWT (same secret as REST). Optional handshake.auth.sessionId
 * is the refresh-token row id stored by the client after login.
 */
export function attachSessionSockets(server: HttpServer): IOServer {
  const io = new IOServer(server, {
    cors: {
      origin: config.corsOrigins.length ? config.corsOrigins : true,
      credentials: true,
    },
  });

  const sessions = io.of('/sessions');
  sessionRegistry.setNamespace(sessions);

  sessions.on('connection', (socket) => {
    void (async () => {
      try {
        const auth = socket.handshake.auth ?? {};
        const token =
          (auth.token as string) ||
          (socket.handshake.headers?.authorization as string)?.replace(/^Bearer\s+/i, '');
        const sessionId = auth.sessionId as string | undefined;

        if (!token) {
          socket.disconnect();
          return;
        }
        if (sessionId && sessionRegistry.isRevoked(sessionId)) {
          socket.disconnect();
          return;
        }

        const payload = verifyAccess(token);
        const userId = payload.sub;
        const tenantId = payload.tid;

        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { email: true, firstName: true, lastName: true },
        });
        const name = user
          ? [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email
          : userId;
        const email = user?.email ?? '';

        socket.data.userId = userId;
        socket.data.sessionId = sessionId;
        socket.data.tenantId = tenantId;

        socket.join(`user:${userId}`);
        socket.join(`tenant:${tenantId}`);

        const ipAddress =
          (socket.handshake.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
          socket.handshake.address ??
          'Unknown';
        const userAgent = socket.handshake.headers['user-agent'] as string | undefined;

        if (sessionId) {
          sessionRegistry.add(sessionId, {
            socketId: socket.id,
            userId,
            name,
            email,
            tenantId,
            ipAddress,
            userAgent,
            connectedAt: new Date(),
          });
          sessionRegistry.pushSessions(userId);
          sessionRegistry.pushOnline(tenantId);
        }

        socket.emit('connected', { userId, sessionId, message: 'WS connected' });
        socket.on('ping', () => socket.emit('pong', { ts: Date.now() }));

        socket.on('disconnect', () => {
          const data = socket.data ?? {};
          if (data.sessionId) {
            sessionRegistry.scheduleRemove(data.sessionId, socket.id);
            if (data.userId) sessionRegistry.pushSessions(data.userId);
            if (data.tenantId) sessionRegistry.pushOnline(data.tenantId);
          }
        });
      } catch (err) {
        logger.debug({ err }, 'sessions.socket rejected connection');
        socket.disconnect();
      }
    })();
  });

  logger.info('Socket.io /sessions namespace attached');
  return io;
}
