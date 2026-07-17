/**
 * Static catalogs shared across the application: role keys and the full
 * permission catalog. Downstream modules reference PERMISSIONS keys in their
 * requirePermission(...) middleware, and the auth register/seed flow uses
 * ROLE_KEYS + ROLE_PERMISSIONS to provision default roles for a new tenant.
 */

export const ROLE_KEYS = {
  OWNER: 'owner',
  ADMIN: 'admin',
  ACCOUNTANT: 'accountant',
  APPROVER: 'approver',
  VIEWER: 'viewer',
} as const;

export type RoleKey = (typeof ROLE_KEYS)[keyof typeof ROLE_KEYS];

export interface PermissionDef {
  readonly key: string;
  readonly resource: string;
  readonly action: string;
  readonly description: string;
}

/**
 * Build a permission definition. key is always `${resource}:${action}`.
 */
function perm(resource: string, action: string, description: string): PermissionDef {
  return { key: `${resource}:${action}`, resource, action, description };
}

/**
 * The authoritative permission catalog. Every requirePermission(key) used
 * anywhere in the app MUST correspond to an entry here (kept in sync by the
 * RBAC seed). Grouped by resource for readability.
 */
export const PERMISSIONS: readonly PermissionDef[] = [
  // Organization / settings
  perm('tenant', 'read', 'View tenant/organization profile'),
  perm('tenant', 'update', 'Update tenant/organization profile'),
  perm('settings', 'read', 'View settings'),
  perm('settings', 'update', 'Update settings'),

  // Users, roles, memberships
  perm('user', 'read', 'View users'),
  perm('user', 'create', 'Invite/create users'),
  perm('user', 'update', 'Update users'),
  perm('user', 'delete', 'Deactivate/remove users'),
  perm('role', 'read', 'View roles'),
  perm('role', 'manage', 'Create/update/assign roles'),

  // Chart of accounts
  perm('account', 'read', 'View chart of accounts'),
  perm('account', 'create', 'Create accounts'),
  perm('account', 'update', 'Update accounts'),
  perm('account', 'delete', 'Delete accounts'),

  // General ledger / journals
  perm('ledger', 'read', 'View journals and ledger'),
  perm('ledger', 'create', 'Create draft journal entries'),
  perm('ledger', 'update', 'Update draft journal entries'),
  perm('ledger', 'post', 'Post journal entries to the ledger'),
  perm('ledger', 'reverse', 'Reverse posted journal entries'),

  // Customers / Vendors
  perm('customer', 'read', 'View customers'),
  perm('customer', 'create', 'Create customers'),
  perm('customer', 'update', 'Update customers'),
  perm('customer', 'delete', 'Delete customers'),
  perm('vendor', 'read', 'View vendors'),
  perm('vendor', 'create', 'Create vendors'),
  perm('vendor', 'update', 'Update vendors'),
  perm('vendor', 'delete', 'Delete vendors'),

  // Invoices (AR)
  perm('invoice', 'read', 'View invoices'),
  perm('invoice', 'create', 'Create invoices'),
  perm('invoice', 'update', 'Update invoices'),
  perm('invoice', 'delete', 'Delete invoices'),
  perm('invoice', 'post', 'Post/finalize invoices'),
  perm('invoice', 'send', 'Send invoices to customers'),

  // Bills (AP)
  perm('bill', 'read', 'View bills'),
  perm('bill', 'create', 'Create bills'),
  perm('bill', 'update', 'Update bills'),
  perm('bill', 'delete', 'Delete bills'),
  perm('bill', 'post', 'Post/approve bills'),

  // Expenses
  perm('expense', 'read', 'View expenses'),
  perm('expense', 'create', 'Create expenses'),
  perm('expense', 'update', 'Update expenses'),
  perm('expense', 'delete', 'Delete expenses'),
  // ── Expenses module additions (approval workflow + categories) ───────────
  perm('expense', 'submit', 'Submit an expense for approval'),
  perm('expense', 'approve', 'Approve a submitted expense (posts to ledger)'),
  perm('expense', 'reject', 'Reject a submitted expense'),
  perm('expensecategory', 'read', 'View expense categories'),
  perm('expensecategory', 'create', 'Create expense categories'),
  perm('expensecategory', 'update', 'Update expense categories'),
  perm('expensecategory', 'delete', 'Delete expense categories'),
  // ── End expenses module additions ─────────────────────────────────────────

  // Payments
  perm('payment', 'read', 'View payments'),
  perm('payment', 'create', 'Record payments'),
  perm('payment', 'delete', 'Void payments'),

  // Banking & reconciliation
  perm('bank', 'read', 'View bank accounts and transactions'),
  perm('bank', 'manage', 'Manage bank accounts and imports'),
  perm('reconciliation', 'read', 'View reconciliations'),
  perm('reconciliation', 'manage', 'Perform reconciliations'),

  // Tax
  perm('tax', 'read', 'View tax rates and groups'),
  perm('tax', 'manage', 'Manage tax rates and groups'),

  // Budgets
  perm('budget', 'read', 'View budgets'),
  perm('budget', 'manage', 'Create/update budgets'),
  // ── Budgets module additions (Budget + BudgetLine CRUD, budget-vs-actual) ──
  perm('budget', 'create', 'Create budgets and budget lines'),
  perm('budget', 'update', 'Update budgets and budget lines'),
  perm('budget', 'delete', 'Delete budgets and budget lines'),
  // ── End budgets module additions ──────────────────────────────────────────

  // Approvals
  perm('approval', 'read', 'View approval requests'),
  perm('approval', 'act', 'Approve/reject approval requests'),

  // Reports
  perm('report', 'read', 'View financial reports'),
  perm('report', 'export', 'Export financial reports'),

  // Audit
  perm('audit', 'read', 'View audit logs'),

  // ── Organizations module (tenant profile/settings, financial years, ─────────
  // ── currencies, departments, branches) ────────────────────────────────────
  perm('financialyear', 'read', 'View financial years'),
  perm('financialyear', 'create', 'Create financial years'),
  perm('financialyear', 'update', 'Update financial years'),
  perm('financialyear', 'delete', 'Delete financial years'),
  perm('currency', 'read', 'View currencies'),
  perm('currency', 'create', 'Create currencies'),
  perm('currency', 'update', 'Update currencies'),
  perm('currency', 'delete', 'Delete currencies'),
  perm('department', 'read', 'View departments'),
  perm('department', 'create', 'Create departments'),
  perm('department', 'update', 'Update departments'),
  perm('department', 'delete', 'Delete departments'),
  perm('branch', 'read', 'View branches'),
  perm('branch', 'create', 'Create branches'),
  perm('branch', 'update', 'Update branches'),
  perm('branch', 'delete', 'Delete branches'),

  // ── Notifications module (in-app notification center) ────────────────────
  perm('notification', 'read', 'View own/tenant notifications'),
  perm('notification', 'update', 'Mark notifications read'),
  perm('notification', 'create', 'Create notifications (internal/service use)'),
  // ── End notifications module ──────────────────────────────────────────────
] as const;

