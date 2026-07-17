import { config } from './config/config';

/**
 * Minimal OpenAPI 3 document. The auth module's paths are declared here; each
 * feature module contributes its own paths via `registerOpenApiPaths(...)`
 * during the integration phase (see FRAMEWORK_CONTRACT.md).
 */
export const openApiDocument: {
  openapi: string;
  info: Record<string, unknown>;
  servers: { url: string }[];
  components: Record<string, unknown>;
  paths: Record<string, unknown>;
  tags: { name: string; description?: string }[];
} = {
  openapi: '3.0.3',
  info: {
    title: 'FinPay API',
    version: '1.0.0',
    description:
      'FinPay — Accounting & Finance SaaS backend. All responses use the standard envelope ' +
      '{ success, data | error }. Feature modules register their own paths.',
  },
  servers: [{ url: `/api/${config.apiVersion}` }],
  tags: [{ name: 'Auth', description: 'Authentication & session management' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      ErrorEnvelope: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'VALIDATION_ERROR' },
              message: { type: 'string' },
              details: {},
            },
          },
        },
      },
      AuthPayload: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            properties: {
              user: { type: 'object' },
              tenant: { type: 'object' },
              roles: { type: 'array', items: { type: 'string' } },
              perms: { type: 'array', items: { type: 'string' } },
              accessToken: { type: 'string' },
              refreshToken: { type: 'string' },
              expiresIn: { type: 'integer' },
            },
          },
        },
      },
    },
  },
  paths: {
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a new organization + owner user',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password', 'firstName', 'lastName', 'organizationName'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 8 },
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  organizationName: { type: 'string' },
                  slug: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Created',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthPayload' } } },
          },
          409: { description: 'Email or slug already exists' },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Authenticate and receive access + refresh tokens',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' },
                  tenantId: { type: 'string', format: 'uuid' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'OK',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthPayload' } } },
          },
          401: { description: 'Invalid credentials' },
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Rotate refresh token (cookie or body)',
        responses: { 200: { description: 'OK' }, 401: { description: 'Invalid/expired token' } },
      },
    },
    '/auth/logout': {
      post: { tags: ['Auth'], summary: 'Revoke the current refresh token', responses: { 204: { description: 'No Content' } } },
    },
    '/auth/forgot-password': {
      post: { tags: ['Auth'], summary: 'Request a password reset', responses: { 200: { description: 'OK' } } },
    },
    '/auth/reset-password': {
      post: { tags: ['Auth'], summary: 'Reset password with a token', responses: { 200: { description: 'OK' } } },
    },
    '/auth/verify-email': {
      post: { tags: ['Auth'], summary: 'Verify email with a token', responses: { 200: { description: 'OK' } } },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Current user, tenant, roles and permissions',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'OK' }, 401: { description: 'Unauthorized' } },
      },
    },
    '/auth/sessions': {
      get: {
        tags: ['Auth'],
        summary: 'List active sessions',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/auth/sessions/{id}': {
      delete: {
        tags: ['Auth'],
        summary: 'Revoke a session',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 204: { description: 'No Content' } },
      },
    },
  },
};

/**
 * Register additional OpenAPI paths (and optionally tags) from a feature module.
 * Modules call this at import time so /api/docs stays complete.
 */
export function registerOpenApiPaths(
  paths: Record<string, unknown>,
  tags?: { name: string; description?: string }[],
): void {
  Object.assign(openApiDocument.paths, paths);
  if (tags) {
    for (const tag of tags) {
      if (!openApiDocument.tags.some((t) => t.name === tag.name)) openApiDocument.tags.push(tag);
    }
  }
}
