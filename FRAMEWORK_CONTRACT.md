# FinPay Backend — Framework Contract

**Read this before writing any module.** The foundation (`config`, `infrastructure`, `common`, `modules/auth`) is built and type-checks clean. Every feature module MUST follow these exact patterns and import paths so integration is mechanical. The `auth` module is the reference implementation — copy its structure.

---

## 0. Golden rules

1. **Controllers are thin** — parse the request, call the service, send the envelope. No business logic, no Prisma.
2. **Services hold logic** — transactions, invariants, audit, events. No `req`/`res` in services.
3. **Repositories own all Prisma access** and are **ALWAYS tenant-scoped** (`where: { tenantId, ... }`).
4. **Never use `any`.** Use `unknown` + narrowing, or Zod-inferred types, or Prisma-generated types.
5. **Money** is `Prisma.Decimal` in the DB and in services; **serialize to string** in API responses (`.toString()`). Never `Number()` persisted money.
6. **Every mutating service call writes an `AuditLog`** via `AuditService.record(...)`.
7. **Every endpoint returns the standard envelope** (below). Never `res.json(rawEntity)`.
8. **Never leak internals.** Throw `AppError` subclasses; the error middleware maps them. Unknown errors become a generic 500.

---

## 1. Directory layout for a module

```
src/modules/<module>/
  <module>.routes.ts       Express Router; applies auth + rbac + validate; mounts controller
  <module>.controller.ts   thin: parse req -> service -> envelope
  <module>.service.ts      business logic, transactions, audit, events
  <module>.repository.ts   Prisma access, ALWAYS tenant-scoped
  <module>.dto.ts          Zod schemas (body/query/params) + inferred types
  <module>.mapper.ts       (optional) entity -> API DTO (Decimal->string, omit internals)
```

Mount the router in `src/modules/index.ts` (see §9) and register OpenAPI paths (see §8).

---

## 2. Exact import paths

```ts
// Config
import { config } from '../../config/config';
import { PERMISSIONS, ROLE_KEYS, ERROR_CODES, PAGINATION } from '../../config/constants';

// Infrastructure
import { prisma, Prisma } from '../../infrastructure/prisma';   // Prisma re-exported for enums/types
import { cache } from '../../infrastructure/cache';             // CachePort singleton
import { queue, NOOP_QUEUE } from '../../infrastructure/queue'; // QueuePort singleton
import { logger } from '../../infrastructure/logger/logger';

// HTTP envelope + async wrapper
import { ok, created, noContent, paginated, asyncHandler } from '../../common/http';
import type { PageMeta } from '../../common/http';

// Pagination
import { parsePaging, buildMeta } from '../../common/pagination/pagination';

// Errors (throw these; the error middleware maps them to the envelope)
import {
  BadRequestError, UnauthorizedError, ForbiddenError,
  NotFoundError, ConflictError, ValidationError, UnprocessableError, AppError,
} from '../../common/errors';

// Security
import { hashPassword, comparePassword } from '../../common/security/password';
import { signAccess, verifyAccess, generateRefresh, hashToken, sha256 } from '../../common/security/tokens';

// Middleware
import { requireAuth } from '../../common/middleware/auth.middleware';
import { requireTenant } from '../../common/middleware/tenant.middleware';
import { requirePermission, requireRole } from '../../common/middleware/rbac.middleware';
import { validate } from '../../common/middleware/validate.middleware';
import { idempotency } from '../../common/middleware/idempotency.middleware';
import { AuditService } from '../../common/middleware/audit';
// (rate limiters: apiLimiter is applied globally; authLimiter for auth-like routes)

// OpenAPI
import { registerOpenApiPaths } from '../../openapi';
```

> Paths above are written from a file at `src/modules/<module>/`. Adjust `../../` depth only if you nest deeper.

---

## 3. The response envelope (MANDATORY)

Helpers live in `src/common/http/envelope.ts`:

