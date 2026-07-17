/**
 * FinPay production demo seed — tenant "Valoris Fusion"
 *
 * A complete, ledger-balanced dataset that exercises every major product surface:
 * RBAC (all 5 roles), org structure, COA, tax groups, AR/AP, expenses, banking
 * reconciliation, budgets, approvals, deposit accounts & transfers, notifications.
 *
 * Customers & vendors mix realistic Indian (GST) and foreign (UAE, US, UK, EU,
 * Singapore, Japan) counterparties with proper addresses, phones, and currencies.
 *
 * Login password for all users: Password123!
 *   owner@valorisfusion.com        → Owner
 *   admin@valorisfusion.com        → Administrator
 *   accountant@valorisfusion.com   → Accountant
 *   approver@valorisfusion.com     → Approver
 *   viewer@valorisfusion.com       → Viewer
 *
 * Run: npx prisma db seed   (or: npm run db:seed)
 *
 * Backup of prior seed: prisma/backups/seed.backup-20260717.ts
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { hashPassword } from '../src/common/security/password';
import {
  PERMISSIONS,
  DEFAULT_ROLES,
  ROLE_PERMISSIONS,
  ROLE_KEYS,
} from '../src/config/constants';

const prisma = new PrismaClient();
const DEMO_PASSWORD = 'Password123!';
const ANCHOR = new Date('2026-07-15T00:00:00.000Z');

function daysAgo(n: number): Date {
  const d = new Date(ANCHOR);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}
function daysAhead(n: number): Date {
  return daysAgo(-n);
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** FK-safe wipe — fully re-runnable including digital-banking tables. */
async function clean(): Promise<void> {
  await prisma.depositTransaction.deleteMany();
  await prisma.transfer.deleteMany();
  await prisma.depositAccount.deleteMany();
  await prisma.paymentAllocation.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoiceItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.billItem.deleteMany();
  await prisma.bill.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.expenseCategory.deleteMany();
  await prisma.budgetLine.deleteMany();
  await prisma.budget.deleteMany();
  await prisma.approvalStep.deleteMany();
  await prisma.approvalRequest.deleteMany();
  await prisma.bankTransaction.deleteMany();
  await prisma.reconciliation.deleteMany();
  await prisma.bankAccount.deleteMany();
  await prisma.journalLine.deleteMany();
  await prisma.journalEntry.deleteMany();
  await prisma.taxGroupRate.deleteMany();
  await prisma.taxGroup.deleteMany();
  await prisma.taxRate.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.account.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.document.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.userSession.deleteMany();
  await prisma.loginAttempt.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.emailVerificationToken.deleteMany();
  await prisma.mfaConfig.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.role.deleteMany();
  await prisma.tenantSettings.deleteMany();
  await prisma.financialYear.deleteMany();
  await prisma.currency.deleteMany();
  await prisma.department.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.permission.deleteMany();
}

/** Expanded small-business COA used across AR/AP/banking/reports. */
const COA: Array<{
  code: string;
  name: string;
  type: string;
  subtype?: string;
  isSystem?: boolean;
  opening?: number;
}> = [
  { code: '1000', name: 'Cash on Hand', type: 'asset', subtype: 'cash', isSystem: true, opening: 85_000 },
  { code: '1010', name: 'HDFC Current Account', type: 'asset', subtype: 'bank', isSystem: true, opening: 2_450_000 },
  { code: '1020', name: 'ICICI Sweep Account', type: 'asset', subtype: 'bank', opening: 500_000 },
  { code: '1200', name: 'Accounts Receivable', type: 'asset', subtype: 'accounts_receivable', isSystem: true },
  { code: '1250', name: 'Input GST Receivable', type: 'asset', subtype: 'tax_receivable', isSystem: true },
  { code: '1300', name: 'Prepaid Expenses', type: 'asset', subtype: 'current_asset', opening: 48_000 },
  { code: '1500', name: 'Office Equipment', type: 'asset', subtype: 'fixed_asset', opening: 420_000 },
  { code: '1510', name: 'Accumulated Depreciation', type: 'asset', subtype: 'contra_asset', opening: 0 },
  { code: '2000', name: 'Accounts Payable', type: 'liability', subtype: 'accounts_payable', isSystem: true },
  { code: '2100', name: 'Output GST Payable', type: 'liability', subtype: 'tax_payable', isSystem: true },
  { code: '2200', name: 'Salaries Payable', type: 'liability', subtype: 'current_liability' },
  { code: '2300', name: 'Unearned Revenue', type: 'liability', subtype: 'current_liability' },
  { code: '3000', name: "Owner's Equity", type: 'equity', subtype: 'equity', opening: 3_000_000 },
  { code: '3100', name: 'Retained Earnings', type: 'equity', subtype: 'equity' },
  { code: '4000', name: 'Consulting Revenue', type: 'income', subtype: 'operating_income' },
  { code: '4100', name: 'Implementation Revenue', type: 'income', subtype: 'operating_income' },
  { code: '4200', name: 'Support & Retainers', type: 'income', subtype: 'operating_income' },
  { code: '4300', name: 'Other Income', type: 'income', subtype: 'other_income' },
  { code: '5000', name: 'Cost of Delivery', type: 'expense', subtype: 'cogs' },
  { code: '5100', name: 'Salaries & Wages', type: 'expense', subtype: 'operating_expense' },
  { code: '5200', name: 'Office Rent', type: 'expense', subtype: 'operating_expense' },
  { code: '5300', name: 'Utilities & Internet', type: 'expense', subtype: 'operating_expense' },
  { code: '5400', name: 'Marketing & Advertising', type: 'expense', subtype: 'operating_expense' },
  { code: '5500', name: 'Software & SaaS', type: 'expense', subtype: 'operating_expense' },
  { code: '5600', name: 'Travel & Conveyance', type: 'expense', subtype: 'operating_expense' },
  { code: '5700', name: 'Professional Fees', type: 'expense', subtype: 'operating_expense' },
  { code: '5800', name: 'Bank Charges', type: 'expense', subtype: 'operating_expense' },
];

