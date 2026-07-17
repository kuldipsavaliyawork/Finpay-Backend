import type { ExpenseCategory } from '@prisma/client';
import type { ExpenseWithRelations } from './expenses.repository';

/** ExpenseCategory entity -> API DTO. */
export function toExpenseCategoryApi(c: ExpenseCategory) {
  return {
    id: c.id,
    name: c.name,
    accountId: c.accountId,
    isActive: c.isActive,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

/** Expense entity -> API DTO. All Decimal money fields serialized to strings. */
export function toExpenseApi(e: ExpenseWithRelations) {
  return {
    id: e.id,
    reference: e.reference,
    categoryId: e.categoryId,
    categoryName: e.category?.name ?? null,
    vendorId: e.vendorId,
    vendorName: e.vendor?.name ?? null,
    departmentId: e.departmentId,
    departmentName: e.department?.name ?? null,
    date: e.date.toISOString(),
    amount: e.amount.toString(),
    taxAmount: e.taxAmount.toString(),
    total: e.amount.plus(e.taxAmount).toString(),
    currency: e.currency,
    description: e.description,
    status: e.status,
    paymentMethod: e.paymentMethod,
    isReimbursable: e.isReimbursable,
    isRecurring: e.isRecurring,
    receiptUrl: e.receiptUrl,
    journalEntryId: e.journalEntryId,
    createdBy: e.createdBy,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

export type ExpenseApi = ReturnType<typeof toExpenseApi>;
export type ExpenseCategoryApi = ReturnType<typeof toExpenseCategoryApi>;