```ts
ok(res, data, meta?)          // 200 { success:true, data, meta? }
created(res, data)            // 201 { success:true, data }
noContent(res)                // 204 (empty)
paginated(res, items, meta)   // 200 { success:true, data:items, meta:{page,pageSize,total,totalPages} }
```

Error envelope is produced automatically by the error middleware:

```jsonc
{ "success": false, "error": { "code": "NOT_FOUND", "message": "…", "details": {…}? } }
```

Stable error codes: `BAD_REQUEST` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `VALIDATION_ERROR`/`UNPROCESSABLE` (422), `RATE_LIMITED` (429), `INTERNAL` (500).

**Do not build error bodies yourself — throw an `AppError` subclass.**

---

## 4. The request context — `req.ctx`

After `requireAuth` (and `requireTenant`), every request carries:

```ts
req.ctx = { userId: string; tenantId: string; roles: string[]; perms: string[] }
```

- `tenantId` is the tenant from the access-token `tid` claim. **Repositories read `tenantId` from here** (passed in by the service).
- `perms` contains permission keys, or the single wildcard `'*'` for owner/admin.
- Type is augmented globally in `src/types/express.d.ts` — no import needed.

In a controller: `const { userId, tenantId } = req.ctx!;` (it is guaranteed present after `requireAuth`).

---

## 5. Writing a repository (tenant scoping is non-negotiable)

**Every** query filters by `tenantId`. Accept an optional transaction client so services can compose.

```ts
// <module>.repository.ts
import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '../../infrastructure/prisma';

type Db = PrismaClient | Prisma.TransactionClient;

export const invoiceRepository = {
  findById(tenantId: string, id: string, db: Db = prisma) {
    return db.invoice.findFirst({ where: { id, tenantId } }); // findFirst, not findUnique — tenant guard
  },

  list(tenantId: string, args: { skip: number; take: number; status?: string }, db: Db = prisma) {
    const where: Prisma.InvoiceWhereInput = { tenantId, deletedAt: null };
    if (args.status) where.status = args.status;
    return db.invoice.findMany({ where, skip: args.skip, take: args.take, orderBy: { createdAt: 'desc' } });
  },

  count(tenantId: string, where: Prisma.InvoiceWhereInput = {}, db: Db = prisma) {
    return db.invoice.count({ where: { tenantId, deletedAt: null, ...where } });
  },

  create(tenantId: string, data: Omit<Prisma.InvoiceUncheckedCreateInput, 'tenantId'>, db: Db = prisma) {
    return db.invoice.create({ data: { ...data, tenantId } });
  },

  update(tenantId: string, id: string, data: Prisma.InvoiceUpdateInput, db: Db = prisma) {
    // updateMany so the tenantId is part of the WHERE (updateUnique can't be tenant-scoped).
    return db.invoice.updateMany({ where: { id, tenantId }, data });
  },
};
```

Rules:
- Use `findFirst`/`updateMany`/`deleteMany` with `tenantId` in `where` — **never** `findUnique({ where: { id } })` for tenant data (it bypasses the tenant guard).
- Filter soft-deleted rows with `deletedAt: null` where the model has `deletedAt`.
- Transactions: `prisma.$transaction(async (tx) => { await repo.create(tenantId, …, tx); … })`.

---

## 6. Writing a service (logic + audit + transactions)

```ts
// <module>.service.ts
import { prisma, Prisma } from '../../infrastructure/prisma';
import { NotFoundError } from '../../common/errors';
import { AuditService } from '../../common/middleware/audit';
import { invoiceRepository as repo } from './invoice.repository';

export const invoiceService = {
  async get(tenantId: string, id: string) {
    const inv = await repo.findById(tenantId, id);
    if (!inv) throw new NotFoundError('Invoice not found');
    return inv;
  },

  async create(ctx: { tenantId: string; userId: string; ip?: string | null; userAgent?: string | null },
               input: CreateInvoiceInput) {
    const created = await prisma.$transaction(async (tx) => {
      const inv = await repo.create(ctx.tenantId, { /* … Decimals via new Prisma.Decimal('…') … */ }, tx);
      await AuditService.record(
        { tenantId: ctx.tenantId, userId: ctx.userId, action: 'create', module: 'invoice',
          entityType: 'invoice', entityId: inv.id, after: inv, ip: ctx.ip, userAgent: ctx.userAgent },
        tx, // pass tx to make the audit row atomic with the operation
      );
      return inv;
    });
    return created;
  },
};
```

