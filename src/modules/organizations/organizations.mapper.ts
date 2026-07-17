import type { Tenant, TenantSettings, FinancialYear, Currency, Department, Branch } from '@prisma/client';

/** Tenant -> API DTO (organization profile). Decimal-free. */
export function toTenantProfileApi(t: Tenant) {
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    legalName: t.legalName,
    email: t.email,
    phone: t.phone,
    taxId: t.taxId,
    baseCurrency: t.baseCurrency,
    country: t.country,
    timezone: t.timezone,
    logoUrl: t.logoUrl,
    status: t.status,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

/** TenantSettings -> API DTO. Decimal-free (all numbering/policy fields are int/JSON). */
export function toTenantSettingsApi(s: TenantSettings) {
  return {
    id: s.id,
    tenantId: s.tenantId,
    invoicePrefix: s.invoicePrefix,
    invoiceNextNumber: s.invoiceNextNumber,
    billPrefix: s.billPrefix,
    billNextNumber: s.billNextNumber,
    journalPrefix: s.journalPrefix,
    journalNextNumber: s.journalNextNumber,
    paymentPrefix: s.paymentPrefix,
    paymentNextNumber: s.paymentNextNumber,
    passwordPolicy: s.passwordPolicy,
    lockoutThreshold: s.lockoutThreshold,
    lockoutMinutes: s.lockoutMinutes,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

export function toFinancialYearApi(f: FinancialYear) {
  return {
    id: f.id,
    name: f.name,
    startDate: f.startDate.toISOString(),
    endDate: f.endDate.toISOString(),
    status: f.status,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  };
}

/** Currency -> API DTO. `rate` is a Decimal(18,6) — serialized to a string. */
export function toCurrencyApi(c: Currency) {
  return {
    id: c.id,
    code: c.code,
    name: c.name,
    symbol: c.symbol,
    rate: c.rate.toString(),
    isBase: c.isBase,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export function toDepartmentApi(d: Department) {
  return {
    id: d.id,
    name: d.name,
    code: d.code,
    managerId: d.managerId,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

export function toBranchApi(b: Branch) {
  return {
    id: b.id,
    name: b.name,
    code: b.code,
    address: b.address,
    city: b.city,
    country: b.country,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}