/** Set of all valid permission keys for validation/lookup. */
export const PERMISSION_KEYS: readonly string[] = PERMISSIONS.map((p) => p.key);

/**
 * Default permission grants per role key. `'*'` means all permissions
 * (owner/admin). Downstream RBAC seeding expands these to RolePermission rows.
 */
export const ROLE_PERMISSIONS: Record<RoleKey, readonly string[]> = {
  [ROLE_KEYS.OWNER]: ['*'],
  [ROLE_KEYS.ADMIN]: ['*'],
  [ROLE_KEYS.ACCOUNTANT]: PERMISSIONS.filter(
    (p) => !['user', 'role', 'tenant'].includes(p.resource),
  ).map((p) => p.key),
  [ROLE_KEYS.APPROVER]: [
    'invoice:read',
    'bill:read',
    'expense:read',
    'ledger:read',
    'payment:read',
    'report:read',
    'approval:read',
    'approval:act',
  ],
  [ROLE_KEYS.VIEWER]: PERMISSIONS.filter((p) => p.action === 'read').map((p) => p.key),
};

/** Human-readable default role definitions for seeding. */
export const DEFAULT_ROLES: ReadonlyArray<{ key: RoleKey; name: string; description: string }> = [
  { key: ROLE_KEYS.OWNER, name: 'Owner', description: 'Full access; tenant owner' },
  { key: ROLE_KEYS.ADMIN, name: 'Administrator', description: 'Full administrative access' },
  { key: ROLE_KEYS.ACCOUNTANT, name: 'Accountant', description: 'Day-to-day accounting operations' },
  { key: ROLE_KEYS.APPROVER, name: 'Approver', description: 'Reviews and approves documents' },
  { key: ROLE_KEYS.VIEWER, name: 'Viewer', description: 'Read-only access' },
];

/** Stable error-code strings used in the error envelope. */
export const ERROR_CODES = {
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNPROCESSABLE: 'UNPROCESSABLE',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Header used for idempotent POST endpoints. */
export const IDEMPOTENCY_HEADER = 'idempotency-key';

/** Default pagination bounds. */
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
} as const;