**`AuditService.record` signature:**

```ts
AuditService.record(input: {
  tenantId?: string | null;
  userId?: string | null;
  action: string;      // 'create' | 'update' | 'delete' | 'post' | 'approve' | ...
  module: string;      // 'invoice' | 'ledger' | 'payment' | ...
  entityType?: string | null;
  entityId?: string | null;
  before?: unknown;    // JSON-serialized automatically (Decimals/Dates handled)
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}, tx?: Prisma.TransactionClient): Promise<void>
```

- Without `tx`, audit failures are logged and swallowed (never break the business op).
- With `tx`, the audit row is part of your transaction and a failure rolls it back.
- Convenience: `AuditService.fromRequest(req, { action, module, entityType, entityId, after })` fills `ip`/`userAgent`/`tenantId`/`userId` from `req`.

**Money:** build Decimals with `new Prisma.Decimal('123.4500')`. Enforce ledger invariant `Σdebit === Σcredit` in the service before posting.

---

## 7. Writing routes (auth + rbac + validate + idempotency)

```ts
// <module>.routes.ts
import { Router } from 'express';
import { asyncHandler } from '../../common/http';
import { requireAuth } from '../../common/middleware/auth.middleware';
import { requireTenant } from '../../common/middleware/tenant.middleware';
import { requirePermission } from '../../common/middleware/rbac.middleware';
import { validate } from '../../common/middleware/validate.middleware';
import { idempotency } from '../../common/middleware/idempotency.middleware';
import { invoiceController } from './invoice.controller';
import { createInvoiceSchema, listInvoiceQuerySchema, idParamSchema } from './invoice.dto';

export const invoiceRouter: Router = Router();

// All invoice routes require an authenticated tenant user.
invoiceRouter.use(requireAuth, requireTenant);

invoiceRouter.get(
  '/',
  requirePermission('invoice:read'),
  validate(listInvoiceQuerySchema, 'query'),
  asyncHandler(invoiceController.list),
);

invoiceRouter.get(
  '/:id',
  requirePermission('invoice:read'),
  validate(idParamSchema, 'params'),
  asyncHandler(invoiceController.get),
);

invoiceRouter.post(
  '/',
  requirePermission('invoice:create'),
  idempotency(),                       // dedupe via Idempotency-Key header (money/post/create)
  validate(createInvoiceSchema),
  asyncHandler(invoiceController.create),
);
```

Middleware order per route: **`requireAuth` → `requireTenant` → `requirePermission(...)` → `idempotency()` (mutations only) → `validate(schema, target)` → `asyncHandler(handler)`.**

- Apply `idempotency()` on POST payment / invoice-post / journal-post / any money-moving mutation.
- `validate(schema, 'body' | 'query' | 'params')` — after it runs, read the typed value from `req.body` / `req.query` / `req.params`.
- Permission keys MUST exist in `PERMISSIONS` (`src/config/constants.ts`). Add new ones there if your resource is new.

**Controller pattern:**

```ts
// <module>.controller.ts
import type { Request, Response } from 'express';
import { ok, created, paginated } from '../../common/http';
import { parsePaging, buildMeta } from '../../common/pagination/pagination';
import { invoiceService } from './invoice.service';

export const invoiceController = {
  async list(req: Request, res: Response) {
    const { tenantId } = req.ctx!;
    const paging = parsePaging(req);
    const [items, total] = await invoiceService.list(tenantId, paging);
    paginated(res, items.map(toApi), buildMeta(total, paging));
  },
  async get(req: Request, res: Response) {
    const { tenantId } = req.ctx!;
    ok(res, toApi(await invoiceService.get(tenantId, req.params.id)));
  },
  async create(req: Request, res: Response) {
    const { tenantId, userId } = req.ctx!;
    const inv = await invoiceService.create(
      { tenantId, userId, ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null },
      req.body,
    );
    created(res, toApi(inv));
  },
};
```

