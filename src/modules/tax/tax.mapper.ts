import type { TaxRate } from '@prisma/client';
import type { TaxGroupWithRates } from './tax.repository';

/** TaxRate entity -> API DTO. `rate` is a percent, e.g. "18.0000". */
export function toTaxRateApi(r: TaxRate) {
  return {
    id: r.id,
    name: r.name,
    rate: r.rate.toString(),
    kind: r.kind,
    region: r.region,
    isActive: r.isActive,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** TaxGroup (with its linked rates) -> API DTO. */
export function toTaxGroupApi(g: TaxGroupWithRates) {
  return {
    id: g.id,
    name: g.name,
    isActive: g.isActive,
    rates: g.rates.map((gr) => toTaxRateApi(gr.rate)),
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
  };
}
