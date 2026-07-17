import type { Account } from '@prisma/client';

/** Account entity -> API DTO. Decimal fields serialized to strings. */
export function toAccountApi(a: Account) {
  return {
    id: a.id,
    code: a.code,
    name: a.name,
    type: a.type,
    subtype: a.subtype,
    parentId: a.parentId,
    isActive: a.isActive,
    isSystem: a.isSystem,
    openingBalance: a.openingBalance.toString(),
    currency: a.currency,
    description: a.description,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

export type AccountApi = ReturnType<typeof toAccountApi>;

export interface AccountTreeNode extends AccountApi {
  children: AccountTreeNode[];
}

/** Build a parent -> children tree from a flat, tenant-scoped account list. */
export function buildAccountTree(accounts: Account[]): AccountTreeNode[] {
  const nodes = new Map<string, AccountTreeNode>();
  for (const a of accounts) {
    nodes.set(a.id, { ...toAccountApi(a), children: [] });
  }

  const roots: AccountTreeNode[] = [];
  for (const a of accounts) {
    const node = nodes.get(a.id)!;
    const parent = a.parentId ? nodes.get(a.parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}