`toApi` is your mapper: convert every `Decimal` field with `.toString()`, drop internal fields.

---

## 8. Adding OpenAPI paths

At the bottom of `<module>.routes.ts` (or a `<module>.openapi.ts`), register your paths so `/api/docs` stays complete:

```ts
import { registerOpenApiPaths } from '../../openapi';

registerOpenApiPaths(
  {
    '/invoices': {
      get: { tags: ['Invoices'], summary: 'List invoices', security: [{ bearerAuth: [] }],
             responses: { 200: { description: 'OK' } } },
      post: { tags: ['Invoices'], summary: 'Create invoice', security: [{ bearerAuth: [] }],
              responses: { 201: { description: 'Created' } } },
    },
  },
  [{ name: 'Invoices', description: 'Accounts receivable — invoices' }],
);
```

Paths are relative to the API base (`/api/v1`), i.e. write `/invoices`, not `/api/v1/invoices`.

---

## 9. Mounting the module

In `src/modules/index.ts`, inside the marked block:

```ts
import { invoiceRouter } from './invoice/invoice.routes';
apiRouter.use('/invoices', invoiceRouter);
```

That's it — `app.ts` already applies helmet/cors/compression/cookie-parser/pino-http, the global rate limiter, `/health`, Swagger at `/api/docs`, and the 404 + error handler (registered LAST). Do not re-register those.

---

## 10. COPY-THIS skeleton — a generic tenant-scoped CRUD module

Replace `Widget`/`widget` with your entity. Assumes a Prisma model `Widget` with `id`, `tenantId`, `name`, `deletedAt`.

**`widget.dto.ts`**
```ts
import { z } from 'zod';
export const createWidgetSchema = z.object({ name: z.string().trim().min(1).max(200) });
export const updateWidgetSchema = createWidgetSchema.partial();
export const listWidgetQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().trim().optional(),
});
export const idParamSchema = z.object({ id: z.string().uuid() });
export type CreateWidgetInput = z.infer<typeof createWidgetSchema>;
export type UpdateWidgetInput = z.infer<typeof updateWidgetSchema>;
```

**`widget.repository.ts`**
```ts
import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '../../infrastructure/prisma';
type Db = PrismaClient | Prisma.TransactionClient;

export const widgetRepository = {
  findById(tenantId: string, id: string, db: Db = prisma) {
    return db.widget.findFirst({ where: { id, tenantId, deletedAt: null } });
  },
  list(tenantId: string, a: { skip: number; take: number; q?: string }, db: Db = prisma) {
    const where: Prisma.WidgetWhereInput = { tenantId, deletedAt: null };
    if (a.q) where.name = { contains: a.q, mode: 'insensitive' };
    return db.widget.findMany({ where, skip: a.skip, take: a.take, orderBy: { createdAt: 'desc' } });
  },
  count(tenantId: string, q: string | undefined, db: Db = prisma) {
    const where: Prisma.WidgetWhereInput = { tenantId, deletedAt: null };
    if (q) where.name = { contains: q, mode: 'insensitive' };
    return db.widget.count({ where });
  },
  create(tenantId: string, data: { name: string }, db: Db = prisma) {
    return db.widget.create({ data: { ...data, tenantId } });
  },
  update(tenantId: string, id: string, data: Prisma.WidgetUpdateInput, db: Db = prisma) {
    return db.widget.updateMany({ where: { id, tenantId, deletedAt: null }, data });
  },
  softDelete(tenantId: string, id: string, db: Db = prisma) {
    return db.widget.updateMany({ where: { id, tenantId, deletedAt: null }, data: { deletedAt: new Date() } });
  },
};
```