async function main(): Promise<void> {
  console.log('🌱  Seeding FinPay production demo…');
  await clean();

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  // ── Permissions ───────────────────────────────────────────────────────────
  await prisma.permission.createMany({
    data: PERMISSIONS.map((p) => ({
      key: p.key,
      resource: p.resource,
      action: p.action,
      description: p.description,
    })),
    skipDuplicates: true,
  });
  const allPerms = await prisma.permission.findMany();
  const permByKey = new Map(allPerms.map((p) => [p.key, p.id]));

  // ── Tenant ────────────────────────────────────────────────────────────────
  const tenant = await prisma.tenant.create({
    data: {
      name: 'Valoris Fusion',
      slug: 'valoris-fusion',
      legalName: 'Valoris Fusion Private Limited',
      email: 'hello@valorisfusion.com',
      phone: '+91 22 4000 1234',
      taxId: '27AABCV1234A1Z5',
      baseCurrency: 'INR',
      country: 'IN',
      timezone: 'Asia/Kolkata',
      status: 'active',
    },
  });
  await prisma.tenantSettings.create({ data: { tenantId: tenant.id } });

  await prisma.currency.createMany({
    data: [
      { tenantId: tenant.id, code: 'INR', name: 'Indian Rupee', symbol: '₹', rate: 1, isBase: true },
      { tenantId: tenant.id, code: 'USD', name: 'US Dollar', symbol: '$', rate: new Prisma.Decimal('0.012') },
      { tenantId: tenant.id, code: 'EUR', name: 'Euro', symbol: '€', rate: new Prisma.Decimal('0.011') },
      { tenantId: tenant.id, code: 'GBP', name: 'British Pound', symbol: '£', rate: new Prisma.Decimal('0.0094') },
      { tenantId: tenant.id, code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', rate: new Prisma.Decimal('0.044') },
      { tenantId: tenant.id, code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', rate: new Prisma.Decimal('0.016') },
    ],
  });

  await prisma.financialYear.create({
    data: {
      tenantId: tenant.id,
      name: 'FY2026-27',
      startDate: new Date('2026-04-01'),
      endDate: new Date('2027-03-31'),
      status: 'open',
    },
  });

  const [opsDept, salesDept, financeDept, engDept] = await Promise.all(
    [
      { name: 'Operations', code: 'OPS' },
      { name: 'Sales & Marketing', code: 'SNM' },
      { name: 'Finance', code: 'FIN' },
      { name: 'Engineering', code: 'ENG' },
    ].map((d) => prisma.department.create({ data: { tenantId: tenant.id, ...d } })),
  );

  await prisma.branch.createMany({
    data: [
      {
        tenantId: tenant.id,
        name: 'Mumbai HQ',
        code: 'BOM',
        address: '12th Floor, Peninsula Business Park, Lower Parel, Mumbai 400013',
        city: 'Mumbai',
        country: 'IN',
      },
      {
        tenantId: tenant.id,
        name: 'Bengaluru Studio',
        code: 'BLR',
        address: '3rd Floor, Prestige Tech Park, Marathahalli Bridge, Bengaluru 560037',
        city: 'Bengaluru',
        country: 'IN',
      },
      {
        tenantId: tenant.id,
        name: 'Dubai Branch',
        code: 'DXB',
        address: 'Office 2408, Grosvenor House, Dubai International Financial Centre',
        city: 'Dubai',
        country: 'AE',
      },
      {
        tenantId: tenant.id,
        name: 'Singapore Desk',
        code: 'SIN',
        address: 'Level 21, Asia Square Tower 1, 8 Marina View, Singapore 018960',
        city: 'Singapore',
        country: 'SG',
      },
    ],
  });

  // ── Roles ─────────────────────────────────────────────────────────────────
  const roleIdByKey = new Map<string, string>();
  for (const def of DEFAULT_ROLES) {
    const role = await prisma.role.create({
      data: {
        tenantId: tenant.id,
        key: def.key,
        name: def.name,
        description: def.description,
        isSystem: true,
      },
    });
    roleIdByKey.set(def.key, role.id);
    const grants = ROLE_PERMISSIONS[def.key];
    const permIds = grants.includes('*')
      ? allPerms.map((p) => p.id)
      : grants.map((k) => permByKey.get(k)).filter((id): id is string => Boolean(id));
    if (permIds.length > 0) {
      await prisma.rolePermission.createMany({
        data: permIds.map((permissionId) => ({ roleId: role.id, permissionId })),
        skipDuplicates: true,
      });
    }
  }

  // ── Users (all 5 roles) ───────────────────────────────────────────────────
  const demoUsers: Array<{ email: string; firstName: string; lastName: string; role: string }> = [
    { email: 'owner@valorisfusion.com', firstName: 'Aarav', lastName: 'Mehta', role: ROLE_KEYS.OWNER },
    { email: 'admin@valorisfusion.com', firstName: 'Priya', lastName: 'Nair', role: ROLE_KEYS.ADMIN },
    { email: 'accountant@valorisfusion.com', firstName: 'Diya', lastName: 'Sharma', role: ROLE_KEYS.ACCOUNTANT },
    { email: 'approver@valorisfusion.com', firstName: 'Rohan', lastName: 'Kapoor', role: ROLE_KEYS.APPROVER },
    { email: 'viewer@valorisfusion.com', firstName: 'Kabir', lastName: 'Rao', role: ROLE_KEYS.VIEWER },
  ];

  const userByEmail = new Map<string, string>();
  for (const u of demoUsers) {
    const user = await prisma.user.create({
      data: {
        email: u.email,
        passwordHash,
        firstName: u.firstName,
        lastName: u.lastName,
        status: 'active',
        emailVerifiedAt: new Date(),
        tenantId: tenant.id,
      },
    });
    userByEmail.set(u.email, user.id);
    const membership = await prisma.membership.create({
      data: { tenantId: tenant.id, userId: user.id, status: 'active' },
    });
    await prisma.userRole.create({
      data: { membershipId: membership.id, roleId: roleIdByKey.get(u.role)! },
    });
  }
  const ownerId = userByEmail.get('owner@valorisfusion.com')!;
  const adminId = userByEmail.get('admin@valorisfusion.com')!;
  const accountantId = userByEmail.get('accountant@valorisfusion.com')!;
  const approverId = userByEmail.get('approver@valorisfusion.com')!;
  const viewerId = userByEmail.get('viewer@valorisfusion.com')!;

  await prisma.department.update({ where: { id: financeDept.id }, data: { managerId: ownerId } });
  await prisma.department.update({ where: { id: salesDept.id }, data: { managerId: adminId } });
  await prisma.department.update({ where: { id: engDept.id }, data: { managerId: accountantId } });
  await prisma.department.update({ where: { id: opsDept.id }, data: { managerId: approverId } });

  // ── Chart of accounts + opening JV ────────────────────────────────────────
  const acctByCode = new Map<string, string>();
  for (const a of COA) {
    const created = await prisma.account.create({
      data: {
        tenantId: tenant.id,
        code: a.code,
        name: a.name,
        type: a.type,
        subtype: a.subtype ?? null,
        isSystem: a.isSystem ?? false,
        openingBalance: a.opening ?? 0,
        currency: 'INR',
      },
    });
    acctByCode.set(a.code, created.id);
  }

  const opExParent = await prisma.account.create({
    data: {
      tenantId: tenant.id,
      code: '5050',
      name: 'Operating Expenses',
      type: 'expense',
      subtype: 'operating_expense',
      currency: 'INR',
    },
  });
  acctByCode.set('5050', opExParent.id);
  for (const code of ['5100', '5200', '5300', '5400', '5500', '5600', '5700']) {
    await prisma.account.update({
      where: { id: acctByCode.get(code)! },
      data: { parentId: opExParent.id },
    });
  }

  const openingLines: Array<{
    tenantId: string;
    accountId: string;
    debit: number;
    credit: number;
    description: string;
  }> = [];
  let openingDebit = 0;
  let openingCredit = 0;
  for (const a of COA) {
    if (!a.opening) continue;
    const accountId = acctByCode.get(a.code)!;
    if (a.type === 'asset' || a.type === 'expense') {
      openingLines.push({
        tenantId: tenant.id,
        accountId,
        debit: a.opening,
        credit: 0,
        description: 'Opening balance',
      });
      openingDebit += a.opening;
    } else {
      openingLines.push({
        tenantId: tenant.id,
        accountId,
        debit: 0,
        credit: a.opening,
        description: 'Opening balance',
      });
      openingCredit += a.opening;
    }
  }
  const openingDiff = openingDebit - openingCredit;
  if (openingDiff !== 0) {
    openingLines.push({
      tenantId: tenant.id,
      accountId: acctByCode.get('3100')!,
      debit: openingDiff < 0 ? -openingDiff : 0,
      credit: openingDiff > 0 ? openingDiff : 0,
      description: 'Opening equity plug',
    });
  }
  await prisma.journalEntry.create({
    data: {
      tenantId: tenant.id,
      number: 'JV-000001',
      date: new Date('2026-04-01'),
      memo: 'Opening balances FY2026-27',
      status: 'posted',
      source: 'opening',
      postedAt: new Date('2026-04-01'),
      lines: { createMany: { data: openingLines } },
    },
  });

  // ── Tax rates + groups ────────────────────────────────────────────────────
  const gst18Out = await prisma.taxRate.create({
    data: { tenantId: tenant.id, name: 'GST 18% (Output)', rate: 18, kind: 'output', region: 'IN' },
  });
  const gst12Out = await prisma.taxRate.create({
    data: { tenantId: tenant.id, name: 'GST 12% (Output)', rate: 12, kind: 'output', region: 'IN' },
  });
  const gst5Out = await prisma.taxRate.create({
    data: { tenantId: tenant.id, name: 'GST 5% (Output)', rate: 5, kind: 'output', region: 'IN' },
  });
  const gst18In = await prisma.taxRate.create({
    data: { tenantId: tenant.id, name: 'GST 18% (Input)', rate: 18, kind: 'input', region: 'IN' },
  });
  const gst12In = await prisma.taxRate.create({
    data: { tenantId: tenant.id, name: 'GST 12% (Input)', rate: 12, kind: 'input', region: 'IN' },
  });

  const stdGstGroup = await prisma.taxGroup.create({
    data: { tenantId: tenant.id, name: 'Standard GST (Output)' },
  });
  const inputGstGroup = await prisma.taxGroup.create({
    data: { tenantId: tenant.id, name: 'Input GST (Purchase)' },
  });
  await prisma.taxGroupRate.createMany({
    data: [
      { groupId: stdGstGroup.id, rateId: gst18Out.id },
      { groupId: stdGstGroup.id, rateId: gst12Out.id },
      { groupId: stdGstGroup.id, rateId: gst5Out.id },
      { groupId: inputGstGroup.id, rateId: gst18In.id },
      { groupId: inputGstGroup.id, rateId: gst12In.id },
    ],
  });

  // ── Customers (Indian + foreign) ──────────────────────────────────────────
  type CustomerDef = {
    name: string;
    displayName?: string;
    email: string;
    phone: string;
    taxId: string;
    billingAddress: string;
    currency: string;
    creditLimit: number;
    paymentTerms: number;
    notes: string;
  };

  const customerDefs: CustomerDef[] = [
    // ── India ───────────────────────────────────────────────────────────────
    {
      name: 'Meridian Retail India Pvt Ltd',
      displayName: 'Meridian Retail',
      email: 'accounts.payable@meridianretail.in',
      phone: '+91 22 6120 4500',
      taxId: '27AABCM4821A1Z8',
      billingAddress: 'Plot C-21, Bandra Kurla Complex, Bandra East, Mumbai 400051, Maharashtra, India',
      currency: 'INR',
      creditLimit: 1_500_000,
      paymentTerms: 30,
      notes: 'National retail chain — monthly consulting retainer (GST registered, MH).',
    },
    {
      name: 'Infobahn Technologies Ltd',
      displayName: 'Infobahn Tech',
      email: 'finance@infobahn.co.in',
      phone: '+91 80 4567 2100',
      taxId: '29AABCI7392B1Z3',
      billingAddress: 'Bagmane Tech Park, C.V. Raman Nagar, Bengaluru 560093, Karnataka, India',
      currency: 'INR',
      creditLimit: 800_000,
      paymentTerms: 45,
      notes: 'Bengaluru SaaS product company — ERP implementation & integrations.',
    },
    {
      name: 'Deccan Foods & Spices Pvt Ltd',
      displayName: 'Deccan Foods',
      email: 'ap@deccanfoods.com',
      phone: '+91 44 2827 6600',
      taxId: '33AABCD5510C1Z6',
      billingAddress: 'No. 47, Mount Road, Guindy Industrial Estate, Chennai 600032, Tamil Nadu, India',
      currency: 'INR',
      creditLimit: 600_000,
      paymentTerms: 30,
      notes: 'FMCG distributor — warehouse & distribution ERP support.',
    },
    {
      name: 'Horizon Creative Studio LLP',
      displayName: 'Horizon Creative',
      email: 'billing@horizonstudio.in',
      phone: '+91 11 4055 8890',
      taxId: '07AABCH2248D1Z1',
      billingAddress: 'F-12, Okhla Phase III, New Delhi 110020, India',
      currency: 'INR',
      creditLimit: 400_000,
      paymentTerms: 15,
      notes: 'Delhi creative agency — campaign analytics retainers.',
    },
    {
      name: 'Atlas Engineering Works Pvt Ltd',
      displayName: 'Atlas Engineering',
      email: 'accounts@atlaseng.in',
      phone: '+91 79 2658 1122',
      taxId: '24AABCA9167F1Z4',
      billingAddress: 'Survey 118, GIDC Vatva Phase IV, Ahmedabad 382445, Gujarat, India',
      currency: 'INR',
      creditLimit: 2_000_000,
      paymentTerms: 60,
      notes: 'Industrial OEM — multi-site digital transformation programme.',
    },
    {
      name: 'CarePlus Multispeciality Hospitals',
      displayName: 'CarePlus Hospitals',
      email: 'cfo.office@careplushospitals.in',
      phone: '+91 20 6725 3000',
      taxId: '27AABCC3085G1Z9',
      billingAddress: 'Survey No. 15, Baner Road, Pune 411045, Maharashtra, India',
      currency: 'INR',
      creditLimit: 1_200_000,
      paymentTerms: 45,
      notes: 'Healthcare group — compliance reporting & patient-data platform.',
    },
    // ── Foreign ─────────────────────────────────────────────────────────────
    {
      name: 'Pacific Trade Partners LLC',
      displayName: 'Pacific Trade (UAE)',
      email: 'ap@pacifictrade.ae',
      phone: '+971 4 369 8200',
      taxId: 'TRN-100345678900003',
      billingAddress: 'Office 1802, Emirates Financial Towers, DIFC, Dubai, United Arab Emirates',
      currency: 'AED',
      creditLimit: 750_000,
      paymentTerms: 30,
      notes: 'GCC trading house — regional go-to-market advisory (export of services).',
    },
    {
      name: 'Northstar Analytics Inc',
      displayName: 'Northstar Analytics',
      email: 'accounts.payable@northstaranalytics.com',
      phone: '+1 512 555 0148',
      taxId: 'EIN 84-2917463',
      billingAddress: '600 Congress Ave, Suite 1400, Austin, TX 78701, United States',
      currency: 'USD',
      creditLimit: 950_000,
      paymentTerms: 45,
      notes: 'US analytics SaaS — product analytics & data-platform engagement.',
    },
    {
      name: 'Sterling Capital Advisors Ltd',
      displayName: 'Sterling Capital',
      email: 'finance@sterlingcapital.co.uk',
      phone: '+44 20 7946 0958',
      taxId: 'GB 884 2917 63',
      billingAddress: '25 Copthall Avenue, London EC2R 7BP, United Kingdom',
      currency: 'GBP',
      creditLimit: 700_000,
      paymentTerms: 30,
      notes: 'UK advisory firm — reporting automation & board dashboards.',
    },
    {
      name: 'Rhine Digital GmbH',
      displayName: 'Rhine Digital',
      email: 'buchhaltung@rhinedigital.de',
      phone: '+49 30 5678 4410',
      taxId: 'DE813492671',
      billingAddress: 'Friedrichstraße 123, 10117 Berlin, Germany',
      currency: 'EUR',
      creditLimit: 650_000,
      paymentTerms: 30,
      notes: 'Berlin digital agency — EU market entry & localisation programme.',
    },
    {
      name: 'Harbour Bay Logistics Pte Ltd',
      displayName: 'Harbour Bay Logistics',
      email: 'ap@harbourbay.sg',
      phone: '+65 6911 2740',
      taxId: 'UEN 201934567K',
      billingAddress: '10 Marina Boulevard, #18-01 Marina Bay Financial Centre, Singapore 018983',
      currency: 'SGD',
      creditLimit: 900_000,
      paymentTerms: 30,
      notes: 'Singapore 3PL — WMS ↔ ERP integration and control-tower build.',
    },
    {
      name: 'Sakura Commerce Co Ltd',
      displayName: 'Sakura Commerce',
      email: 'ap@sakuracommerce.jp',
      phone: '+81 3 6450 2290',
      taxId: 'T9010401123456',
      billingAddress: 'Shibuya Scramble Square 24F, 2-24-12 Shibuya, Tokyo 150-6130, Japan',
      currency: 'USD',
      creditLimit: 550_000,
      paymentTerms: 45,
      notes: 'Tokyo e-commerce operator — billed in USD for cross-border services.',
    },
  ];

  const customers = await Promise.all(
    customerDefs.map((c) =>
      prisma.customer.create({
        data: {
          tenantId: tenant.id,
          name: c.name,
          displayName: c.displayName ?? c.name,
          email: c.email,
          phone: c.phone,
          taxId: c.taxId,
          billingAddress: c.billingAddress,
          currency: c.currency,
          creditLimit: c.creditLimit,
          paymentTerms: c.paymentTerms,
          notes: c.notes,
          isActive: true,
        },
      }),
    ),
  );

  // ── Vendors (Indian + foreign) ────────────────────────────────────────────
  type VendorDef = {
    name: string;
    displayName?: string;
    email: string;
    phone: string;
    taxId: string;
    address: string;
    currency: string;
    paymentTerms: number;
    notes: string;
  };

  const vendorDefs: VendorDef[] = [
    // ── India ───────────────────────────────────────────────────────────────
    {
      name: 'DataNest Cloud Services Pvt Ltd',
      displayName: 'DataNest Cloud',
      email: 'billing@datanest.in',
      phone: '+91 22 4050 7800',
      taxId: '27AABCD9021A1Z2',
      address: 'Unit 501, Times Square, Andheri Kurla Road, Andheri East, Mumbai 400059, India',
      currency: 'INR',
      paymentTerms: 15,
      notes: 'Preferred cloud hosting & managed Kubernetes — Net 15.',
    },
    {
      name: 'OfficeKart Wholesale Pvt Ltd',
      displayName: 'OfficeKart',
      email: 'orders@officekart.co.in',
      phone: '+91 22 2652 1100',
      taxId: '27AABCO3456B1Z7',
      address: 'Gala 14, Raheja Plaza, Bandra Kurla Complex, Mumbai 400051, India',
      currency: 'INR',
      paymentTerms: 30,
      notes: 'Office stationery & IT peripherals — monthly PO cycle.',
    },
    {
      name: 'PixelCraft Media Pvt Ltd',
      displayName: 'PixelCraft Media',
      email: 'accounts@pixelcraft.media',
      phone: '+91 80 4123 9080',
      taxId: '29AABCP7890C1Z5',
      address: '100 Feet Road, Indiranagar, Bengaluru 560038, Karnataka, India',
      currency: 'INR',
      paymentTerms: 30,
      notes: 'Performance marketing & brand campaigns.',
    },
    {
      name: 'Western Ports Freight Ltd',
      displayName: 'Western Ports Freight',
      email: 'billing@westernports.in',
      phone: '+91 22 2724 5600',
      taxId: '27AABCW2345D1Z0',
      address: 'CFS Complex, JNPT Road, Nhava Sheva, Navi Mumbai 400707, India',
      currency: 'INR',
      paymentTerms: 45,
      notes: 'Port logistics & inland haulage.',
    },
    {
      name: 'Maharashtra Utility Services',
      displayName: 'MH Utility Services',
      email: 'corporate.billing@mhutility.in',
      phone: '+91 22 2642 3000',
      taxId: '27AABCM6789E1Z8',
      address: 'Prakashgad, Bandra East, Mumbai 400051, India',
      currency: 'INR',
      paymentTerms: 15,
      notes: 'Electricity & facility utilities for Mumbai HQ.',
    },
    {
      name: 'Mehta Desai & Associates LLP',
      displayName: 'Mehta Desai LLP',
      email: 'invoices@mehtadesai.com',
      phone: '+91 22 2282 4455',
      taxId: '27AABCM0123F1Z6',
      address: '4th Floor, Express Towers, Nariman Point, Mumbai 400021, India',
      currency: 'INR',
      paymentTerms: 30,
      notes: 'Corporate counsel — retainers & transaction advisory.',
    },
    {
      name: 'HireBridge Talent Solutions',
      displayName: 'HireBridge',
      email: 'billing@hirebridge.in',
      phone: '+91 22 6749 1200',
      taxId: '27AABCH4567G1Z4',
      address: 'Hiranandani Gardens, Powai, Mumbai 400076, India',
      currency: 'INR',
      paymentTerms: 30,
      notes: 'Contingent staffing & executive search.',
    },
    // ── Foreign ─────────────────────────────────────────────────────────────
    {
      name: 'Stripe Payments Europe Ltd',
      displayName: 'Stripe',
      email: 'invoices@stripe.com',
      phone: '+353 1 903 9500',
      taxId: 'IE 3206488LH',
      address: '1 Grand Canal Street Lower, Dublin 2, D02 P820, Ireland',
      currency: 'USD',
      paymentTerms: 15,
      notes: 'Payment processing fees — billed in USD.',
    },
    {
      name: 'Amazon Web Services Singapore',
      displayName: 'AWS Singapore',
      email: 'aws-billing@amazon.com',
      phone: '+65 6820 7000',
      taxId: 'UEN 201516846R',
      address: '23 Church Street, Capital Square #10-01, Singapore 049481',
      currency: 'USD',
      paymentTerms: 30,
      notes: 'Cloud infrastructure (ap-southeast-1) — USD billing.',
    },
    {
      name: 'WeWork UK Ltd',
      displayName: 'WeWork London',
      email: 'billing@wework.com',
      phone: '+44 20 7199 9000',
      taxId: 'GB 227 3192 17',
      address: '1 St Katharine\'s Way, London E1W 1UN, United Kingdom',
      currency: 'GBP',
      paymentTerms: 30,
      notes: 'Flexible workspace — London client meetings.',
    },
  ];

  const vendors = await Promise.all(
    vendorDefs.map((v) =>
      prisma.vendor.create({
        data: {
          tenantId: tenant.id,
          name: v.name,
          displayName: v.displayName ?? v.name,
          email: v.email,
          phone: v.phone,
          taxId: v.taxId,
          address: v.address,
          currency: v.currency,
          paymentTerms: v.paymentTerms,
          notes: v.notes,
          isActive: true,
        },
      }),
    ),
  );

  // ── Journal helper ────────────────────────────────────────────────────────
  let jvSeq = 2;
  async function postJournal(args: {
    date: Date;
    memo: string;
    source: string;
    sourceId: string;
    lines: Array<{ code: string; debit?: number; credit?: number; description?: string }>;
  }): Promise<string> {
    const lines = args.lines.map((l) => ({
      tenantId: tenant.id,
      accountId: acctByCode.get(l.code)!,
      debit: new Prisma.Decimal(round4(l.debit ?? 0)),
      credit: new Prisma.Decimal(round4(l.credit ?? 0)),
      description: l.description ?? args.memo,
    }));
    const totalDebit = lines.reduce((s, l) => s + Number(l.debit), 0);
    const totalCredit = lines.reduce((s, l) => s + Number(l.credit), 0);
    if (round4(totalDebit) !== round4(totalCredit)) {
      throw new Error(`Unbalanced journal "${args.memo}": ${totalDebit} != ${totalCredit}`);
    }
    const entry = await prisma.journalEntry.create({
      data: {
        tenantId: tenant.id,
        number: `JV-${String(jvSeq++).padStart(6, '0')}`,
        date: args.date,
        memo: args.memo,
        status: 'posted',
        source: args.source,
        sourceId: args.sourceId,
        postedAt: args.date,
        lines: { createMany: { data: lines } },
      },
    });
    return entry.id;
  }

  // ── Invoices (20) — multi-line where useful ───────────────────────────────
  type SeededInvoice = {
    id: string;
    customerId: string;
    total: number;
    amountPaid: number;
    balanceDue: number;
    status: string;
    issueDate: Date;
  };
  const invStatuses = [
    'paid', 'sent', 'partial', 'overdue', 'draft',
    'paid', 'sent', 'paid', 'overdue', 'sent',
    'paid', 'partial', 'sent', 'paid', 'draft',
    'paid', 'sent', 'overdue', 'partial', 'paid',
  ] as const;

  const invDescriptions = [
    ['Strategy retainer — monthly', 'Executive workshop facilitation'],
    ['ERP discovery & blueprinting'],
    ['Cloud migration wave-1 delivery', 'Change-management coaching'],
    ['Analytics dashboard build'],
    ['Support retainer — Q2'],
    ['Data platform design sprint'],
    ['Compliance readiness assessment'],
    ['Integration connectors (WMS↔ERP)'],
  ];

  const seededInvoices: SeededInvoice[] = [];
  let invSeq = 1;
  for (let i = 0; i < invStatuses.length; i++) {
    const status = invStatuses[i]!;
    const customer = customers[i % customers.length]!;
    const descs = invDescriptions[i % invDescriptions.length]!;
    const isDomestic = customer.currency === 'INR';
    const taxRate = isDomestic ? (i % 5 === 0 ? gst12Out : gst18Out) : null;
    const taxPct = taxRate ? Number(taxRate.rate) : 0;
    // Domestic invoices stay in ₹; foreign export invoices use smaller FX amounts.
    const priceBase = isDomestic ? 35_000 : customer.currency === 'JPY' ? 80_000 : 420;
    const priceStep = isDomestic ? 12_500 : 85;

    const items = descs.map((description, li) => {
      const qty = 1 + ((i + li) % 3);
      const unitPrice = priceBase + ((i * 3 + li) % 7) * priceStep;
      const lineSub = qty * unitPrice;
      return { description, qty, unitPrice, lineSub };
    });
    const subtotal = items.reduce((s, it) => s + it.lineSub, 0);
    const taxTotal = round4(subtotal * (taxPct / 100));
    const total = round4(subtotal + taxTotal);
    const amountPaid =
      status === 'paid' ? total : status === 'partial' ? round4(total * 0.45) : 0;
    const balanceDue = round4(total - amountPaid);
    const issue = daysAgo(50 - i * 2);
    const revenueCode = i % 4 === 0 ? '4100' : i % 4 === 1 ? '4200' : '4000';

    const invoice = await prisma.invoice.create({
      data: {
        tenantId: tenant.id,
        number: `INV-${String(invSeq++).padStart(6, '0')}`,
        customerId: customer.id,
        status,
        issueDate: issue,
        dueDate: status === 'overdue' ? daysAgo(12 + (i % 5)) : daysAhead(customer.paymentTerms),
        currency: customer.currency,
        subtotal,
        taxTotal,
        total,
        amountPaid,
        balanceDue,
        notes: isDomestic
          ? 'Payment due as per agreed terms. Thank you for partnering with Valoris Fusion.'
          : 'Export of services — zero-rated for GST. Payable in invoice currency.',
        terms: isDomestic
          ? `Net ${customer.paymentTerms} days · Bank NEFT/RTGS preferred`
          : `Net ${customer.paymentTerms} days · Wire transfer in ${customer.currency}`,
        sentAt: status === 'draft' ? null : issue,
        items: {
          create: items.map((it, li) => ({
            tenantId: tenant.id,
            description: it.description,
            quantity: it.qty,
            unitPrice: it.unitPrice,
            taxRateId: taxRate?.id ?? null,
            taxAmount: round4(it.lineSub * (taxPct / 100)),
            lineTotal: it.lineSub,
            accountId: acctByCode.get(revenueCode)!,
            sortOrder: li,
          })),
        },
      },
    });

    if (status !== 'draft') {
      const jeLines: Array<{ code: string; debit?: number; credit?: number; description?: string }> = [
        { code: '1200', debit: total, description: 'Accounts receivable' },
        { code: revenueCode, credit: subtotal, description: 'Revenue' },
      ];
      if (taxTotal > 0) {
        jeLines.push({ code: '2100', credit: taxTotal, description: 'Output GST' });
      }
      const jeId = await postJournal({
        date: issue,
        memo: `Invoice ${invoice.number} — ${customer.name}`,
        source: 'invoice',
        sourceId: invoice.id,
        lines: jeLines,
      });
      await prisma.invoice.update({ where: { id: invoice.id }, data: { journalEntryId: jeId } });
    }

    seededInvoices.push({
      id: invoice.id,
      customerId: customer.id,
      total,
      amountPaid,
      balanceDue,
      status,
      issueDate: issue,
    });
  }

  // ── Bills (14) ────────────────────────────────────────────────────────────
  type SeededBill = {
    id: string;
    vendorId: string;
    total: number;
    balanceDue: number;
    status: string;
  };
  const billStatuses = [
    'paid', 'pending', 'approved', 'overdue', 'paid',
    'pending', 'approved', 'paid', 'overdue', 'approved',
    'draft', 'paid', 'partial', 'approved',
  ] as const;
  const billExpenseCodes = ['5000', '5200', '5300', '5400', '5500', '5700', '5700'];
  const seededBills: SeededBill[] = [];
  let billSeq = 1;

  for (let i = 0; i < billStatuses.length; i++) {
    const status = billStatuses[i]!;
    const vendor = vendors[i % vendors.length]!;
    const isDomestic = vendor.currency === 'INR';
    const subtotal = isDomestic ? 12_000 + (i % 6) * 8_500 : 180 + (i % 6) * 95;
    const taxPct = isDomestic ? 0.18 : 0;
    const taxTotal = round4(subtotal * taxPct);
    const total = round4(subtotal + taxTotal);
    const amountPaid =
      status === 'paid' ? total : status === 'partial' ? round4(total * 0.5) : 0;
    const balanceDue = round4(total - amountPaid);
    const issue = daysAgo(42 - i * 2);
    const expenseCode = billExpenseCodes[i % billExpenseCodes.length]!;

    const bill = await prisma.bill.create({
      data: {
        tenantId: tenant.id,
        number: `BILL-${String(billSeq++).padStart(6, '0')}`,
        vendorId: vendor.id,
        status,
        issueDate: issue,
        dueDate: status === 'overdue' ? daysAgo(7) : daysAhead(vendor.paymentTerms),
        currency: vendor.currency,
        subtotal,
        taxTotal,
        total,
        amountPaid,
        balanceDue,
        notes: `${vendor.name} — ${expenseCode === '5700' ? 'professional services' : 'operating spend'}`,
        items: {
          create: [
            {
              tenantId: tenant.id,
              description: `${vendor.name} services`,
              quantity: 1,
              unitPrice: subtotal,
              taxRateId: isDomestic ? gst18In.id : null,
              taxAmount: taxTotal,
              lineTotal: subtotal,
              accountId: acctByCode.get(expenseCode)!,
            },
          ],
        },
      },
    });

    if (!['pending', 'draft'].includes(status)) {
      const jeLines: Array<{ code: string; debit?: number; credit?: number; description?: string }> = [
        { code: expenseCode, debit: subtotal, description: 'Expense' },
        { code: '2000', credit: total, description: 'Accounts payable' },
      ];
      if (taxTotal > 0) {
        jeLines.splice(1, 0, { code: '1250', debit: taxTotal, description: 'Input GST' });
      }
      const jeId = await postJournal({
        date: issue,
        memo: `Bill ${bill.number} — ${vendor.name}`,
        source: 'bill',
        sourceId: bill.id,
        lines: jeLines,
      });
      await prisma.bill.update({ where: { id: bill.id }, data: { journalEntryId: jeId } });
    }

    seededBills.push({ id: bill.id, vendorId: vendor.id, total, balanceDue, status });
  }

  // ── Expense categories + expenses ─────────────────────────────────────────
  const catDefs = [
    { name: 'Office Rent', code: '5200' },
    { name: 'Utilities', code: '5300' },
    { name: 'Marketing', code: '5400' },
    { name: 'Software & SaaS', code: '5500' },
    { name: 'Travel', code: '5600' },
    { name: 'Professional Fees', code: '5700' },
  ];
  const cats = await Promise.all(
    catDefs.map((c) =>
      prisma.expenseCategory.create({
        data: { tenantId: tenant.id, name: c.name, accountId: acctByCode.get(c.code)! },
      }),
    ),
  );

  const expStatuses = [
    'approved', 'pending', 'approved', 'reimbursed', 'rejected',
    'approved', 'pending', 'approved', 'reimbursed', 'approved',
    'draft', 'approved', 'pending', 'reimbursed', 'approved',
    'approved', 'rejected', 'approved', 'pending', 'reimbursed',
    'approved', 'approved', 'pending', 'approved',
  ] as const;

  const deptIds = [opsDept.id, salesDept.id, financeDept.id, engDept.id];
  for (let i = 0; i < expStatuses.length; i++) {
    const status = expStatuses[i]!;
    const catIdx = i % cats.length;
    const cat = cats[catIdx]!;
    const expenseCode = catDefs[catIdx]!.code;
    const amount = 2_500 + (i % 8) * 1_750;
    const taxAmount = round4(amount * 0.18);
    const date = daysAgo(35 - i);
    const method = i % 3 === 0 ? 'cash' : i % 3 === 1 ? 'card' : 'bank';

    const expense = await prisma.expense.create({
      data: {
        tenantId: tenant.id,
        reference: `EXP-${String(i + 1).padStart(4, '0')}`,
        categoryId: cat.id,
        vendorId: vendors[i % vendors.length]!.id,
        departmentId: deptIds[i % deptIds.length],
        date,
        amount,
        taxAmount,
        currency: 'INR',
        description: `${cat.name} — ${status === 'reimbursed' ? 'employee claim' : 'company paid'}`,
        status,
        paymentMethod: method,
        isReimbursable: status === 'reimbursed' || i % 7 === 0,
        createdBy: i % 2 === 0 ? accountantId : ownerId,
      },
    });

    if (status === 'approved' || status === 'reimbursed') {
      const creditCode = method === 'cash' ? '1000' : '1010';
      const jeId = await postJournal({
        date,
        memo: `Expense ${expense.reference} — ${cat.name}`,
        source: 'expense',
        sourceId: expense.id,
        lines: [
          { code: expenseCode, debit: amount, description: cat.name },
          { code: '1250', debit: taxAmount, description: 'Input GST' },
          { code: creditCode, credit: round4(amount + taxAmount), description: 'Paid' },
        ],
      });
      await prisma.expense.update({ where: { id: expense.id }, data: { journalEntryId: jeId } });
    }
  }

  const reimbursedExpenses = await prisma.expense.findMany({
    where: { tenantId: tenant.id, status: 'reimbursed' },
    select: { id: true, reference: true },
  });
  for (const exp of reimbursedExpenses) {
    await prisma.expense.update({
      where: { id: exp.id },
      data: { receiptUrl: `/uploads/receipts/${exp.reference.toLowerCase()}.pdf` },
    });
  }

  // ── Bank accounts ─────────────────────────────────────────────────────────
  const hdfc = await prisma.bankAccount.create({
    data: {
      tenantId: tenant.id,
      accountId: acctByCode.get('1010')!,
      name: 'HDFC Current — ****4821',
      bankName: 'HDFC Bank',
      accountNumber: 'XXXXXXXX4821',
      type: 'bank',
      currency: 'INR',
      currentBalance: 2_450_000,
    },
  });
  const icici = await prisma.bankAccount.create({
    data: {
      tenantId: tenant.id,
      accountId: acctByCode.get('1020')!,
      name: 'ICICI Sweep — ****9104',
      bankName: 'ICICI Bank',
      accountNumber: 'XXXXXXXX9104',
      type: 'bank',
      currency: 'INR',
      currentBalance: 500_000,
    },
  });
  await prisma.bankAccount.create({
    data: {
      tenantId: tenant.id,
      accountId: acctByCode.get('1000')!,
      name: 'Petty Cash — Mumbai HQ',
      type: 'cash',
      currency: 'INR',
      currentBalance: 85_000,
    },
  });

  // ── Payments + allocations ────────────────────────────────────────────────
  // Spread dates across ~5 months so the dashboard monthly trend chart is filled.
  let paySeq = 1;
  let inboundIdx = 0;
  let outboundIdx = 0;
  const nextPayNumber = () => `PAY-${String(paySeq++).padStart(6, '0')}`;
  /** Stagger ~every 22 days so bars land in different months (Feb–Jul). */
  const spreadPaymentDate = (index: number, offsetDays: number) =>
    daysAgo(offsetDays + index * 22);

  for (const inv of seededInvoices.filter((x) => x.status === 'paid' || x.status === 'partial')) {
    const allocated = inv.status === 'paid' ? inv.total : inv.amountPaid;
    if (allocated <= 0) continue;
    const payDate = spreadPaymentDate(inboundIdx++, 8);
    const payment = await prisma.payment.create({
      data: {
        tenantId: tenant.id,
        number: nextPayNumber(),
        direction: 'inbound',
        customerId: inv.customerId,
        bankAccountId: hdfc.id,
        date: payDate,
        amount: allocated,
        currency: 'INR',
        method: 'bank',
        reference: `NEFT-IN-${1000 + paySeq}`,
        status: 'completed',
        notes: 'Customer receipt',
      },
    });
    await prisma.paymentAllocation.create({
      data: {
        tenantId: tenant.id,
        paymentId: payment.id,
        invoiceId: inv.id,
        amount: allocated,
      },
    });
    const jeId = await postJournal({
      date: payment.date,
      memo: `Receipt ${payment.number}`,
      source: 'payment',
      sourceId: payment.id,
      lines: [
        { code: '1010', debit: allocated, description: 'Bank receipt' },
        { code: '1200', credit: allocated, description: 'Clear AR' },
      ],
    });
    await prisma.payment.update({ where: { id: payment.id }, data: { journalEntryId: jeId } });
  }

  for (const bill of seededBills.filter((b) => b.status === 'paid' || b.status === 'partial')) {
    const allocated = bill.status === 'paid' ? bill.total : round4(bill.total * 0.5);
    const payDate = spreadPaymentDate(outboundIdx++, 18);
    const payment = await prisma.payment.create({
      data: {
        tenantId: tenant.id,
        number: nextPayNumber(),
        direction: 'outbound',
        vendorId: bill.vendorId,
        bankAccountId: hdfc.id,
        date: payDate,
        amount: allocated,
        currency: 'INR',
        method: 'upi',
        reference: `UPI-OUT-${2000 + paySeq}`,
        status: 'completed',
      },
    });
    await prisma.paymentAllocation.create({
      data: {
        tenantId: tenant.id,
        paymentId: payment.id,
        billId: bill.id,
        amount: allocated,
      },
    });
    const jeId = await postJournal({
      date: payment.date,
      memo: `Vendor payment ${payment.number}`,
      source: 'payment',
      sourceId: payment.id,
      lines: [
        { code: '2000', debit: allocated, description: 'Clear AP' },
        { code: '1010', credit: allocated, description: 'Bank payment' },
      ],
    });
    await prisma.payment.update({ where: { id: payment.id }, data: { journalEntryId: jeId } });
  }

  // ── Bank statement lines + reconciliation ─────────────────────────────────
  const inboundPayments = await prisma.payment.findMany({
    where: { tenantId: tenant.id, direction: 'inbound' },
    orderBy: { date: 'asc' },
    take: 8,
  });
  const outboundPayments = await prisma.payment.findMany({
    where: { tenantId: tenant.id, direction: 'outbound' },
    orderBy: { date: 'asc' },
    take: 6,
  });
  const matchedExpenses = await prisma.expense.findMany({
    where: { tenantId: tenant.id, status: { in: ['approved', 'reimbursed'] } },
    orderBy: { date: 'desc' },
    take: 4,
  });

  const bankTxns: Prisma.BankTransactionCreateManyInput[] = [];
  for (let i = 0; i < 18; i++) {
    const credit = i % 3 !== 2;
    const amount = round4((credit ? 1 : -1) * (22_000 + i * 4_100));
    let matchedType: string | undefined;
    let matchedId: string | undefined;
    if (i < 10) {
      if (credit && inboundPayments.length > 0) {
        matchedType = 'payment';
        matchedId = inboundPayments[i % inboundPayments.length]!.id;
      } else if (!credit && outboundPayments.length > 0 && i % 2 === 0) {
        matchedType = 'payment';
        matchedId = outboundPayments[Math.floor(i / 3) % outboundPayments.length]!.id;
      } else if (!credit && matchedExpenses.length > 0) {
        matchedType = 'expense';
        matchedId = matchedExpenses[i % matchedExpenses.length]!.id;
      }
    }
    bankTxns.push({
      tenantId: tenant.id,
      bankAccountId: hdfc.id,
      date: daysAgo(28 - i),
      description: credit
        ? `NEFT receipt — customer ${((i % customers.length) + 1)}`
        : `Vendor / expense payment ${i + 1}`,
      reference: `STMT-${String(i + 1).padStart(4, '0')}`,
      amount,
      type: credit ? 'credit' : 'debit',
      status: matchedType ? 'matched' : 'unmatched',
      matchedType,
      matchedId,
    });
  }
  for (let i = 0; i < 8; i++) {
    const credit = i % 2 === 0;
    const amount = round4((credit ? 1 : -1) * (15_000 + i * 3_200));
    bankTxns.push({
      tenantId: tenant.id,
      bankAccountId: icici.id,
      date: daysAgo(20 - i),
      description: credit ? `Sweep interest credit ${i + 1}` : `Sweep transfer out ${i + 1}`,
      reference: `ICICI-${String(i + 1).padStart(4, '0')}`,
      amount,
      type: credit ? 'credit' : 'debit',
      status: i < 3 ? 'matched' : 'unmatched',
      matchedType: i < 3 && inboundPayments[i] ? 'payment' : undefined,
      matchedId: i < 3 && inboundPayments[i] ? inboundPayments[i]!.id : undefined,
    });
  }
  await prisma.bankTransaction.createMany({ data: bankTxns });

  await prisma.reconciliation.create({
    data: {
      tenantId: tenant.id,
      bankAccountId: hdfc.id,
      statementDate: daysAgo(1),
      statementBalance: 2_387_500,
      bookBalance: 2_450_000,
      difference: round4(2_387_500 - 2_450_000),
      status: 'in_progress',
      createdBy: accountantId,
    },
  });
  await prisma.reconciliation.create({
    data: {
      tenantId: tenant.id,
      bankAccountId: icici.id,
      statementDate: daysAgo(30),
      statementBalance: 500_000,
      bookBalance: 500_000,
      difference: 0,
      status: 'completed',
      completedAt: daysAgo(28),
      createdBy: accountantId,
    },
  });

  // ── Deposit accounts (digital banking wedge) ──────────────────────────────
  const depositDefs: Array<{
    customerIdx: number;
    type: 'savings' | 'current';
    accountNumber: string;
    opening: number;
  }> = [
    { customerIdx: 0, type: 'current', accountNumber: 'AC-10010001', opening: 250_000 },
    { customerIdx: 0, type: 'savings', accountNumber: 'AC-10010002', opening: 75_000 },
    { customerIdx: 1, type: 'current', accountNumber: 'AC-10020001', opening: 180_000 },
    { customerIdx: 5, type: 'current', accountNumber: 'AC-10060001', opening: 520_000 },
    { customerIdx: 6, type: 'savings', accountNumber: 'AC-10070001', opening: 95_000 },
  ];

  const depositAccounts = [];
  for (const d of depositDefs) {
    const da = await prisma.depositAccount.create({
      data: {
        tenantId: tenant.id,
        customerId: customers[d.customerIdx]!.id,
        accountNumber: d.accountNumber,
        type: d.type,
        currency: 'INR',
        balance: d.opening,
        status: 'active',
        openedAt: daysAgo(90),
      },
    });
    depositAccounts.push(da);
    await prisma.depositTransaction.create({
      data: {
        tenantId: tenant.id,
        depositAccountId: da.id,
        date: daysAgo(90),
        type: 'credit',
        amount: d.opening,
        balanceAfter: d.opening,
        description: 'Account opening deposit',
        reference: `OPEN-${d.accountNumber}`,
      },
    });
  }

  // Sample activity on first current account
  const primary = depositAccounts[0]!;
  let bal = Number(primary.balance);
  const activity: Array<{ days: number; type: 'credit' | 'debit'; amount: number; desc: string }> = [
    { days: 60, type: 'credit', amount: 40_000, desc: 'Inbound wire — project milestone' },
    { days: 45, type: 'debit', amount: 12_500, desc: 'ATM / cash withdrawal' },
    { days: 30, type: 'credit', amount: 22_000, desc: 'UPI collection' },
    { days: 14, type: 'debit', amount: 8_750, desc: 'Vendor settlement' },
  ];
  for (const a of activity) {
    bal = a.type === 'credit' ? bal + a.amount : bal - a.amount;
    await prisma.depositTransaction.create({
      data: {
        tenantId: tenant.id,
        depositAccountId: primary.id,
        date: daysAgo(a.days),
        type: a.type,
        amount: a.amount,
        balanceAfter: bal,
        description: a.desc,
      },
    });
  }
  await prisma.depositAccount.update({
    where: { id: primary.id },
    data: { balance: bal },
  });

  // Internal transfer between Meridian Retail deposit accounts
  const fromAcc = depositAccounts[0]!;
  const toAcc = depositAccounts[1]!;
  const xferAmt = 15_000;
  const fromBal = Number(fromAcc.id === primary.id ? bal : fromAcc.balance) - xferAmt;
  const toBal = Number(toAcc.balance) + xferAmt;
  const transfer = await prisma.transfer.create({
    data: {
      tenantId: tenant.id,
      fromAccountId: fromAcc.id,
      toAccountId: toAcc.id,
      amount: xferAmt,
      currency: 'INR',
      reference: 'XFER-0001',
      description: 'Internal sweep to savings',
      status: 'completed',
      createdBy: ownerId,
      createdAt: daysAgo(10),
    },
  });
  await prisma.depositTransaction.createMany({
    data: [
      {
        tenantId: tenant.id,
        depositAccountId: fromAcc.id,
        date: daysAgo(10),
        type: 'debit',
        amount: xferAmt,
        balanceAfter: fromBal,
        description: 'Transfer out to savings',
        reference: 'XFER-0001',
        transferId: transfer.id,
      },
      {
        tenantId: tenant.id,
        depositAccountId: toAcc.id,
        date: daysAgo(10),
        type: 'credit',
        amount: xferAmt,
        balanceAfter: toBal,
        description: 'Transfer in from current',
        reference: 'XFER-0001',
        transferId: transfer.id,
      },
    ],
  });
  await prisma.depositAccount.update({ where: { id: fromAcc.id }, data: { balance: fromBal } });
  await prisma.depositAccount.update({ where: { id: toAcc.id }, data: { balance: toBal } });

  const frozenAcc = await prisma.depositAccount.create({
    data: {
      tenantId: tenant.id,
      customerId: customers[2]!.id,
      accountNumber: 'AC-10030001',
      type: 'current',
      currency: 'INR',
      balance: 42_000,
      status: 'frozen',
      openedAt: daysAgo(120),
    },
  });
  await prisma.depositTransaction.create({
    data: {
      tenantId: tenant.id,
      depositAccountId: frozenAcc.id,
      date: daysAgo(120),
      type: 'credit',
      amount: 42_000,
      balanceAfter: 42_000,
      description: 'Account opening deposit',
      reference: 'OPEN-AC-10030001',
    },
  });
  const dormantAcc = await prisma.depositAccount.create({
    data: {
      tenantId: tenant.id,
      customerId: customers[3]!.id,
      accountNumber: 'AC-10040001',
      type: 'savings',
      currency: 'INR',
      balance: 18_500,
      status: 'dormant',
      openedAt: daysAgo(400),
    },
  });
  await prisma.depositTransaction.create({
    data: {
      tenantId: tenant.id,
      depositAccountId: dormantAcc.id,
      date: daysAgo(400),
      type: 'credit',
      amount: 18_500,
      balanceAfter: 18_500,
      description: 'Account opening deposit',
      reference: 'OPEN-AC-10040001',
    },
  });
  depositAccounts.push(frozenAcc, dormantAcc);

  // ── Budget ────────────────────────────────────────────────────────────────
  const budget = await prisma.budget.create({
    data: {
      tenantId: tenant.id,
      name: 'Operating Budget FY2026-27',
      financialYear: 'FY2026-27',
      period: 'monthly',
      status: 'active',
    },
  });
  const budgetCodes = ['5100', '5200', '5300', '5400', '5500', '5600', '5700'];
  const budgetMonths = ['2026-04', '2026-05', '2026-06', '2026-07'];
  const budgetLines: Prisma.BudgetLineCreateManyInput[] = [];
  for (const code of budgetCodes) {
    for (const period of budgetMonths) {
      budgetLines.push({
        tenantId: tenant.id,
        budgetId: budget.id,
        accountId: acctByCode.get(code)!,
        period,
        amount: new Prisma.Decimal(40_000 + budgetCodes.indexOf(code) * 15_000),
      });
    }
  }
  await prisma.budgetLine.createMany({ data: budgetLines });

  const draftBudget = await prisma.budget.create({
    data: {
      tenantId: tenant.id,
      name: 'CapEx Budget FY2026-27 (Draft)',
      financialYear: 'FY2026-27',
      period: 'quarterly',
      status: 'draft',
      createdBy: accountantId,
    },
  });
  for (const code of ['1500', '1510']) {
    await prisma.budgetLine.create({
      data: {
        tenantId: tenant.id,
        budgetId: draftBudget.id,
        accountId: acctByCode.get(code)!,
        period: '2026-Q2',
        amount: new Prisma.Decimal(code === '1500' ? 250_000 : 0),
      },
    });
  }

  // ── Manual journal entries (draft / pending) ────────────────────────────────
  const draftJe = await prisma.journalEntry.create({
    data: {
      tenantId: tenant.id,
      number: `JV-${String(jvSeq++).padStart(6, '0')}`,
      date: daysAgo(2),
      memo: 'Month-end rent accrual — draft',
      status: 'draft',
      source: 'manual',
      createdBy: accountantId,
      lines: {
        create: [
          {
            tenantId: tenant.id,
            accountId: acctByCode.get('5200')!,
            debit: 85_000,
            credit: 0,
            description: 'Office rent accrual',
          },
          {
            tenantId: tenant.id,
            accountId: acctByCode.get('2200')!,
            debit: 0,
            credit: 85_000,
            description: 'Accrued rent payable',
          },
        ],
      },
    },
  });
  await prisma.journalEntry.create({
    data: {
      tenantId: tenant.id,
      number: `JV-${String(jvSeq++).padStart(6, '0')}`,
      date: daysAgo(1),
      memo: 'Depreciation adjustment — draft',
      status: 'draft',
      source: 'manual',
      createdBy: accountantId,
      lines: {
        create: [
          {
            tenantId: tenant.id,
            accountId: acctByCode.get('5100')!,
            debit: 12_500,
            credit: 0,
            description: 'Depreciation expense',
          },
          {
            tenantId: tenant.id,
            accountId: acctByCode.get('1510')!,
            debit: 0,
            credit: 12_500,
            description: 'Accumulated depreciation',
          },
        ],
      },
    },
  });
  const pendingJe = await prisma.journalEntry.create({
    data: {
      tenantId: tenant.id,
      number: `JV-${String(jvSeq++).padStart(6, '0')}`,
      date: daysAgo(4),
      memo: 'Year-end bonus accrual — pending approval',
      status: 'pending',
      source: 'manual',
      createdBy: accountantId,
      lines: {
        create: [
          {
            tenantId: tenant.id,
            accountId: acctByCode.get('5100')!,
            debit: 180_000,
            credit: 0,
            description: 'Bonus accrual expense',
          },
          {
            tenantId: tenant.id,
            accountId: acctByCode.get('2200')!,
            debit: 0,
            credit: 180_000,
            description: 'Salaries payable',
          },
        ],
      },
    },
  });

  // ── Approvals ─────────────────────────────────────────────────────────────
  for (const bill of seededBills.filter((b) => b.status === 'pending').slice(0, 3)) {
    const req = await prisma.approvalRequest.create({
      data: {
        tenantId: tenant.id,
        entityType: 'bill',
        status: 'pending',
        currentLevel: 1,
        totalLevels: 1,
        billId: bill.id,
        requestedBy: accountantId,
      },
    });
    await prisma.approvalStep.create({
      data: {
        tenantId: tenant.id,
        requestId: req.id,
        level: 1,
        approverId: approverId,
        status: 'pending',
      },
    });
  }

  const pendingExpense = await prisma.expense.findFirst({
    where: { tenantId: tenant.id, status: 'pending' },
  });
  if (pendingExpense) {
    const req = await prisma.approvalRequest.create({
      data: {
        tenantId: tenant.id,
        entityType: 'expense',
        status: 'pending',
        currentLevel: 1,
        totalLevels: 1,
        expenseId: pendingExpense.id,
        requestedBy: accountantId,
      },
    });
    await prisma.approvalStep.create({
      data: {
        tenantId: tenant.id,
        requestId: req.id,
        level: 1,
        approverId: approverId,
        status: 'pending',
      },
    });
  }

  const approvedExpense = await prisma.expense.findFirst({
    where: { tenantId: tenant.id, status: 'approved' },
  });
  if (approvedExpense) {
    const req = await prisma.approvalRequest.create({
      data: {
        tenantId: tenant.id,
        entityType: 'expense',
        status: 'approved',
        currentLevel: 1,
        totalLevels: 1,
        expenseId: approvedExpense.id,
        requestedBy: accountantId,
      },
    });
    await prisma.approvalStep.create({
      data: {
        tenantId: tenant.id,
        requestId: req.id,
        level: 1,
        approverId: approverId,
        status: 'approved',
        comment: 'Approved — within monthly budget.',
        actedAt: daysAgo(5),
      },
    });
  }

  for (const inv of seededInvoices.filter((x) => x.status === 'sent').slice(0, 2)) {
    const req = await prisma.approvalRequest.create({
      data: {
        tenantId: tenant.id,
        entityType: 'invoice',
        status: 'pending',
        currentLevel: 1,
        totalLevels: 1,
        invoiceId: inv.id,
        requestedBy: accountantId,
      },
    });
    await prisma.approvalStep.create({
      data: {
        tenantId: tenant.id,
        requestId: req.id,
        level: 1,
        approverId: approverId,
        status: 'pending',
      },
    });
  }

  const approvedInvoice = seededInvoices.find((x) => x.status === 'paid');
  if (approvedInvoice) {
    const req = await prisma.approvalRequest.create({
      data: {
        tenantId: tenant.id,
        entityType: 'invoice',
        status: 'approved',
        currentLevel: 1,
        totalLevels: 1,
        invoiceId: approvedInvoice.id,
        requestedBy: accountantId,
      },
    });
    await prisma.approvalStep.create({
      data: {
        tenantId: tenant.id,
        requestId: req.id,
        level: 1,
        approverId: approverId,
        status: 'approved',
        comment: 'Credit terms verified — approved for posting.',
        actedAt: daysAgo(20),
      },
    });
  }

  const journalApprovalReq = await prisma.approvalRequest.create({
    data: {
      tenantId: tenant.id,
      entityType: 'journal',
      status: 'pending',
      currentLevel: 1,
      totalLevels: 1,
      journalId: pendingJe.id,
      requestedBy: accountantId,
    },
  });
  await prisma.approvalStep.create({
    data: {
      tenantId: tenant.id,
      requestId: journalApprovalReq.id,
      level: 1,
      approverId: ownerId,
      status: 'pending',
    },
  });

  // ── Documents ─────────────────────────────────────────────────────────────
  await prisma.document.createMany({
    data: [
      {
        tenantId: tenant.id,
        name: 'INV-000001.pdf',
        mimeType: 'application/pdf',
        size: 128_400,
        storageKey: 'documents/invoices/inv-000001.pdf',
        entityType: 'invoice',
        entityId: seededInvoices[0]!.id,
        uploadedBy: accountantId,
      },
      {
        tenantId: tenant.id,
        name: 'BILL-000002.pdf',
        mimeType: 'application/pdf',
        size: 96_200,
        storageKey: 'documents/bills/bill-000002.pdf',
        entityType: 'bill',
        entityId: seededBills[1]!.id,
        uploadedBy: accountantId,
      },
      {
        tenantId: tenant.id,
        name: 'contract-nimbus-retail.pdf',
        mimeType: 'application/pdf',
        size: 412_800,
        storageKey: 'documents/customers/nimbus-contract.pdf',
        entityType: 'customer',
        entityId: customers[0]!.id,
        uploadedBy: adminId,
      },
      {
        tenantId: tenant.id,
        name: 'vendor-agreement-cloudscale.pdf',
        mimeType: 'application/pdf',
        size: 256_000,
        storageKey: 'documents/vendors/cloudscale-agreement.pdf',
        entityType: 'vendor',
        entityId: vendors[0]!.id,
        uploadedBy: adminId,
      },
    ],
  });

  // ── Notifications ─────────────────────────────────────────────────────────
  await prisma.notification.createMany({
    data: [
      {
        tenantId: tenant.id,
        type: 'invoice_overdue',
        title: 'Overdue invoices need follow-up',
        body: 'Several customer invoices are past due. Review the AR aging report.',
      },
      {
        tenantId: tenant.id,
        userId: approverId,
        type: 'approval_pending',
        title: 'Bills awaiting your approval',
        body: 'You have vendor bills ready for review in the Approvals queue.',
      },
      {
        tenantId: tenant.id,
        type: 'payment_received',
        title: 'Customer receipts posted',
        body: 'Inbound NEFT receipts were allocated to open invoices this week.',
      },
      {
        tenantId: tenant.id,
        userId: accountantId,
        type: 'budget_alert',
        title: 'Marketing nearing budget',
        body: 'Marketing & Advertising spend is approaching the July budget line.',
      },
      {
        tenantId: tenant.id,
        userId: ownerId,
        type: 'reconciliation',
        title: 'HDFC reconciliation in progress',
        body: 'Statement difference of ₹62,500 needs matching before close.',
      },
      {
        tenantId: tenant.id,
        type: 'deposit_activity',
        title: 'Customer deposit transfer completed',
        body: 'Meridian Retail swept ₹15,000 from current to savings.',
      },
      {
        tenantId: tenant.id,
        userId: accountantId,
        type: 'journal_pending',
        title: 'Journal entry awaiting approval',
        body: 'Year-end bonus accrual JV needs owner sign-off before posting.',
        entityType: 'journal',
        entityId: pendingJe.id,
      },
      {
        tenantId: tenant.id,
        userId: adminId,
        type: 'invoice_sent',
        title: 'Invoices sent to customers',
        body: 'Three customer invoices were emailed this week.',
        entityType: 'invoice',
        entityId: seededInvoices.find((x) => x.status === 'sent')?.id ?? seededInvoices[0]!.id,
        readAt: daysAgo(1),
      },
      {
        tenantId: tenant.id,
        userId: viewerId,
        type: 'report_ready',
        title: 'Monthly P&L report available',
        body: 'July profit & loss summary is ready in Financial Reports.',
        readAt: daysAgo(3),
      },
    ],
  });

  await prisma.auditLog.createMany({
    data: [
      {
        tenantId: tenant.id,
        userId: ownerId,
        action: 'seed',
        module: 'system',
        entityType: 'tenant',
        entityId: tenant.id,
        after: { dataset: 'valoris-fusion-production-demo', version: 3 },
      },
      {
        tenantId: tenant.id,
        userId: accountantId,
        action: 'post',
        module: 'ledger',
        entityType: 'journal',
        after: { note: 'Opening + AR/AP/expense/payment journals posted' },
      },
      {
        tenantId: tenant.id,
        userId: accountantId,
        action: 'create',
        module: 'invoice',
        entityType: 'invoice',
        entityId: seededInvoices[0]?.id,
        after: { count: invStatuses.length },
      },
      {
        tenantId: tenant.id,
        userId: accountantId,
        action: 'create',
        module: 'banking',
        entityType: 'deposit_account',
        after: { count: depositAccounts.length },
      },
      {
        tenantId: tenant.id,
        userId: adminId,
        action: 'update',
        module: 'organization',
        entityType: 'department',
        entityId: financeDept.id,
        after: { managerId: ownerId },
      },
      {
        tenantId: tenant.id,
        userId: accountantId,
        action: 'create',
        module: 'bill',
        entityType: 'bill',
        entityId: seededBills[0]?.id,
        after: { status: 'paid' },
      },
      {
        tenantId: tenant.id,
        userId: accountantId,
        action: 'create',
        module: 'expense',
        entityType: 'expense',
        after: { status: 'reimbursed', count: expStatuses.filter((s) => s === 'reimbursed').length },
      },
      {
        tenantId: tenant.id,
        userId: accountantId,
        action: 'create',
        module: 'payment',
        entityType: 'payment',
        after: { direction: 'inbound' },
      },
      {
        tenantId: tenant.id,
        userId: approverId,
        action: 'approve',
        module: 'approval',
        entityType: 'bill',
        entityId: seededBills.find((b) => b.status === 'pending')?.id,
        after: { comment: 'Pending vendor bill review' },
      },
      {
        tenantId: tenant.id,
        userId: accountantId,
        action: 'import',
        module: 'banking',
        entityType: 'bank_transaction',
        after: { count: bankTxns.length, matched: bankTxns.filter((t) => t.status === 'matched').length },
      },
      {
        tenantId: tenant.id,
        userId: accountantId,
        action: 'create',
        module: 'reconciliation',
        entityType: 'reconciliation',
        after: { bankAccount: 'HDFC', status: 'in_progress' },
      },
      {
        tenantId: tenant.id,
        userId: ownerId,
        action: 'create',
        module: 'budget',
        entityType: 'budget',
        entityId: budget.id,
        after: { name: budget.name, status: 'active' },
      },
      {
        tenantId: tenant.id,
        userId: accountantId,
        action: 'create',
        module: 'journal',
        entityType: 'journal',
        entityId: draftJe.id,
        after: { status: 'draft', memo: 'Month-end rent accrual' },
      },
      {
        tenantId: tenant.id,
        userId: accountantId,
        action: 'submit',
        module: 'journal',
        entityType: 'journal',
        entityId: pendingJe.id,
        after: { status: 'pending' },
      },
      {
        tenantId: tenant.id,
        userId: adminId,
        action: 'create',
        module: 'customer',
        entityType: 'customer',
        entityId: customers[0]?.id,
        after: { name: customers[0]?.name },
      },
      {
        tenantId: tenant.id,
        userId: adminId,
        action: 'create',
        module: 'vendor',
        entityType: 'vendor',
        entityId: vendors[0]?.id,
        after: { name: vendors[0]?.name },
      },
      {
        tenantId: tenant.id,
        userId: ownerId,
        action: 'transfer',
        module: 'deposit',
        entityType: 'transfer',
        entityId: transfer.id,
        after: { amount: xferAmt, status: 'completed' },
      },
      {
        tenantId: tenant.id,
        userId: viewerId,
        action: 'view',
        module: 'report',
        entityType: 'report',
        after: { report: 'profit-and-loss', period: '2026-07' },
      },
      {
        tenantId: tenant.id,
        userId: accountantId,
        action: 'create',
        module: 'tax',
        entityType: 'tax_rate',
        after: { name: 'GST 18% (Output)' },
      },
      {
        tenantId: tenant.id,
        userId: approverId,
        action: 'approve',
        module: 'expense',
        entityType: 'expense',
        after: { status: 'approved' },
      },
    ],
  });

  // ── Document counters ─────────────────────────────────────────────────────
  await prisma.tenantSettings.update({
    where: { tenantId: tenant.id },
    data: {
      invoiceNextNumber: invSeq,
      billNextNumber: billSeq,
      paymentNextNumber: paySeq,
      journalNextNumber: jvSeq,
    },
  });

  console.log('✅  Seed complete — Valoris Fusion production demo');
  console.log('');
  console.log('    Tenant     Valoris Fusion (valoris-fusion)');
  console.log('    Password   Password123!');
  console.log('    Users');
  console.log('      owner@valorisfusion.com        Owner');
  console.log('      admin@valorisfusion.com        Administrator');
  console.log('      accountant@valorisfusion.com   Accountant');
  console.log('      approver@valorisfusion.com     Approver');
  console.log('      viewer@valorisfusion.com       Viewer');
  console.log('');
  console.log(`    Data       ${customers.length} customers · ${vendors.length} vendors (Indian + foreign)`);
  console.log(`               ${invStatuses.length} invoices · ${billStatuses.length} bills · ${expStatuses.length} expenses`);
  console.log(`               ${depositAccounts.length} deposit accounts · bank reconciliations · budgets`);
  console.log(`               ${bankTxns.length} bank transactions · draft/pending journals · documents`);
}

main()
  .catch((e) => {
    console.error('❌  Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
