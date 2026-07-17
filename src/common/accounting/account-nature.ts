/** Accounts whose natural balance is a debit (assets, expenses). */
export function isDebitNature(type: string): boolean {
  return type === 'asset' || type === 'expense';
}