**`widget.mapper.ts`**
```ts
import type { Widget } from '@prisma/client';
export function toWidgetApi(w: Widget) {
  return { id: w.id, name: w.name, createdAt: w.createdAt.toISOString(), updatedAt: w.updatedAt.toISOString() };
  // For Decimal fields: amount: w.amount.toString()
}
```

**`widget.service.ts`**
```ts
import { prisma } from '../../infrastructure/prisma';
import { NotFoundError } from '../../common/errors';
import { AuditService } from '../../common/middleware/audit';
import { widgetRepository as repo } from './widget.repository';
import type { CreateWidgetInput, UpdateWidgetInput } from './widget.dto';

interface Ctx { tenantId: string; userId: string; ip?: string | null; userAgent?: string | null }

export const widgetService = {
  async list(tenantId: string, p: { skip: number; take: number }, q?: string) {
    const [items, total] = await Promise.all([
      repo.list(tenantId, { ...p, q }),
      repo.count(tenantId, q),
    ]);
    return [items, total] as const;
  },
  async get(tenantId: string, id: string) {
    const w = await repo.findById(tenantId, id);
    if (!w) throw new NotFoundError('Widget not found');
    return w;
  },
  async create(ctx: Ctx, input: CreateWidgetInput) {
    return prisma.$transaction(async (tx) => {
      const w = await repo.create(ctx.tenantId, input, tx);
      await AuditService.record({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'create',
        module: 'widget', entityType: 'widget', entityId: w.id, after: w, ip: ctx.ip, userAgent: ctx.userAgent }, tx);
      return w;
    });
  },
  async update(ctx: Ctx, id: string, input: UpdateWidgetInput) {
    const before = await this.get(ctx.tenantId, id);
    await repo.update(ctx.tenantId, id, input);
    const after = await this.get(ctx.tenantId, id);
    await AuditService.record({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'update',
      module: 'widget', entityType: 'widget', entityId: id, before, after, ip: ctx.ip, userAgent: ctx.userAgent });
    return after;
  },
  async remove(ctx: Ctx, id: string) {
    const before = await this.get(ctx.tenantId, id);
    await repo.softDelete(ctx.tenantId, id);
    await AuditService.record({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'delete',
      module: 'widget', entityType: 'widget', entityId: id, before, ip: ctx.ip, userAgent: ctx.userAgent });
  },
};
```

**`widget.controller.ts`**
```ts
import type { Request, Response } from 'express';
import { ok, created, noContent, paginated } from '../../common/http';
import { parsePaging, buildMeta } from '../../common/pagination/pagination';
import { widgetService } from './widget.service';
import { toWidgetApi } from './widget.mapper';

function ctxOf(req: Request) {
  const { tenantId, userId } = req.ctx!;
  return { tenantId, userId, ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null };
}

export const widgetController = {
  async list(req: Request, res: Response) {
    const { tenantId } = req.ctx!;
    const paging = parsePaging(req);
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const [items, total] = await widgetService.list(tenantId, paging, q);
    paginated(res, items.map(toWidgetApi), buildMeta(total, paging));
  },
  async get(req: Request, res: Response) {
    ok(res, toWidgetApi(await widgetService.get(req.ctx!.tenantId, req.params.id)));
  },
  async create(req: Request, res: Response) {
    created(res, toWidgetApi(await widgetService.create(ctxOf(req), req.body)));
  },
  async update(req: Request, res: Response) {
    ok(res, toWidgetApi(await widgetService.update(ctxOf(req), req.params.id, req.body)));
  },
  async remove(req: Request, res: Response) {
    await widgetService.remove(ctxOf(req), req.params.id);
    noContent(res);
  },
};
```

