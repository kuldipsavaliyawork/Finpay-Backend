import express, { type Express, type Request, type Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';

import { config } from './config/config';
import { logger } from './infrastructure/logger/logger';
import { pingDatabase } from './infrastructure/prisma';
import { apiLimiter } from './common/middleware/rateLimit.middleware';
import { errorMiddleware, notFoundMiddleware } from './common/middleware/error.middleware';
import { ok } from './common/http/envelope';
import { asyncHandler } from './common/http/async-handler';
import { apiRouter } from './modules';
import { openApiDocument } from './openapi';

/**
 * Build the Express application. Middleware order matters:
 * security → cors → parsers → logging → rate-limit → routes → docs → 404 → error.
 */
export function createApp(): Express {
  const app = express();

  // Behind a proxy/load-balancer in most deployments; enables correct req.ip.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigins.length > 0 ? config.corsOrigins : true,
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(pinoHttp({ logger }));

  // Health check — verifies DB connectivity.
  app.get(
    '/health',
    asyncHandler(async (_req: Request, res: Response) => {
      const dbUp = await pingDatabase();
      ok(res, { status: 'ok', db: dbUp ? 'up' : 'down' });
    }),
  );

  // Swagger UI.
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));
  app.get('/api/docs.json', (_req, res) => {
    res.json(openApiDocument);
  });

  // API v1 (rate-limited).
  app.use(`/api/${config.apiVersion}`, apiLimiter, apiRouter);

  // 404 + terminal error handler (MUST be last).
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}
