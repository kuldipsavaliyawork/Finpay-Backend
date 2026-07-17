import { Router } from 'express';
import { authRouter } from './auth/auth.routes';
import { organizationsRouter } from './organizations/organizations.routes';
import { usersRouter } from './users/users.routes';
import { rbacRouter } from './rbac/rbac.routes';
import { accountsRouter } from './accounts/accounts.routes';
import { journalEntriesRouter } from './journal-entries/journal-entries.routes';
import { customersRouter } from './customers/customers.routes';
import { vendorsRouter } from './vendors/vendors.routes';
import { invoicesRouter } from './invoices/invoices.routes';
import { billsRouter } from './bills/bills.routes';
import { expenseCategoriesRouter, expensesRouter } from './expenses/expenses.routes';
import { bankAccountsRouter, bankTransactionsRouter, reconciliationsRouter } from './banking/banking.routes';
import { depositAccountsRouter, transfersRouter } from './deposit-accounts/deposit-accounts.routes';
import { paymentsRouter } from './payments/payments.routes';
import { taxRouter } from './tax/tax.routes';
import { budgetsRouter } from './budgets/budgets.routes';
import { approvalsRouter } from './approvals/approvals.routes';
import { notificationsRouter } from './notifications/notifications.routes';
import { auditRouter } from './audit/audit.routes';
import { reportsRouter } from './reports/reports.routes';
import { dashboardRouter } from './dashboard/dashboard.routes';
import { publicRouter } from './public/public.routes';

/**
 * API v1 router aggregator. Mounts every feature module under /api/v1.
 * Importing each module's routes also triggers its registerOpenApiPaths(...)
 * side-effect so /api/docs stays complete.
 */
export const apiRouter: Router = Router();

apiRouter.use('/public', publicRouter);

// Identity, org & access
apiRouter.use('/auth', authRouter);
apiRouter.use('/organizations', organizationsRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/rbac', rbacRouter);

// Accounting core
apiRouter.use('/accounts', accountsRouter);
apiRouter.use('/journal-entries', journalEntriesRouter);

// AR / AP
apiRouter.use('/customers', customersRouter);
apiRouter.use('/vendors', vendorsRouter);
apiRouter.use('/invoices', invoicesRouter);
apiRouter.use('/bills', billsRouter);

// Spend & money movement
apiRouter.use('/expense-categories', expenseCategoriesRouter);
apiRouter.use('/expenses', expensesRouter);
apiRouter.use('/bank-accounts', bankAccountsRouter);
apiRouter.use('/bank-transactions', bankTransactionsRouter);
apiRouter.use('/reconciliations', reconciliationsRouter);
apiRouter.use('/payments', paymentsRouter);

// Digital banking — customer deposit accounts & internal transfers
apiRouter.use('/deposit-accounts', depositAccountsRouter);
apiRouter.use('/transfers', transfersRouter);

// Config & planning
apiRouter.use('/tax', taxRouter);
apiRouter.use('/budgets', budgetsRouter);
apiRouter.use('/approvals', approvalsRouter);

// Ops & insight
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/audit', auditRouter);
apiRouter.use('/reports', reportsRouter);
apiRouter.use('/dashboard', dashboardRouter);
