import { Router } from 'express';
import { asyncHandler } from '../../common/http';
import { registerOpenApiPaths } from '../../openapi';
import { publicController } from './public.controller';

/** Unauthenticated read-only endpoints for login/marketing surfaces. */
export const publicRouter: Router = Router();

publicRouter.get('/showcase', asyncHandler(publicController.showcase));
publicRouter.get('/demo-accounts', asyncHandler(publicController.demoAccounts));

registerOpenApiPaths(
  {
    '/public/showcase': {
      get: {
        tags: ['Public'],
        summary: 'Login-page finance KPIs from demo tenant database',
        responses: { 200: { description: 'OK' } },
      },
    },
    '/public/demo-accounts': {
      get: {
        tags: ['Public'],
        summary: 'Demo tenant users for login quick-fill',
        responses: { 200: { description: 'OK' } },
      },
    },
  },
  [{ name: 'Public', description: 'Unauthenticated showcase data' }],
);