**`widget.routes.ts`**
```ts
import { Router } from 'express';
import { asyncHandler } from '../../common/http';
import { requireAuth } from '../../common/middleware/auth.middleware';
import { requireTenant } from '../../common/middleware/tenant.middleware';
import { requirePermission } from '../../common/middleware/rbac.middleware';
import { validate } from '../../common/middleware/validate.middleware';
import { registerOpenApiPaths } from '../../openapi';
import { widgetController } from './widget.controller';
import { createWidgetSchema, updateWidgetSchema, listWidgetQuerySchema, idParamSchema } from './widget.dto';

export const widgetRouter: Router = Router();
widgetRouter.use(requireAuth, requireTenant);

widgetRouter.get('/', requirePermission('widget:read'), validate(listWidgetQuerySchema, 'query'), asyncHandler(widgetController.list));
widgetRouter.get('/:id', requirePermission('widget:read'), validate(idParamSchema, 'params'), asyncHandler(widgetController.get));
widgetRouter.post('/', requirePermission('widget:create'), validate(createWidgetSchema), asyncHandler(widgetController.create));
widgetRouter.patch('/:id', requirePermission('widget:update'), validate(idParamSchema, 'params'), validate(updateWidgetSchema), asyncHandler(widgetController.update));
widgetRouter.delete('/:id', requirePermission('widget:delete'), validate(idParamSchema, 'params'), asyncHandler(widgetController.remove));

registerOpenApiPaths(
  { '/widgets': { get: { tags: ['Widgets'], summary: 'List widgets', security: [{ bearerAuth: [] }], responses: { 200: { description: 'OK' } } },
                  post: { tags: ['Widgets'], summary: 'Create widget', security: [{ bearerAuth: [] }], responses: { 201: { description: 'Created' } } } } },
  [{ name: 'Widgets' }],
);
```

**Then in `src/modules/index.ts`:** `apiRouter.use('/widgets', widgetRouter);` and add `widget:*` keys to `PERMISSIONS`.

---

## 11. Verify before you hand off

```bash
cd D:\Products\apps\fintech\backend
npx tsc --noEmit        # MUST be clean
```

- No `any`. No raw `res.json(entity)`. No `findUnique` on tenant data.
- Every mutation: audited + (money) idempotent + validated.
- Decimals serialized to strings in responses.
- Permission keys added to `src/config/constants.ts`.

---

## 12. What the foundation already gives you (do not rebuild)

| Concern | Where | Singleton/Export |
|---|---|---|
| Typed env config | `config/config.ts` | `config` |
| Role keys / permission catalog | `config/constants.ts` | `ROLE_KEYS`, `PERMISSIONS`, `ROLE_PERMISSIONS` |
| Prisma client | `infrastructure/prisma.ts` | `prisma`, `Prisma`, `pingDatabase()` |
| Cache (Redis/in-memory auto) | `infrastructure/cache` | `cache` (`CachePort`) |
| Queue (BullMQ/in-memory auto) | `infrastructure/queue` | `queue` (`QueuePort`), `NOOP_QUEUE` |
| Logger | `infrastructure/logger/logger.ts` | `logger` |
| Errors | `common/errors` | `AppError` + subclasses |
| Envelope + asyncHandler | `common/http` | `ok/created/noContent/paginated/asyncHandler` |
| Pagination | `common/pagination/pagination.ts` | `parsePaging`, `buildMeta` |
| Password + tokens | `common/security` | `hashPassword`, `signAccess`, `generateRefresh`, … |
| Auth / tenant / rbac / validate / idempotency / rate-limit | `common/middleware` | see §2 |
| Audit | `common/middleware/audit.ts` | `AuditService.record` |
| Express `req.ctx` typing | `types/express.d.ts` | (ambient) |
| OpenAPI | `openapi.ts` | `openApiDocument`, `registerOpenApiPaths` |
| App + server | `app.ts`, `server.ts` | `createApp()` |
| Router aggregator | `modules/index.ts` | `apiRouter` |

**Reference implementation:** `src/modules/auth/*` — read it end to end before starting.
