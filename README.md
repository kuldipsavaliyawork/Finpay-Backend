# FinPay — Backend (C2: Node + Express + Prisma)

Enterprise **Accounting & Finance SaaS** backend. Multi-tenant, double-entry
general ledger, RBAC + PBAC, JWT access/refresh rotation, and a full AR/AP/
expense/payment/reporting surface.

## Stack
- **Node + TypeScript (strict)**, **Express 4** (helmet · cors · compression · pino-http)
- **Prisma 5 ORM** → **PostgreSQL** (via Prisma Migrate — not `db push`)
- **Redis / BullMQ** for cache + queue, with a transparent **in-memory fallback**
  when `REDIS_URL` is unset
- **Zod** request validation · **JWT** (access + refresh, sha256-hashed rotation)
  · **bcrypt** hashing · **Swagger UI** at `/api/docs`

## Prerequisites
- **PostgreSQL** running and reachable via `DATABASE_URL`
- **Redis** is optional — omit `REDIS_URL` to run fully in-memory

## Quick start
```bash
npm install
cp .env.example .env          # then set DATABASE_URL (+ JWT secrets)

npm run db:deploy             # apply migrations (prisma migrate deploy)
npm run db:generate          # generate the Prisma client
npm run db:seed              # load the Valoris Fusion demo dataset

npm run dev                   # http://localhost:3030  ·  docs: /api/docs
```
`npm run setup` runs generate + migrate deploy + seed in one step.

Other scripts: `npm run build` · `npm start` · `npm run db:reset` (drop, re-migrate,
reseed — **destructive**) · `npm test`.

## Demo credentials
All demo users share the password **`Password123!`** in tenant
**Valoris Fusion** (rich production seed: full RBAC, AR/AP, banking, deposits):

| Email                          | Role           | Access                         |
|--------------------------------|----------------|--------------------------------|
| `owner@valorisfusion.com`       | Owner          | Full access (`*`)              |
| `admin@valorisfusion.com`       | Administrator  | Full administrative access     |
| `accountant@valorisfusion.com`  | Accountant     | Day-to-day accounting          |
| `approver@valorisfusion.com`    | Approver       | Review & approve documents     |
| `viewer@valorisfusion.com`      | Viewer         | Read-only                      |

```bash
# Log in and call an authenticated endpoint
curl -sX POST localhost:3030/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner@valorisfusion.com","password":"Password123!"}'
```

## API surface (`/api/v1`)
`auth` · `invoices` (AR) · `vendors` (AP) · `reports` (trial balance, balance
sheet, P&L) · `dashboard` (KPI summary + activity). Every response uses the
standard envelope:

```jsonc
// success            { "success": true, "data": … , "meta"?: … }
// paginated list     { "success": true, "data": [ … ], "meta": { page, pageSize, total, totalPages } }
// error              { "success": false, "error": { "code": "…", "message": "…", "details"?: … } }
```

Money (Decimal(18,4)) is serialized to **strings**. Posting any document
(invoice/bill/payment/expense) writes a **balanced** double-entry journal so the
ledger, reports, and dashboard all read from one source of truth.

## Layout
```
prisma/schema.prisma   45 models, multi-tenant (tenantId scalar on every table)
prisma/migrations/     Prisma Migrate history (init already applied)
prisma/seed.ts         Valoris Fusion demo dataset (balanced ledger)
src/config/            typed config (config.ts) + permission catalog (constants.ts)
src/infrastructure/    prisma singleton · cache · queue · logger
src/common/            errors · http envelope · middleware · pagination · security
src/modules/<name>/    routes · controller · service · repository · dto · mapper
src/app.ts             express app factory (helmet → … → routes → docs → errors)
src/server.ts          entry point + graceful shutdown
```
