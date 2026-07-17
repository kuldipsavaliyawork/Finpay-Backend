-- Rename fiscal year → financial year (table, indexes, budget column)

ALTER TABLE "fiscal_years" RENAME TO "financial_years";

ALTER INDEX "fiscal_years_pkey" RENAME TO "financial_years_pkey";
ALTER INDEX "fiscal_years_tenantId_idx" RENAME TO "financial_years_tenantId_idx";
ALTER INDEX "fiscal_years_tenantId_name_key" RENAME TO "financial_years_tenantId_name_key";

ALTER TABLE "budgets" RENAME COLUMN "fiscalYear" TO "financialYear";
